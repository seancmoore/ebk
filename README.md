# EBK — Elite Ball Knowledge

**Play it live: https://eliteballknowledge.web.app**

A multi-sport trivia arcade built on real player-season stats. Six sports
(NFL, College Football, NBA, MLB, NHL, Premier League soccer), five game modes
each, plus live head-to-head matches and global leaderboards — all served as a
static site on Firebase Hosting with Firestore for accounts, scores, and
realtime play.

## Games

| Mode | Route | The idea |
|---|---|---|
| Higher / Lower | `/<sport>/higher-lower` | Two player-seasons, one stat — call higher or lower, run the streak. |
| Guess the Stat Line | `/<sport>/stat-line` | Name the player from a mystery season's numbers. |
| Career Path | `/<sport>/career-path` | Trace draft, college, and team clues to the player. |
| Player Grid | `/<sport>/player-grid` | Daily 9-square immaculate grid, one try, scored on community rarity. |
| Team Study | `/<sport>/teams` | Browse, filter, and sort every player-season for a team. |
| Head-to-Head | `/h2h` | Live ranked 1v1 (per-sport Elo) or private rooms with a share code. |
| Leaderboards | `/leaderboard` | Global top 100 by best run, sport total, game total, overall, plays. |

Sports: `nfl`, `cfb`, `nba`, `mlb`, `nhl`, `soccer` (CFB has no player-grid).
The hub (`/`) routes to everything via `public/js/catalog.js` — the single
source of truth for sports, games, and live status.

## Stack

- **Static front end** — plain HTML/CSS/JS in `public/`, no build step.
  Shared design tokens in `public/css/base.css`; per-game JS in `public/js/`.
- **Firebase Hosting** — clean URLs, cache/CSP headers in `firebase.json`.
- **Firebase Auth + Firestore** — accounts, scores, totals, daily-grid stats,
  Elo, H2H rooms. Security rules in `firestore.rules` (validated, bounded,
  rate-limited writes; assume the client is hostile).
- **Head-to-Head** — rooms share a seed; every client generates the identical
  question sequence locally, so only live streaks sync (`public/js/ebk-h2h.js`).
- **Analytics** — first-party, cookieless counter (`public/js/ebk-analytics.js`)
  writing anonymous `{path, source, event, ts}` docs to the admin-read-only
  `hits` collection. Tag campaign links with `?utm_source=ig` etc. `/admin`
  shows view/game-start counts (24h / 7d / Instagram) via aggregation queries;
  the raw stream is also queryable in the Firebase console.

  One-time setup: in Firebase console → Firestore → **TTL policies**, enable
  TTL on `rooms.expires` (abandoned H2H rooms self-delete after a day) and
  `hits.x` (raw analytics events self-delete after ~6 months). Both fields are
  already written by the clients; until the policies are enabled the docs just
  accumulate harmlessly.

## Data

Per-sport datasets live at `public/data/players.json` (NFL) and
`public/data/<sport>/players.json`, built from public sources: nflverse, ESPN,
Lahman, NHL, CFBD, FPL. Career Path also uses `public/data/colleges.json`.
The builders live in `data/` (e.g. `data/build_players.py`, stdlib-only):

```powershell
cd data
python build_players.py            # NFL, full 1999–2025
python build_players.py 2010 2025  # custom season range
```

Datasets are large (NFL ~13 MB, CFB ~19 MB raw; ~1–3 MB gzipped on the wire).
They're cached for 24h (`firebase.json`) and fetched once per session.

## Run locally

`fetch()` can't read the datasets from `file://`, so serve `public/` over HTTP:

```powershell
cd public
python -m http.server 8000
```

Auth/Firestore features (accounts, leaderboards, H2H, analytics) only work on
the deployed Firebase domain — the config is served at `/__/firebase/init.json`
by Hosting. Everything else plays fine locally against localStorage.

## Deploy

```powershell
firebase deploy                          # hosting + firestore rules/indexes
firebase deploy --only hosting           # just the site
firebase deploy --only firestore:rules   # just the rules
```

## Project layout

```
nfl-higher-lower/            # (repo: ebk · site: eliteballknowledge.web.app)
├── data/                    # dataset builders (raw/ is gitignored)
├── firebase.json            # hosting config: headers, CSP, caching
├── firestore.rules          # security rules — read before touching Firestore
├── tools/                   # gen_og.py (social images), add_social_meta.py
└── public/                  # static site root (Firebase Hosting)
    ├── index.html           # EBK hub
    ├── 404.html             # branded not-found page
    ├── css/                 # base.css = shared tokens; per-surface styles
    ├── js/                  # catalog.js, game engines, ebk-* platform files
    ├── img/                 # icon.svg, og.png, apple-touch-icon.png, balls
    ├── data/                # bundled datasets (players.json per sport)
    ├── <sport>/<game>/      # one folder per game route
    ├── h2h/ · leaderboard/ · dashboard/ · admin/
    └── privacy/ · terms/
```

### Architecture notes

Each game is a self-contained route under `/<sport>/<game>/` that loads
`/css/base.css` plus its own styles/scripts and fetches `/data/...` by absolute
path — adding a sport or game is just a new folder plus a `catalog.js` entry.
The `ebk-*.js` files are the shared platform: loader/preloader, Firebase
client, auth UI, sounds, analytics. Scores write through `EBKF.recordScore`
(owner-only, monotonic, rate-limited by rules).
