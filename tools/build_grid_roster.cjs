#!/usr/bin/env node
/* EBK · precomputed Player Grid rosters.
 *
 * player-grid.js needs one row per player (teams, positions per team,
 * achievements, draft flags), not every player-season. Building that in the
 * browser meant downloading and walking the whole players.json on every grid
 * visit. This writes the finished roster to grid-roster.json next to each
 * sport's players.json; the page loads it first and falls back to
 * players.json if it is missing.
 *
 * It uses tools/solvable.cjs's engine, which slices the page's own
 * buildRoster / hydrateRoster out of public/js/player-grid.js, and refuses
 * to write a roster whose boards differ from the dataset's for 30 dates.
 *
 * Run after every data/build_*.py (solvable.cjs fails while a roster is stale):
 *   node tools/build_grid_roster.cjs            # all five grid sports
 *   node tools/build_grid_roster.cjs nba soccer
 */
"use strict";
const fs = require("fs");
const path = require("path");
const { ALL_SPORTS, ROSTER_FILE, engine, serializeRoster, boardFor } = require("./solvable.cjs");

const sports = process.argv.slice(2).length ? process.argv.slice(2) : ALL_SPORTS;
const dates = [];
for (let i = 0; i < 30; i++) dates.push(new Date(Date.now() + i * 864e5).toISOString().slice(0, 10));

let failed = 0;
for (const sport of sports) {
  const eng = engine(sport, "data");
  const file = ROSTER_FILE(sport);
  const before = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : null;
  const txt = JSON.stringify(serializeRoster(eng.R));
  fs.writeFileSync(file, txt);
  const ros = engine(sport, "roster");
  const bad = dates.filter((d) => JSON.stringify(boardFor(sport, d, eng)) !== JSON.stringify(boardFor(sport, d, ros)));
  if (bad.length) {
    failed++;
    if (before == null) fs.unlinkSync(file); else fs.writeFileSync(file, before);
    console.log(`!! ${sport}: roster boards differ from the dataset on ${bad.join(", ")}; left ${path.relative(process.cwd(), file)} unchanged`);
  } else {
    console.log(`${sport}: ${eng.R.length.toLocaleString()} players -> ${path.relative(process.cwd(), file)} (${(txt.length / 1e6).toFixed(2)} MB), ${dates.length}/${dates.length} boards identical`);
  }
}
process.exit(failed ? 1 : 0);
