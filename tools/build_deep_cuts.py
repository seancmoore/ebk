#!/usr/bin/env python3
"""EBK Deep Cut: build the daily-question schedule.

Reads every data/deep-cuts/bank_*.json (see data/deep-cuts/SPEC.md), validates
each question, and writes public/data/deep-cuts.json: one question per ET day
starting at START.

Schedule rules
  * Past days never move. Every date up to tomorrow (ET) keeps the question it
    already had in the published file, so rebuilding after adding or fixing
    questions only reshuffles the future.
  * Difficulty follows the week, easy early and hardest on Saturday:
    Mon 2, Tue 3, Wed 3, Thu 2, Fri 3, Sat 4, Sun 3 (nearest level if a pool runs dry).
  * No sport on two days in a row; sports are drawn in proportion to how many
    questions they have left, with a seeded RNG so a rebuild is reproducible.
  * The answer payload is lightly obfuscated (base64 + reversal). It stops a
    casual peek at the JSON, nothing more: the game is honor-system, like the grid.

Usage:  python tools/build_deep_cuts.py [--check]   (--check validates only)
"""
import base64
import datetime as dt
import glob
import json
import os
import random
import re
import sys
import unicodedata

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BANK_GLOB = os.path.join(ROOT, "data", "deep-cuts", "bank_*.json")
OUT = os.path.join(ROOT, "public", "data", "deep-cuts.json")
START = "2026-09-23"
SEED = 20260923
WEEK_DIFF = {0: 2, 1: 3, 2: 3, 3: 2, 4: 3, 5: 4, 6: 3}   # Monday = 0
SPORTS = {"nfl", "nba", "mlb", "nhl", "cfb", "cbb", "soccer"}
TYPES = {"player", "player-season", "number", "team", "coach", "year", "venue", "nickname", "other"}


def norm(s):
    """Must match norm() in public/js/deep-cut.js."""
    s = unicodedata.normalize("NFD", str(s))
    s = "".join(c for c in s if unicodedata.category(c) != "Mn").lower()
    s = s.replace("&", " and ")
    s = re.sub(r"[^a-z0-9 ]+", " ", s)
    s = re.sub(r"\s+", " ", s).strip()
    s = re.sub(r"^the ", "", s)
    return s


def et_today():
    # ET without tz database: UTC-4 in (roughly) Mar-Nov, UTC-5 otherwise. Only
    # used to decide which days are "already live", so an hour of slop is harmless.
    now = dt.datetime.now(dt.timezone.utc).replace(tzinfo=None)
    off = 4 if 3 <= now.month <= 10 else 5
    return (now - dt.timedelta(hours=off)).date()


def validate(q, errors, warnings):
    qid = q.get("id", "?")
    need = ["id", "sport", "type", "difficulty", "q", "answer", "kind", "hints", "fact", "source"]
    for k in need:
        if k not in q or q[k] in (None, ""):
            errors.append(f"{qid}: missing {k}")
            return False
    if q["sport"] not in SPORTS:
        errors.append(f"{qid}: bad sport {q['sport']}")
    if q["type"] not in TYPES:
        warnings.append(f"{qid}: unusual type {q['type']}")
    if q["difficulty"] not in (2, 3, 4):
        warnings.append(f"{qid}: difficulty {q['difficulty']} -> clamped")
        q["difficulty"] = min(4, max(2, int(q["difficulty"] or 3)))
    if q["kind"] == "number":
        if not isinstance(q.get("num"), (int, float)):
            errors.append(f"{qid}: number question without numeric num")
            return False
    elif q["kind"] == "text":
        acc = [norm(a) for a in (q.get("accept") or []) if norm(a)]
        acc.append(norm(q["answer"]))
        q["accept"] = sorted(set(acc))
    else:
        errors.append(f"{qid}: bad kind {q['kind']}")
        return False
    if not isinstance(q["hints"], list) or len(q["hints"]) < 2:
        errors.append(f"{qid}: needs 2 hints")
        return False
    # the answer must not leak into the question or the hints
    if q["kind"] == "text":
        # any accepted spelling counts: a hint that says "The Glove" hands over
        # a string the matcher will take as correct on the next guess
        keys = {norm(q["answer"])} | set(q["accept"])
        for where, txt in [("q", q["q"])] + [(f"hint{i+1}", h) for i, h in enumerate(q["hints"])]:
            t = " " + norm(txt) + " "
            for k in keys:
                if len(k) >= 4 and (" " + k + " ") in t:
                    errors.append(f"{qid}: accepted answer '{k}' leaks into {where}")
    else:
        n = q["num"]
        sval = str(int(n)) if float(n).is_integer() else str(n)
        if re.search(r"(?<![\d.])" + re.escape(sval) + r"(?![\d.])", q["q"]) and q["type"] != "year":
            warnings.append(f"{qid}: number {sval} appears in the question text (check)")
    for k in ("q", "answer", "fact"):
        if "—" in q[k]:
            q[k] = q[k].replace(" — ", ", ").replace("—", ", ")
    q["hints"] = [h.replace(" — ", ", ").replace("—", ", ") for h in q["hints"][:2]]
    if len(q["q"]) > 260:
        warnings.append(f"{qid}: long question ({len(q['q'])} chars)")
    return True


def pack(q):
    payload = {
        "a": q["answer"],
        "k": q["kind"],
        "n": q.get("num") if q["kind"] == "number" else None,
        "acc": q.get("accept", []) if q["kind"] == "text" else [],
        "h": q["hints"],
        "f": q["fact"],
        "src": q["source"],
    }
    raw = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    return base64.b64encode(raw).decode("ascii")[::-1]


def main():
    check_only = "--check" in sys.argv
    errors, warnings, qs = [], [], []
    for path in sorted(glob.glob(BANK_GLOB)):
        try:
            with open(path, encoding="utf-8") as fh:
                items = json.load(fh)
        except Exception as e:
            errors.append(f"{os.path.basename(path)}: unreadable ({e})")
            continue
        for q in items:
            if q.get("drop"):
                continue
            if validate(q, errors, warnings):
                qs.append(q)

    ids = {}
    for q in qs:
        if q["id"] in ids:
            errors.append(f"duplicate id {q['id']}")
        ids[q["id"]] = q
    # same answer asked twice is allowed only if the questions are different facts
    by_ans = {}
    for q in qs:
        by_ans.setdefault((q["sport"], norm(q["answer"])), []).append(q["id"])
    for (sp, a), group in by_ans.items():
        if len(group) > 1:
            warnings.append(f"same answer '{a}' ({sp}) in {', '.join(group)}")

    for w in warnings:
        print("warn:", w)
    for e in errors:
        print("ERROR:", e)
    counts = {}
    for q in qs:
        counts[q["sport"]] = counts.get(q["sport"], 0) + 1
    print(f"{len(qs)} valid questions", counts)
    if errors:
        sys.exit(1)
    if check_only:
        return

    # ---- keep what is already live ------------------------------------
    start = dt.date.fromisoformat(START)
    frozen_through = (et_today() + dt.timedelta(days=1) - start).days  # index of tomorrow
    order = []
    if os.path.exists(OUT):
        with open(OUT, encoding="utf-8") as fh:
            old = json.load(fh)
        if old.get("start") == START:
            for item in old["days"][: max(0, frozen_through + 1)]:
                if item["id"] in ids:
                    order.append(item["id"])
    used = set(order)

    # ---- schedule the rest --------------------------------------------
    rng = random.Random(SEED)
    pools = {}
    for q in qs:
        if q["id"] in used:
            continue
        pools.setdefault((q["sport"], q["difficulty"]), []).append(q["id"])
    for k in pools:
        pools[k].sort()
        rng.shuffle(pools[k])

    def left(sport=None, diff=None):
        return sum(len(v) for (s, d), v in pools.items()
                   if (sport is None or s == sport) and (diff is None or d == diff))

    prev = ids[order[-1]]["sport"] if order else None
    day = len(order)
    while left():
        want = WEEK_DIFF[(start + dt.timedelta(days=day)).weekday()]
        by_closeness = sorted((2, 3, 4), key=lambda d: (abs(d - want), -d))
        # prefer the target level from a different sport than yesterday; only
        # repeat a sport when nothing else is left at any level
        diff = next((d for d in by_closeness
                     if any(left(s, d) for s in SPORTS if s != prev)), None)
        if diff is None:
            diff = next(d for d in by_closeness if left(None, d))
        cands = [s for s in SPORTS if s != prev and left(s, diff)] or \
                [s for s in SPORTS if left(s, diff)]
        weights = [left(s) for s in cands]
        sport = rng.choices(cands, weights=weights, k=1)[0]
        order.append(pools[(sport, diff)].pop())
        prev = sport
        day += 1

    days = []
    for i, qid in enumerate(order):
        q = ids[qid]
        days.append({
            "id": qid,
            "d": (start + dt.timedelta(days=i)).isoformat(),
            "s": q["sport"],
            "t": q["type"],
            "lv": q["difficulty"],
            "q": q["q"],
            "x": pack(q),
        })
    out = {"v": 1, "start": START, "count": len(days), "days": days}
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as fh:
        json.dump(out, fh, ensure_ascii=False, separators=(",", ":"))
    print(f"wrote {OUT}: {len(days)} days, {START} .. {days[-1]['d']} ({os.path.getsize(OUT)//1024} KB)")


if __name__ == "__main__":
    main()
