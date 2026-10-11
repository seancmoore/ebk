"""
nhl_headshots.py - verified NHL headshots for pre-2001 player-seasons (run after build_nhl.py).
assets.nhle.com answers a missing mug with a 302 to default-skater.png and a real one with 200, so
HEAD tells them apart. For every player with a pre-2001 row we try the row's own season/team URL
(newest first, max 3), then .../mugs/nhl/latest/{id}.png; the first 200 is used for all the
player's pre-2001 rows; otherwise the headshot is dropped (the UI falls back to initials).
The id in the URL is the NHL playerId, so a 200 can only be that person. Cached in raw/nhl/headshot_probe.json.
"""
import json, os, urllib.request, urllib.error
from concurrent.futures import ThreadPoolExecutor
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.normpath(os.path.join(HERE, "..", "public", "data", "nhl", "players.json"))
CACHE = os.path.join(HERE, "raw", "nhl", "headshot_probe.json")
CUT = 2000


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *a, **k):
        return None


op = urllib.request.build_opener(NoRedirect)


def head(url):
    for _ in range(3):
        try:
            return op.open(urllib.request.Request(url, method="HEAD", headers={"User-Agent": "Mozilla/5.0"}), timeout=20).status
        except urllib.error.HTTPError as e:
            return e.code
        except Exception:
            pass
    return 0


def main():
    d = json.load(open(OUT, encoding="utf8"))
    probe = json.load(open(CACHE)) if os.path.exists(CACHE) else {}
    by = {}
    for r in d["players"]:
        if r["season"] <= CUT:
            by.setdefault(r["id"], []).append(r)
    todo = [i for i in by if i not in probe]

    def work(i):
        rs = sorted(by[i], key=lambda r: -r["season"])
        urls = []
        for r in rs:
            u = r.get("headshot")
            if u and u not in urls:
                urls.append(u)
            if len(urls) >= 3:
                break
        urls.append("https://assets.nhle.com/mugs/nhl/latest/%s.png" % i[1:])
        for u in urls:
            if head(u) == 200:
                return i, u
        return i, None

    with ThreadPoolExecutor(4) as ex:
        for n, (i, u) in enumerate(ex.map(work, todo)):
            probe[i] = u
            if n % 500 == 0:
                print("probed", n, "of", len(todo)); json.dump(probe, open(CACHE, "w"))
    json.dump(probe, open(CACHE, "w"))
    kept = dropped = 0
    for i, rs in by.items():
        u = probe.get(i)
        for r in rs:
            if u:
                r["headshot"] = u; kept += 1
            else:
                r.pop("headshot", None); dropped += 1
    json.dump(d, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    print("pre-2001 rows with verified headshot", kept, "dropped", dropped, "players", len(by))


if __name__ == "__main__":
    main()
