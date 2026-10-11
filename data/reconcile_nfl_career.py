"""
reconcile_nfl_career.py - completes and corrects the pre-1999 NFL career rows with Statscrew team rosters.

Inputs (all cached, no network):
  data/raw/career/nfl_espn.json         ESPN-based rows from build_nfl_career.py
  data/raw/statscrew_nfl/*.html         Statscrew team-season ROSTER pages (GP/GS per player per club, birth date,
                                        covers everyone who dressed) and STATS pages (sacks, interceptions, tackles),
                                        1983-1998, fetched by tools/statscrew_nfl_fetch.py
  public/data/players.json, data/raw/players.csv   who is in the window; names + birth dates for matching
Outputs:
  data/raw/career/nfl.json              final rows (same record shape as before; this is what slim_v4 ships)
  data/raw/career/nfl_sources.json      per (gsis|season): which source decided teams/games/stats, GS, notes

Rules
  * ONLY players already in players.json (rookie season < 1999); seasons 1983-1998.
  * a Statscrew roster entry is matched to a player by (name, birth date); fallbacks: last name + first initial +
    exact birth date, or full name + same birth year (or same month/day). Ambiguous matches are skipped.
  * a season ESPN omitted (no row in any ESPN stat table: tackle-only defenders, special teamers) is ADDED from
    Statscrew: club(s), games (GP). Stats: def_sacks and def_interceptions from the Statscrew tables for defenders;
    tackles are never written (unofficial); anything not sourced stays blank, never invented.
  * games = Statscrew GP summed over clubs (the games ESPN reports are wrong for about 1% of seasons and often wrong for
    traded players), clamped: per club <= the team schedule (16; 15 in the 1987 strike year), total <= schedule, or
    schedule+1 for a player traded in 1990+ (bye weeks let him play weeks on both clubs).
  * clubs = the Statscrew club set. Order: ESPN date order when ESPN has the same clubs, else ESPN order for the
    clubs it knows then the rest (flagged order_unknown).
"""
import collections, csv, json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import statscrew_nfl_parse as sc

HERE = os.path.dirname(os.path.abspath(__file__))
PLAYERS = os.path.normpath(os.path.join(HERE, "..", "public", "data", "players.json"))
BASE = os.path.join(HERE, "raw", "career", "nfl_espn.json")
OUT = os.path.join(HERE, "raw", "career", "nfl.json")
SRC = os.path.join(HERE, "raw", "career", "nfl_sources.json")
OFF = {"QB", "RB", "WR", "TE"}


def sched(y):
    return 15 if y == 1987 else 16


def main():
    rows = {r["gsis_id"]: r for r in csv.DictReader(open(os.path.join(HERE, "raw", "players.csv"), encoding="utf8"))}
    main_rows = json.load(open(PLAYERS, encoding="utf8"))["players"]
    first = {}
    for r in main_rows:
        if r["id"] not in first or r["season"] < first[r["id"]]["season"]:
            first[r["id"]] = r
    pre = [i for i in first if rows.get(i) and rows[i]["rookie_season"] and int(rows[i]["rookie_season"]) < 1999]

    exact, bylast, byname = {}, collections.defaultdict(list), collections.defaultdict(list)
    for i in pre:
        r = rows[i]
        names = {r["display_name"], (r["first_name"] + " " + r["last_name"]).strip(),
                 ((r["football_name"] or r["first_name"]) + " " + r["last_name"]).strip()}
        for nm in names:
            if nm:
                exact.setdefault((sc.norm(nm), r["birth_date"]), set()).add(i)
                byname[sc.norm(nm)].append(i)
        bylast[(r["birth_date"], sc.norm(r["last_name"]))].append(i)

    def match(e):
        c = exact.get((sc.norm(e["name"]), e["bd"]))
        if c and len(c) == 1:
            return ("exact", next(iter(c)))
        if e["bd"]:
            ln = sc.norm(e["name"].split()[-1])
            c = [i for i in bylast.get((e["bd"], ln), []) if rows[i]["first_name"][:1].lower() == e["name"][:1].lower()]
            if len(set(c)) == 1:
                return ("exact", c[0])
        c = set(byname.get(sc.norm(e["name"]), []))
        if e["bd"] and c:
            # birth dates in the sources carry single-field typos: demand 2 of 3 components (year, month, day) to agree
            def close(i):
                a_, b_ = rows[i]["birth_date"].split("-"), e["bd"].split("-")
                return sum(x == y for x, y in zip(a_, b_)) >= 2
            c2 = [i for i in c if close(i)]
            if len(c2) == 1:
                return ("near", c2[0])
        if not e["bd"] and len(c) == 1:
            return ("nobd", next(iter(c)))
        return None

    ent = collections.defaultdict(list)          # (gsis, year) -> [{code, gp, gs, team, name}]
    unmatched = 0
    for y in range(1983, 1999):
        for t in sc.year_teams(y):
            ro = sc.roster(t, y)
            if ro is None:
                print("MISSING roster", t, y)
                continue
            st = sc.stats(t, y) or {"sacks": {}, "int": {}, "def": {}, "pass": {}, "rush": {}, "recv": {}}
            for e in ro:
                g = match(e)
                if g is None:
                    unmatched += 1
                    continue
                method, g = g
                nobd = method == "nobd"
                nm = sc.norm(e["name"])
                ent[(g, y)].append({"code": sc.code_for(t, y), "gp": e["gp"], "gs": e["gs"], "team": t, "name": e["name"],
                                    "sacks": st["sacks"].get(nm), "int": st["int"].get(nm), "def": st["def"].get(nm), "pass": st["pass"].get(nm), "rush": st["rush"].get(nm), "recv": st["recv"].get(nm), "nobd": nobd, "m": method, "pos": e["pos"]})

    OFFPOS = {"QB", "RB", "FB", "HB", "WR", "TE", "TB", "SE", "FL", "WB"}
    DEFPOS = {"DE", "DT", "NT", "LB", "OLB", "ILB", "MLB", "CB", "S", "SS", "FS", "DB", "DL", "SAF"}
    conflicts = 0
    for key in list(ent):
        g = first[key[0]]["grp"]
        keep = []
        for x in ent[key]:
            ps = x["pos"].upper()
            # position changers (Junkin, Hallock, Crawford) are real: only distrust fuzzy name matches
            if x["m"] != "exact" and ((g in OFF and ps in DEFPOS) or (g not in OFF and ps in OFFPOS)):
                conflicts += 1; print("  CONFLICT", first[key[0]]["name"], key[1], g, ps, x["code"], x["gp"])
                continue
            keep.append(x)
        if keep:
            ent[key] = keep
        else:
            del ent[key]
    print("roster entries dropped for offense/defense position conflict:", conflicts)
    base = json.load(open(BASE, encoding="utf8"))["players"]
    espn = {(r["id"], r["season"]): r for r in base}
    # roster entries without a birth date (common names are risky: two Brian Mitchells): keep only when ESPN shows
    # the same player at that club that year, or at that club in an adjacent season
    dropped_nobd = 0
    for key in list(ent):
        keep = []
        for x in ent[key]:
            if x["nobd"]:
                ok = False
                for yy in (key[1], key[1] - 1, key[1] + 1):
                    r = espn.get((key[0], yy))
                    if r and x["code"] in (r.get("teams") or [r["team"]]):
                        ok = True
                if not ok:
                    dropped_nobd += 1
                    continue
            keep.append(x)
        if keep:
            ent[key] = keep
        else:
            del ent[key]
    final, src = [], {}
    cnt = collections.Counter()
    for key in sorted(set(espn) | set(ent), key=lambda k: (k[1], first[k[0]]["name"], k[0])):
        gsis, y = key
        f = first[gsis]
        e = espn.get(key)
        s = ent.get(key)
        cap_team = sched(y)
        tag = {}
        if s:
            clubs = collections.OrderedDict()
            for x in s:
                clubs[x["code"]] = clubs.get(x["code"], 0) + x["gp"]
            gs_tot = sum(x["gs"] for x in s)
            per = {c: min(g, cap_team) for c, g in clubs.items()}
            total = sum(per.values())
            cap_total = cap_team + (1 if len(per) > 1 and y >= 1990 else 0)
            if total > cap_total:
                tag["clamped_from"] = total
                total = cap_total
            codes = list(per)
        if e and s:
            cnt["both"] += 1
            espn_codes = e.get("teams") or [e["team"]]
            if set(codes) == set(espn_codes):
                codes = espn_codes
            else:
                known = [c for c in espn_codes if c in per]
                codes = known + [c for c in per if c not in known]
                tag["teams"] = "statscrew set differs from ESPN %s" % espn_codes
                cnt["teams_changed"] += 1
                if len(codes) > 1 and not known:
                    tag["order_unknown"] = True
            rec = dict(e)
            rec["team"] = codes[-1]
            if len(codes) > 1:
                rec["teams"] = codes
            else:
                rec.pop("teams", None)
            if rec["games"] != total:
                cnt["games_changed"] += 1
                tag["games"] = "statscrew %d (espn %d)" % (total, rec["games"])
            rec["games"] = int(total)
            tag.update({"gs": gs_tot, "src": "espn stats + statscrew roster"})
        elif e:
            cnt["espn_only"] += 1
            rec = dict(e)
            rec["games"] = int(min(rec["games"], cap_team))
            tag["src"] = "espn only (not on statscrew rosters)"
        else:
            cnt["added_from_statscrew"] += 1
            stats = {}
            if f["grp"] in OFF:
                def tot(area, i):
                    return sum(float(x[area][i] or 0) for x in s if x.get(area) and len(x[area]) > i)
                if f["grp"] == "QB" and (tot("pass", 0) or tot("pass", 3) or tot("pass", 5)):
                    stats["passing_yards"] = int(tot("pass", 3)); stats["passing_tds"] = int(tot("pass", 5))
                if tot("rush", 0) or tot("rush", 1) or tot("rush", 4):
                    stats["rushing_yards"] = int(tot("rush", 1)); stats["rushing_tds"] = int(tot("rush", 4))
                if tot("recv", 0) or tot("recv", 1) or tot("recv", 4):
                    stats["receiving_yards"] = int(tot("recv", 1)); stats["receptions"] = int(tot("recv", 0))
                    stats["receiving_tds"] = int(tot("recv", 4))
            if f["grp"] not in OFF:
                sk = [x["sacks"] for x in s if x["sacks"]]
                it = [x["int"] for x in s if x["int"]]
                sacks = sum(float(c[0] or 0) for c in sk) if sk else 0.0
                ints = sum(float(c[0] or 0) for c in it) if it else 0.0
                if sacks or ints:
                    if y >= 1982:
                        stats["def_sacks"] = int(sacks) if float(sacks).is_integer() else round(sacks, 1)
                    stats["def_interceptions"] = int(ints)
            rec = {"id": gsis, "name": f["name"], "pos": f["pos"], "grp": f["grp"], "season": y,
                   "team": codes[-1]}
            if len(codes) > 1:
                rec["teams"] = codes
                tag["order_unknown"] = True
            rec["games"] = int(total)
            rec["stats"] = stats
            tag.update({"gs": gs_tot, "src": "statscrew roster (+ sack/INT tables); ESPN had no row",
                        "tackles_unofficial": [x["def"][0] for x in s if x["def"]] or None})
        final.append(rec)
        src["%s|%d" % (gsis, y)] = tag
    # date order of the clubs of traded seasons from ESPN game logs (data/nfl_gamelog_order.py), when it agrees on the clubs
    FK = {"OAK": "LV", "SD": "LAC", "STL": "LAR", "LA": "LAR", "JAC": "JAX", "WSH": "WAS"}
    fk = lambda c: FK.get(c, c)
    op = os.path.join(HERE, "raw", "career", "nfl_club_order.json")
    order = json.load(open(op)) if os.path.exists(op) else {}
    for rec in final:
        if not rec.get("teams"):
            continue
        key = "%s|%d" % (rec["id"], rec["season"])
        o = order.get(key)
        if not o:
            continue
        want = o["order"]
        mine = {fk(c): c for c in rec["teams"]}
        if set(want) == set(mine):
            new = [mine[c] for c in want]
            if new != rec["teams"]:
                cnt["order_fixed_by_gamelog"] += 1
                src[key]["order"] = "gamelog %s (was %s)" % (new, rec["teams"])
            rec["teams"], rec["team"] = new, new[-1]
            src[key].pop("order_unknown", None)
        else:
            src[key]["gamelog_clubs_differ"] = want
            cnt["gamelog_clubs_differ"] += 1
    final.sort(key=lambda r: (r["season"], r["name"], r["id"]))
    json.dump({"sport": "nfl", "through": 1998, "players": final}, open(OUT, "w", encoding="utf8"),
              separators=(",", ":"), ensure_ascii=False)
    json.dump(src, open(SRC, "w", encoding="utf8"), separators=(",", ":"), ensure_ascii=False)
    print("unmatched roster rows (non-window players):", unmatched, " no-birthdate entries dropped as unproven:", dropped_nobd)
    print(dict(cnt), "rows", len(final), "players", len({r["id"] for r in final}))


if __name__ == "__main__":
    main()
