"""
build_nfl_career.py - pre-1999 NFL seasons for players already in public/data/players.json.

Output: data/raw/career/nfl.json = {"sport":"nfl","through":1998,"players":[records]}
Record shape = players.json rows (id, name, pos, grp, season, team, [teams], games, stats{}),
without fantasy points, tackles or headshots.

Sources (all cached locally, stdlib only, this script makes no network calls):
  data/raw/espn_def/{gsis}.json          ESPN defensive table (tools/espn_def_fetch.cjs), incl. pre-1999 rows
  data/raw/espn_off_career/{gsis}.json   pre-1999 ESPN rows for offense players and for defenders
                                         that had no espn_def file (tools/espn_off_career_fetch.cjs)
  data/raw/espn_off/{gsis}.json          offense games-by-year cache; used only to decide who to fetch

Rules:
  * only ids present in players.json, only seasons < 1999.
  * pos/grp = the player's earliest row in players.json (ESPN only knows the current position).
  * "<year> Totals" row is used for stats and games when a season has several clubs; per-club rows
    (listed in date order) give `teams`; `team` is the LAST club, like players.json (recent_team).
  * a stat area (pass/rush/recv/def) is written only when ANY column of that area is non-zero for the
    season (same "activity" rule as build_players.py AREA_COLS). pass only for QB; rush/recv for
    QB/RB/WR/TE; def for DL/LB/DB. Targets are not tracked pre-1999, so they are not part of the test.
  * def: sacks + interceptions exist from 1985 in ESPN; forced fumbles + passes defended only from
    1993 (earlier ESPN values are blanket zeros, so those keys are omitted before 1993 rather than
    emitted as fake zeros). Tackles are never written (no official tackles pre-1999).
"""
import glob
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
PLAYERS = os.path.normpath(os.path.join(HERE, "..", "public", "data", "players.json"))
DEF_DIR = os.path.join(HERE, "raw", "espn_def")
CAR_DIR = os.path.join(HERE, "raw", "espn_off_career")
OFF_DIR = os.path.join(HERE, "raw", "espn_off")
CSV_PLAYERS = os.path.join(HERE, "raw", "players.csv")
OUT = os.path.join(HERE, "raw", "career", "nfl.json")
THROUGH = 1998
FF_PD_FROM = 1993          # ESPN forced fumbles / passes defended are real only from here
SACK_FROM = 1982           # first official sack season

# ESPN teamSlug -> club code. Codes follow players.json: 1999-2002 rows use OAK/STL/SD, 2003+ use
# LV/LA/LAC; all fold to the same franchise in public/js/teams.js keyOf. Houston Oilers are the
# Titans franchise (TEN); "HOU" would map to the Texans, so it is never emitted.
SLUG = {
    "arizona-cardinals": "ARI", "phoenix-cardinals": "ARI",
    "atlanta-falcons": "ATL",
    "baltimore-ravens": "BAL",
    "buffalo-bills": "BUF",
    "carolina-panthers": "CAR",
    "chicago-bears": "CHI",
    "cincinnati-bengals": "CIN",
    "cleveland-browns": "CLE",           # original Browns, through 1995 (Ravens franchise = BAL from 1996)
    "dallas-cowboys": "DAL",
    "denver-broncos": "DEN",
    "detroit-lions": "DET",
    "green-bay-packers": "GB",
    "houston-oilers": "TEN", "tennessee-oilers": "TEN",
    "indianapolis-colts": "IND", "baltimore-colts": "IND",
    "jacksonville-jaguars": "JAX",
    "kansas-city-chiefs": "KC",
    "los-angeles-raiders": "OAK", "oakland-raiders": "OAK",   # keyOf: OAK -> LV franchise
    "los-angeles-rams": "LA", "st-louis-rams": "STL",         # keyOf: LA/STL -> LAR
    "san-diego-chargers": "SD",                               # keyOf: SD -> LAC
    "miami-dolphins": "MIA",
    "minnesota-vikings": "MIN",
    "new-england-patriots": "NE",
    "new-orleans-saints": "NO",
    "new-york-giants": "NYG",
    "new-york-jets": "NYJ",
    "philadelphia-eagles": "PHI",
    "pittsburgh-steelers": "PIT",
    "san-francisco-49ers": "SF",
    "seattle-seahawks": "SEA",
    "tampa-bay-buccaneers": "TB",
    "washington-redskins": "WAS",
}
# franchise keys that exist in public/js/teams.js (checked: every emitted code must fold into one)
FRANCHISE_KEYS = {"ARI", "ATL", "BAL", "BUF", "CAR", "CHI", "CIN", "CLE", "DAL", "DEN", "DET", "GB", "HOU",
                  "IND", "JAX", "KC", "LV", "LAC", "LAR", "MIA", "MIN", "NE", "NO", "NYG", "NYJ", "PHI",
                  "PIT", "SF", "SEA", "TB", "TEN", "WAS"}
KEYOF = {"OAK": "LV", "SD": "LAC", "STL": "LAR", "LA": "LAR", "JAC": "JAX", "WSH": "WAS"}
# (slug, first year, last year) the slug may legitimately appear; anything outside is reported
SLUG_YEARS = {"cleveland-browns": (1900, 1995), "baltimore-ravens": (1996, 1998),
              "houston-oilers": (1900, 1996), "tennessee-oilers": (1997, 1998),
              "los-angeles-raiders": (1982, 1994), "oakland-raiders": (1900, 1981 + 14 + 100),
              "los-angeles-rams": (1946, 1994), "st-louis-rams": (1995, 1998),
              "phoenix-cardinals": (1988, 1993 + 100), "jacksonville-jaguars": (1995, 1998),
              "carolina-panthers": (1995, 1998)}

OFF_GRP = {"QB", "RB", "WR", "TE"}
AREAS = {
    "pass": (["passingAttempts", "passingYards", "passingTouchdowns"], "passing",
             {"passingYards": "passing_yards", "passingTouchdowns": "passing_tds"}),
    "rush": (["rushingAttempts", "rushingYards", "rushingTouchdowns"], "rushing",
             {"rushingYards": "rushing_yards", "rushingTouchdowns": "rushing_tds"}),
    "recv": (["receptions", "receivingYards", "receivingTouchdowns"], "receiving",
             {"receivingYards": "receiving_yards", "receptions": "receptions",
              "receivingTouchdowns": "receiving_tds"}),
}


def num(x):
    try:
        return float(str(x).replace(",", ""))
    except ValueError:
        return 0.0


def tidy(v):
    return int(v) if float(v).is_integer() else round(v, 1)


def load_cats(gsis, family):
    """{category: (names, [row{y,t,s}])} of pre-1999 rows, or None when no cache exists."""
    if family == "D":
        f = os.path.join(DEF_DIR, gsis + ".json")
        if os.path.exists(f):
            j = json.load(open(f, encoding="utf8"))
            if j.get("none"):
                return "none"
            if not j.get("names"):
                return {}
            return {"defensive": (j["names"], [r for r in j["rows"] if r["y"] <= THROUGH])}
    f = os.path.join(CAR_DIR, gsis + ".json")
    if not os.path.exists(f):
        return None
    j = json.load(open(f, encoding="utf8"))
    if j.get("none"):
        return "none"
    return {c: (v["names"], v["rows"]) for c, v in j["cats"].items()}


def year_table(names, rows):
    """year -> (club slugs in order, {stat: value}) preferring the Totals row."""
    by = {}
    for r in rows:
        e = by.setdefault(r["y"], {"clubs": [], "tot": None, "sum": {}, "cg": {}})
        vals = {n: num(v) for n, v in zip(names, r["s"])}
        if "Totals" in (r["t"] or ""):
            e["tot"] = vals
        else:
            e["clubs"].append(r["t"])
            e["cg"][r["t"]] = e["cg"].get(r["t"], 0.0) + vals.get("gamesPlayed", 0.0)
            for k, v in vals.items():
                e["sum"][k] = e["sum"].get(k, 0.0) + v
    return {y: (e["clubs"], e["tot"] if e["tot"] is not None else e["sum"], e["cg"]) for y, e in by.items()}


def merge_clubs(lists):
    """Union of per-category club lists (each in date order), longest list first."""
    out = []
    for lst in sorted(lists, key=len, reverse=True):
        prev = None
        for c in lst:
            if c not in out:
                out.insert(out.index(prev) + 1 if prev in out else len(out), c)
            prev = c
    return out


def main():
    d = json.load(open(PLAYERS, encoding="utf8"))["players"]
    first = {}
    for r in d:
        f = first.get(r["id"])
        if f is None or r["season"] < f["season"]:
            first[r["id"]] = r
    espn = {}
    import csv
    for row in csv.DictReader(open(CSV_PLAYERS, encoding="utf8")):
        if row["gsis_id"] and row["espn_id"]:
            espn[row["gsis_id"]] = row["espn_id"]

    records, issues = [], {"unknown_slug": {}, "slug_year": 0, "no_espn_id": 0, "espn_404": 0,
                           "not_fetched": [], "with_pre1999": 0, "bad_code": set()}
    slug_year_ex = []
    for gsis, f in sorted(first.items()):
        family = "O" if f["grp"] in OFF_GRP else "D"
        if gsis not in espn:
            issues["no_espn_id"] += 1
            continue
        cats = load_cats(gsis, family)
        if cats == "none":
            issues["espn_404"] += 1
            continue
        if cats is None:
            # offense players skipped by the fetcher had no pre-1999 season in the games cache
            oc = os.path.join(OFF_DIR, gsis + ".json")
            if family == "O" and os.path.exists(oc):
                continue
            issues["not_fetched"].append(gsis)
            continue
        want = ["defensive"] if family == "D" else list(cats)   # games/teams come from every category
        tables = {c: year_table(*cats[c]) for c in want if c in cats}
        years = sorted({y for t in tables.values() for y in t if y <= THROUGH})
        if not years:
            continue
        issues["with_pre1999"] += 1
        for y in years:
            # games: ESPN's "<year> Totals" gamesPlayed is NOT the sum of the club rows (it equals the
            # largest club row in half the traded seasons), so use max-over-tables per club, summed over clubs.
            clubs_lists, cg = [], {}
            for c, t in tables.items():
                if y in t:
                    clubs_lists.append(t[y][0])
                    for slug, g in t[y][2].items():
                        cg[slug] = max(cg.get(slug, 0.0), g)
            games = min(sum(cg.values()), 16.0) if cg else 0.0
            slugs = merge_clubs(clubs_lists)
            codes = []
            for s in slugs:
                if s not in SLUG:
                    issues["unknown_slug"][s] = issues["unknown_slug"].get(s, 0) + 1
                    continue
                lo, hi = SLUG_YEARS.get(s, (0, 9999))
                if not lo <= y <= hi:
                    issues["slug_year"] += 1
                    if len(slug_year_ex) < 15:
                        slug_year_ex.append((gsis, y, s))
                c = SLUG[s]
                if KEYOF.get(c, c) not in FRANCHISE_KEYS:
                    issues["bad_code"].add(c)
                if c not in codes:
                    codes.append(c)
            if not codes:
                continue
            stats = {}
            if family == "O":
                for area, (cols, cat, keymap) in AREAS.items():
                    if area == "pass" and f["grp"] != "QB":
                        continue
                    t = tables.get(cat)
                    if not t or y not in t:
                        continue
                    v = t[y][1]
                    if any(v.get(k, 0.0) != 0 for k in cols):
                        for src, dst in keymap.items():
                            stats[dst] = tidy(v.get(src, 0.0))
            else:
                t = tables.get("defensive")
                if t and y in t:
                    v = t[y][1]
                    cols = ["sacks", "interceptions"]
                    if y >= FF_PD_FROM:
                        cols += ["fumblesForced", "passesDefended", "totalTackles"]
                    if any(v.get(k, 0.0) != 0 for k in cols):
                        if y >= SACK_FROM:
                            stats["def_sacks"] = tidy(v.get("sacks", 0.0))
                        stats["def_interceptions"] = tidy(v.get("interceptions", 0.0))
                        if y >= FF_PD_FROM:
                            stats["def_pass_defended"] = tidy(v.get("passesDefended", 0.0))
                            stats["def_fumbles_forced"] = tidy(v.get("fumblesForced", 0.0))
            rec = {"id": gsis, "name": f["name"], "pos": f["pos"], "grp": f["grp"], "season": y,
                   "team": codes[-1]}
            if len(codes) > 1:
                rec["teams"] = codes
            rec["games"] = int(games)
            rec["stats"] = stats
            records.append(rec)

    records.sort(key=lambda r: (r["season"], r["name"], r["id"]))
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf8") as fh:
        json.dump({"sport": "nfl", "through": THROUGH, "players": records}, fh, separators=(",", ":"),
                  ensure_ascii=False)
    print("players in players.json:", len(first))
    print("players with pre-1999 rows:", issues["with_pre1999"], " rows:", len(records))
    print("no espn id:", issues["no_espn_id"], " espn 404:", issues["espn_404"],
          " not fetched:", len(issues["not_fetched"]), issues["not_fetched"][:5])
    print("unknown slugs:", issues["unknown_slug"], " slug/year oddities:", issues["slug_year"], slug_year_ex)
    print("bad codes:", issues["bad_code"], " size:", os.path.getsize(OUT))


if __name__ == "__main__":
    main()
