/* EBK Deep Bag v2 hero scene "return-bowl" (scene API 2, docs/deep-bag-v2.md).
   Study: revenge-game ("Payback Is a Rounding Error"). v3, 2026-10-09: "Circle the date".

   A still life on a dark team-room table, lit like a stage: the player's season
   schedule, his old team's jersey folded beside it (RIVERTON 84, fictional), a red
   marker and its cap, a football. Everything is modelled here (no files, no logos).

   Establishing beat (about 4 s): a single warm spotlight clunks on over the schedule
   and the marker circles week 5, "at RIVERTON", hard, twice round, then is tossed down.
   The wink: a plain sticky note drops onto the card beside the circle:
   "+0.35 fpts. About what home field is worth."
   Loop: the hanging lamp sways a little, dust turns in the beam, the camera breathes.
   Scroll: the house lights come up and the camera rises off the table. The drama was
   one spotlight; on a normal Sunday it is an ordinary table.

   data-scene-data (optional): { n, est, home }   est = the bump, home = home field
   opts { note: "+0.35", noteSub: ["fpts. About what", "home field is worth."],
          layout: "wide" | "tall" (default by aspect) | "share" (the share card art),
          freeze: { t, scroll }  (stills: render one moment, no clock) }

   Rendering notes: no realtime shadows (contact shadows are baked into the table and
   two soft blobs move with the marker and the note); every flat thing (table, card,
   jersey, note) is a textured plane with a soft alpha edge, so the edges stay smooth
   without MSAA; the environment is a small RoomEnvironment-style PMREM made here,
   once, from the renderer the core passes to scene.onBeforeRender. */

const TAU = Math.PI * 2;
const cl = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const ss = (a, b, x) => { const t = cl((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const inOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const outCubic = (t) => 1 - Math.pow(1 - cl(t), 3);
const mix = (a, b, k) => a + (b - a) * k;
function rng(seed) {
  return function () {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const F_DISP = '"Bricolage Grotesque", "Segoe UI", system-ui, sans-serif';
const F_TEXT = '"Schibsted Grotesk", "Segoe UI", system-ui, sans-serif';
const F_NUM = '"Martian Mono", "Cascadia Mono", Consolas, monospace';
const INK = "#1b2440", SLATE = "#56607a", PAPER = "#e9e5dc";
const JERSEY = "#3f5a8c", JERSEY_D = "#2f4670", TRIM = "#e9ecf2";

function makeCanvas(w, h) { const c = document.createElement("canvas"); c.width = w; c.height = h; return c; }
function rrect(g, x, y, w, h, r) {
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}
// paint only the blurred shadow of a path (the shape itself is drawn far off canvas)
function shadowOnly(g, blur, alpha, dx, dy, drawPath) {
  g.save();
  g.shadowColor = `rgba(2,4,10,${alpha})`; g.shadowBlur = blur; g.shadowOffsetX = 10000 + dx; g.shadowOffsetY = dy;
  g.translate(-10000, 0); drawPath(g); g.fillStyle = "#000"; g.fill();
  g.restore();
}

/* ------------------------------------------------------------ schedule -- */
const CARD_W = 30, CARD_H = 54, ROW0 = 7.6, ROW_H = 2.5;
const WEEKS = [
  [1, "SEP 7", "vs", "HARBOR", "1:00", "#7d8aa8"], [2, "SEP 14", "at", "SUMMIT", "4:25", "#5b6b5e"],
  [3, "SEP 21", "vs", "LAKESHORE", "1:00", "#4f6fa0"], [4, "SEP 28", "at", "IRONWOOD", "1:00", "#6b5a52"],
  [5, "OCT 5", "at", "RIVERTON", "4:25", JERSEY], [6, "OCT 12", "vs", "CAPITOL", "8:20", "#8c8f99"],
  [7, "OCT 19", "at", "PINE CITY", "1:00", "#4d6355"], [8, "", "", "BYE WEEK", "", ""],
  [9, "NOV 2", "vs", "BAYSIDE", "4:05", "#5f7d93"], [10, "NOV 9", "vs", "NORTHGATE", "1:00", "#72656f"],
  [11, "NOV 16", "at", "MESA", "4:05", "#8a6f55"], [12, "NOV 23", "vs", "HIGHLAND", "1:00", "#44506a"],
  [13, "NOV 30", "at", "GRANITE", "8:20", "#7a7f88"], [14, "DEC 7", "vs", "SUMMIT", "1:00", "#5b6b5e"],
  [15, "DEC 14", "at", "HARBOR", "1:00", "#7d8aa8"], [16, "DEC 21", "vs", "IRONWOOD", "4:25", "#6b5a52"],
  [17, "DEC 28", "at", "LAKESHORE", "1:00", "#4f6fa0"], [18, "JAN 4", "vs", "CAPITOL", "1:00", "#8c8f99"],
];
const CIRCLED = 5;
const rowY = (wk) => ROW0 + (wk - 0.5) * ROW_H;

function drawCard(c) {
  const g = c.getContext("2d"), k = c.width / CARD_W, R = rng(4);
  g.clearRect(0, 0, c.width, c.height);
  const pad = 0.12 * k;
  rrect(g, pad, pad, c.width - 2 * pad, c.height - 2 * pad, 0.5 * k);
  g.save(); g.clip();
  g.fillStyle = PAPER; g.fillRect(0, 0, c.width, c.height);
  // paper tooth
  for (let i = 0; i < 9000; i++) {
    g.fillStyle = R() < 0.5 ? "rgba(255,255,255,0.10)" : "rgba(60,50,40,0.06)";
    g.fillRect(R() * c.width, R() * c.height, 1 + R() * 2, 1 + R() * 2);
  }
  // header
  g.fillStyle = INK; g.fillRect(0, 0, c.width, 6.2 * k);
  g.fillStyle = "#f2efe8"; g.textBaseline = "alphabetic";
  g.font = `800 ${3.9 * k}px ${F_DISP}`; g.fillText("2025", 1.5 * k, 4.75 * k);
  g.textAlign = "right";
  g.font = `700 ${0.95 * k}px ${F_TEXT}`; g.letterSpacing = `${0.22 * k}px`;
  g.fillText("SEASON SCHEDULE", 28.5 * k, 2.85 * k);
  g.fillStyle = "rgba(242,239,232,0.62)"; g.font = `600 ${0.72 * k}px ${F_TEXT}`; g.letterSpacing = `${0.16 * k}px`;
  g.fillText("HOME GAMES IN BOLD · ALL TIMES ET", 28.5 * k, 4.5 * k);
  g.letterSpacing = "0px"; g.textAlign = "left";
  // rows
  WEEKS.forEach(([wk, date, ha, opp, time, chip], i) => {
    const y = rowY(wk) * k, top = (ROW0 + i * ROW_H) * k;
    if (i % 2 === 0) { g.fillStyle = "rgba(27,36,64,0.045)"; g.fillRect(0.9 * k, top, 28.2 * k, ROW_H * k); }
    g.textBaseline = "middle";
    g.fillStyle = SLATE; g.font = `600 ${0.78 * k}px ${F_NUM}`;
    g.fillText(String(wk).padStart(2, "0"), 1.5 * k, y);
    if (!date) {
      g.fillStyle = "rgba(86,96,122,0.7)"; g.font = `600 ${0.82 * k}px ${F_TEXT}`; g.letterSpacing = `${0.3 * k}px`;
      g.fillText(opp, 12.6 * k, y); g.letterSpacing = "0px";
      return;
    }
    g.font = `500 ${0.74 * k}px ${F_NUM}`; g.fillText(date, 4.0 * k, y);
    const home = ha === "vs";
    g.font = `${home ? 700 : 500} ${0.8 * k}px ${F_TEXT}`; g.fillStyle = home ? INK : SLATE;
    g.fillText(ha, 9.6 * k, y);
    g.fillStyle = chip; rrect(g, 11.1 * k, y - 0.52 * k, 1.04 * k, 1.04 * k, 0.22 * k); g.fill();
    g.fillStyle = home ? INK : "#3a435e"; g.font = `${home ? 800 : 600} ${1.18 * k}px ${F_DISP}`;
    g.fillText(opp, 12.75 * k, y + 0.05 * k);
    g.textAlign = "right"; g.fillStyle = SLATE; g.font = `500 ${0.74 * k}px ${F_NUM}`;
    g.fillText(time, 28.5 * k, y); g.textAlign = "left";
  });
  g.strokeStyle = "rgba(27,36,64,0.25)"; g.lineWidth = 0.05 * k;
  g.beginPath(); g.moveTo(1.2 * k, 52.6 * k); g.lineTo(28.8 * k, 52.6 * k); g.stroke();
  g.restore();
}

// the hand-drawn circle round week 9: a polyline in card cm, param by arc length
function inkPath() {
  const R = rng(19), pts = [];
  const cx = 14.4, cy = rowY(CIRCLED) - 0.3, rx = 13.2, ry = 1.4, tilt = -0.01, turns = 2.08, a0 = Math.PI * 0.93;
  const ph1 = R() * TAU, ph2 = R() * TAU, N = 520;
  for (let i = 0; i <= N; i++) {
    const f = i / N, loop = f * turns, a = a0 + f * turns * TAU;
    const w = 1 + 0.045 * Math.sin(a * 2 + ph1) + 0.025 * Math.sin(a * 3 + ph2 + loop * 1.7) + loop * 0.035;
    const egg = 1 + 0.06 * Math.cos(a);                       // a hand pushes the far end wider
    const lp = ss(0.6, 1.6, loop);                           // the second lap drifts: lower, wider, a little right
    let x = Math.cos(a) * rx * w * egg * (1 + lp * 0.03) + lp * 0.9, y = Math.sin(a) * ry * (w + lp * 0.22) + lp * 0.32;
    const xr = x * Math.cos(tilt) - y * Math.sin(tilt), yr = x * Math.sin(tilt) + y * Math.cos(tilt);
    pts.push([cx + xr, cy + yr]);
  }
  const len = [0];
  for (let i = 1; i < pts.length; i++) len.push(len[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const L = len[len.length - 1];
  return { pts, par: len.map((v) => v / L) };
}
function drawInk(c, path) {
  const g = c.getContext("2d"), k = c.width / CARD_W;
  g.clearRect(0, 0, c.width, c.height);
  g.lineCap = "round"; g.lineJoin = "round";
  g.globalCompositeOperation = "destination-over"; // earlier strokes stay on top, so the reveal never gaps
  const { pts, par } = path;
  for (let i = 1; i < pts.length; i++) {
    const f = par[i];
    g.lineWidth = 0.66 * k * (0.72 + 0.28 * ss(0, 0.05, f)) * (1 - 0.5 * ss(0.9, 1, f));
    g.strokeStyle = `rgb(255,${Math.round(f * 255)},0)`;
    g.beginPath(); g.moveTo(pts[i - 1][0] * k, pts[i - 1][1] * k); g.lineTo(pts[i][0] * k, pts[i][1] * k); g.stroke();
  }
  g.globalCompositeOperation = "source-over";
}

/* -------------------------------------------------------------- jersey -- */
const JW = 38, JH = 42; // plane; the folded jersey's footprint is inset 1 cm
function jerseyPath(g, k) { rrect(g, 1 * k, 1 * k, (JW - 2) * k, (JH - 2) * k, 3.2 * k); }
function jerseySDF(x, y) { // x, y in cm from the plane's top-left; negative inside
  const hx = (JW - 2) / 2, hy = (JH - 2) / 2, r = 3.2;
  const qx = Math.abs(x - JW / 2) - (hx - r), qy = Math.abs(y - JH / 2) - (hy - r);
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
}
function drawJersey(c, num, word) {
  const g = c.getContext("2d"), k = c.width / JW, R = rng(7);
  g.clearRect(0, 0, c.width, c.height);
  jerseyPath(g, k); g.save(); g.clip();
  g.fillStyle = JERSEY; g.fillRect(0, 0, c.width, c.height);
  // athletic mesh
  g.fillStyle = "rgba(160,185,235,0.10)";
  for (let y = 0; y < JH; y += 0.34) for (let x = (y * 3) % 0.34; x < JW; x += 0.34) g.fillRect(x * k, y * k, 0.12 * k, 0.12 * k);
  // the folded-in sleeves, both sides, with their stripes
  for (const [x0, x1] of [[1, 8.2], [29.8, 37]]) {
    g.fillStyle = "rgba(20,30,60,0.22)"; g.fillRect(x0 * k, 0, (x1 - x0) * k, c.height);
    for (const [y0, h] of [[6.2, 1.1], [8.1, 1.1]]) { g.fillStyle = TRIM; g.fillRect(x0 * k, y0 * k, (x1 - x0) * k, h * k); }
    g.fillStyle = "rgba(10,16,34,0.18)"; g.fillRect(x0 * k, 11.4 * k, (x1 - x0) * k, 0.25 * k);
  }
  for (const x of [8.2, 29.8]) { // creases
    g.fillStyle = "rgba(8,14,30,0.55)"; g.fillRect((x - 0.12) * k, 0, 0.24 * k, c.height);
    g.fillStyle = "rgba(190,210,255,0.14)"; g.fillRect((x + (x < 19 ? 0.14 : -0.5)) * k, 0, 0.36 * k, c.height);
  }
  // V-neck: the inside of the back shows through, then trim
  const vn = () => { g.beginPath(); g.moveTo(13.2 * k, 0.6 * k); g.lineTo(19 * k, 8.6 * k); g.lineTo(24.8 * k, 0.6 * k); };
  vn(); g.closePath(); g.fillStyle = "#1a2541"; g.fill();
  vn(); g.strokeStyle = "#1c2848"; g.lineWidth = 1.5 * k; g.lineJoin = "miter"; g.stroke();
  vn(); g.strokeStyle = TRIM; g.lineWidth = 0.55 * k; g.stroke();
  // wordmark on a gentle arch
  g.fillStyle = TRIM; g.textAlign = "center"; g.textBaseline = "alphabetic";
  g.font = `800 ${2.25 * k}px ${F_DISP}`;
  const letters = word.split(""), track = 0.42 * k;
  const widths = letters.map((ch) => g.measureText(ch).width + track);
  const total = widths.reduce((s, w) => s + w, 0) - track;
  let x = JW / 2 * k - total / 2;
  letters.forEach((ch, i) => {
    const cx = x + widths[i] / 2 - track / 2, u = (cx / k - JW / 2) / 10;
    g.save(); g.translate(cx, (13.3 + u * u * 1.4) * k); g.rotate(u * 0.12); g.fillText(ch, 0, 0); g.restore();
    x += widths[i];
  });
  // numbers: twill, outlined
  g.font = `800 ${17.5 * k}px ${F_DISP}`; g.textBaseline = "middle";
  g.lineJoin = "round";
  g.strokeStyle = "#1a2541"; g.lineWidth = 1.3 * k; g.strokeText(num, JW / 2 * k, 25.6 * k);
  g.fillStyle = TRIM; g.fillText(num, JW / 2 * k, 25.6 * k);
  g.strokeStyle = "rgba(26,37,65,0.35)"; g.lineWidth = 0.12 * k; g.strokeText(num, JW / 2 * k, 25.6 * k);
  // fold at the hem, and a soft fabric falloff toward the rolled edges
  g.fillStyle = "rgba(8,14,30,0.35)"; g.fillRect(0, 36.6 * k, c.width, 0.3 * k);
  const eg = g.createRadialGradient(JW / 2 * k, JH / 2 * k, 10 * k, JW / 2 * k, JH / 2 * k, 26 * k);
  eg.addColorStop(0, "rgba(0,0,0,0)"); eg.addColorStop(1, "rgba(5,8,20,0.35)");
  g.fillStyle = eg; g.fillRect(0, 0, c.width, c.height);
  for (let i = 0; i < 2500; i++) { g.fillStyle = "rgba(0,0,0,0.05)"; g.fillRect(R() * c.width, R() * c.height, 2, 2); }
  g.restore();
}

/* ---------------------------------------------------------------- note -- */
const NOTE = 16;
function drawNote(c, big, sub) {
  const g = c.getContext("2d"), k = c.width / NOTE, R = rng(3);
  g.clearRect(0, 0, c.width, c.height);
  rrect(g, 0.1 * k, 0.1 * k, c.width - 0.2 * k, c.height - 0.2 * k, 0.25 * k);
  g.save(); g.clip();
  const bg = g.createLinearGradient(0, 0, 0, c.height);
  bg.addColorStop(0, "#e4e8f0"); bg.addColorStop(1, "#d9dee8");
  g.fillStyle = bg; g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = "rgba(27,36,64,0.06)"; g.fillRect(0, 0, c.width, 2.6 * k); // the glue strip
  for (let i = 0; i < 2600; i++) { g.fillStyle = R() < 0.5 ? "rgba(255,255,255,0.18)" : "rgba(30,40,70,0.05)"; g.fillRect(R() * c.width, R() * c.height, 1.5, 1.5); }
  g.fillStyle = INK; g.textAlign = "left"; g.textBaseline = "alphabetic";
  g.font = `800 ${4.9 * k}px ${F_DISP}`; g.letterSpacing = `${-0.14 * k}px`;
  g.fillText(big, 1.15 * k, 7.4 * k); g.letterSpacing = "0px";
  // a pencil underline
  g.strokeStyle = "rgba(70,78,100,0.75)"; g.lineWidth = 0.16 * k; g.lineCap = "round";
  g.beginPath(); g.moveTo(1.3 * k, 8.65 * k); g.quadraticCurveTo(7 * k, 8.3 * k, 14.3 * k, 8.7 * k); g.stroke();
  g.fillStyle = "#2f3852"; g.font = `600 ${1.55 * k}px ${F_TEXT}`;
  sub.forEach((line, i) => g.fillText(line, 1.2 * k, (11.3 + i * 2.05) * k));
  g.restore();
}

/* --------------------------------------------------------------- table -- */
const TW = 320, TD = 210;
function drawTable(c, shadows) {
  const g = c.getContext("2d"), k = c.width / TW, R = rng(11);
  const base = g.createLinearGradient(0, 0, 0, c.height);
  base.addColorStop(0, "#1a2033"); base.addColorStop(1, "#202739");
  g.fillStyle = base; g.fillRect(0, 0, c.width, c.height);
  const PLANK = 15.5;
  for (let p = 0, y = 0; y < TD; p++, y += PLANK) {
    g.fillStyle = `rgba(${p % 2 ? "255,255,255" : "0,0,0"},${0.012 + R() * 0.02})`; g.fillRect(0, y * k, c.width, PLANK * k);
    for (let i = 0; i < 26; i++) { // grain
      const gy = (y + R() * PLANK) * k, amp = (0.2 + R() * 0.6) * k, ph = R() * 9, fr = 0.01 + R() * 0.03;
      g.strokeStyle = `rgba(${R() < 0.5 ? "0,0,0" : "180,195,235"},${0.03 + R() * 0.035})`; g.lineWidth = (0.08 + R() * 0.25) * k;
      g.beginPath();
      for (let x = 0; x <= TW; x += 4) { const yy = gy + Math.sin(x * fr + ph) * amp; x ? g.lineTo(x * k, yy) : g.moveTo(0, yy); }
      g.stroke();
    }
    g.fillStyle = "rgba(0,0,0,0.55)"; g.fillRect(0, y * k - 0.14 * k, c.width, 0.28 * k); // seam
    g.fillStyle = "rgba(170,190,240,0.05)"; g.fillRect(0, y * k + 0.14 * k, c.width, 0.12 * k);
  }
  shadows.forEach((s) => s(g, k));
}

/* ------------------------------------------------- environment (PMREM) -- */
function roomEnv(THREE) {
  // a dark room with a few soft panels: the RoomEnvironment idea, kept dim and cool
  const scene = new THREE.Scene();
  const box = new THREE.BoxGeometry();
  const room = new THREE.Mesh(box, new THREE.MeshBasicMaterial({ color: 0x1a2135, side: THREE.BackSide }));
  room.scale.set(30, 14, 30); room.position.y = 5; scene.add(room);
  const panel = (c, s, p, intensity) => {
    const m = new THREE.Mesh(box, new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(intensity) }));
    m.scale.set(...s); m.position.set(...p); scene.add(m);
  };
  panel(0xfff1e0, [8, 0.2, 6], [0, 11.8, 0], 5.0);     // the overhead lamp
  panel(0xa9bdf0, [0.2, 5, 12], [-14.8, 5, 0], 1.4);    // cool bounce, left
  panel(0xdfe6ff, [0.2, 4, 9], [14.8, 6, -2], 1.8);     // window, right
  panel(0xe5533f, [6, 1.2, 0.2], [0, 3, -14.8], 0.5);   // a faint warm accent from the far wall
  return scene;
}

/* ------------------------------------------------------------- scene -- */
export default function circleTheDate(ctx, opts = {}) {
  const { THREE, scene, accent, hero, data } = ctx;
  const d = data || {};
  const est = typeof d.est === "number" ? d.est : 0.35;
  const noteBig = opts.note || `+${est.toFixed(2)}`;
  const noteSub = opts.noteSub || ["fpts. About what", "home field is worth."];
  const freeze = opts.freeze || null;
  const aspect0 = hero && hero.clientHeight ? hero.clientWidth / hero.clientHeight : 1.6;
  const tall = opts.layout ? opts.layout === "tall" : aspect0 < 1.1;
  const share = opts.layout === "share"; // the 1200x630 share card: the schedule on the right, text on the left
  const v3 = (x, y, z) => new THREE.Vector3(x, y, z);

  /* ---- layout (cm, table plane y = 0; +z is toward the viewer) ---- */
  const L = share ? {
    view: { w: 122, h: 64 }, el: 0.98, az: 0.0, target: v3(0, 0, 0),
    circle: v3(20, 0, -19), cardRot: -0.06,
    jersey: v3(-44, 0, 14), jerseyRot: 0.2,
    ball: v3(-50, 0, -28), ballRot: 0.4,
    markerRest: v3(10, 0, 22), markerRot: -0.3,
    cap: v3(-6, 0, 24), capRot: 0.6,
    note: { at: v3(44, 0, -15), rot: 0.12 },
  } : tall ? {
    view: { w: 50, h: 108 }, el: 1.08, az: 0.0, target: v3(0, 0, -4),
    circle: v3(-2, 0, -33), cardRot: -0.05,
    jersey: v3(24, 0, 30), jerseyRot: 0.22,
    ball: v3(-24, 0, 40), ballRot: -0.5,
    markerRest: v3(-7, 0, -6), markerRot: 2.85,
    cap: v3(14.5, 0, -3), capRot: 1.3,
    note: { at: v3(14, 0, -22), rot: 0.14 },
  } : {
    view: { w: 122, h: 72 }, el: 0.98, az: 0.0, target: v3(0, 0, 0),
    circle: v3(-42, 0, -25), cardRot: 0.07,
    jersey: v3(41, 0, 10), jerseyRot: -0.24,
    ball: v3(53, 0, -22), ballRot: 2.55,
    markerRest: v3(-33, 0, 19), markerRot: -0.32,
    cap: v3(-20, 0, 23), capRot: 0.55,
    note: { at: v3(-17.5, 0, -27.5), rot: 0.15 },
  };

  const root = new THREE.Group(); root.visible = false; scene.add(root);
  const mats = []; // every lit material, for the env intensity ramp
  const lit = (m) => { mats.push(m); return m; };
  const texs = [];
  const canvasTex = (c, srgb = true) => {
    const t = new THREE.CanvasTexture(c);
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4; texs.push(t); return t;
  };

  /* ---- the card ---- */
  const cardCanvas = makeCanvas(1024, Math.round(1024 * CARD_H / CARD_W));
  const inkCanvas = makeCanvas(640, Math.round(640 * CARD_H / CARD_W));
  const path = inkPath();
  drawCard(cardCanvas); drawInk(inkCanvas, path);
  const cardTex = canvasTex(cardCanvas), inkTex = canvasTex(inkCanvas, false);
  const uInk = { uInk: { value: inkTex }, uProg: { value: 0 }, uInkColor: { value: new THREE.Color(accent).multiplyScalar(0.42) } };
  const cardMat = lit(new THREE.MeshStandardMaterial({ map: cardTex, roughness: 0.7, metalness: 0, transparent: true }));
  cardMat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uInk);
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform sampler2D uInk; uniform float uProg; uniform vec3 uInkColor;")
      .replace("#include <map_fragment>", `#include <map_fragment>
        vec4 rgInk = texture2D(uInk, vMapUv);
        float rgRev = rgInk.a * (1.0 - smoothstep(uProg - 0.006, uProg + 0.0005, rgInk.g));
        diffuseColor.rgb = mix(diffuseColor.rgb, uInkColor, rgRev * 0.97);`)
      .replace("#include <roughnessmap_fragment>", "#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.34, rgRev);");
  };
  cardMat.customProgramCacheKey = () => "rg-card";
  const cardGeo = new THREE.PlaneGeometry(CARD_W, CARD_H, 10, 20);
  cardGeo.rotateX(-Math.PI / 2);
  { // a slight curl: the near corners lift off the table
    const p = cardGeo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i);
      p.setY(i, 0.08 + 0.55 * Math.pow(ss(18, 27, z), 2) * (0.4 + 0.6 * ss(0, 15, Math.abs(x))) + 0.25 * Math.pow(ss(-20, -27, z), 2));
    }
    cardGeo.computeVertexNormals();
  }
  const card = new THREE.Mesh(cardGeo, cardMat);
  card.rotation.y = L.cardRot;
  // place the card so the circled row lands on L.circle
  const rowLocal = v3(15 - CARD_W / 2, 0, rowY(CIRCLED) - CARD_H / 2).applyAxisAngle(v3(0, 1, 0), L.cardRot);
  card.position.copy(L.circle).sub(rowLocal); card.position.y = 0;
  card.renderOrder = 2; root.add(card);
  card.updateMatrixWorld(true);
  const cardPt = (cx, cy, lift = 0.16) => v3(cx - CARD_W / 2, lift, cy - CARD_H / 2).applyMatrix4(card.matrixWorld);

  /* ---- the jersey ---- */
  const jCanvas = makeCanvas(1024, Math.round(1024 * JH / JW));
  drawJersey(jCanvas, "84", "RIVERTON");
  const jMat = lit(new THREE.MeshPhysicalMaterial({
    map: canvasTex(jCanvas), roughness: 0.86, metalness: 0, transparent: true,
    sheen: 1, sheenRoughness: 0.42, sheenColor: new THREE.Color(0x9fb4e6),
  }));
  const jGeo = new THREE.PlaneGeometry(JW, JH, 76, 84);
  jGeo.rotateX(-Math.PI / 2);
  {
    const p = jGeo.attributes.position, R = rng(5);
    const ph = [R() * 6, R() * 6, R() * 6];
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i) + JW / 2, y = p.getZ(i) + JH / 2;
      const sd = jerseySDF(x, y);
      let h = 3.1 * Math.pow(ss(0, 4.2, -sd), 0.75);
      h += 0.42 * (Math.exp(-Math.pow((x - 4.6) / 2.6, 2)) + Math.exp(-Math.pow((x - 33.4) / 2.6, 2))) * ss(0, 2, -sd);
      h -= 0.28 * (Math.exp(-Math.pow((x - 8.2) / 0.45, 2)) + Math.exp(-Math.pow((x - 29.8) / 0.45, 2))) * ss(0, 2, -sd);
      const vx = Math.abs(x - 19), inV = y < 8.6 && vx < (8.6 - y) * 0.72 ? 1 : 0;
      h -= 0.7 * inV * ss(0, 1.5, (8.6 - y) * 0.72 - vx);
      h += (0.16 * Math.sin(x * 0.42 + y * 0.18 + ph[0]) + 0.12 * Math.sin(y * 0.55 - x * 0.12 + ph[1]) + 0.08 * Math.sin((x + y) * 0.9 + ph[2])) * ss(0, 3, -sd);
      h += 0.35 * Math.exp(-Math.pow((y - 37.4) / 1.1, 2)) * ss(0, 2, -sd);
      p.setY(i, Math.max(0.02, h));
    }
    jGeo.computeVertexNormals();
  }
  const jersey = new THREE.Mesh(jGeo, jMat);
  jersey.position.copy(L.jersey); jersey.rotation.y = L.jerseyRot; jersey.renderOrder = 1; root.add(jersey);

  /* ---- the football ---- */
  const BALL_L = 14.2, BALL_R = 8.6;
  const prof = [];
  for (let i = 0; i <= 40; i++) {
    const y = -BALL_L + (2 * BALL_L * i) / 40;
    prof.push(new THREE.Vector2(Math.max(0.001, BALL_R * Math.pow(Math.max(0, 1 - (y / BALL_L) ** 2), 0.68)), y));
  }
  const ballC = makeCanvas(1024, 512);
  {
    const g = ballC.getContext("2d"), R = rng(2), W = ballC.width, H = ballC.height;
    g.fillStyle = "#7a4b2f"; g.fillRect(0, 0, W, H);
    for (let i = 0; i < 26000; i++) { g.fillStyle = R() < 0.5 ? "rgba(0,0,0,0.16)" : "rgba(255,210,170,0.07)"; g.beginPath(); g.arc(R() * W, R() * H, 0.8 + R() * 1.6, 0, TAU); g.fill(); }
    for (const u of [0, 0.25, 0.5, 0.75, 1]) { g.fillStyle = "rgba(20,10,5,0.75)"; g.fillRect(u * W - 3, 0, 6, H); }
    // laces on the top panel seam (u = 0.25)
    const lx = 0.25 * W;
    g.fillStyle = "#e9e6df";
    g.fillRect(lx - 3, H * 0.3, 6, H * 0.4);
    for (let i = 0; i < 8; i++) { const y = H * (0.33 + i * 0.048); rrect(g, lx - 26, y, 52, 9, 4); g.fill(); }
    const sh = g.createLinearGradient(0, 0, 0, H); // darker toward the tips
    sh.addColorStop(0, "rgba(0,0,0,0.45)"); sh.addColorStop(0.25, "rgba(0,0,0,0)"); sh.addColorStop(0.75, "rgba(0,0,0,0)"); sh.addColorStop(1, "rgba(0,0,0,0.45)");
    g.fillStyle = sh; g.fillRect(0, 0, W, H);
  }
  const ballTex = canvasTex(ballC);
  const ballMat = lit(new THREE.MeshPhysicalMaterial({ map: ballTex, bumpMap: ballTex, bumpScale: 0.6, roughness: 0.62, clearcoat: 0.25, clearcoatRoughness: 0.5 }));
  const ball = new THREE.Mesh(new THREE.LatheGeometry(prof, 48), ballMat);
  ball.rotation.set(0, 0, Math.PI / 2); // lie on its side, laces up (u = 0.25 faces +y)
  ball.rotateY(0.3);                     // and roll them a little toward the viewer
  const ballG = new THREE.Group(); ballG.add(ball);
  ballG.position.copy(L.ball); ballG.position.y = BALL_R * 0.97; ballG.rotation.y = L.ballRot; root.add(ballG);

  /* ---- the marker and its cap ---- */
  const MR = 0.74, ML = 13.6;
  const red = new THREE.Color(accent), redD = new THREE.Color(accent).multiplyScalar(0.55), white = new THREE.Color(0xe7eaf1), navy = new THREE.Color(0x1d2742);
  const mProf = [[0, 0, redD], [0.14, 0.06, redD], [0.24, 0.62, redD], [0.3, 1.0, redD], [0.3, 1.001, red], [0.52, 1.3, red], [0.64, 1.9, red],
    [0.64, 1.901, navy], [0.69, 2.2, navy], [0.69, 3.6, navy], [0.69, 3.601, white], [MR, 3.75, white], [MR, 12.3, white], [MR, 12.301, red],
    [MR, 13.0, red], [0.62, 13.4, red], [0.32, 13.62, red], [0, ML, red]];
  const mGeo = new THREE.LatheGeometry(mProf.map(([r, y]) => new THREE.Vector2(Math.max(0.001, r), y)), 28);
  {
    const p = mGeo.attributes.position, col = new Float32Array(p.count * 3), segs = 29, n = mProf.length;
    for (let i = 0; i < p.count; i++) { const c = mProf[i % n][2]; col.set([c.r, c.g, c.b], i * 3); }
    mGeo.setAttribute("color", new THREE.BufferAttribute(col, 3));
    void segs;
  }
  const mMat = lit(new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.38, clearcoat: 0.7, clearcoatRoughness: 0.25 }));
  const marker = new THREE.Mesh(mGeo, mMat); marker.renderOrder = 4; root.add(marker);
  const capProf = [[0.001, 0], [0.82, 0.05], [0.88, 0.4], [0.88, 4.3], [0.78, 4.6], [0.001, 4.68]].map(([r, y]) => new THREE.Vector2(r, y));
  const capMat = lit(new THREE.MeshPhysicalMaterial({ color: accent, roughness: 0.36, clearcoat: 0.7, clearcoatRoughness: 0.25 }));
  const cap = new THREE.Group();
  const capBody = new THREE.Mesh(new THREE.LatheGeometry(capProf, 24), capMat);
  const clip = new THREE.Mesh(new THREE.BoxGeometry(0.42, 3.4, 0.36), capMat);
  clip.position.set(0, 2.6, 0.95); capBody.add(clip);
  capBody.rotation.z = Math.PI / 2; capBody.position.y = 0.88; capBody.rotation.x = 0.35;
  cap.add(capBody); cap.position.copy(L.cap); cap.rotation.y = L.capRot; root.add(cap);

  /* ---- soft blob shadows for the two things that move ---- */
  const blobC = makeCanvas(128, 128);
  { const g = blobC.getContext("2d"), gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, "rgba(255,255,255,1)"); gr.addColorStop(0.45, "rgba(255,255,255,0.55)"); gr.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128); }
  const blobTex = canvasTex(blobC, false);
  const sqC = makeCanvas(128, 128); // a soft square, for the note
  { const g = sqC.getContext("2d");
    shadowOnly(g, 14, 1, 0, 0, (gg) => rrect(gg, 22, 22, 84, 84, 6));
    const d = g.getImageData(0, 0, 128, 128); // shadow is dark-on-black: move its alpha into the colour channels for alphaMap
    for (let i = 0; i < d.data.length; i += 4) { const a = d.data[i + 3]; d.data[i] = d.data[i + 1] = d.data[i + 2] = a; d.data[i + 3] = 255; }
    g.putImageData(d, 0, 0); }
  const sqTex = canvasTex(sqC, false);
  const blob = (ro, map) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0x02040a, alphaMap: map, transparent: true, depthWrite: false, opacity: 0 }));
    m.renderOrder = ro; root.add(m); return m;
  };
  const mShadow = blob(3, blobTex), nShadow = blob(3, sqTex);

  /* ---- the note ---- */
  const noteC = makeCanvas(512, 512);
  drawNote(noteC, noteBig, noteSub);
  const noteTex = canvasTex(noteC);
  const noteGeo = new THREE.PlaneGeometry(NOTE, NOTE, 12, 12);
  noteGeo.rotateX(-Math.PI / 2);
  { const p = noteGeo.attributes.position;
    for (let i = 0; i < p.count; i++) { const z = p.getZ(i), x = p.getX(i); p.setY(i, 0.9 * Math.pow(ss(1, NOTE / 2, z), 2.2) + 0.12 * Math.pow(ss(2, NOTE / 2, x), 2)); }
    noteGeo.computeVertexNormals(); }
  const noteMat = lit(new THREE.MeshStandardMaterial({ map: noteTex, roughness: 0.82, transparent: true, side: THREE.DoubleSide }));
  const note = new THREE.Mesh(noteGeo, noteMat); note.renderOrder = 5; root.add(note);
  const noteRest = L.note.at.clone(); noteRest.y = 0.2;

  /* ---- the table, with every static contact shadow painted in ---- */
  const tableC = makeCanvas(2048, Math.round(2048 * TD / TW));
  const toT = (p, k) => [(p.x + TW / 2) * k, (p.z + TD / 2) * k];
  drawTable(tableC, [
    (g, k) => { // card
      const [x, y] = toT(card.position, k);
      const path = (gg) => { gg.save(); gg.translate(x, y); gg.rotate(-L.cardRot); gg.beginPath(); gg.rect(-CARD_W / 2 * k, -CARD_H / 2 * k, CARD_W * k, CARD_H * k); gg.restore(); };
      shadowOnly(g, 4 * k, 0.55, 0.3 * k, 1.2 * k, path); shadowOnly(g, 0.5 * k, 0.6, 0, 0.15 * k, path);
    },
    (g, k) => { // jersey
      const [x, y] = toT(jersey.position, k);
      const path = (gg) => { gg.save(); gg.translate(x, y); gg.rotate(-L.jerseyRot); rrect(gg, (-JW / 2 + 1) * k, (-JH / 2 + 1) * k, (JW - 2) * k, (JH - 2) * k, 3.2 * k); gg.restore(); };
      shadowOnly(g, 9 * k, 0.65, 0.8 * k, 3 * k, path); shadowOnly(g, 1.2 * k, 0.7, 0, 0.3 * k, path);
    },
    (g, k) => { // football
      const [x, y] = toT(ballG.position, k);
      const path = (gg, s) => { gg.save(); gg.translate(x, y); gg.rotate(-L.ballRot); gg.beginPath(); gg.ellipse(0, 0, BALL_L * s * k, BALL_R * 0.62 * s * k, 0, 0, TAU); gg.restore(); };
      shadowOnly(g, 10 * k, 0.7, 1.2 * k, 4 * k, (gg) => path(gg, 1)); shadowOnly(g, 2 * k, 0.85, 0, 0.5 * k, (gg) => path(gg, 0.62));
    },
    (g, k) => { // cap
      const [x, y] = toT(cap.position, k);
      const path = (gg) => { gg.save(); gg.translate(x, y); gg.rotate(-L.capRot); rrect(gg, -2.4 * k, -0.85 * k, 4.8 * k, 1.7 * k, 0.8 * k); gg.restore(); };
      shadowOnly(g, 1.4 * k, 0.7, 0, 0.4 * k, path);
    },
  ]);
  const tableTex = canvasTex(tableC);
  const tableMat = lit(new THREE.MeshStandardMaterial({ map: tableTex, roughness: 0.6, metalness: 0 }));
  const table = new THREE.Mesh(new THREE.PlaneGeometry(TW, TD).rotateX(-Math.PI / 2), tableMat);
  table.renderOrder = 0; root.add(table);

  /* ---- lights ---- */
  const hemi = new THREE.HemisphereLight(0x8fa2d8, 0x0a0e1a, 0.2); scene.add(hemi);
  const house = new THREE.DirectionalLight(0xf3f5ff, 0); house.position.set(30, 120, 60); scene.add(house); scene.add(house.target);
  const win = new THREE.SpotLight(0xb9c8f2, 0, 0, 0.5, 1, 0); // a cool window light on the jersey side
  win.position.set(L.jersey.x + 60, 110, L.jersey.z - 70); win.target.position.copy(L.jersey).add(v3(0, 0, -12));
  scene.add(win); scene.add(win.target);
  const spot = new THREE.SpotLight(0xffd8ae, 0, 0, 0.36, 0.85, 0);
  const spotAim = L.circle.clone().add(v3(tall ? 4 : 9, 0, tall ? 4 : 5));
  const spotBase = spotAim.clone().add(v3(-8, 120, -26));
  spot.position.copy(spotBase); spot.target.position.copy(spotAim);
  scene.add(spot); scene.add(spot.target);

  /* ---- dust in the beam ---- */
  const DUST = 160, dPos = new Float32Array(DUST * 3), dSeed = new Float32Array(DUST);
  { const R = rng(31); for (let i = 0; i < DUST; i++) { const h = R(); const r = Math.sqrt(R()) * (6 + h * 30); const a = R() * TAU;
      dPos.set([Math.cos(a) * r, 4 + h * 95, Math.sin(a) * r], i * 3); dSeed[i] = R(); } }
  const dGeo = new THREE.BufferGeometry();
  dGeo.setAttribute("position", new THREE.BufferAttribute(dPos, 3));
  dGeo.setAttribute("aSeed", new THREE.BufferAttribute(dSeed, 1));
  const dUni = { uTime: { value: 0 }, uOn: { value: 0 }, uDpr: ctx.uniforms.uDpr };
  const dust = new THREE.Points(dGeo, new THREE.ShaderMaterial({
    uniforms: dUni, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `uniform float uTime; uniform float uDpr; attribute float aSeed; varying float vA;
      void main() {
        vec3 p = position;
        float s = aSeed * 6.2831;
        p.x += sin(uTime * 0.13 + s) * 3.0; p.z += cos(uTime * 0.11 + s * 1.7) * 3.0;
        p.y = mod(p.y + uTime * (0.6 + aSeed), 100.0) + 3.0;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = (1.2 + aSeed * 2.2) * uDpr * (180.0 / -mv.z);
        vA = (0.35 + 0.65 * sin(uTime * (0.4 + aSeed) + s) * 0.5 + 0.5) * smoothstep(3.0, 14.0, p.y) * smoothstep(100.0, 60.0, p.y);
      }`,
    fragmentShader: `uniform float uOn; varying float vA;
      void main() { float d = length(gl_PointCoord - 0.5); if (d > 0.5) discard;
        gl_FragColor = vec4(1.0, 0.86, 0.7, smoothstep(0.5, 0.0, d) * vA * uOn * 0.5); }`,
  }));
  dust.position.copy(spotAim); dust.renderOrder = 6; dust.frustumCulled = false; root.add(dust);

  /* ---- fonts: redraw the printed textures once the faces are in ---- */
  if (document.fonts && document.fonts.load) {
    Promise.all([`800 40px ${F_DISP}`, `700 40px ${F_DISP}`, `600 40px ${F_DISP}`, `700 20px ${F_TEXT}`, `600 20px ${F_TEXT}`, `500 20px ${F_TEXT}`, `600 20px ${F_NUM}`, `500 20px ${F_NUM}`]
      .map((f) => document.fonts.load(f).catch(() => null))).then(() => {
      drawCard(cardCanvas); cardTex.needsUpdate = true;
      drawJersey(jCanvas, "84", "RIVERTON"); jMat.map.needsUpdate = true;
      drawNote(noteC, noteBig, noteSub); noteTex.needsUpdate = true;
    });
  }

  /* ---- renderer hookup: environment, tone mapping, async compile ---- */
  let R = null, ready = false, t0 = null, setupDone = false;
  scene.onBeforeRender = (renderer) => { R = renderer; };
  function setup() {
    R.toneMapping = THREE.ACESFilmicToneMapping; R.toneMappingExposure = 1.05;
    try {
      const pm = new THREE.PMREMGenerator(R);
      const envScene = roomEnv(THREE);
      scene.environment = pm.fromScene(envScene, 0.04).texture;
      envScene.traverse((o) => { if (o.material) o.material.dispose(); if (o.geometry) o.geometry.dispose(); });
      pm.dispose();
    } catch (e) { /* no env: lights alone still work */ }
    setupDone = true;
    const go = () => { root.visible = true; ready = true; };
    if (R.compileAsync && !freeze) {
      root.visible = true;                       // compile() only walks visible objects
      const p = R.compileAsync(scene, ctx.camera);
      root.visible = false;
      p.then(go, go);
    } else go();
  }

  /* ---- motion ---- */
  const up = v3(0, 1, 0), qA = new THREE.Quaternion(), qB = new THREE.Quaternion(), tmp = v3(0, 0, 0);
  const drawAxis = v3(0.85, 1, 0.22).normalize();
  const restDir = v3(Math.cos(L.markerRot), 0, -Math.sin(L.markerRot));
  const qDraw = new THREE.Quaternion().setFromUnitVectors(up, drawAxis);
  const qRest = new THREE.Quaternion().setFromUnitVectors(up, restDir);
  const restTip = L.markerRest.clone().addScaledVector(restDir, -ML / 2); restTip.y = MR;
  const pathAt = (f) => { // card point on the ink path at arc-length param f
    const par = path.par; let lo = 0, hi = par.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (par[m] < f) lo = m; else hi = m; }
    const k = (f - par[lo]) / Math.max(1e-6, par[hi] - par[lo]);
    const a = path.pts[lo], b = path.pts[hi];
    return cardPt(mix(a[0], b[0], k), mix(a[1], b[1], k), 0.2);
  };
  const startTip = pathAt(0), offTip = startTip.clone().add(v3(34, 30, 46));
  const T = { on: 0.25, touch: 1.15, drawn: 2.75, lift: 3.15, rest: 3.85, note0: 4.15, note1: 5.0 };

  function place(tau) {
    // spotlight: clunk, flicker, settle
    const on = tau < T.on ? 0 : tau < 0.36 ? 0.75 : tau < 0.47 ? 0.1 : mix(0.1, 1, ss(0.47, 0.8, tau));
    // marker
    let tip, q = qA;
    if (tau < T.touch) {
      const k = outCubic(ss(0.35, T.touch, tau));
      tip = tmp.copy(offTip).lerp(startTip, k); tip.y += (1 - k) * 2;
      q.copy(qDraw);
    } else if (tau < T.drawn) {
      const f = ss(T.touch, T.drawn, tau) * 0.15 + cl((tau - T.touch) / (T.drawn - T.touch)) * 0.85;
      uInk.uProg.value = f;
      tip = tmp.copy(pathAt(f));
      q.copy(qDraw);
      q.multiply(qB.setFromAxisAngle(v3(1, 0, 0), Math.sin(tau * 9) * 0.04));
    } else if (tau < T.lift) {
      uInk.uProg.value = 1;
      const k = outCubic(ss(T.drawn, T.lift, tau));
      tip = tmp.copy(pathAt(1)); tip.y += k * 4; tip.x += k * 3; q.copy(qDraw);
    } else {
      uInk.uProg.value = 1;
      const k = inOut(ss(T.lift, T.rest, tau));
      const from = pathAt(1).add(v3(3, 4, 0));
      tip = tmp.copy(from).lerp(restTip, k);
      tip.y += Math.sin(k * Math.PI) * 5 * (1 - k * 0.3);
      q.copy(qDraw).slerp(qRest, k);
    }
    if (tau < T.touch) uInk.uProg.value = 0;
    marker.position.copy(tip); marker.quaternion.copy(q);
    // the marker's shadow: a soft streak under the body, along its projection on the table
    const axis = v3(0, 1, 0).applyQuaternion(q);
    const mid = tip.clone().addScaledVector(axis, ML * 0.5);
    const hgt = Math.max(0, mid.y);
    const lying = ss(T.lift + 0.4, T.rest, tau);
    const plen = Math.hypot(axis.x, axis.z) * ML;
    // the light is high and a little behind, so the streak starts at the tip and runs with the body, nudged toward the viewer
    const ax = axis.x / Math.max(1e-3, Math.hypot(axis.x, axis.z)), az = axis.z / Math.max(1e-3, Math.hypot(axis.x, axis.z));
    const sx = mix(tip.x + ax * plen * 0.5, mid.x, lying), sz = mix(tip.z + az * plen * 0.5 + Math.min(4, hgt * 0.25), mid.z, lying);
    mShadow.position.set(sx, 0.3, sz);
    mShadow.rotation.y = -Math.atan2(az, ax);
    mShadow.scale.set(mix(plen * 0.95 + 1.5, ML * 1.12, lying), 1, mix(1.5, 2.5, lying));
    mShadow.material.opacity = mix(0.2, 0.6, lying) * ss(0.3, 1.0, tau);
    // the note: dropped from above, lands and settles beside the circle
    const nk = ss(T.note0, T.note1, tau);
    const fall = 1 - outCubic(nk);
    note.position.copy(noteRest).add(v3(fall * 7, fall * 36, -fall * 9));
    note.rotation.set(fall * 0.5, L.note.rot + fall * 0.9, fall * -0.3);
    note.visible = tau > T.note0;
    const settle = nk >= 1 ? 0 : Math.sin(nk * Math.PI * 3) * (1 - nk) * 0.25;
    note.position.y += Math.max(0, settle);
    nShadow.position.set(noteRest.x + 0.4 + fall * 2, 0.22, noteRest.z + 0.9 + fall * 3);
    nShadow.scale.set(NOTE * (1.45 + fall * 1.2), 1, NOTE * (1.45 + fall * 1.2));
    nShadow.rotation.y = note.rotation.y;
    nShadow.material.opacity = note.visible ? mix(0.5, 0.05, fall) : 0;
    return on;
  }

  // camera: frame L.view at the target, a slow establishing push-out, breathing, scroll lift
  const camT = v3(0, 0, 0);
  function frame(camera, tau, t, sc, mx, my) {
    const aspect = camera.aspect || 1.6;
    const vfov = tall ? 34 : 28;
    camera.fov = vfov;
    const tv = Math.tan((vfov * Math.PI) / 360);
    const dW = L.view.w / 2 / (tv * aspect), dH = L.view.h / 2 / tv;
    let dist = Math.min(dW, dH) * (tall ? 1 : 1);
    if (!tall && aspect < 1.5) dist = Math.max(dW * 0.9, Math.min(dW, dH));
    const intro = 1 - inOut(ss(0, 4.5, tau));
    dist *= 1 + 0.07 * intro + 0.1 * sc;
    const el = L.el + 0.05 * intro + 0.16 * sc + Math.sin(t * 0.05) * 0.01 - my * 0.03;
    const az = L.az + Math.sin(t * 0.07) * 0.03 + mx * 0.05 - 0.03 * intro;
    camT.copy(L.target); camT.z += -4 * sc;
    camera.position.set(camT.x + Math.sin(az) * Math.cos(el) * dist, camT.y + Math.sin(el) * dist, camT.z + Math.cos(az) * Math.cos(el) * dist);
    camera.near = 5; camera.far = dist * 3;
    camera.lookAt(camT);
    camera.updateProjectionMatrix();
  }

  let lastTau = 0, lastScroll = 0, tNow = 0;
  function update(t) {
    tNow = freeze ? freeze.t : t;
    if (R && !setupDone) setup();
    if (!ready) { lastTau = 0; return; }
    if (t0 === null) t0 = t;
    const tau = freeze ? freeze.t : t - t0;
    lastTau = tau;
    const on = place(tau);
    const sc = freeze ? freeze.scroll || 0 : lastScroll;
    const lu = ss(0.04, 0.42, sc);              // the house lights
    const sway = Math.sin(tNow * 0.55) * 1.6, sway2 = Math.cos(tNow * 0.41) * 1.1;
    spot.position.set(spotBase.x + sway * 2, spotBase.y, spotBase.z + sway2 * 2);
    spot.target.position.set(spotAim.x + sway, 0, spotAim.z + sway2);
    spot.intensity = on * mix(6.2, 2.6, lu);
    spot.angle = mix(0.27, 0.62, lu); spot.penumbra = mix(0.7, 1, lu);
    spot.color.setHex(0xffd8ae).lerp(new THREE.Color(0xf4f2ee), lu);
    hemi.intensity = mix(0.16, 1.15, lu) * mix(0.4, 1, ss(0, 0.9, tau));
    house.intensity = mix(0, 2.1, lu);
    win.intensity = mix(1.6, 0.8, lu) * ss(0.2, 1.2, tau);
    const env = mix(0.22, 0.85, lu) * mix(0.3, 1, on);
    for (const m of mats) m.envMapIntensity = env;
    dUni.uTime.value = tNow; dUni.uOn.value = on * (1 - lu);
  }

  return {
    update,
    camera: {
      pos: v3(0, 90, 70), look: v3(0, 0, 0), fov: [28, 34], far: 600,
      move(camera, s) {
        lastScroll = s.scroll;
        frame(camera, ready ? lastTau : 0, freeze ? freeze.t : s.t, freeze ? freeze.scroll || 0 : s.scroll, freeze ? 0 : s.mx, freeze ? 0 : s.my);
      },
    },
  };
}
