#!/usr/bin/env node
/* EBK · Deep Cut smoke test. Serves public/ locally, plays today's question
 * (two wrong guesses, then the right answer), and checks every day in the
 * schedule decodes and accepts its own canonical answer.
 *
 *   node tools/deep-cut-smoke.cjs            # screenshots land in the OS temp dir
 *
 * .cjs because the global playwright install does not resolve under ESM.
 */
"use strict";
// full playwright (cloud container) or playwright-core + the system Edge (Sean's PC)
let chromium, launchOpts = {};
try { ({ chromium } = require("playwright")); }
catch (e) { ({ chromium } = require("playwright-core")); launchOpts = { channel: "msedge" }; }
const { spawn } = require("child_process");
const path = require("path");
const os = require("os");

const PUB = path.join(__dirname, "..", "public");
const PORT = +(process.env.PORT || 8898);
const BASE = `http://127.0.0.1:${PORT}`;
const OUT = process.env.OUT || os.tmpdir();

(async () => {
  const srv = spawn("python", ["-m", "http.server", String(PORT), "--bind", "127.0.0.1"], { cwd: PUB, stdio: "ignore" });
  await new Promise((r) => setTimeout(r, 1200));
  const browser = await chromium.launch(launchOpts);
  let fail = 0;
  const bad = (m) => { fail++; console.log("FAIL:", m); };
  try {
    for (const vp of [{ width: 1280, height: 900, name: "desktop" }, { width: 390, height: 844, name: "phone" }]) {
      const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
      const page = await ctx.newPage();
      const errors = [];
      page.on("pageerror", (e) => errors.push(String(e)));
      await page.goto(BASE + "/deep-cut/", { waitUntil: "domcontentloaded" });
      await page.waitForSelector("#game:not([hidden])", { timeout: 10000 });
      const q = await page.textContent("#dc-q");
      if (!q || q.length < 10) bad("question text missing");
      await page.screenshot({ path: path.join(OUT, `dcut_${vp.name}_start.png`), fullPage: true });

      // every scheduled day must decode and accept its own answer
      if (vp.name === "desktop") {
        const res = await page.evaluate(async () => {
          const d = await (await fetch("/data/deep-cuts.json")).json();
          const T = window.EBKDeepCut, out = [];
          for (const day of d.days) {
            try {
              const a = T.unpack(day.x);
              let ok;
              if (a.k === "number") ok = T.parseNum(String(a.n)) === a.n;
              else ok = T.textMatch(a.a, a.acc) && a.acc.every((x) => T.textMatch(x, a.acc));
              if (!ok) out.push(day.id + " rejects its own answer");
              if (!a.h || a.h.length < 2) out.push(day.id + " hints");
            } catch (e) { out.push(day.id + " decode " + e); }
          }
          return { n: d.days.length, out };
        });
        console.log(`schedule: ${res.n} days checked`);
        res.out.forEach(bad);
      }

      const a = await page.evaluate(async () => {
        const d = await (await fetch("/data/deep-cuts.json")).json();
        const s = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());
        const i = Math.round((Date.parse(s) - Date.parse(d.start)) / 864e5);
        return window.EBKDeepCut.unpack(d.days[((i % d.days.length) + d.days.length) % d.days.length].x);
      });
      const wrong = a.k === "number" ? [String(a.n + 7), String(a.n - 3)] : ["zzzz qqqq", "Nobody Special"];
      for (const w of wrong) {
        await page.fill("#dc-input", w);
        await page.click("#dc-go");
        await page.waitForTimeout(250);
      }
      const hints = await page.$$eval(".dc-hint", (n) => n.length);
      if (hints !== 2) bad(`expected 2 hints after 2 misses, saw ${hints}`);
      if (a.k === "number") {
        const dirs = await page.$$eval(".dc-dir", (n) => n.map((x) => x.textContent));
        if (dirs.length !== 2 || !/Lower/.test(dirs[0]) || !/Higher/.test(dirs[1])) bad("higher/lower feedback " + dirs);
      }
      await page.screenshot({ path: path.join(OUT, `dcut_${vp.name}_hints.png`), fullPage: true });
      await page.fill("#dc-input", a.k === "number" ? String(a.n) : a.a.toUpperCase());
      await page.click("#dc-go");
      await page.waitForSelector("#dc-result:not([hidden])", { timeout: 5000 });
      const banner = await page.textContent("#dc-banner");
      if (!/last guess/.test(banner)) bad("banner: " + banner);
      await page.screenshot({ path: path.join(OUT, `dcut_${vp.name}_done.png`), fullPage: true });

      // reload keeps the finished state
      await page.reload({ waitUntil: "domcontentloaded" });
      await page.waitForSelector("#dc-result:not([hidden])", { timeout: 5000 }).catch(() => bad("state not restored"));
      const streak = await page.textContent("#dc-streak");
      if (streak !== "1") bad("streak chip " + streak);

      // home page daily card shows the CUT chip as done
      await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
      await page.waitForSelector(".dc-chip-cut", { timeout: 8000 }).catch(() => bad("no CUT chip on home"));
      const chip = await page.textContent(".dc-chip-cut .dc-chip-v").catch(() => "");
      if (chip !== "3/3") bad("home CUT chip " + chip);
      if (vp.name === "desktop") {
        const el = await page.$(".replay-band");
        if (el) await el.screenshot({ path: path.join(OUT, "dcut_home_band.png") });
        const dc = await page.$("#daily-card");
        if (dc) await dc.screenshot({ path: path.join(OUT, "dcut_home_card.png") });
      }
      errors.filter((e) => !/firebase|init\.json/i.test(e)).forEach((e) => bad(vp.name + " page error: " + e));
      await ctx.close();
    }
  } finally {
    await browser.close();
    srv.kill();
  }
  console.log(fail ? `${fail} failure(s)` : "deep cut smoke: all good", "| screenshots in", OUT);
  process.exit(fail ? 1 : 0);
})();
