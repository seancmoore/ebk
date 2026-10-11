"""
build_espn_overlay.py - reconcile NFL defensive player-seasons with ESPN.

nflverse's early weekly rows are incomplete (audit 2026-10-10: ~23% of 1999-2005
defenders were 1-2 games short, plus small sack/tackle drift). This reads the
per-player ESPN career stats cached by tools/espn_def_fetch.cjs in
data/raw/espn_def/ and writes:

  data/raw/espn_def_overlay.json   {"gsis|season": {games, tackles, def_sacks, def_interceptions}}
                                   values build_players.py applies (OFFICIAL_FIXES still win)
  data/raw/espn_def_needs_decision.json   rows ESPN disagrees with by more than the
                                   thresholds (>2 games, >10% tackles, >2 sacks/ints). NOT applied:
                                   a second source is required first.

Only seasons whose games-undercount rate is high are overlaid (SEASONS below is
set from the measured rates), so modern seasons are left as nflverse has them.
Usage: python build_espn_overlay.py [--report]
"""
import json, os, sys, glob
from collections import defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
PLAYERS = os.path.normpath(os.path.join(HERE, "..", "public", "data", "players.json"))
CACHE = os.path.join(HERE, "raw", "espn_def")
OUT = os.path.join(HERE, "raw", "espn_def_overlay.json")
BASE = os.path.join(HERE, "raw", "espn_def_baseline.json")   # nflverse defensive rows before any ESPN overlay (frozen 2026-10-10)
ND = os.path.join(HERE, "raw", "espn_def_needs_decision.json")
ACCEPT = os.path.join(HERE, "raw", "espn_def_accept.json")   # verified rows: {"id|season": ["def_sacks"]}; "*tackles": true accepts all tackle drift
SEASONS = None   # filled below from CLI/overlay config
CFG = os.path.join(HERE, "raw", "espn_def_seasons.json")


def load_espn():
    out = {}
    for f in glob.glob(os.path.join(CACHE, "*.json")):
        j = json.load(open(f, encoding="utf8"))
        if j.get("none") or not j.get("names"):
            continue
        names = j["names"]
        ix = {n: i for i, n in enumerate(names)}
        per = defaultdict(lambda: [0.0, 0.0, 0.0, 0.0])
        # ESPN lists a "<year> Totals" row after the per-team rows of a multi-team season: use it alone
        tot_years = {r["y"] for r in j["rows"] if "Totals" in (r["t"] or "")}
        for r in j["rows"]:
            if r["y"] in tot_years and "Totals" not in (r["t"] or ""):
                continue
            s = r["s"]
            def g(n):
                try:
                    return float(s[ix[n]])
                except Exception:
                    return 0.0
            a = per[r["y"]]
            a[0] += g("gamesPlayed"); a[1] += g("totalTackles"); a[2] += g("sacks"); a[3] += g("interceptions")
        out[os.path.basename(f)[:-5]] = per
    return out


def main():
    espn = load_espn()
    # compare against the frozen nflverse baseline (players.json already contains the previous overlay)
    base = json.load(open(BASE, encoding="utf8"))
    rows = []
    for k, v in base.items():
        i, y = k.split("|")
        rows.append({"id": i, "season": int(y), "games": v[0], "name": v[4], "team": v[5], "grp": v[6],
                     "stats": {"tackles": v[1], "def_sacks": v[2], "def_interceptions": v[3]}})
    # measure undercount rate per season
    stat = defaultdict(lambda: [0, 0, 0])   # n compared, n games short, n games over
    for r in rows:
        e = espn.get(r["id"], {}).get(r["season"])
        if not e:
            continue
        st = stat[r["season"]]
        st[0] += 1
        st[1] += e[0] > r["games"]
        st[2] += e[0] < r["games"]
    if "--report" in sys.argv:
        for y in sorted(stat):
            n, sh, ov = stat[y]
            print(y, "compared", n, "ESPN more games %.1f%%" % (100 * sh / n), "ESPN fewer %.1f%%" % (100 * ov / n))
        return
    seasons = set(json.load(open(CFG))["seasons"])
    overlay, nd = {}, []
    acc = json.load(open(ACCEPT)) if os.path.exists(ACCEPT) else {}
    for r in rows:
        if r["season"] not in seasons:
            continue
        e = espn.get(r["id"], {}).get(r["season"])
        if not e or e[0] <= 0:
            continue
        s = r["stats"]
        new = {"games": int(e[0]), "tackles": int(e[1]), "def_sacks": e[2], "def_interceptions": int(e[3])}
        old = {"games": r["games"], "tackles": s["tackles"], "def_sacks": s["def_sacks"], "def_interceptions": s["def_interceptions"]}
        if new == old:
            continue
        key = "%s|%s" % (r["id"], r["season"])
        cap = 17 if r["season"] >= 2021 else 16      # every club played this many regular-season games
        held = {}
        use = {}
        # games: ESPN games played. Accepted whenever it fits the schedule (nflverse counts only games with a stat).
        if new["games"] != old["games"]:
            if new["games"] <= cap:
                use["games"] = new["games"]
            else:
                held["games"] = "exceeds %d-game schedule" % cap
        # tackles / sacks / INT: small drift accepted; big drift held unless verified (ACCEPT file)
        verified = acc.get(key, [])
        for f, big in (("tackles", abs(new["tackles"] - old["tackles"]) > 0.10 * max(old["tackles"], 1)),
                       ("def_sacks", abs(new["def_sacks"] - old["def_sacks"]) > 2),
                       ("def_interceptions", abs(new["def_interceptions"] - old["def_interceptions"]) > 2)):
            if new[f] == old[f]:
                continue
            if not big or f in verified or ("tackles" == f and acc.get("*tackles")):
                use[f] = new[f]
            else:
                held[f] = "big drift"
        if use:
            overlay[key] = use
        if held:
            nd.append({"id": r["id"], "name": r["name"], "season": r["season"], "team": r["team"],
                       "data": old, "espn": new, "held": held})
    json.dump(overlay, open(OUT, "w"), separators=(",", ":"))
    json.dump(nd, open(ND, "w", encoding="utf8"), indent=0, ensure_ascii=False)
    print("overlay rows", len(overlay), "needs decision", len(nd))


if __name__ == "__main__":
    main()
