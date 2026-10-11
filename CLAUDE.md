# EBK data notes (read before touching data)

Standing rules (owner): every sport runs through its latest COMPLETE season (check against today's date); only real sources; never invent player-seasons or position overrides. Pinning a figure to the official record is allowed only in an `OFFICIAL_FIXES` table (data/build_players.py, build_cfb.py, build_soccer.py) with the source URL beside it.

## Windows (first season in the data)
NFL 1999 (nflverse; nothing earlier is free), CFB 2014, NBA 2002 (ESPN box scores; nothing earlier reachable), MLB 1990 (Lahman through 2021 + MLB Stats API), NHL 1979-80 (NHL stats API), Premier League 2016-17 (FPL; labelled "FPL Assists"). Grid "(career)" categories are labelled "(since <first season>)" in public/js/player-grid.js: keep them in step with the builder's FIRST.

## Build order
1. `python data/build_<sport>.py` (NFL: build_players.py, which also applies `raw/espn_def_overlay.json` made by `python data/build_espn_overlay.py`; ESPN caches in raw/espn_def and raw/espn_off come from tools/espn_def_fetch.cjs and espn_off_fetch.cjs).
2. NHL/MLB only: `python data/nhl_headshots.py` / `python data/mlb_headshots.py` (verified photos for old players), then `python tools/slim_v4.py` (browser copy `players.slim.json`).
3. `node tools/build_grid_roster.cjs`, `python tools/build_stat_lab.py`, `node tools/solvable.cjs` (must be 0 errors; run several --date values).
4. Bump the data version: `EBKD.dataUrl` in public/js/ebk-loader.js, ROSTER_URL in player-grid.js, DATA_V in ebk-home-sections.js.
5. Tests: tools/smoke.cjs needs full playwright; on this PC run a copy with `require("playwright-core")` and `chromium.launch({channel:"msedge"})`; list a throwaway sport first (the first sport can hit a server-start race). tools/deep-cut-smoke.cjs works as is.

## Source quirks
- NFL games: nflverse counts only games with a recorded stat; ESPN gamesPlayed is applied as max(nflverse, ESPN) up to 17/18 weeks (a trade across a bye can exceed the schedule). Tackles: ESPN only for 1999-2003 where it differs >10%; sacks/INT ESPN through 2012. Evidence in docs/data-audit-20261010.md and docs/audit-evidence/.
- Careers shown by Career Path / grid totals are windowed to the data (a player who started before the window is truncated).
- Higher/Lower pools: EBKD.hlEligible(p, key, label, sport) has games floors for NHL (skaters 20, goalies 15) and MLB (hitters 50, pitchers 20).
- Team codes are folded into today's franchise in public/js/<sport>-teams.js (NHL: PHX/WIN->ARI, ATL->WPG, AFM->CGY, HFD->CAR, QUE->COL, MNS->DAL, CLR->NJD; MLB keyed by Lahman franchID: Expos->WSN, Marlins FLA, Devil Rays TBD, Angels ANA).
- Deep Cut: edit data/deep-cuts/bank_*.json, then PATCH the affected days in public/data/deep-cuts.json with build_deep_cuts.pack(); a full rebuild reshuffles future days.
