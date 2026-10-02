#!/usr/bin/env node
/* EBK · board solvability check.
 *
 * Rebuilds today's player-grid board for any sport straight from the checked-in
 * data and prints the ACTUAL answer list for all nine cells, so a scheduled run
 * can tell a fair board from a degenerate or unfairly-thin one without a
 * browser and without the live site.
 *
 * It does NOT reimplement the game. CFG, seededRng, buildRoster, satisfies,
 * fits, enough and generate are sliced out of public/js/player-grid.js at run
 * time and eval'd, and the franchise helpers are eval'd out of
 * public/js/<sport>-teams.js, so this tool cannot drift from what ships.
 *
 *   node tools/solvable.cjs                 # all five grid sports, today (ET)
 *   node tools/solvable.cjs soccer nfl      # named sports
 *   node tools/solvable.cjs --date 2026-09-01 soccer
 *   node tools/solvable.cjs --json          # machine-readable
 *
 * Exit code 1 if any cell in any checked board has ZERO valid answers, or if
 * a sport's grid-roster.json (the precomputed roster the page loads first) no
 * longer matches what its players.json builds.
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
const ROSTER_FILE = (s) => path.join(path.dirname(DATA_FILE(s)), "grid-roster.json");

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
const FN_SRC = ["seededRng", "buildRoster", "hydrateRoster", "finishRoster", "satisfies", "fits", "enough", "generate"]
  .map((n) => slice(new RegExp("^  function " + n + "\\(", "m"), /^  \}$/m, n))
  .join("\n");
const CONST_SRC = ["shuffle", "normPos", "posOf", "foldW", "foldC", "teamPosPair"]
  .map((n) => slice(new RegExp("^  const " + n + " = ", "m"), /;$/m, n))
  .join("\n");
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

// The roster + board machinery for one sport, built either from the dataset
// (buildRoster, what the page falls back to) or from the precomputed
// grid-roster.json (hydrateRoster, what the page loads first).
function engine(sport, src) {
  const teamsSrc = fs.readFileSync(path.join(PUB, "js", TEAM_FILE[sport]), "utf8");
  const sandboxWindow = {};
  new Function("window", teamsSrc)(sandboxWindow);
  const LEAGUE = sandboxWindow[sport.toUpperCase()];
  if (!LEAGUE) throw new Error("no league helper for " + sport);

  const file = src === "roster" ? ROSTER_FILE(sport) : DATA_FILE(sport);
  const input = JSON.parse(fs.readFileSync(file, "utf8"));
  if (src !== "roster") inflate(input);

  const body = `
    const SPORT = ${JSON.stringify(sport)};
    ${CFG_SRC}
    const ACH = CFG.ach;
    const CAREER = CFG.careerAch || [];
    const CAREER_COLS = [...new Set(CAREER.map((x) => x[2]))];
    const S = { R: [], crit: [], teams: [], specials: [] };
    const GEN_ATTEMPTS = ${GEN_ATTEMPTS};
    ${CONST_SRC}
    ${FN_SRC}
    if (ROSTER) hydrateRoster(INPUT); else buildRoster(INPUT);
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
    // buildBoard, minus the DOM writes (generate only reads S, so this can
    // be called for many dates)
    function board(DATE) {
      const seed = SPORT + "|" + DATE;
      let floor = null, g = null;
      for (const f of ${JSON.stringify(FLOORS)}) {
        g = generate(f, seededRng(seed));
        if (g) { floor = f; break; }
      }
      return { rows: g.rows, cols: g.cols, floor };
    }
    return { R: S.R, fits, board };
  `;
  return new Function("INPUT", "ROSTER", "LEAGUE", body)(input, src === "roster", LEAGUE);
}

// EBKD.inflate (public/js/ebk-loader.js), for slimmed datasets
function inflate(d) {
  const pre = d.hsPrefix || "", cols = d.statCols || [];
  for (const r of d.players || []) {
    if (pre && r.headshot && r.headshot[0] === "~") r.headshot = pre + r.headshot.slice(1);
    if (r.z) { const s = r.stats || (r.stats = {}); for (const i of r.z) s[cols[i]] = 0; delete r.z; }
  }
  return d;
}

// grid-roster.json rows, in the order hydrateRoster() reads them
function serializeRoster(R) {
  // hoist the most common headshot directory
  const cnt = {};
  for (const a of R) { const m = a.headshot && a.headshot.match(/^(.*\/)/); if (m) cnt[m[1]] = (cnt[m[1]] || 0) + 1; }
  const pre = (Object.entries(cnt).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0] || [""])[0];
  const players = R.map((a) => {
    const tp = [...a.teamPos].map(([t, s]) => [t, [...s]]);
    const inTp = new Set(tp.flatMap(([, ps]) => ps));
    const extra = [...a.positions].filter((x) => !inTp.has(x));
    const hs = a.headshot ? (pre && a.headshot.startsWith(pre) ? "~" + a.headshot.slice(pre.length) : a.headshot) : 0;
    const row = [a.id, a.name, a.pos, hs, tp, [...a.ach], (a.r1 ? 1 : 0) | (a.undrafted ? 2 : 0), a.min, a.max];
    if (extra.length || a.alts.size) row.push(extra.length ? extra : 0);
    if (a.alts.size) row.push([...a.alts]);
    return row;
  });
  return { hsPrefix: pre, players };
}

function cellsOf(eng, b) {
  const { rows, cols } = b, R = eng.R, cells = [];
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      const ids = [...rows[r].set].filter((i) => cols[c].set.has(i) && eng.fits(R[i], rows[r], cols[c]));
      cells.push({
        row: rows[r].label, col: cols[c].label,
        n: ids.length,
        answers: ids.map((i) => R[i].name).sort(),
        ids: ids.map((i) => R[i].id).sort(),
      });
    }
  }
  return cells;
}

function boardFor(sport, date, eng) {
  eng = eng || engine(sport, "data");
  const b = eng.board(date);
  return { sport, date, floor: b.floor, rows: b.rows.map((x) => x.label), cols: b.cols.map((x) => x.label), cells: cellsOf(eng, b) };
}

// The page loads grid-roster.json first, so it must be exactly what the
// current dataset builds. Returns an error string, or null when it matches.
function rosterCheck(sport, eng, date) {
  if (!fs.existsSync(ROSTER_FILE(sport))) return "missing " + path.relative(ROOT, ROSTER_FILE(sport));
  const J = JSON.parse(fs.readFileSync(ROSTER_FILE(sport), "utf8"));
  const want = serializeRoster(eng.R);
  if (JSON.stringify([J.hsPrefix, J.players]) !== JSON.stringify([want.hsPrefix, want.players]))
    return path.relative(ROOT, ROSTER_FILE(sport)) + " is stale (run node tools/build_grid_roster.cjs)";
  const a = JSON.stringify(boardFor(sport, date, eng)), b = JSON.stringify(boardFor(sport, date, engine(sport, "roster")));
  return a === b ? null : "board from grid-roster.json differs from the dataset board";
}

module.exports = { ALL_SPORTS, DATA_FILE, ROSTER_FILE, engine, serializeRoster, boardFor, rosterCheck };
if (require.main !== module) return;

// ---- cli -------------------------------------------------------------------
const argv = process.argv.slice(2);
const asJson = argv.includes("--json");
const di = argv.indexOf("--date");
const date = di >= 0 ? argv[di + 1] : etDate();
const sports = argv.filter((a, i) => !a.startsWith("--") && !(di >= 0 && i === di + 1));
const targets = sports.length ? sports : ALL_SPORTS;

const out = { date, genAttempts: GEN_ATTEMPTS, floors: FLOORS, boards: [], errors: [] };
for (const s of targets) {
  try {
    const eng = engine(s, "data");
    out.boards.push(boardFor(s, date, eng));
    const bad = rosterCheck(s, eng, date);
    if (bad) out.errors.push({ sport: s, error: bad });
  }
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
