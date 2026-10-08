/* EBK Deep Bag v2 hero scene "champagne-bubbles" (scene API 2, docs/deep-bag-v2.md).
   Study: champagne-no-hangover. Ported from the study's outputs/web/champagne-scene.js;
   the drawing is unchanged, the gating, budget, loop and camera plumbing now live in
   deep-bag-v2-scene.js.

   Every champion (data-scene-data JSON: { c: [[league 0-3, season, zThis, zNext, zExp], ...] },
   z in hundredths of a within-season SD of win%) stands as a column of rising bubbles
   on one of four league timelines. A slow wave ("the next season") runs down the
   timelines and each column settles to where that team finished a year later. A
   faint tick marks where regression to the mean said it would land; caps that settle
   above their tick turn to the accent.
   opts { color: "#b4c0ee", from: 1903, to: 2025, bubbles: 20 } */
export default function champagneBubbles(ctx, opts) {
  const { THREE, scene, uniforms, data } = ctx;
  if (!data || !Array.isArray(data.c) || !data.c.length) return null;
  uniforms.uColor.value.set(opts.color || "#b4c0ee");
  uniforms.uWave = { value: -99 };
  uniforms.uHold = { value: 0 };

  /* layout: seasons along x, four league lanes along z */
  const X0 = opts.from || 1903, X1 = opts.to || 2025;
  const SX = 0.44;                               // world units per season (122 seasons ~ 54 units)
  const xOf = s => (s - (X0 + X1) / 2) * SX;
  const LANES = [7.5, 2.5, -2.5, -7.5];           // NFL nearest, then NBA, NHL, MLB at the back
  const HY = 7.4;                                 // world units per standard deviation
  const hOf = z => Math.max(0.12, z / 100) * HY;

  /* floor: a dotted plane, brighter dots along the four lane lines */
  {
    const pos = [], br = [];
    for (let x = -46; x <= 46; x += 0.9) {
      for (let z = -14; z <= 12; z += 0.9) { pos.push(x, 0, z); br.push(0.1); }
      LANES.forEach(z => { pos.push(x, 0, z); br.push(0.5); pos.push(x + 0.45, 0, z); br.push(0.3); });
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("aBright", new THREE.Float32BufferAttribute(br, 1));
    scene.add(new THREE.Points(g, new THREE.ShaderMaterial({
      uniforms, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: `
        uniform float uTime; uniform float uDpr; uniform float uWave;
        attribute float aBright; varying float vA; varying float vW;
        void main() {
          vec3 p = position;
          p.y += sin(p.x * 0.06 + uTime * 0.3) * 0.18 + sin(p.z * 0.2 - uTime * 0.22) * 0.12;
          float w = exp(-pow((p.x - uWave) / 1.8, 2.0));
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          float d = -mv.z;
          gl_PointSize = (1.5 + aBright * 1.6 + w * 1.4) * (62.0 / d) * uDpr;
          vA = (0.16 + aBright * 0.55 + w * 0.5) * smoothstep(120.0, 20.0, d);
          vW = w;
        }`,
      fragmentShader: `
        uniform vec3 uColor; uniform vec3 uAccent; varying float vA; varying float vW;
        void main() {
          float d = length(gl_PointCoord - 0.5); if (d > 0.5) discard;
          gl_FragColor = vec4(mix(uColor, uAccent, vW * 0.6), smoothstep(0.5, 0.05, d) * vA);
        }`,
    })));
  }

  /* champions: bubble columns, caps, expected ticks */
  const B = opts.bubbles || 20;
  const bp = [], bh = [], bph = [], bj = [];
  const cp = [], ch = [], cb = [];
  const tp = [], th = [];
  data.c.forEach(([lg, season, zThis, zNext, zExp]) => {
    const x = xOf(season), z = LANES[lg];
    const hT = hOf(zThis), hN = hOf(zNext), hE = hOf(zExp);
    for (let k = 0; k < B; k++) {
      bp.push(x, 0, z); bh.push(hT, hN); bph.push((k + Math.random() * 0.8) / B);
      bj.push((Math.random() - 0.5) * 0.5, (Math.random() - 0.5) * 0.5);
    }
    cp.push(x, 0, z); ch.push(hT, hN); cb.push(zNext > zExp ? 1 : 0);
    tp.push(x, hE, z); th.push(hT, hN);
  });
  const settleGLSL = `
    uniform float uWave; uniform float uHold;
    float settle(float x) { return clamp((uWave - x) / 3.0, 0.0, 1.0) * uHold; }`;

  const bubbles = new THREE.BufferGeometry();
  bubbles.setAttribute("position", new THREE.Float32BufferAttribute(bp, 3));
  bubbles.setAttribute("aH", new THREE.Float32BufferAttribute(bh, 2));
  bubbles.setAttribute("aPhase", new THREE.Float32BufferAttribute(bph, 1));
  bubbles.setAttribute("aJit", new THREE.Float32BufferAttribute(bj, 2));
  scene.add(new THREE.Points(bubbles, new THREE.ShaderMaterial({
    uniforms, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: settleGLSL + `
      uniform float uTime; uniform float uDpr;
      attribute vec2 aH; attribute float aPhase; attribute vec2 aJit;
      varying float vA;
      void main() {
        float s = settle(position.x);
        float H = mix(aH.x, aH.y, s);
        float k = fract(aPhase + uTime * 0.16);
        vec3 p = position;
        p.y = k * H;
        p.x += aJit.x * (0.25 + 0.5 * k) + sin(uTime * 1.7 + aPhase * 40.0) * 0.04;
        p.z += aJit.y * (0.25 + 0.5 * k);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        float d = -mv.z;
        gl_PointSize = (1.7 + k * 2.2) * (60.0 / d) * uDpr;
        vA = 0.62 * smoothstep(0.0, 0.12, k) * (1.0 - smoothstep(0.82, 1.0, k)) * smoothstep(120.0, 20.0, d);
      }`,
    fragmentShader: `
      uniform vec3 uColor; varying float vA;
      void main() {
        vec2 q = gl_PointCoord - 0.5; float d = length(q); if (d > 0.5) discard;
        float ring = smoothstep(0.5, 0.36, d) * (0.45 + 0.55 * smoothstep(0.18, 0.4, d));
        gl_FragColor = vec4(uColor, ring * vA);
      }`,
  })));

  const caps = new THREE.BufferGeometry();
  caps.setAttribute("position", new THREE.Float32BufferAttribute(cp, 3));
  caps.setAttribute("aH", new THREE.Float32BufferAttribute(ch, 2));
  caps.setAttribute("aBeat", new THREE.Float32BufferAttribute(cb, 1));
  scene.add(new THREE.Points(caps, new THREE.ShaderMaterial({
    uniforms, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: settleGLSL + `
      uniform float uTime; uniform float uDpr;
      attribute vec2 aH; attribute float aBeat;
      varying float vA; varying float vAcc;
      void main() {
        float s = settle(position.x);
        vec3 p = position; p.y = mix(aH.x, aH.y, s);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        float d = -mv.z;
        gl_PointSize = 6.5 * (60.0 / d) * uDpr;
        vA = 1.0 * smoothstep(120.0, 20.0, d);
        vAcc = aBeat * smoothstep(0.85, 1.0, s);
      }`,
    fragmentShader: `
      uniform vec3 uColor; uniform vec3 uAccent; varying float vA; varying float vAcc;
      void main() {
        float d = length(gl_PointCoord - 0.5); if (d > 0.5) discard;
        gl_FragColor = vec4(mix(uColor, uAccent, vAcc), smoothstep(0.5, 0.1, d) * vA);
      }`,
  })));

  const ticks = new THREE.BufferGeometry();
  ticks.setAttribute("position", new THREE.Float32BufferAttribute(tp, 3));
  ticks.setAttribute("aH", new THREE.Float32BufferAttribute(th, 2));
  scene.add(new THREE.Points(ticks, new THREE.ShaderMaterial({
    uniforms, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: settleGLSL + `
      uniform float uDpr; attribute vec2 aH; varying float vA;
      void main() {
        float s = settle(position.x);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        float d = -mv.z;
        gl_PointSize = 9.0 * (60.0 / d) * uDpr;
        vA = 0.6 * s * smoothstep(120.0, 20.0, d);
      }`,
    fragmentShader: `
      uniform vec3 uColor; varying float vA;
      void main() {
        vec2 q = gl_PointCoord - 0.5;
        if (abs(q.y) > 0.06 || abs(q.x) > 0.48) discard;
        gl_FragColor = vec4(uColor, vA);
      }`,
  })));

  /* the cycle: hold the title seasons, run "the next season" down the timelines, hold, release */
  const CYCLE = 30, RUN = 13, xs = xOf(X0) - 8, xe = xOf(X1) + 10;
  function cycle(t) {
    const c = (t + 4) % CYCLE;            // start a few seconds in, so the first wave comes soon
    if (c < 6) { uniforms.uWave.value = xs; uniforms.uHold.value = 1; return; }
    if (c < 6 + RUN) { const k = (c - 6) / RUN; uniforms.uWave.value = xs + (xe - xs) * (k * k * (3 - 2 * k)); uniforms.uHold.value = 1; return; }
    uniforms.uWave.value = xe;
    const r = Math.max(0, (c - (CYCLE - 3)) / 3);  // last 3 s: every column rises back to its title season
    uniforms.uHold.value = 1 - r * r * (3 - 2 * r);
  }

  return {
    update(t) { cycle(t); },
    camera: {
      pos: new THREE.Vector3(-4, 8, 44), look: new THREE.Vector3(1, 7, -4), fov: [34, 50], far: 400,
      drift: { sway: 5, swaySpeed: 0.045, mouseX: 5, mouseY: 3, scrollY: 8, scrollZ: 8, lookMouse: 2, lookScroll: 4 },
    },
  };
}
