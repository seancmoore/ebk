// EBK Deep Bag v2 · 1200x630 share card (og:image) in the v2 look.
// Renders an HTML template with system Microsoft Edge via puppeteer-core (installed globally).
//
//   node tools/deep-bag-share.cjs --title "The Fresh-Start Myth" \
//        --line "243 NFL trades, each against five players who stayed put." \
//        --stat "-3.5" --stat-label "fpts a game behind peers for players traded into a smaller job" \
//        [--accent "#3ddc97"] [--sport NFL] [--motif field|stadium|bubbles|ridges|plain] --out path/to/share.png
//
// --motif matches the study's hero scene: field (football, the default), stadium (revenge-game),
// bubbles (champagne-no-hangover), ridges (the-cliff), plain (a dotted floor, any sport).
// --art <image> instead puts a rendered still of the study's own hero behind the card (the-cliff
// since 2026-10-09: ebk-age-cliff/outputs/hero/cliff_share_art.png).
// Reliability: fonts are loaded with display=block and awaited (document.fonts.ready plus an
// explicit load of each face), the page waits for network idle, every step has a long timeout,
// and the whole render retries up to 3 times with a fresh browser. A card whose fonts did not
// load is treated as a failure, not written.
//
// Pass the PNG to `build_deep_bag.py import ... --share <png>`. Numbers come from the study's
// own export (charts.json / clip.json); type them here only by copying from those files.
const path = require('path');
const fs = require('fs');
const puppeteer = require(path.join(process.env.APPDATA || '', 'npm/node_modules/puppeteer-core'));

const EDGE = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find(fs.existsSync);
const a = process.argv.slice(2);
const opt = (k, d) => { const i = a.indexOf('--' + k); return i >= 0 ? a[i + 1] : d; };
const esc = (s) => String(s || '').replace(/[&<>"]/g, (c) => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));
const title = opt('title'), out = opt('out');
if (!title || !out) { console.error('need --title and --out'); process.exit(2); }
const accent = opt('accent', '#3ddc97');
const stat = (opt('stat', '') || '').replace(/^-/, '\u2212');
const sport = opt('sport', '');
const motif = opt('motif', 'field');

/* ---- motif art (deterministic SVG, drawn behind the right half of the card) ---- */
const h1 = (i) => { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
const proj = (x, z, y = 0) => { const s = 9 / (9 + z); return [880 + x * s * 11, 130 + 270 * s - y * s * 11]; };   // the empty upper right, above the stat box
function svgWrap(inner) {
  return `<svg class="art" viewBox="0 0 1200 630" preserveAspectRatio="xMidYMid slice" aria-hidden="true">${inner}</svg>`;
}
function stadiumSVG() {
  let s = '';
  for (let r = 0; r < 8; r++) {
    const A = 50 + r * 4.4, B = 30 + r * 3.3, y0 = 2 + r * 3.4, n = 64 + r * 6;
    for (let i = 0; i < n; i++) {
      const ang = ((i + (r % 2) * 0.5) / n) * Math.PI * 2;
      const z = 46 + Math.sin(ang) * B;
      if (z < 3) continue;
      const [x, y] = proj(Math.cos(ang) * A + 26, z, y0 + (h1(r * 997 + i) - 0.5) * 1.2);
      const sc = 9 / (9 + z);
      const wave = Math.exp(-Math.pow(Math.atan2(Math.sin(ang - 5.1), Math.cos(ang - 5.1)), 2) / 0.06);
      s += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${((1.4 + wave * 1.2) * (0.55 + sc * 2.2)).toFixed(2)}" fill="${wave > 0.5 ? accent : '#a9b7ec'}" fill-opacity="${Math.min(1, (0.3 + wave * 0.5) * (0.6 + sc * 1.5)).toFixed(2)}"/>`;
    }
  }
  for (let x = -40; x <= 40; x += 10) { const [x1, y1] = proj(x + 26, 26); const [x2, y2] = proj(x + 26, 66); s += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="rgba(169,183,236,.16)" stroke-width="1.2"/>`; }
  return svgWrap(s);
}
function bubblesSVG() {
  let s = '';
  [12, 24, 36, 48].forEach((z, li) => {
    const [xa, ya] = proj(-70, z), [xb] = proj(90, z);
    s += `<line x1="${xa}" y1="${ya}" x2="${xb}" y2="${ya}" stroke="rgba(169,183,236,.16)" stroke-width="1.2" stroke-dasharray="2 7"/>`;
    const sc = 9 / (9 + z);
    for (let c = 0; c < 26; c++) {
      const id = li * 101 + c, x = -40 + c * 4.6, hT = 4 + h1(id + 7) * 11, hN = hT * (0.55 + h1(id + 13) * 0.35);
      const settled = x < 30, hgt = settled ? hN : hT;
      for (let b = 0; b < 6; b++) {
        const k = h1(id * 7 + b);
        const [px, py] = proj(x + (h1(id + b) - 0.5) * 0.8, z, k * hgt);
        s += `<circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="${((1.1 + k * 1.5) * (0.6 + sc * 2)).toFixed(2)}" fill="none" stroke="#b4c0ee" stroke-opacity="${(0.65 * Math.min(1, k / 0.12)).toFixed(2)}" stroke-width="1"/>`;
      }
      const [cx, cy] = proj(x, z, hgt);
      s += `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${(2.4 * (0.6 + sc * 2)).toFixed(2)}" fill="${settled && h1(id + 29) > 0.45 ? accent : '#cfd8ff'}" fill-opacity=".9"/>`;
    }
  });
  return svgWrap(s);
}
function ridgesSVG() {
  let s = '';
  const WATER = 4;
  const ridgeY = (j, x) => { const peak = -2 + j * 4, cliff = peak + 22 + j * 2; return Math.max(0, 12 - 0.004 * Math.pow(x - peak, 2) - (x > cliff ? (x - cliff) * 0.6 : 0)); };
  for (let z = 6; z <= 60; z += 6) for (let x = -50; x <= 90; x += 6) { const [px, py] = proj(x, z, WATER - 0.3); s += `<circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="${(1.1 * (0.6 + (9 / (9 + z)) * 1.6)).toFixed(2)}" fill="#a9b7ec" fill-opacity=".16"/>`; }
  [6, 15, 24, 33, 42, 51, 60].reverse().forEach((z, ri) => {
    const j = 6 - ri, sc = 9 / (9 + z);
    for (let x = -50; x <= 90; x += 1.6) {
      const y = ridgeY(j, x), [px, py] = proj(x, z, y), under = y < WATER;
      s += `<circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="${(1.2 * (0.6 + sc * 1.8)).toFixed(2)}" fill="${under ? accent : '#a9b7ec'}" fill-opacity="${((under ? 0.75 : 0.5) * (0.45 + 0.55 * (1 - j / 7))).toFixed(2)}"/>`;
    }
  });
  return svgWrap(s);
}
const FIELD_CSS = `.field::before{content:"";position:absolute;left:-30%;right:-30%;top:52%;height:110%;transform-origin:50% 0;transform:rotateX(66deg);
 background:repeating-linear-gradient(90deg,transparent 0 calc(8% - 2px),rgba(170,186,235,.2) calc(8% - 2px) 8%),radial-gradient(circle,rgba(168,182,228,.45) 1.2px,transparent 1.8px) 0 0/24px 24px;
 -webkit-mask-image:linear-gradient(180deg,transparent,#000 25%,#000 60%,transparent)}`;
const PLAIN_CSS = `.field::before{content:"";position:absolute;left:-30%;right:-30%;top:52%;height:110%;transform-origin:50% 0;transform:rotateX(66deg);
 background:radial-gradient(circle,rgba(168,182,228,.42) 1.2px,transparent 1.8px) 0 0/24px 24px;
 -webkit-mask-image:linear-gradient(180deg,transparent,#000 25%,#000 60%,transparent)}`;
const art = {stadium: stadiumSVG, bubbles: bubblesSVG, ridges: ridgesSVG}[motif];
const motifCSS = motif === 'field' ? FIELD_CSS : motif === 'plain' ? PLAIN_CSS : '';
// --art <image>: a rendered still of the study's own hero (png/webp/jpg, ideally 2400x1260) fills the card
// behind the text, darkened on the left so the title and line stay legible. It replaces --motif.
const artFile = opt('art', '');
const artURI = artFile ? `data:image/${path.extname(artFile).slice(1).replace('jpg', 'jpeg')};base64,${fs.readFileSync(artFile).toString('base64')}` : '';
const ART_CSS = `.field .still{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.field::after{content:"";position:absolute;inset:0;background:linear-gradient(90deg,rgba(6,9,21,.92) 0%,rgba(6,9,21,.78) 38%,rgba(6,9,21,.18) 62%,transparent 78%),linear-gradient(0deg,rgba(6,9,21,.55),transparent 30%)}`;
const fieldHTML = artURI ? `<div class="field"><img class="still" src="${artURI}" alt=""></div>`
  : art ? `<div class="field">${art()}</div>` : '<div class="field"></div>';

const FONTS = 'https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500..800&family=Martian+Mono:wdth,wght@75..100,500..650&family=Schibsted+Grotesk:wght@400..600&display=block';
const html = `<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="${FONTS}">
<style>
*{box-sizing:border-box;margin:0}
html,body{width:1200px;height:630px;background:#080b17;overflow:hidden}
.card{position:relative;width:1200px;height:630px;padding:64px 72px;color:#eef1f8;font-family:'Schibsted Grotesk',sans-serif;
 background:radial-gradient(70% 70% at 70% 30%,rgba(64,86,170,.28),transparent 70%),radial-gradient(50% 60% at 85% 95%,${accent}22,transparent 70%),linear-gradient(180deg,#060915,#080b17)}
.field{position:absolute;inset:0;overflow:hidden;perspective:700px}
${artURI ? ART_CSS : motifCSS}
.field .art{position:absolute;inset:0;width:100%;height:100%;mask-image:linear-gradient(90deg,transparent 42%,#000 64%),linear-gradient(180deg,transparent 6%,#000 22%,#000 52%,transparent 64%);mask-composite:intersect}
.brand{position:relative;display:flex;align-items:center;gap:14px;font-weight:600;font-size:15px;letter-spacing:.22em;text-transform:uppercase;color:#8d98b8}
.brand b{font-family:'Bricolage Grotesque';font-weight:800;font-size:28px;letter-spacing:-.01em;color:#fff;text-transform:none}
.brand b i{font-style:normal;color:${accent}}
h1{position:relative;margin-top:70px;max-width:760px;font-family:'Bricolage Grotesque';font-weight:700;font-size:92px;line-height:.92;letter-spacing:-.03em;color:#fff}
p{position:relative;margin-top:26px;max-width:640px;font-size:25px;line-height:1.35;color:#cdd3e4}
.stat{position:absolute;right:72px;bottom:64px;width:330px;padding:26px 28px;border-radius:28px;background:rgba(10,14,30,.72);
 box-shadow:0 0 0 1px rgba(255,255,255,.06),0 0 90px -20px ${accent}55}
.stat .n{font-family:'Martian Mono';font-variation-settings:'wdth' 80;font-weight:600;font-size:76px;line-height:1;letter-spacing:-.06em;color:${accent};text-shadow:0 0 40px ${accent}66}
.stat .l{margin-top:12px;font-size:18px;line-height:1.35;color:#cdd3e4}
</style></head><body><div class="card">${fieldHTML}
<div class="brand"><b>E<i>B</i>K</b><span>Deep Bag${sport ? ' · ' + esc(sport) : ''}</span></div>
<h1>${esc(title)}</h1>${opt('line') ? `<p>${esc(opt('line'))}</p>` : ''}
${stat ? `<div class="stat"><div class="n">${esc(stat)}</div><div class="l">${esc(opt('stat-label', ''))}</div></div>` : ''}
</div></body></html>`;

async function render(attempt) {
  const browser = await puppeteer.launch({executablePath: EDGE, headless: 'new', protocolTimeout: 120000, args: ['--no-first-run', '--disable-extensions']});
  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(60000);
    await page.setViewport({width: 1200, height: 630, deviceScaleFactor: 1});
    await page.setContent(html, {waitUntil: ['load', 'networkidle0'], timeout: 60000});
    const ok = await page.evaluate(async () => {
      const faces = ["700 92px 'Bricolage Grotesque'", "800 28px 'Bricolage Grotesque'", "600 76px 'Martian Mono'", "400 25px 'Schibsted Grotesk'", "600 15px 'Schibsted Grotesk'"];
      await Promise.all(faces.map((f) => document.fonts.load(f).catch(() => null)));
      await document.fonts.ready;
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      return faces.every((f) => document.fonts.check(f));
    });
    if (!ok) throw new Error('fonts did not load');
    fs.mkdirSync(path.dirname(path.resolve(out)), {recursive: true});
    const tmp = out + '.tmp.png';
    await page.screenshot({path: tmp, type: 'png'});
    fs.renameSync(tmp, out);
    console.log(`wrote ${out} (${artFile ? "art " + path.basename(artFile) : "motif " + motif}${attempt > 1 ? ', attempt ' + attempt : ''})`);
  } finally { await browser.close().catch(() => {}); }
}

(async () => {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try { await render(attempt); return; }
    catch (e) {
      console.error(`attempt ${attempt} failed: ${e.message}`);
      if (attempt === 3) process.exit(1);
      await new Promise((r) => setTimeout(r, 3000 * attempt));
    }
  }
})();
