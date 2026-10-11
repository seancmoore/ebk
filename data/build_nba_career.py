"""
build_nba_career.py - PRE-2002 NBA player-seasons for EBK (stdlib only).

players.json (data/build_nba.py) starts at 2001-02. This fills the earlier
seasons (end year < 2002) for every athlete id already in players.json, from
ESPN's athlete stats endpoint (regular season Totals + Averages tables).

Output: data/raw/career/nba.json = {"sport":"nba","through":2001,"players":[...]}
Records mirror build_nba.py: season TOTALS for pts/reb/ast/stl/blk/tpm, per-game
= round(total/games, 1); `team` = club with most games that season (ties:
alphabetical, like pandas mode); `teams` (date order) only when >1 club;
pos/grp copied from the player's earliest row in players.json.

Usage: python build_nba_career.py            # fetch (resumable cache) + build
       python build_nba_career.py --build    # rebuild from cache only
Cache: data/raw/espn_nba_career/{id}.json (throttled 0.3s, 2 workers).
"""
import os, sys, json, time, threading, urllib.request, urllib.error
from concurrent.futures import ThreadPoolExecutor

HERE = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.join(HERE, "raw", "espn_nba_career")
MAIN = os.path.normpath(os.path.join(HERE, "..", "public", "data", "nba", "players.json"))
OUT = os.path.join(HERE, "raw", "career", "nba.json")
URL = "https://site.web.api.espn.com/apis/common/v3/sports/basketball/nba/athletes/{id}/stats"
THROUGH = 2001
DELAY = 0.3

# ESPN team slug -> club code as used in players.json (era-correct, like NJ/SEA
# there; nba-teams.js folds NJ->BKN, SEA->OKC, NOH->NO). Vancouver folds to MEM
# (nba-teams.js has no VAN); old Charlotte Hornets are CHA.
SLUG = {
    "atlanta-hawks": "ATL", "boston-celtics": "BOS", "brooklyn-nets": "NJ",
    "new-jersey-nets": "NJ", "charlotte-hornets": "CHA", "charlotte-bobcats": "CHA",
    "chicago-bulls": "CHI", "cleveland-cavaliers": "CLE", "dallas-mavericks": "DAL",
    "denver-nuggets": "DEN", "detroit-pistons": "DET", "golden-state-warriors": "GS",
    "houston-rockets": "HOU", "indiana-pacers": "IND", "la-clippers": "LAC",
    "los-angeles-clippers": "LAC", "san-diego-clippers": "LAC", "los-angeles-lakers": "LAL",
    "memphis-grizzlies": "MEM", "vancouver-grizzlies": "MEM", "miami-heat": "MIA",
    "milwaukee-bucks": "MIL", "minnesota-timberwolves": "MIN",
    "new-orleans-pelicans": "NO", "new-orleans-hornets": "NO",
    "new-york-knicks": "NY", "oklahoma-city-thunder": "SEA", "seattle-supersonics": "SEA",
    "orlando-magic": "ORL", "philadelphia-76ers": "PHI", "phoenix-suns": "PHX",
    "portland-trail-blazers": "POR", "san-antonio-spurs": "SA", "sacramento-kings": "SAC",
    "kansas-city-kings": "SAC", "toronto-raptors": "TOR", "utah-jazz": "UTAH",
    "washington-wizards": "WSH", "washington-bullets": "WSH",
}
_lock = threading.Lock()
_last = [0.0]


def load_main():
    d = json.load(open(MAIN, encoding="utf-8"))
    first = {}
    for r in d["players"]:           # file is sorted by (season, name): first hit = earliest
        first.setdefault(r["id"], r)
    return first


def fetch(aid):
    path = os.path.join(CACHE, f"{aid}.json")
    if os.path.exists(path) and os.path.getsize(path) > 0:
        return
    for attempt in range(4):
        with _lock:
            wait = _last[0] + DELAY - time.time()
            if wait > 0:
                time.sleep(wait)
            _last[0] = time.time()
        try:
            req = urllib.request.Request(URL.format(id=aid), headers={"User-Agent": "ebk/1.0"})
            with urllib.request.urlopen(req, timeout=30) as r:
                d = json.loads(r.read())
            keep = {"categories": [c for c in d.get("categories", []) if c["name"] in ("totals", "averages")]}
            with open(path, "w", encoding="utf-8") as f:
                json.dump(keep, f, separators=(",", ":"))
            return
        except urllib.error.HTTPError as e:
            if e.code == 404:
                with open(path, "w") as f:
                    f.write('{"categories":[]}')
                return
            time.sleep(2 * (attempt + 1))
        except Exception:
            time.sleep(2 * (attempt + 1))
    print("  ! failed", aid)


def num(s):
    s = (s or "").replace(",", "").strip()
    try:
        return float(s)
    except ValueError:
        return None


def parse(aid, rec, unknown):
    """-> list of season records (end year <= THROUGH)."""
    path = os.path.join(CACHE, f"{aid}.json")
    if not os.path.exists(path):
        return []
    cats = {c["name"]: c for c in json.load(open(path, encoding="utf-8")).get("categories", [])}
    if "totals" not in cats or "averages" not in cats:
        return []
    tl, al = cats["totals"]["labels"], cats["averages"]["labels"]
    avg = {}
    for s in cats["averages"]["statistics"]:
        avg[(s["season"]["year"], s["teamSlug"])] = s
    by_year = {}
    for s in cats["totals"]["statistics"]:
        y = s["season"]["year"]
        if y > THROUGH:
            continue
        by_year.setdefault(y, []).append(s)
    out = []
    for y in sorted(by_year):
        rows = by_year[y]
        team_rows = [r for r in rows if " " not in r["teamSlug"]]
        tot_rows = [r for r in rows if " " in r["teamSlug"]]
        top = tot_rows[0] if tot_rows else (team_rows[0] if len(team_rows) == 1 else None)
        synth = None
        if top is None and team_rows:
            # no Totals row (ESPN omits it when the extra club played 0 games): sum the club rows
            def add(lbl, labels, key):
                return sum(num(r[key][labels.index(lbl)]) or 0 for r in team_rows)
            tpm_sum = sum(int(num(r["stats"][tl.index("3PT")].split("-")[0]) or 0) for r in team_rows if "-" in r["stats"][tl.index("3PT")])
            st = ["0"] * len(tl)
            for l in ("PTS", "REB", "AST", "STL", "BLK"):
                st[tl.index(l)] = str(add(l, tl, "stats"))
            st[tl.index("3PT")] = f"{tpm_sum}-0"
            synth = {"teamSlug": "SYNTH Totals", "stats": st}
            top = synth
        if top is None:
            unknown.add(("no-total", aid, y))
            continue

        def g(lbl, row, labels):
            return row["stats"][labels.index(lbl)]

        if synth is not None:
            arow = {"stats": ["0"] * len(al)}
            arow["stats"][al.index("GP")] = str(sum(int(num(avg[(y, r["teamSlug"])]["stats"][al.index("GP")]) or 0) for r in team_rows if (y, r["teamSlug"]) in avg))
        else:
            arow = avg.get((y, top["teamSlug"]))
        if arow is None:
            unknown.add(("no-avg", aid, y))
            continue
        games = int(num(g("GP", arow, al)) or 0)
        if games <= 0:
            continue
        codes, gp = [], {}
        for r in team_rows:
            c = SLUG.get(r["teamSlug"])
            if c is None:
                unknown.add(("slug", r["teamSlug"]))
                c = "??"
            ar = avg.get((y, r["teamSlug"]))
            n = int(num(g("GP", ar, al)) or 0) if ar else 0
            if ar and n == 0:
                continue          # 0-game stint (inactive after a trade): not a club he played for
            codes.append(c)
            gp[c] = gp.get(c, 0) + n
        teams = list(dict.fromkeys(codes))
        best = max(gp.values()) if gp else 0
        team = sorted(c for c in gp if gp[c] == best)[0] if gp else ""

        def tv(l):
            return int(round(num(g(l, top, tl)) or 0))

        tp = g("3PT", top, tl)
        tpm = int(num(tp.split("-")[0]) or 0) if "-" in tp else 0
        pts, reb, ast = tv("PTS"), tv("REB"), tv("AST")
        r = {
            "id": rec["id"], "name": rec["name"], "pos": rec["pos"], "grp": rec["grp"],
            "season": y, "seasonLabel": f"{y-1}-{str(y)[2:]}", "team": team,
            "games": games,
            "stats": {"pts": pts, "reb": reb, "ast": ast, "stl": tv("STL"), "blk": tv("BLK"), "tpm": tpm,
                      "ppg": round(pts / games, 1), "rpg": round(reb / games, 1), "apg": round(ast / games, 1)},
        }
        if len(teams) > 1:
            r["teams"] = teams
        out.append(r)
    return out


def main():
    os.makedirs(CACHE, exist_ok=True)
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    first = load_main()
    ids = sorted(first, key=lambda i: (first[i]["season"], float(i)))
    if "--build" not in sys.argv:
        todo = [i[:-2] if i.endswith(".0") else i for i in ids]
        with ThreadPoolExecutor(2) as ex:
            for n, _ in enumerate(ex.map(fetch, todo)):
                if n % 200 == 0:
                    print(f"  fetched {n}/{len(todo)}", flush=True)
    rows, covered, unknown = [], 0, set()
    for i in ids:
        aid = i[:-2] if i.endswith(".0") else i
        rs = parse(aid, first[i], unknown)
        if rs:
            covered += 1
        rows += rs
    rows.sort(key=lambda r: (r["season"], r["name"]))
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump({"sport": "nba", "through": THROUGH, "players": rows}, f, ensure_ascii=False, separators=(",", ":"))
    print(f"players in main {len(ids)}, with pre-2002 career {covered}, rows {len(rows)}, "
          f"{os.path.getsize(OUT)/1e6:.2f} MB, unknown {sorted(unknown, key=str)[:30]}")


if __name__ == "__main__":
    main()
