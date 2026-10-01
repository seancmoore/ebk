"""
build_mlb.py — MLB player-season dataset for EBK (stdlib only).

Sources: Lahman / Chadwick baseball databank (xorq-labs fork) through 2021, then
the official MLB Stats API (statsapi.mlb.com) from 2022. Hitters and pitchers;
team canonicalized to franchise key. A player keeps his bbref id across
both sources via the Chadwick register (key_bbref <-> key_mlbam).

Usage: python build_mlb.py [start end]
"""
import csv, hashlib, os, re, sys, json, unicodedata, urllib.request
from collections import defaultdict
from datetime import date

FIRST, LAST = 2000, 2026
LAHMAN_LAST = 2021      # the databank fork stops here; the Stats API covers the rest
HERE = os.path.dirname(os.path.abspath(__file__))
RAW = os.path.join(HERE, "raw", "mlb")
OUT = os.path.normpath(os.path.join(HERE, "..", "public", "data", "mlb", "players.json"))
BASE = "https://raw.githubusercontent.com/xorq-labs/baseballdatabank/master/core"
STATSAPI = "https://statsapi.mlb.com/api/v1"

ESPN = {"ANA": "laa", "ARI": "ari", "ATL": "atl", "BAL": "bal", "BOS": "bos", "CHC": "chc",
        "CHW": "chw", "CIN": "cin", "CLE": "cle", "COL": "col", "DET": "det", "FLA": "mia",
        "HOU": "hou", "KCR": "kc", "LAD": "lad", "MIL": "mil", "MIN": "min", "NYM": "nym",
        "NYY": "nyy", "OAK": "oak", "PHI": "phi", "PIT": "pit", "SDP": "sd", "SEA": "sea",
        "SFG": "sf", "STL": "stl", "TBD": "tb", "TEX": "tex", "TOR": "tor", "WSN": "wsh"}
# Stats API team id -> the Lahman franchise key used for every season
API_TEAM = {108: "ANA", 109: "ARI", 144: "ATL", 110: "BAL", 111: "BOS", 112: "CHC", 145: "CHW",
            113: "CIN", 114: "CLE", 115: "COL", 116: "DET", 146: "FLA", 117: "HOU", 118: "KCR",
            119: "LAD", 158: "MIL", 142: "MIN", 121: "NYM", 147: "NYY", 133: "OAK", 143: "PHI",
            134: "PIT", 135: "SDP", 136: "SEA", 137: "SFG", 138: "STL", 139: "TBD", 140: "TEX",
            141: "TOR", 120: "WSN"}

CATEGORIES = [
    ("hr", "Home Runs", 0, "\U0001F4A3"), ("rbi", "RBI", 0, "\U0001F3CF"),
    ("hits", "Hits", 0, "\U0001F3AF"), ("runs", "Runs", 0, "\U0001F3C3"),
    ("sb", "Stolen Bases", 0, "\U0001F4A8"), ("avg", "Batting Avg", 3, "\U0001F4CA"),
    ("w", "Wins", 0, "\U0001F947"), ("k", "Strikeouts", 0, "\U0001F525"),
    ("sv", "Saves", 0, "\U0001F512"), ("era", "ERA", 2, "\U0001F6E1️"),
]
BAT = ("G", "AB", "R", "H", "HR", "RBI", "SB")
PIT = ("W", "SV", "SO", "IPouts", "ER", "G")


def fetch(name, base=None):
    os.makedirs(RAW, exist_ok=True)
    cache = os.path.join(RAW, name)
    if not (os.path.exists(cache) and os.path.getsize(cache) > 0):
        req = urllib.request.Request((base or BASE) + "/" + name, headers={"User-Agent": "ebk/1.0"})
        with urllib.request.urlopen(req, timeout=120) as r, open(cache, "wb") as f:
            f.write(r.read())
    with open(cache, encoding="utf-8") as f:
        return list(csv.DictReader(f))


def fetch_json(url, name):
    d = os.path.join(RAW, "statsapi")
    os.makedirs(d, exist_ok=True)
    cache = os.path.join(d, name)
    if not (os.path.exists(cache) and os.path.getsize(cache) > 0):
        req = urllib.request.Request(url, headers={"User-Agent": "ebk/1.0"})
        with urllib.request.urlopen(req, timeout=180) as r, open(cache, "wb") as f:
            f.write(r.read())
    with open(cache, encoding="utf-8") as f:
        return json.load(f)


# Chadwick register: bbref/Lahman playerIDs <-> MLBAM ids.
REGISTER = "https://raw.githubusercontent.com/chadwickbureau/register/master/data"

def register_maps():
    to_mlbam, to_bbref = {}, {}
    for h in "0123456789abcdef":
        for r in fetch_register(h):
            bbref, mlbam = r.get("key_bbref"), r.get("key_mlbam")
            if bbref and mlbam:
                to_mlbam[bbref] = mlbam
                to_bbref[mlbam] = bbref
    return to_mlbam, to_bbref

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


def fielding_pos(p):
    """Lahman already rolls LF/CF/RF into OF; the Stats API doesn't."""
    return "OF" if p in ("LF", "CF", "RF", "OF") else p


class Seasons:
    """Per (playerId, year) sums shared by both sources."""
    def __init__(self):
        self.bat = defaultdict(lambda: defaultdict(float))
        self.pit = defaultdict(lambda: defaultdict(float))
        self.teamG = defaultdict(lambda: defaultdict(float))   # -> franchise -> games
        self.posG = defaultdict(lambda: defaultdict(float))    # -> fielding pos -> games
        self.names = {}
        self.lahman_names = {}
        self.mlbam = {}


def add_lahman(start, end, acc):
    teamFranch = {r["teamID"]: r["franchID"] for r in fetch("Teams.csv")}
    # Lahman playerIDs are NOT always bbref ids (jimenda01 is D'Angelo Jimenez
    # in Lahman but Dany Jimenez on bbref), and the register lookup and the
    # Stats API side are keyed by bbref. Re-key every Lahman row by People.csv's
    # own bbrefID so both sources share one id space.
    canon = {}
    for r in fetch("People.csv"):
        pid = canon[r["playerID"]] = r.get("bbrefID") or r["playerID"]
        # "A. J." -> "A.J." (bbref / Stats API spelling)
        first = re.sub(r"\b([A-Z])\. (?=[A-Z]\.)", r"\1.", r.get("nameFirst") or "")
        nm = (first + " " + (r.get("nameLast") or "")).strip()
        acc.names[pid] = acc.lahman_names[pid] = nm or pid
    for fname, cols, into in (("Batting.csv", BAT, acc.bat), ("Pitching.csv", PIT, acc.pit)):
        for r in fetch(fname):
            y = int(r["yearID"])
            if y < start or y > end: continue
            k = (canon.get(r["playerID"], r["playerID"]), y)
            for c in cols:
                into[k][c] += num(r[c])
            acc.teamG[k][teamFranch.get(r["teamID"], r["teamID"])] += num(r["G"])
    for r in fetch("Fielding.csv"):
        y = int(r["yearID"])
        if y < start or y > end or r["POS"] == "DH": continue
        acc.posG[(canon.get(r["playerID"], r["playerID"]), y)][fielding_pos(r["POS"])] += num(r["G"])


def add_statsapi(start, end, acc, to_bbref):
    ids = set()
    for y in range(start, end + 1):
        for group in ("hitting", "pitching"):
            url = (f"{STATSAPI}/stats?stats=season&group={group}&season={y}"
                   "&sportId=1&playerPool=ALL&limit=10000")
            ids.update(s["player"]["id"] for s in fetch_json(url, f"{group}_{y}.json")["stats"][0]["splits"])
    ids = sorted(ids)
    # The season endpoints give one combined line per player (team missing for
    # anyone traded), and their teamId filter only returns who finished the
    # year there. Year-by-year person stats carry one row per team played for.
    for i in range(0, len(ids), 150):
        chunk = ",".join(map(str, ids[i:i + 150]))
        url = (f"{STATSAPI}/people?personIds={chunk}"
               "&hydrate=stats(group=[hitting,pitching,fielding],type=[yearByYear])")
        name = "people_" + hashlib.sha1(f"{start}-{end}:{chunk}".encode()).hexdigest()[:16] + ".json"
        for person in fetch_json(url, name)["people"]:
            mid = str(person["id"])
            pid = to_bbref.get(mid) or "m" + mid
            acc.names[pid] = person.get("fullName") or pid
            if pid in acc.lahman_names and last_name(acc.lahman_names[pid]) != last_name(acc.names[pid]):
                print(f"  WARNING id {pid}: Lahman '{acc.lahman_names[pid]}' vs Stats API '{acc.names[pid]}'")
            acc.mlbam[pid] = mid
            for st in person.get("stats", []):
                group = st["group"]["displayName"]
                for s in st["splits"]:
                    y = int(s["season"])
                    if y < start or y > end or s.get("gameType") != "R" or s.get("sport", {}).get("id") != 1:
                        continue
                    fr = API_TEAM.get((s.get("team") or {}).get("id"))
                    if not fr:          # the team-less row is the multi-team total
                        continue
                    k, x = (pid, y), s["stat"]
                    if group == "hitting":
                        for c, src in (("G", "gamesPlayed"), ("AB", "atBats"), ("R", "runs"), ("H", "hits"),
                                       ("HR", "homeRuns"), ("RBI", "rbi"), ("SB", "stolenBases")):
                            acc.bat[k][c] += num(x.get(src))
                        acc.teamG[k][fr] += num(x.get("gamesPlayed"))
                    elif group == "pitching":
                        g = num(x.get("gamesPitched", x.get("gamesPlayed")))
                        for c, src in (("W", "wins"), ("SV", "saves"), ("SO", "strikeOuts"),
                                       ("IPouts", "outs"), ("ER", "earnedRuns")):
                            acc.pit[k][c] += num(x.get(src))
                        acc.pit[k]["G"] += g
                        acc.teamG[k][fr] += g
                    elif group == "fielding":
                        pos = (s.get("position") or {}).get("abbreviation")
                        if pos and pos != "DH":
                            acc.posG[k][fielding_pos(pos)] += num(x.get("gamesPlayed"))


def last_name(nm):
    """Accent/punctuation-free surname, for the Lahman <-> Stats API id check."""
    parts = [t for t in nm.split(" ") if t.rstrip(".") not in ("Jr", "Sr", "II", "III", "IV")]
    s = unicodedata.normalize("NFD", parts[-1] if parts else nm)
    return re.sub(r"[^a-z]", "", s.lower())


def primary_pos(field, skip=()):
    d = {p: g for p, g in field.items() if p not in skip}
    return max(d, key=d.get) if d else ""


def build():
    start, end = (int(sys.argv[1]), int(sys.argv[2])) if len(sys.argv) == 3 else (FIRST, LAST)
    to_mlbam, to_bbref = register_maps()
    print(f"Chadwick register: {len(to_mlbam):,} bbref<->MLBAM ids")

    acc = Seasons()
    if start <= LAHMAN_LAST:
        add_lahman(start, min(end, LAHMAN_LAST), acc)
    if end > LAHMAN_LAST:
        add_statsapi(max(start, LAHMAN_LAST + 1), end, acc, to_bbref)

    players = []
    cat_counts = defaultdict(int)
    for k in set(acc.bat) | set(acc.pit):
        pid, yr = k
        # Every franchise the player appeared for that season, most games
        # first — not just the top one, so a mid-season trade still registers
        # on both teams' grids.
        tg = acc.teamG[k]
        franchises = [f for f, _ in sorted(tg.items(), key=lambda kv: -kv[1]) if f in ESPN]
        if not franchises:
            continue
        b, p = acc.bat.get(k), acc.pit.get(k)
        field = acc.posG.get(k, {})
        ipouts = p["IPouts"] if p else 0
        # A pitcher is anyone with 10+ innings who fields mostly as a pitcher or
        # barely batted. Judging by at-bats alone turned every pre-2022 NL
        # starter into a "hitter" and dropped his pitching line.
        isPitcher = ipouts >= 30 and (primary_pos(field) == "P" or not b or b["AB"] < 50)
        twoWay = isPitcher and b is not None and b["AB"] >= 200      # Ohtani
        stats = {}
        if b and b["AB"] > 0:
            stats["hr"] = int(b["HR"]); stats["rbi"] = int(b["RBI"]); stats["hits"] = int(b["H"])
            stats["runs"] = int(b["R"]); stats["sb"] = int(b["SB"])
            stats["avg"] = round(b["H"] / b["AB"], 3)
        if isPitcher:
            stats["w"] = int(p["W"]); stats["k"] = int(p["SO"]); stats["sv"] = int(p["SV"])
            if ipouts > 0:
                stats["era"] = round(p["ER"] * 27.0 / ipouts, 2)
        for c in stats:
            cat_counts[c] += 1
        if twoWay:
            pos, grp = primary_pos(field, skip=("P",)) or "DH", "H"
        elif isPitcher:
            pos, grp = "P", "P"
        else:
            pos, grp = primary_pos(field) or "DH", "H"
        games = int(p["G"] if isPitcher and not twoWay else (b["G"] if b else p["G"]))
        rec = {
            "id": pid, "name": acc.names.get(pid, pid),
            "pos": pos, "grp": grp,
            "season": yr, "team": franchises[0], "games": games, "stats": stats,
        }
        if twoWay:
            rec["poss"] = [pos, "P"]
        if len(franchises) > 1:
            rec["teams"] = franchises
        mid = acc.mlbam.get(pid) or to_mlbam.get(pid)
        if mid:
            rec["headshot"] = HEADSHOT.format(mid)
        players.append(rec)

    players.sort(key=lambda r: (r["season"], r["name"], r["id"]))
    out = {
        "generated": date.today().isoformat(),
        "source": "Lahman / Chadwick baseball databank (through 2021) + MLB Stats API",
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
