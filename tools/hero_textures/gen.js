/* EBK · home-hero ball textures, generated procedurally (bake-time only).
   This used to run in the browser on every home-page visit and froze the main
   thread for several seconds. tools/bake_hero_textures.py now runs it once in
   headless Chrome and writes the results to public/img/hero/*.webp, which
   public/js/hero3d.js loads as plain images.

   - basketball: pebbled orange leather, 8-panel channel layout cut as grooves
   - soccer:     a true truncated icosahedron (12 pentagons, 20 hexagons) with
                 stitched seams and slightly puffed panels
   - baseball:   white cowhide (the seam + stitches are geometry, at runtime)
   - football:   pointed prolate leather body (lathe UVs), panel seams
   Sphere textures are equirectangular and computed per texel from the sphere
   direction, so nothing pinches at the poles or tears at the seam.

   The stamp positions here must match the `logo` directions in hero3d.js. */

export function bake(accent = "#3ddc97", TW = 1024) {
  const TH = TW / 2;

  // ---------- helpers ----------
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const smooth = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };
  // cheap deterministic hash → [0,1)
  const hash = (x, y, z) => { const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453; return s - Math.floor(s); };
  // 3D value noise (trilinear) for leather pebbling
  function vnoise(x, y, z) {
    const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
    const xf = x - xi, yf = y - yi, zf = z - zi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
    const l = (a, b, t) => a + (b - a) * t;
    const c = (i, j, k) => hash(xi + i, yi + j, zi + k);
    return l(l(l(c(0,0,0), c(1,0,0), u), l(c(0,1,0), c(1,1,0), u), v),
             l(l(c(0,0,1), c(1,0,1), u), l(c(0,1,1), c(1,1,1), u), v), w);
  }
  // "pebble" field: bumps like basketball / football leather (0..1, peaks = pebbles)
  function pebble(x, y, z, f) {
    const n = vnoise(x * f, y * f, z * f);
    return smooth(0.35, 0.85, n);
  }
  const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

  /* The EBK stamp — the same mark on every ball, each in its own "flavor":
     ring + E · B · K, with the B carrying that ball's colour.
     (A copy lives in hero3d.js for the puck face, which is drawn at runtime.) */
  function ebkStamp(f, S = 512) {
    const cv = document.createElement("canvas"); cv.width = cv.height = S;
    const d = cv.getContext("2d"), m = S / 512;
    if (f.disc) { d.fillStyle = f.disc; d.beginPath(); d.arc(S / 2, S / 2, 214 * m, 0, Math.PI * 2); d.fill(); }
    d.lineWidth = 10 * m; d.strokeStyle = f.ring; d.beginPath(); d.arc(S / 2, S / 2, 196 * m, 0, Math.PI * 2); d.stroke();
    d.font = `900 ${150 * m}px 'Arial Black', Impact, sans-serif`; d.textAlign = "center"; d.textBaseline = "middle";
    d.fillStyle = f.ek; d.fillText("E", 160 * m, 262 * m); d.fillText("K", 352 * m, 262 * m);
    if (f.bLine) { d.lineWidth = 14 * m; d.lineJoin = "round"; d.strokeStyle = f.bLine; d.strokeText("B", 256 * m, 262 * m); }
    d.fillStyle = f.b; d.fillText("B", 256 * m, 262 * m);
    return cv;
  }
  /* Project a stamp onto the sphere around direction c (angular radius R).
     Returns a sampler (x,y,z) → [r,g,b,a 0..1] or null outside. */
  function sphereDecal(cv, c, R, roll = 0) {
    const S = cv.width, px = cv.getContext("2d").getImageData(0, 0, S, S).data;
    const n = Math.hypot(...c), C = c.map(v => v / n);
    let up = Math.abs(C[1]) > 0.95 ? [1, 0, 0] : [0, 1, 0];
    // t1 = up × C (right), t2 = C × t1 (up) — then roll in-plane
    let t1 = [up[1] * C[2] - up[2] * C[1], up[2] * C[0] - up[0] * C[2], up[0] * C[1] - up[1] * C[0]];
    const l1 = Math.hypot(...t1); t1 = t1.map(v => v / l1);
    let t2 = [C[1] * t1[2] - C[2] * t1[1], C[2] * t1[0] - C[0] * t1[2], C[0] * t1[1] - C[1] * t1[0]];
    const cr = Math.cos(roll), sr = Math.sin(roll);
    [t1, t2] = [t1.map((v, i) => v * cr + t2[i] * sr), t2.map((v, i) => v * cr - t1[i] * sr)];
    const cosR = Math.cos(R), tR = Math.tan(R);
    return (x, y, z) => {
      const dc = x * C[0] + y * C[1] + z * C[2];
      if (dc < cosR) return null;
      const u = (x * t1[0] + y * t1[1] + z * t1[2]) / dc / tR, v = (x * t2[0] + y * t2[1] + z * t2[2]) / dc / tR;
      const ix = Math.round((u * 0.5 + 0.5) * (S - 1)), iy = Math.round((0.5 - v * 0.5) * (S - 1));
      if (ix < 0 || iy < 0 || ix >= S || iy >= S) return null;
      const i = (iy * S + ix) * 4;
      return px[i + 3] ? [px[i], px[i + 1], px[i + 2], px[i + 3] / 255] : null;
    };
  }

  /* Build an equirect color map + bump map from a per-direction shader.
     fn(dx,dy,dz) → [r,g,b,height]  (rgb 0..255, height 0..1)
     decal (optional): sampler from sphereDecal, printed over the surface. */
  function sphereMaps(fn, decal = null, w = TW, h = TH) {
    const cc = document.createElement("canvas"); cc.width = w; cc.height = h;
    const bc = document.createElement("canvas"); bc.width = w; bc.height = h;
    const cx = cc.getContext("2d"), bx = bc.getContext("2d");
    const ci = cx.createImageData(w, h), bi = bx.createImageData(w, h);
    const C = ci.data, B = bi.data;
    for (let py = 0; py < h; py++) {
      const th = (py + 0.5) / h * Math.PI, st = Math.sin(th), ct = Math.cos(th);
      for (let px = 0; px < w; px++) {
        const ph = (px + 0.5) / w * Math.PI * 2;
        const dx = -Math.cos(ph) * st, dz = Math.sin(ph) * st;
        const o = fn(dx, ct, dz);
        if (decal) {
          const s = decal(dx, ct, dz);
          if (s) { const a = s[3]; o[0] += (s[0] - o[0]) * a; o[1] += (s[1] - o[1]) * a; o[2] += (s[2] - o[2]) * a; o[3] -= 0.04 * a; }
        }
        const i = (py * w + px) * 4;
        C[i] = o[0]; C[i + 1] = o[1]; C[i + 2] = o[2]; C[i + 3] = 255;
        const b = clamp(o[3], 0, 1) * 255; B[i] = B[i + 1] = B[i + 2] = b; B[i + 3] = 255;
      }
    }
    cx.putImageData(ci, 0, 0); bx.putImageData(bi, 0, 0);
    return { map: cc, bump: bc };
  }
  // one mark, five flavors — the B always carries the ball's own colour
  const FLAVOR = {
    basketball: { disc: "#15100d", ring: "rgba(255,138,42,0.75)", ek: "#f3ece2", b: "#ff8a2a" },   // solid black badge, orange B
    soccer:     { ring: "rgba(23,33,74,0.5)",       ek: "#17214a",               b: "#2f6bff" },
    baseball:   { ring: "rgba(29,42,74,0.45)",      ek: "#1d2a4a",               b: "#c7262b" },
    football:   { ring: "rgba(244,239,228,0.7)",    ek: "#f4efe4",               b: accent, bLine: "rgba(20,10,4,0.7)" },   // white lace-ink, EBK-green B
  };

  // ---------- BASKETBALL ----------
  // Real 8-panel layout: an equator (y=0) and one meridian (x=0) as straight
  // channels, plus one curved channel looping around EACH pole. The loop dips to
  // ~13° latitude where it crosses the meridian and rises to ~46° halfway
  // between, so it never touches the equator.
  // stamp sits centred in a side panel: straight equator seam below it,
  // the curved seam arching over it (where brands print theirs)
  const BB_STAMP = [Math.cos(0.4) * Math.sin(1.26), Math.sin(0.4), Math.cos(0.4) * Math.cos(1.26)];
  function basketball() {
    const base = [201, 92, 34], deep = [166, 70, 24], line = [22, 13, 9];
    const HW = 0.028;                                  // channel half-width, radians
    const LO = 13 * Math.PI / 180, HI = 46 * Math.PI / 180;
    const MID = (LO + HI) / 2, AMP = (HI - LO) / 2;
    return sphereMaps((x, y, z) => {
      const lat = Math.asin(Math.max(-1, Math.min(1, y)));
      const lon = Math.atan2(x, z);                    // 0 on the meridian plane x=0
      const dEq = Math.abs(lat);                       // equator
      const dMer = Math.asin(Math.min(1, Math.abs(x))); // meridian
      // curved loop: latitude follows MID - AMP·cos(2·lon) in each hemisphere;
      // divide by the local slope so the channel keeps one width
      const f = MID - AMP * Math.cos(2 * lon);
      const slope = (2 * AMP * Math.sin(2 * lon)) * Math.cos(Math.abs(lat));
      const dLoop = Math.abs(Math.abs(lat) - f) / Math.sqrt(1 + slope * slope);
      const d = Math.min(dEq, dMer, dLoop);
      const groove = 1 - smooth(HW * 0.7, HW * 1.15, d);       // 1 inside channel
      const lip = smooth(HW * 1.1, HW * 3.2, d);               // panels round over into the channel
      const peb = pebble(x, y, z, 150);
      const tone = vnoise(x * 3.5, y * 3.5, z * 3.5);
      let col = mix(deep, base, 0.45 + 0.55 * tone);
      col = mix(col, [214, 106, 46], peb * 0.08);
      col = mix(col, [120, 48, 16], (1 - lip) * 0.35);
      col = mix(col, line, groove);
      const hgt = 0.55 + 0.3 * lip + peb * 0.06 - groove * 0.5;
      return [col[0], col[1], col[2], hgt];
    }, sphereDecal(ebkStamp(FLAVOR.basketball), BB_STAMP, 0.25));
  }

  // ---------- SOCCER (truncated icosahedron) ----------
  function soccer() {
    const p = (1 + Math.sqrt(5)) / 2;
    const ico = [[-1,p,0],[1,p,0],[-1,-p,0],[1,-p,0],[0,-1,p],[0,1,p],[0,-1,-p],[0,1,-p],[p,0,-1],[p,0,1],[-p,0,-1],[-p,0,1]]
      .map(v => { const l = Math.hypot(...v); return v.map(c => c / l); });
    const faces = [[0,11,5],[0,5,1],[0,1,7],[0,7,10],[0,10,11],[1,5,9],[5,11,4],[11,10,2],[10,7,6],[7,1,8],
                   [3,9,4],[3,4,2],[3,2,6],[3,6,8],[3,8,9],[4,9,5],[2,4,11],[6,2,10],[8,6,7],[9,8,1]];
    const hexC = faces.map(f => { const s = [0,1,2].map(k => ico[f[0]][k] + ico[f[1]][k] + ico[f[2]][k]); const l = Math.hypot(...s); return s.map(c => c / l); });
    // pentagon centres weighted so cells meet on the true truncation boundary
    const centers = ico.map(v => ({ v, pent: true })).concat(hexC.map(v => ({ v, pent: false })));
    const PW = 1.0, HW = 1.02653;                     // weights → pentagon/hexagon edge balance
    const white = [242, 242, 238], black = [20, 22, 30], seamC = [150, 152, 158];
    return sphereMaps((x, y, z) => {
      let b1 = -9, b2 = -9, pent = false;
      for (const c of centers) {
        const d = (c.v[0] * x + c.v[1] * y + c.v[2] * z) * (c.pent ? PW : HW);
        if (d > b1) { b2 = b1; b1 = d; pent = c.pent; } else if (d > b2) b2 = d;
      }
      const gap = b1 - b2;                             // ~0 on seams
      const seam = 1 - smooth(0.004, 0.012, gap);
      const puff = smooth(0.0, 0.09, gap);             // panels bulge toward their centres
      let col = pent ? black : white;
      col = mix(col, pent ? [34, 36, 46] : [226, 228, 230], 1 - puff);   // soft shading near edges
      col = mix(col, pent ? [10, 10, 14] : seamC, seam * 0.85);
      return [col[0], col[1], col[2], 0.35 + puff * 0.55 - seam * 0.35];
    }, sphereDecal(ebkStamp(FLAVOR.soccer), hexC[1], 0.27));
  }

  // ---------- BASEBALL (leather only) ----------
  function baseball() {
    const BB_LOGO = [0.666, 0.327, 0.671];             // centre of a leather lobe, farthest from the seam
    return sphereMaps((x, y, z) => {
      const n = vnoise(x * 9, y * 9, z * 9), fine = vnoise(x * 70, y * 70, z * 70);
      const col = mix([232, 226, 210], [248, 245, 236], 0.55 + 0.45 * n);
      return [col[0], col[1], col[2], 0.5 + fine * 0.12];
    }, sphereDecal(ebkStamp(FLAVOR.baseball), BB_LOGO, 0.36));
  }

  // ---------- FOOTBALL (lathe UV: u around 0..1, v along the axis 0..1) ----------
  function football() {
    const W = TW, H = TH, cv = document.createElement("canvas"); cv.width = W; cv.height = H;
    const bc = document.createElement("canvas"); bc.width = W; bc.height = H;
    const cx = cv.getContext("2d"), bx = bc.getContext("2d");
    const ci = cx.createImageData(W, H), bi = bx.createImageData(W, H);
    for (let py = 0; py < H; py++) {
      const v = py / H;
      for (let px = 0; px < W; px++) {
        const u = px / W, ang = u * Math.PI * 2;
        const x = Math.sin(ang), z = Math.cos(ang), yy = (v - 0.5) * 3;
        const peb = pebble(x * 1.0, yy, z * 1.0, 60);
        const tone = 0.5 + 0.5 * vnoise(x * 4, yy * 2, z * 4);
        let col = mix([92, 44, 20], [128, 64, 30], tone);
        col = mix(col, [146, 76, 38], peb * 0.25);
        // four panel seams at u = 1/8, 3/8, 5/8, 7/8 (laces sit on the panel at u=0)
        const du = Math.min(...[0.125, 0.375, 0.625, 0.875].map(s => Math.abs(u - s))) * W;
        const seam = 1 - smooth(1.2, 3.2, du * (0.6 + 0.8 * Math.abs(v - 0.5)));
        col = mix(col, [42, 18, 8], seam * 0.9);
        const i = (py * W + px) * 4;
        ci.data[i] = col[0]; ci.data[i + 1] = col[1]; ci.data[i + 2] = col[2]; ci.data[i + 3] = 255;
        const hgt = (0.6 + peb * 0.25 - seam * 0.55) * 255;
        bi.data[i] = bi.data[i + 1] = bi.data[i + 2] = hgt; bi.data[i + 3] = 255;
      }
    }
    cx.putImageData(ci, 0, 0); bx.putImageData(bi, 0, 0);
    // stamp on the side panel (u = 0.25), centred along the ball's length
    { const st = ebkStamp(FLAVOR.football, 256), sz = 170 * W / 1024;
      cx.save(); cx.translate(W * 0.25, H * 0.5); cx.rotate(Math.PI / 2);
      cx.drawImage(st, -sz / 2, -sz / 2, sz, sz); cx.restore(); }
    return { map: cv, bump: bc };
  }

  return { basketball: basketball(), soccer: soccer(), baseball: baseball(), football: football() };
}
