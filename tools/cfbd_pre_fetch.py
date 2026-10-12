"""Caches CollegeFootballData player season stats 2008-2013 (offense; CFBD has no defensive stats before 2016) and the
FBS team list for 2004-2013 into data/raw/cfb_pre/. ~40 API calls. Used (a) to know which ESPN team ids were FBS in a
pre-2014 season and (b) as an independent check on the ESPN-derived pre-window rows."""
import json, os, time, urllib.request
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "data", "raw", "cfb_pre")
KEY = open(os.path.join(HERE, "..", "data", "raw", "cfbd.key")).read().strip()


def get(path):
    return json.load(urllib.request.urlopen(urllib.request.Request("https://api.collegefootballdata.com" + path, headers={"Authorization": "Bearer " + KEY}), timeout=120))


for y in range(2004, 2014):
    f = os.path.join(OUT, "teams_%d.json" % y)
    if not os.path.exists(f):
        json.dump(get("/teams/fbs?year=%d" % y), open(f, "w")); time.sleep(0.3)
for y in range(2008, 2014):
    for cat in ("passing", "rushing", "receiving"):
        f = os.path.join(OUT, "%s_%d.json" % (cat, y))
        if not os.path.exists(f):
            json.dump(get("/stats/player/season?year=%d&category=%s" % (y, cat)), open(f, "w")); time.sleep(0.3)
print("done")
