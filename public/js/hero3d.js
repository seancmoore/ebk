/* EBK · 3D hero — procedurally textured sport balls floating in WebGL.
   ES module; loads Three.js from CDN. If WebGL or the module is unavailable,
   nothing happens and the CSS hero stays as the fallback. Honors reduced-motion
   (renders a single static frame) and pauses when the tab is hidden. */

const MOUNT = document.getElementById("hero3d");
const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function webglOK() {
  try { const c = document.createElement("canvas"); return !!(window.WebGLRenderingContext && (c.getContext("webgl") || c.getContext("experimental-webgl"))); }
  catch (e) { return false; }
}

if (MOUNT && webglOK()) {
  import("https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js")
    .then((THREE) => start(THREE))
    .catch(() => { /* CDN blocked — keep the CSS fallback */ });
}

function start(THREE) {
  const accent = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "#3ddc97";

  // ---------- canvas-drawn ball skins (no external assets) ----------
  const tex = (draw, w = 512, h = 256) => {
    const cv = document.createElement("canvas"); cv.width = w; cv.height = h;
    const x = cv.getContext("2d"); draw(x, w, h);
    const t = new THREE.CanvasTexture(cv); t.anisotropy = 4; return t;
  };
  function radial(x, w, h, inner, outer) {
    const g = x.createRadialGradient(w * 0.4, h * 0.32, h * 0.05, w * 0.5, h * 0.5, h * 0.8);
    g.addColorStop(0, inner); g.addColorStop(1, outer); x.fillStyle = g; x.fillRect(0, 0, w, h);
  }
  const skins = {
    basketball(x, w, h) {
      radial(x, w, h, "#ffb061", "#c2560f");
      x.strokeStyle = "#2a1404"; x.lineWidth = 7; x.lineCap = "round";
      x.beginPath(); x.moveTo(w / 2, 0); x.lineTo(w / 2, h); x.stroke();           // meridian
      x.beginPath(); x.moveTo(0, h / 2); x.lineTo(w, h / 2); x.stroke();           // equator
      x.beginPath(); x.moveTo(w * 0.18, 0); x.quadraticCurveTo(w * 0.30, h / 2, w * 0.18, h); x.stroke();
      x.beginPath(); x.moveTo(w * 0.82, 0); x.quadraticCurveTo(w * 0.70, h / 2, w * 0.82, h); x.stroke();
      // pebble speckle
      x.fillStyle = "rgba(40,18,4,0.18)";
      for (let i = 0; i < 1400; i++) x.fillRect(Math.random() * w, Math.random() * h, 1.4, 1.4);
    },
    soccer(x, w, h) {
      radial(x, w, h, "#ffffff", "#b9c4dc");
      x.fillStyle = "#15182a";
      const pent = (cx, cy, r) => { x.beginPath(); for (let i = 0; i < 5; i++) { const a = -Math.PI / 2 + i * 2 * Math.PI / 5; const px = cx + r * Math.cos(a), py = cy + r * Math.sin(a); i ? x.lineTo(px, py) : x.moveTo(px, py); } x.closePath(); x.fill(); };
      pent(w * 0.5, h * 0.5, h * 0.13);
      for (let i = 0; i < 6; i++) pent(w * (0.08 + i * 0.16), h * (i % 2 ? 0.22 : 0.78), h * 0.085);
      x.strokeStyle = "rgba(20,24,42,0.5)"; x.lineWidth = 3;
      for (let i = 0; i < 6; i++) { x.beginPath(); x.moveTo(w * (i * 0.18), 0); x.lineTo(w * (i * 0.18 + 0.06), h); x.stroke(); }
    },
    baseball(x, w, h) {
      radial(x, w, h, "#ffffff", "#e7b9ad");
      x.strokeStyle = "#cf2b2b"; x.lineWidth = 4;
      for (const off of [0.32, 0.68]) {
        x.beginPath(); x.moveTo(w * 0.05, h * off);
        x.bezierCurveTo(w * 0.35, h * (off + (off < 0.5 ? 0.18 : -0.18)), w * 0.65, h * (off + (off < 0.5 ? 0.18 : -0.18)), w * 0.95, h * off);
        x.stroke();
        x.lineWidth = 3;
        for (let i = 1; i < 16; i++) { const t = i / 16, cx = w * (0.05 + 0.9 * t), cy = h * off + Math.sin(t * Math.PI) * h * (off < 0.5 ? 0.18 : -0.18) * 1.0; x.beginPath(); x.moveTo(cx - 6, cy - 7); x.lineTo(cx + 6, cy - 1); x.stroke(); }
        x.lineWidth = 4;
      }
    },
    football(x, w, h) {
      radial(x, w, h, "#b46a36", "#5e3214");
      x.fillStyle = "#f1e7d0";
      x.fillRect(w * 0.12, h * 0.47, w * 0.12, h * 0.06);   // end stripe
      x.fillRect(w * 0.76, h * 0.47, w * 0.12, h * 0.06);
      x.strokeStyle = "#f4ecd8"; x.lineWidth = 6; x.lineCap = "round";
      x.beginPath(); x.moveTo(w * 0.5, h * 0.34); x.lineTo(w * 0.5, h * 0.66); x.stroke();
      for (let i = 0; i < 6; i++) { const yy = h * (0.36 + i * 0.056); x.beginPath(); x.moveTo(w * 0.47, yy); x.lineTo(w * 0.53, yy); x.stroke(); }
      x.fillStyle = "rgba(40,20,6,0.16)";
      for (let i = 0; i < 900; i++) x.fillRect(Math.random() * w, Math.random() * h, 1.3, 1.3);
    },
    tennis(x, w, h) {
      radial(x, w, h, "#e8ff5a", "#a9c400");
      x.strokeStyle = "#ffffff"; x.lineWidth = 6;
      x.beginPath(); x.moveTo(w * 0.18, 0); x.quadraticCurveTo(w * 0.5, h * 0.42, w * 0.82, 0); x.stroke();
      x.beginPath(); x.moveTo(w * 0.18, h); x.quadraticCurveTo(w * 0.5, h * 0.58, w * 0.82, h); x.stroke();
    },
  };
  const puckTop = () => tex((x, w, h) => {
    x.fillStyle = "#23262f"; x.fillRect(0, 0, w, h);
    x.strokeStyle = "rgba(255,255,255,0.10)"; x.lineWidth = 6;
    x.beginPath(); x.arc(w / 2, h / 2, h * 0.34, 0, 7); x.stroke();
  }, 256, 256);
  const puckSide = () => tex((x, w, h) => {
    x.fillStyle = "#15171d"; x.fillRect(0, 0, w, h);
    x.strokeStyle = "#0a0b0f"; x.lineWidth = 4;
    for (let i = 0; i < 48; i++) { const px = (i / 48) * w; x.beginPath(); x.moveTo(px, 0); x.lineTo(px, h); x.stroke(); }
  }, 512, 96);

  // ---------- scene ----------
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(42, 2, 0.1, 100);
  camera.position.set(0, 0, 12);
  const renderer = new THREE.WebGLRenderer({ canvas: MOUNT, alpha: true, antialias: true });
  renderer.setClearColor(0x000000, 0);

  scene.add(new THREE.AmbientLight(0xffffff, 0.7));
  const key = new THREE.DirectionalLight(0xffffff, 1.2); key.position.set(4, 6, 8); scene.add(key);
  const rim = new THREE.PointLight(new THREE.Color(accent), 1.4, 60); rim.position.set(-8, -2, 6); scene.add(rim);
  const fill = new THREE.PointLight(0x5b7cff, 0.8, 60); fill.position.set(8, 4, -4); scene.add(fill);

  function ballMesh(kind) {
    let geo, mat, mesh;
    if (kind === "hockey") {
      geo = new THREE.CylinderGeometry(1, 1, 0.42, 48);
      const side = new THREE.MeshStandardMaterial({ map: puckSide(), roughness: 0.55, metalness: 0.1 });
      const top = new THREE.MeshStandardMaterial({ map: puckTop(), roughness: 0.5, metalness: 0.1 });
      mesh = new THREE.Mesh(geo, [side, top, top]);
      mesh.rotation.x = 0.5;
    } else {
      geo = new THREE.SphereGeometry(1, 48, 48);
      mat = new THREE.MeshStandardMaterial({
        map: tex(skins[kind]),
        roughness: kind === "baseball" || kind === "soccer" ? 0.55 : 0.65,
        metalness: 0.06,
      });
      mesh = new THREE.Mesh(geo, mat);
      if (kind === "football") mesh.scale.set(1.5, 0.92, 0.92);
    }
    return mesh;
  }

  // spread balls across the hero width; bigger/blurred-feel in back
  const defs = [
    { k: "basketball", x: -5.2, y: 1.4, z: 0, s: 1.7, rot: 0.0040 },
    { k: "soccer", x: 4.8, y: 1.9, z: -1.5, s: 1.5, rot: -0.0034 },
    { k: "football", x: 3.0, y: -1.9, z: 1, s: 1.5, rot: 0.0050 },
    { k: "baseball", x: -3.4, y: -2.0, z: 0.5, s: 1.15, rot: -0.0060 },
    { k: "hockey", x: 6.6, y: -0.6, z: -2.5, s: 1.25, rot: 0.0050 },
    { k: "tennis", x: -6.8, y: -0.4, z: -2, s: 0.95, rot: 0.0075 },
  ];
  const group = new THREE.Group(); scene.add(group);
  const balls = defs.map((d, i) => {
    const m = ballMesh(d.k);
    m.position.set(d.x, d.y, d.z); m.scale.multiplyScalar(d.s);
    m.userData = { base: m.position.clone(), rot: d.rot, phase: i * 1.7, spin: new THREE.Vector3(d.rot * 0.6, d.rot, d.rot * 0.3) };
    group.add(m); return m;
  });

  // ---------- sizing ----------
  function resize() {
    const r = MOUNT.getBoundingClientRect();
    const w = Math.max(1, r.width), h = Math.max(1, r.height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
    // pull balls closer on narrow screens so they stay in frame
    const k = w < 640 ? 0.62 : w < 980 ? 0.82 : 1;
    group.scale.setScalar(k);
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

  if (reduce) { renderer.render(scene, camera); return; }   // static frame only

  let raf = null, t0 = performance.now();
  function tick(now) {
    raf = requestAnimationFrame(tick);
    const t = (now - t0) / 1000;
    px += (tx - px) * 0.05; py += (ty - py) * 0.05;
    group.rotation.y = px * 0.35;
    group.rotation.x = py * 0.22;
    for (const m of balls) {
      m.rotation.x += m.userData.spin.x;
      m.rotation.y += m.userData.spin.y;
      m.position.y = m.userData.base.y + Math.sin(t * 0.6 + m.userData.phase) * 0.35;
    }
    renderer.render(scene, camera);
  }
  raf = requestAnimationFrame(tick);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) { if (raf) cancelAnimationFrame(raf), raf = null; }
    else if (!raf) { t0 = performance.now(); raf = requestAnimationFrame(tick); }
  });
}
