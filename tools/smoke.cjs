#!/usr/bin/env node
/* EBK · game smoke test. Drives the real games in a real browser against a
 * local static server, so a scheduled run can tell "the page returned 200"
 * from "the game actually works".
 *
 *   node tools/smoke.cjs                 # default rotation
 *   node tools/smoke.cjs soccer nfl cfb  # named sports
 *
 * Must be .cjs — the global playwright install does not resolve under ESM.
 * Paths need a TRAILING SLASH locally: Hosting has cleanUrls, python's
 * http.server does not. Never run `playwright install`; chromium is already at
 * PLAYWRIGHT_BROWSERS_PATH.
 *
 * Gotchas encoded here so nobody rediscovers them the hard way:
 *  · higher-lower opens on #screen-start. Wait for '#category-grid:not([hidden])'
 *    (hidden until player data loads), click a tile, wait for
 *    '#screen-game.is-active', and then wait for '.guess-btn.higher' to be
 *    VISIBLE — .is-active lands before the card entrance finishes, so the
 *    buttons exist but are not yet clickable.
 *  · the H/L counter is #streak. There is no #score and no #hl-score. A locator
 *    matching nothing blocks for the full 30s default timeout, during which the
 *    round times out underneath you and the guess buttons hide again — which
 *    then presents as a broken game when nothing is wrong. Read with an
 *    explicit short timeout.
 *  · a console error for a failed subresource carries NO url, so it can never
 *    be matched against an ignore list. Failing urls come from the response
 *    event instead.
 *  · player-grid autocomplete needs 2+ characters before renderAC suggests.
 *  · cfb has no player-grid, deliberately.
 */
"use strict";
const { chromium } = require("playwright");
const { spawn } = require("child_process");
const path = require("path");

const PUB = path.join(__dirname, "..", "public");
const PORT = +(process.env.PORT || 8899);
const BASE = `http://127.0.0.1:${PORT}`;
const GRID_SPORTS = new Set(["nfl", "nba", "mlb", "nhl", "soccer"]);

const IGNORE = [
  /__\/firebase\/init\.json/,          // live-domain only
  /ERR_TUNNEL_CONNECTION_FAILED/,      // container egress, not the site
  /net::ERR_(NAME_NOT_RESOLVED|CONNECTION_REFUSED|BLOCKED)/,
  /jsdelivr|gstatic|googleapis|espncdn|premierleague\.com|nfl\.com/,
];
const noise = (t) => IGNORE.some((re) => re.test(t));

const results = [];
const ok = (n) => { results.push([true, n]); console.log("  ok   " + n); };
const bad = (n, e) => { results.push([false, n + (e ? " :: " + e : "")]); console.log("  FAIL " + n + (e ? " :: " + e : "")); };

async function withPage(browser, url, fn) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errs = [];
  const bad4xx = [];
  page.on("response", (r) => { if (r.status() >= 400 && !noise(r.url())) bad4xx.push(r.status() + " " + r.url()); });
  page.on("console", (m) => {
    const t = m.text();
    if (m.type() !== "error") return;
    if (noise(t)) return;
    if (/Failed to load resource/i.test(t)) return; // url-less; reported via bad4xx
    errs.push("console: " + t);
  });
  page.on("pageerror", (e) => { if (!noise(String(e))) errs.push("EXCEPTION: " + String((e && e.message) || e)); });
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
    await fn(page);
  } finally {
    for (const e of errs) bad(url + " " + e);
    for (const f of bad4xx) bad(url + " subresource " + f);
    if (!errs.length && !bad4xx.length) ok(url + " — clean console");
    await page.close();
  }
}

async function playerGrid(browser, sport) {
  const url = `${BASE}/${sport}/player-grid/`;
  await withPage(browser, url, async (page) => {
    await page.waitForSelector("#grid .gcell", { timeout: 45000 });
    const cells = await page.locator("#grid .gcell").count();
    cells === 9 ? ok(`${sport} grid: 9 cells`) : bad(`${sport} grid: expected 9 cells, got ${cells}`);
    const heads = await page.locator("#grid .gh").count();
    heads >= 6 ? ok(`${sport} grid: ${heads} axis headers render`) : bad(`${sport} grid: only ${heads} headers`);
    await page.locator("#grid .gcell").first().click();
    await page.waitForSelector("#modal #ac", { timeout: 15000 });
    await page.fill("#modal #ac", "aa");
    await page.waitForTimeout(600);
    const sugg = await page.locator("#ac-list .ac-item").count();
    sugg > 0 ? ok(`${sport} grid: autocomplete suggests (${sugg})`) : bad(`${sport} grid: autocomplete empty for "aa"`);
    const before = await page.locator("#entries").textContent({ timeout: 3000 }).catch(() => null);
    await page.locator("#ac-list .ac-item").first().click().catch(() => {});
    await page.waitForTimeout(1200);
    const after = await page.locator("#entries").textContent({ timeout: 3000 }).catch(() => null);
    after !== before ? ok(`${sport} grid: a guess registers (entries ${before} -> ${after})`)
                     : bad(`${sport} grid: guess did not consume an entry (entries stayed ${before})`);
  });
}

async function higherLower(browser, sport) {
  const url = `${BASE}/${sport}/higher-lower/`;
  await withPage(browser, url, async (page) => {
    await page.waitForSelector("#category-grid:not([hidden])", { timeout: 60000 });
    ok(`${sport} H/L: category gate loads`);
    await page.locator("#category-grid button, #category-grid .cat, #category-grid [data-cat]").first().click();
    await page.waitForSelector("#screen-game.is-active", { timeout: 30000 });
    await page.waitForSelector(".guess-btn.higher", { state: "visible", timeout: 30000 });
    ok(`${sport} H/L: a round starts`);
    const read = () => page.locator("#streak").first().textContent({ timeout: 2000 }).catch(() => null);
    const scoreBefore = await read();
    await page.locator(".guess-btn.higher").click({ timeout: 15000 });
    await page.waitForTimeout(1800);
    const scoreAfter = await read();
    const over = await page.locator("#screen-over.is-active").count();
    (scoreAfter !== scoreBefore || over === 1)
      ? ok(`${sport} H/L: a pick resolves (streak ${scoreBefore} -> ${scoreAfter}${over ? ", round ended" : ""})`)
      : bad(`${sport} H/L: pick did nothing (streak stayed ${scoreBefore})`);
  });
}

async function simple(browser, sport, mode, readySel) {
  const url = `${BASE}/${sport}/${mode}/`;
  await withPage(browser, url, async (page) => {
    await page.waitForSelector(readySel, { timeout: 60000 });
    const txt = (await page.locator("body").innerText()).trim();
    txt.length > 40 ? ok(`${sport} ${mode}: loads real content (${txt.length} chars)`)
                    : bad(`${sport} ${mode}: page is empty`);
  });
}

async function plain(browser, p) {
  await withPage(browser, `${BASE}${p}`, async (page) => {
    await page.waitForLoadState("load", { timeout: 45000 });
    await page.waitForTimeout(1500);
    const txt = (await page.locator("body").innerText()).trim();
    txt.length > 20 ? ok(`${p}: renders signed-out (${txt.length} chars)`) : bad(`${p}: empty`);
  });
}

(async () => {
  const sports = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const targets = sports.length ? sports : ["soccer", "nba", "cfb"];
  const srv = spawn("python3", ["-m", "http.server", String(PORT), "--bind", "127.0.0.1"], { cwd: PUB, stdio: "ignore" });
  await new Promise((r) => setTimeout(r, 1200));
  const browser = await chromium.launch();
  try {
    for (const s of targets) {
      console.log(`\n--- ${s} ---`);
      // one broken sport must not abort the rest of the sweep
      const step = async (label, fn) => { try { await fn(); } catch (e) { bad(`${s} ${label}`, String((e && e.message) || e).split("\n")[0]); } };
      if (GRID_SPORTS.has(s)) await step("player-grid", () => playerGrid(browser, s));
      else console.log(`  (skip ${s} player-grid — deliberately absent)`);
      await step("higher-lower", () => higherLower(browser, s));
      await step("career-path", () => simple(browser, s, "career-path", "#cp, #career, .cp-stage, main"));
      await step("stat-line", () => simple(browser, s, "stat-line", "#sl, .sl-stage, main"));
    }
    console.log("\n--- shared pages ---");
    await plain(browser, "/h2h/");
    await plain(browser, "/leaderboard/");
  } catch (e) {
    bad("harness", String((e && e.message) || e));
  } finally {
    await browser.close();
    srv.kill();
  }
  const fails = results.filter((r) => !r[0]);
  console.log(`\n${results.length - fails.length}/${results.length} assertions green`);
  if (fails.length) { console.log("FAILURES:"); fails.forEach((f) => console.log("  - " + f[1])); }
  process.exit(fails.length ? 1 : 0);
})();
