/* EBK Deep Bag v2 hero scene "arena-bowl" (scene API 2, docs/deep-bag-v2.md).
   Study: home-field-advantage ("Home Court Is Shrinking. Denver Still Has One.").

   A basketball arena seen from high above one baseline, drawn as dots: the court in
   lines, the bowl in rows of seats. Every seat holds a fan (a bright dot) or sits empty
   (a faint one). The crowd roars (a ring of noise spreads from centre court, lifting the
   seats it passes), then thins out until only the bowl is left, then slowly fills again.
   The 2020-21 season in one loop. Nothing here is data; it only evokes the subject.

   opts { crowd:  peak fraction of seats filled (default 1),
          cycle:  seconds for one loop (default 22),
          layout: "wide" | "tall" (default by aspect; tall pushes the bowl up the frame),
          freeze: { t, crowd }  render one moment with no clock (stills for the static fallback) }

   Rendering notes: one Points draw for the bowl and the court, additive, no shadows, no
   textures. The crowd fade is a per-seat threshold against one uniform, so a loop costs
   the GPU nothing extra; the update() only moves a few numbers. */

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

// court, in metres: 28.65 x 15.24 (94 x 50 ft); hoops 1.575 m in from each baseline
const CL = 14.325, CW = 7.62, HOOP_X = CL - 1.575;

export default function build(ctx, opts) {
  const { THREE, scene, accent, uniforms } = ctx;
  const R = rng(51);
  const pos = [], kind = [], thr = [], seed = [], lit = [];
  const push = (x, y, z, k, h, b) => { pos.push(x, y, z); kind.push(k); thr.push(h); seed.push(R()); lit.push(b); };

  /* ---- the bowl: rows of seats on a stretched ring, rising as they go out ---- */
  const ROWS = 27, A0 = 20.5, B0 = 13.2, DR = 0.98, DY = 0.84;
  for (let r = 0; r < ROWS; r++) {
    const A = A0 + r * DR, B = B0 + r * DR;
    const y = 1.0 + r * DY + (r > 13 ? 1.6 : 0);                  // a little concourse gap halfway up
    const per = TAU * Math.sqrt((A * A + B * B) / 2);
    const n = Math.floor(per / 0.92);
    const rowN = r / (ROWS - 1);
    for (let i = 0; i < n; i++) {
      const th = ((i + (r % 2) * 0.5) / n) * TAU;
      const aisle = Math.abs(((th / (TAU / 16)) % 1 + 1) % 1 - 0.5) > 0.465;   // 16 stairways
      if (aisle) continue;
      const x = Math.cos(th) * A, z = Math.sin(th) * B;
      // who leaves first: the top rows and a lot of chance; courtside stays longest
      const h = cl(0.08 + rowN * 0.42 + R() * 0.5, 0, 0.995);
      push(x + (R() - 0.5) * 0.22, y, z + (R() - 0.5) * 0.22, 0, h, 0);
    }
  }
  const nSeats = pos.length / 3;

  /* ---- the court: lines drawn as dense rows of dots ---- */
  const line = (x0, z0, x1, z1, b, k = 1) => {
    const len = Math.hypot(x1 - x0, z1 - z0), n = Math.max(2, Math.round(len / 0.34));
    for (let i = 0; i <= n; i++) push(x0 + ((x1 - x0) * i) / n, 0.05, z0 + ((z1 - z0) * i) / n, k, 0, b);
  };
  const arc = (cx, cz, r, a0, a1, b, k = 1, y = 0.05) => {
    const n = Math.max(6, Math.round((Math.abs(a1 - a0) * r) / 0.34));
    for (let i = 0; i <= n; i++) { const a = a0 + ((a1 - a0) * i) / n; push(cx + Math.cos(a) * r, y, cz + Math.sin(a) * r, k, 0, b); }
  };
  line(-CL, -CW, CL, -CW, 1); line(-CL, CW, CL, CW, 1); line(-CL, -CW, -CL, CW, 1); line(CL, -CW, CL, CW, 1);
  line(0, -CW, 0, CW, 0.9);
  arc(0, 0, 1.83, 0, TAU, 1.35, 2);                                 // centre circle, the accent
  for (const s of [-1, 1]) {
    const fx = s * (CL - 5.8);
    line(s * CL, -2.45, fx, -2.45, 0.95); line(s * CL, 2.45, fx, 2.45, 0.95); line(fx, -2.45, fx, 2.45, 0.95);
    arc(fx, 0, 1.83, 0, TAU, 0.7);
    const hx = s * HOOP_X, zc = Math.sqrt(7.24 * 7.24 - 6.7 * 6.7);
    line(s * CL, -6.7, hx - s * zc, -6.7, 0.9); line(s * CL, 6.7, hx - s * zc, 6.7, 0.9);
    const a = Math.asin(6.7 / 7.24);
    if (s > 0) arc(hx, 0, 7.24, Math.PI - a, Math.PI + a, 0.9); else arc(hx, 0, 7.24, -a, a, 0.9);
    arc(hx, 0, 0.23, 0, TAU, 1.5, 1, 3.05);                         // the hoop, ten feet up
  }
  // a faint floor so the hardwood reads as a surface
  for (let x = -CL + 0.5; x < CL; x += 0.95) for (let z = -CW + 0.5; z < CW; z += 0.95) push(x, 0.02, z, 1, 0, 0.12);

  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("aKind", new THREE.Float32BufferAttribute(kind, 1));
  g.setAttribute("aH", new THREE.Float32BufferAttribute(thr, 1));
  g.setAttribute("aSeed", new THREE.Float32BufferAttribute(seed, 1));
  g.setAttribute("aLit", new THREE.Float32BufferAttribute(lit, 1));

  const ripples = Array.from({ length: 6 }, () => new THREE.Vector4(0, 0, -99, 0));
  uniforms.uRip = { value: ripples };
  uniforms.uCrowd = { value: 1 };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `
      uniform float uTime; uniform float uDpr; uniform float uCrowd; uniform vec4 uRip[6];
      attribute float aKind; attribute float aH; attribute float aSeed; attribute float aLit;
      varying float vA; varying float vAcc; varying float vFan;
      void main() {
        vec3 p = position;
        float fan = 0.0, bump = 0.0, acc = 0.0;
        if (aKind < 0.5) {
          fan = smoothstep(aH, aH + 0.07, uCrowd);
          for (int i = 0; i < 6; i++) {
            vec4 r = uRip[i];
            float age = uTime - r.z;
            if (age > 0.0 && age < 4.2) {
              float d = distance(p.xz * vec2(0.62, 1.0), r.xy);
              float ring = exp(-pow((d - age * 9.0) / 2.1, 2.0)) * (1.0 - age / 4.2) * r.w;
              bump += ring; acc += ring;
            }
          }
          bump *= fan;
          p.y += fan * (0.10 + 0.10 * sin(uTime * 2.4 + aSeed * 40.0)) + bump * 1.4;
        }
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        float dist = -mv.z;
        float far = smoothstep(280.0, 50.0, dist);
        if (aKind < 0.5) {
          gl_PointSize = (2.5 + fan * 1.6 + bump * 3.2) * (82.0 / dist) * uDpr;
          vA = (0.34 + fan * (0.42 + 0.2 * aSeed) + bump * 0.9) * far;
          vAcc = clamp(bump * 1.6, 0.0, 1.0);
        } else {
          float pulse = 0.88 + 0.12 * sin(uTime * 1.3 + aSeed * 6.0);
          gl_PointSize = (1.7 + aLit * 1.3) * (82.0 / dist) * uDpr;
          vA = (0.12 + aLit * 0.55) * pulse * far * (aKind > 1.5 ? 1.15 : 1.0);
          vAcc = aKind > 1.5 ? 1.0 : 0.0;
        }
        vFan = fan;
      }`,
    fragmentShader: `
      uniform vec3 uColor; uniform vec3 uAccent;
      varying float vA; varying float vAcc; varying float vFan;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        if (d > 0.5) discard;
        float a = smoothstep(0.5, 0.06, d) * vA;
        vec3 c = mix(uColor, vec3(0.93, 0.95, 1.0), vFan * 0.35);
        gl_FragColor = vec4(mix(c, uAccent, vAcc), a);
      }`,
  });
  scene.add(new THREE.Points(g, mat));

  /* ---- the loop ---- */
  const peak = cl(opts.crowd == null ? 1 : opts.crowd, 0, 1);
  const CYCLE = opts.cycle || 22;
  const crowdAt = (t) => {
    const p = (t % CYCLE) / CYCLE;
    // full, thins out, an empty building, slowly fills again
    let c = 1;
    if (p < 0.08) c = 1;
    else if (p < 0.5) c = 1 - smooth((p - 0.08) / 0.42);
    else if (p < 0.66) c = 0;
    else if (p < 0.94) c = smooth((p - 0.66) / 0.28);
    return c * peak;
  };
  let ripIdx = 0, nextRip = 0.6;
  const emit = (t, amp) => { ripples[ripIdx].set(0, 0, t, amp); ripIdx = (ripIdx + 1) % ripples.length; };
  const fz = opts.freeze || null;
  if (fz) { // stills: two rings already on their way out
    uniforms.uTime.value = fz.t || 0;
    emit((fz.t || 0) - 0.9, 1);
    emit((fz.t || 0) - 2.3, 0.8);
    uniforms.uCrowd.value = fz.crowd == null ? 0.5 : fz.crowd;
  }

  const tall = opts.layout === "tall";
  return {
    update(t) {
      if (fz) { uniforms.uTime.value = fz.t || 0; return; }
      const c = crowdAt(t);
      uniforms.uCrowd.value = c;
      if (t >= nextRip) {
        if (c > 0.3) emit(t, c * c);
        nextRip = t + 1.7 + (c < 0.7 ? 0.8 : 0);
      }
    },
    camera: {
      pos: new THREE.Vector3(...(opts.cam ? opts.cam.slice(0, 3) : tall ? [0, 62, 64] : [0, 54, 52])),
      look: new THREE.Vector3(...(opts.cam ? opts.cam.slice(3, 6) : tall ? [0, 4, 4] : [0, 6, -9])),
      fov: opts.fov || [42, 56], far: 420,
      drift: { sway: 4, swaySpeed: 0.045, mouseX: 5, mouseY: 3, scrollY: 8, scrollZ: 5, lookMouse: 2, lookScroll: 4 },
    },
  };
}
