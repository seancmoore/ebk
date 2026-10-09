/* EBK Deep Bag v2 hero scene "trade-desk" (scene API 2, docs/deep-bag-v2.md).
   Study: fresh-start-myth (The Fresh-Start Myth). Loaded with
   data-scene="trade-desk" data-scene-src="/js/deep-bag-v2-scenes/trade-desk.js".

   An NFL trade told as a lit still life, all modelled here (no external assets):
     - centre, on a desk:  a Player Trade Agreement (letterhead, clauses, two
       signature lines). A fountain pen signs the acquiring club's line, then a
       rubber stamp thumps APPROVED onto it.
     - left, on the wall:  a No. 84 jersey on a hanger. Its colours re-stitch from
       the old club's (crimson) to the new club's (white and navy), top to bottom.
     - right, on the wall: the new club's magnetic depth chart. The 84 magnet
       arrives in the WR 1st slot with a clack and a ripple, then quietly slides
       down to 2nd, and an accent marker writes the finding (-3.5) beside it.
   The establishing beat runs once (about 6 s). The demotion plays on its own a
   few seconds later, or earlier as the reader scrolls past the hero (scroll
   drives it; the camera also leans in on the board). After that only ambient
   motion remains: the jersey sways, the camera drifts, light breathes.

   The composition fits itself into the space the hero type leaves free: it
   measures .v2-title and .v2-standfirst and places the jersey and the board in
   the bands beside the standfirst and the desk under it (or all three under the
   type when the bands are too narrow).

   Lighting: a procedural studio environment (dark room, a warm key softbox, a
   cool rim strip; in the spirit of three's RoomEnvironment) through PMREM, plus
   one key light. Shadows are baked soft textures. The core does not hand scenes
   the renderer, so it is picked up in scene.onBeforeRender on the first frame;
   nothing is shown until the environment is ready on the second frame.

   QA / poster hooks: window.__tradeDesk.seek(seconds | null), .scroll(0..1 | null). */
export default function tradeDesk(ctx, opts = {}) {
  const { THREE, scene, camera, accent, hero } = ctx;
  const V3 = THREE.Vector3;
  const ACC = "#" + accent.getHexString();
  const NAVY = "#18214a", INK_BLUE = "#2c3c96";
  const F_DISP = '"Bricolage Grotesque", "Segoe UI", system-ui, sans-serif';
  const F_TEXT = '"Schibsted Grotesk", "Segoe UI", system-ui, sans-serif';
  const F_MONO = '"Martian Mono", Consolas, ui-monospace, monospace';

  /* ------------------------------------------------------------ helpers -- */
  const clamp01 = x => Math.max(0, Math.min(1, x));
  const ease = x => { x = clamp01(x); return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; };
  const easeOut = x => 1 - Math.pow(1 - clamp01(x), 3);
  const easeIn = x => Math.pow(clamp01(x), 2);
  const backOut = x => { x = clamp01(x); const c = 1.5; return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2); };
  const seg = (T, a, b) => clamp01((T - a) / (b - a));
  let seed = 84;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };

  const redraws = [];
  function ctex(w, h, draw, o = {}) {
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    const g = c.getContext("2d");
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = o.data ? THREE.NoColorSpace : THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    const paint = (...a) => { g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, w, h); draw(g, w, h, ...a); tex.needsUpdate = true; };
    paint();
    if (o.text) redraws.push(() => paint());
    tex.userData.paint = paint;
    return tex;
  }
  function rrPath(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y); g.lineTo(x + w - r, y); g.quadraticCurveTo(x + w, y, x + w, y + r);
    g.lineTo(x + w, y + h - r); g.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    g.lineTo(x + r, y + h); g.quadraticCurveTo(x, y + h, x, y + h - r);
    g.lineTo(x, y + r); g.quadraticCurveTo(x, y, x + r, y); g.closePath();
  }
  function rrShape(w, h, r) {
    const s = new THREE.Shape(), x = -w / 2, y = -h / 2;
    s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
    s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
    s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
    return s;
  }
  // rounded box, centred, w x h face (xy), d deep (z)
  function rbox(w, h, d, r, b = Math.min(0.03, d * 0.3)) {
    const g = new THREE.ExtrudeGeometry(rrShape(w - 2 * b, h - 2 * b, Math.max(0.001, r - b)),
      { depth: Math.max(0.001, d - 2 * b), bevelEnabled: true, bevelThickness: b, bevelSize: b, bevelSegments: 3, curveSegments: 6 });
    g.translate(0, 0, -(d - 2 * b) / 2);
    return g;
  }
  // soft shadow alpha maps (white = shadow)
  function blurTex(w, h, shape, blur) {
    return ctex(w, h, g => { g.fillStyle = "#000"; g.fillRect(0, 0, w, h); g.filter = `blur(${blur}px)`; g.fillStyle = "#fff"; shape(g, w, h); g.filter = "none"; }, { data: true });
  }
  function shadowMat(map, opacity) {
    return new THREE.MeshBasicMaterial({ color: 0x000000, alphaMap: map, transparent: true, opacity, depthWrite: false, toneMapped: false });
  }

  // bake several static parts into one geometry (one draw call); uv = [u0, v0, su, sv] remaps texture space
  function merge(parts) {
    const P = [], N = [], U = [], m = new THREE.Matrix4(), nm = new THREE.Matrix3(), v = new V3(), q = new THREE.Quaternion(), one = new V3(1, 1, 1);
    for (const p of parts) {
      const g = p.geo.index ? p.geo.toNonIndexed() : p.geo;
      m.compose(p.pos || new V3(), q.setFromEuler(p.rot || new THREE.Euler()), one);
      nm.getNormalMatrix(m);
      const a = g.attributes.position, n = g.attributes.normal, u = g.attributes.uv;
      for (let i = 0; i < a.count; i++) {
        v.fromBufferAttribute(a, i).applyMatrix4(m); P.push(v.x, v.y, v.z);
        v.fromBufferAttribute(n, i).applyMatrix3(nm).normalize(); N.push(v.x, v.y, v.z);
        let x = u ? u.getX(i) : 0, y = u ? u.getY(i) : 0;
        if (p.uv) { x = p.uv[0] + x * p.uv[2]; y = p.uv[1] + y * p.uv[3]; }
        U.push(x, y);
      }
    }
    const out = new THREE.BufferGeometry();
    out.setAttribute("position", new THREE.Float32BufferAttribute(P, 3));
    out.setAttribute("normal", new THREE.Float32BufferAttribute(N, 3));
    out.setAttribute("uv", new THREE.Float32BufferAttribute(U, 2));
    return out;
  }

  /* --------------------------------------------------------- materials -- */
  const M = {
    paper: new THREE.MeshStandardMaterial({ roughness: 0.82, envMapIntensity: 0.75, transparent: true, emissive: 0xffffff, emissiveIntensity: 0.16 }),
    lacquer: new THREE.MeshStandardMaterial({ color: 0x0c0f1c, roughness: 0.16, envMapIntensity: 1.4 }),
    silver: new THREE.MeshStandardMaterial({ color: 0xd9dee8, metalness: 1, roughness: 0.26, envMapIntensity: 1.25 }),
    alu: new THREE.MeshStandardMaterial({ color: 0xb9c0cf, metalness: 1, roughness: 0.38, envMapIntensity: 1.1 }),
    wood: new THREE.MeshStandardMaterial({ color: 0x8a6446, roughness: 0.42, envMapIntensity: 1.0 }),
    rubber: new THREE.MeshStandardMaterial({ color: 0x1e2346, roughness: 0.9 }),
    magnet: new THREE.MeshStandardMaterial({ color: 0x1c2657, roughness: 0.2, envMapIntensity: 1.2 }),
    magnetAcc: new THREE.MeshStandardMaterial({ color: accent, roughness: 0.22, envMapIntensity: 1.0 }),
  };

  const root = new THREE.Group();
  root.visible = false;
  scene.add(root);

  /* ------------------------------------------------------------- lights -- */
  const key = new THREE.DirectionalLight(0xfff1e2, 1.7);
  key.position.set(-10, 14, 16);
  root.add(key);
  const rim = new THREE.DirectionalLight(0x9fb2ff, 0.7);
  rim.position.set(12, 6, -4);
  root.add(rim);

  /* ======================================================== DESK SET ===== */
  // the desk is a spot-lit pool of dark lacquered surface that melts into the page
  const deskAlpha = ctex(512, 256, (g, w, h) => {
    g.fillStyle = "#000"; g.fillRect(0, 0, w, h);
    g.save(); g.translate(w / 2, h * 0.52); g.scale(1, 0.5);
    const r = g.createRadialGradient(0, 0, 4, 0, 0, w * 0.48);
    r.addColorStop(0, "#fff"); r.addColorStop(0.45, "#d0d0d0"); r.addColorStop(0.8, "#383838"); r.addColorStop(1, "#000");
    g.fillStyle = r; g.fillRect(-w, -h * 2, 2 * w, 4 * h); g.restore();
  }, { data: true });
  const deskMat = new THREE.MeshStandardMaterial({ color: 0x1b2244, alphaMap: deskAlpha, transparent: true, depthWrite: false,
    roughness: 0.3, envMapIntensity: 1.0 });
  const desk = new THREE.Mesh(new THREE.PlaneGeometry(18, 9), deskMat);
  desk.rotation.x = -Math.PI / 2;
  desk.renderOrder = -3;

  const deskSet = new THREE.Group();          // doc + pen + stamp; placed and scaled by layout()
  deskSet.add(desk);
  root.add(deskSet);

  /* --- the trade agreement --- */
  const DW = 3.4, DH = 4.4, DPX = 1024, DPY = 1320;
  const dl = (px, py) => [(px / DPX - 0.5) * DW, (0.5 - py / DPY) * DH];   // canvas px -> sheet local
  // hand-authored cursive (x 0..1, y -0.5..0.5, y down), smoothed; the underline is a second stroke
  function crSmooth(pts, n) {
    const out = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
      for (let k = 0; k < n; k++) {
        const t = k / n, t2 = t * t, t3 = t2 * t;
        out.push([0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
          0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3)]);
      }
    }
    out.push(pts[pts.length - 1]);
    return out;
  }
  function sigPoints(main, under) {
    const a = crSmooth(main, 7), u = crSmooth(under, 10);
    const pts = a.concat(u);
    pts.lift = a.length;
    return pts;
  }
  const SIG_B = sigPoints(   // the acquiring club's GM: a tall H, then a-y-e-s and a long tail
    [[0.02, 0.22], [0.07, -0.46], [0.085, 0.3], [0.05, 0.06], [0.2, -0.06], [0.18, -0.44], [0.165, 0.3], [0.21, 0.06],
     [0.26, -0.04], [0.235, 0.15], [0.285, 0.12], [0.3, 0.0], [0.32, 0.12], [0.36, 0.0], [0.37, 0.46], [0.33, 0.42],
     [0.39, 0.1], [0.44, 0.06], [0.475, -0.03], [0.445, -0.05], [0.43, 0.1], [0.5, 0.12], [0.54, 0.0], [0.585, 0.05],
     [0.555, 0.15], [0.61, 0.12], [0.76, -0.02], [0.96, -0.24]],
    [[0.14, 0.42], [0.5, 0.36], [0.88, 0.3]]);
  const SIG_A = sigPoints(   // the assigning club's GM: humped capital M and a quick scrawl
    [[0.02, 0.3], [0.05, -0.38], [0.1, 0.22], [0.16, -0.36], [0.21, 0.26], [0.26, 0.02], [0.3, 0.12], [0.34, -0.06],
     [0.37, 0.12], [0.43, -0.34], [0.445, 0.14], [0.5, 0.0], [0.56, 0.1], [0.63, 0.0], [0.7, 0.08], [0.88, -0.12]],
    [[0.62, 0.3], [0.32, 0.36], [0.04, 0.4]]);
  function drawSig(g, pts, n, x0, y0, sw, sh, col) {
    g.strokeStyle = col; g.lineCap = "round"; g.lineJoin = "round";
    for (let i = 1; i < n && i < pts.length; i++) {
      if (i === pts.lift) continue;                            // pen lift before the underline
      const a = pts[i - 1], b = pts[i];
      const sp = Math.hypot(b[0] - a[0], b[1] - a[1]) * 60;
      g.lineWidth = Math.max(1.6, 4.4 - sp * 1.8) * (sw / 470);
      g.beginPath(); g.moveTo(x0 + a[0] * sw, y0 + a[1] * sh); g.lineTo(x0 + b[0] * sw, y0 + b[1] * sh); g.stroke();
    }
  }
  function wrapText(g, s, x, y, maxW, lh) {
    const words = s.split(" "); let line = "";
    for (const w of words) {
      const t = line ? line + " " + w : w;
      if (g.measureText(t).width > maxW && line) { g.fillText(line, x, y); y += lh; line = w; } else line = t;
    }
    if (line) g.fillText(line, x, y);
    return y + lh;
  }
  const docState = { sig: false, stamp: false };
  const SIG_PX = [1024 - 92 - 370 - 10, 1132 - 112, 400, 125];
  let sigTex, stampTex;
  const docTex = ctex(DPX, DPY, (g, w, h) => {
    const m = 5;
    const pg = g.createLinearGradient(0, 0, w, h);
    pg.addColorStop(0, "#f7f5ef"); pg.addColorStop(1, "#ebe8e0");
    g.fillStyle = pg; g.fillRect(m, m, w - 2 * m, h - 2 * m);
    const L = 92, R = w - 92;
    g.fillStyle = "#5c6789"; g.font = `500 21px ${F_MONO}`; g.textBaseline = "alphabetic";
    g.fillText("LEAGUE TRANSACTION", L, 112);
    g.textAlign = "right"; g.fillText("No. 0243", R, 112); g.textAlign = "left";
    g.fillStyle = NAVY; g.font = `700 76px ${F_DISP}`;
    g.fillText("Player Trade", L, 214); g.fillText("Agreement", L, 292);
    g.fillStyle = "#18214a"; g.fillRect(L, 330, R - L, 4);
    g.fillRect(L, 340, R - L, 1.5);
    const rows = [["PLAYER", "No. 84, wide receiver"], ["FROM", "The assigning club"], ["TO", "The acquiring club"], ["IN RETURN", "A third-round selection"]];
    rows.forEach((r, i) => {
      const y = 404 + i * 58;
      g.fillStyle = "#7a84a6"; g.font = `600 19px ${F_MONO}`; g.fillText(r[0], L, y);
      g.fillStyle = "#1d2547"; g.font = `500 30px ${F_TEXT}`; g.fillText(r[1], L + 210, y);
      g.fillStyle = "rgba(24,33,74,.16)"; g.fillRect(L + 210, y + 14, R - L - 210, 1.5);
    });
    g.fillStyle = "#4a5375"; g.font = `400 22px ${F_TEXT}`;
    let y = 680;
    const cl = [
      "1.  The assigning club transfers to the acquiring club all of its rights in the player contract of the player named above.",
      "2.  The player reports to the acquiring club, whose coaching staff alone sets his role and his place on its depth chart.",
      "3.  This agreement is subject to a physical examination and becomes binding on league approval.",
    ];
    for (const c of cl) y = wrapText(g, c, L, y, R - L, 33) + 10;
    // signature lines
    const sy = 1132;
    g.fillStyle = "#18214a";
    g.fillRect(L, sy, 370, 2); g.fillRect(R - 370, sy, 370, 2);
    g.fillStyle = "#7a84a6"; g.font = `600 17px ${F_MONO}`;
    g.fillText("FOR THE ASSIGNING CLUB", L, sy + 34);
    g.fillText("FOR THE ACQUIRING CLUB", R - 370, sy + 34);
    drawSig(g, SIG_A, SIG_A.length, L + 6, sy - 58, 340, 90, "#1b2559");
    g.fillStyle = "#9aa2bd"; g.font = `500 16px ${F_MONO}`;
    g.fillText("Page 1 of 1", L, h - 60);
    // once written, the live signature and the stamp are baked in (two fewer draw calls)
    if (docState.sig) { sigTex.userData.paint(SIG_B.length); g.drawImage(sigTex.image, SIG_PX[0], SIG_PX[1], SIG_PX[2], SIG_PX[3]); }
    if (docState.stamp) { g.globalAlpha = 0.9; g.drawImage(stampTex.image, STAMP_PX[0], STAMP_PX[1], STAMP_PX[2], STAMP_PX[3]); g.globalAlpha = 1; }
  }, { text: true });
  docTex.anisotropy = 8;

  function sheetGeo(curl) {
    const g = new THREE.PlaneGeometry(DW, DH, 10, 12);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i);
      const cx = clamp01((-x / DW + 0.5 - 0.62) / 0.38), cy = clamp01((y / DH + 0.5 - 0.7) / 0.3);
      p.setZ(i, curl * Math.pow(cx * cy, 1.6) + 0.012 * Math.sin(x * 2.1 + y * 1.3));
    }
    g.computeVertexNormals();
    return g;
  }
  const docG = new THREE.Group();             // lies flat: local x/y on the desk, +z up
  docG.rotation.x = -Math.PI / 2;
  deskSet.add(docG);
  const under = new THREE.Mesh(sheetGeo(0.05), new THREE.MeshStandardMaterial({ color: 0xe4e1d8, roughness: 0.85, envMapIntensity: 0.6 }));
  under.position.set(0.16, -0.1, 0.006); under.rotation.z = 0.07;
  docG.add(under);
  const sheet = new THREE.Mesh(sheetGeo(0.16), M.paper);
  M.paper.map = docTex; M.paper.emissiveMap = docTex;
  sheet.position.z = 0.016;
  docG.add(sheet);
  const docShadow = new THREE.Mesh(new THREE.PlaneGeometry(DW * 1.3, DH * 1.25),
    shadowMat(blurTex(128, 160, (g, w, h) => g.fillRect(w * 0.13, h * 0.11, w * 0.76, h * 0.8), 7), 0.62));
  docShadow.position.set(0.12, -0.1, 0.002);
  docShadow.renderOrder = -2;
  docG.add(docShadow);

  function overlay(px, py, pw, ph, tex, o = {}) {
    const [x, y] = dl(px + pw / 2, py + ph / 2);
    const mat = new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.8, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4, envMapIntensity: 0.7, ...o });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(pw / DPX * DW, ph / DPY * DH), mat);
    m.position.set(x, y, 0.004);
    m.renderOrder = 2;
    sheet.add(m);
    return m;
  }
  // the acquiring club's signature, written live
  const SIG_W = 512, SIG_H = 160;
  let sigDrawn = -1;
  sigTex = ctex(SIG_W, SIG_H, (g, w, h, n = 0) => drawSig(g, SIG_B, n, 18, 46, 440, 118, "#1b2559"));
  const sigPlane = overlay(SIG_PX[0], SIG_PX[1], SIG_PX[2], SIG_PX[3], sigTex);
  // the stamp's impression
  stampTex = ctex(512, 288, (g, w, h) => {
    g.save(); g.translate(w / 2, h / 2); g.rotate(-0.07); g.translate(-w / 2, -h / 2);
    g.strokeStyle = INK_BLUE; g.fillStyle = INK_BLUE;
    g.lineWidth = 9; rrPath(g, 22, 22, w - 44, h - 44, 26); g.stroke();
    g.lineWidth = 3; rrPath(g, 38, 38, w - 76, h - 76, 16); g.stroke();
    g.textAlign = "center";
    g.font = `600 22px ${F_MONO}`; g.fillText("LEAGUE OFFICE", w / 2, 86);
    g.font = `800 92px ${F_DISP}`; g.fillText("APPROVED", w / 2, 172);
    g.font = `600 20px ${F_MONO}`; g.fillText("TRANSACTION 0243", w / 2, 222);
    g.restore();
    // worn ink: knock specks out
    g.globalCompositeOperation = "destination-out";
    let s2 = 7;
    const r2 = () => { s2 = (s2 * 16807) % 2147483647; return (s2 - 1) / 2147483646; };
    for (let i = 0; i < 900; i++) { g.globalAlpha = 0.3 + r2() * 0.7; g.beginPath(); g.arc(r2() * w, r2() * h, 0.6 + r2() * 2.2, 0, 7); g.fill(); }
    g.globalAlpha = 1; g.globalCompositeOperation = "source-over";
  }, { text: true });
  const STAMP_PX = [1024 - 92 - 350, 1132 - 292, 330, 186];

  /* --- fountain pen (origin at the nib tip, axis +y) --- */
  const pen = new THREE.Group();
  const latheGeo = (pts, n = 24) => new THREE.LatheGeometry(pts.map(p => new THREE.Vector2(p[0], p[1])), n);
  const lathe = (pts, mat) => new THREE.Mesh(latheGeo(pts), mat);
  pen.add(new THREE.Mesh(merge([
    { geo: latheGeo([[0, 0], [0.012, 0.03], [0.034, 0.12], [0.05, 0.21], [0.05, 0.22]]) },
    { geo: latheGeo([[0.07, 0.555], [0.082, 0.56], [0.082, 0.63], [0.07, 0.635]]) },
    { geo: rbox(0.035, 0.72, 0.03, 0.012, 0.008), pos: new V3(0, 1.62, 0.1) }]), M.silver));
  pen.add(new THREE.Mesh(merge([
    { geo: latheGeo([[0.05, 0.215], [0.06, 0.24], [0.064, 0.52], [0.07, 0.56]]) },
    { geo: latheGeo([[0.07, 0.63], [0.084, 0.64], [0.084, 1.95], [0.074, 2.07], [0.04, 2.14], [0, 2.15]]) }]), M.lacquer));
  deskSet.add(pen);
  const penShadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), shadowMat(blurTex(64, 64, (g, w, h) => { g.beginPath(); g.ellipse(w / 2, h / 2, w * 0.3, h * 0.3, 0, 0, 7); g.fill(); }, 6), 0.55));
  penShadow.rotation.x = -Math.PI / 2; penShadow.renderOrder = -1;
  deskSet.add(penShadow);

  /* --- rubber stamp (origin at the rubber face) --- */
  const stamp = new THREE.Group();
  const flat = (geo) => { geo.rotateX(-Math.PI / 2); return geo; };

  const block = new THREE.Mesh(flat(rbox(1.16, 0.68, 0.22, 0.08, 0.05)), M.wood);
  block.position.y = 0.18; stamp.add(block);
  stamp.add(new THREE.Mesh(merge([
    { geo: flat(rbox(1.08, 0.6, 0.07, 0.06, 0.02)), pos: new V3(0, 0.035, 0) },
    { geo: latheGeo([[0.1, 0], [0.075, 0.05], [0.06, 0.3], [0.1, 0.38], [0.2, 0.48], [0.23, 0.6], [0.17, 0.74], [0, 0.79]]), pos: new V3(0, 0.29, 0) }]), M.lacquer));
  deskSet.add(stamp);
  const stampShadow = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.1), shadowMat(blurTex(96, 64, (g, w, h) => g.fillRect(w * 0.18, h * 0.2, w * 0.64, h * 0.6), 6), 0.6));
  stampShadow.rotation.x = -Math.PI / 2; stampShadow.renderOrder = -1;
  deskSet.add(stampShadow);

  /* ========================================================= JERSEY ===== */
  const JS = 1024, JW = 4.4, JH = 4.4;
  const OLD = { body: "#a3283b", body2: "#7d1a2b", trim: "#f3efe6", stripe2: "#d8b86e", num: "#f6f3ec", numEdge: "#5a1220", inside: "#5e1422" };
  const NEW = { body: "#eef1f7", body2: "#c9d0e0", trim: "#1c2552", stripe2: "#8f9cc2", num: "#1c2552", numEdge: "#8f9cc2", inside: "#aeb6cb" };
  function jerseyPath(g, S) {
    const P = (x, y) => [x * S, y * S];
    g.beginPath();
    g.moveTo(...P(0.395, 0.06));
    g.quadraticCurveTo(...P(0.5, 0.075), ...P(0.605, 0.06));
    g.lineTo(...P(0.79, 0.105));
    g.quadraticCurveTo(...P(0.885, 0.125), ...P(0.925, 0.2));
    g.lineTo(...P(0.99, 0.35));
    g.lineTo(...P(0.805, 0.425));
    g.lineTo(...P(0.775, 0.36));
    g.quadraticCurveTo(...P(0.765, 0.66), ...P(0.785, 0.955));
    g.quadraticCurveTo(...P(0.5, 0.99), ...P(0.215, 0.955));
    g.quadraticCurveTo(...P(0.235, 0.66), ...P(0.225, 0.36));
    g.lineTo(...P(0.195, 0.425));
    g.lineTo(...P(0.01, 0.35));
    g.lineTo(...P(0.075, 0.2));
    g.quadraticCurveTo(...P(0.115, 0.125), ...P(0.21, 0.105));
    g.closePath();
  }
  function paintJersey(c) {
    return (g, S) => {
      const P = v => v * S;
      g.save();
      jerseyPath(g, S); g.clip();
      const bg = g.createLinearGradient(0, 0, 0, S);
      bg.addColorStop(0, c.body); bg.addColorStop(1, c.body2);
      g.fillStyle = bg; g.fillRect(0, 0, S, S);
      // side shading
      const sg = g.createLinearGradient(P(0.2), 0, P(0.8), 0);
      sg.addColorStop(0, "rgba(0,0,0,.22)"); sg.addColorStop(0.18, "rgba(0,0,0,0)"); sg.addColorStop(0.82, "rgba(0,0,0,0)"); sg.addColorStop(1, "rgba(0,0,0,.22)");
      g.fillStyle = sg; g.fillRect(0, 0, S, S);
      // sleeve stripes, parallel to each cuff
      for (const side of [-1, 1]) {
        const cx = side < 0 ? 0.01 : 0.99, ix = side < 0 ? 0.195 : 0.805;
        const dx = ix - cx, dy = 0.425 - 0.35;
        for (const [off, wdt, col] of [[0.04, 0.026, c.trim], [0.078, 0.014, c.stripe2], [0.104, 0.026, c.trim]]) {
          // move toward the shoulder along the sleeve axis
          const ox = side < 0 ? off * 0.55 : -off * 0.55, oy = -off * 0.84;
          g.strokeStyle = col; g.lineWidth = P(wdt);
          g.beginPath(); g.moveTo(P(cx + ox - dx * 0.2), P(0.35 + oy - dy * 0.2)); g.lineTo(P(ix + ox + dx * 0.2), P(0.425 + oy + dy * 0.2)); g.stroke();
        }
      }
      // collar: the back of the jersey seen through a V neck, then the trim
      g.fillStyle = c.inside;
      g.beginPath(); g.moveTo(P(0.395), P(0.06)); g.lineTo(P(0.5), P(0.2)); g.lineTo(P(0.605), P(0.06)); g.closePath(); g.fill();
      g.strokeStyle = c.trim; g.lineWidth = P(0.026); g.lineJoin = "miter";
      g.beginPath(); g.moveTo(P(0.385), P(0.05)); g.lineTo(P(0.5), P(0.205)); g.lineTo(P(0.615), P(0.05)); g.stroke();
      // number
      g.textAlign = "center"; g.textBaseline = "middle";
      g.font = `800 ${P(0.34)}px ${F_DISP}`;
      g.lineJoin = "round"; g.lineWidth = P(0.022); g.strokeStyle = c.numEdge;
      g.strokeText("84", P(0.5), P(0.56)); g.fillStyle = c.num; g.fillText("84", P(0.5), P(0.56));
      // stitched seams at the shoulders and hem
      g.setLineDash([P(0.008), P(0.008)]); g.lineWidth = P(0.003); g.strokeStyle = "rgba(0,0,0,.25)";
      g.beginPath(); g.moveTo(P(0.235), P(0.92)); g.quadraticCurveTo(P(0.5), P(0.955), P(0.765), P(0.92)); g.stroke();
      g.setLineDash([]);
      g.restore();
    };
  }
  const jOld = ctex(JS, JS, (g, w) => paintJersey(OLD)(g, w), { text: true });
  const jNew = ctex(JS, JS, (g, w) => paintJersey(NEW)(g, w), { text: true });
  const jUni = { tOld: { value: jOld }, uSwap: { value: 0 } };
  const jMat = new THREE.MeshPhysicalMaterial({ map: jNew, transparent: true, alphaTest: 0.02, side: THREE.DoubleSide,
    roughness: 0.72, sheen: 1, sheenRoughness: 0.45, sheenColor: new THREE.Color(0x8890a8), envMapIntensity: 0.8,
    forceSinglePass: true });                  // transparent + DoubleSide would otherwise draw twice
  jMat.onBeforeCompile = (sh) => {
    sh.uniforms.tOld = jUni.tOld; sh.uniforms.uSwap = jUni.uSwap;
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform sampler2D tOld; uniform float uSwap;")
      .replace("void main() {", "void main() {\n  float seamGlow = 0.0;")
      .replace("#include <map_fragment>", `
#ifdef USE_MAP
  vec4 cNew = texture2D( map, vMapUv );
  vec4 cOld = texture2D( tOld, vMapUv );
  float yy = 1.0 - vMapUv.y;
  float front = uSwap * 1.08 - 0.04 + 0.025 * sin(vMapUv.x * 18.0);
  float k = smoothstep(front - 0.01, front + 0.01, yy);
  diffuseColor *= mix(cNew, cOld, k);
  float band = 1.0 - smoothstep(0.0, 0.01, abs(yy - front));
  float dash = step(0.45, fract(vMapUv.x * 52.0));
  seamGlow = band * dash * step(0.002, uSwap) * step(uSwap, 0.998) * cNew.a;
#endif`)
      .replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>\n  totalEmissiveRadiance += vec3(1.0, 0.96, 0.88) * seamGlow * 2.2;");
  };
  // cloth: a dense plane draped from the shoulders
  const jGeo = new THREE.PlaneGeometry(JW, JH, 40, 40);
  {
    const p = jGeo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i);
      const u = x / JW + 0.5, v = y / JH + 0.5, hang = 1 - v;
      let z = 0.3 * Math.cos((u - 0.5) * Math.PI * 1.15) * Math.min(1, hang * 3);       // chest volume
      z += hang * (0.05 * Math.sin(u * 21 + v * 4) + 0.08 * Math.sin(u * 8.3 - v * 6.1)); // folds
      z -= 0.32 * hang * hang;                                                            // hem falls toward the wall
      if (u < 0.22 || u > 0.78) z -= 0.12 * Math.abs(u - 0.5) * (v > 0.55 ? 1 : 0.5);     // sleeves turn in
      p.setZ(i, z);
    }
    jGeo.computeVertexNormals();
  }
  const jerseyRig = new THREE.Group();        // pivot at the wall hook; placed and scaled by layout()
  root.add(jerseyRig);
  const jSwing = new THREE.Group();
  jerseyRig.add(jSwing);
  const jersey = new THREE.Mesh(jGeo, jMat);
  jersey.position.set(0, -0.62 - JH * 0.44, 0.55);
  jSwing.add(jersey);
  // hanger: wooden shoulder bar inside the jersey, chrome hook over a wall knob
  const bar = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([
    new V3(-1.62, -0.98, 0.38), new V3(-0.8, -0.72, 0.46), new V3(0, -0.6, 0.5), new V3(0.8, -0.72, 0.46), new V3(1.62, -0.98, 0.38)]), 40, 0.075, 10), M.wood);
  jSwing.add(bar);
  jSwing.add(new THREE.Mesh(merge([
    { geo: new THREE.TorusGeometry(0.2, 0.028, 8, 24, Math.PI * 1.35), pos: new V3(0, -0.12, 0.24), rot: new THREE.Euler(0, 0, -Math.PI * 0.2) },
    { geo: new THREE.CylinderGeometry(0.028, 0.028, 0.42, 8), pos: new V3(-0.03, -0.4, 0.4), rot: new THREE.Euler(0.5, 0, 0) },
    { geo: new THREE.CylinderGeometry(0.07, 0.09, 0.3, 16), pos: new V3(0, 0, 0.15), rot: new THREE.Euler(Math.PI / 2, 0, 0) }]), M.silver));
  const jShadowTex = blurTex(256, 256, (g, w) => { jerseyPath(g, w); g.fill(); }, 9);
  const jShadow = new THREE.Mesh(new THREE.PlaneGeometry(JW, JH), shadowMat(jShadowTex, 0.5));
  jShadow.position.set(0.32, jersey.position.y - 0.34, 0.01);
  jSwing.add(jShadow);

  /* ====================================================== DEPTH CHART ===== */
  const BW = 6.0, BH = 3.75, BPX = 1024, BPY = 640;
  const bl = (px, py) => [(px / BPX - 0.5) * BW, (0.5 - py / BPY) * BH];
  const COLS = [["QB", 245], ["RB", 435], ["WR", 625]], ROWS = [245, 375, 505];
  const boardTex = ctex(BPX, BPY, (g, w, h) => {
    const m = 3;
    g.fillStyle = "#eef0f5"; g.fillRect(m, m, w - 2 * m, h - 2 * m);
    // old marker ghosts
    for (let i = 0; i < 7; i++) {
      const x = 120 + rnd() * 760, y = 150 + rnd() * 480, r = 60 + rnd() * 120;
      const rg = g.createRadialGradient(x, y, 4, x, y, r);
      rg.addColorStop(0, "rgba(120,130,160,.07)"); rg.addColorStop(1, "rgba(120,130,160,0)");
      g.fillStyle = rg; g.fillRect(x - r, y - r, 2 * r, 2 * r);
    }
    g.fillStyle = NAVY; g.font = `700 50px ${F_DISP}`; g.textBaseline = "alphabetic";
    g.fillText("Depth chart", 44, 86);
    g.fillStyle = "#5c6789"; g.font = `500 19px ${F_MONO}`; g.textAlign = "right";
    g.fillText("OFFENSE · WEEK 1", w - 44, 82); g.textAlign = "left";
    g.fillStyle = "rgba(24,33,74,.85)"; g.fillRect(44, 112, w - 88, 3);
    // grid
    g.fillStyle = "rgba(24,33,74,.18)";
    for (const y of [180, 310, 440, 570]) g.fillRect(44, y, 680, 2);
    for (const x of [150, 340, 530, 720]) g.fillRect(x, 130, 2, 440);
    g.fillStyle = "#7a84a6"; g.font = `600 22px ${F_MONO}`; g.textAlign = "center";
    COLS.forEach(([c, x]) => g.fillText(c, x, 162));
    ["1ST", "2ND", "3RD"].forEach((r, i) => g.fillText(r, 97, ROWS[i] + 8));
    // notes margin
    g.textAlign = "left"; g.fillStyle = "#9aa2bd"; g.font = `500 17px ${F_MONO}`;
    g.fillText("NOTES", 760, 162);
    g.fillStyle = "rgba(24,33,74,.08)";
    for (let y = 230; y < 570; y += 46) g.fillRect(760, y, 220, 1.5);
    // where the new man is meant to go
    g.setLineDash([10, 8]); g.strokeStyle = "rgba(92,103,137,.65)"; g.lineWidth = 2.5;
    rrPath(g, 625 - 84, 245 - 32, 168, 64, 14); g.stroke(); g.setLineDash([]);
    g.fillStyle = "#9aa2bd"; g.font = `500 18px ${F_MONO}`; g.textAlign = "center"; g.fillText("TRADE", 625, 252);
    g.textAlign = "left"; g.fillStyle = "#9aa2bd"; g.font = `500 15px ${F_MONO}`;
    g.fillText("Set before the first snap.", 44, 612);
  }, { text: true });
  boardTex.anisotropy = 8;
  const boardRig = new THREE.Group();
  root.add(boardRig);
  const boardG = new THREE.Group();
  boardRig.add(boardG);
  boardG.add(new THREE.Mesh(merge([
    { geo: rbox(BW + 0.26, BH + 0.26, 0.16, 0.12, 0.05), pos: new V3(0, 0, 0.08) },
    { geo: rbox(BW * 0.8, 0.12, 0.3, 0.05, 0.03), pos: new V3(0, -BH / 2 - 0.12, 0.25) }]), M.alu));
  const surface = new THREE.Mesh(new THREE.PlaneGeometry(BW, BH),
    new THREE.MeshStandardMaterial({ map: boardTex, emissiveMap: boardTex, emissive: 0xffffff, emissiveIntensity: 0.32, roughness: 0.36, envMapIntensity: 0.7 }));
  surface.position.z = 0.165;
  boardG.add(surface);
  boardG.add(new THREE.Mesh(merge([
    { geo: new THREE.CylinderGeometry(0.06, 0.06, 0.7, 12), pos: new V3(BW * 0.18, -BH / 2 - 0.02, 0.32), rot: new THREE.Euler(0, 0, Math.PI / 2) },
    { geo: new THREE.CylinderGeometry(0.066, 0.066, 0.2, 12), pos: new V3(BW * 0.18 + 0.42, -BH / 2 - 0.02, 0.32), rot: new THREE.Euler(0, 0, Math.PI / 2) }]),
    new THREE.MeshStandardMaterial({ color: accent, roughness: 0.35 })));
  const bShadow = new THREE.Mesh(new THREE.PlaneGeometry(BW * 1.35, BH * 1.45),
    shadowMat(blurTex(128, 96, (g, w, h) => { rrPath(g, w * 0.13, h * 0.14, w * 0.74, h * 0.7, 6); g.fill(); }, 7), 0.62));
  bShadow.position.set(0.32, -0.36, 0.0);
  boardRig.add(bShadow);

  // magnets: one atlas holds every label, two body swatches and a soft shadow, so each magnet
  // (body + printed face + its shadow on the board) is a single mesh, and the seven that never move are one mesh
  const MAG_W = 1.02, MAG_H = 0.37;
  const magGeo = rbox(MAG_W, MAG_H, 0.09, 0.09, 0.03);
  const MAGS = [[0, 0, "9", "WALSH"], [0, 1, "4", "KERR"], [0, 2, "15", "IVES"], [1, 0, "28", "ODOM"], [1, 1, "33", "BELL"],
    [1, 2, "22", "PACE"], [2, 2, "17", "PRICE"], [2, 1, "11", "COLE"], [2, 0, "84", "HAYES", true]];
  const NAVY_MAG = "#1d2758";
  const cell = i => [(i % 4) * 256, Math.floor(i / 4) * 100];          // label cells, 256 x 92
  const SW_NAVY = [16, 336], SW_ACC = [80, 336], SH_CELL = [256, 312, 256, 128];
  const magAtlas = ctex(1024, 512, g => {
    MAGS.forEach((m, i) => {
      const [x, y] = cell(i), acc = !!m[4];
      g.fillStyle = acc ? ACC : NAVY_MAG; g.fillRect(x, y, 256, 92);
      const hl = g.createLinearGradient(0, y, 0, y + 92);                  // a little top light on the face
      hl.addColorStop(0, "rgba(255,255,255,.14)"); hl.addColorStop(0.5, "rgba(255,255,255,0)"); g.fillStyle = hl; g.fillRect(x, y, 256, 92);
      g.fillStyle = acc ? "#052016" : "#f2f4fa";
      g.font = `600 34px ${F_MONO}`; g.textBaseline = "middle"; g.textAlign = "left";
      g.fillText(m[2], x + 18, y + 48);
      g.font = `600 30px ${F_TEXT}`; g.textAlign = "right";
      g.fillText(m[3], x + 238, y + 48);
      g.fillStyle = acc ? "rgba(5,32,22,.35)" : "rgba(242,244,250,.35)"; g.fillRect(x + 92, y + 22, 2, 48);
    });
    g.fillStyle = NAVY_MAG; g.fillRect(SW_NAVY[0] - 12, SW_NAVY[1] - 12, 24, 24);
    g.fillStyle = ACC; g.fillRect(SW_ACC[0] - 12, SW_ACC[1] - 12, 24, 24);
    g.filter = "blur(9px)"; g.fillStyle = "rgba(0,0,0,.6)";
    g.fillRect(SH_CELL[0] + 40, SH_CELL[1] + 34, SH_CELL[2] - 80, SH_CELL[3] - 68); g.filter = "none";
  }, { text: true });
  const U = (x, y) => [x / 1024, 1 - y / 512];
  function magnetParts(i, at) {
    const [cx, cy] = cell(i), acc = !!MAGS[i][4], sw = acc ? SW_ACC : SW_NAVY;
    const body = magGeo.clone(), pos = body.attributes.position, nor = body.attributes.normal, uv = [];
    for (let k = 0; k < pos.count; k++) {
      if (nor.getZ(k) > 0.6) { const [u, v] = U(cx + (pos.getX(k) / MAG_W + 0.5) * 256, cy + (0.5 - pos.getY(k) / MAG_H) * 92); uv.push(u, v); }
      else uv.push(...U(sw[0], sw[1]));
    }
    body.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    const parts = [];
    if (at !== null) parts.push({ geo: magShadowGeo, pos: at.clone().add(new V3(0.05, -0.06, -0.033)), uv: [SH_CELL[0] / 1024, 1 - (SH_CELL[1] + SH_CELL[3]) / 512, SH_CELL[2] / 1024, SH_CELL[3] / 512] });
    parts.push({ geo: body, pos: at || new V3() });
    return parts;
  }
  const magShadowGeo = new THREE.PlaneGeometry(MAG_W * 1.45, MAG_H * 1.9);
  const magMat = new THREE.MeshStandardMaterial({ map: magAtlas, emissiveMap: magAtlas, emissive: 0x6a6a6a, transparent: true, alphaTest: 0.004,
    roughness: 0.24, envMapIntensity: 1.1 });
  const slot = (c, r) => { const [x, y] = bl(COLS[c][1], ROWS[r]); return new V3(x, y, 0.21); };
  boardG.add(new THREE.Mesh(merge(MAGS.slice(0, 7).flatMap((m, i) => magnetParts(i, slot(m[0], m[1])))), magMat));
  // the two that move: COLE carries his own shadow; 84 gets a separate one because it lands from the air
  const cole = { grp: new THREE.Mesh(merge(magnetParts(7, new V3())), magMat) };
  boardG.add(cole.grp);
  const star = { grp: new THREE.Mesh(merge(magnetParts(8, null)), magMat),
    sh: new THREE.Mesh(magShadowGeo, shadowMat(blurTex(64, 32, (g, w, h) => g.fillRect(w * 0.15, h * 0.25, w * 0.7, h * 0.5), 4), 0.45)) };
  boardG.add(star.sh, star.grp);
  // arrival ripple
  const ripTex = ctex(256, 128, (g, w, h) => { g.fillStyle = "#000"; g.fillRect(0, 0, w, h); g.strokeStyle = "#fff"; g.lineWidth = 6; rrPath(g, 10, 10, w - 20, h - 20, 26); g.stroke(); }, { data: true });
  const ripple = new THREE.Mesh(new THREE.PlaneGeometry(MAG_W * 1.25, MAG_H * 2.2),
    new THREE.MeshBasicMaterial({ color: accent, alphaMap: ripTex, transparent: true, opacity: 0, depthWrite: false, toneMapped: false }));
  boardG.add(ripple);
  // marker notes: an arrow from 1st to 2nd, then -3.5
  const NOTE = [690, 200, 320, 360];  // board px box: x, y, w, h
  const noteStrokes = (() => {
    const cr = (pts, n = 14) => {         // catmull-rom through pts -> polyline
      const out = [];
      for (let i = 0; i < pts.length - 1; i++) {
        const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
        for (let k = 0; k < n; k++) {
          const t = k / n, t2 = t * t, t3 = t2 * t;
          out.push([0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
            0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3)]);
        }
      }
      out.push(pts[pts.length - 1]);
      return out;
    };
    const glyph = (pts, ox, oy, s) => pts.map(p => [ox + p[0] * s, oy + p[1] * s]);
    const S = [];
    // arrow (board px, relative to NOTE box)
    S.push(cr([[55, 40], [95, 70], [108, 120], [92, 165], [58, 178]]));
    S.push([[78, 160], [56, 179], [82, 192]]);
    // -3.5  (glyph box 1 x 1.4, scaled)
    const gx = 120, gy = 132, s = 44;
    S.push(glyph([[0.05, 0.72], [0.62, 0.7]], gx, gy, s));
    S.push(cr(glyph([[0.1, 0.2], [0.35, 0.03], [0.68, 0.06], [0.8, 0.28], [0.62, 0.55], [0.38, 0.62], [0.72, 0.72], [0.84, 1.0], [0.7, 1.28], [0.35, 1.36], [0.08, 1.2]], gx + 36, gy, s), 8));
    S.push(cr(glyph([[0.12, 1.26], [0.2, 1.3], [0.16, 1.36], [0.1, 1.3]], gx + 78, gy, s), 4));
    S.push(cr(glyph([[0.84, 0.05], [0.25, 0.06], [0.18, 0.62]], gx + 96, gy, s), 6));
    S.push(cr(glyph([[0.18, 0.62], [0.5, 0.5], [0.8, 0.66], [0.86, 0.98], [0.68, 1.28], [0.36, 1.36], [0.1, 1.2]], gx + 96, gy, s), 8));
    let total = 0;
    const segs = S.map(st => { let L = 0; for (let i = 1; i < st.length; i++) L += Math.hypot(st[i][0] - st[i - 1][0], st[i][1] - st[i - 1][1]); total += L; return L; });
    return { S, segs, total };
  })();
  const NS = 1.25;
  let noteDrawn = -1;
  const noteTex = ctex(Math.round(NOTE[2] * NS), Math.round(NOTE[3] * NS), (g, w, h, p = 0) => {
    g.scale(NS, NS);
    g.strokeStyle = ACC; g.lineCap = "round"; g.lineJoin = "round"; g.lineWidth = 7;
    let left = p * noteStrokes.total;
    noteStrokes.S.forEach((st, k) => {
      if (left <= 0) return;
      g.beginPath(); g.moveTo(st[0][0], st[0][1]);
      for (let i = 1; i < st.length && left > 0; i++) {
        const d = Math.hypot(st[i][0] - st[i - 1][0], st[i][1] - st[i - 1][1]);
        if (d <= left) { g.lineTo(st[i][0], st[i][1]); left -= d; }
        else { const f = left / d; g.lineTo(st[i - 1][0] + (st[i][0] - st[i - 1][0]) * f, st[i - 1][1] + (st[i][1] - st[i - 1][1]) * f); left = 0; }
      }
      g.stroke();
    });
    if (p >= 1) {
      g.fillStyle = ACC; g.font = `600 17px ${F_TEXT}`;
      g.fillText("fpts a game", 122, 240);
    }
  });
  const note = (() => {
    const [x, y] = bl(NOTE[0] + NOTE[2] / 2, NOTE[1] + NOTE[3] / 2);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(NOTE[2] / BPX * BW, NOTE[3] / BPY * BH),
      new THREE.MeshBasicMaterial({ map: noteTex, transparent: true, depthWrite: false, toneMapped: false }));
    m.position.set(x, y, 0.17);
    m.renderOrder = 2;
    boardG.add(m);
    return m;
  })();

  /* ============================================================ WALL ===== */
  // soft pools of light on the (unseen) wall behind each wall piece
  const poolTex = ctex(128, 128, (g, w, h) => {
    g.fillStyle = "#000"; g.fillRect(0, 0, w, h);
    const r = g.createRadialGradient(w / 2, h / 2, 2, w / 2, h / 2, w / 2);
    r.addColorStop(0, "#fff"); r.addColorStop(0.5, "#5a5a5a"); r.addColorStop(1, "#000");
    g.fillStyle = r; g.fillRect(0, 0, w, h);
  }, { data: true });
  function pool(parent, w, h, op) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: 0x5068c0, alphaMap: poolTex,
      transparent: true, opacity: op, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
    m.position.z = -0.05; m.renderOrder = -4;
    parent.add(m);
    return m;
  }

  /* ========================================================== LAYOUT ===== */
  const REST = { pos: new V3(0, 6, 34), look: new V3(0, 4.2, 0) };
  const DESK_LOCAL = {                      // in deskSet units (doc ~3.4 x 4.4)
    doc: new V3(0, 0, 0), docRot: 0.16,
    penRest: new V3(-2.55, 0.085, 0.7), penDir: new V3(-0.36, 0, -0.93).normalize(),
    stampRest: new V3(2.75, 0, 0.55),
  };
  deskSet.rotation.x = 0.36;            // tipped toward the lens so the paper reads (the desk is only a pool of light)
  docG.position.copy(DESK_LOCAL.doc); docG.rotation.z = DESK_LOCAL.docRot;
  desk.position.set(0.2, 0, -0.5);

  const ray = new THREE.Raycaster(), tmpV = new V3(), plane = new THREE.Plane();
  function hit(nx, ny, normal, const_) {
    ray.setFromCamera({ x: nx, y: ny }, camera);
    plane.set(normal, const_);
    return ray.ray.intersectPlane(plane, new V3());
  }
  const WALL_N = new V3(0, 0, 1), DESK_N = new V3(0, 1, 0);
  const LAY = { board: new V3(6, 4, 0), boardS: 1, jersey: new V3(-6, 7, 0), jerseyS: 1, desk: new V3(0, 0, 7), deskS: 1 };
  let lastAspect = 0, dirty = true;
  function textBoxes() {
    const hr = hero.getBoundingClientRect();
    if (!hr.width || !hr.height) return null;
    const q = s => { const e = hero.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return r.width ? r : null; };
    const tr = q(".v2-title"), sr = q(".v2-standfirst") || tr;
    const nx = x => ((x - hr.left) / hr.width) * 2 - 1, ny = y => 1 - ((y - hr.top) / hr.height) * 2;
    if (!tr) return { hr, top: ny(hr.top + hr.height * 0.62), sideL: -1, sideR: 1, below: ny(hr.top + hr.height * 0.66), nx, ny };
    // measure the title's real ink width (the h1 box is wider than its text)
    let tl = tr.left, trr = tr.right;
    try {
      const rg = document.createRange(); rg.selectNodeContents(hero.querySelector(".v2-title"));
      const rs = rg.getClientRects(); if (rs.length) { tl = Math.min(...[...rs].map(r => r.left)); trr = Math.max(...[...rs].map(r => r.right)); }
    } catch (e) { /* keep the box */ }
    return { hr, nx, ny, titleBottom: ny(tr.bottom), titleTop: ny(tr.top), titleL: nx(tl), titleR: nx(trr),
      sfL: nx(sr.left), sfR: nx(sr.right), sfBottom: ny(sr.bottom), sfTop: ny(sr.top) };
  }
  function fitWall(x0, x1, y0, y1, w, h, z) {
    // NDC box -> world box on the wall plane z, fit an object of w x h into it
    const a = hit(x0, y1, WALL_N, -z), b = hit(x1, y0, WALL_N, -z);
    if (!a || !b) return null;
    const bw = Math.abs(b.x - a.x), bh = Math.abs(a.y - b.y);
    const s = Math.min(bw / w, bh / h);
    return { c: new V3((a.x + b.x) / 2, (a.y + b.y) / 2, z), s, bw, bh };
  }
  function layout() {
    camera.position.copy(REST.pos); camera.lookAt(REST.look); camera.updateMatrixWorld(); camera.updateProjectionMatrix();
    const T = textBoxes();
    if (!T) return;
    const portrait = camera.aspect < 1.05;
    const gapY = 0.06, gapX = 0.05;
    const bandL = T.sfL !== undefined ? T.sfL + 1 : 0, bandR = T.sfR !== undefined ? 1 - T.sfR : 0;
    const sides = !forceBox && !portrait && Math.min(bandL, bandR) > 0.42;   // each side band at least ~21% of the width
    let jb, bb, db;
    if (sides) {
      const top = Math.min(T.titleBottom - gapY, T.sfTop + 0.04), bottom = -0.92;
      jb = fitWall(-0.97, T.sfL - gapX, bottom, top, 4.6, 5.6, 0);
      bb = fitWall(T.sfR + gapX, 0.97, bottom + 0.02, top - 0.04, BW + 0.3, BH + 0.5, 0);
      if (jb) { jb.s = Math.min(jb.s, 1.35); LAY.jerseyS = jb.s; LAY.jersey.set(jb.c.x, jb.c.y + jb.bh / 2 - 0.35 * jb.s, 0); }
      if (bb) { bb.s = Math.min(bb.s * 0.96, 1.25); LAY.boardS = bb.s; LAY.board.set(bb.c.x, bb.c.y + bb.bh / 2 - (BH / 2 + 0.45) * bb.s, 0); }
      // desk set under the standfirst, centred, reaching off the bottom edge a little
      // the paper's bottom (signature + stamp) must clear the scroll cue
      const yTop = T.sfBottom - 0.05, yBot = -0.8, cy = (yTop + yBot) / 2;
      const c = hit(0, cy, DESK_N, 0);
      const l = hit(T.sfL - 0.04, cy, DESK_N, 0), r = hit(T.sfR + 0.04, cy, DESK_N, 0);
      const top3 = hit(0, yTop, DESK_N, 0), bot3 = hit(0, yBot, DESK_N, 0);
      if (c && l && r && top3 && bot3) {
        const availW = Math.abs(r.x - l.x), availD = Math.abs(bot3.z - top3.z);
        LAY.deskS = Math.min(availW / 6.4, availD / 3.0, 1.7);
        LAY.desk.set(c.x, 0, c.z);
      }
    } else {
      // stacked (portrait, narrow): a fixed little still life, scaled into the larger free band,
      // above the title (phones set the type low) or under the standfirst
      LAY.jersey.set(-2.9, 6.6, 0); LAY.jerseyS = 0.78;
      LAY.board.set(2.75, 5.0, 0); LAY.boardS = 0.74;
      LAY.desk.set(0.25, 1.6, 1.6); LAY.deskS = 0.92;
      const C = { x: 0.1, y: 4.0, w: 10.4, h: 6.6 };
      const topBand = [0.8, (T.titleTop !== undefined ? T.titleTop : 0.4) + 0.05];
      const botBand = [(T.sfBottom !== undefined ? T.sfBottom : -0.3) - 0.05, -0.9];
      const band = forceBox ? [forceBox[2], forceBox[3]] : topBand[0] - topBand[1] >= botBand[0] - botBand[1] ? topBand : botBand;
      const a = hit(forceBox ? forceBox[0] : -0.97, band[0], WALL_N, 0), b = hit(forceBox ? forceBox[1] : 0.97, band[1], WALL_N, 0);
      if (a && b) {
        const bw = Math.abs(b.x - a.x), bh = Math.abs(a.y - b.y);
        const k = Math.min(bw / C.w, bh / C.h);
        root.scale.setScalar(k);
        root.position.set((a.x + b.x) / 2 - C.x * k, (a.y + b.y) / 2 - C.y * k, 0);
      }
    }
    if (sides) { root.scale.setScalar(1); root.position.set(0, 0, 0); }
    deskSet.rotation.x = sides ? 0.36 : 0.78;     // stacked: the camera sits higher over the papers, so tip them further
    root.updateMatrix();
    jerseyRig.position.copy(LAY.jersey); jerseyRig.scale.setScalar(LAY.jerseyS);
    boardRig.position.copy(LAY.board); boardRig.scale.setScalar(LAY.boardS);
    deskSet.position.copy(LAY.desk); deskSet.scale.setScalar(LAY.deskS);
    jerseyRig.updateMatrix(); boardRig.updateMatrix(); deskSet.updateMatrix();
    root.updateMatrixWorld(true);
    focus.copy(LAY.board).add(new V3(0, 0, 0));
  }
  const focus = new V3();
  let forceBox = null;                       // QA / share-art hook: [x0, x1, yTop, yBottom] in NDC
  if (typeof ResizeObserver !== "undefined") {
    const ro = new ResizeObserver(() => { dirty = true; });
    ro.observe(hero);
    [".v2-title", ".v2-standfirst"].forEach(s => { const e = hero.querySelector(s); if (e) ro.observe(e); });
  }

  /* ========================================================= RENDERER ===== */
  let R = null, ready = false, t0 = 0, seekT = null, scrollOverride = null, scrollNow = 0;
  scene.onBeforeRender = (r) => { if (!R) R = r; };
  function studio() {
    const s = new THREE.Scene();
    const box = new THREE.Mesh(new THREE.BoxGeometry(30, 18, 30), new THREE.MeshBasicMaterial({ color: 0x0a0e20, side: THREE.BackSide }));
    box.position.y = 5; s.add(box);
    const panel = (w, h, col, k, p, look) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(col).multiplyScalar(k), side: THREE.DoubleSide }));
      m.position.set(...p); m.lookAt(...look); s.add(m);
    };
    panel(10, 7, 0xfff3e4, 5.5, [-8, 10, 10], [0, 0, 0]);   // warm key softbox, upper left front
    panel(16, 3, 0xdfe6ff, 1.6, [0, 13, -2], [0, 0, 0]);    // top strip
    panel(2.2, 12, 0x9fb2ff, 3.2, [13, 4, -6], [0, 2, 0]);  // cool rim, right back
    panel(9, 4, 0x5f78d0, 0.55, [7, 1, 13], [0, 2, 0]);     // low navy fill
    return s;
  }
  function init(T) {
    try {
      R.toneMapping = THREE.ACESFilmicToneMapping;
      R.toneMappingExposure = 1.05;
      const pm = new THREE.PMREMGenerator(R);
      const env = studio();
      scene.environment = pm.fromScene(env, 0.035).texture;
      pm.dispose();
      env.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
    } catch (e) { /* no env: the key light still models the scene */ }
    root.visible = true;
    ready = true;
    t0 = T;
  }
  if (document.fonts && document.fonts.load) {
    Promise.all([`700 50px ${F_DISP}`, `800 90px ${F_DISP}`, `500 22px ${F_TEXT}`, `600 30px ${F_TEXT}`, `600 22px ${F_MONO}`, `500 19px ${F_MONO}`]
      .map(f => document.fonts.load(f).catch(() => null)))
      .then(() => { redraws.forEach(f => f()); docTex.userData.paint(); sigDrawn = -1; noteDrawn = -1; dirty = true; });
  }

  /* ======================================================== TIMELINE ===== */
  // seconds after the scene appears
  const TL = { penIn: 0.7, sign0: 1.25, sign1: 2.55, penOut: 3.1, stampUp: 3.0, stampHit: 3.75, stampBack: 4.55,
    swap0: 4.2, swap1: 5.9, drop0: 5.7, drop1: 6.35, demote0: 10.8, demote1: 13.0 };
  const qRest = new THREE.Quaternion().setFromUnitVectors(new V3(0, 1, 0), DESK_LOCAL.penDir);
  const qWrite = new THREE.Quaternion().setFromUnitVectors(new V3(0, 1, 0), new V3(0.42, 0.78, 0.46).normalize());
  const qTmp = new THREE.Quaternion(), pA = new V3(), pB = new V3(), mInv = new THREE.Matrix4();
  // a signature point (0..1) in deskSet-local coordinates
  function sigWorld(i, out) {
    const pt = SIG_B[Math.min(SIG_B.length - 1, Math.max(0, i))];
    out.set(((18 + pt[0] * 440) / SIG_W - 0.5) * sigPlane.geometry.parameters.width, (0.5 - (46 + pt[1] * 118) / SIG_H) * sigPlane.geometry.parameters.height, 0.01);
    sigPlane.localToWorld(out);
    mInv.copy(deskSet.matrixWorld).invert();
    return out.applyMatrix4(mInv);
  }
  const stampTarget = new V3(), stampRot = { rest: -0.25, hit: DESK_LOCAL.docRot - 0.07 };
  function stampTargetLocal() {
    const [x, y] = dl(STAMP_PX[0] + STAMP_PX[2] / 2, STAMP_PX[1] + STAMP_PX[3] / 2);
    stampTarget.set(x, y, 0.02);
    sheet.localToWorld(stampTarget);
    mInv.copy(deskSet.matrixWorld).invert();
    stampTarget.applyMatrix4(mInv);
    stampTarget.y = 0.03;
  }

  // static parts keep their matrices; only these are recomposed each frame
  root.traverse(o => { o.matrixAutoUpdate = false; o.updateMatrix(); });
  const DYN = [pen, penShadow, stamp, stampShadow, sheet, jSwing, star.grp, star.sh, cole.grp, ripple, boardG];
  function update(t) {
    if (!ready) { if (R) init(t); else return; }
    for (let i = 0; i < DYN.length; i++) DYN[i].updateMatrix();
    if (dirty || camera.aspect !== lastAspect) { dirty = false; lastAspect = camera.aspect; layout(); stampTargetLocal(); }
    const T = seekT !== null ? seekT : t - t0;
    const scroll = scrollOverride !== null ? scrollOverride : scrollNow;

    /* pen: lifts off the desk, signs, goes back */
    const nSig = SIG_B.length;
    const sp = seg(T, TL.sign0, TL.sign1);
    const sigN = Math.round(sp * nSig);
    if (sigN !== sigDrawn) { sigTex.userData.paint(sigN); sigDrawn = sigN; }
    const inK = ease(seg(T, TL.penIn, TL.sign0)), outK = ease(seg(T, TL.sign1 + 0.05, TL.penOut + 0.4));
    const writing = inK > 0 && outK < 1;
    sigWorld(Math.max(0, sigN - 1), pA);
    const lift = sigN >= SIG_B.lift - 2 && sigN < SIG_B.lift + 3 ? 0.14 : 0;
    if (!writing) {
      pen.position.copy(DESK_LOCAL.penRest); pen.quaternion.copy(qRest);
    } else {
      const k = inK * (1 - outK);
      pB.copy(pA); pB.y += lift + (1 - k) * 0.6;
      pen.position.copy(DESK_LOCAL.penRest).lerp(pB, k);
      pen.position.y += Math.sin(Math.PI * k) * 0.5 * (inK < 1 || outK > 0 ? 1 : 0);
      qTmp.copy(qRest).slerp(qWrite, k); pen.quaternion.copy(qTmp);
    }
    penShadow.position.set(pen.position.x + 0.5, 0.004, pen.position.z - 0.15);
    const penUp = writing ? Math.min(1, pen.position.y / 1.2) : 0;
    penShadow.scale.set(writing ? 0.9 + penUp * 0.5 : 2.3, writing ? 0.7 + penUp * 0.4 : 0.42, 1);
    penShadow.rotation.z = writing ? -0.6 : Math.atan2(DESK_LOCAL.penDir.x, DESK_LOCAL.penDir.z);
    penShadow.material.opacity = 0.5 * (1 - penUp * 0.6);

    /* stamp: up, over, thump, back */
    const up = ease(seg(T, TL.stampUp, TL.stampUp + 0.35)), over = ease(seg(T, TL.stampUp + 0.25, TL.stampHit - 0.15));
    const press = easeIn(seg(T, TL.stampHit - 0.15, TL.stampHit)), rise = easeOut(seg(T, TL.stampHit + 0.12, TL.stampHit + 0.4));
    const home = ease(seg(T, TL.stampHit + 0.3, TL.stampBack));
    pA.copy(DESK_LOCAL.stampRest).lerp(stampTarget, over);
    let sy = up * 1.1 * (1 - press) + rise * 0.9 * (1 - home);
    if (T >= TL.stampHit + 0.4) { pA.copy(stampTarget).lerp(DESK_LOCAL.stampRest, home); sy = 0.9 * (1 - home) * Math.sin(Math.PI * Math.min(1, home + 0.5)) + 0.0; sy = (1 - home) * 0.9; }
    stamp.position.set(pA.x, Math.max(0, sy) + (over > 0 && home < 1 ? 0.03 : 0), pA.z);
    stamp.rotation.y = stampRot.rest + (stampRot.hit - stampRot.rest) * (T >= TL.stampHit + 0.4 ? 1 - home : over);
    stamp.rotation.z = Math.sin(Math.PI * over) * 0.08 * (1 - press);
    stampShadow.position.set(stamp.position.x + 0.25 + stamp.position.y * 0.3, 0.004, stamp.position.z - 0.1);
    stampShadow.rotation.z = stamp.rotation.y;
    const sh = 1 + stamp.position.y * 0.6;
    stampShadow.scale.set(sh, sh, 1);
    stampShadow.material.opacity = 0.6 / (sh * sh);
    const sigDone = sigN >= nSig, stampDone = T >= TL.stampHit;
    if (sigDone !== docState.sig || stampDone !== docState.stamp) { docState.sig = sigDone; docState.stamp = stampDone; docTex.userData.paint(); }
    sigPlane.visible = sigN > 0 && !sigDone;
    // the paper jumps a hair on the thump
    const thump = T >= TL.stampHit ? Math.exp(-(T - TL.stampHit) * 14) : 0;
    sheet.position.z = 0.016 + thump * 0.012;

    /* jersey: re-stitched in the new colours, a tug on the hanger, then a slow sway */
    const sw = ease(seg(T, TL.swap0, TL.swap1));
    jUni.uSwap.value = sw;
    const tug = T > TL.swap0 ? Math.sin((T - TL.swap0) * 5.2) * Math.exp(-(T - TL.swap0) * 1.4) : 0;
    jSwing.rotation.z = Math.sin(t * 0.55) * 0.012 + tug * 0.03;
    jSwing.rotation.y = Math.sin(t * 0.37 + 1) * 0.05 + tug * 0.06;

    /* depth chart: 84 lands at 1st, later slides to 2nd, COLE moves up */
    const drop = seg(T, TL.drop0, TL.drop1);
    const dTime = ease(seg(T, TL.demote0, TL.demote1)), dScroll = ease(seg(scroll, 0.05, 0.32));
    const d = Math.max(dTime, dScroll * ease(seg(T, TL.drop1, TL.drop1 + 0.9)));   // never before 84 has landed
    const s1 = slot(2, 0), s2 = slot(2, 1);
    if (drop <= 0) star.grp.visible = star.sh.visible = false;
    else {
      star.grp.visible = star.sh.visible = true;
      const k = backOut(drop);
      const kz = easeOut(drop);                     // depth never overshoots into the board
      pA.copy(s1).add(tmpV.set(0.7 * (1 - k), 1.2 * (1 - k), 2.6 * (1 - kz)));
      pA.lerp(s2, d);
      pA.z += Math.sin(Math.PI * d) * 0.24; pA.x += Math.sin(Math.PI * d) * 0.1;
      star.grp.position.copy(pA);
      star.grp.rotation.z = (1 - k) * 0.35;
      star.grp.scale.setScalar(1 + (1 - easeOut(drop)) * 0.25);
      star.sh.position.set(pA.x + 0.05 + (pA.z - 0.21) * 0.25, pA.y - 0.05 - (pA.z - 0.21) * 0.3, 0.17);
      star.sh.material.opacity = 0.45 * Math.min(1, drop * 2) / (1 + (pA.z - 0.21) * 1.5);
    }
    pB.copy(s2).lerp(s1, d); pB.x -= Math.sin(Math.PI * d) * 0.06;
    cole.grp.position.copy(pB);
    // clack + ripple on landing
    const land = T - TL.drop1 + 0.15;
    boardG.rotation.z = land > 0 ? 0.006 * Math.sin(land * 34) * Math.exp(-land * 7) : 0;
    const rp = seg(T, TL.drop1 - 0.12, TL.drop1 + 1.0);
    ripple.position.copy(s1); ripple.position.z = 0.18;
    ripple.scale.set(1 + easeOut(rp) * 0.55, 1 + easeOut(rp) * 0.9, 1);
    ripple.material.opacity = rp > 0 && rp < 1 ? 0.95 * (1 - rp) : 0;
    ripple.visible = rp > 0 && rp < 1;
    // marker note
    const np = Math.round(seg(d, 0.5, 1) * 120) / 120;
    if (np !== noteDrawn) { noteTex.userData.paint(np); noteDrawn = np; }
    note.visible = np > 0;

    /* breathing light */
    key.intensity = 1.7 + Math.sin(t * 0.3) * 0.08;
  }

  /* ========================================================== CAMERA ===== */
  const cpos = new V3(), clook = new V3();
  function move(cam, s) {
    scrollNow = s.scroll;
    const T = seekT !== null ? seekT : (ready ? s.t - t0 : 0);
    const scroll = scrollOverride !== null ? scrollOverride : s.scroll;
    const intro = 1 - ease(T / 3.2);
    const k = ease(Math.min(1, scroll * 1.6));
    cpos.copy(REST.pos);
    cpos.x += Math.sin(s.t * 0.06) * 0.6 + s.mx * 1.4;
    cpos.y += Math.sin(s.t * 0.045) * 0.25 - s.my * 0.8 + intro * 1.4;
    cpos.z += intro * 4;
    clook.copy(REST.look);
    // as the reader scrolls past, a slow push-in: pieces only grow outward, away from the type
    cpos.z -= k * 3.2; cpos.y -= k * 0.6;
    clook.x += s.mx * 0.5;
    cam.position.copy(cpos);
    cam.lookAt(clook);
  }

  window.__tradeDesk = {
    seek(v) { seekT = v === null || v === undefined ? null : +v; },
    scroll(v) { scrollOverride = v === null || v === undefined ? null : +v; },
    get T() { return seekT; },
    box(b) { forceBox = b || null; dirty = true; },
    pixelRatio(v) { if (!R) return; const c = R.domElement; R.setPixelRatio(v); R.setSize(c.clientWidth, c.clientHeight, false); },
    part(n, v) { const o = { jersey: jerseyRig, board: boardRig, desk: deskSet, root }[n]; if (o) o.visible = v; },
    get info() { return R ? { calls: R.info.render.calls, tris: R.info.render.triangles, textures: R.info.memory.textures, geos: R.info.memory.geometries } : null; },
  };

  return {
    update,
    camera: { pos: REST.pos.clone(), look: REST.look.clone(), fov: [28, 40], far: 200, move },
  };
}
