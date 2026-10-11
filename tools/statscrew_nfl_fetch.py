"""Caches Statscrew NFL team-season pages (roster with GP/GS, and stats tables) for 1983-1998 into data/raw/statscrew_nfl/.
One worker, 0.5 s throttle, resumable. Used by data/build_nfl_career.py to find seasons ESPN omitted and to reconcile games."""
import os, re, sys, time, urllib.request
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data", "raw", "statscrew_nfl")
os.makedirs(OUT, exist_ok=True)


def get(url):
    for i in range(4):
        try:
            return urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"}), timeout=40).read().decode("utf8", "ignore")
        except Exception as e:
            time.sleep(2 * (i + 1))
    return None


n = 0
for y in range(1983, 1999):
    yp = os.path.join(OUT, "year_%d.html" % y)
    if not os.path.exists(yp):
        h = get("https://www.statscrew.com/football/l-NFL/y-%d" % y)
        if h: open(yp, "w", encoding="utf8").write(h)
        time.sleep(0.5)
    h = open(yp, encoding="utf8").read() if os.path.exists(yp) else ""
    teams = sorted(set(re.findall(r'football/stats/t-([A-Za-z]+)/y-%d"' % y, h)))
    for t in teams:
        for kind, url in (("roster", "https://www.statscrew.com/football/roster/t-%s/y-%d"), ("stats", "https://www.statscrew.com/football/stats/t-%s/y-%d")):
            f = os.path.join(OUT, "%s_%s_%d.html" % (kind, t, y))
            if os.path.exists(f) and os.path.getsize(f) > 2000: continue
            h2 = get(url % (t, y))
            if h2: open(f, "w", encoding="utf8").write(h2); n += 1
            time.sleep(0.5)
    print("year", y, len(teams), "teams", flush=True)
print("DONE fetched", n)
