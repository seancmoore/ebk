/* EBK · 3D hero — five game balls, built to look like the real thing.
   ES module; loads Three.js from CDN. If WebGL or the module is unavailable,
   nothing happens and the CSS hero stays as the fallback. Honors reduced-motion
   (renders a single static frame) and pauses when the tab is hidden.

   Ball skins are procedural but baked ahead of time: tools/hero_textures/gen.js
   builds them and tools/bake_hero_textures.py writes public/img/hero/*.webp.
   (Generating them here froze the page for seconds on every visit.)
   Geometry is built here: the baseball seam + raised stitches, the football's
   lathe body + laces, the puck's knurled edge and face stamp. */

const MOUNT = document.getElementById("hero3d");
const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const CDN = "https://cdn.jsdelivr.net/npm/three@0.160.0/";
const TEX = "/img/hero/";
const SKINS = ["basketball", "soccer", "baseball", "football"];

function webglOK() {
  try { const c = document.createElement("canvas"); return !!(window.WebGLRenderingContext && (c.getContext("webgl") || c.getContext("experimental-webgl"))); }
  catch (e) { return false; }
}

// <img> for a baked texture; fetched in parallel with three.js
function loadImg(src) {
  return new Promise((res, rej) => {
    const im = new Image();
    im.onload = () => res(im); im.onerror = rej; im.src = src;
  });
}

if (MOUNT && webglOK()) {
  const imgs = {};
  Promise.all([
    // minified build: same library, ~35% less to download and half the code to parse
    import(CDN + "build/three.module.min.js"),
    ...SKINS.flatMap(b => ["map", "bump"].map(k => loadImg(`${TEX}${b}-${k}.webp`).then(im => { imgs[`${b}-${k}`] = im; }))),
  ]).then(([THREE]) => start(THREE, imgs))
    .catch(() => { /* CDN or textures blocked — keep the CSS fallback */ });
}

function start(THREE, imgs) {
  const accent = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "#3ddc97";

  // baked skin → { map, bump } textures
  function skin(ball, wrap = true) {
    const mk = (k) => { const t = new THREE.Texture(imgs[`${ball}-${k}`]); t.anisotropy = 8; if (wrap) t.wrapS = THREE.RepeatWrapping; t.needsUpdate = true; return t; };
    const map = mk("map"); map.colorSpace = THREE.SRGBColorSpace;
    return { map, bump: mk("bump") };
  }

  /* The EBK stamp for the puck face (the other balls have it baked in;
     the same function lives in tools/hero_textures/gen.js). */
  function ebkStamp(f, S = 512) {
    const cv = document.createElement("canvas"); cv.width = cv.height = S;
    const d = cv.getContext("2d"), m = S / 512;
    if (f.disc) { d.fillStyle = f.disc; d.beginPath(); d.arc(S / 2, S / 2, 214 * m, 0, Math.PI * 2); d.fill(); }
    d.lineWidth = 10 * m; d.strokeStyle = f.ring; d.beginPath(); d.arc(S / 2, S / 2, 196 * m, 0, Math.PI * 2); d.stroke();
    d.font = `900 ${150 * m}px 'Arial Black', Impact, sans-serif`; d.textAlign = "center"; d.textBaseline = "middle";
    d.fillStyle = f.ek; d.fillText("E", 160 * m, 262 * m); d.fillText("K", 352 * m, 262 * m);
    if (f.bLine) { d.lineWidth = 14 * m; d.lineJoin = "round"; d.strokeStyle = f.bLine; d.strokeText("B", 256 * m, 262 * m); }
    d.fillStyle = f.b; d.fillText("B", 256 * m, 262 * m);
    return cv;
  }
  const PUCK_FLAVOR = { ring: "rgba(255,255,255,0.16)", ek: "rgba(255,255,255,0.22)", b: accent };

  // ---------- BASKETBALL ----------
  function basketball() {
    const { map, bump } = skin("basketball");
    const mat = new THREE.MeshPhysicalMaterial({
      map, bumpMap: bump, bumpScale: 2.4, roughness: 0.72, metalness: 0,
      sheen: 0.5, sheenRoughness: 0.6, sheenColor: new THREE.Color("#ff9a5c"),
      clearcoat: 0.08, clearcoatRoughness: 0.6,
    });
    const m = new THREE.Mesh(new THREE.SphereGeometry(1, 128, 96), mat);
    // stamp centred in a side panel (same direction as BB_STAMP in tools/hero_textures/gen.js)
    m.userData.logo = [Math.cos(0.4) * Math.sin(1.26), Math.sin(0.4), Math.cos(0.4) * Math.cos(1.26)];
    m.userData.face = [0.81, 0.31, 0.5]; // 3/4 view: stamp panel plus the "+" seam junction on the left
    m.userData.up = [0, 1, 0];          // keep the equator level, the curved seam arching over the stamp
    return m;
  }

  // ---------- SOCCER ----------
  function soccer() {
    const { map, bump } = skin("soccer");
    const mat = new THREE.MeshPhysicalMaterial({
      map, bumpMap: bump, bumpScale: 2.2, roughness: 0.42, metalness: 0,
      clearcoat: 0.35, clearcoatRoughness: 0.35,
    });
    const m = new THREE.Mesh(new THREE.SphereGeometry(1, 96, 64), mat);
    // hexagon centre the stamp is baked on (ico face [0,5,1] of the truncated icosahedron)
    m.userData.logo = [0, 0.934172, 0.356822];
    return m;
  }

  // ---------- BASEBALL ----------
  function baseball() {
    const g = new THREE.Group();
    const BB_LOGO = [0.666, 0.327, 0.671];             // centre of a leather lobe, farthest from the seam
    const { map, bump } = skin("baseball");
    g.add(new THREE.Mesh(new THREE.SphereGeometry(1, 96, 64),
      new THREE.MeshPhysicalMaterial({ map, bumpMap: bump, bumpScale: 0.8, roughness: 0.62, sheen: 0.4, sheenColor: new THREE.Color("#fff6e8") })));

    // seam curve (classic tennis/baseball curve), sampled on the unit sphere
    const a = 0.62, b = 0.38, k = 2 * Math.sqrt(a * b);
    const P = (t) => new THREE.Vector3(a * Math.cos(t) + b * Math.cos(3 * t), k * Math.sin(2 * t), a * Math.sin(t) - b * Math.sin(3 * t)).normalize();
    class Seam extends THREE.Curve { getPoint(t, o = new THREE.Vector3()) { return o.copy(P(t * Math.PI * 2)).multiplyScalar(1.002); } }
    // the seam groove: a thin, slightly darker leather ridge
    g.add(new THREE.Mesh(new THREE.TubeGeometry(new Seam(), 600, 0.012, 6, true),
      new THREE.MeshStandardMaterial({ color: "#d9d0bb", roughness: 0.8 })));

    // red stitches: V pairs on both sides of the seam, instanced
    const N = 108, stitch = new THREE.CapsuleGeometry(0.0105, 0.07, 3, 6);
    const smat = new THREE.MeshStandardMaterial({ color: "#c7262b", roughness: 0.55 });
    const inst = new THREE.InstancedMesh(stitch, smat, N * 2);
    const M = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
    let n = 0;
    for (let i = 0; i < N; i++) {
      const t = (i + 0.5) / N * Math.PI * 2, p0 = P(t), p1 = P(t + 0.002);
      const tan = p1.clone().sub(p0).normalize();
      const side = new THREE.Vector3().crossVectors(p0, tan).normalize();
      for (const s of [-1, 1]) {
        // each stitch angles back toward the seam: a chevron
        const dir = side.clone().multiplyScalar(s).addScaledVector(tan, 0.55).normalize();
        const pos = p0.clone().addScaledVector(side, s * 0.045).normalize().multiplyScalar(1.012);
        // lie the capsule along dir, tangent to the sphere
        q.setFromUnitVectors(up, dir);
        M.compose(pos, q, new THREE.Vector3(1, 1, 1));
        inst.setMatrixAt(n++, M);
      }
    }
    g.add(inst);
    g.userData.logo = BB_LOGO;
    return g;
  }

  // ---------- FOOTBALL ----------
  function football() {
    const g = new THREE.Group();
    const L = 1.56, R = 1.0, prof = [];
    const r = (y) => R * Math.pow(Math.max(0, 1 - (y / L) * (y / L)), 0.74);
    for (let i = 0; i <= 64; i++) { const y = -L + (2 * L * i) / 64; prof.push(new THREE.Vector2(Math.max(r(y), 0.001), y)); }
    const geo = new THREE.LatheGeometry(prof, 128);

    // baked skin in lathe UV: u around (0..1), v along the axis (0..1); stamp on the u = 0.25 panel
    const { map, bump } = skin("football", false);
    g.add(new THREE.Mesh(geo, new THREE.MeshPhysicalMaterial({
      map, bumpMap: bump, bumpScale: 1.6, roughness: 0.7, sheen: 0.3, sheenColor: new THREE.Color("#c98a55"),
    })));

    // laces: a spine along the top panel and 8 cross-laces wrapping it
    const lace = new THREE.MeshStandardMaterial({ color: "#f3eee2", roughness: 0.6 });
    const surf = (y, a, lift) => { const rr = r(y) + lift; return new THREE.Vector3(rr * Math.sin(a), y, rr * Math.cos(a)); };
    const spine = new THREE.CatmullRomCurve3([-0.5, -0.25, 0, 0.25, 0.5].map(y => surf(y, 0, 0.02)));
    g.add(new THREE.Mesh(new THREE.TubeGeometry(spine, 40, 0.026, 8, false), lace));
    for (let i = 0; i < 8; i++) {
      const y = -0.42 + i * 0.12;
      const arc = new THREE.CatmullRomCurve3([-0.2, -0.1, 0, 0.1, 0.2].map(a => surf(y, a, 0.03 - Math.abs(a) * 0.08)));
      g.add(new THREE.Mesh(new THREE.TubeGeometry(arc, 16, 0.024, 8, false), lace));
    }
    // lay it on its side, laces toward camera-ish
    g.userData.logo = [1, 0, 0];      // stamp on the side panel
    g.userData.roll = Math.PI / 2 - 0.3;   // long axis near horizontal
    g.scale.setScalar(0.92);
    return g;
  }

  // ---------- PUCK ----------
  function puck() {
    const g = new THREE.Group();
    // lathe profile with a soft rounded edge (r=1, half-height 0.25)
    const pts = [], hh = 0.25, er = 0.05;
    pts.push(new THREE.Vector2(0.001, -hh));
    for (let i = 0; i <= 8; i++) { const a = -Math.PI / 2 + (i / 8) * Math.PI / 2; pts.push(new THREE.Vector2(1 - er + Math.cos(a) * er, -hh + er + Math.sin(a) * er)); }
    for (let i = 0; i <= 8; i++) { const a = (i / 8) * Math.PI / 2; pts.push(new THREE.Vector2(1 - er + Math.cos(a) * er, hh - er + Math.sin(a) * er)); }
    pts.push(new THREE.Vector2(0.001, hh));
    const geo = new THREE.LatheGeometry(pts, 128);
    // knurl: vertical ridges on the side band (u around, v along profile)
    const W = 1024, H = 64, bc = document.createElement("canvas"); bc.width = W; bc.height = H;
    const bx = bc.getContext("2d"); bx.fillStyle = "#808080"; bx.fillRect(0, 0, W, H);
    for (let i = 0; i < 180; i++) {
      const x = (i / 180) * W; bx.fillStyle = "#c8c8c8"; bx.fillRect(x, H * 0.36, W / 360, H * 0.28);
    }
    const bump = new THREE.CanvasTexture(bc); bump.wrapS = THREE.RepeatWrapping;
    g.add(new THREE.Mesh(geo, new THREE.MeshPhysicalMaterial({
      color: "#16171b", roughness: 0.62, bumpMap: bump, bumpScale: 2.5, clearcoat: 0.15, clearcoatRoughness: 0.6,
    })));
    // debossed EBK on the face — a slightly glossier decal sitting just above
    const dc = ebkStamp(PUCK_FLAVOR);
    const decal = new THREE.CanvasTexture(dc); decal.colorSpace = THREE.SRGBColorSpace;
    const face = new THREE.Mesh(new THREE.CircleGeometry(0.9, 64),
      new THREE.MeshStandardMaterial({ map: decal, transparent: true, roughness: 0.4, depthWrite: false }));
    face.rotation.x = -Math.PI / 2; face.position.y = hh + 0.002; g.add(face);
    g.userData.logo = [0, 1, 0];
    return g;
  }

  // ---------- scene ----------
  const scene = new THREE.Scene();
  // long lens: balls near the frame edge stay round instead of stretching
  const camera = new THREE.PerspectiveCamera(24, 2, 0.1, 100);
  camera.position.set(0, 0, 21.5);
  // The hero is ambient: slow drift behind the headline. Keep it cheap: pixel
  // density is capped at 1.5x (a 3x phone was drawing 4x the pixels per frame
  // for no visible gain behind the vignette). Keep MSAA on: at 1.5x the ball
  // silhouettes visibly stair-step without it.
  const DPR = Math.min(window.devicePixelRatio || 1, 1.5);
  const renderer = new THREE.WebGLRenderer({ canvas: MOUNT, alpha: true, antialias: true, powerPreference: "low-power" });
  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  scene.add(new THREE.HemisphereLight(0xdfe6ff, 0x1a1408, 0.35));
  const key = new THREE.DirectionalLight(0xfff1e0, 2.2); key.position.set(-5, 7, 9); scene.add(key);
  const rim = new THREE.DirectionalLight(new THREE.Color(accent), 1.1); rim.position.set(6, -2, -6); scene.add(rim);
  const back = new THREE.DirectionalLight(0x7f95ff, 0.9); back.position.set(-7, 3, -8); scene.add(back);

  const makers = { basketball, soccer, baseball, football, puck };
  // composition: two big balls bracketing the headline, three supporting
  const defs = [
    // m: phone layout — balls frame the headline from above and below instead of the sides
    { k: "basketball", x: -6.2, y: 1.5, z: 0,    s: 1.75, m: [-2.3, 3.4, 0.74],  spin: [0.04, 0.12, 0.01] },
    { k: "soccer",     x: 6.0,  y: 1.7, z: -0.8, s: 1.55, m: [2.35, 3.15, 0.66],   spin: [-0.05, 0.1, 0.02] },
    { k: "football",   x: 4.1,  y: -2.3, z: 1.2, s: 1.3,  m: [2.15, -3.05, 0.6],   spin: [0.0, 0.0, 0.0], sway: true },
    { k: "baseball",   x: -3.9, y: -2.4, z: 1.4, s: 1.0,  m: [-2.25, -2.95, 0.52], spin: [0.06, -0.14, 0.02] },
    { k: "puck",       x: 8.4,  y: -0.9, z: -2.4, s: 0.95, m: [0, 0, 0],  spin: [0.0, 0.12, 0.0] },
  ];
  const group = new THREE.Group(); scene.add(group);
  const balls = defs.map((d, i) => {
    const holder = new THREE.Group(), m = makers[d.k]();
    // start every ball with its EBK stamp turned toward the viewer
    if (m.userData.logo && m.userData.up) {
      // aim the stamp at the viewer AND keep the ball's own "up" axis pointing up
      const V = new THREE.Vector3(0.22, 0.12, 1).normalize();
      const L = new THREE.Vector3(...(m.userData.face || m.userData.logo)).normalize();
      const U = new THREE.Vector3(...m.userData.up); U.addScaledVector(L, -U.dot(L)).normalize();
      const W = new THREE.Vector3(0, 1, 0); W.addScaledVector(V, -W.dot(V)).normalize();
      const from = new THREE.Matrix4().makeBasis(L, U, new THREE.Vector3().crossVectors(L, U));
      const to = new THREE.Matrix4().makeBasis(V, W, new THREE.Vector3().crossVectors(V, W));
      const q = new THREE.Quaternion().setFromRotationMatrix(to.multiply(from.transpose()));
      if (m.userData.roll) q.premultiply(new THREE.Quaternion().setFromAxisAngle(V, m.userData.roll));
      m.rotation.setFromQuaternion(q);
    } else if (m.userData.logo) {
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(...m.userData.logo).normalize(), new THREE.Vector3(0.22, 0.12, 1).normalize());
      if (m.userData.roll) q.premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0.22, 0.12, 1).normalize(), m.userData.roll));
      m.rotation.setFromQuaternion(q);
    }
    holder.add(m);
    holder.position.set(d.x, d.y, d.z); holder.scale.setScalar(d.s);
    holder.userData = { def: d, base: holder.position.clone(), phase: i * 1.9, spin: d.spin, sway: d.sway, inner: m, rx: m.rotation.x, ry: m.rotation.y, rz: m.rotation.z };
    group.add(holder); return holder;
  });

  // ---------- sizing ----------
  function resize() {
    const r = MOUNT.getBoundingClientRect();
    const w = Math.max(1, r.width), h = Math.max(1, r.height);
    renderer.setPixelRatio(DPR);
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
    // portrait phones get their own arrangement; tablets scale the desktop one
    const phone = w / h < 0.9;
    group.scale.setScalar(phone ? 1 : w < 980 ? 0.72 : 1);
    for (const b of balls) {
      const d = b.userData.def;
      if (phone) { b.userData.base.set(d.m[0], d.m[1], 0); b.scale.setScalar(d.s * d.m[2] || 0.0001); b.visible = d.m[2] > 0; }
      else { b.userData.base.set(d.x, d.y, d.z); b.scale.setScalar(d.s); b.visible = true; }
      b.position.copy(b.userData.base);
    }
  }
  resize();
  window.addEventListener("resize", resize);

  // ---------- pointer parallax ----------
  let px = 0, py = 0, tx = 0, ty = 0;
  window.addEventListener("pointermove", (e) => {
    tx = (e.clientX / window.innerWidth - 0.5);
    ty = (e.clientY / window.innerHeight - 0.5);
  }, { passive: true });

  function pose(t) {
    px += (tx - px) * 0.05; py += (ty - py) * 0.05;
    group.rotation.y = px * 0.28;
    group.rotation.x = py * 0.18;
    for (const b of balls) {
      const u = b.userData, m = u.inner;
      m.rotation.x = u.rx + t * u.spin[0];
      m.rotation.y = u.ry + t * u.spin[1];
      m.rotation.z = u.rz + t * u.spin[2];
      if (u.sway) { m.rotation.x = u.rx + Math.sin(t * 0.5) * 0.35; m.rotation.y = u.ry + Math.sin(t * 0.37 + 1) * 0.5; }
      b.position.y = u.base.y + Math.sin(t * 0.55 + u.phase) * 0.28;
    }
  }

  // Compile every shader off the main thread (KHR_parallel_shader_compile)
  // before the first draw; a plain first render compiled them synchronously and
  // froze the page for seconds. The canvas fades in once the first frame is up.
  // Then upload the textures one per task: done inside the first render, the
  // eight 1024px uploads (plus mipmaps) were one ~0.5s main-thread freeze.
  function uploadTextures() {
    const list = [];
    scene.traverse((o) => { const m = o.material; if (m) for (const k of ["map", "bumpMap"]) if (m[k] && !list.includes(m[k])) list.push(m[k]); });
    if (!renderer.initTexture) return Promise.resolve();
    return new Promise((done) => { (function next() { const t = list.shift(); if (!t) return done(); renderer.initTexture(t); setTimeout(next, 0); })(); });
  }
  const ready = (renderer.compileAsync ? renderer.compileAsync(scene, camera).catch(() => {}) : Promise.resolve()).then(uploadTextures);
  ready.then(() => {
    pose(0); renderer.render(scene, camera);
    MOUNT.classList.add("on");           // reveal canvas / dim CSS fallback
    if (reduce) return;                  // static frame only

    // 30 fps is plenty for balls that drift a fraction of a turn per second.
    // Wait out the gap with a timer and only then ask for a frame: every
    // requestAnimationFrame makes the browser run a full page update, so
    // skipping frames inside a 60-120 Hz rAF loop still cost nearly as much.
    const FRAME = 1000 / 30;
    let raf = null, wait = null, t0 = performance.now(), tOff = 0;
    function tick(now) {
      raf = null;
      pose(tOff + (now - t0) / 1000);
      renderer.render(scene, camera);
      const spent = performance.now() - now;
      wait = setTimeout(() => { wait = null; raf = requestAnimationFrame(tick); }, Math.max(0, FRAME - spent - 4));
    }
    const running = () => raf !== null || wait !== null;
    const stop = () => { if (raf) cancelAnimationFrame(raf); if (wait) clearTimeout(wait); raf = wait = null; };
    raf = requestAnimationFrame(tick);
    // pause while the tab is hidden or the hero is scrolled out of view
    // (it kept drawing under the sport cards: ~600ms of script per 5s)
    let inView = true;
    const sync = () => {
      if (document.hidden || !inView) { if (running()) { stop(); tOff += (performance.now() - t0) / 1000; } }
      else if (!running()) { t0 = performance.now(); raf = requestAnimationFrame(tick); }
    };
    document.addEventListener("visibilitychange", sync);
    if ("IntersectionObserver" in window)
      new IntersectionObserver(([e]) => { inView = e.isIntersecting; sync(); }).observe(MOUNT);
  });
  window.__ebkHero = { pose, render: () => renderer.render(scene, camera), balls, camera, scene, renderer, group };
}
