/* Champagne, No Hangover · study-scoped hero scene (Deep Bag v2).
   The shared scene module (public/js/deep-bag-v2-scene.js) only knows "trade-field"
   and is a system file, so this study ships its own scene with the same budget rules:
   pixel ratio capped at 1.5, 30 fps cap, no antialias, one draw call per layer, the
   loop stops whenever the hero is off screen or the tab is hidden, window.__v2scene
   counts frames. Skipped (the CSS/SVG fallback stays) under reduced motion, without
   WebGL, on coarse-pointer screens under 820px, on data-saver or deviceMemory < 4.

   The scene is the data: every champion since 1903 (352 of them, from
   outputs/web/hero.json, inlined in the article as #cn-hero-data) stands as a column of
   rising bubbles on one of four league timelines. Height = how far above an average team
   it finished in its title season, in within-season standard deviations of win%. A slow
   wave ("the next season") runs down the timelines and each column settles to where that
   team actually finished a year later. A faint tick marks where regression to the mean
   said it would land; caps that settle above their tick (most of them) turn gold. */
import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.min.js";

const hero = document.querySelector(".v2-hero[data-study-scene='champagne']");
const dataNode = document.getElementById("cn-hero-data");

function lowPower() {
  const n = navigator, c = n.connection || {};
  if (c.saveData) return true;
  if (n.deviceMemory && n.deviceMemory < 4) return true;
  const coarse = matchMedia("(pointer: coarse)").matches;
  return coarse && Math.min(screen.width, screen.height) < 820;
}
function webglOK() {
  try { const c = document.createElement("canvas"); return !!(c.getContext("webgl2") || c.getContext("webgl")); }
  catch (e) { return false; }
}

if (hero && dataNode && !matchMedia("(prefers-reduced-motion: reduce)").matches && webglOK() && !lowPower()) {
  try { mount(JSON.parse(dataNode.textContent)); } catch (e) { /* fallback stays */ }
}

function mount(data) {
  const opts = { dpr: 1.5, fps: 30 };
  let mountEl = hero.querySelector(".v2-hero-scene");
  if (!mountEl) { mountEl = document.createElement("div"); mountEl.className = "v2-hero-scene"; hero.insertBefore(mountEl, hero.firstChild); }
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true, powerPreference: "low-power" }); }
  catch (e) { return; }
  const dpr = Math.min(window.devicePixelRatio || 1, opts.dpr);
  renderer.setPixelRatio(dpr);
  renderer.setClearColor(0x000000, 0);
  mountEl.appendChild(renderer.domElement);
  renderer.domElement.setAttribute("aria-hidden", "true");

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(34, 1, 1, 400);
  const accentHex = getComputedStyle(hero).getPropertyValue("--v2-accent").trim() || "#f2c45a";
  const uniforms = {
    uTime: { value: 0 }, uDpr: { value: dpr }, uWave: { value: -99 }, uHold: { value: 0 },
    uColor: { value: new THREE.Color("#b4c0ee") }, uAccent: { value: new THREE.Color(accentHex) },
  };

  /* layout: seasons along x, four league lanes along z */
  const X0 = 1903, X1 = 2025;
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
  const B = 20;
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

  const camPos = new THREE.Vector3(-4, 8, 44), camLook = new THREE.Vector3(1, 7, -4);
  let w = 0, h = 0;
  function size() {
    w = mountEl.clientWidth; h = mountEl.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.fov = w / h < 1.2 ? 50 : 34;
    camera.updateProjectionMatrix();
  }
  size();
  new ResizeObserver(size).observe(mountEl);

  let mx = 0, my = 0, tx = 0, ty = 0;
  window.addEventListener("pointermove", e => { tx = e.clientX / innerWidth - 0.5; ty = e.clientY / innerHeight - 0.5; }, { passive: true });

  let visible = true, running = false, last = 0, t = 0;
  const minDt = 1000 / opts.fps;
  const stats = (window.__v2scene = { frames: 0, since: performance.now(), scene: "champagne" });
  function loop(now) {
    if (!(visible && !document.hidden)) { running = false; return; }
    requestAnimationFrame(loop);
    if (now - last < minDt - 1) return;
    const dt = Math.min(0.1, (now - (last || now)) / 1000);
    last = now; t += dt;
    uniforms.uTime.value = t;
    cycle(t);
    mx += (tx - mx) * 0.04; my += (ty - my) * 0.04;
    const scroll = Math.min(1, Math.max(0, -hero.getBoundingClientRect().top / Math.max(1, hero.offsetHeight)));
    camera.position.set(camPos.x + Math.sin(t * 0.045) * 5 + mx * 5, camPos.y + my * 3 + scroll * 8, camPos.z - scroll * 8);
    camera.lookAt(camLook.x + mx * 2, camLook.y - scroll * 4, camLook.z);
    renderer.render(scene, camera);
    stats.frames++;
  }
  function wake() { if (!running && visible && !document.hidden) { running = true; last = 0; requestAnimationFrame(loop); } }
  new IntersectionObserver(es => { visible = es[0].isIntersecting; wake(); }, { threshold: 0 }).observe(hero);
  document.addEventListener("visibilitychange", wake);
  renderer.domElement.addEventListener("webglcontextlost", e => { e.preventDefault(); visible = false; hero.classList.remove("has-scene"); });
  wake();
  requestAnimationFrame(() => hero.classList.add("has-scene"));
}
