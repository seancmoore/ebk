"""
mlb_headshots.py - verified MLB headshots for pre-2000 player-seasons (run after build_mlb.py).
The Chadwick register maps bbref -> MLBAM id. Before keeping a photo for a pre-2000 player we check
(1) the MLB Stats API person for that MLBAM id has the same surname as our player and a debut year
<= his first season in our data, and (2) the plain headshot URL (no generic fallback) returns 200:
MLB's static host answers 404 when it has no photo and the d_people:generic variant would paint a
silhouette. Anything failing either check loses its headshot field (the UI shows initials).
Cache: raw/mlb/headshot_probe.json {mlbam: ok|bad-reason}
"""
import json, os, re, unicodedata, urllib.request, urllib.error
from concurrent.futures import ThreadPoolExecutor
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.normpath(os.path.join(HERE, "..", "public", "data", "mlb", "players.json"))
CACHE = os.path.join(HERE, "raw", "mlb", "headshot_probe.json")
CUT = 1999
PLAIN = "https://img.mlbstatic.com/mlb-photos/image/upload/w_213,q_auto:best/v1/people/{}/headshot/67/current"


def ln(nm):
    parts = [t for t in nm.split(" ") if t.rstrip(".") not in ("Jr", "Sr", "II", "III", "IV")]
    s = unicodedata.normalize("NFD", parts[-1] if parts else nm)
    return re.sub(r"[^a-z]", "", s.lower())


def getj(u):
    for _ in range(3):
        try:
            return json.load(urllib.request.urlopen(urllib.request.Request(u, headers={"User-Agent": "Mozilla/5.0"}), timeout=60))
        except Exception:
            pass
    return None


def head(u):
    for _ in range(3):
        try:
            return urllib.request.urlopen(urllib.request.Request(u, method="HEAD", headers={"User-Agent": "Mozilla/5.0"}), timeout=20).status
        except urllib.error.HTTPError as e:
            return e.code
        except Exception:
            pass
    return 0


def main():
    d = json.load(open(OUT, encoding="utf8"))
    probe = json.load(open(CACHE)) if os.path.exists(CACHE) else {}
    old = {}
    for r in d["players"]:
        if r["season"] <= CUT and r.get("headshot"):
            m = re.search(r"/people/(\d+)/", r["headshot"])
            if m:
                old.setdefault(m.group(1), []).append(r)
    todo = [m for m in old if m not in probe]
    print("pre-2000 players with register id", len(old), "to probe", len(todo))
    # 1) identity check via Stats API in chunks
    ident = {}
    for i in range(0, len(todo), 150):
        chunk = todo[i:i + 150]
        j = getj("https://statsapi.mlb.com/api/v1/people?personIds=" + ",".join(chunk))
        for p in (j or {}).get("people", []):
            ident[str(p["id"])] = p
    def work(m):
        p = ident.get(m)
        if not p:
            return m, "no-api-person"
        rs = old[m]
        if ln(p.get("fullName", "")) != ln(rs[0]["name"]):
            return m, "name-mismatch:%s" % p.get("fullName")
        deb = (p.get("mlbDebutDate") or "")[:4]
        if deb and int(deb) > min(r["season"] for r in rs):
            return m, "debut-after-season"
        return m, "ok" if head(PLAIN.format(m)) == 200 else "no-photo"
    with ThreadPoolExecutor(4) as ex:
        for n, (m, v) in enumerate(ex.map(work, todo)):
            probe[m] = v
            if n % 500 == 0:
                print("probed", n); json.dump(probe, open(CACHE, "w"))
    json.dump(probe, open(CACHE, "w"))
    kept = dropped = 0
    for m, rs in old.items():
        for r in rs:
            if probe.get(m) == "ok":
                kept += 1
            else:
                r.pop("headshot", None); dropped += 1
    json.dump(d, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    import collections
    print("kept", kept, "dropped", dropped, collections.Counter(v.split(":")[0] for v in probe.values()))


if __name__ == "__main__":
    main()
