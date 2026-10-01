/* EBK · 3D hero — five game balls, built to look like the real thing.
   ES module; loads Three.js from CDN. If WebGL or the module is unavailable,
   nothing happens and the CSS hero stays as the fallback. Honors reduced-motion
   (renders a single static frame) and pauses when the tab is hidden.

   Every surface is generated here — no image files:
   - basketball: pebbled orange leather, 8-panel channel layout cut as grooves
   - soccer:     a true truncated icosahedron (12 pentagons, 20 hexagons) with
                 stitched seams and slightly puffed panels
   - baseball:   white cowhide with the real figure-eight seam and raised
                 red stitches (geometry, not paint)
   - football:   pointed prolate leather body, panel seams, raised laces
   - puck:       vulcanised rubber with a knurled edge and a debossed EBK
   Textures are equirectangular and computed per texel from the sphere
   direction, so nothing pinches at the poles or tears at the seam. */

const MOUNT = document.getElementById("hero3d");
const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const CDN = "https://cdn.jsdelivr.net/npm/three@0.160.0/";

function webglOK() {
  try { const c = document.createElement("canvas"); return !!(window.WebGLRenderingContext && (c.getContext("webgl") || c.getContext("experimental-webgl"))); }
  catch (e) { return false; }
}

if (MOUNT && webglOK()) {
  Promise.all([
    import(CDN + "build/three.module.js"),
    import(CDN + "examples/jsm/environments/RoomEnvironment.js").catch(() => null),
  ]).then(([THREE, env]) => start(THREE, env && env.RoomEnvironment))
    .catch(() => { /* CDN blocked — keep the CSS fallback */ });
}

function start(THREE, RoomEnvironment) {
  const accent = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "#3ddc97";
  const small = Math.min(window.innerWidth, window.innerHeight) < 700;
  const TW = small ? 768 : 1024, TH = TW / 2;          // texture size

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

  /* The EBK stamp — the same mark on every ball, each in its own "flavor":
     ring + E · B · K, with the B carrying that ball's colour. */
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
    const map = new THREE.CanvasTexture(cc); map.colorSpace = THREE.SRGBColorSpace;
    const bump = new THREE.CanvasTexture(bc);
    for (const t of [map, bump]) { t.anisotropy = 8; t.wrapS = THREE.RepeatWrapping; }
    return { map, bump };
  }
  // one mark, five flavors — the B always carries the ball's own colour
  const FLAVOR = {
    puck:       { ring: "rgba(255,255,255,0.16)", ek: "rgba(255,255,255,0.22)", b: accent },
    basketball: { disc: "#15100d", ring: "rgba(255,138,42,0.75)", ek: "#f3ece2", b: "#ff8a2a" },   // solid black badge, orange B
    soccer:     { ring: "rgba(23,33,74,0.5)",       ek: "#17214a",               b: "#2f6bff" },
    baseball:   { ring: "rgba(29,42,74,0.45)",      ek: "#1d2a4a",               b: "#c7262b" },
    football:   { ring: "rgba(244,239,228,0.7)",    ek: "#f4efe4",               b: accent, bLine: "rgba(20,10,4,0.7)" },   // white lace-ink, EBK-green B
  };
  const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

  // ---------- BASKETBALL ----------
  // Real 8-panel layout: two perpendicular great-circle channels (planes x=0 and
  // y=0) plus two curved "ear" channels — small circles around the ±x axis that
  // cross the y=0 channel but never touch the x=0 one.
  function basketball() {
    const base = [201, 92, 34], deep = [166, 70, 24], line = [22, 13, 9];
    const HW = 0.03;                                   // channel half-width, radians
    const EAR = 0.98;                                  // ear circle angular radius
    const { map, bump } = sphereMaps((x, y, z) => {
      const dA = Math.asin(Math.min(1, Math.abs(x)));  // to great circle x=0
      const dB = Math.asin(Math.min(1, Math.abs(y)));  // to great circle y=0
      const dE = Math.abs(Math.acos(Math.min(1, Math.abs(x))) - EAR);   // to the ear on this side
      const d = Math.min(dA, dB, dE);
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
    }, sphereDecal(ebkStamp(FLAVOR.basketball), [0.29, 0.6, 0.745], 0.27));
    const mat = new THREE.MeshPhysicalMaterial({
      map, bumpMap: bump, bumpScale: 2.4, roughness: 0.72, metalness: 0,
      sheen: 0.5, sheenRoughness: 0.6, sheenColor: new THREE.Color("#ff9a5c"),
      clearcoat: 0.08, clearcoatRoughness: 0.6,
    });
    const m = new THREE.Mesh(new THREE.SphereGeometry(1, 128, 96), mat);
    m.userData.logo = [0.29, 0.6, 0.745];
    return m;
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
    const { map, bump } = sphereMaps((x, y, z) => {
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
    const mat = new THREE.MeshPhysicalMaterial({
      map, bumpMap: bump, bumpScale: 2.2, roughness: 0.42, metalness: 0,
      clearcoat: 0.35, clearcoatRoughness: 0.35,
    });
    const m = new THREE.Mesh(new THREE.SphereGeometry(1, 96, 64), mat);
    m.userData.logo = hexC[1];
    return m;
  }

  // ---------- BASEBALL ----------
  function baseball() {
    const g = new THREE.Group();
    const BB_LOGO = [0.666, 0.327, 0.671];             // centre of a leather lobe, farthest from the seam
    const { map, bump } = sphereMaps((x, y, z) => {
      const n = vnoise(x * 9, y * 9, z * 9), fine = vnoise(x * 70, y * 70, z * 70);
      const col = mix([232, 226, 210], [248, 245, 236], 0.55 + 0.45 * n);
      return [col[0], col[1], col[2], 0.5 + fine * 0.12];
    }, sphereDecal(ebkStamp(FLAVOR.baseball), BB_LOGO, 0.36));
    g.add(new THREE.Mesh(new THREE.SphereGeometry(1, 96, 64),
      new THREE.MeshPhysicalMaterial({ map, bumpMap: bump, bumpScale: 0.8, roughness: 0.62, sheen: 0.4, sheenColor: new THREE.Color("#fff6e8") })));

    // seam curve (classic tennis/baseball curve), sampled on the unit sphere
    const a = 0.62, b = 0.38, k = 2 * Math.sqrt(a * b);
    const P = (t) => new THREE.Vector3(a * Math.cos(t) + b * Math.cos(3 * t), k * Math.sin(2 * t), a * Math.sin(t) - b * Math.sin(3 * t)).normalize();
    class Seam extends THREE.Curve { getPoint(t, o = new THREE.Vector3()) { return o.copy(P(t * Math.PI * 2)).multiplyScalar(1.002); } }
    // the seam groove: a thin, slightly darker leather ridge
    g.add(new THREE.Mesh(new THREE.TubeGeometry(new Seam(), 600, 0.012, 6, true),
      new THREE.MeshStandardMaterial({ color: "#d9d0bb", roughness: 0.8 })));

    // red stitches: V pairs on both sides of the seam, instanced
    const N = 108, stitch = new THREE.CapsuleGeometry(0.0105, 0.07, 3, 6);
    const smat = new THREE.MeshStandardMaterial({ color: "#c7262b", roughness: 0.55 });
    const inst = new THREE.InstancedMesh(stitch, smat, N * 2);
    const M = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
    let n = 0;
    for (let i = 0; i < N; i++) {
      const t = (i + 0.5) / N * Math.PI * 2, p0 = P(t), p1 = P(t + 0.002);
      const tan = p1.clone().sub(p0).normalize();
      const side = new THREE.Vector3().crossVectors(p0, tan).normalize();
      for (const s of [-1, 1]) {
        // each stitch angles back toward the seam: a chevron
        const dir = side.clone().multiplyScalar(s).addScaledVector(tan, 0.55).normalize();
        const pos = p0.clone().addScaledVector(side, s * 0.045).normalize().multiplyScalar(1.012);
        // lie the capsule along dir, tangent to the sphere
        q.setFromUnitVectors(up, dir);
        M.compose(pos, q, new THREE.Vector3(1, 1, 1));
        inst.setMatrixAt(n++, M);
      }
    }
    g.add(inst);
    g.userData.logo = BB_LOGO;
    return g;
  }

  // ---------- FOOTBALL ----------
  function football() {
    const g = new THREE.Group();
    const L = 1.56, R = 1.0, prof = [];
    const r = (y) => R * Math.pow(Math.max(0, 1 - (y / L) * (y / L)), 0.74);
    for (let i = 0; i <= 64; i++) { const y = -L + (2 * L * i) / 64; prof.push(new THREE.Vector2(Math.max(r(y), 0.001), y)); }
    const geo = new THREE.LatheGeometry(prof, 128);

    // texture in lathe UV: u around (0..1), v along the axis (0..1)
    const W = 1024, H = 512, cv = document.createElement("canvas"); cv.width = W; cv.height = H;
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
    { const st = ebkStamp(FLAVOR.football, 256), sz = 170;
      cx.save(); cx.translate(W * 0.25, H * 0.5); cx.rotate(Math.PI / 2);
      cx.drawImage(st, -sz / 2, -sz / 2, sz, sz); cx.restore(); }
    const map = new THREE.CanvasTexture(cv); map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 8;
    const bump = new THREE.CanvasTexture(bc); bump.anisotropy = 8;
    g.add(new THREE.Mesh(geo, new THREE.MeshPhysicalMaterial({
      map, bumpMap: bump, bumpScale: 1.6, roughness: 0.7, sheen: 0.3, sheenColor: new THREE.Color("#c98a55"),
    })));

    // laces: a spine along the top panel and 8 cross-laces wrapping it
    const lace = new THREE.MeshStandardMaterial({ color: "#f3eee2", roughness: 0.6 });
    const surf = (y, a, lift) => { const rr = r(y) + lift; return new THREE.Vector3(rr * Math.sin(a), y, rr * Math.cos(a)); };
    const spine = new THREE.CatmullRomCurve3([-0.5, -0.25, 0, 0.25, 0.5].map(y => surf(y, 0, 0.02)));
    g.add(new THREE.Mesh(new THREE.TubeGeometry(spine, 40, 0.026, 8, false), lace));
    for (let i = 0; i < 8; i++) {
      const y = -0.42 + i * 0.12;
      const arc = new THREE.CatmullRomCurve3([-0.2, -0.1, 0, 0.1, 0.2].map(a => surf(y, a, 0.03 - Math.abs(a) * 0.08)));
      g.add(new THREE.Mesh(new THREE.TubeGeometry(arc, 16, 0.024, 8, false), lace));
    }
    // lay it on its side, laces toward camera-ish
    g.userData.logo = [1, 0, 0];      // stamp on the side panel
    g.userData.roll = Math.PI / 2 - 0.3;   // long axis near horizontal
    g.scale.setScalar(0.92);
    return g;
  }

  // ---------- PUCK ----------
  function puck() {
    const g = new THREE.Group();
    // lathe profile with a soft rounded edge (r=1, half-height 0.25)
    const pts = [], hh = 0.25, er = 0.05;
    pts.push(new THREE.Vector2(0.001, -hh));
    for (let i = 0; i <= 8; i++) { const a = -Math.PI / 2 + (i / 8) * Math.PI / 2; pts.push(new THREE.Vector2(1 - er + Math.cos(a) * er, -hh + er + Math.sin(a) * er)); }
    for (let i = 0; i <= 8; i++) { const a = (i / 8) * Math.PI / 2; pts.push(new THREE.Vector2(1 - er + Math.cos(a) * er, hh - er + Math.sin(a) * er)); }
    pts.push(new THREE.Vector2(0.001, hh));
    const geo = new THREE.LatheGeometry(pts, 128);
    // knurl: vertical ridges on the side band (u around, v along profile)
    const W = 1024, H = 64, bc = document.createElement("canvas"); bc.width = W; bc.height = H;
    const bx = bc.getContext("2d"); bx.fillStyle = "#808080"; bx.fillRect(0, 0, W, H);
    for (let i = 0; i < 180; i++) {
      const x = (i / 180) * W; bx.fillStyle = "#c8c8c8"; bx.fillRect(x, H * 0.36, W / 360, H * 0.28);
    }
    const bump = new THREE.CanvasTexture(bc); bump.wrapS = THREE.RepeatWrapping;
    g.add(new THREE.Mesh(geo, new THREE.MeshPhysicalMaterial({
      color: "#16171b", roughness: 0.62, bumpMap: bump, bumpScale: 2.5, clearcoat: 0.15, clearcoatRoughness: 0.6,
    })));
    // debossed EBK on the face — a slightly glossier decal sitting just above
    const dc = ebkStamp(FLAVOR.puck);
    const decal = new THREE.CanvasTexture(dc); decal.colorSpace = THREE.SRGBColorSpace;
    const face = new THREE.Mesh(new THREE.CircleGeometry(0.9, 64),
      new THREE.MeshStandardMaterial({ map: decal, transparent: true, roughness: 0.4, depthWrite: false }));
    face.rotation.x = -Math.PI / 2; face.position.y = hh + 0.002; g.add(face);
    g.userData.logo = [0, 1, 0];
    return g;
  }

  // ---------- scene ----------
  const scene = new THREE.Scene();
  // long lens: balls near the frame edge stay round instead of stretching
  const camera = new THREE.PerspectiveCamera(24, 2, 0.1, 100);
  camera.position.set(0, 0, 21.5);
  const renderer = new THREE.WebGLRenderer({ canvas: MOUNT, alpha: true, antialias: true });
  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  if (RoomEnvironment) {
    const pm = new THREE.PMREMGenerator(renderer);
    scene.environment = pm.fromScene(new RoomEnvironment(renderer), 0.04).texture;
    scene.environmentIntensity = 0.55;
  }
  scene.add(new THREE.HemisphereLight(0xdfe6ff, 0x1a1408, 0.35));
  const key = new THREE.DirectionalLight(0xfff1e0, 2.2); key.position.set(-5, 7, 9); scene.add(key);
  const rim = new THREE.DirectionalLight(new THREE.Color(accent), 1.1); rim.position.set(6, -2, -6); scene.add(rim);
  const back = new THREE.DirectionalLight(0x7f95ff, 0.9); back.position.set(-7, 3, -8); scene.add(back);

  const makers = { basketball, soccer, baseball, football, puck };
  // composition: two big balls bracketing the headline, three supporting
  const defs = [
    // m: phone layout — balls frame the headline from above and below instead of the sides
    { k: "basketball", x: -6.2, y: 1.5, z: 0,    s: 1.75, m: [-2.3, 3.4, 0.74],  spin: [0.04, 0.12, 0.01] },
    { k: "soccer",     x: 6.0,  y: 1.7, z: -0.8, s: 1.55, m: [2.35, 3.15, 0.66],   spin: [-0.05, 0.1, 0.02] },
    { k: "football",   x: 4.1,  y: -2.3, z: 1.2, s: 1.3,  m: [2.15, -3.05, 0.6],   spin: [0.0, 0.0, 0.0], sway: true },
    { k: "baseball",   x: -3.9, y: -2.4, z: 1.4, s: 1.0,  m: [-2.25, -2.95, 0.52], spin: [0.06, -0.14, 0.02] },
    { k: "puck",       x: 8.4,  y: -0.9, z: -2.4, s: 0.95, m: [0, 0, 0],  spin: [0.0, 0.12, 0.0] },
  ];
  const group = new THREE.Group(); scene.add(group);
  const balls = defs.map((d, i) => {
    const holder = new THREE.Group(), m = makers[d.k]();
    // start every ball with its EBK stamp turned toward the viewer
    if (m.userData.logo) {
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(...m.userData.logo).normalize(), new THREE.Vector3(0.22, 0.12, 1).normalize());
      if (m.userData.roll) q.premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0.22, 0.12, 1).normalize(), m.userData.roll));
      m.rotation.setFromQuaternion(q);
    }
    holder.add(m);
    holder.position.set(d.x, d.y, d.z); holder.scale.setScalar(d.s);
    holder.userData = { def: d, base: holder.position.clone(), phase: i * 1.9, spin: d.spin, sway: d.sway, inner: m, rx: m.rotation.x, ry: m.rotation.y, rz: m.rotation.z };
    group.add(holder); return holder;
  });

  // ---------- sizing ----------
  function resize() {
    const r = MOUNT.getBoundingClientRect();
    const w = Math.max(1, r.width), h = Math.max(1, r.height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
    // portrait phones get their own arrangement; tablets scale the desktop one
    const phone = w / h < 0.9;
    group.scale.setScalar(phone ? 1 : w < 980 ? 0.72 : 1);
    for (const b of balls) {
      const d = b.userData.def;
      if (phone) { b.userData.base.set(d.m[0], d.m[1], 0); b.scale.setScalar(d.s * d.m[2] || 0.0001); b.visible = d.m[2] > 0; }
      else { b.userData.base.set(d.x, d.y, d.z); b.scale.setScalar(d.s); b.visible = true; }
      b.position.copy(b.userData.base);
    }
  }
  resize();
  window.addEventListener("resize", resize);
  MOUNT.classList.add("on");           // reveal canvas / dim CSS fallback

  // ---------- pointer parallax ----------
  let px = 0, py = 0, tx = 0, ty = 0;
  window.addEventListener("pointermove", (e) => {
    tx = (e.clientX / window.innerWidth - 0.5);
    ty = (e.clientY / window.innerHeight - 0.5);
  }, { passive: true });

  function pose(t) {
    px += (tx - px) * 0.05; py += (ty - py) * 0.05;
    group.rotation.y = px * 0.28;
    group.rotation.x = py * 0.18;
    for (const b of balls) {
      const u = b.userData, m = u.inner;
      m.rotation.x = u.rx + t * u.spin[0];
      m.rotation.y = u.ry + t * u.spin[1];
      m.rotation.z = u.rz + t * u.spin[2];
      if (u.sway) { m.rotation.x = u.rx + Math.sin(t * 0.5) * 0.35; m.rotation.y = u.ry + Math.sin(t * 0.37 + 1) * 0.5; }
      b.position.y = u.base.y + Math.sin(t * 0.55 + u.phase) * 0.28;
    }
  }

  if (reduce) { pose(0); renderer.render(scene, camera); return; }   // static frame only

  let raf = null, t0 = performance.now(), tOff = 0;
  function tick(now) {
    raf = requestAnimationFrame(tick);
    pose(tOff + (now - t0) / 1000);
    renderer.render(scene, camera);
  }
  raf = requestAnimationFrame(tick);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) { if (raf) { cancelAnimationFrame(raf); raf = null; tOff += (performance.now() - t0) / 1000; } }
    else if (!raf) { t0 = performance.now(); raf = requestAnimationFrame(tick); }
  });
  window.__ebkHero = { pose, render: () => renderer.render(scene, camera), balls, camera, scene, renderer, group };
}
