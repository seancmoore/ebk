"""Build the Stat Lab search index + per-sport profile files from the game data.

  python tools/build_stat_lab.py

Reads  public/data/players.json and public/data/<sport>/players.json
Writes public/data/stat-lab/index.json   names only: [name, sport, i, pos, y0, y1, lastTeam, nSeasons]
       public/data/stat-lab/<sport>.json  {labels, pref, players:[[name,pos,grp,[[season,team,games,s1,s2,s3],...]],...]}
       public/data/stat-lab/meta.json     headline counts for the Stat Lab strip
Re-run whenever players.json changes (it also picks up data fixes automatically).
"""
import json, os, collections
ROOT = os.path.join(os.path.dirname(__file__), "..", "public", "data")
OUT = os.path.join(ROOT, "stat-lab")
SRC = {"nfl": "players.json", "cfb": "cfb/players.json", "mlb": "mlb/players.json",
       "nba": "nba/players.json", "nhl": "nhl/players.json", "soccer": "soccer/players.json"}
# three headline stats per position group
PREF = {
 "nfl": {"QB": ["passing_yards", "passing_tds", "rushing_yards"], "RB": ["rushing_yards", "rushing_tds", "receiving_yards"],
         "WR": ["receiving_yards", "receptions", "receiving_tds"], "TE": ["receiving_yards", "receptions", "receiving_tds"],
         "DL": ["tackles", "def_sacks", "def_fumbles_forced"], "LB": ["tackles", "def_sacks", "def_interceptions"],
         "DB": ["tackles", "def_interceptions", "def_pass_defended"], "*": ["fantasy_points", "tackles", "receiving_yards"]},
 "cfb": {"QB": ["pyd", "ptd", "ryd"], "RB": ["ryd", "rtd", "recyd"], "WR": ["recyd", "rec", "rectd"], "TE": ["recyd", "rec", "rectd"],
         "ATH": ["ryd", "recyd", "tkl"], "*": ["tkl", "sk", "recyd"]},
 "mlb": {"H": ["hits", "hr", "rbi"], "P": ["w", "k", "sv"], "*": ["hits", "hr", "rbi"]},
 "nba": {"*": ["pts", "reb", "ast"]},
 "nhl": {"F": ["g", "a", "pts"], "D": ["g", "a", "pts"], "G": ["w", "so", "sv"], "*": ["g", "a", "pts"]},
 "soccer": {"FWD": ["goals", "assists", "minutes"], "MID": ["goals", "assists", "minutes"], "DEF": ["goals", "assists", "cs"],
            "GK": ["cs", "saves", "minutes"], "*": ["goals", "assists", "minutes"]},
}
MIN_SEASONS = {"nfl": 3, "cfb": 3, "mlb": 2, "nba": 2, "nhl": 2, "soccer": 2}

def num(v):
    if isinstance(v, float): return round(v, 1)
    return v or 0

os.makedirs(OUT, exist_ok=True)
index, meta = [], {"playerSeasons": 0, "categories": 0, "teams": 0, "first": 9999, "last": 0}
for sp, f in SRC.items():
    d = json.load(open(os.path.join(ROOT, f), encoding="utf-8"))
    meta["playerSeasons"] += len(d["players"]); meta["categories"] += len(d["categories"])
    labels = {c["key"]: c["label"] for c in d["categories"]}
    by = collections.defaultdict(list)
    for r in d["players"]:
        by[r["id"]].append(r)
        meta["first"] = min(meta["first"], r["season"]); meta["last"] = max(meta["last"], r["season"])
    out = []
    for pid, rows in by.items():
        if len(rows) < MIN_SEASONS[sp]: continue
        rows.sort(key=lambda r: r["season"])
        g = rows[-1].get("grp") or "*"
        keys = PREF[sp].get(g) or PREF[sp]["*"]
        seas = [[r["season"], r["team"], r.get("games", 0) or 0] + [num(r["stats"].get(k)) for k in keys] for r in rows]
        i = len(out)
        out.append([rows[-1]["name"], rows[-1].get("pos", ""), g, seas])
        index.append([rows[-1]["name"], sp, i, rows[-1].get("pos", ""), rows[0]["season"], rows[-1]["season"], rows[-1]["team"], len(rows)])
    json.dump({"labels": labels, "pref": PREF[sp], "players": out}, open(os.path.join(OUT, sp + ".json"), "w", encoding="utf-8"), separators=(",", ":"))
    print(sp, len(out))
json.dump(index, open(os.path.join(OUT, "index.json"), "w", encoding="utf-8"), separators=(",", ":"))
json.dump(meta, open(os.path.join(OUT, "meta.json"), "w", encoding="utf-8"))
print("index", len(index), meta)
