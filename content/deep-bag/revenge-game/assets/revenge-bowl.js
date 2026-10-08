/* EBK Deep Bag · "Payback Is a Rounding Error" hero scene ("return-bowl").
   Study-scoped ES module, loaded by the article itself because the shared scene
   registry (public/js/deep-bag-v2-scene.js) has no hook for a study to add its
   own scene (see docs/deep-bag-v2-requests.md, revenge-game). It follows the
   same rules as the shared scenes (docs/deep-bag-v2.md, "Hero scene API").

   The picture: a dotted stadium bowl seen from the upper deck. Every seat is
   one of the 1,547 NFL revenge games in the study (data from
   #rg-scene-data, written by scripts/17_export_web.py from
   outputs/tables/nfl_revenge_games_scored.csv), lifted or sunk by how many fpts
   that game beat or missed its expected score. Most seats sit on their row,
   which is the finding. A crowd wave runs round the bowl. Every few seconds a
   player comes home: an arc drops from outside the stadium onto the field and a
   ripple runs out through the stands. One arc in four carries the accent.

   Budget (same as the shared scenes): pixel ratio capped at 1.5, 30 fps cap,
   no antialias, one draw call per layer, the loop stops when the hero is off
   screen or the tab is hidden. Skipped (the CSS bowl in .v2-hero-fallback
   stays) under prefers-reduced-motion, without WebGL, on coarse-pointer
   screens under 820px, on data-saver, or with deviceMemory < 4.
   window.__v2scene.frames counts frames drawn, for perf checks. */
import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.min.js";

function webglOK() {
  try {
    const c = document.createElement("canvas");
    return !!(window.WebGLRenderingContext && (c.getContext("webgl2") || c.getContext("webgl")));
  } catch (e) { return false; }
}
function lowPower() {
  const n = navigator, c = n.connection || {};
  if (c.saveData) return true;
  if (n.deviceMemory && n.deviceMemory < 4) return true;
  const coarse = window.matchMedia && matchMedia("(pointer: coarse)").matches;
  return coarse && Math.min(screen.width, screen.height) < 820;
}
function css(node, name, fb) { return getComputedStyle(node).getPropertyValue(name).trim() || fb; }

const RIPS = 4;

function returnBowl(ctx, opts, values) {
  const { scene, uniforms, accent } = ctx;
  const HALF_W = 26.65;
  uniforms.uRip = { value: Array.from({ length: RIPS }, () => new THREE.Vector4(0, 0, -99, 0)) };

  /* ---- the field: a sparse dotted pitch ---- */
  const fp = [], fb = [];
  for (let x = -60; x <= 60; x += 2) {
    for (let k = 0; k <= 20; k++) {
      const z = -HALF_W + (2 * HALF_W * k) / 20;
      let b = Math.abs(x) > 50 ? 0.22 : 0.12;
      if (k === 0 || k === 20) b = 0.6;
      fp.push(x, 0, z); fb.push(b);
    }
  }
  for (let x = -50; x <= 50; x += 10) {
    for (let z = -HALF_W; z <= HALF_W; z += 0.7) { fp.push(x, 0, z); fb.push(Math.abs(x) === 50 ? 1.0 : x === 0 ? 0.85 : 0.5); }
  }
  for (const x of [-60, 60]) for (let z = -HALF_W; z <= HALF_W; z += 0.9) { fp.push(x, 0, z); fb.push(0.45); }

  const ripGLSL = `
    uniform vec4 uRip[${RIPS}];
    float ripple(vec2 p, out float acc) {
      float bump = 0.0; acc = 0.0;
      for (int i = 0; i < ${RIPS}; i++) {
        vec4 r = uRip[i];
        float age = uTime - r.z;
        if (age > 0.0 && age < 5.0) {
          float d = distance(p, r.xy);
          float ring = exp(-pow((d - age * 22.0) / 3.2, 2.0)) * (1.0 - age / 5.0);
          bump += ring; acc += ring * r.w;
        }
      }
      return bump;
    }`;
  const frag = `
    uniform vec3 uColor; uniform vec3 uAccent;
    varying float vA; varying float vAcc;
    void main() {
      float d = length(gl_PointCoord - 0.5);
      if (d > 0.5) discard;
      gl_FragColor = vec4(mix(uColor, uAccent, vAcc), smoothstep(0.5, 0.05, d) * vA);
    }`;
  const fg = new THREE.BufferGeometry();
  fg.setAttribute("position", new THREE.Float32BufferAttribute(fp, 3));
  fg.setAttribute("aBright", new THREE.Float32BufferAttribute(fb, 1));
  scene.add(new THREE.Points(fg, new THREE.ShaderMaterial({
    uniforms, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `
      uniform float uTime; uniform float uDpr;
      attribute float aBright;
      varying float vA; varying float vAcc;
      ${ripGLSL}
      void main() {
        vec3 p = position;
        float acc; float bump = ripple(p.xz, acc);
        p.y += bump * 0.9;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        float dist = -mv.z;
        gl_PointSize = (1.5 + aBright * 1.1 + bump * 2.0) * (210.0 / dist) * uDpr;
        vA = (0.16 + aBright * 0.45 + bump * 0.7) * smoothstep(380.0, 100.0, dist);
        vAcc = clamp(acc * 1.3, 0.0, 1.0);
      }`,
    fragmentShader: frag,
  })));

  /* ---- the stands: one seat per revenge game ---- */
  const ROWS = 9;
  const rowA = r => 70 + r * 2.7, rowB = r => 43 + r * 2.5, rowY = r => 1.6 + r * 1.45;
  const perim = r => { const a = rowA(r), b = rowB(r); return Math.PI * (3 * (a + b) - Math.sqrt((3 * a + b) * (a + 3 * b))); };
  const N = values.length;
  const tot = Array.from({ length: ROWS }, (_, r) => perim(r)).reduce((s, v) => s + v, 0);
  const counts = Array.from({ length: ROWS }, (_, r) => Math.round(N * perim(r) / tot));
  counts[ROWS - 1] += N - counts.reduce((s, v) => s + v, 0);
  const sp = [], sv = [], sa = [];
  let idx = 0;
  for (let r = 0; r < ROWS; r++) {
    const off = (r % 2) * 0.5;
    for (let k = 0; k < counts[r]; k++) {
      const ang = ((k + off) / counts[r]) * Math.PI * 2;
      sp.push(Math.cos(ang) * rowA(r), rowY(r), Math.sin(ang) * rowB(r));
      sv.push(Math.max(-15, Math.min(30, values[idx++] || 0)));
      sa.push(ang);
    }
  }
  const sg = new THREE.BufferGeometry();
  sg.setAttribute("position", new THREE.Float32BufferAttribute(sp, 3));
  sg.setAttribute("aVal", new THREE.Float32BufferAttribute(sv, 1));
  sg.setAttribute("aAng", new THREE.Float32BufferAttribute(sa, 1));
  scene.add(new THREE.Points(sg, new THREE.ShaderMaterial({
    uniforms, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `
      uniform float uTime; uniform float uDpr;
      attribute float aVal; attribute float aAng;
      varying float vA; varying float vAcc;
      ${ripGLSL}
      void main() {
        vec3 p = position;
        // the crowd wave: one crest running round the bowl
        float da = mod(aAng - uTime * 0.42 + 3.14159265, 6.2831853) - 3.14159265;
        float wave = exp(-da * da / 0.05);
        float acc; float bump = ripple(p.xz, acc);
        p.y += aVal * 0.16 + wave * 1.8 + bump * 1.8;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        float dist = -mv.z;
        float mag = clamp(abs(aVal) / 16.0, 0.0, 1.0);
        gl_PointSize = (2.1 + mag * 2.8 + wave * 1.6 + bump * 2.2) * (210.0 / dist) * uDpr;
        vA = (0.34 + mag * 0.66 + wave * 0.5 + bump * 0.8) * smoothstep(400.0, 110.0, dist);
        vAcc = clamp(acc * 1.5, 0.0, 1.0);
      }`,
    fragmentShader: frag,
  })));

  /* ---- homecomings: arcs from outside the stadium onto the field ---- */
  const SEG = 72, ARCS = Math.max(1, Math.min(4, opts.arcs || 2)), every = Math.max(2, opts.accentEvery || 4);
  const white = new THREE.Color(opts.arcColor || "#dfe6ff");
  const arcs = [];
  const tmp = new THREE.Vector3();
  const bez = (o, t, out) => {
    const u = 1 - t;
    return out.set(
      u * u * o.a.x + 2 * u * t * o.c.x + t * t * o.b.x,
      u * u * o.a.y + 2 * u * t * o.c.y + t * t * o.b.y,
      u * u * o.a.z + 2 * u * t * o.c.z + t * t * o.b.z);
  };
  const headGeo = new THREE.BufferGeometry();
  headGeo.setAttribute("position", new THREE.Float32BufferAttribute(new Array(ARCS * 3).fill(0), 3));
  headGeo.setAttribute("aAcc", new THREE.Float32BufferAttribute(new Array(ARCS).fill(0), 1));
  headGeo.setAttribute("aOn", new THREE.Float32BufferAttribute(new Array(ARCS).fill(0), 1));
  scene.add(new THREE.Points(headGeo, new THREE.ShaderMaterial({
    uniforms, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `
      uniform float uDpr; attribute float aAcc; attribute float aOn; varying float vAcc; varying float vOn;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = 8.0 * (210.0 / -mv.z) * uDpr * aOn;
        vAcc = aAcc; vOn = aOn;
      }`,
    fragmentShader: `
      uniform vec3 uColor; uniform vec3 uAccent; varying float vAcc; varying float vOn;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        if (d > 0.5 || vOn < 0.5) discard;
        gl_FragColor = vec4(mix(vec3(1.0), uAccent, vAcc), smoothstep(0.5, 0.0, d));
      }`,
  })));
  for (let i = 0; i < ARCS; i++) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(new Array((SEG + 1) * 3).fill(0), 3));
    geo.setAttribute("aT", new THREE.Float32BufferAttribute(Array.from({ length: SEG + 1 }, (_, s) => s / SEG), 1));
    const mat = new THREE.ShaderMaterial({
      uniforms: { uHead: { value: 0 }, uFade: { value: 0 }, uColor: { value: white.clone() } },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: `attribute float aT; varying float vT; void main() { vT = aT; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `
        uniform float uHead; uniform float uFade; uniform vec3 uColor; varying float vT;
        void main() {
          if (vT > uHead) discard;
          gl_FragColor = vec4(uColor, smoothstep(uHead - 0.55, uHead, vT) * 0.85 * uFade);
        }`,
    });
    scene.add(new THREE.Line(geo, mat));
    arcs.push({ geo, mat, a: new THREE.Vector3(), b: new THREE.Vector3(), c: new THREE.Vector3(), start: 0, dur: 1, landed: true, next: 0.6 + i * 2.3, accent: false });
  }
  let launches = 0, ripIdx = 0;
  function launch(o, t) {
    // from beyond the upper rim, at a random bearing, down onto the field
    const ang = Math.random() * Math.PI * 2;
    o.a.set(Math.cos(ang) * 125, 26 + Math.random() * 10, Math.sin(ang) * 95);
    o.b.set((Math.random() * 2 - 1) * 40, 0.2, (Math.random() * 2 - 1) * 18);
    o.c.set((o.a.x + o.b.x) / 2, 52 + Math.random() * 16, (o.a.z + o.b.z) / 2);
    launches++;
    o.accent = launches % every === 0;
    o.mat.uniforms.uColor.value.copy(o.accent ? accent : white);
    o.start = t; o.dur = 2.8 + Math.random() * 1.2; o.landed = false;
    const p = o.geo.attributes.position;
    for (let s = 0; s <= SEG; s++) { bez(o, s / SEG, tmp); p.setXYZ(s, tmp.x, tmp.y, tmp.z); }
    p.needsUpdate = true;
  }
  return {
    update(t) {
      const hp = headGeo.attributes.position, ha = headGeo.attributes.aAcc, hon = headGeo.attributes.aOn;
      arcs.forEach((o, i) => {
        if (o.landed) {
          o.mat.uniforms.uFade.value = Math.max(0, o.mat.uniforms.uFade.value - 0.035);
          hon.setX(i, 0);
          if (t >= o.next) { launch(o, t); o.mat.uniforms.uFade.value = 1; }
          return;
        }
        const k = (t - o.start) / o.dur;
        const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
        o.mat.uniforms.uHead.value = e;
        bez(o, Math.min(1, e), tmp);
        hp.setXYZ(i, tmp.x, tmp.y, tmp.z);
        ha.setX(i, o.accent ? 1 : 0);
        hon.setX(i, k < 1 ? 1 : 0);
        if (k >= 1) {
          o.landed = true;
          o.next = t + 1.4 + Math.random() * 3.2;
          uniforms.uRip.value[ripIdx].set(o.b.x, o.b.z, t, o.accent ? 1 : 0);
          ripIdx = (ripIdx + 1) % RIPS;
        }
      });
      hp.needsUpdate = true; ha.needsUpdate = true; hon.needsUpdate = true;
    },
    camera: { pos: new THREE.Vector3(0, 98, 150), look: new THREE.Vector3(0, -16, 4) },
  };
}

function mount(hero) {
  const dataNode = document.getElementById("rg-scene-data");
  let values = [];
  try { values = JSON.parse(dataNode.textContent).v || []; } catch (e) { return false; }
  if (!values.length) return false;
  let opts = {};
  try { opts = JSON.parse(hero.getAttribute("data-study-scene-opts") || "{}"); } catch (e) {}
  let mountNode = hero.querySelector(".v2-hero-scene");
  if (!mountNode) { mountNode = document.createElement("div"); mountNode.className = "v2-hero-scene"; hero.insertBefore(mountNode, hero.firstChild); }

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true, powerPreference: "low-power" });
  } catch (e) { return false; }
  const dpr = Math.min(window.devicePixelRatio || 1, opts.dpr || 1.5);
  renderer.setPixelRatio(dpr);
  renderer.setClearColor(0x000000, 0);
  mountNode.appendChild(renderer.domElement);
  renderer.domElement.setAttribute("aria-hidden", "true");

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(36, 1, 1, 600);
  const accent = new THREE.Color(css(hero, "--v2-accent", "#e5533f"));
  const uniforms = {
    uTime: { value: 0 }, uDpr: { value: dpr },
    uColor: { value: new THREE.Color(opts.color || "#a9b7ec") }, uAccent: { value: accent },
  };
  const s = returnBowl({ scene, camera, accent, uniforms }, opts, values);
  const camPos = s.camera.pos.clone(), camLook = s.camera.look.clone();

  let narrow = false;
  function size() {
    const w = mountNode.clientWidth, h = mountNode.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    narrow = w / h < 1.2;
    camera.fov = narrow ? 64 : 38;
    camera.updateProjectionMatrix();
  }
  size();
  const ro = new ResizeObserver(size);
  ro.observe(mountNode);

  let mx = 0, my = 0, tx = 0, ty = 0;
  window.addEventListener("pointermove", e => { tx = e.clientX / window.innerWidth - 0.5; ty = e.clientY / window.innerHeight - 0.5; }, { passive: true });

  let visible = true, running = false, last = 0, t = 0;
  const minDt = 1000 / (opts.fps || 30);
  const stats = (window.__v2scene = { frames: 0, since: performance.now(), scene: "return-bowl" });
  function loop(now) {
    if (!(visible && !document.hidden)) { running = false; return; }
    requestAnimationFrame(loop);
    if (now - last < minDt - 1) return;
    const dt = Math.min(0.1, (now - (last || now)) / 1000);
    last = now;
    t += dt;
    uniforms.uTime.value = t;
    s.update(t, dt);
    mx += (tx - mx) * 0.04; my += (ty - my) * 0.04;
    const scroll = Math.min(1, Math.max(0, -hero.getBoundingClientRect().top / Math.max(1, hero.offsetHeight)));
    const orbit = Math.sin(t * 0.045) * 0.16 + mx * 0.12;          // a slow drift round the bowl
    const r = Math.hypot(camPos.x, camPos.z);
    camera.position.set(Math.sin(orbit) * r, camPos.y + my * 3 + scroll * 10, Math.cos(orbit) * r - scroll * 8);
    camera.lookAt(camLook.x + mx * 3, camLook.y - scroll * 6, camLook.z);
    renderer.render(scene, camera);
    stats.frames++;
  }
  function wake() { if (!running && visible && !document.hidden) { running = true; last = 0; requestAnimationFrame(loop); } }
  new IntersectionObserver(es => { visible = es[0].isIntersecting; wake(); }, { threshold: 0 }).observe(hero);
  document.addEventListener("visibilitychange", wake);
  renderer.domElement.addEventListener("webglcontextlost", e => { e.preventDefault(); visible = false; hero.classList.remove("has-scene"); });
  wake();
  return true;
}

(function boot() {
  const hero = document.querySelector('.v2-hero[data-study-scene="return-bowl"]');
  if (!hero) return;
  const reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduce || !webglOK() || lowPower()) return;
  if (!mount(hero)) return;
  requestAnimationFrame(() => hero.classList.add("has-scene"));
  // say what the seats are, only when they are actually on screen
  const inner = hero.querySelector(".v2-hero-in");
  if (inner && !inner.querySelector(".v2-hero-meta")) {
    const p = document.createElement("p");
    p.className = "v2-hero-meta";
    p.textContent = "Behind the title: all 1,547 revenge games, one seat each, raised or sunk by how far each one beat or missed its expected score.";
    inner.appendChild(p);
  }
})();
