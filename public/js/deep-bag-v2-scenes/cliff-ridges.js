/* EBK Deep Bag v2 hero scene "cliff-ridges" (scene API 2, docs/deep-bag-v2.md).
   Study: the-cliff. Ported from the study's outputs/web/the-cliff-v2.js (initHero);
   the drawing is unchanged, the gating, budget, loop and camera plumbing now live
   in deep-bag-v2-scene.js.

   The career-model aging curves as dotted ridgelines, one per position group
   (data-scene-data JSON: { rows: [{ pts: [[age, sd below peak]], n: [[age, players]],
   emph }], xmin, xmax, cap, threshold }), above a shimmering waterline at the cliff
   threshold. Players flow along the ridges and drop off as the real sample thins;
   anything below the waterline takes the accent. */
export default function cliffRidges(ctx) {
  const { THREE, scene, uniforms, data } = ctx;
  if (!data || !Array.isArray(data.rows) || data.rows.length < 2) return null;
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
  function spawn(p) {
    p.j = Math.floor(Math.random() * nz);
    const r = rows[p.j];
    p.a = r.pts[0][0] + Math.random() * 3; p.speed = 1.5 + Math.random() * 1.0;
    p.state = "run"; p.vy = 0; p.y = 0; p.fade = 1; p.next = Math.floor(p.a) + 1; p.wait = 0;
  }
  for (let i = 0; i < NP; i++) { const p = {}; spawn(p); p.a += Math.random() * 10; p.next = Math.floor(p.a) + 1; P.push(p); }

  function update(t, dt) {
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
        p.wait -= dt; if (p.wait <= 0) spawn(p);
      }
    });
    pa.needsUpdate = true; on.needsUpdate = true; fall.needsUpdate = true;
  }

  return {
    update,
    camera: {
      pos: new THREE.Vector3(0, 14, 50), look: new THREE.Vector3(3, -5, -22), fov: [36, 50], far: 400,
      drift: { sway: 5, swaySpeed: 0.05, mouseX: 6, mouseY: 3, scrollY: 8, scrollZ: 6, lookMouse: 2, lookScroll: 5 },
    },
  };
}
