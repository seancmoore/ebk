/* The Cliff · study-scoped Deep Bag v2 module (EBK docs/deep-bag-v2.md).
   Loaded by article_v06 as <script type="module">, published as a study asset.
   The shared runtime (deep-bag-v2.js) draws the shared chart types (hbar,
   bars3d); this file adds what the system does not have yet, following the
   same conventions (render on demand, Flat/Table fallbacks, nothing moves
   under prefers-reduced-motion, tables always in the DOM):

     agecurve   2D lines over age that draw on scroll: several series, a band
                between two of them, dashed thin ages, count bars, small multiples
     rangeplot  2D rows of age ranges and markers on a shared axis
     ridge3d    3D ridges: one per position group, age across, drop below peak
                down, a glass "waterline" at the cliff threshold (three.js)
     hero       "cliff-ridges": the career-model curves as dotted ridgelines,
                players flowing along them and dropping off as the real
                sample thins (opts from #cliff-scene-data)

   Requested as system features in docs/deep-bag-v2-requests.md (the-cliff). */
const THREE_URL = "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.min.js";
const doc = document;
const reduce = !!(window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches);
const NS = "http://www.w3.org/2000/svg";
const MINUS = "−";
let threeP = null;
const loadThree = () => (threeP = threeP || import(THREE_URL));

/* ------------------------------------------------------------ utils -- */
function webglOK() {
  try {
    const c = doc.createElement("canvas");
    return !!(window.WebGLRenderingContext && (c.getContext("webgl2") || c.getContext("webgl")));
  } catch (e) { return false; }
}
const GL = webglOK();
function lowPower() {
  const n = navigator, c = n.connection || {};
  if (c.saveData) return true;
  if (n.deviceMemory && n.deviceMemory < 4) return true;
  const coarse = window.matchMedia && matchMedia("(pointer: coarse)").matches;
  return coarse && Math.min(screen.width, screen.height) < 820;
}
function fmt(v, dec = 1, signed = false) {
  if (v === null || v === undefined || isNaN(v)) return "n/a";
  const s = Math.abs(v).toFixed(dec);
  if (+s === 0) return s;
  if (v < 0) return MINUS + s;
  return (signed ? "+" : "") + s;
}
function yf(spec, v, dec) {
  const d = dec == null ? (spec.decimals == null ? 1 : spec.decimals) : dec;
  if (spec.yfmt === "pct") return fmt(v, d) + "%";
  return fmt(v, d, spec.signed);
}
function el(tag, attrs, parent) {
  const e = doc.createElementNS(NS, tag);
  for (const k in attrs) if (attrs[k] !== undefined && attrs[k] !== null) e.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(e);
  return e;
}
function txt(parent, x, y, s, cls, anchor) {
  const t = el("text", { x, y, class: cls, "text-anchor": anchor || "start", "dominant-baseline": "middle" }, parent);
  t.textContent = s;
  return t;
}
const ease = t => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));
function tween(ms, step, done, delay = 0) {
  if (reduce) { step(1); if (done) done(); return; }
  const t0 = performance.now() + delay;
  (function f(now) {
    const k = Math.max(0, Math.min(1, (now - t0) / ms));
    step(ease(k));
    if (k < 1) requestAnimationFrame(f); else if (done) done();
  })(performance.now());
}
function onView(node, cb, opts) {
  if (!("IntersectionObserver" in window)) { cb(); return; }
  const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { io.disconnect(); cb(); } }), opts || { threshold: 0.25 });
  io.observe(node);
}
function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }

/* tooltip: reuse the shared one (deep-bag-v2.js makes it), or make our own */
let tipEl = null;
function tip() {
  if (tipEl && tipEl.isConnected) return tipEl;
  // our own tooltip, inside the study wrapper so the study's scoped CSS reaches it (position: fixed)
  tipEl = doc.createElement("div");
  tipEl.className = "v2-tip cl-tip"; tipEl.setAttribute("role", "status"); tipEl.setAttribute("aria-live", "polite");
  (doc.querySelector(".dbx-study") || doc.body).appendChild(tipEl);
  return tipEl;
}
function showTip(html, x, y) {
  const t = tip();
  t.innerHTML = html;
  const w = t.offsetWidth || 200;
  x = Math.max(w / 2 + 8, Math.min(window.innerWidth - w / 2 - 8, x));
  t.style.left = x + "px"; t.style.top = Math.max(t.offsetHeight + 20, y) + "px";
  t.classList.add("on");
}
function hideTip() { if (tipEl) tipEl.classList.remove("on"); }
window.addEventListener("scroll", hideTip, { passive: true });

let clipN = 0;
/* translucent accent fills go muddy over navy, so accent areas are hatched instead */
function hatch(defs, id, op = 0.55) {
  const p = el("pattern", { id, width: 6, height: 6, patternUnits: "userSpaceOnUse", patternTransform: "rotate(45)" }, defs);
  el("rect", { width: 6, height: 6, class: "cl-hatch-bg" }, p);
  el("line", { x1: 0, y1: 0, x2: 0, y2: 6, class: "cl-hatch-ln", "stroke-width": 2, opacity: op }, p);
  return `url(#${id})`;
}

/* ---------------------------------------------------- 2D: agecurve -- */
function drawAgecurve(stage, spec) {
  stage.innerHTML = "";
  const W = Math.max(280, stage.clientWidth || 600);
  const narrow = W < 560;
  const anims = [];
  if (spec.panels) return drawPanels(stage, spec, W, narrow);

  const hasBars = !!spec.bars;
  const padL = narrow ? 40 : 48, padR = narrow ? 70 : 128, padT = 22;
  const plotH = narrow ? 250 : 300;
  const barsH = hasBars ? (narrow ? 70 : 84) : 0;
  const axisH = 34;
  const H = padT + plotH + axisH + (hasBars ? barsH + 26 : 0);
  const svg = el("svg", { class: "v2-svg cl-svg", viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: "img", "aria-label": spec.title || "" }, stage);
  const xd = spec.x.domain, yd = spec.y.domain;
  const x0 = padL, x1 = W - padR;
  const sx = a => x0 + (a - xd[0]) / (xd[1] - xd[0]) * (x1 - x0);
  const sy = v => padT + (yd[1] - Math.max(yd[0], Math.min(yd[1], v))) / (yd[1] - yd[0]) * plotH;
  const id = "clc" + (++clipN);
  const defs = el("defs", {}, svg);
  const cp = el("clipPath", { id }, defs);
  const clipR = el("rect", { x: 0, y: 0, width: x0, height: H }, cp);

  // grid
  (spec.y.ticks || []).forEach(t => {
    el("line", { x1: x0 - 6, x2: x1, y1: sy(t), y2: sy(t), class: "grid" }, svg);
    txt(svg, x0 - 10, sy(t), yf(spec, t, 0), "t-tick", "end");
  });
  (spec.x.ticks || []).forEach(a => {
    el("line", { x1: sx(a), x2: sx(a), y1: padT, y2: padT + plotH, class: "grid cl-vgrid" }, svg);
    txt(svg, sx(a), padT + plotH + 16, String(a), "t-tick", "middle");
  });
  txt(svg, x1, padT + plotH + 16, "", "t-tick", "end");
  if (spec.x.label) txt(svg, x0 - 10, padT + plotH + 16, narrow ? "" : "", "t-unit", "end");

  const g = el("g", { "clip-path": `url(#${id})` }, svg);
  const byKey = {};
  spec.series.forEach(s => { byKey[s.key] = s; });

  // band between two series
  if (spec.band) {
    const lo = byKey[spec.band.lo].points, hi = byKey[spec.band.hi].points;
    const from = spec.band.from || xd[0];
    const up = hi.filter(p => p.x >= from), dn = lo.filter(p => p.x >= from).slice().reverse();
    const d = "M" + up.map(p => `${sx(p.x)},${sy(p.v)}`).join(" L") + " L" + dn.map(p => `${sx(p.x)},${sy(p.v)}`).join(" L") + " Z";
    el("path", { d, class: "cl-band", fill: hatch(defs, id + "h") }, g);
  }
  // hlines
  (spec.hlines || []).forEach(h => {
    el("line", { x1: x0, x2: x1, y1: sy(h.v), y2: sy(h.v), class: "cl-hline " + (h.cls || "") }, svg);
    txt(svg, x1 + 6, sy(h.v), h.label, "t-n cl-hlabel", "start");
  });
  // series
  spec.series.forEach(s => drawSeries(g, s, sx, sy));
  // marks
  const markG = el("g", { class: "cl-marks", opacity: 0 }, svg);
  (spec.marks || []).forEach(m => {
    const p = byKey[m.series].points.find(q => q.x === m.x);
    if (!p) return;
    el("circle", { cx: sx(p.x), cy: sy(p.v), r: 5.5, class: "cl-mark" }, markG);
    if (m.label) {
      const below = !!m.below;
      txt(markG, sx(p.x), sy(p.v) + (below ? 20 : -16), m.label, "t-val cl-marklabel", sx(p.x) > x1 - 40 ? "end" : "middle");
    }
  });
  // end labels with simple collision avoidance
  const ends = spec.series.map(s => {
    const p = s.points[s.points.length - 1];
    return { s, x: sx(p.x), y: sy(p.v) };
  }).sort((a, b) => a.y - b.y);
  for (let i = 1; i < ends.length; i++) if (ends[i].y - ends[i - 1].y < 15) ends[i].y = ends[i - 1].y + 15;
  const endG = el("g", { opacity: 0 }, svg);
  ends.forEach(e => {
    const t = txt(endG, e.x + 9, e.y, narrow && e.s.short ? e.s.short : e.s.label, "t-row cl-end " + e.s.cls, "start");
    t.setAttribute("font-size", narrow ? 11.5 : 12.5);
  });
  // count bars
  let barRects = [];
  if (hasBars) {
    const by0 = padT + plotH + axisH + 18, by1 = by0 + barsH;
    const vmax = Math.max(...spec.bars.points.map(p => p.v));
    const bw = Math.max(6, (x1 - x0) / (xd[1] - xd[0] + 1) * 0.62);
    txt(svg, x0 - 10, by0 - 8, spec.bars.label, "t-grp", "start");
    spec.bars.points.forEach((p, i) => {
      const h = (p.v / vmax) * (barsH - 14);
      const acc = spec.bars.accentFrom != null && p.x >= spec.bars.accentFrom;
      const r = el("rect", { x: sx(p.x) - bw / 2, y: by1, width: bw, height: 0, rx: 3, class: "cl-bar" + (acc ? " is-accent" : "") }, svg);
      const showN = !narrow || i % 2 === 0 || i === spec.bars.points.length - 1;
      const lab = showN ? txt(svg, sx(p.x), by1 - h - 8, String(p.v), "t-n cl-barn", "middle") : null;
      if (lab) lab.setAttribute("opacity", 0);
      barRects.push({ r, h, by1, lab });
    });
  }
  // hover guide
  const guide = el("line", { x1: 0, x2: 0, y1: padT, y2: padT + plotH, class: "cl-guide", opacity: 0 }, svg);
  const hot = spec.series.map(s => el("circle", { r: 4.5, class: "cl-hot " + s.cls, opacity: 0 }, svg));
  const hit = el("rect", { x: x0, y: padT, width: x1 - x0, height: plotH, class: "hit", tabindex: 0 }, svg);
  const ages = [];
  for (let a = Math.ceil(xd[0]); a <= xd[1]; a++) ages.push(a);
  function at(a, cx, cy) {
    guide.setAttribute("x1", sx(a)); guide.setAttribute("x2", sx(a)); guide.setAttribute("opacity", 1);
    let h = `<b>Age ${a}</b>`;
    spec.series.forEach((s, i) => {
      const p = s.points.find(q => q.x === a);
      if (!p) { hot[i].setAttribute("opacity", 0); return; }
      hot[i].setAttribute("cx", sx(a)); hot[i].setAttribute("cy", sy(p.v)); hot[i].setAttribute("opacity", 1);
      h += `<span class="tv cl-tv">${esc(s.label)} <em>${yf(spec, p.v)}</em></span>`;
      if (p.n != null && i === spec.series.length - 1) h += `<span class="tm">n = ${p.n}${p.thin ? " · thin" : ""}</span>`;
    });
    if (hasBars) { const b = spec.bars.points.find(q => q.x === a); if (b) h += `<span class="tm">${esc(spec.bars.label)}: ${b.v}</span>`; }
    showTip(h, cx, cy);
  }
  function move(e) {
    const r = svg.getBoundingClientRect();
    const px = (e.clientX - r.left) * (W / r.width);
    const a = Math.round(xd[0] + (px - x0) / (x1 - x0) * (xd[1] - xd[0]));
    if (a < xd[0] || a > xd[1]) return;
    at(a, e.clientX, r.top + padT * r.height / H);
  }
  function out() { guide.setAttribute("opacity", 0); hot.forEach(c => c.setAttribute("opacity", 0)); hideTip(); }
  hit.addEventListener("pointermove", move);
  hit.addEventListener("pointerdown", move);
  hit.addEventListener("pointerleave", out);
  let kAge = null;
  hit.addEventListener("keydown", e => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    kAge = kAge == null ? ages[0] : Math.max(ages[0], Math.min(ages[ages.length - 1], kAge + (e.key === "ArrowRight" ? 1 : -1)));
    const r = svg.getBoundingClientRect();
    at(kAge, r.left + sx(kAge) * r.width / W, r.top + padT * r.height / H);
  });
  hit.addEventListener("blur", out);

  return function animate(instant) {
    const fin = () => { clipR.setAttribute("width", W); markG.setAttribute("opacity", 1); endG.setAttribute("opacity", 1);
      barRects.forEach(b => { b.r.setAttribute("y", b.by1 - b.h); b.r.setAttribute("height", b.h); if (b.lab) b.lab.setAttribute("opacity", 1); }); };
    if (instant || reduce) { fin(); return; }
    tween(1500, k => clipR.setAttribute("width", x0 + (W - x0) * k), () => { markG.setAttribute("opacity", 1); endG.setAttribute("opacity", 1); });
    barRects.forEach((b, i) => tween(700, k => { b.r.setAttribute("y", b.by1 - b.h * k); b.r.setAttribute("height", b.h * k); if (b.lab && k > 0.9) b.lab.setAttribute("opacity", 1); }, null, 150 + i * 70));
  };
}

function drawSeries(g, s, sx, sy) {
  const pts = s.points;
  const solid = [], thin = [];
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    if (s.gaps && b.x - a.x > 1) continue;
    const seg = `M${sx(a.x)},${sy(a.v)} L${sx(b.x)},${sy(b.v)}`;
    (a.thin || b.thin ? thin : solid).push(seg);
  }
  if (solid.length) el("path", { d: solid.join(" "), class: "cl-line " + s.cls }, g);
  if (thin.length) el("path", { d: thin.join(" "), class: "cl-line cl-thin " + s.cls }, g);
  if (s.gaps) pts.forEach(p => el("circle", { cx: sx(p.x), cy: sy(p.v), r: 2.4, class: "cl-dot " + s.cls }, g));
}

/* small multiples (players; the Flat view of the 3D waterline) */
function drawPanels(stage, spec, W, narrow) {
  const panels = spec.panels;
  const grouped = !!spec.panelGroups;
  let cols;
  if (grouped) cols = narrow ? 2 : 3;
  else cols = W < 420 ? 2 : W < 700 ? 3 : W < 980 ? 4 : 5;
  const gap = narrow ? 10 : 16;
  const pw = (W - gap * (cols - 1)) / cols;
  const ph = grouped ? (narrow ? 158 : 178) : (narrow ? 118 : 132);
  const headH = grouped ? 26 : 0;
  // layout: grouped + narrow -> one column per group; grouped + wide -> one row per group
  const cells = [];
  if (grouped) {
    const keys = Object.keys(spec.panelGroups);
    keys.forEach((k, gi) => {
      panels.filter(p => p.group === k).forEach((p, i) => {
        cells.push(narrow ? { p, c: gi, r: i, gk: k } : { p, c: i, r: gi, gk: k });
      });
    });
  } else panels.forEach((p, i) => cells.push({ p, c: i % cols, r: Math.floor(i / cols) }));
  const nrows = Math.max(...cells.map(c => c.r)) + 1;
  const rowGap = grouped && !narrow ? headH : 8;
  const top0 = grouped ? headH : 0;
  const H = top0 + nrows * (ph + rowGap);
  const svg = el("svg", { class: "v2-svg cl-svg", viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: "img", "aria-label": spec.title || "" }, stage);
  const id = "clc" + (++clipN);
  const defs = el("defs", {}, svg);
  const cp = el("clipPath", { id }, defs);
  const clipR = el("rect", { x: 0, y: 0, width: 0, height: H }, cp);
  const hfill = hatch(defs, id + "h", 0.45);
  const xd = spec.x.domain, yd = spec.y.domain;
  if (grouped) {
    const keys = Object.keys(spec.panelGroups);
    keys.forEach((k, gi) => {
      if (narrow) txt(svg, gi * (pw + gap) + 2, 10, spec.panelGroups[k], "t-grp " + (k === "fell" ? "cl-acc-t" : ""), "start");
      else txt(svg, 2, top0 - 14 + gi * (ph + rowGap) + (gi ? 0 : 0) + (gi ? -4 : 0), spec.panelGroups[k], "t-grp " + (k === "fell" ? "cl-acc-t" : ""), "start");
    });
  }
  const tipCells = [];
  cells.forEach(({ p, c, r }) => {
    const ox = c * (pw + gap), oy = top0 + r * (ph + rowGap);
    const L = 30, R = 6, Tp = 32, B = 22;
    const sx = a => ox + L + (a - xd[0]) / (xd[1] - xd[0]) * (pw - L - R);
    const sy = v => oy + Tp + (yd[1] - Math.max(yd[0], Math.min(yd[1], v))) / (yd[1] - yd[0]) * (ph - Tp - B);
    el("rect", { x: ox, y: oy, width: pw, height: ph, rx: 12, class: "cl-panel" + (p.emph ? " is-emph" : "") }, svg);
    txt(svg, ox + 10, oy + 13, narrow && p.short ? p.short : p.title, "t-row cl-ptitle" + (p.emph ? " cl-acc-t" : ""), "start");
    (spec.y.ticks || []).forEach(t => {
      el("line", { x1: sx(xd[0]), x2: sx(xd[1]), y1: sy(t), y2: sy(t), class: "grid" }, svg);
      txt(svg, sx(xd[0]) - 4, sy(t), spec.yfmt === "sd" ? fmt(t, Math.abs(t) % 1 ? 1 : 0) : fmt(t, 0), "t-tick cl-small", "end");
    });
    (spec.x.ticks || []).forEach(a => txt(svg, sx(a), oy + ph - 9, String(a), "t-tick cl-small", "middle"));
    if (p.range) {
      const a = sx(p.range[0]), b = sx(p.range[1] + 1);
      el("rect", { x: a, y: oy + Tp, width: Math.max(3, b - a), height: ph - Tp - B, class: "cl-range", fill: hfill }, svg);
    }
    (spec.hlines || []).forEach(h => el("line", { x1: sx(xd[0]), x2: sx(xd[1]), y1: sy(h.v), y2: sy(h.v), class: "cl-hline " + (h.cls || "") }, svg));
    const g = el("g", { "clip-path": `url(#${id})` }, svg);
    if (p.bandPts) {
      const up = p.bandPts.map(q => `${sx(q.x)},${sy(q.hi)}`), dn = p.bandPts.slice().reverse().map(q => `${sx(q.x)},${sy(q.lo)}`);
      el("path", { d: "M" + up.join(" L") + " L" + dn.join(" L") + " Z", class: "cl-pband" }, g);
    }
    p.series.forEach(s => drawSeries(g, s, sx, sy));
    (p.marks || []).forEach(m => {
      const s = p.series.find(q => q.key === m.series);
      const q = s && s.points.find(z => z.x === m.x);
      if (q) el("circle", { cx: sx(q.x), cy: sy(q.v), r: 5, class: "cl-mark " + s.cls }, g);
    });
    tipCells.push({ p, ox, oy, sx, sy, L, R });
  });
  // hover: nearest panel + age
  const guide = el("line", { class: "cl-guide", opacity: 0 }, svg);
  const hit = el("rect", { x: 0, y: 0, width: W, height: H, class: "hit" }, svg);
  hit.addEventListener("pointermove", e => {
    const r = svg.getBoundingClientRect();
    const px = (e.clientX - r.left) * (W / r.width), py = (e.clientY - r.top) * (H / r.height);
    const c = tipCells.find(t => px >= t.ox && px <= t.ox + pw && py >= t.oy && py <= t.oy + ph);
    if (!c) { guide.setAttribute("opacity", 0); hideTip(); return; }
    const a = Math.round(xd[0] + (px - c.ox - c.L) / (pw - c.L - c.R) * (xd[1] - xd[0]));
    let h = `<b>${esc(c.p.title)}</b><span class="tm">Age ${a}</span>`;
    let any = false;
    c.p.series.forEach(s => {
      const q = s.points.find(z => z.x === a);
      if (!q) return;
      any = true;
      const v = spec.yfmt === "sd" ? fmt(-q.v, 2) + " SD below peak" : fmt(q.v, spec.decimals == null ? 1 : spec.decimals);
      h += `<span class="tv cl-tv">${esc(s.label)} <em>${v}</em></span>`;
      if (q.season) h += `<span class="tm">${q.season} · ${q.games} games</span>`;
    });
    if (c.p.bandPts) { const b = c.p.bandPts.find(z => z.x === a); if (b) { any = true; h += `<span class="tm">Typical back: ${fmt(b.lo, 1)} to ${fmt(b.hi, 1)}</span>`; } }
    if (!any) { guide.setAttribute("opacity", 0); hideTip(); return; }
    guide.setAttribute("x1", c.sx(a)); guide.setAttribute("x2", c.sx(a));
    guide.setAttribute("y1", c.oy + 32); guide.setAttribute("y2", c.oy + ph - 22); guide.setAttribute("opacity", 1);
    showTip(h, e.clientX, r.top + c.oy * r.height / H + 10);
  });
  hit.addEventListener("pointerleave", () => { guide.setAttribute("opacity", 0); hideTip(); });
  return function animate(instant) {
    if (instant || reduce) { clipR.setAttribute("width", W); return; }
    tween(1700, k => clipR.setAttribute("width", W * k));
  };
}

/* --------------------------------------------------- 2D: rangeplot -- */
function drawRangeplot(stage, spec) {
  stage.innerHTML = "";
  const W = Math.max(280, stage.clientWidth || 600);
  const narrow = W < 560;
  const rowH = narrow ? 30 : 32, grpH = 30, barH = narrow ? 11 : 13;
  const hasVal = spec.groups.some(g => g.rows.some(r => r.value));
  const labelW = narrow ? (spec.id === "two-clocks" ? 100 : 64) : (spec.id === "two-clocks" ? 240 : 170);
  const valW = hasVal ? (narrow ? 52 : 70) : 10;
  const x0 = labelW + 8, x1 = W - valW - 8;
  const xd = spec.x.domain;
  const sx = v => x0 + (v - xd[0]) / (xd[1] - xd[0]) * (x1 - x0);
  let H = 28;
  spec.groups.forEach(g => { H += grpH + g.rows.length * rowH; });
  H += 34;
  const svg = el("svg", { class: "v2-svg cl-svg cl-range-svg", viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: "img", "aria-label": spec.title || "" }, stage);
  const top = 22, bottom = H - 30;
  (spec.x.ticks || []).forEach(t => {
    el("line", { x1: sx(t), x2: sx(t), y1: top, y2: bottom, class: t === 0 && spec.ref ? "zero" : "grid" }, svg);
    txt(svg, sx(t), bottom + 15, spec.signed ? fmt(t, 0, true) : String(t), "t-tick", "middle");
  });
  if (spec.ref) {
    el("line", { x1: sx(spec.ref.v), x2: sx(spec.ref.v), y1: top - 6, y2: bottom, class: "cl-ref" }, svg);
    txt(svg, sx(spec.ref.v), top - 12, spec.ref.label, "marker-t", "middle");
  }
  if (spec.x.label && !narrow) txt(svg, x1, bottom + 15, "", "t-unit", "end");
  if (hasVal) txt(svg, W - 4, top - 12, narrow ? "Cliff" : "Cliff at", "t-grp", "end");
  const anims = [];
  let y = top;
  let ri = 0;
  spec.groups.forEach(g => {
    txt(svg, 0, y + grpH / 2 + 3, g.label, "t-grp", "start");
    y += grpH;
    g.rows.forEach(r => {
      const cy = y + rowH / 2;
      const row = el("g", { class: "row" + (r.emph ? " is-emph" : ""), tabindex: 0 }, svg);
      txt(row, 0, cy, narrow && r.short ? r.short : r.label, "t-row" + (r.emph ? " cl-acc-t" : ""), "start");
      const segEls = (r.segs || []).map(s => {
        const rect = el("rect", { x: sx(s.a), y: cy - barH / 2, width: 0, height: barH, rx: barH / 2.6, class: "cl-seg " + s.cls }, row);
        return { s, rect };
      });
      const markEls = (r.marks || []).map(m => {
        const c = m.cls === "m-peak"
          ? el("rect", { x: sx(m.v) - 1.5, y: cy - barH / 2 - 3, width: 3, height: barH + 6, rx: 1.5, class: "cl-mk " + m.cls, opacity: 0 }, row)
          : el("circle", { cx: sx(m.v), cy, r: narrow ? 5 : 6, class: "cl-mk " + m.cls, opacity: 0 }, row);
        return c;
      });
      if (r.value) txt(row, W - 4, cy, r.value, "t-val" + (r.emph ? " is-emph" : ""), "end");
      el("rect", { x: 0, y, width: W, height: rowH, class: "hit" }, row);
      const h = () => {
        let s = `<b>${esc(r.label)}</b>`;
        (r.marks || []).forEach(m => { if (m.cls !== "m-peak") s += `<span class="tv cl-tv">${esc(m.label)} <em>${fmt(m.v, spec.decimals == null ? 1 : spec.decimals, spec.signed)}</em></span>`; });
        if (r.value) s += `<span class="tv cl-tv">Cliff <em>${esc(r.value)}</em></span>`;
        (r.segs || []).forEach(sg => { if (sg.label) s += `<span class="tm">${esc(sg.label)}</span><br>`; });
        if (r.note) s += `<span class="tm">${esc(r.note)}</span>`;
        return s;
      };
      const show = e => { const b = row.getBoundingClientRect(); showTip(h(), e && e.clientX !== undefined ? e.clientX : b.left + b.width / 2, b.top); };
      row.addEventListener("pointerenter", show); row.addEventListener("pointermove", show);
      row.addEventListener("pointerleave", hideTip); row.addEventListener("focus", () => show()); row.addEventListener("blur", hideTip);
      const idx = ri++;
      anims.push(instant => {
        const set = k => segEls.forEach(({ s, rect }) => rect.setAttribute("width", Math.max(0.5, (sx(s.b) - sx(s.a)) * k)));
        const fin = () => markEls.forEach(m => m.setAttribute("opacity", 1));
        if (instant || reduce) { set(1); fin(); return; }
        tween(800, set, fin, idx * 45);
      });
      y += rowH;
    });
  });
  return function animate(instant) { anims.forEach(f => f(instant)); };
}

/* ------------------------------------------------- 3D: waterline ridges -- */
async function mountRidge(host, spec, helpers) {
  const THREE = await loadThree();
  const DEG = Math.PI / 180;
  const css = (n, d) => getComputedStyle(host).getPropertyValue(n).trim() || d;
  const accent = new THREE.Color(css("--v2-accent", "#ff8b5e"));
  const dataCol = new THREE.Color(css("--v2-data", "#8f9cc2"));
  const inkCol = new THREE.Color("#eef1f8");
  const rows = spec.rows, nz = rows.length;
  const xd = spec.x.domain, CAP = spec.y.cap, THR = spec.y.threshold;
  const DX = 0.5, DZ = 1.02, KY = 1.6;
  const X = a => (a - (xd[0] + xd[1]) / 2) * DX;
  const Z = j => (j - (nz - 1) / 2) * DZ;
  const Y = d => -Math.min(d, CAP) * KY;
  const yFloor = Y(CAP) - 0.15, yWater = Y(THR);
  const xmin = X(xd[0]) - 0.3, xmax = X(xd[1]) + 0.3, zmin = Z(0) - 0.6, zmax = Z(nz - 1) + 0.6;

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "low-power" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0x000000, 0);
  host.appendChild(renderer.domElement);
  const labels = doc.createElement("div"); labels.className = "v2-3d-labels"; host.appendChild(labels);
  const hint = doc.createElement("div"); hint.className = "v2-3d-hint";
  hint.textContent = matchMedia("(pointer: coarse)").matches ? "Drag sideways to turn · tap a ridge" : "Drag to turn · hover a ridge";
  host.appendChild(hint);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 300);
  const disposables = [];
  const keep = o => (disposables.push(o), o);

  /* back wall ticks + floor frame */
  const wall = [];
  [0, 0.5, 1, 1.5, 2].forEach(t => { const y = Y(t); wall.push(xmin, y, zmin, xmax, y, zmin); });
  wall.push(xmin, yFloor, zmin, xmin, 0.15, zmin, xmin, yFloor, zmin, xmin, yFloor, zmax, xmin, yFloor, zmax, xmax, yFloor, zmax);
  const wallGeo = keep(new THREE.BufferGeometry());
  wallGeo.setAttribute("position", new THREE.Float32BufferAttribute(wall, 3));
  scene.add(new THREE.LineSegments(wallGeo, keep(new THREE.LineBasicMaterial({ color: 0x9fb0e0, transparent: true, opacity: 0.16 }))));

  /* the waterline: a glass plane at the cliff threshold */
  const plane = new THREE.Mesh(keep(new THREE.PlaneGeometry(xmax - xmin, zmax - zmin)),
    keep(new THREE.MeshBasicMaterial({ color: 0xa8b6ff, transparent: true, opacity: 0.085, side: THREE.DoubleSide, depthWrite: false })));
  plane.rotation.x = -Math.PI / 2; plane.position.set((xmin + xmax) / 2, yWater, (zmin + zmax) / 2); plane.renderOrder = 3;
  scene.add(plane);
  const rimGeo = keep(new THREE.BufferGeometry());
  rimGeo.setAttribute("position", new THREE.Float32BufferAttribute([xmin, yWater, zmin, xmax, yWater, zmin, xmax, yWater, zmin, xmax, yWater, zmax,
    xmax, yWater, zmax, xmin, yWater, zmax, xmin, yWater, zmax, xmin, yWater, zmin], 3));
  scene.add(new THREE.LineSegments(rimGeo, keep(new THREE.LineBasicMaterial({ color: 0xdfe6ff, transparent: true, opacity: 0.4 }))));

  /* ridges */
  const curtMat = (emph) => keep(new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    uniforms: { uCol: { value: emph ? accent.clone() : dataCol.clone() }, uWater: { value: yWater }, uHi: { value: 0 }, uFloor: { value: yFloor } },
    vertexShader: `varying float vY; varying float vT; attribute float aT; void main(){ vY = position.y; vT = aT; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `uniform vec3 uCol; uniform float uWater; uniform float uHi; uniform float uFloor; varying float vY; varying float vT;
      void main(){
        float k = clamp((vY - uFloor) / (0.0 - uFloor), 0.0, 1.0);
        float a = mix(0.05, 0.42, vT) * (vY > uWater ? 1.0 : 0.55) + uHi * 0.18;
        vec3 c = mix(uCol * 0.55, uCol, k);
        gl_FragColor = vec4(c, a);
      }`,
  }));
  const R = [];
  const hitMeshes = [];
  rows.forEach((r, j) => {
    const z = Z(j);
    const pts = r.fe;
    const pos = [], tt = [], idx = [];
    pts.forEach((p, i) => {
      pos.push(X(p.x), Y(p.v), z, X(p.x), yFloor, z);
      tt.push(1, 0);
      if (i > 0) { const b = (i - 1) * 2; idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2); }
    });
    const geo = keep(new THREE.BufferGeometry());
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute("aT", new THREE.Float32BufferAttribute(tt, 1));
    geo.setIndex(idx);
    const mat = curtMat(r.emph);
    const curtain = new THREE.Mesh(geo, mat);
    curtain.renderOrder = 1;
    const grp = new THREE.Group();
    grp.add(curtain);
    // top edges: career model (solid), delta method (dashed)
    const edge = (list, col, op, dashed) => {
      const g = keep(new THREE.BufferGeometry());
      g.setAttribute("position", new THREE.Float32BufferAttribute(list.flatMap(p => [X(p.x), Y(p.v), z + 0.001]), 3));
      const cols = [];
      list.forEach(p => { const c = col.clone().multiplyScalar(p.thin ? 0.45 : 1); cols.push(c.r, c.g, c.b); });
      g.setAttribute("color", new THREE.Float32BufferAttribute(cols, 3));
      const m = dashed
        ? keep(new THREE.LineDashedMaterial({ vertexColors: true, transparent: true, opacity: op, dashSize: 0.12, gapSize: 0.09 }))
        : keep(new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: op }));
      const l = new THREE.Line(g, m);
      if (dashed) l.computeLineDistances();
      return l;
    };
    const feLine = edge(r.fe, r.emph ? accent : inkCol, r.emph ? 1 : 0.85, false);
    const dlLine = edge(r.delta, r.emph ? accent.clone().lerp(inkCol, 0.4) : new THREE.Color("#9fb0e0"), 0.7, true);
    grp.add(feLine); grp.add(dlLine);
    // cliff range on the waterline
    const a = X(r.fast) - (r.fast === r.slow ? 0.12 : 0), b = X(r.slow) + (r.fast === r.slow ? 0.12 : 0);
    const seg = new THREE.Mesh(keep(new THREE.PlaneGeometry(Math.max(0.24, b - a), 0.2)),
      keep(new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: r.emph ? 0.95 : 0.75, side: THREE.DoubleSide, depthWrite: false })));
    seg.rotation.x = -Math.PI / 2; seg.position.set((a + b) / 2, yWater + 0.005, z); seg.renderOrder = 4;
    grp.add(seg);
    scene.add(grp);
    grp.scale.y = 0.0001;
    curtain.userData.row = j;
    hitMeshes.push(curtain);
    R.push({ r, j, z, grp, mat, feLine });
  });

  /* labels */
  const L = [];
  function label(cls, text, pos, extra) {
    const d = doc.createElement("div"); d.className = "l " + cls; d.textContent = text; labels.appendChild(d);
    const o = { d, pos: pos.clone(), ...(extra || {}) }; L.push(o); return o;
  }
  (spec.x.ticks || []).forEach(a => label("l-x", String(a), new THREE.Vector3(X(a), yFloor - 0.28, zmax + 0.25), { kind: "x" }));
  label("l-axis", "Age", new THREE.Vector3(X(xd[1]) + 0.2, yFloor - 0.28, zmax + 0.25), { kind: "axis" });
  [["Peak", 0], ["Cliff", THR], ["1 SD", 1], ["2 SD", 2]].forEach(([s, t]) => label("l-t" + (t === THR ? " cl-l-water" : ""), s, new THREE.Vector3(xmin - 0.05, Y(t), zmin)));
  const rowLabels = R.map(o => label("l-z" + (o.r.emph ? " cl-l-emph" : ""), o.r.short, new THREE.Vector3(xmax + 0.12, Y(0) - 0.05, o.z), { row: o }));
  const valLabels = R.map(o => {
    const t = o.r.fast === o.r.slow ? String(o.r.fast) : `${o.r.fast} to ${o.r.slow}`;
    const v = label("l-v" + (o.r.emph ? " is-emph" : ""), t, new THREE.Vector3((X(o.r.fast) + X(o.r.slow)) / 2, yWater + 0.32, o.z), { row: o, val: true });
    v.d.style.opacity = "0";
    return v;
  });

  /* camera rig (same framing approach as the shared bars3d) */
  const narrow = () => host.clientWidth < 560;
  const target = new THREE.Vector3(0, (yFloor + 0.2) / 2, 0);
  let TH0 = 0, PH0 = 0;
  const defaults = () => {
    const v = spec.view || {};
    TH0 = (narrow() ? (v.thetaNarrow ?? -8) : (v.theta ?? -14)) * DEG;
    PH0 = (narrow() ? (v.phiNarrow ?? 36) : (v.phi ?? 32)) * DEG;
  };
  defaults();
  let theta = TH0, phi = PH0, radius = 24, shown = false, lastNarrow = null;
  function place() {
    camera.position.set(target.x + radius * Math.cos(phi) * Math.sin(theta), target.y + radius * Math.sin(phi), target.z + radius * Math.cos(phi) * Math.cos(theta));
    camera.lookAt(target);
  }
  function fit() {
    const w = host.clientWidth, h = host.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.clearViewOffset();
    if (lastNarrow !== narrow()) { lastNarrow = narrow(); defaults(); if (!shown || reduce) { theta = TH0; phi = PH0; } }
    host.classList.toggle("is-narrow", narrow());
    camera.updateProjectionMatrix();
    const pad = narrow() ? 0.94 : 0.9;
    const corners = [];
    for (const x of [xmin - (narrow() ? 2.4 : 0.9), xmax + (narrow() ? 1.1 : 1.2)]) for (const y of [yFloor - 0.5, 0.35]) for (const z of [zmin, zmax + 0.4]) corners.push(new THREE.Vector3(x, y, z));
    const th = theta, ph = phi; theta = TH0; phi = PH0;
    let lo = 4, hi = 160;
    const measure = () => {
      place(); camera.updateMatrixWorld();
      const b = { x0: 9, x1: -9, y0: 9, y1: -9 };
      corners.forEach(c => { const p = c.clone().project(camera); b.x0 = Math.min(b.x0, p.x); b.x1 = Math.max(b.x1, p.x); b.y0 = Math.min(b.y0, p.y); b.y1 = Math.max(b.y1, p.y); });
      return b;
    };
    for (let k = 0; k < 22; k++) { radius = (lo + hi) / 2; const b = measure(); if (Math.max(b.x1 - b.x0, b.y1 - b.y0) / 2 > pad) lo = radius; else hi = radius; }
    radius = hi;
    const box = measure();
    camera.setViewOffset(w, h, ((box.x0 + box.x1) / 2) * w / 2, -((box.y0 + box.y1) / 2) * h / 2, w, h);
    theta = th; phi = ph;
  }
  const v3 = new THREE.Vector3();
  let hovered = null, tapped = null;
  function project() {
    const w = host.clientWidth, h = host.clientHeight;
    L.forEach(o => {
      v3.copy(o.pos).project(camera);
      const x = (v3.x * 0.5 + 0.5) * w, y = (-v3.y * 0.5 + 0.5) * h;
      const base = o.d.classList.contains("l-z") || o.kind === "axis" ? "translate(0,-50%)" : o.d.classList.contains("l-t") ? "translate(-100%,-50%)" : "translate(-50%,-50%)";
      o.d.style.transform = `translate(${x.toFixed(1)}px,${y.toFixed(1)}px) ${base}`;
      if (o.val) {
        const on = o.row.grp.scale.y > 0.98 && (o.row.r.emph || o.row === hovered || o.row === tapped);
        o.d.style.opacity = on ? "1" : "0";
      }
    });
    // thin out row labels on narrow screens: keep every other one plus the emphasised row
    if (narrow()) rowLabels.forEach((o, i) => { o.d.style.opacity = (o.row.r.emph || (nz - 1 - i) % 2 === 0 || o.row === hovered || o.row === tapped) ? "1" : "0"; });
    else rowLabels.forEach(o => { o.d.style.opacity = "1"; });
  }
  let raf = 0, alive = true;
  const anims = [];
  function frame(now) {
    raf = 0; if (!alive) return;
    let more = false;
    for (let k = anims.length - 1; k >= 0; k--) { if (anims[k](now)) more = true; else anims.splice(k, 1); }
    place(); renderer.render(scene, camera); project();
    if (more) invalidate();
  }
  function invalidate() { if (!raf && alive) raf = requestAnimationFrame(frame); }
  function animate(ms, fn, delay = 0) {
    const t0 = performance.now() + delay;
    anims.push(now => { const k = Math.max(0, Math.min(1, (now - t0) / ms)); fn(k >= 1 ? 1 : 1 - Math.pow(2, -10 * k)); return k < 1; });
    invalidate();
  }

  /* interaction */
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  function pick(ev) {
    const b = host.getBoundingClientRect();
    ndc.set(((ev.clientX - b.left) / b.width) * 2 - 1, -((ev.clientY - b.top) / b.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObjects(hitMeshes, false)[0];
    if (!hit) return null;
    const o = R[hit.object.userData.row];
    const age = Math.round(hit.point.x / DX + (xd[0] + xd[1]) / 2);
    return { o, age };
  }
  function highlight() {
    R.forEach(o => { o.mat.uniforms.uHi.value = (o === hovered || o === tapped) ? 1 : 0; });
    invalidate();
  }
  function tipFor(h, ev) {
    if (!h) { helpers.hideTip(); return; }
    const r = h.o.r;
    const fe = r.fe.find(p => p.x === h.age), dl = r.delta.find(p => p.x === h.age);
    const br = r.fast === r.slow ? String(r.fast) : `${r.fast} to ${r.slow}`;
    let s = `<b>${esc(r.label)}</b><span class="tm">Age ${h.age}${fe && fe.n ? " · " + fe.n + " seasons" : ""}</span>`;
    if (fe) s += `<span class="tv cl-tv">Career model <em>${fmt(fe.v, 2)}</em></span>`;
    if (dl) s += `<span class="tv cl-tv">Delta method <em>${fmt(dl.v, 2)}</em></span>`;
    s += `<span class="tm">talent-SDs below peak · cliff ${br} · data end at ${r.end}</span>`;
    helpers.showTip(s, ev.clientX, ev.clientY - 8);
  }
  let drag = null;
  host.addEventListener("pointerdown", ev => { drag = { x: ev.clientX, y: ev.clientY, t: theta, p: phi, moved: false, id: ev.pointerId, type: ev.pointerType }; host.classList.add("is-touched"); });
  host.addEventListener("pointermove", ev => {
    if (drag && drag.id === ev.pointerId) {
      const dx = ev.clientX - drag.x, dy = ev.clientY - drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true;
      if (drag.moved) {
        if (!host.hasPointerCapture(ev.pointerId)) try { host.setPointerCapture(ev.pointerId); } catch (e) {}
        theta = Math.max(-80 * DEG, Math.min(80 * DEG, drag.t - dx * 0.0065));
        if (drag.type !== "touch") phi = Math.max(4 * DEG, Math.min(70 * DEG, drag.p + dy * 0.004));
        helpers.hideTip(); invalidate();
      }
      return;
    }
    if (ev.pointerType === "touch") return;
    const h = pick(ev);
    const o = h ? h.o : null;
    if (o !== hovered) { hovered = o; highlight(); }
    tipFor(h, ev);
  });
  host.addEventListener("pointerup", ev => {
    if (drag && !drag.moved) { const h = pick(ev); tapped = h && h.o !== tapped ? h.o : null; highlight(); tipFor(tapped ? h : null, ev); }
    drag = null;
  });
  host.addEventListener("pointercancel", () => { drag = null; });
  host.addEventListener("pointerleave", () => { if (!drag) { hovered = null; highlight(); helpers.hideTip(); } });
  host.addEventListener("keydown", ev => {
    const step = 9 * DEG;
    if (ev.key === "ArrowLeft") theta = Math.max(-80 * DEG, theta - step);
    else if (ev.key === "ArrowRight") theta = Math.min(80 * DEG, theta + step);
    else if (ev.key === "ArrowUp") phi = Math.min(70 * DEG, phi + step / 2);
    else if (ev.key === "ArrowDown") phi = Math.max(4 * DEG, phi - step / 2);
    else return;
    ev.preventDefault(); host.classList.add("is-touched"); invalidate();
  });
  const ro = new ResizeObserver(() => { fit(); invalidate(); });
  ro.observe(host);
  fit(); invalidate();
  return {
    animateIn(instant) {
      if (shown) return;
      shown = true;
      if (instant || reduce) { R.forEach(o => { o.grp.scale.y = 1; }); invalidate(); return; }
      const t0 = theta;
      theta = t0 - 22 * DEG; phi = PH0 + 12 * DEG;
      animate(1800, k => { theta = t0 - 22 * DEG * (1 - k); phi = PH0 + 12 * DEG * (1 - k); });
      R.forEach((o, i) => animate(900, k => { o.grp.scale.y = Math.max(0.0001, k); }, 150 + (nz - 1 - i) * 70));
    },
    destroy() {
      alive = false; if (raf) cancelAnimationFrame(raf); ro.disconnect(); helpers.hideTip();
      disposables.forEach(d => d.dispose && d.dispose()); renderer.dispose(); renderer.forceContextLoss && renderer.forceContextLoss();
      host.innerHTML = "";
    },
  };
}

/* ------------------------------------------------------ figure init -- */
function initFigure(fig) {
  const data = fig.querySelector("script.cliff-chart-data");
  const stage = fig.querySelector(".v2-chart-stage");
  if (!data || !stage) return;
  let spec;
  try { spec = JSON.parse(data.textContent); } catch (e) { return; }
  const head = fig.querySelector(".v2-fig-head");
  const is3d = spec.type === "ridge3d";
  const views = is3d ? (GL ? ["3D", "Flat", "Table"] : ["Flat", "Table"]) : ["Chart", "Table"];
  let current = null, animate = null, ctl = null, seen = false, token = 0;
  const group = doc.createElement("div");
  group.className = "v2-views"; group.setAttribute("role", "group"); group.setAttribute("aria-label", "Chart view");
  const btns = views.map(v => {
    const b = doc.createElement("button");
    b.type = "button"; b.textContent = v; b.setAttribute("aria-pressed", "false");
    b.addEventListener("click", () => show(v, true));
    group.appendChild(b);
    return b;
  });
  if (head) head.appendChild(group);
  fig.classList.add("is-drawn");
  const flatSpec = is3d ? { ...spec.flat, id: spec.id, title: spec.title } : null;
  function draw2d() {
    if (is3d) return drawAgecurve(stage, flatSpec);
    if (spec.type === "agecurve") return drawAgecurve(stage, spec);
    if (spec.type === "rangeplot") return drawRangeplot(stage, spec);
    return null;
  }
  function show(v, user) {
    if (v === current) return;
    current = v; token++;
    btns.forEach(b => b.setAttribute("aria-pressed", String(b.textContent === v)));
    fig.classList.toggle("view-table", v === "Table");
    if (ctl && v !== "3D") { ctl.destroy(); ctl = null; }
    if (v === "Table") { stage.innerHTML = ""; return; }
    if (v === "3D") {
      stage.innerHTML = "";
      const host = doc.createElement("div");
      host.className = "v2-3d cl-3d"; host.tabIndex = 0;
      host.setAttribute("role", "img");
      host.setAttribute("aria-label", spec.title + ". Drag or use the arrow keys to turn it. The Flat and Table views show the same numbers.");
      stage.appendChild(host);
      const my = token;
      mountRidge(host, spec, { showTip, hideTip }).then(c => {
        if (my !== token) { c.destroy(); return; }
        ctl = c;
        if (seen || user) ctl.animateIn(!!user && false);
      }).catch(() => show("Flat"));
      return;
    }
    animate = draw2d();
    if (animate && (seen || user)) animate(!!user);
  }
  show(views[0]);
  onView(fig, () => {
    seen = true;
    if (ctl) ctl.animateIn(false);
    else if (animate && current !== "Table") animate(false);
  }, { threshold: 0.3 });
  let lastW = stage.clientWidth;
  if ("ResizeObserver" in window) new ResizeObserver(() => {
    const w = stage.clientWidth;
    if (Math.abs(w - lastW) < 8 || current === "3D" || current === "Table") return;
    lastW = w; animate = draw2d(); if (animate) animate(true);
  }).observe(stage);
  if (is3d && GL) onView(fig, () => loadThree(), { rootMargin: "700px 0px" });
}

/* ------------------------------------------------------- hero scene -- */
async function initHero() {
  const hero = doc.querySelector(".v2-hero[data-cliff-scene]");
  if (!hero || reduce || !GL || lowPower()) return;
  const dataEl = doc.getElementById("cliff-scene-data");
  if (!dataEl) return;
  let data;
  try { data = JSON.parse(dataEl.textContent); } catch (e) { return; }
  let THREE;
  try { THREE = await loadThree(); } catch (e) { return; }
  let mount = hero.querySelector(".v2-hero-scene");
  if (!mount) { mount = doc.createElement("div"); mount.className = "v2-hero-scene"; hero.insertBefore(mount, hero.firstChild); }
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true, powerPreference: "low-power" }); } catch (e) { return; }
  const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
  renderer.setPixelRatio(dpr); renderer.setClearColor(0x000000, 0);
  mount.appendChild(renderer.domElement);
  renderer.domElement.setAttribute("aria-hidden", "true");
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(36, 1, 1, 400);
  const accent = new THREE.Color(getComputedStyle(hero).getPropertyValue("--v2-accent").trim() || "#ff8b5e");
  const uniforms = { uTime: { value: 0 }, uDpr: { value: dpr }, uColor: { value: new THREE.Color("#a9b7ec") }, uAccent: { value: accent } };

  const rows = data.rows, nz = rows.length;
  const XA = a => (a - (data.xmin + data.xmax) / 2) * 3.6;       // age -> world x
  const ZR = j => -62 + j * (66 / (nz - 1));                      // back (-62) to front (+4)
  const KY = 8;
  const YD = d => -Math.min(d, data.cap) * KY;
  const WATER = YD(data.threshold);
  // interpolate a ridge at fractional age
  const at = (r, a) => {
    const p = r.pts;
    if (a <= p[0][0]) return p[0][1];
    for (let i = 1; i < p.length; i++) if (a <= p[i][0]) { const t = (a - p[i - 1][0]) / (p[i][0] - p[i - 1][0]); return p[i - 1][1] + (p[i][1] - p[i - 1][1]) * t; }
    return p[p.length - 1][1];
  };
  const surv = (r, a) => { const n = r.n.find(q => q[0] === a); return n ? n[1] : 0; };

  /* ridge dots + cliff faces + waterline field */
  const pos = [], bright = [], acc = [];
  rows.forEach((r, j) => {
    const z = ZR(j), a0 = r.pts[0][0], a1 = r.pts[r.pts.length - 1][0];
    const depthK = 0.45 + 0.55 * (j / (nz - 1));
    for (let a = a0; a <= a1 + 1e-6; a += 0.07) {
      const y = YD(at(r, a));
      pos.push(XA(a), y, z); bright.push((r.emph ? 1.35 : 1.0) * depthK); acc.push(r.emph ? 1 : 0);
    }
    for (let a = a0; a <= a1 + 1e-6; a += 0.5) {
      const top = YD(at(r, a));
      for (let k = 1; k <= 7; k++) { pos.push(XA(a), top - k * 1.5, z); bright.push(0.16 * depthK * (1 - k / 8)); acc.push(0); }
    }
  });
  for (let x = -40; x <= 40; x += 2) for (let z = -66; z <= 8; z += 2) { pos.push(x, WATER, z); bright.push(-0.12); acc.push(0); }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("aBright", new THREE.Float32BufferAttribute(bright, 1));
  g.setAttribute("aAcc", new THREE.Float32BufferAttribute(acc, 1));
  const fieldMat = new THREE.ShaderMaterial({
    uniforms: { ...uniforms, uWater: { value: WATER } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `
      uniform float uTime; uniform float uDpr; uniform float uWater;
      attribute float aBright; attribute float aAcc;
      varying float vA; varying float vAcc;
      void main() {
        vec3 p = position;
        float water = aBright < 0.0 ? 1.0 : 0.0;
        float b = abs(aBright);
        if (water > 0.5) { p.y += sin(p.x * 0.11 + uTime * 0.5) * 0.25 + sin(p.z * 0.17 - uTime * 0.37) * 0.2; }
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        float dist = -mv.z;
        gl_PointSize = (1.5 + b * 1.6) * (70.0 / dist) * uDpr;
        float sub = 1.0;
        float shimmer = water > 0.5 ? (0.10 + 0.06 * sin(p.x * 0.3 + p.z * 0.2 + uTime)) : 0.0;
        vA = ((0.2 + b * 0.72) * sub + shimmer) * smoothstep(180.0, 34.0, dist);
        vAcc = water > 0.5 ? 0.0 : clamp(max(aAcc * 0.0, smoothstep(uWater + 0.6, uWater - 2.5, position.y)), 0.0, 1.0);
      }`,
    fragmentShader: `
      uniform vec3 uColor; uniform vec3 uAccent;
      varying float vA; varying float vAcc;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        if (d > 0.5) discard;
        gl_FragColor = vec4(mix(uColor, uAccent, vAcc), smoothstep(0.5, 0.05, d) * vA);
      }`,
  });
  scene.add(new THREE.Points(g, fieldMat));

  /* players: flow along a ridge, wash out as the real sample thins, fall */
  const NP = 64;
  const P = [];
  const pg = new THREE.BufferGeometry();
  pg.setAttribute("position", new THREE.Float32BufferAttribute(new Array(NP * 3).fill(0), 3));
  pg.setAttribute("aOn", new THREE.Float32BufferAttribute(new Array(NP).fill(0), 1));
  pg.setAttribute("aFall", new THREE.Float32BufferAttribute(new Array(NP).fill(0), 1));
  const pMat = new THREE.ShaderMaterial({
    uniforms, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `uniform float uDpr; attribute float aOn; attribute float aFall; varying float vOn; varying float vFall;
      void main(){ vOn = aOn; vFall = aFall; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_Position = projectionMatrix * mv; gl_PointSize = (9.0 + aFall * 5.0) * (64.0 / -mv.z) * uDpr; }`,
    fragmentShader: `uniform vec3 uAccent; varying float vOn; varying float vFall;
      void main(){ float d = length(gl_PointCoord - 0.5); if (d > 0.5) discard;
        float a = (smoothstep(0.5, 0.0, d) * 0.5 + smoothstep(0.17, 0.0, d)) * vOn;
        gl_FragColor = vec4(mix(vec3(1.0), uAccent, vFall), a); }`,
  });
  scene.add(new THREE.Points(pg, pMat));
  function spawn(p, t) {
    p.j = Math.floor(Math.random() * nz);
    const r = rows[p.j];
    p.a = r.pts[0][0] + Math.random() * 3; p.speed = 1.5 + Math.random() * 1.0;
    p.state = "run"; p.vy = 0; p.y = 0; p.fade = 1; p.next = Math.floor(p.a) + 1; p.wait = 0;
  }
  for (let i = 0; i < NP; i++) { const p = {}; spawn(p, 0); p.a += Math.random() * 10; p.next = Math.floor(p.a) + 1; P.push(p); }

  const camPos = new THREE.Vector3(0, 14, 50), camLook = new THREE.Vector3(3, -5, -22);
  let w = 0, h = 0;
  function size() {
    w = mount.clientWidth; h = mount.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.fov = w / h < 1.2 ? 50 : 36; camera.updateProjectionMatrix();
  }
  size();
  new ResizeObserver(size).observe(mount);
  let mx = 0, my = 0, tx = 0, ty = 0;
  window.addEventListener("pointermove", e => { tx = e.clientX / window.innerWidth - 0.5; ty = e.clientY / window.innerHeight - 0.5; }, { passive: true });
  let visible = true, running = false, last = 0, t = 0;
  const minDt = 1000 / 30;
  const stats = (window.__v2scene = { frames: 0, since: performance.now(), scene: "cliff-ridges" });
  function update(dt) {
    const pa = pg.attributes.position, on = pg.attributes.aOn, fall = pg.attributes.aFall;
    P.forEach((p, i) => {
      const r = rows[p.j];
      const end = r.pts[r.pts.length - 1][0];
      if (p.state === "run") {
        p.a += p.speed * dt;
        if (p.a >= p.next) {
          const keepP = Math.min(1, surv(r, p.next) / Math.max(1e-6, surv(r, p.next - 1) || 1e-6));
          if (p.next > end || Math.random() > keepP) { p.state = "fall"; p.y = YD(at(r, Math.min(p.a, end))); p.vy = 0; }
          p.next += 1;
        }
        if (p.state === "run") { pa.setXYZ(i, XA(p.a), YD(at(r, p.a)) + 0.35, ZR(p.j)); on.setX(i, 0.85); fall.setX(i, 0); }
      }
      if (p.state === "fall") {
        p.vy -= 26 * dt; p.y += p.vy * dt; p.fade -= dt * 0.8;
        pa.setXYZ(i, XA(Math.min(p.a, end + 0.3)), p.y, ZR(p.j)); on.setX(i, Math.max(0, p.fade)); fall.setX(i, 1);
        if (p.fade <= 0) { p.state = "wait"; p.wait = 0.4 + Math.random() * 1.6; on.setX(i, 0); }
      } else if (p.state === "wait") {
        p.wait -= dt; if (p.wait <= 0) spawn(p, t);
      }
    });
    pa.needsUpdate = true; on.needsUpdate = true; fall.needsUpdate = true;
  }
  function loop(now) {
    if (!(visible && !doc.hidden)) { running = false; return; }
    requestAnimationFrame(loop);
    if (now - last < minDt - 1) return;
    const dt = Math.min(0.1, (now - (last || now)) / 1000);
    last = now; t += dt;
    uniforms.uTime.value = t; fieldMat.uniforms.uTime.value = t;
    update(dt);
    mx += (tx - mx) * 0.04; my += (ty - my) * 0.04;
    const scroll = Math.min(1, Math.max(0, -hero.getBoundingClientRect().top / Math.max(1, hero.offsetHeight)));
    camera.position.set(camPos.x + Math.sin(t * 0.05) * 5 + mx * 6, camPos.y + my * 3 + scroll * 8, camPos.z - scroll * 6);
    camera.lookAt(camLook.x + mx * 2, camLook.y - scroll * 5, camLook.z);
    renderer.render(scene, camera);
    stats.frames++;
  }
  function wake() { if (!running && visible && !doc.hidden) { running = true; last = 0; requestAnimationFrame(loop); } }
  new IntersectionObserver(es => { visible = es[0].isIntersecting; wake(); }, { threshold: 0 }).observe(hero);
  doc.addEventListener("visibilitychange", wake);
  renderer.domElement.addEventListener("webglcontextlost", e => { e.preventDefault(); visible = false; hero.classList.remove("has-scene"); });
  wake();
  requestAnimationFrame(() => hero.classList.add("has-scene"));
}

function go() {
  doc.querySelectorAll("figure.cliff-chart").forEach(initFigure);
  initHero();
}
if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", go); else go();
