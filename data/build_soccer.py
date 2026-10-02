"""
build_soccer.py — Premier League player-season dataset for EBK (stdlib only).
Source: vaastav/Fantasy-Premier-League (FPL season data, keyless GitHub CSVs).
Writes public/data/soccer/players.json + generated public/js/soccer-teams.js.

Usage: python build_soccer.py
"""
import os, sys, csv, io, json, re, unicodedata, urllib.request, urllib.error
from concurrent.futures import ThreadPoolExecutor
from datetime import date

SEASONS = ["2016-17", "2017-18", "2018-19", "2019-20", "2020-21",
           "2021-22", "2022-23", "2023-24", "2024-25", "2025-26"]
HERE = os.path.dirname(os.path.abspath(__file__))
RAW = os.path.join(HERE, "raw", "soccer")
OUT = os.path.normpath(os.path.join(HERE, "..", "public", "data", "soccer", "players.json"))
TEAMS_JS = os.path.normpath(os.path.join(HERE, "..", "public", "js", "soccer-teams.js"))
BASE = "https://raw.githubusercontent.com/vaastav/Fantasy-Premier-League/master/data"

POS = {"1": "GK", "2": "DEF", "3": "MID", "4": "FWD"}
CATEGORIES = [
    ("goals", "Goals", 0, "⚽"), ("assists", "Assists", 0, "\U0001F170️"),
    ("minutes", "Minutes", 0, "⏱️"), ("cs", "Clean Sheets", 0, "\U0001F9E4"),
    ("saves", "Saves", 0, "\U0001F9F1"), ("gc", "Goals Conceded", 0, "\U0001F945"),
    ("bonus", "Bonus Points", 0, "⭐"), ("pts", "FPL Points", 0, "\U0001F3C6"),
]


def fetch_csv(url, cache):
    os.makedirs(RAW, exist_ok=True)
    p = os.path.join(RAW, cache)
    if not (os.path.exists(p) and os.path.getsize(p) > 0):
        req = urllib.request.Request(url, headers={"User-Agent": "ebk/1.0"})
        with urllib.request.urlopen(req, timeout=90) as r, open(p, "wb") as f:
            f.write(r.read())
    with open(p, encoding="utf-8") as f:
        return list(csv.DictReader(f))


def num(x):
    try: return int(float(x))
    except (TypeError, ValueError): return 0


def fetch_csv_opt(url, cache):
    try:
        return fetch_csv(url, cache)
    except Exception:
        return []


# Player photos. The PL's 2025 site moved them to premierleague25/ and the
# legacy p{code} path 403s for many current players (Alisson, Wirtz); the new
# path lacks a few older ones. HEAD both once per code (cached), prefer the
# new one, else drop the field so the site avatar shows instead of a 404.
PHOTO_NEW = "https://resources.premierleague.com/premierleague25/photos/players/110x140/{}.png"
PHOTO_OLD = "https://resources.premierleague.com/premierleague/photos/players/110x140/p{}.png"
PHOTO_CACHE = os.path.join(RAW, "headshot_probe.json")


def head(url):
    """[status, content-length] for a HEAD request, or None on a network error."""
    req = urllib.request.Request(url, method="HEAD", headers={"User-Agent": "ebk/1.0", "Accept": "*/*"})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return [r.status, int(r.headers.get("Content-Length") or 0)]
    except urllib.error.HTTPError as exc:
        return [exc.code, 0]
    except Exception:  # noqa: BLE001 — transient; leave uncached, retry next build
        return None


def photos(codes):
    """code -> best photo url (or None)."""
    cache = {}
    if os.path.exists(PHOTO_CACHE):
        with open(PHOTO_CACHE, encoding="utf-8") as f:
            cache = json.load(f)
    urls = [t.format(c) for c in codes for t in (PHOTO_NEW, PHOTO_OLD)]
    todo = sorted(u for u in set(urls) if u not in cache)
    if todo:
        print(f"  probing {len(todo):,} photo urls ...")
        with ThreadPoolExecutor(max_workers=8) as pool:
            for u, res in zip(todo, pool.map(head, todo)):
                if res is not None:
                    cache[u] = res
        with open(PHOTO_CACHE, "w", encoding="utf-8") as f:
            json.dump(cache, f, indent=0, sort_keys=True)
    out = {}
    for c in codes:
        out[c] = next((t.format(c) for t in (PHOTO_NEW, PHOTO_OLD)
                       if cache.get(t.format(c), [0])[0] == 200), None)
    return out


def fold(s):
    s = unicodedata.normalize("NFD", (s or "").replace("-", " "))
    return re.sub(r"[^a-z ]", "", "".join(c for c in s if not unicodedata.combining(c)).lower())


def aka(name, web):
    """FPL's web_name when it's a name fans search by that isn't already a
    word of the legal name (Casemiro, Fabinho, Jorginho), else None."""
    if not web or "." in web or " " in web.strip():
        return None
    w = fold(web).split()
    return web if w and not set(w) <= set(fold(name).split()) else None


def build():
    # master list covers 2016-17..2023-24; per-season teams.csv covers the rest
    mtl = {}
    for row in fetch_csv_opt(BASE + "/master_team_list.csv", "master_team_list.csv"):
        mtl.setdefault(row["season"], {})[row["team"]] = row["team_name"]

    clubs = {}     # team_code -> {name, logo}
    players = []
    cat_counts = {k: 0 for k, *_ in CATEGORIES}
    for season in SEASONS:
        endyr = int(season.split("-")[0]) + 1
        teams = mtl.get(season) or {t["id"]: t["name"] for t in fetch_csv_opt(f"{BASE}/{season}/teams.csv", f"teams_{season}.csv")}
        rows = fetch_csv(f"{BASE}/{season}/players_raw.csv", f"players_raw_{season}.csv")
        kept = 0
        for p in rows:
            if num(p.get("minutes")) <= 0:
                continue
            code = p["team_code"]
            nm = teams.get(p["team"], "")
            if not nm:
                continue
            clubs[code] = {"name": nm, "logo": f"https://resources.premierleague.com/premierleague/badges/100/t{code}.png"}
            pos = POS.get(p["element_type"], "MID")
            stats = {
                "goals": num(p["goals_scored"]), "assists": num(p["assists"]),
                "minutes": num(p["minutes"]), "cs": num(p["clean_sheets"]),
                "saves": num(p["saves"]), "gc": num(p["goals_conceded"]),
                "bonus": num(p["bonus"]), "pts": num(p["total_points"]),
            }
            for k in stats:
                cat_counts[k] += 1
            name = (p.get("first_name", "") + " " + p.get("second_name", "")).strip() or p.get("web_name")
            rec = {
                "id": p["code"], "name": name, "pos": pos, "grp": pos,
                "season": endyr, "seasonLabel": season, "team": code, "games": 0,
                "stats": stats,
            }
            a = aka(name, p.get("web_name"))
            if a:
                rec["aka"] = a
            players.append(rec)
            kept += 1
        print(f"  {season}: {kept} players")

    best = photos(sorted({r["id"] for r in players}))
    for r in players:
        if best[r["id"]]:
            r["headshot"] = best[r["id"]]
    print(f"  photos: {sum(1 for u in best.values() if u and '25/' in u):,} new path, "
          f"{sum(1 for u in best.values() if u and '/p' in u.rsplit('110x140', 1)[1]):,} legacy, "
          f"{sum(1 for u in best.values() if not u):,} none (of {len(best):,})")

    players.sort(key=lambda r: (r["season"], r["name"] or ""))
    out = {
        "generated": date.today().isoformat(), "source": "Fantasy Premier League (vaastav/Fantasy-Premier-League)",
        "sport": "soccer", "seasons": [SEASONS[0], SEASONS[-1]],
        "categories": [{"key": k, "label": l, "decimals": d, "icon": i} for k, l, d, i in CATEGORIES],
        "players": players, "people": {},
    }
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))

    F = sorted(clubs.items(), key=lambda kv: kv[1]["name"])
    arr = ",\n".join('    {key:%s,name:%s,logo:%s}' % (json.dumps(c), json.dumps(v["name"]), json.dumps(v["logo"])) for c, v in F)
    js = ("/* generated by build_soccer.py — Premier League clubs + badges */\n"
          "window.SOCCER=(function(){\n  var F=[\n" + arr + "\n  ];\n"
          "  var byKey={};F.forEach(function(f){byKey[f.key]=f;});\n"
          "  return {franchises:F, keyOf:function(a){return a;},\n"
          "    name:function(a){return byKey[a]?byKey[a].name:a;},\n"
          "    logo:function(a){return byKey[a]?byKey[a].logo:'';}};\n})();\n")
    with open(TEAMS_JS, "w", encoding="utf-8") as f:
        f.write(js)

    print(f"\nWrote {len(players):,} player-seasons -> {OUT} ({os.path.getsize(OUT)/1e6:.1f} MB)")
    print(f"Generated {TEAMS_JS} ({len(F)} clubs)")
    for k, l, *_ in CATEGORIES:
        print(f"  {l:<16} {cat_counts[k]:>6,}")


if __name__ == "__main__":
    build()
