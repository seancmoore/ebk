/* EBK Deep Bag v2 · ambient hero scenes (docs/deep-bag-v2.md, "Hero scene API").
   ES module, imported by deep-bag-v2.js only when WebGL works, the visitor has
   not asked for reduced motion, and the device is not a phone or a data-saver
   (those keep the static .v2-hero-fallback).

   mountScene(mount, name, opts, hero, extra) -> Promise<bool> (true = running)
   registerScene(name, build)                 add a scene at runtime

   This module does all the shared work, so a scene only draws:
     - renderer (no antialias, alpha, low-power GPU), pixel ratio capped at
       opts.dpr (1.5), frame rate capped at opts.fps (30)
     - frame budget: when frames run long (main-thread cost over opts.budget
       ms, or the achieved rate falls well under the cap) it steps the pixel
       ratio down to 1, then the frame rate down to 20
     - the loop stops while the hero is off screen, the tab is hidden, or the
       visitor switches on reduced motion; the WebGL context loss falls back
     - camera: sway, mouse parallax and the scroll push, with the scene's own
       numbers (or its own move function)
     - window.__v2scene = { scene, frames, dpr, fps, cost } for perf checks

   A scene is a function build(ctx, opts) -> { update(t, dt), camera, caption? }
     ctx    { THREE, scene, camera, accent (THREE.Color), uniforms (uTime, uDpr,
              uColor, uAccent), hero, data (parsed JSON from data-scene-data) }
     camera { pos: Vector3, look: Vector3, fov: [wide, narrow], far,
              drift: { sway, swaySpeed, mouseX, mouseY, scrollY, scrollZ,
                       lookMouse, lookScroll }   (any subset; see DRIFT)
              move(camera, s)  optional, replaces the default drift;
                               s = { t, mx, my, scroll, pos, look } }
     caption  optional sentence shown under the standfirst while it runs
   Return null when the data is missing (the static fallback stays).

   Scenes
     "trade-field"        built in. A dotted football field in perspective;
                          trades fly across as arcs that land with a ripple.
                          opts { arcs: 5, accentEvery: 4, surface: "football" | "plain" }
     "return-bowl"        deep-bag-v2-scenes/return-bowl.js (revenge-game)
     "champagne-bubbles"  deep-bag-v2-scenes/champagne-bubbles.js (champagne-no-hangover)
     "cliff-ridges"       deep-bag-v2-scenes/cliff-ridges.js (the-cliff)
   A study-hosted module can be named with data-scene-src (its default export
   is the build function) or can call registerScene() itself. */
import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.min.js";

export { THREE };
export const SCENE_API = 2;
const VER = new URL(import.meta.url).searchParams.get("v") || "";
const BUILT_IN_MODULES = { "return-bowl": 1, "champagne-bubbles": 1, "cliff-ridges": 1 };
const DRIFT = { sway: 5, swaySpeed: 0.05, mouseX: 6, mouseY: 3, scrollY: 9, scrollZ: 6, lookMouse: 2, lookScroll: 5 };

function css(node, name, fb) { return getComputedStyle(node).getPropertyValue(name).trim() || fb; }

/* ------------------------------------------------------- trade-field -- */
function tradeField(ctx, opts) {
  const { scene, accent, uniforms } = ctx;
  const plain = opts.surface === "plain";
  const HALF_W = 26.65; // half field width, yards
  const pos = [], bright = [];
  for (let x = -60; x <= 60; x += 1) {
    for (let k = 0; k <= 40; k++) {
      const z = -HALF_W + (2 * HALF_W * k) / 40;
      let b = 0.0;
      if (!plain) {
        if (x % 5 === 0 && Math.abs(x) <= 50) b = 0.75;
        if (Math.abs(x) === 50) b = 1.25;
        if (k === 0 || k === 40) b = Math.max(b, 0.7);
        if (Math.abs(x) > 50) b = Math.max(b, 0.22);
        if ((k === 18 || k === 22) && Math.abs(x) < 50) b = Math.max(b, 0.42); // hash rows
      }
      pos.push(x, 0, z);
      bright.push(b);
    }
  }
  if (!plain) {
    // yard lines and sidelines drawn as dense rows of dots so they read as lines
    for (let x = -50; x <= 50; x += 5) {
      for (let z = -HALF_W; z <= HALF_W; z += 0.45) { pos.push(x, 0, z); bright.push(Math.abs(x) === 50 ? 1.15 : x === 0 ? 0.95 : 0.7); }
    }
    for (const z of [-HALF_W, HALF_W]) for (let x = -60; x <= 60; x += 0.5) { pos.push(x, 0, z); bright.push(0.75); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("aBright", new THREE.Float32BufferAttribute(bright, 1));
  const ripples = Array.from({ length: 6 }, () => new THREE.Vector4(0, 0, -99, 0));
  uniforms.uRip = { value: ripples };
  const fieldMat = new THREE.ShaderMaterial({
    uniforms,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `
      uniform float uTime; uniform float uDpr; uniform vec4 uRip[6];
      attribute float aBright;
      varying float vA; varying float vAcc;
      void main() {
        vec3 p = position;
        float w = sin(p.x * 0.055 + uTime * 0.32) * 0.45 + sin(p.z * 0.12 - uTime * 0.24) * 0.3;
        float bump = 0.0, acc = 0.0;
        for (int i = 0; i < 6; i++) {
          vec4 r = uRip[i];
          float age = uTime - r.z;
          if (age > 0.0 && age < 4.5) {
            float d = distance(p.xz, r.xy);
            float ring = exp(-pow((d - age * 8.0) / 1.7, 2.0)) * (1.0 - age / 4.5);
            bump += ring; acc += ring * r.w;
          }
        }
        p.y += w + bump * 1.1;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        float dist = -mv.z;
        gl_PointSize = (1.7 + aBright * 1.1 + bump * 2.4) * (66.0 / dist) * uDpr;
        vA = (0.2 + aBright * 0.5 + bump * 0.9) * smoothstep(150.0, 30.0, dist);
        vAcc = clamp(acc * 1.4, 0.0, 1.0);
      }`,
    fragmentShader: `
      uniform vec3 uColor; uniform vec3 uAccent;
      varying float vA; varying float vAcc;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        if (d > 0.5) discard;
        float a = smoothstep(0.5, 0.05, d) * vA;
        gl_FragColor = vec4(mix(uColor, uAccent, vAcc), a);
      }`,
  });
  scene.add(new THREE.Points(g, fieldMat));

  /* arcs: trades in flight */
  const N = Math.max(1, Math.min(8, opts.arcs || 5));
  const SEG = 90;
  const accentEvery = opts.accentEvery || 4;
  let launches = 0, ripIdx = 0;
  const arcMat = (col) => new THREE.ShaderMaterial({
    uniforms: { uHead: { value: 0 }, uColor: { value: col }, uFade: { value: 1 } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `attribute float aT; varying float vT; void main(){ vT = aT; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `
      uniform float uHead; uniform vec3 uColor; uniform float uFade; varying float vT;
      void main(){
        float trail = smoothstep(uHead - 0.42, uHead, vT) * step(vT, uHead);
        float base = 0.07 * step(vT, uHead + 0.0);
        gl_FragColor = vec4(uColor, (trail * 0.85 + base) * uFade);
      }`,
  });
  const headGeo = new THREE.BufferGeometry();
  headGeo.setAttribute("position", new THREE.Float32BufferAttribute(new Array(N * 3).fill(0), 3));
  headGeo.setAttribute("aAcc", new THREE.Float32BufferAttribute(new Array(N).fill(0), 1));
  headGeo.setAttribute("aOn", new THREE.Float32BufferAttribute(new Array(N).fill(0), 1));
  const headMat = new THREE.ShaderMaterial({
    uniforms,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `uniform float uDpr; attribute float aAcc; attribute float aOn; varying float vAcc; varying float vOn;
      void main(){ vAcc = aAcc; vOn = aOn; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_Position = projectionMatrix * mv; gl_PointSize = 15.0 * (64.0 / -mv.z) * uDpr; }`,
    fragmentShader: `uniform vec3 uColor; uniform vec3 uAccent; varying float vAcc; varying float vOn;
      void main(){ float d = length(gl_PointCoord - 0.5); if (d > 0.5) discard;
        float a = (smoothstep(0.5, 0.0, d) * 0.55 + smoothstep(0.16, 0.0, d)) * vOn;
        gl_FragColor = vec4(mix(vec3(1.0), uAccent, vAcc * 0.85), a); }`,
  });
  const heads = new THREE.Points(headGeo, headMat);
  scene.add(heads);
  const white = new THREE.Color(0xdfe7ff);
  const arcs = [];
  for (let i = 0; i < N; i++) {
    const ag = new THREE.BufferGeometry();
    ag.setAttribute("position", new THREE.Float32BufferAttribute(new Array((SEG + 1) * 3).fill(0), 3));
    const ts = [];
    for (let s = 0; s <= SEG; s++) ts.push(s / SEG);
    ag.setAttribute("aT", new THREE.Float32BufferAttribute(ts, 1));
    const mat = arcMat(white.clone());
    const line = new THREE.Line(ag, mat);
    line.frustumCulled = false;
    scene.add(line);
    arcs.push({ line, mat, geo: ag, start: 0, dur: 1, a: new THREE.Vector3(), b: new THREE.Vector3(), c: new THREE.Vector3(), accent: false, landed: true, next: i * 1.3 + 0.4 });
  }
  const tmp = new THREE.Vector3();
  function bez(o, t, out) {
    const u = 1 - t;
    return out.set(
      u * u * o.a.x + 2 * u * t * o.c.x + t * t * o.b.x,
      u * u * o.a.y + 2 * u * t * o.c.y + t * t * o.b.y,
      u * u * o.a.z + 2 * u * t * o.c.z + t * t * o.b.z);
  }
  function launch(o, t) {
    const dir = Math.random() < 0.5 ? 1 : -1;
    o.a.set(-dir * (12 + Math.random() * 36), 0.2, (Math.random() * 2 - 1) * 20);
    o.b.set(dir * (8 + Math.random() * 38), 0.2, (Math.random() * 2 - 1) * 20);
    o.c.set((o.a.x + o.b.x) / 2, 11 + Math.random() * 9, (o.a.z + o.b.z) / 2 + (Math.random() * 2 - 1) * 6);
    launches++;
    o.accent = launches % accentEvery === 0;
    o.mat.uniforms.uColor.value.copy(o.accent ? accent : white);
    o.start = t; o.dur = 3.1 + Math.random() * 1.6; o.landed = false;
    const p = o.geo.attributes.position;
    for (let s = 0; s <= SEG; s++) { bez(o, s / SEG, tmp); p.setXYZ(s, tmp.x, tmp.y, tmp.z); }
    p.needsUpdate = true;
  }
  return {
    update(t) {
      const hp = headGeo.attributes.position, ha = headGeo.attributes.aAcc, hon = headGeo.attributes.aOn;
      arcs.forEach((o, i) => {
        if (o.landed) {
          o.mat.uniforms.uFade.value = Math.max(0, o.mat.uniforms.uFade.value - 0.03);
          hon.setX(i, 0);
          if (t >= o.next) { launch(o, t); o.mat.uniforms.uFade.value = 1; }
          return;
        }
        const k = (t - o.start) / o.dur;
        const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2; // easeInOutQuad
        o.mat.uniforms.uHead.value = e;
        bez(o, Math.min(1, e), tmp);
        hp.setXYZ(i, tmp.x, tmp.y, tmp.z);
        ha.setX(i, o.accent ? 1 : 0);
        hon.setX(i, k < 1 ? 1 : 0);
        if (k >= 1) {
          o.landed = true;
          o.next = t + 0.8 + Math.random() * 2.6;
          ripples[ripIdx].set(o.b.x, o.b.z, t, o.accent ? 1 : 0);
          ripIdx = (ripIdx + 1) % ripples.length;
        }
      });
      hp.needsUpdate = true; ha.needsUpdate = true; hon.needsUpdate = true;
    },
    camera: { pos: new THREE.Vector3(0, 15, 50), look: new THREE.Vector3(0, 1, -12), fov: [36, 48], far: 400 },
  };
}

/* ---------------------------------------------------------- registry -- */
const REG = { "trade-field": tradeField };

export function registerScene(name, build) {
  if (typeof name === "string" && typeof build === "function") REG[name] = build;
}

async function resolveScene(name, src) {
  if (REG[name]) return REG[name];
  let url = "";
  if (src) url = new URL(src, location.href).href;
  else if (BUILT_IN_MODULES[name]) url = new URL(`./deep-bag-v2-scenes/${name}.js${VER ? "?v=" + VER : ""}`, import.meta.url).href;
  if (!url) return null;
  const m = await import(url);
  const build = m.default || m.build;
  if (typeof build === "function") REG[name] = build;
  return REG[name] || null;
}

/* ------------------------------------------------------------- mount -- */
export async function mountScene(mount, name, opts = {}, hero = mount.parentNode, extra = {}) {
  const mq = window.matchMedia ? matchMedia("(prefers-reduced-motion: reduce)") : null;
  if (mq && mq.matches) return false;
  let build;
  try { build = await resolveScene(name || "trade-field", extra.src); } catch (e) { return false; }
  if (!build) return false;
  if (mount.querySelector("canvas")) return false; // something already drew here

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true, powerPreference: "low-power" });
  } catch (e) { return false; }
  const DPR_MAX = Math.min(window.devicePixelRatio || 1, opts.dpr || 1.5);
  let dpr = DPR_MAX;
  renderer.setPixelRatio(dpr);
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(36, 1, 1, 400);
  const accent = new THREE.Color(css(hero, "--v2-accent", "#3ddc97"));
  const uniforms = {
    uTime: { value: 0 }, uDpr: { value: dpr },
    uColor: { value: new THREE.Color(opts.color || "#a9b7ec") }, uAccent: { value: accent },
  };
  let s;
  try { s = build({ THREE, scene, camera, accent, uniforms, hero, data: extra.data }, opts); } catch (e) { s = null; }
  if (!s || typeof s.update !== "function") { renderer.dispose(); return false; }
  mount.appendChild(renderer.domElement);
  renderer.domElement.setAttribute("aria-hidden", "true");

  const cam = s.camera || {};
  const camPos = (cam.pos || new THREE.Vector3(0, 15, 50)).clone();
  const camLook = (cam.look || new THREE.Vector3(0, 1, -12)).clone();
  const fov = cam.fov || [36, 48];
  const drift = Object.assign({}, DRIFT, cam.drift || {});
  camera.far = cam.far || 400;

  function size() {
    const w = mount.clientWidth, h = mount.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.fov = w / h < 1.2 ? fov[1] : fov[0]; // keep the subject filling narrow viewports
    camera.updateProjectionMatrix();
  }
  size();
  const ro = new ResizeObserver(size);
  ro.observe(mount);

  if (s.caption) {
    const inner = hero.querySelector(".v2-hero-in");
    if (inner && !inner.querySelector(".v2-hero-meta")) {
      const p = document.createElement("p");
      p.className = "v2-hero-meta v2-scene-caption";
      p.textContent = s.caption;
      inner.appendChild(p);
    }
  }

  let mx = 0, my = 0, tx = 0, ty = 0;
  window.addEventListener("pointermove", e => { tx = e.clientX / window.innerWidth - 0.5; ty = e.clientY / window.innerHeight - 0.5; }, { passive: true });

  let visible = true, running = false, stopped = false, last = 0, t = 0;
  let fps = Math.min(60, opts.fps || 30), minDt = 1000 / fps;
  const budget = opts.budget || 4;              // ms of main-thread work per frame
  let costEMA = 0, gapEMA = minDt, strikes = 0, warm = 0;
  const stats = (window.__v2scene = { scene: name, frames: 0, since: performance.now(), dpr, fps, cost: 0 });
  const sv = { t: 0, mx: 0, my: 0, scroll: 0, pos: camPos, look: camLook };

  function degrade() {
    // first trade pixels (GPU fill), then frames; never below 1x / 20 fps
    if (dpr > 1.01) { dpr = Math.max(1, dpr - 0.25); renderer.setPixelRatio(dpr); uniforms.uDpr.value = dpr; size(); }
    else if (fps > 20) { fps = fps > 24 ? 24 : 20; minDt = 1000 / fps; }
    stats.dpr = dpr; stats.fps = fps;
  }
  function loop(now) {
    if (stopped || !(visible && !document.hidden)) { running = false; return; }
    requestAnimationFrame(loop);
    if (now - last < minDt - 1) return;
    const gap = last ? now - last : minDt;
    const dt = Math.min(0.1, gap / 1000);
    last = now;
    t += dt;
    const c0 = performance.now();
    uniforms.uTime.value = t;
    s.update(t, dt);
    mx += (tx - mx) * 0.04; my += (ty - my) * 0.04;
    const scroll = Math.min(1, Math.max(0, -hero.getBoundingClientRect().top / Math.max(1, hero.offsetHeight)));
    if (cam.move) {
      sv.t = t; sv.mx = mx; sv.my = my; sv.scroll = scroll;
      cam.move(camera, sv);
    } else {
      camera.position.set(camPos.x + Math.sin(t * drift.swaySpeed) * drift.sway + mx * drift.mouseX,
        camPos.y + my * drift.mouseY + scroll * drift.scrollY, camPos.z - scroll * drift.scrollZ);
      camera.lookAt(camLook.x + mx * drift.lookMouse, camLook.y - scroll * drift.lookScroll, camLook.z);
    }
    renderer.render(scene, camera);
    const cost = performance.now() - c0;
    stats.frames++;
    // frame budget: ignore the first second (shader compile), then watch cost and achieved rate
    if (++warm > fps) {
      costEMA += (cost - costEMA) * 0.05;
      gapEMA += (Math.min(gap, 200) - gapEMA) * 0.05;
      stats.cost = Math.round(costEMA * 100) / 100;
      if (costEMA > budget || gapEMA > minDt * 1.45) { if (++strikes > fps * 2) { strikes = 0; warm = 0; costEMA = 0; gapEMA = minDt; degrade(); } }
      else strikes = Math.max(0, strikes - 1);
    }
  }
  function wake() { if (!stopped && !running && visible && !document.hidden) { running = true; last = 0; requestAnimationFrame(loop); } }
  new IntersectionObserver(es => { visible = es[0].isIntersecting; wake(); }, { threshold: 0 }).observe(hero);
  document.addEventListener("visibilitychange", wake);
  function stop() {
    stopped = true;
    hero.classList.remove("has-scene");
    const cap = hero.querySelector(".v2-scene-caption");
    if (cap) cap.remove();
  }
  if (mq && mq.addEventListener) mq.addEventListener("change", e => { if (e.matches) stop(); });
  renderer.domElement.addEventListener("webglcontextlost", e => { e.preventDefault(); visible = false; stop(); });
  wake();
  return true;
}
