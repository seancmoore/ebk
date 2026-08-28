#!/usr/bin/env node
/* EBK · board solvability check.
 *
 * Rebuilds today's player-grid board for any sport straight from the checked-in
 * data and prints the ACTUAL answer list for all nine cells, so a scheduled run
 * can tell a fair board from a degenerate or unfairly-thin one without a
 * browser and without the live site.
 *
 * It does NOT reimplement the game. CFG, seededRng, buildRoster, satisfies,
 * intersects and generate are sliced out of public/js/player-grid.js at run
 * time and eval'd, and the franchise helpers are eval'd out of
 * public/js/<sport>-teams.js, so this tool cannot drift from what ships.
 *
 *   node tools/solvable.cjs                 # all five grid sports, today (ET)
 *   node tools/solvable.cjs soccer nfl      # named sports
 *   node tools/solvable.cjs --date 2026-09-01 soccer
 *   node tools/solvable.cjs --json          # machine-readable
 *
 * Exit code 1 if any cell in any checked board has ZERO valid answers.
 */
"use strict";
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const PUB = path.join(ROOT, "public");
const SRC = fs.readFileSync(path.join(PUB, "js", "player-grid.js"), "utf8");

const ALL_SPORTS = ["nfl", "nba", "mlb", "nhl", "soccer"];
const TEAM_FILE = { nfl: "teams.js", nba: "nba-teams.js", mlb: "mlb-teams.js", nhl: "nhl-teams.js", soccer: "soccer-teams.js", cfb: "cfb-teams.js" };
const DATA_FILE = (s) => (s === "nfl" ? path.join(PUB, "data", "players.json") : path.join(PUB, "data", s, "players.json"));

// ---- slice the real implementation out of player-grid.js -------------------
function slice(startRe, endRe, label) {
  const m = SRC.match(startRe);
  if (!m) throw new Error("solvable.cjs: could not find " + label + " in player-grid.js — the file moved on, fix this tool");
  const rest = SRC.slice(m.index);
  const e = rest.match(endRe);
  if (!e) throw new Error("solvable.cjs: could not find the end of " + label);
  return rest.slice(0, e.index + e[0].length);
}

const CFG_SRC = slice(/^  const CFG = \{$/m, /^  \}\[SPORT\];$/m, "CFG");
const FN_SRC = ["seededRng", "buildRoster", "satisfies", "intersects", "generate"]
  .map((n) => slice(new RegExp("^  function " + n + "\\(", "m"), /^  \}$/m, n))
  .join("\n");
const SHUFFLE_SRC = slice(/^  const shuffle = /m, /;$/m, "shuffle");
const NORMPOS_SRC = slice(/^  const normPos = /m, /;$/m, "normPos");
// GEN_ATTEMPTS is defined next to generate() when the attempt cap has been
// lifted out of the loop; fall back to the inline literal if it has not.
const GEN_ATTEMPTS = (() => {
  const m = SRC.match(/const GEN_ATTEMPTS = (\d+)/);
  if (m) return +m[1];
  const l = SRC.match(/for \(let attempt = 0; attempt < (\d+); attempt\+\+\)/);
  return l ? +l[1] : null;
})();

// The difficulty-floor ladder buildBoard walks, read out of the page rather
// than restated here, so this tool reports the board the site actually builds.
// Falls back to the old inline [2, 1] if the constant is not there.
const FLOORS = (() => {
  const m = SRC.match(/const FLOORS = \[([\d,\s]+)\]/);
  return m ? m[1].split(",").map((x) => +x.trim()).filter((x) => x) : [2, 1];
})();

const etDate = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());

function boardFor(sport, date) {
  const teamsSrc = fs.readFileSync(path.join(PUB, "js", TEAM_FILE[sport]), "utf8");
  const sandboxWindow = {};
  new Function("window", teamsSrc)(sandboxWindow);
  const LEAGUE = sandboxWindow[sport.toUpperCase()];
  if (!LEAGUE) throw new Error("no league helper for " + sport);

  const data = JSON.parse(fs.readFileSync(DATA_FILE(sport), "utf8"));

  const body = `
    const SPORT = ${JSON.stringify(sport)};
    ${CFG_SRC}
    const ACH = CFG.ach;
    const CAREER = CFG.careerAch || [];
    const CAREER_COLS = [...new Set(CAREER.map((x) => x[2]))];
    const S = { R: [], crit: [], teams: [], specials: [] };
    const GEN_ATTEMPTS = ${GEN_ATTEMPTS};
    ${NORMPOS_SRC}
    ${SHUFFLE_SRC}
    ${FN_SRC}
    buildRoster(DATA);
    // buildCriteria, inlined so the tool keeps the criteria order the page uses
    const crit = [];
    LEAGUE.franchises.forEach((f) => crit.push({ type: "team", key: f.key, label: f.name }));
    ACH.forEach(([key, label]) => crit.push({ type: "ach", key, label }));
    CAREER.forEach(([key, label]) => crit.push({ type: "ach", key, label }));
    CFG.positions.forEach(([k, l]) => crit.push({ type: "pos", key: k, label: l }));
    CFG.flags.forEach(([k, l]) => crit.push({ type: "flag", key: k, label: l }));
    crit.forEach((c) => (c.set = new Set()));
    S.R.forEach((p, i) => crit.forEach((c) => { if (satisfies(p, c)) c.set.add(i); }));
    S.crit = crit;
    S.teams = crit.filter((c) => c.type === "team");
    S.specials = crit.filter((c) => c.type !== "team");
    // buildBoard, minus the DOM writes
    const seed = SPORT + "|" + DATE;
    let floor = null, g = null;
    for (const f of ${JSON.stringify(FLOORS)}) {
      g = generate(f, seededRng(seed));
      if (g) { floor = f; break; }
    }
    return { rows: g.rows, cols: g.cols, R: S.R, floor };
  `;
  const run = new Function("DATA", "DATE", "LEAGUE", body);
  const { rows, cols, R, floor } = run(data, date, LEAGUE);

  const cells = [];
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      const ids = [...rows[r].set].filter((i) => cols[c].set.has(i));
      cells.push({
        row: rows[r].label, col: cols[c].label,
        n: ids.length,
        answers: ids.map((i) => R[i].name).sort(),
      });
    }
  }
  return { sport, date, floor, rows: rows.map((x) => x.label), cols: cols.map((x) => x.label), cells };
}

// ---- cli -------------------------------------------------------------------
const argv = process.argv.slice(2);
const asJson = argv.includes("--json");
const di = argv.indexOf("--date");
const date = di >= 0 ? argv[di + 1] : etDate();
const sports = argv.filter((a, i) => !a.startsWith("--") && !(di >= 0 && i === di + 1));
const targets = sports.length ? sports : ALL_SPORTS;

const out = { date, genAttempts: GEN_ATTEMPTS, floors: FLOORS, boards: [], errors: [] };
for (const s of targets) {
  try { out.boards.push(boardFor(s, date)); }
  catch (e) { out.errors.push({ sport: s, error: String((e && e.message) || e) }); }
}

let degenerate = 0, thin = 0;
if (asJson) {
  console.log(JSON.stringify(out, null, 2));
  for (const b of out.boards) for (const c of b.cells) if (c.n === 0) degenerate++;
} else {
  console.log(`board solvability · ${date} · GEN_ATTEMPTS=${GEN_ATTEMPTS} · FLOORS=[${FLOORS}]`);
  for (const b of out.boards) {
    const thinnest = Math.min(...b.cells.map((c) => c.n));
    console.log(`\n== ${b.sport.toUpperCase()} == floor=min${b.floor}  thinnest cell=${thinnest}`);
    console.log(`   rows: ${b.rows.join(" | ")}`);
    console.log(`   cols: ${b.cols.join(" | ")}`);
    for (const c of b.cells) {
      const mark = c.n === 0 ? "  *** DEGENERATE — NO VALID ANSWER ***" : c.n === 1 ? "  ** only one answer **" : c.n === 2 ? "  * thin *" : "";
      if (c.n === 0) degenerate++;
      if (c.n > 0 && c.n <= 2) thin++;
      const show = c.n <= 4 ? ` -> ${c.answers.join(", ")}` : ` -> e.g. ${c.answers.slice(0, 3).join(", ")}`;
      console.log(`   ${String(c.n).padStart(4)}  ${c.row} × ${c.col}${show}${mark}`);
    }
  }
  for (const e of out.errors) console.log(`\n!! ${e.sport}: ${e.error}`);
  console.log(`\nsummary: ${degenerate} degenerate cell(s), ${thin} cell(s) with 1-2 answers, ${out.errors.length} error(s)`);
}
process.exit(degenerate > 0 || out.errors.length ? 1 : 0);
