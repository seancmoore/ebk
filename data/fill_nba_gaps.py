"""
fill_nba_gaps.py: find NBA regular-season games missing from the sportsdataverse ESPN player-box parquet
and fetch their box scores straight from ESPN, so season totals match the official record.

Found 8 Oct 2026: 2022-23 was missing ~50 games (every team 3-4 short; Tatum showed 72 of 74 games),
plus a few games in 2012-13, 2013-14, 2016-17, 2017-18 and 2018-19.

Usage:  python fill_nba_gaps.py              # audit + patch every season (cached; re-run is cheap)
        python fill_nba_gaps.py 2023         # one season
Also re-fetches 'hollow' games (present but with no minutes/points for a team).
Writes data/raw/nba/player_box_{y}_patch.parquet (same columns as the source); build_nba.py uses the patched
copy of any game it contains in place of the source rows.
"""
import json
import os
import sys
import time
import urllib.request

import pandas as pd

HERE = os.path.dirname(os.path.abspath(__file__))
RAW = os.path.join(HERE, "raw", "nba")
API = "https://site.api.espn.com/apis/site/v2/sports/basketball/nba"
CACHE = os.path.join(RAW, "espn_cache")


def get(url, cache_name=None):
    if cache_name:
        p = os.path.join(CACHE, cache_name)
        if os.path.exists(p):
            with open(p, encoding="utf-8") as f:
                return json.load(f)
    for attempt in range(4):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "ebk/1.0"}), timeout=60) as r:
                d = json.loads(r.read())
            break
        except Exception:  # noqa: BLE001
            if attempt == 3:
                raise
            time.sleep(2 + attempt * 3)
    if cache_name:
        os.makedirs(CACHE, exist_ok=True)
        with open(os.path.join(CACHE, cache_name), "w", encoding="utf-8") as f:
            json.dump(d, f)
    return d


def team_ids():
    t = get(f"{API}/teams", "teams.json")["sports"][0]["leagues"][0]["teams"]
    return {x["team"]["abbreviation"]: x["team"]["id"] for x in t}


def schedule_events(season):
    """Completed regular-season event ids for a season (union over every team's schedule)."""
    ev = {}
    for abbr, tid in team_ids().items():
        s = get(f"{API}/teams/{tid}/schedule?season={season}&seasontype=2", f"sched_{season}_{abbr}.json")
        for e in s.get("events", []):
            st = e.get("seasonType", {}).get("type")
            comp = (e.get("competitions") or [{}])[0]
            done = comp.get("status", {}).get("type", {}).get("completed")
            if st == 2 and done:
                ev[int(e["id"])] = e["date"][:10]
    return ev


def num(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def box_rows(season, gid, date):
    sm = get(f"{API}/summary?event={gid}", f"sum_{gid}.json")
    rows = []
    for side in sm.get("boxscore", {}).get("players", []):
        abbr = side["team"]["abbreviation"]
        st = side["statistics"][0]
        keys = st.get("keys") or []
        for a in st.get("athletes", []):
            ath = a.get("athlete", {})
            stats = dict(zip(keys, a.get("stats") or []))
            dnp = bool(a.get("didNotPlay")) or not a.get("stats")
            three = stats.get("threePointFieldGoalsMade-threePointFieldGoalsAttempted", "")
            rows.append({
                "season": season, "season_type": 2, "game_id": gid, "game_date": date,
                "athlete_id": int(ath["id"]), "athlete_display_name": ath.get("displayName"), "team_abbreviation": abbr,
                "did_not_play": dnp, "minutes": None if dnp else num(stats.get("minutes")),
                "points": None if dnp else num(stats.get("points")), "rebounds": None if dnp else num(stats.get("rebounds")),
                "assists": None if dnp else num(stats.get("assists")), "steals": None if dnp else num(stats.get("steals")),
                "blocks": None if dnp else num(stats.get("blocks")),
                "three_point_field_goals_made": None if dnp else num(three.split("-")[0] if three else None),
                "athlete_position_abbreviation": (ath.get("position") or {}).get("abbreviation"),
                "athlete_headshot_href": (ath.get("headshot") or {}).get("href"),
            })
    return rows


def patch(season):
    src = pd.read_parquet(os.path.join(RAW, f"player_box_{season}.parquet"),
                          columns=["game_id", "season_type", "team_abbreviation", "minutes", "points"])
    src = src[src["season_type"] == 2]
    have = set(src["game_id"].astype(int))
    # "hollow" games: present, but one team's rows carry no minutes and no points (2013, 2014, 2017 had these)
    live = src[src["minutes"].notna() | src["points"].notna()].groupby("game_id")["team_abbreviation"].nunique()
    hollow = {int(g) for g in have if live.get(g, 0) < 2}
    sched = schedule_events(season)
    missing = sorted(g for g in sched if g not in have or g in hollow)
    out = os.path.join(RAW, f"player_box_{season}_patch.parquet")
    if not missing:
        if os.path.exists(out):
            os.remove(out)
        print(f"  {season}: complete ({len(sched)} scheduled games, all present)")
        return 0
    rows, empty = [], []
    for g in missing:
        r = box_rows(season, g, sched[g])
        rows += r
        if not r:
            empty.append(g)
    if empty:
        print(f"  {season}: ESPN has no box score for {len(empty)} of the missing games: {empty[:8]}")
    if not rows:
        return 0
    df = pd.DataFrame(rows)
    for c in ("season", "season_type", "game_id", "athlete_id"):
        df[c] = df[c].astype("int32")
    df.to_parquet(out, index=False)
    print(f"  {season}: {len(sched)} scheduled, {len(missing)} missing or hollow -> patched {len(df)} player rows")
    return len(missing)


if __name__ == "__main__":
    seasons = [int(a) for a in sys.argv[1:]] or list(range(2002, 2027))
    total = sum(patch(y) for y in seasons)
    print(f"done: {total} games patched")
