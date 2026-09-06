"""
build_mlb.py — MLB player-season dataset for EBK (stdlib only).

Source: Lahman / Chadwick baseball databank (xorq-labs fork, through 2021).
Hitters and pitchers; team canonicalized to franchise key.

Usage: python build_mlb.py [start end]
"""
import csv, io, os, sys, json, urllib.request
from collections import defaultdict
from datetime import date

FIRST, LAST = 2000, 2021
HERE = os.path.dirname(os.path.abspath(__file__))
RAW = os.path.join(HERE, "raw", "mlb")
OUT = os.path.normpath(os.path.join(HERE, "..", "public", "data", "mlb", "players.json"))
BASE = "https://raw.githubusercontent.com/xorq-labs/baseballdatabank/master/core"

ESPN = {"ANA": "laa", "ARI": "ari", "ATL": "atl", "BAL": "bal", "BOS": "bos", "CHC": "chc",
        "CHW": "chw", "CIN": "cin", "CLE": "cle", "COL": "col", "DET": "det", "FLA": "mia",
        "HOU": "hou", "KCR": "kc", "LAD": "lad", "MIL": "mil", "MIN": "min", "NYM": "nym",
        "NYY": "nyy", "OAK": "oak", "PHI": "phi", "PIT": "pit", "SDP": "sd", "SEA": "sea",
        "SFG": "sf", "STL": "stl", "TBD": "tb", "TEX": "tex", "TOR": "tor", "WSN": "wsh"}
NICK = {"ANA": "Angels", "ARI": "Diamondbacks", "ATL": "Braves", "BAL": "Orioles", "BOS": "Red Sox",
        "CHC": "Cubs", "CHW": "White Sox", "CIN": "Reds", "CLE": "Guardians", "COL": "Rockies",
        "DET": "Tigers", "FLA": "Marlins", "HOU": "Astros", "KCR": "Royals", "LAD": "Dodgers",
        "MIL": "Brewers", "MIN": "Twins", "NYM": "Mets", "NYY": "Yankees", "OAK": "Athletics",
        "PHI": "Phillies", "PIT": "Pirates", "SDP": "Padres", "SEA": "Mariners", "SFG": "Giants",
        "STL": "Cardinals", "TBD": "Rays", "TEX": "Rangers", "TOR": "Blue Jays", "WSN": "Nationals"}

CATEGORIES = [
    ("hr", "Home Runs", 0, "\U0001F4A3"), ("rbi", "RBI", 0, "\U0001F3CF"),
    ("hits", "Hits", 0, "\U0001F3AF"), ("runs", "Runs", 0, "\U0001F3C3"),
    ("sb", "Stolen Bases", 0, "\U0001F4A8"), ("avg", "Batting Avg", 3, "\U0001F4CA"),
    ("w", "Wins", 0, "\U0001F947"), ("k", "Strikeouts", 0, "\U0001F525"),
    ("sv", "Saves", 0, "\U0001F512"), ("era", "ERA", 2, "\U0001F6E1️"),
]


def fetch(name, base=None):
    os.makedirs(RAW, exist_ok=True)
    cache = os.path.join(RAW, name)
    if not (os.path.exists(cache) and os.path.getsize(cache) > 0):
        req = urllib.request.Request((base or BASE) + "/" + name, headers={"User-Agent": "ebk/1.0"})
        with urllib.request.urlopen(req, timeout=120) as r, open(cache, "wb") as f:
            f.write(r.read())
    with open(cache, encoding="utf-8") as f:
        return list(csv.DictReader(f))


# Chadwick register: maps bbref/Lahman playerIDs -> MLBAM ids (for headshots).
REGISTER = "https://raw.githubusercontent.com/chadwickbureau/register/master/data"

def mlbam_map(first_year):
    out = {}
    for h in "0123456789abcdef":
        for r in fetch_register(h):
            bbref, mlbam = r.get("key_bbref"), r.get("key_mlbam")
            last = r.get("mlb_played_last")
            if bbref and mlbam and last and int(last) >= first_year:
                out[bbref] = mlbam
    return out

def fetch_register(h):
    os.makedirs(RAW, exist_ok=True)
    cache = os.path.join(RAW, "register-people-%s.csv" % h)
    if not (os.path.exists(cache) and os.path.getsize(cache) > 0):
        url = REGISTER + "/people-%s.csv" % h
        req = urllib.request.Request(url, headers={"User-Agent": "ebk/1.0"})
        with urllib.request.urlopen(req, timeout=180) as r, open(cache, "wb") as f:
            f.write(r.read())
    with open(cache, encoding="utf-8") as f:
        return list(csv.DictReader(f))

HEADSHOT = ("https://img.mlbstatic.com/mlb-photos/image/upload/"
            "d_people:generic:headshot:67:current.png/w_213,q_auto:best/"
            "v1/people/{}/headshot/67/current.png")


def num(x):
    try: return float(x)
    except (TypeError, ValueError): return 0.0


def build():
    start, end = (int(sys.argv[1]), int(sys.argv[2])) if len(sys.argv) == 3 else (FIRST, LAST)
    mlbam = mlbam_map(start)
    print(f"Chadwick register: {len(mlbam):,} bbref->MLBAM ids (mlb_played_last >= {start})")
    teamFranch = {r["teamID"]: r["franchID"] for r in fetch("Teams.csv")}
    people = {}
    for r in fetch("People.csv"):
        nm = ((r.get("nameFirst") or "") + " " + (r.get("nameLast") or "")).strip()
        people[r["playerID"]] = nm or r["playerID"]

    bat = defaultdict(lambda: defaultdict(float))      # (pid,yr) -> sums
    teamG = defaultdict(lambda: defaultdict(float))    # (pid,yr) -> teamID -> G
    for r in fetch("Batting.csv"):
        y = int(r["yearID"])
        if y < start or y > end: continue
        k = (r["playerID"], y)
        for c in ("G", "AB", "R", "H", "HR", "RBI", "SB"):
            bat[k][c] += num(r[c])
        teamG[k][r["teamID"]] += num(r["G"])

    pit = defaultdict(lambda: defaultdict(float))
    for r in fetch("Pitching.csv"):
        y = int(r["yearID"])
        if y < start or y > end: continue
        k = (r["playerID"], y)
        for c in ("W", "SV", "SO", "IPouts", "ER", "G"):
            pit[k][c] += num(r[c])
        teamG[k][r["teamID"]] += num(r["G"])

    # primary fielding position per (pid,yr)
    posG = defaultdict(lambda: defaultdict(float))
    for r in fetch("Fielding.csv"):
        y = int(r["yearID"])
        if y < start or y > end: continue
        posG[(r["playerID"], y)][r["POS"]] += num(r["G"])

    def primary_pos(k):
        d = posG.get(k)
        if not d: return ""
        pos = max(d, key=d.get)
        return "OF" if pos in ("LF", "CF", "RF", "OF") else pos

    keys = set(bat) | set(pit)
    players = []
    cat_counts = defaultdict(int)
    for k in keys:
        pid, yr = k
        tg = teamG[k]
        teamID = max(tg, key=tg.get) if tg else ""
        franch = teamFranch.get(teamID, teamID)
        if franch not in ESPN:           # skip defunct/unmapped (keeps logos valid)
            continue
        # Every franchise the player appeared for that season (by games
        # played, most-played first) — not just the one with the most
        # games, so a mid-season trade still registers on both teams' grids.
        franchises = list(dict.fromkeys(
            teamFranch.get(t, t) for t, _gp in sorted(tg.items(), key=lambda kv: -kv[1])
            if teamFranch.get(t, t) in ESPN))
        b, p = bat.get(k), pit.get(k)
        ipouts = p["IPouts"] if p else 0
        isPitcher = bool(p) and ipouts >= 30 and (not b or b["AB"] < 50)
        stats = {}
        if b and b["AB"] > 0:
            stats["hr"] = int(b["HR"]); stats["rbi"] = int(b["RBI"]); stats["hits"] = int(b["H"])
            stats["runs"] = int(b["R"]); stats["sb"] = int(b["SB"])
            stats["avg"] = round(b["H"] / b["AB"], 3)
        if isPitcher:
            stats["w"] = int(p["W"]); stats["k"] = int(p["SO"]); stats["sv"] = int(p["SV"])
            if ipouts > 0:
                stats["era"] = round(p["ER"] * 27.0 / ipouts, 2)
        if not franchises:
            continue
        for c in stats:
            cat_counts[c] += 1
        games = int((b["G"] if b else 0) if not isPitcher else (p["G"] if p else 0))
        pos = "P" if isPitcher else (primary_pos(k) or "DH")
        rec = {
            "id": pid, "name": people.get(pid, pid),
            "pos": pos, "grp": "P" if isPitcher else "H",
            "season": yr, "team": franch, "games": games, "stats": stats,
        }
        if len(franchises) > 1:
            rec["teams"] = franchises
        if pid in mlbam:
            rec["headshot"] = HEADSHOT.format(mlbam[pid])
        players.append(rec)

    players.sort(key=lambda r: (r["season"], r["name"]))
    out = {
        "generated": date.today().isoformat(),
        "source": "Lahman / Chadwick baseball databank",
        "sport": "mlb", "seasons": [start, end],
        "categories": [{"key": k, "label": l, "decimals": d, "icon": i} for k, l, d, i in CATEGORIES],
        "players": players, "people": {},
    }
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
    print(f"Wrote {len(players):,} player-seasons -> {OUT} ({os.path.getsize(OUT)/1e6:.1f} MB)")
    for k, l, *_ in CATEGORIES:
        print(f"  {l:<16} {cat_counts[k]:>6,}")


if __name__ == "__main__":
    build()
