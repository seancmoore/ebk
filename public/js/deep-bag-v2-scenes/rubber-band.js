/* EBK Deep Bag v2 hero scene "rubber-band" (scene API 2, docs/deep-bag-v2.md).
   Study: rubber-band ("The Rubber Band Is Real. It Just Isn't Magic.").

   A dotted football field seen from above one end. Lanes of dotted rubber bands run
   goal line to goal line, each stretched between two small posts. One at a time a
   band is pulled sideways in lumpy steps, the way a lead builds in touchdowns and field
   goals, held for a beat, and let go: it snaps back toward the middle line and rings
   until it settles. A dotted line drops from the pulled point to the middle line, which
   is the lead in points. The last stretch of the big band, the final 5 minutes of a
   60-minute game (one twelfth of its length), is drawn in the accent.
   Nothing here is data; it only evokes the subject.

   opts { cycle:  seconds for one pull and release (default 15.5),
          bands:  number of lanes, 3 to 7 (default 5),
          layout: "wide" | "tall" (tall turns the field a quarter for portrait stills),
          freeze: { t }  render one moment with no clock (stills for the static fallback),
          cam:    [x,y,z,lx,ly,lz] }

   Rendering notes: the floor and the posts are one static Points draw; the bands are
   one dynamic Points draw whose positions are rewritten on the CPU each frame (about
   1,000 dots, eight sine modes each), no textures, no shadows, additive. */

const TAU = Math.PI * 2;
const cl = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const smooth = (t) => { t = cl(t); return t * t * (3 - 2 * t); };
function rng(seed) {
  return function () {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const HALF_W = 26.65;           // half field width, yards
const X0 = -38, X1 = 38;        // the bands run between two posts, a little inside the goal lines
const MODES = 8;
const PHASES = [5.4, 10.5, 3.0, 12.2, 7.9, 1.6, 13.4];   // when each lane starts its pull, against the big band

export default function build(ctx, opts) {
  const { THREE, scene, uniforms } = ctx;
  const R = rng(77);
  const CYCLE = opts.cycle || 15.5;
  const tall = opts.layout === "tall";
  const root = new THREE.Group();            // tall: turned a quarter so the bands run up the screen
  if (tall) root.rotation.y = Math.PI / 2;
  scene.add(root);
  const NB = Math.max(3, Math.min(7, opts.bands || 5));

  /* ---- static layer: the field floor, yard lines, the lanes at rest, the posts ---- */
  const sp = [], sb = [], sa = [];
  const sPush = (x, y, z, b, a) => { sp.push(x, y, z); sb.push(b); sa.push(a || 0); };
  for (let x = -60; x <= 60; x += 2.5) for (let z = -HALF_W; z <= HALF_W; z += 2.5) sPush(x, 0, z, Math.abs(x) > 50 ? 0.16 : 0.1);
  for (let x = -50; x <= 50; x += 10)
    for (let z = -HALF_W; z <= HALF_W; z += 0.5) sPush(x, 0, z, Math.abs(x) === 50 ? 0.75 : 0.38);
  for (const z of [-HALF_W, HALF_W]) for (let x = -60; x <= 60; x += 0.6) sPush(x, 0, z, 0.45);

  // lane layout: the big band in the middle, the others stacked behind and in front
  const lanes = [];
  const zs = NB === 3 ? [-15, 0, 15] : NB === 4 ? [-19, -6, 7, 20] : NB === 5 ? [-20, -10, 0, 10, 20] : NB === 6 ? [-22, -13, -4, 5, 14, 23] : [-23, -15, -8, 0, 8, 15, 23];
  const hero = zs.indexOf(0) >= 0 ? zs.indexOf(0) : Math.floor(zs.length / 2);
  zs.forEach((z, k) => {
    const big = k === hero;
    lanes.push({
      z, big,
      n: big ? 300 : 170,
      uc: big ? 0.6 : 0.3 + R() * 0.45,
      H: big ? 15 : 5 + R() * 4,                          // how far the pull reaches (yards of lead)
      sign: big ? 1 : (k % 2 ? -1 : 1) * (R() < 0.8 ? 1 : -1),
      phase: big ? 0 : PHASES[(k + zs.length - hero) % PHASES.length],
      steps: big ? [[0.07, 0.3], [0.2, 0.18], [0.36, 0.3], [0.52, 0.34], [0.7, 0.22], [0.87, 0.3]]
                 : [[0.1, 0.4], [0.35, 0.3], [0.6, 0.4], [0.85, 0.3]],
    });
    // the lane at rest: a faint dotted middle line, with a tick every 5 minutes (one twelfth)
    const nr = big ? 95 : 70;
    for (let i = 0; i <= nr; i++) sPush(X0 + ((X1 - X0) * i) / nr, 0.05, z, big ? 0.5 : 0.28);
    for (let m = 0; m <= 12; m++) {
      const x = X0 + ((X1 - X0) * m) / 12;
      for (let j = -1; j <= 1; j++) sPush(x, 0.05, z + j * 0.55, big ? 0.85 : 0.42, big && m === 12 ? 1 : 0);
    }
    // the posts: a column with a fork on top, at each end of the lane
    const ph = big ? 4.6 : 3.2;
    for (const px of [X0, X1]) {
      for (let y = 0; y <= ph; y += 0.38) sPush(px, y, z, big ? 1.0 : 0.8, big && px === X1 ? 1 : 0);
      for (let q = 1; q <= 4; q++) { sPush(px, ph + q * 0.35, z - q * 0.28, 1.0); sPush(px, ph + q * 0.35, z + q * 0.28, 1.0); }
    }
  });
  const gs = new THREE.BufferGeometry();
  gs.setAttribute("position", new THREE.Float32BufferAttribute(sp, 3));
  gs.setAttribute("aB", new THREE.Float32BufferAttribute(sb, 1));
  gs.setAttribute("aAcc", new THREE.Float32BufferAttribute(sa, 1));
  gs.setAttribute("aS", new THREE.Float32BufferAttribute(new Array(sb.length).fill(1), 1));

  const vert = `
    uniform float uTime; uniform float uDpr;
    attribute float aB; attribute float aAcc; attribute float aS;
    varying float vA; varying float vAcc;
    void main() {
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      gl_Position = projectionMatrix * mv;
      float dist = -mv.z;
      gl_PointSize = (2.3 + aB * 2.5) * aS * (76.0 / dist) * uDpr;
      vA = (0.15 + aB * 0.85) * smoothstep(260.0, 70.0, dist);
      vAcc = aAcc;
    }`;
  const frag = `
    uniform vec3 uColor; uniform vec3 uAccent;
    varying float vA; varying float vAcc;
    void main() {
      float d = length(gl_PointCoord - 0.5);
      if (d > 0.5) discard;
      float a = smoothstep(0.5, 0.06, d) * vA;
      gl_FragColor = vec4(mix(uColor, uAccent, vAcc), a);
    }`;
  const staticMat = new THREE.ShaderMaterial({ uniforms, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, vertexShader: vert, fragmentShader: frag });
  root.add(new THREE.Points(gs, staticMat));

  /* ---- dynamic layer: the bands, the lead line and ring of the big one, and its motion echoes ---- */
  const DROP = 26, RING = 40, ECHO = 5, ECHO_DT = 0.09;
  const heroL = lanes[hero];
  const GLOW = Math.ceil((heroL.n + 1) / 3);
  let total = DROP + RING + (heroL.n + 1) * ECHO + GLOW;
  lanes.forEach((L) => { total += L.n + 1; });
  const dp = new Float32Array(total * 3).fill(-999), db = new Float32Array(total), da = new Float32Array(total), ds = new Float32Array(total).fill(1);
  let o = 0;
  lanes.forEach((L) => {
    L.o = o;
    L.u = new Float32Array(L.n + 1);
    L.sin = new Float32Array((L.n + 1) * MODES);
    for (let i = 0; i <= L.n; i++) {
      const u = i / L.n;
      L.u[i] = u;
      for (let m = 0; m < MODES; m++) L.sin[i * MODES + m] = Math.sin((m + 1) * Math.PI * u);
      db[o + i] = L.big ? 1.05 : 0.62;
      da[o + i] = L.big && u >= 11 / 12 ? 1 : 0;
    }
    o += L.n + 1;
  });
  const dropO = o; o += DROP;
  for (let i = 0; i < DROP; i++) { db[dropO + i] = 0.95; da[dropO + i] = 1; }
  const ringO = o; o += RING;
  for (let i = 0; i < RING; i++) { db[ringO + i] = 1.25; da[ringO + i] = 1; }
  const echoO = o;
  for (let e = 0; e < ECHO; e++) for (let i = 0; i <= heroL.n; i++) {
    db[echoO + e * (heroL.n + 1) + i] = 0.72 * (1 - e / (ECHO + 0.6));
    da[echoO + e * (heroL.n + 1) + i] = heroL.u[i] >= 11 / 12 ? 1 : 0;
  }
  const glowO = echoO + ECHO * (heroL.n + 1);
  for (let j = 0; j < GLOW; j++) { db[glowO + j] = 0; ds[glowO + j] = 3.3; da[glowO + j] = heroL.u[Math.min(heroL.n, j * 3)] >= 11 / 12 ? 1 : 0; }
  const gd = new THREE.BufferGeometry();
  gd.setAttribute("position", new THREE.BufferAttribute(dp, 3).setUsage(THREE.DynamicDrawUsage));
  gd.setAttribute("aS", new THREE.BufferAttribute(ds, 1));
  gd.setAttribute("aB", new THREE.BufferAttribute(db, 1));
  gd.setAttribute("aAcc", new THREE.BufferAttribute(da, 1));
  const dyn = new THREE.Points(gd, staticMat);
  dyn.frustumCulled = false;
  root.add(dyn);

  /* ---- one band at time t: a pulled tent that rings out when it is let go ---- */
  const PULL0 = 0.8, PULL1 = 7.6, HOLD1 = 8.5;
  const OMEGA = 2.35, DAMP = 0.5;
  function pullFrac(L, s) {                     // lumpy: the lead grows in steps, like scoring does
    let f = 0, tot = 0;
    for (const [at, size] of L.steps) { tot += size; f += size * smooth((s - at) / 0.1); }
    return f / tot;
  }
  const co = new Float64Array(MODES);
  function place(L, t, w0) {
    const tau = (((t + L.phase) % CYCLE) + CYCLE) % CYCLE;
    const uc = L.uc, w = (1 / (uc * (1 - uc)));
    const ringing = tau >= HOLD1;
    let h = 0, apexD = 0;
    if (tau >= PULL0 && !ringing) {
      const s = cl((tau - PULL0) / (PULL1 - PULL0));
      h = L.H * pullFrac(L, s) * (tau > PULL1 ? 1 + 0.012 * Math.sin((tau - PULL1) * 38) : 1);
      apexD = h;
    } else if (ringing) {
      const r = tau - HOLD1;
      for (let m = 0; m < MODES; m++) {
        const n = m + 1;
        const a0 = (2 * L.H * w * Math.sin(n * Math.PI * uc)) / (n * n * Math.PI * Math.PI);
        co[m] = a0 * Math.exp(-(DAMP + 0.09 * n) * r) * Math.cos(OMEGA * n * r);
      }
      for (let m = 0; m < MODES; m++) apexD += co[m] * Math.sin((m + 1) * Math.PI * uc);
    }
    const span = X1 - X0;
    for (let i = 0; i <= L.n; i++) {
      const u = L.u[i];
      let d;
      if (!ringing) d = h * (u < uc ? u / uc : (1 - u) / (1 - uc));
      else { d = 0; for (let m = 0; m < MODES; m++) d += co[m] * L.sin[i * MODES + m]; }
      d *= L.sign;
      const k = (w0 + i) * 3;
      dp[k] = X0 + span * u;
      dp[k + 1] = 0.9 + 0.07 * Math.abs(d);
      dp[k + 2] = L.z + d;
    }
    return { apexD: apexD * L.sign, tau };
  }
  function update(t) {
    let hi = null;
    for (const L of lanes) { const r = place(L, t, L.o); if (L.big) hi = r; }
    // echoes: where the big band was a few frames ago, only while it is moving fast (after the release)
    const moving = hi.tau >= HOLD1 && hi.tau < HOLD1 + 5;
    for (let e = 0; e < ECHO; e++) {
      const w0 = echoO + e * (heroL.n + 1);
      if (moving) place(heroL, t - (e + 1) * ECHO_DT, w0);
      else for (let i = 0; i <= heroL.n; i++) dp[(w0 + i) * 3 + 1] = -999;
    }
    for (let j = 0; j < GLOW; j++) {
      const a = (heroL.o + Math.min(heroL.n, j * 3)) * 3, g = (glowO + j) * 3;
      dp[g] = dp[a]; dp[g + 1] = dp[a + 1]; dp[g + 2] = dp[a + 2];
    }
    // the lead line: from the middle line to the pulled point, dotted, with a ring on the point
    const px = X0 + (X1 - X0) * heroL.uc;
    const show = hi.tau >= PULL0 + 0.4 && hi.tau < HOLD1 + 1.6;
    const lead = Math.abs(hi.apexD), y = 0.9 + 0.07 * lead;
    for (let i = 0; i < DROP; i++) {
      const k = (dropO + i) * 3, f = i / (DROP - 1);
      dp[k] = px; dp[k + 1] = show ? 0.5 : -999; dp[k + 2] = heroL.z + hi.apexD * f;
    }
    for (let i = 0; i < RING; i++) {
      const k = (ringO + i) * 3, a = (i / RING) * TAU, rr = show ? 1.5 : 0;
      dp[k] = px + Math.cos(a) * rr; dp[k + 1] = show ? y : -999; dp[k + 2] = heroL.z + hi.apexD + Math.sin(a) * rr;
    }
    gd.attributes.position.needsUpdate = true;
  }

  const fz = opts.freeze || null;
  if (fz) update(fz.t == null ? 7.3 : fz.t);

  return {
    update(t) { if (fz) { uniforms.uTime.value = fz.t || 0; return; } update(t); },
    camera: {
      pos: new THREE.Vector3(...(opts.cam ? opts.cam.slice(0, 3) : tall ? [0, 86, 26] : [0, 56, 62])),
      look: new THREE.Vector3(...(opts.cam ? opts.cam.slice(3, 6) : tall ? [0, 0, 1] : [0, 0, -9])),
      fov: opts.fov || [42, 58], far: 420,
      drift: { sway: 3, swaySpeed: 0.05, mouseX: 5, mouseY: 3, scrollY: 7, scrollZ: 5, lookMouse: 2, lookScroll: 4 },
    },
  };
}
