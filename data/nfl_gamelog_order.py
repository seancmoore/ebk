"""
nfl_gamelog_order.py - orders the clubs of every traded pre-1999 season by ESPN game-log dates.
For each multi-club row in raw/career/nfl.json (after reconcile_nfl_career.py) fetches
.../athletes/{espn_id}/gamelog?season=Y (cached in raw/espn_gamelog_nfl/), takes the first game date per club
and writes raw/career/nfl_club_order.json {"gsis|season": {"order": [codes], "games": {code: n}}}.
reconcile_nfl_career.py reads it to order `teams` (earliest club first) and notes per-club games.
"""
import csv, json, os, time, urllib.request
HERE = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.join(HERE, "raw", "espn_gamelog_nfl")
os.makedirs(CACHE, exist_ok=True)
rows = {r["gsis_id"]: r for r in csv.DictReader(open(os.path.join(HERE, "raw", "players.csv"), encoding="utf8"))}
FOLD = {"OAK": "LV", "SD": "LAC", "STL": "LAR", "LA": "LAR", "JAC": "JAX", "WSH": "WAS", "HOU": "TEN", "ARZ": "ARI", "BLT": "BAL"}
KEYOF = {"OAK": "LV", "SD": "LAC", "STL": "LAR", "LA": "LAR", "JAC": "JAX", "WSH": "WAS"}


def fk(c):
    return FOLD.get(c, KEYOF.get(c, c))


def main():
    car = json.load(open(os.path.join(HERE, "raw", "career", "nfl.json"), encoding="utf8"))["players"]
    out = {}
    for r in car:
        if not r.get("teams"):
            continue
        key = "%s|%d" % (r["id"], r["season"])
        f = os.path.join(CACHE, key.replace("|", "_") + ".json")
        if not os.path.exists(f):
            u = "https://site.web.api.espn.com/apis/common/v3/sports/football/nfl/athletes/%s/gamelog?season=%d" % (rows[r["id"]]["espn_id"], r["season"])
            try:
                j = json.load(urllib.request.urlopen(urllib.request.Request(u, headers={"User-Agent": "Mozilla/5.0"}), timeout=40))
            except Exception as e:
                j = {"error": str(e)}
            slim = []
            if "events" in j:
                reg = set()
                for st in j.get("seasonTypes", []):
                    if "Regular" in st.get("displayName", ""):
                        for c in st.get("categories", []):
                            for ev in c.get("events", []):
                                reg.add(ev["eventId"])
                for eid, ev in j["events"].items():
                    if eid in reg:
                        slim.append({"d": ev.get("gameDate", "")[:10], "t": (ev.get("team") or {}).get("abbreviation")})
            json.dump(slim, open(f, "w"))
            time.sleep(0.3)
        ev = json.load(open(f))
        first, cnt = {}, {}
        for e in sorted(ev, key=lambda x: x["d"]):
            c = fk(e["t"] or "")
            first.setdefault(c, e["d"])
            cnt[c] = cnt.get(c, 0) + 1
        if first:
            out[key] = {"order": [c for c, _ in sorted(first.items(), key=lambda kv: kv[1])], "games": cnt}
    json.dump(out, open(os.path.join(HERE, "raw", "career", "nfl_club_order.json"), "w"), indent=0)
    print("multi-club rows with a game log:", len(out))


if __name__ == "__main__":
    main()
