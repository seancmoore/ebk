"""
build_nba.py — NBA player-season dataset for EBK.

Source: sportsdataverse ESPN NBA player box scores (parquet, one file per
season, 2002-present). Aggregated to player-season totals + per-game rates.
Requires pandas + pyarrow (local build tool only; the shipped site stays static).

Usage:  python build_nba.py            # full range
        python build_nba.py 2020 2026  # custom
"""
import os, sys, json, urllib.request
from datetime import date
import pandas as pd


FIRST, LAST = 2002, 2026
HERE = os.path.dirname(os.path.abspath(__file__))
RAW = os.path.join(HERE, "raw", "nba")
OUT = os.path.normpath(os.path.join(HERE, "..", "public", "data", "nba", "players.json"))
# hoopR-data/raw/main stopped at 2023; the same files now publish as releases.
URL = ("https://github.com/sportsdataverse/sportsdataverse-data/releases/download/"
       "espn_nba_player_boxscores/player_box_{y}.parquet")

CATEGORIES = [
    ("pts", "Points",            0, "\U0001F3C0"),
    ("ppg", "Points / Game",     1, "\U0001F4C8"),
    ("reb", "Rebounds",          0, "\U0001F501"),
    ("rpg", "Rebounds / Game",   1, "\U0001F4C8"),
    ("ast", "Assists",           0, "\U0001F91D"),
    ("apg", "Assists / Game",    1, "\U0001F4C8"),
    ("stl", "Steals",            0, "✋"),
    ("blk", "Blocks",            0, "\U0001F6AB"),
    ("tpm", "3-Pointers Made",   0, "\U0001F3AF"),
]


# Every real franchise code seen in this window, incl. relocated/renamed
# historical ones (SEA->OKC, NJ->BKN, NOH/NOK->NO's hurricane-relocation
# seasons) — mirrors public/js/nba-teams.js's alias lists. Anything outside
# this set is an exhibition-game artifact (All-Star, Rising Stars), not a
# real team a player was traded to.
VALID_TEAMS = {
    "ATL", "BOS", "BKN", "NJ", "CHA", "CHI", "CLE", "DAL", "DEN", "DET",
    "GS", "HOU", "IND", "LAC", "LAL", "MEM", "MIA", "MIL", "MIN",
    "NO", "NOH", "NOK", "NY", "OKC", "SEA", "ORL", "PHI", "PHX", "POR",
    "SA", "SAC", "TOR", "UTAH", "WSH",
}


def grp_of(pos):
    p = (pos or "").upper()
    if p in ("PG", "SG", "G"): return "G"
    if p in ("SF", "PF", "F"): return "F"
    if p == "C": return "C"
    if p.startswith("G"): return "G"
    if p.startswith("F"): return "F"
    if p.startswith("C"): return "C"
    return "G"


def drop_cup_final(df):
    """The NBA Cup final (since 2023-24) is typed as a regular-season game but
    doesn't count in the standings or player stats. It is the only game that
    gives two teams an 83rd game, and nothing else is played that day."""
    per_team = df.groupby("team_abbreviation")["game_id"].nunique()
    over = frozenset(per_team[per_team > 82].index)
    if not over:
        return df
    games = df.groupby("game_id").agg(
        teams=("team_abbreviation", frozenset), day=("game_date", "first"))
    solo_days = games["day"].value_counts()
    solo_days = set(solo_days[solo_days == 1].index)
    final = games[(games["teams"] == over) & games["day"].isin(solo_days)].index
    return df[~df["game_id"].isin(final)]


def fetch(y):
    os.makedirs(RAW, exist_ok=True)
    cache = os.path.join(RAW, f"player_box_{y}.parquet")
    if not (os.path.exists(cache) and os.path.getsize(cache) > 0):
        req = urllib.request.Request(URL.format(y=y), headers={"User-Agent": "ebk/1.0"})
        with urllib.request.urlopen(req, timeout=120) as r, open(cache, "wb") as f:
            f.write(r.read())
    return pd.read_parquet(cache)


def build():
    start, end = FIRST, LAST
    if len(sys.argv) == 3:
        start, end = int(sys.argv[1]), int(sys.argv[2])

    frames = []
    for y in range(start, end + 1):
        try:
            df = fetch(y)
        except Exception as exc:  # noqa: BLE001
            print(f"  ! {y} failed: {exc}")
            continue
        df = df[df["season_type"] == 2]                      # regular season
        df = df[df["did_not_play"] != True]                  # noqa: E712 — actually played
        # 2002-2012 files also list inactive/injured players as rows with no
        # minutes and no points (did_not_play is False). Those aren't games
        # played: they inflated G and deflated PPG (McGrady 2009: 82 G, ESPN 35).
        df = df[df["minutes"].notna() | df["points"].notna()]
        # season_type == 2 still includes All-Star/Rising Stars exhibition
        # games, logged under fictional "teams" (draft captains, conferences)
        # rather than real franchises — e.g. Joel Embiid's 2018 box scores
        # include a "STE"/"WORLD" Rising Stars game alongside PHI. These
        # would otherwise fabricate extra "teams played for" for every
        # All-Star. Filter by real franchise code instead of a name guess.
        df = df[df["team_abbreviation"].isin(VALID_TEAMS)]
        df = drop_cup_final(df)
        frames.append(df)
        print(f"  {y}: {len(df):,} player-games")
    allg = pd.concat(frames, ignore_index=True)
    # ESPN occasionally logs one player's game under two athlete ids (Corey
    # Brewer 2019, Isaiah Canaan 2019, Daryl Macon 2020). Keep the row of the
    # id with more games that season, so the phantom id doesn't double-count.
    n_games = allg.groupby(["season", "athlete_id"])["game_id"].transform("size")
    allg = (allg.assign(_n=n_games)
                .sort_values("_n", ascending=False, kind="stable")
                .drop_duplicates(["game_id", "team_abbreviation", "athlete_display_name"])
                .sort_index()
                .drop(columns="_n"))

    num = ["points", "rebounds", "assists", "steals", "blocks",
           "three_point_field_goals_made"]
    for c in num:
        allg[c] = pd.to_numeric(allg[c], errors="coerce").fillna(0)

    players = []
    grouped = allg.groupby(["athlete_id", "season"], sort=False)
    for (aid, season), g in grouped:
        games = len(g)
        if games == 0:
            continue
        pts = float(g["points"].sum()); reb = float(g["rebounds"].sum())
        ast = float(g["assists"].sum()); stl = float(g["steals"].sum())
        blk = float(g["blocks"].sum()); tpm = float(g["three_point_field_goals_made"].sum())
        # Every team a player suited up for that season, in the order they
        # first appeared for it — not just the most-common one, so a
        # mid-season trade still registers on both teams' grids. The box files
        # are newest-first, so sort by date to make this order chronological.
        teams = list(dict.fromkeys(g.sort_values("game_date", kind="stable")["team_abbreviation"]))
        team = g["team_abbreviation"].mode()
        team = team.iloc[0] if len(team) else (g["team_abbreviation"].iloc[-1] or "")
        pos = g["athlete_position_abbreviation"].mode()
        pos = pos.iloc[0] if len(pos) else "G"
        # Capture ALL unique positions played, not just the mode, so mid-season
        # position changes (e.g., DJJ as G and F) are both available for grid criteria
        all_pos = list(dict.fromkeys(g["athlete_position_abbreviation"].dropna().unique()))
        all_grps = sorted(set(grp_of(p) for p in all_pos)) if all_pos else [grp_of(pos)]
        head = g["athlete_headshot_href"].dropna()
        rec = {
            "id": str(aid),
            "name": g["athlete_display_name"].iloc[-1],
            "pos": pos,
            "grp": grp_of(pos),
            "season": int(season),
            "seasonLabel": f"{int(season)-1}-{str(int(season))[2:]}",
            "team": team,
            "games": int(games),
            "stats": {
                "pts": int(round(pts)), "reb": int(round(reb)), "ast": int(round(ast)),
                "stl": int(round(stl)), "blk": int(round(blk)), "tpm": int(round(tpm)),
                "ppg": round(pts / games, 1), "rpg": round(reb / games, 1), "apg": round(ast / games, 1),
            },
        }
        if len(head):
            rec["headshot"] = head.iloc[-1]
        if len(teams) > 1:
            rec["teams"] = teams
        if len(all_grps) > 1:
            rec["grps"] = all_grps
        players.append(rec)

    # Load and append manually-added entries for data gaps
    MANUAL_FILE = os.path.join(HERE, "nba_manual_entries.json")
    if os.path.exists(MANUAL_FILE):
        try:
            with open(MANUAL_FILE, "r", encoding="utf-8") as f:
                manual_data = json.load(f)
                if "entries" in manual_data and isinstance(manual_data["entries"], list):
                    players.extend(manual_data["entries"])
                    print(f"  + Added {len(manual_data['entries'])} manual entries for data gaps")
        except Exception as e:
            print(f"  ! Failed to load manual entries: {e}")

    players.sort(key=lambda r: (r["season"], r["name"]))
    out = {
        "generated": date.today().isoformat(),
        "source": "sportsdataverse ESPN NBA player box scores",
        "sport": "nba",
        "seasons": [start, end],
        "categories": [{"key": k, "label": l, "decimals": d, "icon": i} for k, l, d, i in CATEGORIES],
        "players": players,
        "people": {},
    }
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
    mb = os.path.getsize(OUT) / 1e6
    print(f"\nWrote {len(players):,} player-seasons -> {OUT} ({mb:.1f} MB)")


if __name__ == "__main__":
    build()
