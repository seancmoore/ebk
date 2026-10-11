#!/usr/bin/env python3
"""EBK · slim v4 payload for the big MLB / NHL datasets (lossless, browser copy only).

  python tools/slim_v4.py [mlb nhl]        # default: both

Reads public/data/<sport>/players.json (the full, tool-friendly file the builders write; build_grid_roster,
solvable.cjs, build_stat_lab.py and ebk-studio keep reading that one) and writes
public/data/<sport>/players.slim.json, which the game pages fetch. EBKD.inflate() (public/js/ebk-loader.js)
turns it back into the exact player records: same ids, names, seasons, teams, games, headshots and the same
stat KEY SETS (a key that is absent stays absent; zero stays zero).

Layout ("v": 4):
  ptab   [[playerId, name, headshotSuffix|0], ...]   once per player instead of once per season
  p      playerIndex per record (column); f = {field: column} for the per-record scalar fields (null = absent;
         "name" appears only for records whose spelling differs from ptab's)
  hs     headshot column: null = use ptab's, "" = none, string = this record's own suffix after hsPrefix
  st     one column per statCols entry, null = key absent
  Columnar on purpose: brotli compresses columns about 20% better than row arrays.
brotli sizes are printed so a data change that bloats the first-load payload shows up here.
"""
import json, os, sys, collections, brotli
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SCALARS = ("season", "seasonLabel", "pos", "grp", "team", "games", "teams", "poss")   # + name when it differs from ptab


def slim(sport):
    src = ROOT / "public" / "data" / sport / "players.json"
    dst = ROOT / "public" / "data" / sport / "players.slim.json"
    raw = src.read_bytes()
    d = json.loads(raw)
    recs = d["players"]
    known = set(SCALARS) | {"id", "name", "headshot", "stats"}
    extra = {k for r in recs for k in r} - known
    if extra:
        raise SystemExit("slim_v4: unexpected record fields %s - extend SCALARS" % sorted(extra))
    shots = [r["headshot"] for r in recs if r.get("headshot")]
    prefix = os.path.commonprefix(shots) if shots else ""
    cols = sorted({k for r in recs for k in r["stats"]})
    cidx = {k: i for i, k in enumerate(cols)}
    rfields = [f for f in SCALARS if any(f in r for r in recs)]
    # one default headshot per player: the most common suffix
    hs_by = collections.defaultdict(collections.Counter)
    for r in recs:
        if r.get("headshot"):
            hs_by[r["id"]][r["headshot"][len(prefix):]] += 1
    ptab, pidx = [], {}
    for r in recs:
        if r["id"] not in pidx:
            pidx[r["id"]] = len(ptab)
            top = hs_by[r["id"]].most_common(1)
            ptab.append([r["id"], r["name"], top[0][0] if top else 0])
    n = len(recs)
    fields = {f: [None] * n for f in rfields}
    names = [None] * n
    hsc = [None] * n
    st = [[None] * n for _ in cols]
    pcol = [0] * n
    for i, r in enumerate(recs):
        pi = pidx[r["id"]]
        pcol[i] = pi
        dflt = ptab[pi][2]
        for f in rfields:
            if f in r:
                fields[f][i] = r[f]
        if r["name"] != ptab[pi][1]:
            names[i] = r["name"]
        hs = r.get("headshot")
        if hs is None:
            hsc[i] = "" if dflt else None
        else:
            suf = hs[len(prefix):]
            hsc[i] = None if suf == dflt else suf
        for c, v in r["stats"].items():
            st[cidx[c]][i] = v
    if any(x is not None for x in names):
        fields["name"] = names
    out = {k: v for k, v in d.items() if k not in ("players", "people")}
    out.update({"v": 4, "n": n, "hsPrefix": prefix, "statCols": cols, "ptab": ptab, "p": pcol, "f": fields, "hs": hsc, "st": st})
    ob = json.dumps(out, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    dst.write_bytes(ob)
    print("%s: %d rows, %d players | full %.2f MB (br %d KB) -> slim %.2f MB (br %d KB)" % (
        sport, n, len(ptab), len(raw) / 1e6, len(brotli.compress(raw, quality=9)) // 1024,
        len(ob) / 1e6, len(brotli.compress(ob, quality=9)) // 1024))


if __name__ == "__main__":
    for s in (sys.argv[1:] or ["mlb", "nhl"]):
        slim(s)
