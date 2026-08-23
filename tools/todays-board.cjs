#!/usr/bin/env node
/**
 * todays-board — print the exact daily grid a visitor will see, as JSON.
 *
 * Why this exists: the noon Instagram reel is supposed to feature the real
 * board, so that someone who watches it can go and play *that* grid. It used to
 * read the board by opening the live site, which a scheduled run cannot do —
 * the egress allowlist blocks the domain and there is no browser bridge — so it
 * silently fell back to posting evergreen buffer content instead.
 *
 * It never needed the live site. The board is generated client-side by
 * `seededRng(SPORT + "|" + etDate())` over the checked-in player data, so this
 * repo plus today's date is the whole input. Serve `public/`, load the page,
 * read the headers back out of the DOM: byte-for-byte the board the site shows.
 *
 *   node tools/todays-board.cjs nfl
 *   node tools/todays-board.cjs nfl nba mlb
 *
 * Output: {"date","boards":[{"sport","cols","rows"}],"errors":[]}
 *
 * Requires Playwright (present in the session container; write callers as .cjs,
 * ESM `import` will not resolve the global install).
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', 'public');
const SPORTS = process.argv.slice(2).filter(Boolean);
if (!SPORTS.length) SPORTS.push('nfl');

const TYPES = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2',
};

// Hosting has cleanUrls; this mirrors it so paths resolve the same way locally.
function resolveFile(urlPath) {
  const clean = decodeURIComponent(urlPath.split('?')[0]);
  const candidates = [
    path.join(ROOT, clean),
    path.join(ROOT, clean, 'index.html'),
    path.join(ROOT, clean + '.html'),
  ];
  for (const c of candidates) {
    if (!c.startsWith(ROOT)) continue;               // no traversal out of public/
    try { if (fs.statSync(c).isFile()) return c; } catch (e) { /* next */ }
  }
  return null;
}

const server = http.createServer((req, res) => {
  const file = resolveFile(req.url);
  if (!file) { res.writeHead(404); return res.end('not found'); }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});

(async () => {
  const { chromium } = require('playwright');
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;

  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 900, height: 1200 } });
  const out = { date: null, boards: [], errors: [] };

  for (const sport of SPORTS) {
    const page = await ctx.newPage();
    page.on('pageerror', e => out.errors.push(`${sport}: ${String(e).slice(0, 160)}`));
    try {
      await page.goto(`${base}/${sport}/player-grid/`, { waitUntil: 'domcontentloaded', timeout: 45000 });
      // The data files are large; wait for the board to actually exist rather
      // than for the network, which never settles without Firebase present.
      await page.waitForFunction(
        () => document.querySelectorAll('#grid .gcell').length >= 9,
        { timeout: 60000 }
      );

      const board = await page.evaluate(() => {
        const txt = el => (el.textContent || '').trim().replace(/\s+/g, ' ');
        // #grid lays out: corner, 3 column heads, then each row head followed by
        // its three cells. So the heads in document order are [corner, c1..c3, r1..r3].
        const heads = [...document.querySelectorAll('#grid .gh')].map(txt);
        const status = txt(document.querySelector('#status-line'));
        const withoutCorner = heads.slice(1);
        return {
          cols: withoutCorner.slice(0, 3),
          rows: withoutCorner.slice(3, 6),
          date: (status.match(/(\d{4}-\d{2}-\d{2})/) || [])[1] || null,
        };
      });

      if (board.cols.filter(Boolean).length !== 3 || board.rows.filter(Boolean).length !== 3) {
        out.errors.push(`${sport}: read ${board.cols.length} cols / ${board.rows.length} rows, expected 3 and 3`);
      } else {
        out.date = out.date || board.date;
        out.boards.push({ sport, cols: board.cols, rows: board.rows });
      }
    } catch (e) {
      out.errors.push(`${sport}: ${String(e.message || e).slice(0, 200)}`);
    }
    await page.close();
  }

  await browser.close();
  server.close();
  console.log(JSON.stringify(out, null, 2));
  // Non-zero only if nothing at all could be read, so a caller can branch on it.
  process.exit(out.boards.length ? 0 : 1);
})();
