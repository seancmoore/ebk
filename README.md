# EBK - Elite Ball Knowledge

Play it here: https://eliteballknowledge.web.app

A sports trivia arcade I built around real player-season stats instead of made-up questions. Covers six sports (NFL, college football, NBA, MLB, NHL, Premier League) with five different game modes each, live 1v1 matches, and global leaderboards. It's a static site on Firebase Hosting with Firestore handling accounts, scores and real-time play.

## The games

- **Higher / Lower** - two player-seasons, one stat, call higher or lower and keep the streak alive
- **Guess the Stat Line** - name the player from a mystery season's numbers
- **Career Path** - draft info, college, and team clues lead you to the player
- **Player Grid** - a daily 9-square immaculate grid, one try, scored on how rare your answers were
- **Team Study** - browse and sort every player-season for a given team
- **Head-to-Head** - live ranked 1v1 with per-sport Elo, or private rooms with a share code
- **Leaderboards** - top 100 globally by best run, by sport, and overall

Everything routes through the hub at `/` via `public/js/catalog.js`, which is the single place that knows what sports and games exist and whether they're live yet.

## How it's built

Plain HTML/CSS/JS in `public/`, no build step. Firebase Hosting serves it, Firebase Auth + Firestore handle accounts and scores, and the security rules assume the client can't be trusted (bounded, rate-limited writes only).

Head-to-head rooms don't sync every move - both clients generate the identical question sequence from a shared seed, so only the live streak numbers actually go over the wire.

There's also a first-party analytics setup that just writes anonymous `{path, source, event, ts}` docs to an admin-only collection - no third-party trackers.

## Data

The datasets come from public sources: nflverse, ESPN, Lahman, the MLB Stats API, NHL, CFBD, FPL. Every sport runs through its latest complete season. The build scripts live in `data/` and are plain Python (the NBA one also needs pandas + pyarrow):

```
cd data
python build_players.py
```

`build_players.py` also HEADs the old NFL.com headshots (cached in `data/raw/nfl_headshot_probe.json`): NFL.com answers a missing photo with a generic helmet and a 200, so those rows switch to the player's ESPN headshot, or to none. The first run takes a few minutes; delete the cache file to re-check. `build_soccer.py` does the same for Premier League photos (`data/raw/soccer/headshot_probe.json`), preferring the PL's newer `premierleague25` path.

After any rebuild, regenerate the Player Grid rosters and the home page's Stat Lab search/profile files, and check the boards:

```
node tools/build_grid_roster.cjs
python tools/build_stat_lab.py
node tools/solvable.cjs
```

The grid page loads the small `grid-roster.json` next to each `players.json` instead of the whole dataset (it falls back to `players.json` if the roster is missing). `solvable.cjs` fails while a roster is stale.

When a season ends, raise `LAST` in that sport's builder (`SEASONS` for soccer), rebuild, and bump the `?v=N` on `DATA_URL` (and `ROSTER_URL` in `player-grid.js`) in the game scripts, plus `DATA_V` in `ebk-home-sections.js` and the prefetch in `ebk-rack.js`, so browsers pick up the new data. Ship the output as-is - `tools/slim_players.py` prunes the low-stat and traded stints the Player Grid needs.

## Running it locally

You need to serve `public/` over HTTP since `fetch()` won't read local files directly:

```
cd public
python -m http.server 8000
```

Login, leaderboards, and head-to-head only work on the deployed domain since that's where the Firebase config gets served from. Everything else works fine locally.

## Deploying

```
firebase deploy
```
