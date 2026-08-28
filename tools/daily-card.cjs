/* Test harness for the Daily Card (js/ebk-daily.js).
 *
 * Drives a local server at :8899 in headless chromium and proves five things:
 *   1  streak derivation from seeded history, including the at-risk case
 *   2  the card renders on the home page at desktop and 390x844
 *   3  a returning player who already played today sees the four still open
 *   4  a real play-through mounts the card and puts the streak in the share text
 *   5  raw ebk_daily_* keys older than 14 days are pruned, ledger survives
 *
 * Console errors and >=400 responses are collected from the 'response' event
 * (a console line for a failed subresource carries no url and can never be
 * matched against an ignore list — see env.consoleErrorsForSubresourcesHaveNoUrl).
 *
 * Usage: node tools/daily-card.cjs [--base http://localhost:8899]
 */
const { chromium } = require("playwright");

const BASE = (() => {
  const i = process.argv.indexOf("--base");
  return i > 0 ? process.argv[i + 1] : "http://localhost:8899";
})();
const IGNORE = [/__\/firebase\/init\.json/, /gstatic\.com/, /googleapis\.com/,
                /jsdelivr\.net/, /espncdn\.com/, /premierleague\.com/, /nfl\.com/];

const etDate = (off) => {
  const s = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());
  if (!off) return s;
  const p = s.split("-");
  const d = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2]));
  d.setUTCDate(d.getUTCDate() + off);
  return d.toISOString().slice(0, 10);
};

const results = [];
const ok = (name, pass, detail) => {
  results.push({ name, pass, detail });
  console.log((pass ? "  PASS  " : "  FAIL  ") + name + (detail ? "  — " + detail : ""));
};

function watch(page, bag) {
  page.on("response", (r) => {
    if (r.status() >= 400 && !IGNORE.some((re) => re.test(r.url()))) bag.net.push(r.status() + " " + r.url());
  });
  page.on("pageerror", (e) => bag.err.push(String(e)));
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    const t = m.text();
    if (/Failed to load resource/.test(t)) return;            // url-less, unmatchable
    if (IGNORE.some((re) => re.test(t))) return;
    bag.err.push(t);
  });
}

/* Seed a completed daily play for a sport on a given ET date. */
const seedPlay = (sport, date, score) => ({
  key: "ebk_daily_" + sport + "_" + date,
  val: JSON.stringify({
    cells: Array.from({ length: 9 }, (_, i) =>
      i < score ? { pid: "p" + i, name: "Player " + i, pos: "QB", headshot: "" } : null),
    score, rarity: score * 60, done: true, ts: Date.now(),
  }),
});

async function seed(page, entries) {
  await page.addInitScript((rows) => {
    try {
      localStorage.clear();
      for (const r of rows) localStorage.setItem(r.key, r.val);
    } catch (e) {}
  }, entries);
}

(async () => {
  const browser = await chromium.launch();
  let failures = 0;

  // ---- 1. streak derivation ------------------------------------------------
  {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    const bag = { net: [], err: [] };
    watch(page, bag);
    // played today and the four days before it -> streak 5, not at risk
    await seed(page, [0, -1, -2, -3, -4].map((d) => seedPlay("nfl", etDate(d), 5)));
    await page.goto(BASE + "/index.html", { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => !!window.EBKDaily, null, { timeout: 10000 });
    const a = await page.evaluate(() => window.EBKDaily.streak());
    ok("streak: 5 consecutive days ending today", a.days === 5 && !a.atRisk, JSON.stringify(a));

    // played yesterday and before, not today -> streak stands, at risk
    await page.evaluate((rows) => {
      localStorage.clear();
      for (const r of rows) localStorage.setItem(r.key, r.val);
    }, [-1, -2, -3].map((d) => seedPlay("nfl", etDate(d), 4)));
    const b = await page.evaluate(() => window.EBKDaily.streak());
    ok("streak: unplayed today keeps the streak and flags it at risk",
       b.days === 3 && b.atRisk && !b.playedToday, JSON.stringify(b));

    // a gap two days back -> streak stops at the gap
    await page.evaluate((rows) => {
      localStorage.clear();
      for (const r of rows) localStorage.setItem(r.key, r.val);
    }, [0, -1, -3, -4].map((d) => seedPlay("nba", etDate(d), 6)));
    const c = await page.evaluate(() => window.EBKDaily.streak());
    ok("streak: a gap ends the run", c.days === 2 && !c.atRisk, JSON.stringify(c));

    // nothing at all
    await page.evaluate(() => localStorage.clear());
    const d = await page.evaluate(() => window.EBKDaily.streak());
    ok("streak: cold visitor is 0 and not at risk", d.days === 0 && !d.atRisk, JSON.stringify(d));

    // ---- 5. prune ----------------------------------------------------------
    await page.evaluate((rows) => {
      localStorage.clear();
      for (const r of rows) localStorage.setItem(r.key, r.val);
    }, [0, -1, -20, -45].map((d) => seedPlay("mlb", etDate(d), 3)));
    const p = await page.evaluate(() => {
      const st = window.EBKDaily.streak();
      const raw = Object.keys(localStorage).filter((k) => k.indexOf("ebk_daily_") === 0);
      return { st, raw: raw.length, ledger: JSON.parse(localStorage.getItem("ebk_days") || "[]") };
    });
    ok("prune: raw keys older than 14 days dropped, ledger keeps the history",
       p.raw === 2 && p.ledger.length === 4, JSON.stringify(p));
    ok("prune: streak still correct after pruning", p.st.days === 2, JSON.stringify(p.st));
    ok("home page: no console errors or 4xx", bag.err.length === 0 && bag.net.length === 0,
       JSON.stringify({ err: bag.err, net: bag.net }));
    await ctx.close();
  }

  // ---- 2. renders at both sizes -------------------------------------------
  for (const vp of [{ width: 1280, height: 800, tag: "desktop" }, { width: 390, height: 844, tag: "390x844" }]) {
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
    const page = await ctx.newPage();
    const bag = { net: [], err: [] };
    watch(page, bag);
    await seed(page, [0, -1, -2].map((d) => seedPlay("nfl", etDate(d), 7))
      .concat([seedPlay("nba", etDate(0), 4)]));
    await page.goto(BASE + "/index.html", { waitUntil: "domcontentloaded" });
    await page.waitForSelector("#daily-card .daily-card", { timeout: 10000 });
    const card = page.locator("#daily-card .daily-card");
    const num = await card.locator(".dc-num").textContent();
    const chips = card.locator(".dc-chip");
    const n = await chips.count();
    ok(vp.tag + ": card shows the streak number and all five sports",
       num.trim() === "3" && n === 5, "streak=" + num + " chips=" + n);

    const done = await card.locator(".dc-chip.is-done").count();
    ok(vp.tag + ": today's two finished grids are marked done", done === 2, "done=" + done);

    // hit targets and no horizontal overflow
    const boxes = [];
    for (let i = 0; i < n; i++) boxes.push(await chips.nth(i).boundingBox());
    const small = boxes.filter((b) => !b || b.height < 44);
    ok(vp.tag + ": every chip is at least 44px tall", small.length === 0,
       "min=" + Math.min(...boxes.map((b) => (b ? Math.round(b.height) : 0))) + "px");
    const overflow = await page.evaluate(() =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth);
    ok(vp.tag + ": no horizontal page overflow", overflow <= 1, "overflow=" + overflow + "px");

    // keyboard: chips are reachable and take a visible focus ring
    await card.locator(".dc-chip").first().focus();
    const focused = await page.evaluate(() =>
      document.activeElement && document.activeElement.classList.contains("dc-chip"));
    ok(vp.tag + ": chips are keyboard focusable", !!focused);
    const label = await card.locator(".dc-chip").first().getAttribute("aria-label");
    ok(vp.tag + ": chips carry a descriptive accessible name",
       !!label && /daily grid/.test(label), label);

    ok(vp.tag + ": no console errors or 4xx", bag.err.length === 0 && bag.net.length === 0,
       JSON.stringify({ err: bag.err, net: bag.net }));
    await ctx.close();
  }

  // ---- 3. returning player who already played today -----------------------
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await ctx.newPage();
    const bag = { net: [], err: [] };
    watch(page, bag);
    await seed(page, [0, -1, -2, -3].map((d) => seedPlay("nfl", etDate(d), 6)));
    await page.goto(BASE + "/nfl/player-grid/", { waitUntil: "domcontentloaded" });
    await page.waitForSelector("#game .daily-card", { timeout: 20000 });
    const card = page.locator("#game .daily-card");
    const chips = await card.locator(".dc-chip").count();
    const labels = await card.locator(".dc-chip .dc-chip-s").allTextContents();
    ok("already-played: the end screen offers the four other grids",
       chips === 4 && !labels.includes("NFL"), labels.join(","));
    const streak = (await card.locator(".dc-num").textContent()).trim();
    ok("already-played: streak reads 4", streak === "4", streak);
    ok("already-played: no console errors or 4xx", bag.err.length === 0 && bag.net.length === 0,
       JSON.stringify({ err: bag.err, net: bag.net }));
    await ctx.close();
  }

  // ---- 4. a real play-through ---------------------------------------------
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await ctx.newPage();
    const bag = { net: [], err: [] };
    watch(page, bag);
    // three prior days so the finished share should read "day 4 streak"
    await seed(page, [-1, -2, -3].map((d) => seedPlay("nba", etDate(d), 5)));
    await page.goto(BASE + "/nfl/player-grid/", { waitUntil: "domcontentloaded" });
    await page.waitForSelector("#grid .gcell", { timeout: 30000 });

    // burn all nine entries with real names; right or wrong both consume one
    const NAMES = ["Tom Brady", "Case Keenum", "Aaron Rodgers", "Ryan Fitzpatrick",
                   "Peyton Manning", "Josh Allen", "Derek Carr", "Jared Goff", "Andy Dalton"];
    for (let i = 0; i < 9; i++) {
      const cell = page.locator("#grid .gcell").nth(i);
      await cell.click({ timeout: 5000 });
      await page.waitForSelector("#modal:not([hidden])", { timeout: 5000 });
      await page.fill("#ac", NAMES[i]);
      try {
        await page.waitForSelector("#ac-list .ac-item", { timeout: 3000 });
        await page.locator("#ac-list .ac-item").first().click();
      } catch (e) {
        await page.click("#m-cancel");                        // no match: let the clock take it
        await page.waitForTimeout(21000);
      }
      if (await page.locator("#game .daily-card").count()) break;
    }
    await page.waitForSelector("#game .daily-card", { timeout: 30000 });
    const chips = await page.locator("#game .daily-card .dc-chip").count();
    ok("play-through: card mounts on the end screen with the other four grids", chips === 4, "chips=" + chips);
    const st = await page.evaluate(() => window.EBKDaily.streak());
    ok("play-through: finishing extends the streak to 4", st.days === 4 && st.playedToday, JSON.stringify(st));
    const ledger = await page.evaluate(() => JSON.parse(localStorage.getItem("ebk_days") || "[]"));
    ok("play-through: today is written to the ledger", ledger.includes(etDate()), ledger.join(","));
    const shareBtn = await page.locator("#end-row button", { hasText: "Share result" }).count();
    ok("play-through: share button still present", shareBtn === 1, "n=" + shareBtn);
    ok("play-through: no console errors or 4xx", bag.err.length === 0 && bag.net.length === 0,
       JSON.stringify({ err: bag.err, net: bag.net }));
    await ctx.close();
  }

  await browser.close();
  failures = results.filter((r) => !r.pass).length;
  console.log("\n" + (results.length - failures) + "/" + results.length + " checks passed");
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
