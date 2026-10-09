/* EBK Deep Bag hero scene "cliff-ridges" (scene API 2, docs/deep-bag-v2.md). Study: the-cliff.
   v3 (2026-10-09): "the trail to the cliff". Replaces the dotted ridgelines.

   A stylized low-poly mesa country at dusk. Each mesa's top IS a real career-model aging
   curve (x = age, height = drop below peak in talent-SDs): the trail rises out of the mist,
   peaks, slides, and then the mesa ends in a sheer cliff at that group's cliff age. Running
   backs are the front mesa and their edge is at 29; receivers end at 30 to 31; the hockey
   mesas behind run on to 32 to 34. Where the two methods disagree (a range), the edge is a
   broken staircase between the fast (delta method) and slow (career model) ages.

   Little runners jog along each trail. At every birthday past the peak a runner stays only
   as often as the real sample does (players at age a+1 / players at age a), so the crowd
   thins and the ones who leave quietly fade out; whoever reaches the edge steps off and
   drops into the fog, which is where the players an average-by-age chart never sees end up.
   Signposts mark 24, 26, 28 and the accent 29 on the front trail.

   Data (data-scene-data): hero_v3.json from the study's scripts/17_export_hero_v3.py
     { v: 3, threshold, mesas: [{ g, label, pts: [[age, drop_sd]], n: [[age, share]], fast, slow }] }
   The old cliff-scene-data ({ rows: [{ g, pts, n, emph }], threshold }) still works: the same
   four groups are picked and the cliff is the first age past the peak at the threshold.
   Opts: { freeze: seconds }  render one deterministic still at that time (posters), no motion;
         { xs, ys, dist }  re-frame a still (where the 29 lip sits in the frame, camera distance factor).

   Looks: MeshStandardMaterial everywhere, a RoomEnvironment-style PMREM environment built from
   the core's renderer on the second frame, a warm low sun beyond the cliffs and a cool sky
   light, strata + baked wall shading and a height fog in the terrain shader, drifting fog
   sheets, blob contact shadows. ~20 draw calls; the runners are 4 instanced meshes. */

const AX = 6;                         // world units per year of age
const A0 = 26;                        // the age at x = 0
const X = (a) => (a - A0) * AX;
const KY = 12;                        // world units per talent-SD of decline
const MESA_Z = [0, -30, -65];
const MESA_TOP = [0, -4.5, -7.5];
const MESA_SHIFT = [0, -2, -10];   // back mesas slide a little so each edge sits clear of the one in front
const MESA_W = [9.5, 11, 12];
const FOG_TOP = -16;
const CAM_X = 9;
const CAM_Z = 140;
const PICK = [["RB"], ["WR"], ["NHL D", "NHL defensemen"]];
const LABEL = { RB: "Running backs", WR: "Receivers", "NHL D": "Hockey defensemen" };
const CODE = { RB: "RB", WR: "WR", "NHL D": "NHL D", "NHL defensemen": "NHL D" };

const C = {
  skyTop: 0x05070f, skyHor: 0x232a5a, fog: 0x343c70, fogWarm: 0x4a3f68, haze: 0x55507f,
  top: 0x8a90c0, wall: 0x2f3666, trail: 0xe2dcec, ink: 0x10142a, ivory: 0xf2ede4,
  post: 0x2a3058, runner: 0xf4efe6, shorts: 0x2b3362, sun: 0xffb48a, moon: 0xa9b6ff,
};

/* ---------------------------------------------------------------- helpers -- */
function rng(seed) { // mulberry32
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth = (x) => { x = clamp01(x); return x * x * (3 - 2 * x); };
const easeIO = (x) => { x = clamp01(x); return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; };

/** drop(age) in talent-SDs: Catmull-Rom through the yearly points, extended at both ends */
function curveFn(pts) {
  const a0 = pts[0][0], a1 = pts[pts.length - 1][0];
  const v = (i) => pts[Math.max(0, Math.min(pts.length - 1, i))][1];
  return (a) => {
    if (a <= a0) return pts[0][1] + (a0 - a) * 0.19;
    if (a >= a1) return pts[pts.length - 1][1] + (a - a1) * 0.3;
    const i = Math.floor(a - a0), t = a - a0 - i;
    const p0 = v(i - 1), p1 = v(i), p2 = v(i + 1), p3 = v(i + 2);
    return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t * t * t);
  };
}

function normalize(data) {
  if (!data) return null;
  let src = [];
  if (Array.isArray(data.mesas)) src = data.mesas;
  else if (Array.isArray(data.rows)) {
    const thr = data.threshold || 0.5;
    src = data.rows.map((r) => {
      const peak = r.pts.reduce((m, p) => (p[1] < m[1] ? p : m), r.pts[0])[0];
      const hit = r.pts.find((p) => p[0] > peak && p[1] >= thr);
      const c = hit ? hit[0] : r.pts[r.pts.length - 1][0];
      return { g: r.g, pts: r.pts, n: r.n, fast: c, slow: c };
    });
  }
  const out = [];
  for (const names of PICK) {
    const m = src.find((r) => names.includes(r.g));
    if (m && Array.isArray(m.pts) && m.pts.length > 4) out.push(m);
  }
  return out.length >= 2 ? out : null;
}

/* RoomEnvironment (three.js examples, MIT), rebuilt here on the core's THREE so no second copy
   of three.js loads: a neutral studio box with soft area lights, prefiltered once with PMREM. */
function roomEnvironment(THREE) {
  const scene = new THREE.Scene();
  const geo = new THREE.BoxGeometry();
  geo.deleteAttribute("uv");
  const roomMat = new THREE.MeshStandardMaterial({ side: THREE.BackSide });
  const boxMat = new THREE.MeshStandardMaterial();
  const main = new THREE.PointLight(0xffffff, 900, 28, 2);
  main.position.set(0.418, 16.199, 0.3);
  scene.add(main);
  const room = new THREE.Mesh(geo, roomMat);
  room.position.set(-0.757, 13.219, 0.717);
  room.scale.set(31.713, 28.305, 28.591);
  scene.add(room);
  const boxes = [
    [-10.906, 2.009, 1.846, -0.195, 2.328, 7.905, 4.651], [-5.607, -0.754, -0.758, 0.994, 1.97, 1.534, 3.955],
    [6.167, 0.857, 7.803, 0.561, 3.927, 6.285, 3.687], [-2.017, 0.018, 6.124, 0.333, 2.002, 4.566, 2.064],
    [2.291, -0.756, -2.621, -0.286, 1.546, 1.552, 1.496], [-2.193, -0.369, -5.547, 0.516, 3.875, 3.487, 2.986],
  ];
  for (const b of boxes) { const m = new THREE.Mesh(geo, boxMat); m.position.set(b[0], b[1], b[2]); m.rotation.set(0, b[3], 0); m.scale.set(b[4], b[5], b[6]); scene.add(m); }
  const lights = [
    [50, -16.116, 14.37, 8.208, 0.1, 2.428, 2.739], [50, -16.109, 18.021, -8.207, 0.1, 2.425, 2.751],
    [17, 14.904, 12.198, -1.832, 0.15, 4.265, 6.331], [43, -0.462, 8.89, 14.52, 4.38, 5.441, 0.088],
    [20, 3.235, 11.486, -12.541, 2.5, 2, 0.1], [100, 0, 20, 0, 1, 0.1, 1],
  ];
  for (const l of lights) {
    const mat = new THREE.MeshBasicMaterial();
    mat.color.setScalar(l[0]);
    const m = new THREE.Mesh(geo, mat); m.position.set(l[1], l[2], l[3]); m.scale.set(l[4], l[5], l[6]); scene.add(m);
  }
  return scene;
}

/* ------------------------------------------------------------------ scene -- */
export default function cliffEdge(ctx, opts = {}) {
  const { THREE, scene, accent, uniforms } = ctx;
  const mesas = normalize(ctx.data);
  if (!mesas) return null;
  const freeze = typeof opts.freeze === "number" ? opts.freeze : null;
  const R = rng(20261009);
  const col = (h) => new THREE.Color(h);
  const root = new THREE.Group();
  root.visible = false;               // first frame: grab the renderer, build the environment, then show
  scene.add(root);

  /* shared shader bits: height fog + distance haze (+ strata on terrain, + per-instance alpha) */
  const FOGU = {
    uTime: uniforms.uTime,
    uFogTop: { value: FOG_TOP }, uFogC: { value: col(C.fog) }, uFogW: { value: col(C.fogWarm) },
    uHaze: { value: col(C.haze) }, uNear: { value: 118 }, uFar: { value: 225 },
    uTopC: { value: col(C.top) }, uWallC: { value: col(C.wall) }, uAcc: { value: accent.clone() }, uTrailC: { value: col(C.trail) },
  };
  function patch(mat, kind) {
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, FOGU);
      const alpha = kind === "inst";
      sh.vertexShader = sh.vertexShader
        .replace("#include <common>", `#include <common>
          varying vec3 vW;${alpha ? " attribute float aAlpha; varying float vA;" : ""}`)
        .replace("#include <fog_vertex>", `#include <fog_vertex>
          vec4 wq = vec4(transformed, 1.0);
          #ifdef USE_INSTANCING
            wq = instanceMatrix * wq;
          #endif
          vW = (modelMatrix * wq).xyz;${alpha ? " vA = aAlpha;" : ""}`);
      let fs = sh.fragmentShader.replace("#include <common>", `#include <common>
          uniform float uTime; uniform float uFogTop; uniform vec3 uFogC; uniform vec3 uFogW; uniform vec3 uHaze;
          uniform float uNear; uniform float uFar; uniform vec3 uTopC; uniform vec3 uWallC; uniform vec3 uAcc; uniform vec3 uTrailC;
          varying vec3 vW;${alpha ? " varying float vA;" : ""}
          float hsh(float n) { return fract(sin(n * 91.345) * 47453.5453); }`);
      if (kind === "terrain") {
        fs = fs.replace("#include <color_fragment>", `#include <color_fragment>
          vec3 fN = normalize(cross(dFdx(vW), dFdy(vW)));
          float up = abs(fN.y);
          float wall = 1.0 - smoothstep(0.42, 0.74, up);
          float band = floor(vW.y / 1.15 + 0.35 * sin(vW.x * 0.21 + vW.z * 0.17));
          float sh0 = 0.84 + 0.26 * hsh(band + floor(vW.z / 19.0) * 7.0);
          float ao = mix(0.5, 1.0, smoothstep(-30.0, vColor.r * 14.0 - 2.0, vW.y));
          vec3 wc = uWallC * sh0 * ao;
          // the cliff face that looks into the sunset picks up the accent
          wc = mix(wc, uAcc * 0.55, smoothstep(0.7, 0.95, fN.x) * step(0.9, vColor.g) * smoothstep(-26.0, -6.0, vW.y));
          vec3 tc = uTopC * (0.94 + 0.12 * hsh(floor(vW.x * 0.9) + floor(vW.z * 0.9) * 13.0));
          diffuseColor.rgb = vColor.b > 0.5 ? uTrailC : mix(tc, wc, wall);`)
          // Lambert has no environment: add its share of sky light back as diffuse-scaled ambient
          .replace("#include <emissivemap_fragment>", `#include <emissivemap_fragment>
          totalEmissiveRadiance += diffuseColor.rgb * (0.5 + 0.25 * fN.y);`);
      }
      fs = fs.replace("#include <fog_fragment>", `
          float fy = uFogTop + sin(vW.x * 0.08 + uTime * 0.33) * 0.8 + sin(vW.z * 0.13 - uTime * 0.27) * 0.6;
          float hf = 1.0 - smoothstep(fy - 9.0, fy + 5.0, vW.y);
          float df = smoothstep(uNear, uFar, length(vW - cameraPosition));
          vec3 fc = mix(uFogC, uFogW, smoothstep(0.0, 70.0, vW.x) * 0.55);
          gl_FragColor.rgb = mix(gl_FragColor.rgb, uHaze, df * 0.8);
          gl_FragColor.rgb = mix(gl_FragColor.rgb, fc, hf);${alpha ? "\n          gl_FragColor.a *= vA;" : ""}`);
      sh.fragmentShader = fs;
    };
    mat.customProgramCacheKey = () => "cliff-" + kind;
    return mat;
  }

  /* ---------------------------------------------------------------- sky -- */
  const sunDir = new THREE.Vector3(0.2, 0.012, -0.98).normalize();
  const sky = new THREE.Mesh(new THREE.SphereGeometry(380, 32, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    uniforms: { uTop: { value: col(C.skyTop) }, uHor: { value: col(C.skyHor) }, uGlow: { value: accent.clone() },
      uFog: { value: col(C.fog) }, uFogW: { value: col(C.fogWarm) }, uSun: { value: sunDir } },
    vertexShader: `varying vec3 vD; void main(){ vD = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }`,
    fragmentShader: `uniform vec3 uTop; uniform vec3 uHor; uniform vec3 uGlow; uniform vec3 uFog; uniform vec3 uFogW; uniform vec3 uSun; varying vec3 vD;
      void main(){
        vec3 d = normalize(vD); float y = d.y;
        vec3 c = mix(uHor, uTop, smoothstep(-0.01, 0.2, y));
        float s = max(dot(d, uSun), 0.0);
        float low = 1.0 - smoothstep(0.0, 0.34, y);
        c += uGlow * (pow(s, 70.0) * 0.5 + pow(s, 14.0) * 0.09) * (1.0 - smoothstep(0.0, 0.14, y));
        c = mix(c, mix(uFog, uFogW, smoothstep(0.0, 0.45, d.x) * 0.55), 1.0 - smoothstep(-0.06, 0.03, y));
        gl_FragColor = vec4(c, 1.0);
        #include <colorspace_fragment>
      }`,
  }));
  sky.renderOrder = -10;
  sky.frustumCulled = false;
  root.add(sky);

  /* ------------------------------------------------------------- lights -- */
  const sun = new THREE.DirectionalLight(C.sun, 3.0);
  sun.position.copy(sunDir).multiplyScalar(100);
  const moon = new THREE.DirectionalLight(C.moon, 0.5);
  moon.position.set(-60, 110, 50);
  root.add(sun, moon, new THREE.HemisphereLight(0x5866b0, 0x0a0d1c, 0.42));

  /* ------------------------------------------------------------ terrain -- */
  const M = mesas.map((m, j) => {
    const drop = curveFn(m.pts);
    const top0 = MESA_TOP[j];
    const lip = m.slow + 0.32;
    const brk = m.fast + 0.32;
    const n = m.n || [];
    const nAt = (a) => { const q = n.find((p) => p[0] === a); return q ? q[1] : 0; };
    const peak = m.pts.reduce((b, p) => (p[1] < b[1] ? p : b), m.pts[0])[0];
    const height = (a) => {
      let h = top0 - KY * Math.min(drop(a), 1.9);
      if (a > brk) h -= 1.1 + 1.25 * Math.floor((a - brk) / 0.5);   // the broken steps between the two methods
      return h;
    };
    const zc = MESA_Z[j], w = MESA_W[j];
    // the front edge wanders a little; the trail and the signs follow it
    const zFront = (x) => zc + w / 2 + 0.55 * Math.sin(x * 0.23 + j * 1.7) + 0.3 * Math.sin(x * 0.71 + j);
    const zBack = (x) => zc - w / 2 + 0.5 * Math.sin(x * 0.19 + j * 2.3);
    const MX = (a) => X(a) + MESA_SHIFT[j];
    const xLip = (z) => MX(lip) + 0.3 * Math.sin(z * 1.1 + j) + 0.18 * Math.sin(z * 2.9);
    return { ...m, j, z: zc, w, top0, lip, brk, height, nAt, peak, zFront, zBack, xLip,
      X: MX, A: (x) => (x - MESA_SHIFT[j]) / AX + A0, trailZ: (a) => zFront(MX(a)) - 1.05, label: m.label || LABEL[m.g] || m.g };
  });

  const pos = [], colr = [], idx = [];
  const push = (x, y, z, r, g) => { pos.push(x, y, z); colr.push(r, g, 0); return pos.length / 3 - 1; };
  const quad = (a, b, c, d) => idx.push(a, c, b, b, c, d);      // a b on top, c d below (or a b left, c d right)
  const DEPTH = [0, 1.0, 3.2, 6.4, 10.4, 15.2, 21, 28, 37, 50];
  M.forEach((m) => {
    const rr = (m.top0 + 2) / 14, gg = m.j === 0 ? 1 : 0.3;
    const xs = [];
    for (let x = m.X(m.j === 0 ? 13 : 19); x < m.xLip(m.z) - 0.3; x += 0.6) xs.push(x);
    const NV = 12;                                         // across the top, back (0) to front (NV)
    const grid = [];
    xs.forEach((x0, i) => {
      const col = [];
      for (let v = 0; v <= NV; v++) {
        let x = x0, zb = m.zBack(x0), zf = m.zFront(x0);
        let z = zb + (zf - zb) * (v / NV);
        if (v > 0 && v < NV && i > 0) { x += (R() - 0.5) * 0.36; z += (R() - 0.5) * 0.3; }
        const lastCol = i === xs.length - 1;
        if (lastCol) x = m.xLip(z);
        const a = m.A(x);
        let y = m.height(a);
        const nearTrail = Math.abs(z - m.trailZ(a)) < 1.2 || v >= NV - 1;
        if (!nearTrail && !lastCol) y += (R() - 0.5) * 0.3;
        col.push(push(x, y, z, rr, gg * 0.3));
      }
      grid.push(col);
    });
    for (let i = 0; i < grid.length - 1; i++) for (let v = 0; v < NV; v++) {
      const a = grid[i][v], b = grid[i][v + 1], c = grid[i + 1][v], d = grid[i + 1][v + 1];
      if ((i + v) % 2) idx.push(a, b, c, c, b, d); else idx.push(a, b, d, a, d, c);
    }
    const P = (k) => new THREE.Vector3(pos[k * 3], pos[k * 3 + 1], pos[k * 3 + 2]);
    // front skirt: big angular facets in horizontal courses, down into the fog
    let prev = null;
    grid.forEach((col, i) => {
      const top = P(col[NV]);
      const c = [col[NV]];
      for (let k = 1; k < DEPTH.length; k++) {
        const jit = k === DEPTH.length - 1 ? 0 : 1;
        const crack = Math.sin(top.x * 0.83 + m.j * 2.1) * Math.sin(top.x * 0.29 + 1.3) > 0.82 ? -0.6 : 0;
        const nz = Math.sin(top.x * 0.21 + k * 1.9 + m.j) * 0.6 + Math.sin(top.x * 0.53 + k * 0.7) * 0.3 + (k > 1 ? crack : 0);
        c.push(push(top.x + (R() - 0.5) * 0.2 * jit, top.y - DEPTH[k] - Math.sin(top.x * 0.3 + k) * 0.5 * jit,
          top.z + (0.35 + nz * 0.45) * jit * (k % 2 ? 1 : -0.6), rr, gg * 0.3));
      }
      if (prev) for (let k = 0; k < DEPTH.length - 1; k++) idx.push(prev[k], prev[k + 1], c[k], c[k], prev[k + 1], c[k + 1]);
      prev = c;
    });
    // end face: the cliff itself, across the mesa at the lip
    const last = grid[grid.length - 1];
    let pv = null;
    for (let v = NV; v >= 0; v--) {
      const top = P(last[v]);
      const c = [last[v]];
      for (let k = 1; k < DEPTH.length; k++) {
        const jit = k === DEPTH.length - 1 ? 0 : 1;
        c.push(push(top.x + (0.15 + R() * 0.45) * jit * (k % 2 ? 1 : -0.5), top.y - DEPTH[k] - (R() - 0.5) * 0.6 * jit,
          top.z + (R() - 0.5) * 0.4 * jit, rr, gg));
      }
      if (pv) for (let k = 0; k < DEPTH.length - 1; k++) idx.push(pv[k], pv[k + 1], c[k], c[k], pv[k + 1], c[k + 1]);
      pv = c;
    }
  });
  // trails: a pale ribbon along each curve near the front lip, in the same mesh (vertex colour b = 1)
  M.forEach((m) => {
    const a0 = m.j === 0 ? 14 : 20, aEnd = m.brk - 0.08;
    const N = 240, base = pos.length / 3;
    for (let k = 0; k <= N; k++) {
      const a = a0 + (aEnd - a0) * (k / N);
      const y = m.height(a) + 0.045;
      const wv = (m.j === 0 ? 0.55 : 0.45) * (1 + 0.08 * Math.sin(a * 5.1));
      const zc = m.trailZ(a);
      pos.push(m.X(a), y, zc - wv, m.X(a), y, zc + wv);
      colr.push(0, 0, 1, 0, 0, 1);
      if (k) { const q = base + 2 * k; idx.push(q - 2, q, q - 1, q - 1, q, q + 1); }
    }
  });
  const tg = new THREE.BufferGeometry();
  tg.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  tg.setAttribute("color", new THREE.Float32BufferAttribute(colr, 3));
  tg.setIndex(idx);
  tg.computeVertexNormals();
  // matte rock: Lambert (per-fragment, flat-shaded) reads the same as a rough standard material at a
  // fraction of the GPU cost on an iGPU; the figures keep the standard material and the environment
  const terrainMat = patch(new THREE.MeshLambertMaterial({ color: 0xffffff, vertexColors: true, flatShading: true, side: THREE.DoubleSide }), "terrain");
  const terrain = new THREE.Mesh(tg, terrainMat);
  root.add(terrain);

  // a floor of fog under everything, in the terrain's own fog colour (and tone mapping), so the
  // canyon below the mist reads as one even sea whatever the frame's shape
  {
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(1600, 1600), patch(new THREE.MeshBasicMaterial({ color: C.fog }), "plain"));
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(20, FOG_TOP - 12, -100);
    root.add(floor);
  }

  /* --------------------------------------------------------- fog sheets -- */
  function noiseTex(seed, size) {
    const c = document.createElement("canvas"); c.width = c.height = size;
    const g = c.getContext("2d");
    const r = rng(seed);
    const img = g.createImageData(size, size);
    const grid = (n) => { const a = []; for (let i = 0; i < n * n; i++) a.push(r()); return a; };
    const oct = [[4, grid(4)], [8, grid(8)], [16, grid(16)]];
    const val = (gr, n, u, v) => {
      const x = u * n, y = v * n, i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j;
      const at = (p, q) => gr[((q % n + n) % n) * n + ((p % n + n) % n)];
      const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
      return (at(i, j) * (1 - sx) + at(i + 1, j) * sx) * (1 - sy) + (at(i, j + 1) * (1 - sx) + at(i + 1, j + 1) * sx) * sy;
    };
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const u = x / size, v = y / size;
      let n = 0, w = 0.55;
      for (const [k, gr] of oct) { n += val(gr, k, u, v) * w; w *= 0.5; }
      const a = Math.max(0, Math.min(1, (n - 0.36) * 2.6));
      const o = (y * size + x) * 4;
      img.data[o] = img.data[o + 1] = img.data[o + 2] = 255; img.data[o + 3] = Math.round(a * 255);
    }
    g.putImageData(img, 0, 0);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  }
  const fogTex = noiseTex(7, 128);
  const sheets = [];
  [[FOG_TOP - 2.6, 0.42, 0x7079ad, 2.4], [FOG_TOP - 5.5, 0.75, 0x3f467a, 1.5]].forEach(([y, op, c, rep], i) => {
    const t = fogTex.clone(); t.needsUpdate = true; t.repeat.set(rep, rep * 0.55);
    const mat = new THREE.MeshBasicMaterial({ map: t, color: c, transparent: true, opacity: op, depthWrite: false });
    // fade the sheet out toward its rim so it never shows an edge
    mat.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nvarying vec2 vQ;").replace("#include <uv_vertex>", "#include <uv_vertex>\nvQ = uv;");
      sh.fragmentShader = sh.fragmentShader.replace("#include <common>", "#include <common>\nvarying vec2 vQ;")
        .replace("#include <map_fragment>", "#include <map_fragment>\ndiffuseColor.a *= smoothstep(0.0, 0.18, vQ.x) * smoothstep(1.0, 0.82, vQ.x) * smoothstep(0.0, 0.25, vQ.y) * smoothstep(1.0, 0.7, vQ.y);");
    };
    const m = new THREE.Mesh(new THREE.PlaneGeometry(360, 280), mat);
    m.rotation.x = -Math.PI / 2;
    m.position.set(20, y, 20);
    m.renderOrder = 2 + i;
    root.add(m);
    sheets.push({ t, speed: 0.0035 + i * 0.0018, dir: i % 2 ? -1 : 1 });
  });

  // wisps: soft billboards drifting through the canyon past the edge and along the wall feet.
  // One mesh; the drift and the facing happen in the vertex shader, so they cost no JS per frame.
  const wc = document.createElement("canvas"); wc.width = 128; wc.height = 64;
  {
    const g = wc.getContext("2d"), r = rng(11), img = g.createImageData(128, 64);
    const gr = []; for (let i = 0; i < 64; i++) gr.push(r());
    const val = (u, v) => { const x = u * 8, y = v * 8, i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j;
      const at = (p, q) => gr[((q & 7) * 8) + (p & 7)]; const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
      return (at(i, j) * (1 - sx) + at(i + 1, j) * sx) * (1 - sy) + (at(i, j + 1) * (1 - sx) + at(i + 1, j + 1) * sx) * sy; };
    for (let y = 0; y < 64; y++) for (let x = 0; x < 128; x++) {
      const u = x / 128, v = y / 64, d = Math.hypot((u - 0.5) * 2, (v - 0.5) * 2);
      const n = val(u * 1.6, v * 0.8) * 0.65 + val(u * 3.2 + 3, v * 1.6) * 0.35;
      const a = Math.max(0, 1 - d) ** 1.6 * Math.min(1, n * 1.5);
      const o = (y * 128 + x) * 4; img.data[o] = img.data[o + 1] = img.data[o + 2] = 255; img.data[o + 3] = Math.round(a * 200);
    }
    g.putImageData(img, 0, 0);
  }
  {
    const NW = 6, cen = [], cor = [], prm = [], col4 = [], ix = [];
    for (let i = 0; i < NW; i++) {
      const inGap = i < 4;
      const w = 24 + R() * 24, x0 = inGap ? M[0].X(29.5) + R() * 40 : -40 + R() * 70, y = FOG_TOP - 1 + R() * 3.2;
      const z = inGap ? -6 - R() * 40 : M[0].zFront(0) + 3 + R() * 6, v = (0.25 + R() * 0.35) * (R() < 0.5 ? -1 : 1), span = inGap ? 46 : 80;
      const c = col(i % 3 ? 0x6b73a6 : 0x8a7fa8), a = 0.32 + R() * 0.2;
      [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]].forEach(([cx, cy]) => {
        cen.push(x0, y, z); cor.push(cx * w, cy * w * 0.32); prm.push(v, span, cx + 0.5, cy + 0.5); col4.push(c.r, c.g, c.b, a);
      });
      const q = i * 4; ix.push(q, q + 1, q + 2, q, q + 2, q + 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(cen, 3));
    g.setAttribute("aCorner", new THREE.Float32BufferAttribute(cor, 2));
    g.setAttribute("aPrm", new THREE.Float32BufferAttribute(prm, 4));
    g.setAttribute("aCol", new THREE.Float32BufferAttribute(col4, 4));
    g.setIndex(ix);
    const mat = new THREE.ShaderMaterial({
      uniforms: { uTime: uniforms.uTime, uMap: { value: new THREE.CanvasTexture(wc) } },
      transparent: true, depthWrite: false,
      vertexShader: `uniform float uTime; attribute vec2 aCorner; attribute vec4 aPrm; attribute vec4 aCol; varying vec2 vUv; varying vec4 vC;
        void main(){
          vec3 c = position; float lo = c.x - aPrm.y * 0.5;
          c.x = lo + mod(c.x + aPrm.x * uTime - lo, aPrm.y);
          c.y += sin(uTime * 0.2 + position.x) * 0.4;
          vec4 mv = modelViewMatrix * vec4(c, 1.0);
          mv.xy += aCorner;
          gl_Position = projectionMatrix * mv; vUv = aPrm.zw; vC = aCol;
        }`,
      fragmentShader: `uniform sampler2D uMap; varying vec2 vUv; varying vec4 vC;
        void main(){ gl_FragColor = vec4(vC.rgb, vC.a * texture2D(uMap, vUv).a);
        #include <colorspace_fragment>
        }`,
    });
    const wm = new THREE.Mesh(g, mat);
    wm.frustumCulled = false;
    wm.renderOrder = 6;
    root.add(wm);
  }

  /* --------------------------------------------------------- signposts -- */
  // All posts are one mesh, all boards share one canvas atlas (the accent 29 board is its own
  // mesh, untouched by tone mapping). They rise in during the opening beat in the vertex shader.
  const SIGNS = [];
  const F = M[0];
  [[22.2, [["RB", 92]], false, 0.95], [24, [["24", 112]], false, 0.95], [26, [["26", 112]], false, 0.95],
    [28, [["28", 112]], false, 0.95], [F.slow - 0.12, [[String(F.slow), 118]], true, 1.15]].forEach(([a, lines, hot, sc]) => SIGNS.push({ m: F, a, lines, hot, sc, dz: 0.72 }));
  M.slice(1).forEach((m) => {
    const range = m.fast === m.slow ? String(m.slow) : m.fast + " to " + m.slow;
    SIGNS.push({ m, a: m.lip - 0.4, lines: [[CODE[m.g] || m.g, 70], [range, 70]], hot: false, sc: 1.1 * (CAM_Z - m.z) / CAM_Z, dz: 0.72 });
  });
  const atlas = document.createElement("canvas"); atlas.width = 1024; atlas.height = 512;
  const DISP = '"Bricolage Grotesque", "Segoe UI", sans-serif', TXT = '"Schibsted Grotesk", "Segoe UI", sans-serif';
  function paintSigns() {
    const g = atlas.getContext("2d");
    g.clearRect(0, 0, 1024, 512);
    SIGNS.forEach((sg, i) => {
      const ox = (i % 4) * 256, oy = Math.floor(i / 4) * 256, H = sg.lines.length > 1 ? 256 : 192;
      g.save(); g.translate(ox, oy);
      g.fillStyle = sg.hot ? "#" + accent.getHexString() : "#f2ede4";
      g.beginPath(); if (g.roundRect) g.roundRect(6, 6, 244, H - 12, 30); else g.rect(6, 6, 244, H - 12); g.fill();
      g.fillStyle = sg.hot ? "#2b0e04" : "#10142a";
      const gap = H / (sg.lines.length + 1);
      sg.lines.forEach(([text, px], k) => {
        const y = gap * (k + 1) + px * 0.36;
        if (text.includes(" to ")) {   // "30 to 31": the "to" small between the ages
          const [p1, p2] = text.split(" to ");
          g.font = `700 ${px}px ${DISP}`;
          const w1 = g.measureText(p1).width, w2 = g.measureText(p2).width;
          g.font = `600 ${Math.round(px * 0.42)}px ${TXT}`;
          const wt = g.measureText("to").width;
          let x = 128 - (w1 + w2 + wt + 20) / 2;
          g.textAlign = "left";
          g.font = `700 ${px}px ${DISP}`; g.fillText(p1, x, y); x += w1 + 10;
          g.font = `600 ${Math.round(px * 0.42)}px ${TXT}`; g.globalAlpha = 0.7; g.fillText("to", x, y - px * 0.04); g.globalAlpha = 1; x += wt + 10;
          g.font = `700 ${px}px ${DISP}`; g.fillText(p2, x, y);
        } else {
          g.textAlign = "center"; g.font = `700 ${px}px ${DISP}`; g.fillText(text, 128, y);
        }
      });
      g.restore();
    });
    g.fillStyle = "#2a3058"; g.fillRect(3 * 256 + 8, 256 + 8, 240, 240);      // post swatch in the free cell
  }
  paintSigns();
  const atlasTex = new THREE.CanvasTexture(atlas);
  atlasTex.colorSpace = THREE.SRGBColorSpace;
  atlasTex.anisotropy = 4;
  if (document.fonts && document.fonts.load) {
    Promise.all(['700 104px "Bricolage Grotesque"', '600 25px "Schibsted Grotesk"'].map((f) => document.fonts.load(f).catch(() => null)))
      .then(() => { paintSigns(); atlasTex.needsUpdate = true; });
  }
  const POP = { value: 0 };
  function signMat() {
    // unlit: road-sign faces stay crisp at dusk and the 29 keeps the true accent; the fog still applies
    const mat = patch(new THREE.MeshBasicMaterial({ map: atlasTex, transparent: true, toneMapped: false }), "plain");
    const inner = mat.onBeforeCompile;
    mat.onBeforeCompile = (sh) => {
      inner(sh);
      sh.uniforms.uPop = POP;
      sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nuniform float uPop; attribute vec2 aPop;")
        .replace("#include <begin_vertex>", `#include <begin_vertex>
          float pk = clamp((uPop - aPop.y) / 0.7, 0.0, 1.0);
          float qk = 1.0 - pk; pk = 1.0 - 2.9 * qk * qk * qk + 1.9 * qk * qk;
          transformed.y = aPop.x + (transformed.y - aPop.x) * max(pk, 0.001);`);
    };
    mat.customProgramCacheKey = () => "cliff-sign";
    return mat;
  }
  {
    const G = [[], [], [], []];   // pos, uv, pop, index: posts and boards in one mesh
    const quad = (G, corners, uvs, pop) => {
      const b = G[0].length / 3;
      corners.forEach((c, k) => { G[0].push(c.x, c.y, c.z); G[1].push(uvs[k][0], uvs[k][1]); G[2].push(pop[0], pop[1]); });
      G[3].push(b, b + 1, b + 2, b, b + 2, b + 3);
    };
    const right = new THREE.Vector3(), fwd = new THREE.Vector3();
    SIGNS.forEach((sg, i) => {
      const { m, a, sc } = sg;
      const x = m.X(a) - 0.15, z = m.trailZ(a) + sg.dz, y = m.height(a) - 0.1;
      const yaw = Math.atan2(CAM_X - x, CAM_Z - z) * 0.9;
      right.set(Math.cos(yaw), 0, -Math.sin(yaw)); fwd.set(Math.sin(yaw), 0, Math.cos(yaw));
      const pop = [y, 1.1 + i * 0.22];
      const P = (dx, dy, dz) => new THREE.Vector3(x, y + dy, z).addScaledVector(right, dx).addScaledVector(fwd, dz);
      // post: a thin box, four sides
      const hw = 0.08 * sc, ph = 2.15 * sc;
      [[[-hw, hw], [hw, hw]], [[hw, hw], [hw, -hw]], [[hw, -hw], [-hw, -hw]], [[-hw, -hw], [-hw, hw]]].forEach(([p0, p1]) =>
        quad(G, [P(p0[0], 0, p0[1]), P(p1[0], 0, p1[1]), P(p1[0], ph, p1[1]), P(p0[0], ph, p0[1])], [[0.87, 0.25], [0.88, 0.25], [0.88, 0.26], [0.87, 0.26]], pop));
      // board
      const tall = sg.lines.length > 1, bw = 1.7 * sc, bh = 1.7 * sc * (tall ? 1 : 0.75);
      const u0 = (i % 4) / 4, u1 = u0 + 0.25, v1 = 1 - Math.floor(i / 4) / 2, v0 = v1 - (tall ? 0.5 : 0.375);
      const by = ph - 0.1 * sc;
      quad(G, [P(-bw / 2, by, hw + 0.02), P(bw / 2, by, hw + 0.02), P(bw / 2, by + bh, hw + 0.02), P(-bw / 2, by + bh, hw + 0.02)],
        [[u0, v0], [u1, v0], [u1, v1], [u0, v1]], pop);
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(G[0], 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(G[1], 2));
    g.setAttribute("aPop", new THREE.Float32BufferAttribute(G[2], 2));
    g.setIndex(G[3]);
    const mesh = new THREE.Mesh(g, signMat());
    mesh.frustumCulled = false;
    root.add(mesh);
  }

  /* ------------------------------------------------- loose rocks at the lip -- */
  const ROCKS = 14;
  const rockGeo = new THREE.IcosahedronGeometry(0.42, 0);
  const rockMat = patch(new THREE.MeshLambertMaterial({ color: 0x5a6194, flatShading: true }), "plain");
  const rocks = new THREE.InstancedMesh(rockGeo, rockMat, ROCKS);
  rocks.frustumCulled = false;
  root.add(rocks);
  const rockS = [];
  for (let i = 0; i < ROCKS; i++) {
    const m = i < 9 ? M[0] : M[1 + (i % (M.length - 1))];
    const xx = m.X(m.lip) - 0.2 - R() * 0.6;
    const zz = m.zFront(xx) - 0.3 - R() * 3.2;
    rockS.push({ m, home: new THREE.Vector3(xx, m.height(m.lip - 0.1) + 0.12, zz), p: new THREE.Vector3(), v: new THREE.Vector3(),
      rot: new THREE.Euler(R() * 6, R() * 6, R() * 6), spin: new THREE.Vector3(), s: 0.45 + R() * 0.65, state: "rest", k: 1, timer: 0 });
  }
  function dropRocks(m, zNear, n) {
    let c = 0;
    for (const r of rockS) {
      if (c >= n) break;
      if (r.m !== m || r.state !== "rest") continue;
      if (zNear != null && Math.abs(r.home.z - zNear) > 3.5 && c > 0) continue;
      r.state = "fall"; r.p.copy(r.home); r.v.set(1.5 + R() * 2, 1 + R() * 1.5, (R() - 0.5) * 1.5);
      r.spin.set((R() - 0.5) * 6, (R() - 0.5) * 6, (R() - 0.5) * 6);
      c++;
    }
  }

  /* --------------------------------------------------------------- runners -- */
  const MAXR = 22;
  const LIMBS = 8, PARTS = 11;           // per runner: 8 limbs, torso, shorts, head: one instanced mesh
  function instanced(geo, color, count) {
    const aA = new THREE.InstancedBufferAttribute(new Float32Array(count).fill(0), 1);
    geo.setAttribute("aAlpha", aA);
    const mat = patch(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.55, metalness: 0, transparent: true, envMapIntensity: 0.9, flatShading: true }), "inst");
    const im = new THREE.InstancedMesh(geo, mat, count);
    const c0 = new THREE.Color(color);
    for (let i = 0; i < count; i++) im.setColorAt(i, c0);
    im.userData.base = c0;
    im.frustumCulled = false;
    im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    root.add(im);
    return { im, aA };
  }
  const limbGeo = new THREE.CylinderGeometry(1, 0.78, 1, 6, 1); limbGeo.translate(0, -0.5, 0);
  const IL = instanced(limbGeo, C.runner, MAXR * PARTS);
  const shortsC = new THREE.Color(C.shorts);
  const TORSO = new THREE.Matrix4().makeTranslation(0, 0.66, 0).multiply(new THREE.Matrix4().makeScale(0.24, 0.66, 0.19));
  const SHORTS = new THREE.Matrix4().makeTranslation(0, 0.13, 0).multiply(new THREE.Matrix4().makeScale(0.2, 0.24, 0.2));
  // blob contact shadows
  const sc = document.createElement("canvas"); sc.width = sc.height = 64;
  { const g = sc.getContext("2d"); const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, "rgba(0,0,0,0.62)"); gr.addColorStop(1, "rgba(0,0,0,0)"); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); }
  const shGeo = new THREE.PlaneGeometry(1, 1); shGeo.rotateX(-Math.PI / 2);
  const shA = new THREE.InstancedBufferAttribute(new Float32Array(MAXR).fill(0), 1);
  shGeo.setAttribute("aAlpha", shA);
  const shMat = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(sc), transparent: true, depthWrite: false, color: 0x05060d });
  shMat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nattribute float aAlpha; varying float vA;").replace("#include <uv_vertex>", "#include <uv_vertex>\nvA = aAlpha;");
    sh.fragmentShader = sh.fragmentShader.replace("#include <common>", "#include <common>\nvarying float vA;").replace("#include <map_fragment>", "#include <map_fragment>\ndiffuseColor.a *= vA;");
  };
  const shadows = new THREE.InstancedMesh(shGeo, shMat, MAXR);
  shadows.frustumCulled = false;
  shadows.renderOrder = 1;
  root.add(shadows);

  const tint = new THREE.Color();
  const tmpM = new THREE.Matrix4(), q = new THREE.Quaternion(), v3 = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);

  const runners = [];
  // runners start where they come into view: just off the left edge on the front trail, just behind
  // the front cliff on the others (birthdays they skipped are rolled at spawn, so the thinning stays true)
  const lanes = M.map((m, j) => ({ m, every: j === 0 ? 1.45 : 2.5 + j * 0.35, next: 0, start: j === 0 ? 20.4 : 28.4 }));
  function spawn(lane, a) {
    for (let b = lane.m.peak + 1; b <= Math.floor(a); b++) if (R() > Math.min(1, lane.m.nAt(b) / Math.max(1e-6, lane.m.nAt(b - 1)))) return;
    let r = runners.find((x) => x.state === "off");
    if (!r) { if (runners.length >= MAXR) return; r = { i: runners.length }; runners.push(r); }
    r.lane = lane; r.m = lane.m; r.a = a; r.speed = (lane.m.j === 0 ? 0.92 : 0.8) * (0.93 + R() * 0.14);
    r.phase = R() * 6.28; r.state = "run"; r.alpha = 1; r.nextB = Math.floor(a) + 1; r.fy = 0; r.vy = 0; r.fx = 0; r.tumble = 0;
    r.size = lane.m.j === 0 ? 1 : 1.25; r.recolor = true;
  }
  // a full trail at t = 0, so the opening frame is already alive
  lanes.forEach((ln) => {
    for (let a = ln.start; a < ln.m.lip - 0.6; a += ln.every * 0.9 * (0.85 + R() * 0.3)) spawn(ln, a);
    ln.next = ln.every * R();
  });
  function stepRunner(r, dt) {
    const m = r.m;
    if (r.state === "run" || r.state === "fade") {
      r.a += r.speed * dt * (r.state === "fade" ? 0.6 : 1);
      r.phase += dt * 7.6 * (r.state === "fade" ? 0.7 : 1);
      if (r.state === "fade") { r.a = Math.min(r.a, m.lip - 0.25); r.alpha -= dt * 0.75; if (r.alpha <= 0) r.state = "off"; return; }
      if (r.a >= r.nextB) {
        const b = r.nextB; r.nextB++;
        if (b > m.peak && b <= m.slow) {
          const keep = Math.min(1, m.nAt(b) / Math.max(1e-6, m.nAt(b - 1)));
          if (R() > keep) { r.state = "fade"; return; }
        }
      }
      if (r.a >= m.lip - 0.02) {
        r.state = "fall"; r.fz = m.trailZ(r.a); r.fx = m.X(r.a); r.fy = m.height(m.lip - 0.05); r.vy = 3.4; r.vx = r.speed * AX * 1.05; r.tumble = 0;
        dropRocks(m, m.trailZ(r.a), m.j === 0 ? 3 : 1);
      }
    } else if (r.state === "fall") {
      r.vy -= 17 * dt; r.fy += r.vy * dt; r.fx += r.vx * dt; r.vx *= 1 - dt * 0.6;
      r.tumble += dt * 1.7; r.phase += dt * 3;
      if (r.fy < FOG_TOP - 16) r.state = "off";
    }
  }
  // Every joint turns about z (the runner runs in the x-y plane), so the instance matrices are
  // written straight from 2D angles: no Object3D rig, no matrix multiplies.
  const LA = IL.im.instanceMatrix.array;
  function put(arr, i, x, y, z, ang, sx, sy, sz) {
    const c = Math.cos(ang), n = Math.sin(ang), o = i * 16;
    arr[o] = c * sx; arr[o + 1] = n * sx; arr[o + 2] = 0; arr[o + 3] = 0;
    arr[o + 4] = -n * sy; arr[o + 5] = c * sy; arr[o + 6] = 0; arr[o + 7] = 0;
    arr[o + 8] = 0; arr[o + 9] = 0; arr[o + 10] = sz; arr[o + 11] = 0;
    arr[o + 12] = x; arr[o + 13] = y; arr[o + 14] = z; arr[o + 15] = 1;
  }
  let colorsDirty = false;
  function poseRunner(r) {
    const m = r.m, ph = r.phase;
    let px, py, pz = m.trailZ(r.a), R, lean, bob = 0, ground = true;
    let tl, tr, sl, sr, al, ar, fl, fr;
    if (r.state === "fall") {
      px = r.fx; py = r.fy; ground = false; pz = r.fz;
      R = -Math.min(1.9, r.tumble * 0.9); lean = 0.1;
      tl = 0.6 + 0.3 * Math.sin(ph); tr = -0.5 - 0.3 * Math.sin(ph); sl = -0.9; sr = -0.4;
      al = 2.5 + 0.2 * Math.sin(ph * 1.3); ar = -2.4 - 0.2 * Math.cos(ph * 1.2); fl = 0.4; fr = 0.3;
    } else {
      px = m.X(r.a); py = m.height(r.a);
      R = Math.atan2(m.height(r.a + 0.15) - py, 0.15 * AX) * 0.5; lean = -0.2;
      bob = 0.07 * Math.abs(Math.cos(ph));
      tl = 0.78 * Math.sin(ph) + 0.12; tr = -0.78 * Math.sin(ph) + 0.12;
      sl = -0.25 - 1.15 * Math.max(0, Math.sin(ph - 1.6)); sr = -0.25 - 1.15 * Math.max(0, Math.sin(ph + Math.PI - 1.6));
      al = -0.75 * Math.sin(ph); ar = 0.75 * Math.sin(ph); fl = 1.45; fr = 1.45;
    }
    const s = r.size * 1.05;
    const hx = px, hy = py + (ground ? (1.0 + bob) * s : 0);
    const T = R + lean;                                   // torso angle
    const cT = Math.cos(T), sT = Math.sin(T);
    const up = (len) => [hx - sT * len * s, hy + cT * len * s];   // a point up the torso
    const b = r.i * PARTS;
    // legs: thigh from the hip, shin from the knee
    const leg = (k, zo, a1, a2) => {
      const A = R + a1;
      put(LA, b + k, hx, hy, pz + zo * s, A, 0.1 * s, 0.5 * s, 0.1 * s);
      const kx = hx + Math.sin(A) * 0.5 * s, ky = hy - Math.cos(A) * 0.5 * s;
      put(LA, b + k + 2, kx, ky, pz + zo * s, A + a2, 0.075 * s, 0.5 * s, 0.075 * s);
    };
    leg(0, 0.12, tl, sl); leg(1, -0.12, tr, sr);
    // arms: from the shoulder, forearm from the elbow
    const [shx, shy] = up(0.6);
    const arm = (k, zo, a1, a2) => {
      const A = T + a1;
      put(LA, b + k, shx, shy, pz + zo * s, A, 0.065 * s, 0.32 * s, 0.065 * s);
      const ex = shx + Math.sin(A) * 0.32 * s, ey = shy - Math.cos(A) * 0.32 * s;
      put(LA, b + k + 2, ex, ey, pz + zo * s, A + a2, 0.055 * s, 0.3 * s, 0.055 * s);
    };
    arm(4, 0.27, al, fl); arm(5, -0.27, ar, fr);
    // torso (the limb shape upside down: wide at the shoulders), shorts, head
    const [tx, ty] = up(0.66);
    put(LA, b + 8, tx, ty, pz, T, 0.24 * s, 0.66 * s, 0.19 * s);
    put(LA, b + 9, hx - Math.sin(R) * 0.13 * s, hy + Math.cos(R) * 0.13 * s, pz, R, 0.2 * s, 0.24 * s, 0.2 * s);
    const hdx = hx - sT * 0.85 * s + cT * 0.02 * s, hdy = hy + cT * 0.85 * s + sT * 0.02 * s;
    put(LA, b + 10, hdx, hdy + 0.16 * s, pz, T, 0.15 * s, 0.32 * s, 0.15 * s);
    const al_ = r.alpha;
    for (let k = 0; k < PARTS; k++) IL.aA.setX(b + k, al_);
    // colour: set on spawn, then only while he falls (he warms toward the accent)
    if (r.state === "fall" || r.recolor) {
      const warm = r.state === "fall" ? Math.min(1, r.tumble * 1.4) : 0;
      tint.copy(IL.im.userData.base).lerp(accent, warm * 0.8);
      for (let k = 0; k < 9; k++) IL.im.setColorAt(b + k, tint);
      IL.im.setColorAt(b + 9, shortsC);
      IL.im.setColorAt(b + 10, tint);
      r.recolor = false; colorsDirty = true;
    }
    // contact shadow
    if (ground) {
      const w = 1.25 * s;
      tmpM.compose(v3.set(px + 0.25, py + 0.07, pz), q.identity(), one.set(w * 1.5, 1, w));
      shadows.setMatrixAt(r.i, tmpM); shA.setX(r.i, al_ * (0.9 - bob * 2));
    } else shA.setX(r.i, 0);
    r.hidden = false;
  }
  function hide(i) {
    for (let k = 0; k < PARTS; k++) IL.aA.setX(i * PARTS + k, 0);
    shA.setX(i, 0);
    tmpM.makeScale(0, 0, 0);
    for (let k = 0; k < PARTS; k++) IL.im.setMatrixAt(i * PARTS + k, tmpM);
    shadows.setMatrixAt(i, tmpM);
  }
  for (let i = 0; i < MAXR; i++) hide(i);

  /* ------------------------------------------------------------ simulate -- */
  const rq = new THREE.Quaternion();
  function sim(dt) {
    lanes.forEach((ln) => { ln.next -= dt; if (ln.next <= 0) { spawn(ln, ln.start + R() * 0.4); ln.next += ln.every * (0.8 + R() * 0.4); } });
    for (const r of runners) if (r.state !== "off") stepRunner(r, dt);
    for (const r of rockS) {
      if (r.state === "fall") {
        r.v.y -= 22 * dt; r.p.addScaledVector(r.v, dt);
        r.rot.x += r.spin.x * dt; r.rot.y += r.spin.y * dt; r.rot.z += r.spin.z * dt;
        if (r.p.y < FOG_TOP - 14) { r.state = "regrow"; r.k = 0; r.timer = 1.5 + R() * 2; }
      } else if (r.state === "regrow") {
        r.timer -= dt; if (r.timer <= 0) { r.k = Math.min(1, r.k + dt * 0.8); if (r.k >= 1) r.state = "rest"; }
      }
    }
  }
  function draw(t) {
    for (const r of runners) { if (r.state !== "off") poseRunner(r); else if (!r.hidden) { hide(r.i); r.hidden = true; } }
    rockS.forEach((r, i) => {
      if (r.state === "rest" && r.drawn) return;
      r.drawn = r.state === "rest";
      const p = r.state === "fall" ? r.p : r.home;
      const k = r.state === "regrow" ? (r.timer > 0 ? 0 : smooth(r.k)) : 1;
      rq.setFromEuler(r.rot);
      tmpM.compose(p, rq, one.set(r.s * k, r.s * 0.7 * k, r.s * k));
      rocks.setMatrixAt(i, tmpM);
    });
    rocks.instanceMatrix.needsUpdate = true;
    const span = runners.length * PARTS;
    for (const I of [IL]) {
      I.im.instanceMatrix.clearUpdateRanges(); I.im.instanceMatrix.addUpdateRange(0, span * 16); I.im.instanceMatrix.needsUpdate = true;
      I.aA.clearUpdateRanges(); I.aA.addUpdateRange(0, span); I.aA.needsUpdate = true;
      if (colorsDirty && I.im.instanceColor) I.im.instanceColor.needsUpdate = true;
    }
    colorsDirty = false;
    shadows.instanceMatrix.needsUpdate = true; shA.needsUpdate = true;
    // signposts rise in during the opening beat
    POP.value = freeze != null ? 99 : t;
    sheets.forEach((s) => { s.t.offset.x = (t * s.speed * s.dir) % 1; s.t.offset.y = (t * s.speed * 0.4) % 1; });
  }

  /* --------------------------------------------- renderer-dependent setup -- */
  let renderer = null, envDone = false;
  scene.onBeforeRender = (r) => {
    if (!renderer) {
      renderer = r;
      r.toneMapping = THREE.ACESFilmicToneMapping;
      r.toneMappingExposure = 1.18;
    }
  };
  function setupEnv() {
    envDone = true;
    try {
      const pm = new THREE.PMREMGenerator(renderer);
      scene.environment = pm.fromScene(roomEnvironment(THREE), 0.04).texture;
      pm.dispose();
    } catch (e) { /* no environment: lights alone still read */ }
    root.visible = true;
  }

  /* --------------------------------------------------------------- camera -- */
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  // Framing is anchored on the cliff edge: each frame the camera turns so the 29 lip lands at
  // (xs, ys) of the frame. Scrolling slides that point down as the hero leaves the viewport, while
  // the camera climbs and dollies along the trail toward the edge.
  const POSE = {
    wide: { pos: V(CAM_X, -13, CAM_Z), fov: 16, xs: 0.72, ys: 0.31,
      from: V(CAM_X - 8, -17, CAM_Z + 45), fromFov: 14, fromYs: 0.36,
      near: V(17, 4, 70), nearFov: 23, nearXs: 0.6, nearYs: 0.8 },
    narrow: { pos: V(15, -10, 88), fov: 40, xs: 0.68, ys: 0.29,
      from: V(11, -14, 120), fromFov: 36, fromYs: 0.34,
      near: V(19, 4, 56), nearFov: 50, nearXs: 0.58, nearYs: 0.62 },
  };
  // stills (posters, share card) may re-frame: opts.xs / opts.ys move the edge, opts.dist scales the camera distance
  for (const k of ["wide", "narrow"]) {
    if (typeof opts.xs === "number") POSE[k].xs = opts.xs;
    if (typeof opts.ys === "number") POSE[k].ys = opts.ys;
    if (typeof opts.dist === "number") POSE[k].pos.z *= opts.dist;
  }
  const E = V(M[0].X(M[0].lip) - 0.2, M[0].height(M[0].lip - 0.1), M[0].zFront(M[0].X(M[0].lip)) - 1);
  const P = new THREE.Vector3(), L = new THREE.Vector3(), D = new THREE.Vector3();
  let simT = 0, frozenDone = false;

  return {
    caption: "The trail is the real running back aging curve. It peaks at 24 and ends at 29.",
    update(t, dt) {
      if (renderer && !envDone) setupEnv();
      if (freeze != null) {
        if (!frozenDone && envDone) {
          frozenDone = true;
          const h = 1 / 30;
          for (let k = 0; k < Math.round(freeze / h); k++) { simT += h; sim(h); }
          uniforms.uTime.value = freeze;
          draw(freeze);
        }
        uniforms.uTime.value = freeze;
        return;
      }
      simT += dt;
      sim(dt);
      draw(t);
    },
    camera: {
      pos: POSE.wide.pos, look: E, fov: [16, 44], far: 600,
      move(camera, s) {
        const pz = camera.aspect < 1.2 ? POSE.narrow : POSE.wide;
        const t = freeze != null ? 99 : s.t;
        const intro = easeIO((t - 0.1) / 3.8);
        const k = easeIO(Math.min(1, s.scroll / 0.62));
        P.copy(pz.from).lerp(pz.pos, intro).lerp(pz.near, k);
        let fov = pz.fromFov + (pz.fov - pz.fromFov) * intro;
        fov += (pz.nearFov - fov) * k;
        let ys = pz.fromYs + (pz.ys - pz.fromYs) * intro;
        ys += (pz.nearYs - ys) * Math.min(1, s.scroll / 0.62);
        const xs = pz.xs + (pz.nearXs - pz.xs) * k;
        if (freeze == null) {
          P.x += Math.sin(t * 0.06) * 1.4 + s.mx * 3.5;
          P.y += -s.my * 1.4 + Math.sin(t * 0.09) * 0.45;
        }
        if (Math.abs(camera.fov - fov) > 0.005) { camera.fov = fov; camera.updateProjectionMatrix(); }
        // aim so the edge E sits at (xs, ys) of the frame
        D.subVectors(E, P);
        const tanV = Math.tan((fov * Math.PI) / 360), tanH = tanV * camera.aspect;
        const yaw = Math.atan2(D.x, -D.z) - Math.atan((xs - 0.5) * 2 * tanH);
        const pitch = Math.atan2(D.y, Math.hypot(D.x, D.z)) + Math.atan((ys - 0.5) * 2 * tanV);
        L.set(P.x + Math.sin(yaw) * Math.cos(pitch), P.y + Math.sin(pitch), P.z - Math.cos(yaw) * Math.cos(pitch));
        camera.position.copy(P);
        camera.lookAt(L);
        sky.position.copy(P);
        shadows.visible = P.y > M[0].height(26) - 1;   // contact shadows only matter once the camera sees the trail top
      },
    },
  };
}
