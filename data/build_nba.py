"""
build_nba.py — NBA player-season dataset for EBK.

Source: sportsdataverse hoopR-data, nba/player_box parquet (per-game box scores,
2002-present). Aggregated to player-season totals + per-game rates.
Requires pandas + pyarrow (local build tool only; the shipped site stays static).

Usage:  python build_nba.py            # full range
        python build_nba.py 2020 2025  # custom
"""
import os, sys, json, urllib.request
from datetime import date
import pandas as pd

FIRST, LAST = 2002, 2025
HERE = os.path.dirname(os.path.abspath(__file__))
RAW = os.path.join(HERE, "raw", "nba")
OUT = os.path.normpath(os.path.join(HERE, "..", "public", "data", "nba", "players.json"))
URL = ("https://github.com/sportsdataverse/hoopR-data/raw/main/nba/player_box/"
       "parquet/player_box_{y}.parquet")

CATEGORIES = [
    ("pts", "Points",            0, "\U0001F3C0"),
    ("ppg", "Points / Game",     1, "\U0001F4C8"),
    ("reb", "Rebounds",          0, "\U0001F501"),
    ("rpg", "Rebounds / Game",   1, "\U0001F4C8"),
    ("ast", "Assists",           0, "\U0001F91D"),
    ("apg", "Assists / Game",    1, "\U0001F4C8"),
    ("stl", "Steals",            0, "✋"),
    ("blk", "Blocks",            0, "\U0001F6AB"),
    ("tpm", "3-Pointers Made",   0, "\U0001F3AF"),
]


def grp_of(pos):
    p = (pos or "").upper()
    if p in ("PG", "SG", "G"): return "G"
    if p in ("SF", "PF", "F"): return "F"
    if p == "C": return "C"
    if p.startswith("G"): return "G"
    if p.startswith("F"): return "F"
    if p.startswith("C"): return "C"
    return "G"


def fetch(y):
    os.makedirs(RAW, exist_ok=True)
    cache = os.path.join(RAW, f"player_box_{y}.parquet")
    if not (os.path.exists(cache) and os.path.getsize(cache) > 0):
        req = urllib.request.Request(URL.format(y=y), headers={"User-Agent": "ebk/1.0"})
        with urllib.request.urlopen(req, timeout=120) as r, open(cache, "wb") as f:
            f.write(r.read())
    return pd.read_parquet(cache)


def build():
    start, end = FIRST, LAST
    if len(sys.argv) == 3:
        start, end = int(sys.argv[1]), int(sys.argv[2])

    frames = []
    for y in range(start, end + 1):
        try:
            df = fetch(y)
        except Exception as exc:  # noqa: BLE001
            print(f"  ! {y} failed: {exc}")
            continue
        df = df[df["season_type"] == 2]                      # regular season
        df = df[df["did_not_play"] != True]                  # noqa: E712 — actually played
        frames.append(df)
        print(f"  {y}: {len(df):,} player-games")
    allg = pd.concat(frames, ignore_index=True)

    num = ["points", "rebounds", "assists", "steals", "blocks",
           "three_point_field_goals_made"]
    for c in num:
        allg[c] = pd.to_numeric(allg[c], errors="coerce").fillna(0)

    players = []
    grouped = allg.groupby(["athlete_id", "season"], sort=False)
    for (aid, season), g in grouped:
        games = len(g)
        if games == 0:
            continue
        pts = float(g["points"].sum()); reb = float(g["rebounds"].sum())
        ast = float(g["assists"].sum()); stl = float(g["steals"].sum())
        blk = float(g["blocks"].sum()); tpm = float(g["three_point_field_goals_made"].sum())
        # Every team a player suited up for that season, in the order they
        # first appeared for it — not just the most-common one, so a
        # mid-season trade still registers on both teams' grids.
        teams = list(dict.fromkeys(g["team_abbreviation"]))
        team = g["team_abbreviation"].mode()
        team = team.iloc[0] if len(team) else (g["team_abbreviation"].iloc[-1] or "")
        pos = g["athlete_position_abbreviation"].mode()
        pos = pos.iloc[0] if len(pos) else ""
        head = g["athlete_headshot_href"].dropna()
        rec = {
            "id": str(aid),
            "name": g["athlete_display_name"].iloc[-1],
            "pos": pos or "G",
            "grp": grp_of(pos),
            "season": int(season),
            "seasonLabel": f"{int(season)-1}-{str(int(season))[2:]}",
            "team": team,
            "games": int(games),
            "stats": {
                "pts": int(round(pts)), "reb": int(round(reb)), "ast": int(round(ast)),
                "stl": int(round(stl)), "blk": int(round(blk)), "tpm": int(round(tpm)),
                "ppg": round(pts / games, 1), "rpg": round(reb / games, 1), "apg": round(ast / games, 1),
            },
        }
        if len(head):
            rec["headshot"] = head.iloc[-1]
        if len(teams) > 1:
            rec["teams"] = teams
        players.append(rec)

    players.sort(key=lambda r: (r["season"], r["name"]))
    out = {
        "generated": date.today().isoformat(),
        "source": "sportsdataverse hoopR-data / nba player_box",
        "sport": "nba",
        "seasons": [start, end],
        "categories": [{"key": k, "label": l, "decimals": d, "icon": i} for k, l, d, i in CATEGORIES],
        "players": players,
        "people": {},
    }
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
    mb = os.path.getsize(OUT) / 1e6
    print(f"\nWrote {len(players):,} player-seasons -> {OUT} ({mb:.1f} MB)")


if __name__ == "__main__":
    build()
