"""
build_players.py — Pull NFL season stats from nflverse and bundle into players.json.

Data source: nflverse-data "stats_player" release, files `stats_player_reg_{year}.csv`
(regular-season totals, one row per player-season), 1999-present.
    https://github.com/nflverse/nflverse-data/releases/tag/stats_player

No third-party dependencies — uses only the Python standard library.

Inclusivity model (EBK):
    Include EVERY skill-position player-season (QB/RB/FB/WR/TE), starters and
    backups, good or bad. A player-season qualifies for a stat category only when
    that stat actually *applied* to them that year (they threw / ran / were
    targeted / played) — no quality threshold. This keeps pools deep and full of
    role players and "bums" without surfacing irrelevant zeros (e.g. a QB with no
    targets never lands in the receptions pool).

Usage:
    python build_players.py                # default season range
    python build_players.py 2015 2025      # custom start/end (inclusive)
"""

import csv
import io
import json
import os
import re
import sys
import unicodedata
import urllib.request
from datetime import date

# --- config ------------------------------------------------------------------

FIRST_SEASON = 1999
LAST_SEASON = 2025

BASE_URL = (
    "https://github.com/nflverse/nflverse-data/releases/download/"
    "stats_player/stats_player_reg_{year}.csv"
)
# Per-game file: one row per player per week, with that week's team. The
# season-aggregate file above collapses a whole season into a single row per
# player keyed on "recent_team" (their LAST team that year) — a player traded
# mid-season loses the earlier team entirely if we only read that file. We use
# this per-week file just to recover the full set of teams played for each
# season; the aggregate file remains the source of stat totals.
WEEK_URL = (
    "https://github.com/nflverse/nflverse-data/releases/download/"
    "stats_player/stats_player_week_{year}.csv"
)
PLAYERS_URL = (
    "https://github.com/nflverse/nflverse-data/releases/download/players/players.csv"
)

HERE = os.path.dirname(os.path.abspath(__file__))
RAW_DIR = os.path.join(HERE, "raw")
OUT_PATH = os.path.normpath(os.path.join(HERE, "..", "public", "data", "players.json"))
COLLEGES_OUT = os.path.normpath(os.path.join(HERE, "..", "public", "data", "colleges.json"))
CFB_URL = ("https://site.api.espn.com/apis/site/v2/sports/football/"
           "college-football/teams?limit=1000")
# college-name aliases (our name -> ESPN's normalized name)
COLLEGE_ALIASES = {
    "mississippi": "ole miss", "southern mississippi": "southern miss",
    "connecticut": "uconn", "louisiana lafayette": "louisiana",
    "louisiana monroe": "ul monroe", "texas el paso": "utep",
    "texas san antonio": "utsa", "tennessee chattanooga": "chattanooga",
    "massachusetts": "umass", "umass amherst": "umass",
}

# Position groups we keep: offensive skill + defense (no OL / special teams).
OFF_GROUPS = {"QB", "RB", "WR", "TE"}
DEF_GROUPS = {"DL", "LB", "DB"}
INCLUDE_GROUPS = OFF_GROUPS | DEF_GROUPS


def group_of(row):
    """Position group (QB/RB/WR/TE/DL/LB/DB) or '' if not a kept group."""
    g = (row.get("position_group") or "").upper()
    if g in INCLUDE_GROUPS:
        return g
    p = (row.get("position") or "").upper()
    if p == "QB": return "QB"
    if p in {"RB", "FB", "HB"}: return "RB"
    if p == "WR": return "WR"
    if p == "TE": return "TE"
    if p in {"DE", "DT", "NT", "DL", "EDGE"}: return "DL"
    if p in {"LB", "OLB", "ILB", "MLB"}: return "LB"
    if p in {"CB", "S", "FS", "SS", "DB"}: return "DB"
    return ""


# A player-season qualifies for a stat category only if it was active in that
# stat AREA. Activity = ANY column in the area is non-zero. This is robust to
# early seasons where a single "opportunity" column is unreliable (e.g. 2003
# has targets=0 for players who clearly caught passes). "tackles" is synthesized
# (solo + assists) before processing.
AREA_COLS = {
    "pass": ["attempts", "passing_yards", "passing_tds"],
    "rush": ["carries", "rushing_yards", "rushing_tds"],
    "recv": ["targets", "receptions", "receiving_yards", "receiving_tds"],
    "def":  ["def_sacks", "tackles", "def_interceptions", "def_pass_defended",
             "def_fumbles_forced", "def_tackles_for_loss", "def_qb_hits", "def_tds"],
}

# Stat categories. Each: (csv_column, label, decimals, icon, area, groups)
#   area:   "pass"/"rush"/"recv"/"def" activity that gates inclusion;
#           "off" => any offensive area active (used by fantasy).
#   groups: restrict the category to these position groups (None => any).
CATEGORIES = [
    ("passing_yards",       "Passing Yards",        0, "\U0001F3AF", "pass", {"QB"}),
    ("passing_tds",         "Passing TDs",          0, "\U0001F680", "pass", {"QB"}),
    ("rushing_yards",       "Rushing Yards",        0, "\U0001F3C3", "rush", OFF_GROUPS),
    ("rushing_tds",         "Rushing TDs",          0, "\U0001F4A8", "rush", OFF_GROUPS),
    ("receiving_yards",     "Receiving Yards",      0, "\U0001F64C", "recv", OFF_GROUPS),
    ("receptions",          "Receptions",           0, "\U0001F9E4", "recv", OFF_GROUPS),
    ("receiving_tds",       "Receiving TDs",        0, "\U0001F525", "recv", OFF_GROUPS),
    ("fantasy_points",      "Fantasy Points (Std)", 1, "\U0001F3C8", "off",  OFF_GROUPS),
    ("fantasy_points_ppr",  "Fantasy Points (PPR)", 1, "⭐",     "off",  OFF_GROUPS),
    ("def_sacks",           "Sacks",                1, "\U0001F4A5", "def",  DEF_GROUPS),
    ("tackles",             "Tackles",              0, "\U0001F6D1", "def",  DEF_GROUPS),
    ("def_interceptions",   "Interceptions",        0, "✋",     "def",  DEF_GROUPS),
    ("def_pass_defended",   "Passes Defended",      0, "\U0001F6E1️", "def", DEF_GROUPS),
    ("def_fumbles_forced",  "Forced Fumbles",       0, "\U0001F4A2", "def",  DEF_GROUPS),
]
# Note: def_tackles_for_loss is dropped — nflverse has it missing (all 0) for
# 2003-2011, so it would compare bogus zeros across eras.

# -----------------------------------------------------------------------------


def fetch_season_csv(year):
    """Return the CSV text for a season, caching the raw download under raw/."""
    os.makedirs(RAW_DIR, exist_ok=True)
    cache = os.path.join(RAW_DIR, f"stats_player_reg_{year}.csv")
    if os.path.exists(cache) and os.path.getsize(cache) > 0:
        with open(cache, "r", encoding="utf-8") as f:
            return f.read()

    url = BASE_URL.format(year=year)
    req = urllib.request.Request(url, headers={"User-Agent": "ebk/1.0"})
    with urllib.request.urlopen(req, timeout=60) as resp:
        text = resp.read().decode("utf-8")
    with open(cache, "w", encoding="utf-8") as f:
        f.write(text)
    return text


def fetch_week_csv(year):
    """Return the per-week CSV text for a season, caching under raw/."""
    os.makedirs(RAW_DIR, exist_ok=True)
    cache = os.path.join(RAW_DIR, f"stats_player_week_{year}.csv")
    if os.path.exists(cache) and os.path.getsize(cache) > 0:
        with open(cache, "r", encoding="utf-8") as f:
            return f.read()

    url = WEEK_URL.format(year=year)
    req = urllib.request.Request(url, headers={"User-Agent": "ebk/1.0"})
    with urllib.request.urlopen(req, timeout=60) as resp:
        text = resp.read().decode("utf-8")
    with open(cache, "w", encoding="utf-8") as f:
        f.write(text)
    return text


# nflverse's 2001 and 2002 stats_player_week files have a confirmed team/
# opponent mixup for at least the JAX/JAC franchise: e.g. Mark Brunell (JAC's
# full-season starting QB both years, never traded) comes out with 8-9
# "teams" that season, and Fred Taylor (JAX's starting RB both years) shows
# up on TEN/PIT. Until that's root-caused upstream, don't trust per-week team
# data for these two seasons at all — fall back to the season-aggregate
# file's single recent_team, same as every year before this feature existed.
BROKEN_WEEK_YEARS = {2001, 2002}
# Defense in depth for years we haven't individually audited: across the
# other 25 seasons (1999-2025 minus the two above), the real single-season
# max is 3 different teams (e.g. Randy Moss's NE->MIN->TEN 2010). Anything
# longer is certainly the same kind of data corruption, not a real player.
MAX_PLAUSIBLE_TEAMS = 3


def build_season_teams(year):
    """(player_id, season) -> ordered list of distinct teams played for that
    season (regular season only), read from the per-week file. Captures every
    team a player suited up for, independent of whether they recorded any
    stat that week — the thing the season-aggregate file cannot do."""
    if year in BROKEN_WEEK_YEARS:
        return {}
    try:
        text = fetch_week_csv(year)
    except Exception as exc:  # noqa: BLE001
        print(f"  ! {year}: week file download failed ({exc}) — team history for "
              f"mid-season trades will be incomplete this season")
        return {}
    out = {}
    reader = csv.DictReader(io.StringIO(text))
    for row in reader:
        if (row.get("season_type") or "") != "REG":
            continue
        team = (row.get("team") or "").strip()
        if not team:
            continue
        key = (row.get("player_id"), row.get("season"))
        teams = out.setdefault(key, [])
        if team not in teams:
            teams.append(team)
    return {k: v for k, v in out.items() if len(v) <= MAX_PLAUSIBLE_TEAMS}


def fetch_players_csv():
    """Return the players.csv text (player bios: college, draft, etc.), cached."""
    os.makedirs(RAW_DIR, exist_ok=True)
    cache = os.path.join(RAW_DIR, "players.csv")
    if os.path.exists(cache) and os.path.getsize(cache) > 0:
        with open(cache, "r", encoding="utf-8") as f:
            return f.read()
    req = urllib.request.Request(PLAYERS_URL, headers={"User-Agent": "ebk/1.0"})
    with urllib.request.urlopen(req, timeout=60) as resp:
        text = resp.read().decode("utf-8")
    with open(cache, "w", encoding="utf-8") as f:
        f.write(text)
    return text


def to_int(raw):
    n = to_num(raw)
    return int(n) if n is not None else None


def build_people(used_ids):
    """Map player_id -> bio dict (college + draft) for the ids we actually use."""
    try:
        text = fetch_players_csv()
    except Exception as exc:  # noqa: BLE001
        print(f"  ! players.csv download failed ({exc}) — people map will be empty")
        return {}
    people = {}
    reader = csv.DictReader(io.StringIO(text))
    for row in reader:
        pid = row.get("gsis_id")
        if pid not in used_ids:
            continue
        college = (row.get("college_name") or "").strip()
        people[pid] = {
            "college": college,
            "draftYear": to_int(row.get("draft_year")),
            "draftRound": to_int(row.get("draft_round")),
            "draftPick": to_int(row.get("draft_pick")),
            "draftTeam": (row.get("draft_team") or "").strip(),
        }
    return people


def cnorm(s):
    """Normalize a college name for fuzzy matching (accents, suffixes, state)."""
    s = s.split(";")[0].strip()
    s = "".join(c for c in unicodedata.normalize("NFKD", s) if not unicodedata.combining(c))
    s = s.lower().replace("&", "and").replace(".", "").replace("-", " ").replace("'", "")
    s = re.sub(r"\([^)]*\)", "", s)
    s = re.sub(r"\buniversity of\b", "", s)
    s = re.sub(r"\b(university|college|the)\b", "", s)
    s = re.sub(r"^\s*of\b", "", s)
    s = re.sub(r"\bstate\b", "st", s)
    return re.sub(r"\s+", " ", s).strip()


def fetch_cfb():
    """ESPN college-football teams (public, no key); cached under raw/."""
    cache = os.path.join(RAW_DIR, "cfb_teams.json")
    if os.path.exists(cache) and os.path.getsize(cache) > 0:
        with open(cache, encoding="utf-8") as f:
            return json.load(f)
    os.makedirs(RAW_DIR, exist_ok=True)
    req = urllib.request.Request(CFB_URL, headers={"User-Agent": "ebk/1.0"})
    with urllib.request.urlopen(req, timeout=60) as resp:
        data = json.loads(resp.read().decode("utf-8"))
    with open(cache, "w", encoding="utf-8") as f:
        json.dump(data, f)
    return data


def build_colleges(people):
    """Map exact college name -> logo URL for the colleges we use."""
    try:
        teams = fetch_cfb()["sports"][0]["leagues"][0]["teams"]
    except Exception as exc:  # noqa: BLE001
        print(f"  ! college logos skipped ({exc})")
        return {}
    espn = {}
    for t in teams:
        tt = t.get("team", {})
        href = (tt.get("logos") or [{}])[0].get("href")
        if not href:
            continue
        for key in (tt.get("location"), tt.get("shortDisplayName"),
                    tt.get("displayName"), tt.get("name"), tt.get("abbreviation")):
            if key:
                espn.setdefault(cnorm(key), href)
    out, distinct = {}, set()
    for b in people.values():
        c = (b.get("college") or "").strip()
        if not c:
            continue
        distinct.add(c)
        if c in out:
            continue
        n = cnorm(c)
        href = espn.get(COLLEGE_ALIASES.get(n, n)) or espn.get(n)
        if href:
            out[c] = href
    print(f"  college logos matched: {len(out):,}/{len(distinct):,}")
    return out


def to_num(raw):
    """Parse a CSV cell into a float, or None if blank/non-numeric."""
    if raw is None:
        return None
    if isinstance(raw, (int, float)):
        return float(raw)
    raw = raw.strip()
    if raw == "" or raw.upper() == "NA":
        return None
    try:
        return float(raw)
    except ValueError:
        return None


def round_stat(value, decimals):
    """Store whole numbers as int, otherwise round to the category's precision."""
    if decimals == 0:
        return int(round(value))
    rounded = round(value, decimals)
    return int(rounded) if rounded.is_integer() else rounded


def build():
    start = FIRST_SEASON
    end = LAST_SEASON
    if len(sys.argv) == 3:
        start, end = int(sys.argv[1]), int(sys.argv[2])

    players = []
    seen = set()                 # (player_id, season) guard against dupes
    cat_counts = {key: 0 for key, *_ in CATEGORIES}

    for year in range(start, end + 1):
        try:
            text = fetch_season_csv(year)
        except Exception as exc:  # noqa: BLE001 — surface and continue
            print(f"  ! {year}: download failed ({exc}) — skipping")
            continue

        season_teams = build_season_teams(year)
        reader = csv.DictReader(io.StringIO(text))
        kept = 0
        for row in reader:
            grp = group_of(row)
            if grp not in INCLUDE_GROUPS:
                continue
            pos = (row.get("position") or grp).upper()

            key = (row.get("player_id"), row.get("season"))
            if key in seen:
                continue

            games = to_num(row.get("games")) or 0
            # synthesize total tackles (solo + assists)
            row["tackles"] = (to_num(row.get("def_tackles_solo")) or 0) + \
                             (to_num(row.get("def_tackle_assists")) or 0)

            # which stat areas was this player-season active in?
            active = {
                area: any((to_num(row.get(c)) or 0) != 0 for c in cols)
                for area, cols in AREA_COLS.items()
            }
            active["off"] = active["pass"] or active["rush"] or active["recv"]

            stats = {}
            for col, _label, decimals, _icon, area, groups in CATEGORIES:
                if groups and grp not in groups:
                    continue
                if not active.get(area, False):
                    continue
                value = to_num(row.get(col))
                if value is None:         # blank in-area stat -> treat as 0
                    value = 0.0
                stats[col] = round_stat(value, decimals)
                cat_counts[col] += 1

            recent_team = row.get("recent_team") or ""
            teams = season_teams.get(key) or ([recent_team] if recent_team else [])
            if not teams:
                # No week-level appearance and no recent_team — nothing to
                # place this player-season on a roster with, skip it.
                continue

            # Keep every player-season that made a roster, even with no
            # qualifying stat (e.g. a backup traded mid-year with zero
            # touches on either team) — the EBK grid needs every team a
            # player suited up for, not just the seasons they racked up
            # stats. Only the stat pools stay gated by `active`.

            seen.add(key)
            record = {
                "id": row.get("player_id") or "",
                "name": row.get("player_display_name") or row.get("player_name"),
                "pos": pos,
                "grp": grp,
                "season": int(row["season"]),
                "team": recent_team or teams[-1],
                "games": int(games),
                "stats": stats,
            }
            if len(teams) > 1:
                record["teams"] = teams
            headshot = (row.get("headshot_url") or "").strip()
            if headshot:
                record["headshot"] = headshot
            players.append(record)
            kept += 1

        print(f"  {year}: kept {kept} player-seasons")

    players.sort(key=lambda r: (r["season"], r["name"]))

    used_ids = {r["id"] for r in players if r["id"]}
    people = build_people(used_ids)
    print(f"  people (bio: college/draft) matched: {len(people):,}/{len(used_ids):,}")

    colleges = build_colleges(people)
    with open(COLLEGES_OUT, "w", encoding="utf-8") as f:
        json.dump(colleges, f, ensure_ascii=False, separators=(",", ":"))

    out = {
        "generated": date.today().isoformat(),
        "source": "nflverse-data / stats_player_reg + players",
        "seasons": [start, end],
        "categories": [
            {"key": k, "label": lbl, "decimals": dec, "icon": icon}
            for k, lbl, dec, icon, _opp, _pos in CATEGORIES
        ],
        "players": players,
        "people": people,
    }

    os.makedirs(os.path.dirname(OUT_PATH), exist_ok=True)
    with open(OUT_PATH, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))

    size_mb = os.path.getsize(OUT_PATH) / 1e6
    print()
    print(f"Wrote {len(players):,} player-seasons -> {OUT_PATH} ({size_mb:.1f} MB)")
    print("Pool size per category:")
    for key, label, *_ in CATEGORIES:
        print(f"  {label:<24} {cat_counts[key]:>7,}")


if __name__ == "__main__":
    build()
