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

The datasets come from public sources: nflverse, ESPN, Lahman, NHL, CFBD, FPL. The build scripts live in `data/` and are stdlib-only Python:

```
cd data
python build_players.py
```

After rebuilding, run `python tools/slim_players.py` to prune the dead weight before it ships.

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
