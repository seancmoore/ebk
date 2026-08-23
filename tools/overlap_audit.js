/* Overlap audit: serves public/ statically, loads pages at several viewport
   sizes, and reports interactive elements whose boxes intersect. */
const http = require("http");
const fs = require("fs");
const path = require("path");
const puppeteer = require(require("path").join(process.env.APPDATA, "npm", "node_modules", "puppeteer-core"));

const ROOT = path.join(__dirname, "..", "public");
const MIME = { html: "text/html", css: "text/css", js: "text/javascript", json: "application/json", svg: "image/svg+xml", png: "image/png", ico: "image/x-icon", csv: "text/csv" };

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split("?")[0]);
  let file = path.join(ROOT, p);
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, "index.html");
  if (!fs.existsSync(file)) { res.writeHead(404); res.end("nf"); return; }
  const ext = path.extname(file).slice(1);
  res.writeHead(200, { "content-type": MIME[ext] || "application/octet-stream" });
  fs.createReadStream(file).pipe(res);
});

const VIEWPORTS = [
  { name: "desktop-1440x900", w: 1440, h: 900 },
  { name: "desktop-short-1366x625", w: 1366, h: 625 },
  { name: "mobile-390x844", w: 390, h: 844, mobile: true },
  { name: "mobile-short-390x660", w: 390, h: 660, mobile: true },
  { name: "mobile-small-360x640", w: 360, h: 640, mobile: true },
];

const PAGES = [
  { url: "/", label: "home" },
  { url: "/nfl", label: "nfl-hub" },
  { url: "/nfl/higher-lower", label: "hl-start" },
  { url: "/nfl/higher-lower", label: "hl-game", play: "hl" },
  { url: "/nfl/stat-line", label: "stat-line", play: "quiz" },
  { url: "/nfl/career-path", label: "career-path", play: "quiz" },
  { url: "/nfl/player-grid", label: "player-grid" },
  { url: "/h2h", label: "h2h" },
  { url: "/leaderboard", label: "leaderboard" },
];

async function collectOverlaps(page) {
  return page.evaluate(() => {
    const SEL = "button, a, input, [role=button]";
    const els = [...document.querySelectorAll(SEL)].filter((e) => {
      const r = e.getBoundingClientRect();
      if (r.width < 4 || r.height < 4) return false;
      const cs = getComputedStyle(e);
      if (cs.visibility === "hidden" || cs.display === "none" || +cs.opacity === 0) return false;
      return true;
    });
    const desc = (e) => {
      let t = e.tagName.toLowerCase();
      if (e.id) t += "#" + e.id;
      if (e.className && typeof e.className === "string") t += "." + e.className.trim().split(/\s+/).join(".");
      const tx = (e.textContent || "").trim().slice(0, 25);
      return t + (tx ? ` "${tx}"` : "");
    };
    const out = [];
    for (let i = 0; i < els.length; i++) {
      for (let j = i + 1; j < els.length; j++) {
        const a = els[i], b = els[j];
        if (a.contains(b) || b.contains(a)) continue;
        const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
        const x = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left);
        const y = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
        if (x > 2 && y > 2) out.push({ a: desc(a), b: desc(b), ox: Math.round(x), oy: Math.round(y) });
      }
    }
    // also: interactive elements clipped/covered by others (elementFromPoint test at center)
    const covered = [];
    for (const e of els) {
      const r = e.getBoundingClientRect();
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      if (cx < 0 || cy < 0 || cx > innerWidth || cy > innerHeight) continue;
      const top = document.elementFromPoint(cx, cy);
      if (top && top !== e && !e.contains(top) && !top.contains(e)) {
        covered.push({ el: desc(e), by: desc(top) });
      }
    }
    return { overlaps: out, covered, scrollH: document.documentElement.scrollHeight, innerH: innerHeight };
  });
}

(async () => {
  await new Promise((r) => server.listen(4173, r));
  const exe = "C:/Program Files/Google/Chrome/Application/chrome.exe";
  const browser = await puppeteer.launch({ executablePath: exe, headless: "new" });
  const report = [];
  for (const vp of VIEWPORTS) {
    const page = await browser.newPage();
    await page.setViewport({ width: vp.w, height: vp.h, isMobile: !!vp.mobile, hasTouch: !!vp.mobile });
    for (const pg of PAGES) {
      try {
        await page.goto("http://localhost:4173" + pg.url, { waitUntil: "networkidle2", timeout: 20000 });
        await new Promise((r) => setTimeout(r, 900));
        if (pg.play === "hl") {
          const started = await page.evaluate(() => {
            const c = document.querySelector("#category-grid .cat-card");
            if (c) { c.click(); return true; }
            return false;
          });
          if (!started) { report.push({ vp: vp.name, page: pg.label, error: "no cat-card (data not loaded)" }); continue; }
          await new Promise((r) => setTimeout(r, 900));
        }
        if (pg.play === "quiz") {
          await page.evaluate(() => {
            const b = [...document.querySelectorAll("button")].find((x) => /start|play/i.test(x.textContent));
            if (b) b.click();
          });
          await new Promise((r) => setTimeout(r, 900));
        }
        const res = await collectOverlaps(page);
        report.push({ vp: vp.name, page: pg.label, ...res });
        const shot = path.join(__dirname, "shots", `${pg.label}--${vp.name}.png`);
        fs.mkdirSync(path.dirname(shot), { recursive: true });
        await page.screenshot({ path: shot, fullPage: false });
      } catch (e) {
        report.push({ vp: vp.name, page: pg.label, error: String(e).slice(0, 200) });
      }
    }
    await page.close();
  }
  await browser.close();
  server.close();
  fs.writeFileSync(path.join(__dirname, "overlap_report.json"), JSON.stringify(report, null, 2));
  for (const r of report) {
    const n = (r.overlaps || []).length, c = (r.covered || []).length;
    if (r.error) console.log(`[ERR ] ${r.page} @ ${r.vp}: ${r.error}`);
    else if (n || c) console.log(`[HIT ] ${r.page} @ ${r.vp}: ${n} overlaps, ${c} covered`);
    else console.log(`[ ok ] ${r.page} @ ${r.vp}`);
  }
})();
