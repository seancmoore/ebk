"""
build_cfb_career.py - college seasons outside CollegeFootballData's coverage, for players already in the CFB file.

CFBD (build_cfb.py) has offense from 2008 and defense only from 2016, and the shipped window is 2014-2025, so careers
of players with a row in the window start too late (Mayfield 2013 at Texas Tech, Winston 2013) and 2014-15 defenders are
missing entirely. ESPN's college athlete stats (tools/espn_cfb_fetch.cjs -> data/raw/espn_cfb/{id}.json; CFBD player ids
ARE ESPN ids) list every season with the team id, position and the category tables.

Output: data/raw/career/cfb.json {"sport":"cfb","through":2015,"players":[records]} in the main record shape
(id, name, pos, grp, season, team, [teams], games, stats) WITHOUT conf/headshot. Rules:
  * ONLY ids present in public/data/cfb/players.json; ONLY seasons that player has no row for in that file, and only
    seasons <= 2015 (the window gap years 2014-15 and everything before it).
  * team = FBS school of that year (ESPN team id == CFBD team id, names from CFBD /teams/fbs?year= lists, cached in
    data/raw/cfb/teams_Y.json (2014+) and data/raw/cfb_pre/teams_Y.json); non-FBS seasons are skipped, exactly like the
    main file. Transfers are separate seasons with their own school; the very rare two-school season keeps both in `teams`.
  * stats keys mirror build_cfb.py's MAP and only appear for tables ESPN lists: passing pyd/ptd/pint, rushing car/ryd/rtd,
    receiving rec/recyd/rectd, defensive tkl/sk (ESPN has no tackles-for-loss). games stays 0 (no bulk source, as in the main file).
  * pos/grp: ESPN's position for that season through build_cfb.grp_of.
"""
import glob, json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from build_cfb import grp_of, OFFICIAL_FIXES

HERE = os.path.dirname(os.path.abspath(__file__))
PLAYERS = os.path.normpath(os.path.join(HERE, "..", "public", "data", "cfb", "players.json"))
OUT = os.path.join(HERE, "raw", "career", "cfb.json")
THROUGH = 2015
MAP = {
    "passing": {"passingYards": "pyd", "passingTouchdowns": "ptd", "interceptions": "pint"},
    "rushing": {"rushingAttempts": "car", "rushingYards": "ryd", "rushingTouchdowns": "rtd"},
    "receiving": {"receptions": "rec", "receivingYards": "recyd", "receivingTouchdowns": "rectd"},
    "defensive": {"totalTackles": "tkl", "sacks": "sk"},
}
FLOAT = {"sk"}


def num(x):
    try:
        return float(str(x).replace(",", ""))
    except ValueError:
        return 0.0


def team_names():
    names = {}
    for y in range(2004, 2026):
        f = os.path.join(HERE, "raw", "cfb" if y >= 2014 else "cfb_pre", "teams_%d.json" % y)
        if os.path.exists(f):
            names[y] = {str(t["id"]): t["school"] for t in json.load(open(f, encoding="utf8"))}
    return names


def main():
    d = json.load(open(PLAYERS, encoding="utf8"))["players"]
    have, first = set(), {}
    for r in d:
        have.add((r["id"], r["season"]))
        if r["id"] not in first or r["season"] < first[r["id"]]["season"]:
            first[r["id"]] = r
    tn = team_names()
    rows, stat = [], {"players": 0, "none": 0, "no_fbs": 0, "seasons": 0}
    for f in sorted(glob.glob(os.path.join(HERE, "raw", "espn_cfb", "*.json"))):
        pid = os.path.basename(f)[:-5]
        if pid not in first:
            continue
        j = json.load(open(f, encoding="utf8"))
        if j.get("none"):
            stat["none"] += 1
            continue
        by = {}
        for cat, c in j["cats"].items():
            if cat not in MAP:
                continue
            for r in c["rows"]:
                if r["y"] > THROUGH or (pid, r["y"]) in have:
                    continue
                school = tn.get(r["y"], {}).get(str(r.get("t")))
                if not school:
                    stat["no_fbs"] += 1
                    continue
                e = by.setdefault(r["y"], {"stats": {}, "teams": [], "pos": None})
                if school not in e["teams"]:
                    e["teams"].append(school)
                if r.get("p") and not e["pos"]:
                    e["pos"] = r["p"]
                for n, k in MAP[cat].items():
                    if n in c["names"]:
                        v = num(r["s"][c["names"].index(n)])
                        e["stats"][k] = round(v, 1) if k in FLOAT else int(round(v))
        if by:
            stat["players"] += 1
        for y, e in sorted(by.items()):
            fix = OFFICIAL_FIXES.get((pid, y))       # shared with build_cfb.py: confirmed figures, None drops a cell
            if fix:
                for k, v in fix.items():
                    if v is None:
                        e["stats"].pop(k, None)
                    else:
                        e["stats"][k] = v
            pos = e["pos"] or first[pid]["pos"]
            rec = {"id": pid, "name": first[pid]["name"], "pos": pos, "grp": grp_of(pos), "season": y,
                   "team": e["teams"][-1], "games": 0, "stats": e["stats"]}
            if len(e["teams"]) > 1:
                rec["teams"] = e["teams"]
            rows.append(rec)
            stat["seasons"] += 1
    # Implausible ESPN defender tackles: ESPN's tables have holes (T.J. Neal 2014 lists 7 tackles in 1 game; the Illinois
    # bio says 98). A season whose tackles are at most a quarter of an adjacent season's 45+ (window rows included) is
    # not trusted: its tkl/sk cells are dropped, the season and school stay for the career path. Pinned rows are exempt.
    allseasons = {}
    for r in d:
        allseasons.setdefault(r["id"], {})[r["season"]] = r["stats"].get("tkl")
    for r in rows:
        allseasons.setdefault(r["id"], {})[r["season"]] = r["stats"].get("tkl")
    dropped = 0
    for r in rows:
        t = r["stats"].get("tkl")
        if t is None or r["grp"] not in ("DL", "LB", "DB") or (r["id"], r["season"]) in OFFICIAL_FIXES:
            continue
        nb = [allseasons[r["id"]].get(z) for z in (r["season"] - 1, r["season"] + 1)]
        nb = [x for x in nb if x is not None]
        if nb and max(nb) >= 45 and t <= 0.25 * max(nb):
            r["stats"].pop("tkl", None)
            r["stats"].pop("sk", None)
            dropped += 1
    stat["implausible_tackle_rows_dropped"] = dropped
    rows.sort(key=lambda r: (r["season"], r["name"], r["id"]))
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    json.dump({"sport": "cfb", "through": THROUGH, "players": rows}, open(OUT, "w", encoding="utf8"),
              separators=(",", ":"), ensure_ascii=False)
    print(stat, "rows", len(rows), "size", os.path.getsize(OUT))


if __name__ == "__main__":
    main()
