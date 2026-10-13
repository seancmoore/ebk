"""
build_cfb.py — College Football player-season dataset for EBK.
Source: CollegeFootballData API (free key, read from raw/cfbd.key; build-time only).
Writes public/data/cfb/players.json AND a generated public/js/cfb-teams.js (131 FBS schools).

Usage: python build_cfb.py [start end]
"""
import os, sys, json, time, urllib.request
from collections import defaultdict
from datetime import date

FIRST, LAST = 2014, 2025
HERE = os.path.dirname(os.path.abspath(__file__))
RAW = os.path.join(HERE, "raw", "cfb")
OUT = os.path.normpath(os.path.join(HERE, "..", "public", "data", "cfb", "players.json"))
TEAMS_JS = os.path.normpath(os.path.join(HERE, "..", "public", "js", "cfb-teams.js"))
KEYFILE = os.path.join(HERE, "raw", "cfbd.key")
API = "https://api.collegefootballdata.com"

# statType -> our stat key, per category
MAP = {
    "passing":   {"YDS": "pyd", "TD": "ptd", "INT": "pint"},
    "rushing":   {"YDS": "ryd", "TD": "rtd", "CAR": "car"},
    "receiving": {"YDS": "recyd", "TD": "rectd", "REC": "rec"},
    "defensive": {"TOT": "tkl", "SACKS": "sk", "TFL": "tfl"},
}
CATEGORIES = [
    ("pyd", "Passing Yards", 0, "\U0001F3AF"), ("ptd", "Passing TDs", 0, "\U0001F680"),
    ("ryd", "Rushing Yards", 0, "\U0001F3C3"), ("rtd", "Rushing TDs", 0, "\U0001F4A8"),
    ("recyd", "Receiving Yards", 0, "\U0001F64C"), ("rec", "Receptions", 0, "\U0001F9E4"),
    ("rectd", "Receiving TDs", 0, "\U0001F525"), ("tkl", "Tackles", 0, "\U0001F6D1"),
    ("sk", "Sacks", 1, "\U0001F4A5"),
]
# Owner-approved pins to the official figure (audit 2026-10-10, docs/data-audit-20261010.md).
# Keyed by (CFBD/ESPN playerId, season). Cite the source next to each entry.
OFFICIAL_FIXES = {
    # Max Duggan 2020 TCU: 1,795 pass yds, 10 TD, 116 car, 526 rush yds (CFBD 1,764 / 9 / 114 / 547).
    # ESPN athlete stats + https://en.wikipedia.org/wiki/Max_Duggan
    ("4427105", 2020): {"pyd": 1795, "ptd": 10, "car": 116, "ryd": 526},
    # --- 2026-10-12: every wrong cell of the 82-career verification (docs/data-audit-20261010.md, ninth pass).
    # A value of None means "drop this cell": the sources disagree or give no exact figure, so nothing is shipped.
    # Window rows (CFBD):
    # Kyler Murray 2018 OU: 4,361 pass yds (CFBD 4,364). https://en.wikipedia.org/wiki/Kyler_Murray
    ("3917315", 2018): {"pyd": 4361},
    # Joe Burrow 2018 LSU: 2,894 pass yds (CFBD 2,893); 2019 LSU: 368 rush yds (CFBD 369). https://en.wikipedia.org/wiki/Joe_Burrow
    ("3915511", 2018): {"pyd": 2894},
    ("3915511", 2019): {"ryd": 368},
    # Dwayne Haskins 2018 OSU: 4,831 pass yds, 50 TD (CFBD 4,751 / 49). https://cfbstats.com/2018/player/518/1080293/index.html and https://en.wikipedia.org/wiki/Dwayne_Haskins
    ("4040616", 2018): {"pyd": 4831, "ptd": 50},
    # Aidan Hutchinson Michigan: 2018 15 tackles (CFBD 12); 2020 dropped (Wikipedia 13 in 3 games, Lions bio 15, CFBD 6).
    # https://en.wikipedia.org/wiki/Aidan_Hutchinson
    ("4372099", 2018): {"tkl": 15},
    ("4372099", 2020): {"tkl": None},
    # Chase Young 2018 OSU: 10.5 sacks, 34 tackles (CFBD 9.5 / 33). https://en.wikipedia.org/wiki/Chase_Young
    ("4241986", 2018): {"sk": 10.5, "tkl": 34},
    # Richard Moore 2018 SMU: 92 tackles (CFBD 80). https://smumustangs.com/roster.aspx?rp_id=9738
    ("3895858", 2018): {"tkl": 92},
    # Added (ESPN-derived) rows, applied by build_cfb_career.py:
    # Myles Garrett 2014 and 2015 Texas A&M: 53 and 59 tackles (ESPN 52 / 58). https://en.wikipedia.org/wiki/Myles_Garrett
    ("3122132", 2014): {"tkl": 53},
    ("3122132", 2015): {"tkl": 59},
    # T.J. Neal Illinois: 98 tackles 2014, 109 tackles and 2 sacks 2015 (ESPN 7 / 46 / 1). Illinois roster bio https://fightingillini.com/roster.aspx?rp_id=2218
    ("530682", 2014): {"tkl": 98},
    ("530682", 2015): {"tkl": 109, "sk": 2.0},
    # Malik McDowell 2014 Michigan State: 15 tackles (ESPN 13). https://msuspartans.com/roster.aspx?rp_id=1875
    ("3134681", 2014): {"tkl": 15},
    # Mason Gentry 2014 SMU: 38 tackles (ESPN 34). https://smumustangs.com/sports/football/roster/mason-gentry/1249
    ("545340", 2014): {"tkl": 38},
    # Justin Abston Southern Miss: 2013 tackles dropped (source says "at least 2", no exact figure); 2015 9 tackles (ESPN 8).
    # https://southernmiss.com/sports/football/roster/justin-abston/1631
    ("557879", 2013): {"tkl": None},
    ("557879", 2015): {"tkl": 9},
}
INT_KEYS = {"pyd", "ptd", "pint", "ryd", "rtd", "car", "recyd", "rectd", "rec", "tkl", "tfl"}


def grp_of(pos):
    p = (pos or "").upper()
    if p == "QB": return "QB"
    if p in ("RB", "FB", "HB", "TB"): return "RB"
    if p == "WR": return "WR"
    if p == "TE": return "TE"
    if p in ("DL", "DE", "DT", "NT", "EDGE"): return "DL"
    if p in ("LB", "OLB", "ILB", "MLB"): return "LB"
    if p in ("CB", "S", "SS", "FS", "DB", "SAF"): return "DB"
    return "ATH"


def api_get(path, key):
    req = urllib.request.Request(API + path, headers={
        "Authorization": "Bearer " + key, "User-Agent": "ebk/1.0"})
    with urllib.request.urlopen(req, timeout=90) as r:
        return json.loads(r.read().decode("utf-8"))


def cached(name, fn):
    os.makedirs(RAW, exist_ok=True)
    p = os.path.join(RAW, name)
    if os.path.exists(p) and os.path.getsize(p) > 0:
        with open(p, encoding="utf-8") as f:
            return json.load(f)
    data = fn()
    with open(p, "w", encoding="utf-8") as f:
        json.dump(data, f)
    return data


def build():
    start, end = (int(sys.argv[1]), int(sys.argv[2])) if len(sys.argv) == 3 else (FIRST, LAST)
    key = open(KEYFILE, encoding="utf-8").read().strip()

    # FBS schools + logos (union across years)
    schools = {}
    for y in range(start, end + 1):
        for t in cached(f"teams_{y}.json", lambda y=y: api_get(f"/teams/fbs?year={y}", key)):
            # CFBD's own logo URLs moved to its CDN in 2026; its team ids are ESPN's,
            # so keep serving the ESPN logos the rest of the site uses.
            logo = f"https://a.espncdn.com/combiner/i?img=/i/teamlogos/ncaa/500/{t['id']}.png&w=128"
            schools[t["school"]] = {"name": t["school"], "logo": logo, "conf": t.get("conference")}

    # pivot stats
    rec = defaultdict(lambda: {"stats": {}})
    for y in range(start, end + 1):
        for cat in MAP:
            rows = cached(f"{cat}_{y}.json",
                          lambda y=y, cat=cat: api_get(f"/stats/player/season?year={y}&category={cat}", key))
            for r in rows:
                school = r["team"]
                if school not in schools:
                    continue
                stmap = MAP[cat]
                if r["statType"] not in stmap:
                    continue
                k = (r["playerId"], y)
                e = rec[k]
                e["name"] = r["player"]; e["pos"] = r["position"] or "ATH"
                e["team"] = school; e["conf"] = schools[school]["conf"]; e["season"] = y
                e["pid"] = r["playerId"]
                val = float(r["stat"] or 0)
                key2 = stmap[r["statType"]]
                e["stats"][key2] = int(round(val)) if key2 in INT_KEYS else round(val, 1)
        print(f"  {y}: cumulative players {len(rec)}")

    players = []
    cat_counts = defaultdict(int)
    for (pid, y), e in rec.items():
        if not e["stats"]:
            continue
        fix = OFFICIAL_FIXES.get((str(pid), y))
        if fix:
            for k, v in fix.items():
                if v is None:
                    e["stats"].pop(k, None)          # dropped cell (no confirmable figure)
                else:
                    e["stats"][k] = v
        for k in e["stats"]:
            cat_counts[k] += 1
        players.append({
            "id": str(pid), "name": e["name"], "pos": e["pos"], "grp": grp_of(e["pos"]),
            "season": y, "team": e["team"], "conf": e.get("conf"), "games": 0,
            "headshot": f"https://a.espncdn.com/i/headshots/college-football/players/full/{pid}.png",
            "stats": e["stats"],
        })

    players.sort(key=lambda r: (r["season"], r["name"] or ""))
    out = {
        "generated": date.today().isoformat(), "source": "CollegeFootballData API",
        "sport": "cfb", "seasons": [start, end],
        "categories": [{"key": k, "label": l, "decimals": d, "icon": i} for k, l, d, i in CATEGORIES],
        "players": players, "people": {},
    }
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))

    # generate cfb-teams.js
    F = sorted(schools.values(), key=lambda s: s["name"])
    arr = ",\n".join('    {key:%s,name:%s,logo:%s}' % (json.dumps(s["name"]), json.dumps(s["name"]), json.dumps(s["logo"])) for s in F)
    js = ("/* generated by build_cfb.py — CFB schools + ESPN logos */\n"
          "window.CFB=(function(){\n  var F=[\n" + arr + "\n  ];\n"
          "  var byKey={};F.forEach(function(f){byKey[f.key]=f;});\n"
          "  return {franchises:F, keyOf:function(a){return a;},\n"
          "    name:function(a){return byKey[a]?byKey[a].name:a;},\n"
          "    logo:function(a){return byKey[a]?byKey[a].logo:'';}};\n})();\n")
    with open(TEAMS_JS, "w", encoding="utf-8") as f:
        f.write(js)

    print(f"\nWrote {len(players):,} player-seasons -> {OUT} ({os.path.getsize(OUT)/1e6:.1f} MB)")
    print(f"Generated {TEAMS_JS} ({len(F)} schools)")
    for k, l, *_ in CATEGORIES:
        print(f"  {l:<16} {cat_counts[k]:>7,}")


if __name__ == "__main__":
    build()
