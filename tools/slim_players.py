# Slims every public/data players.json, run AFTER any data rebuild:
#   python tools/slim_players.py
#
# Three transforms:
#   1. PRUNE: drop player-season records whose every stat is < 5 in absolute
#      value (bench rows no game meaningfully surfaces).
#   2. HEADSHOT TEMPLATE: the shared URL prefix is hoisted to a top-level
#      `hsPrefix`; each record keeps "~<suffix>". Rebuilt at load time by
#      EBKD.inflate() (public/js/teams.js).
#   3. SPARSE STATS: zero-valued stat entries are dropped; the union of stat
#      keys is stored as top-level `statCols` and EBKD.inflate() re-adds
#      missing keys as 0 — so the in-memory data is identical to before.
import gzip
import json
import os
from pathlib import Path

FILES = {
    "nfl": Path("public/data/players.json"),
    "nba": Path("public/data/nba/players.json"),
    "mlb": Path("public/data/mlb/players.json"),
    "nhl": Path("public/data/nhl/players.json"),
    "cfb": Path("public/data/cfb/players.json"),
    "soccer": Path("public/data/soccer/players.json"),
}
PRUNE_BELOW = 5


def max_stat(rec):
    vals = [abs(v) for v in rec.get("stats", {}).values() if isinstance(v, (int, float))]
    return max(vals, default=0)


def gz(b):
    return len(gzip.compress(b, 6))


def slim(sport, path):
    raw = path.read_bytes()
    d = json.loads(raw)
    recs = d["players"]
    n0 = len(recs)

    if d.get("slimmed"):
        print(f"{sport}: already slimmed, skipping")
        return

    # 1. prune
    kept = [r for r in recs if max_stat(r) >= PRUNE_BELOW]
    dropped = n0 - len(kept)
    d["players"] = recs = kept

    # prune people entries that no longer back any record (defensive: only if
    # the id scheme matches; otherwise leave people untouched)
    if isinstance(d.get("people"), dict) and d["people"]:
        stems = set()
        for r in recs:
            rid = str(r.get("id", ""))
            stems.add(rid)
            if "_" in rid:
                stems.add(rid.rsplit("_", 1)[0])
        match = sum(1 for k in d["people"] if k in stems)
        total_people = len(d["people"])
        if match / total_people >= 0.5:
            d["people"] = {k: v for k, v in d["people"].items() if k in stems}
            print(f"  people: {total_people} -> {len(d['people'])}")
        else:
            print(f"  people: id scheme mismatch ({match}/{total_people}), left untouched")

    # 2. headshot prefix
    shots = [r["headshot"] for r in recs if r.get("headshot")]
    prefix = os.path.commonprefix(shots) if shots else ""
    if len(prefix) >= 15:
        d["hsPrefix"] = prefix
        for r in recs:
            hs = r.get("headshot")
            if hs and hs.startswith(prefix):
                r["headshot"] = "~" + hs[len(prefix):]
    else:
        prefix = ""

    # 3. sparse stats
    cols = set()
    for r in recs:
        cols.update(r.get("stats", {}).keys())
    d["statCols"] = sorted(cols)
    zeros = 0
    for r in recs:
        s = r.get("stats", {})
        for k in [k for k, v in s.items() if v == 0]:
            del s[k]
            zeros += 1

    d["slimmed"] = 2  # matches the ?v=2 data-URL version in the game JS
    out = json.dumps(d, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    path.write_bytes(out)
    print(f"{sport}: {n0} -> {len(recs)} records (-{dropped}, {100*dropped/n0:.0f}%), "
          f"{len(raw)/1e6:.1f} -> {len(out)/1e6:.1f} MB raw, "
          f"{gz(raw)/1e6:.2f} -> {gz(out)/1e6:.2f} MB gz "
          f"(prefix {len(prefix)} chars, {zeros} zero stats dropped)")


for sport, path in FILES.items():
    slim(sport, path)
