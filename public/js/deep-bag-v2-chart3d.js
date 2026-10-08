/* EBK Deep Bag v2 · interactive 3D bar chart (docs/deep-bag-v2.md, "bars3d").
   ES module, loaded on demand by deep-bag-v2.js. Draws a grid of bars (x cats
   by z cats, height = value) that hang down from or rise above a glass zero
   plane. Drag (or arrow keys) to turn it, hover or tap a bar for its numbers.
   Renders on demand only: no frame is drawn unless something changed, so an
   idle chart costs nothing. HTML labels are projected from 3D each frame so
   text stays crisp at any pixel ratio.

   Framing: the camera distance and centre are solved from the projected bars
   AND the measured label boxes (so a 2x3 grid fills the card like a 5x4 one),
   and when the content is wide and short the card itself gets shorter, so a
   phone never shows a band of empty space above the bars. Value labels that
   would overlap are nudged apart (or the lower-priority one waits for hover).
   "Can't tell from zero" bars are hatched in screen space, never a
   low-opacity fill (warm accents at 15-25% alpha read brown on navy).

   mountBars3D(host, spec, helpers) -> { animateIn(instant), destroy() }
   helpers: { reduce, fmt, tipHTML, showTip, hideTip } from deep-bag-v2.js */
import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.min.js";

const DEG = Math.PI / 180;

function cssVar(node, name, fallback) {
  const v = getComputedStyle(node).getPropertyValue(name).trim();
  return v || fallback;
}

function roundedFootprint(w, d, r) {
  const s = new THREE.Shape();
  const x = -w / 2, y = -d / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + d - r); s.quadraticCurveTo(x + w, y + d, x + w - r, y + d);
  s.lineTo(x + r, y + d); s.quadraticCurveTo(x, y + d, x, y + d - r);
  s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
  // unit-height column, footprint in x/z, base at y = 0
  const g = new THREE.ExtrudeGeometry(s, { depth: 1, bevelEnabled: false, curveSegments: 6 });
  g.rotateX(-Math.PI / 2);
  return g;
}

export function mountBars3D(host, spec, h) {
  const reduce = !!h.reduce;
  const accent = new THREE.Color(cssVar(host, "--v2-accent", "#3ddc97"));
  const dataCol = new THREE.Color(cssVar(host, "--v2-data", "#8f9cc2"));
  const xs = spec.x.cats, zs = spec.z.cats;
  const nx = xs.length, nz = zs.length;
  const DX = 1.9, DZ = 1.55, BW = 1.08, BD = 0.82;
  const dom = spec.domain || (() => {
    const v = spec.cells.filter(c => c.v != null).map(c => c.v);
    return [Math.min(0, ...v) * 1.15, Math.max(0, ...v) * 1.15];
  })();
  const K = 4.4 / (dom[1] - dom[0]);
  const Y = v => v * K;
  const X = i => (i - (nx - 1) / 2) * DX;
  const Z = j => (j - (nz - 1) / 2) * DZ;
  const xmin = X(0) - DX * 0.62, xmax = X(nx - 1) + DX * 0.62;
  const zmin = Z(0) - DZ * 0.7, zmax = Z(nz - 1) + DZ * 0.7;
  const yFloor = Y(dom[0]), yTop = Y(dom[1]);

  /* renderer */
  const PR = Math.min(window.devicePixelRatio || 1, 2);
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "low-power" });
  renderer.setPixelRatio(PR);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0x000000, 0);
  host.appendChild(renderer.domElement);
  const labels = document.createElement("div");
  labels.className = "v2-3d-labels";
  host.appendChild(labels);
  const hint = document.createElement("div");
  hint.className = "v2-3d-hint";
  hint.textContent = matchMedia("(pointer: coarse)").matches ? "Drag sideways to turn · tap a bar" : "Drag to turn · hover a bar";
  host.appendChild(hint);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 200);
  scene.add(new THREE.HemisphereLight(0xcfd8ff, 0x0b1022, 1.25));
  const key = new THREE.DirectionalLight(0xffffff, 1.7);
  key.position.set(5, 12, 9);
  scene.add(key);
  const rim = new THREE.DirectionalLight(accent.clone().lerp(new THREE.Color(0xffffff), 0.5), 0.55);
  rim.position.set(-8, 4, -10);
  scene.add(rim);

  const disposables = [];
  const keep = o => (disposables.push(o), o);

  /* zero plane: faint glass with a soft rim */
  const planeW = xmax - xmin, planeD = zmax - zmin;
  const plane = new THREE.Mesh(
    keep(new THREE.PlaneGeometry(planeW, planeD)),
    keep(new THREE.MeshBasicMaterial({ color: 0xa8b6ff, transparent: true, opacity: 0.075, side: THREE.DoubleSide, depthWrite: false }))
  );
  plane.rotation.x = -Math.PI / 2;
  plane.renderOrder = 2;
  scene.add(plane);
  const rimPts = [xmin, zmin, xmax, zmin, xmax, zmin, xmax, zmax, xmax, zmax, xmin, zmax, xmin, zmax, xmin, zmin];
  const rimGeo = keep(new THREE.BufferGeometry());
  rimGeo.setAttribute("position", new THREE.Float32BufferAttribute(rimPts.flatMap((v, i) => i % 2 ? [] : [v, 0, rimPts[i + 1]]), 3));
  scene.add(new THREE.LineSegments(rimGeo, keep(new THREE.LineBasicMaterial({ color: 0xdfe6ff, transparent: true, opacity: 0.55 }))));

  /* back-wall ticks + floor grid */
  const ticks = [];
  {
    const span = dom[1] - dom[0];
    const raw = span / 5, mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const step = [1, 2, 2.5, 5, 10].map(s => s * mag).find(s => s >= raw) || mag;
    for (let v = Math.ceil(dom[0] / step) * step; v <= dom[1] + 1e-9; v += step) ticks.push(Math.round(v * 1e6) / 1e6);
  }
  const wall = [];
  ticks.forEach(t => {
    if (Math.abs(t) < 1e-9) return;
    const y = Y(t);
    wall.push(xmin, y, zmin, xmax, y, zmin, xmin, y, zmin, xmin, y, zmax);
  });
  wall.push(xmin, yFloor, zmin, xmin, Math.max(yTop, 0), zmin);
  const wallGeo = keep(new THREE.BufferGeometry());
  wallGeo.setAttribute("position", new THREE.Float32BufferAttribute(wall, 3));
  scene.add(new THREE.LineSegments(wallGeo, keep(new THREE.LineBasicMaterial({ color: 0x9fb0e0, transparent: true, opacity: 0.16 }))));

  let hovered = null, tapped = null, shown = false;

  /* bars */
  const unit = keep(roundedFootprint(BW, BD, 0.13));
  const edges = keep(new THREE.EdgesGeometry(unit, 40));
  const bars = [];
  const cellAt = {};
  spec.cells.forEach(c => { cellAt[c.x + "|" + c.z] = c; });
  xs.forEach((xc, i) => zs.forEach((zc, j) => {
    const c = cellAt[xc.key + "|" + zc.key];
    if (!c) return;
    const has = c.v !== null && c.v !== undefined;
    const unclear = c.sig === false;
    const col = c.emph ? accent : dataCol;
    const mat = keep(new THREE.MeshStandardMaterial({
      color: col, roughness: c.emph ? 0.34 : 0.55, metalness: 0.06,
      emissive: col, emissiveIntensity: c.emph ? 0.22 : 0.05,
      transparent: unclear, opacity: 1, depthWrite: !unclear,
    }));
    if (unclear) hatch(mat);
    const g = new THREE.Group();
    g.position.set(X(i), 0, Z(j));
    const mesh = new THREE.Mesh(unit, mat);
    g.add(mesh);
    let outline = null;
    if (unclear && has) {
      const lm = keep(new THREE.LineDashedMaterial({ color: col, dashSize: 0.09, gapSize: 0.07, transparent: true, opacity: 0.85 }));
      outline = new THREE.LineSegments(edges, lm);
      outline.computeLineDistances();
      g.add(outline);
    }
    let whisker = null;
    if (has && c.lo !== undefined) {
      const wg = keep(new THREE.BufferGeometry());
      const zf = BD / 2 + 0.03, cap = 0.14;
      wg.setAttribute("position", new THREE.Float32BufferAttribute([
        0, Y(c.lo), zf, 0, Y(c.hi), zf, -cap, Y(c.lo), zf, cap, Y(c.lo), zf, -cap, Y(c.hi), zf, cap, Y(c.hi), zf], 3));
      whisker = new THREE.LineSegments(wg, keep(new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: c.emph ? 0.75 : 0.45 })));
      whisker.visible = false;
      g.add(whisker);
    }
    if (!has) {
      const ring = new THREE.Mesh(keep(new THREE.RingGeometry(0.2, 0.25, 32)), keep(new THREE.MeshBasicMaterial({ color: dataCol, transparent: true, opacity: 0.5, side: THREE.DoubleSide })));
      ring.rotation.x = -Math.PI / 2; ring.position.y = 0.01;
      g.add(ring);
    }
    scene.add(g);
    const b = { c, i, j, g, mesh, mat, outline, whisker, has, grow: 0, title: xc.label + " · " + zc.label };
    mesh.userData.bar = b;
    bars.push(b);
  }));
  // screen-space diagonal hatch: full-strength stripes, nearly clear gaps
  function hatch(mat) {
    mat.onBeforeCompile = sh => {
      sh.uniforms.uHatchPR = { value: PR };
      sh.fragmentShader = "uniform float uHatchPR;\n" + sh.fragmentShader.replace("#include <dithering_fragment>",
        "#include <dithering_fragment>\n  float hs = mod(gl_FragCoord.x + gl_FragCoord.y, 7.0 * uHatchPR);\n  gl_FragColor.a *= hs < 2.4 * uHatchPR ? 0.92 : 0.07;");
    };
    mat.customProgramCacheKey = () => "v2-hatch";
  }
  function setGrow(b, s) {
    b.grow = s;
    if (!b.has) return;
    const hgt = Math.max(0.0001, Math.abs(Y(b.c.v)) * s);
    b.mesh.scale.set(1, hgt, 1);
    b.mesh.position.y = b.c.v < 0 ? -hgt : 0;
    if (b.outline) { b.outline.scale.copy(b.mesh.scale); b.outline.position.copy(b.mesh.position); }
    if (b.whisker) b.whisker.visible = s > 0.98 && (b === hovered || b === tapped);
  }
  bars.forEach(b => setGrow(b, 0));

  /* HTML labels */
  const L = [];
  function label(cls, text, pos, extra) {
    const d = document.createElement("div");
    d.className = "l " + cls;
    d.textContent = text;
    labels.appendChild(d);
    const o = { d, pos: new THREE.Vector3().copy(pos), ...extra };
    L.push(o);
    return o;
  }
  const narrow = () => host.clientWidth < 560;
  const useShort = () => true; // 3D always uses short names; Flat/Table/tooltips carry the full ones
  xs.forEach((xc, i) => label("l-x", useShort() && xc.short ? xc.short : xc.label, new THREE.Vector3(X(i), yFloor - 0.35, zmax + 0.2), { kind: "x", full: xc.label, short: xc.short }));
  zs.forEach((zc, j) => label("l-z", narrow() && zc.short ? zc.short : zc.label, new THREE.Vector3(xmax + 0.35, 0, Z(j)), { kind: "z", full: zc.label, short: zc.short }));
  ticks.forEach(t => label("l-t", h.fmt(t, Math.abs(t) % 1 ? 1 : 0, spec.signed), new THREE.Vector3(xmin - 0.05, Y(t), zmin)));
  const valLabels = bars.filter(b => b.has).map(b => {
    const y = Y(b.c.v);
    const o = label("l-v" + (b.c.emph ? " is-emph" : ""), h.fmt(b.c.v, spec.decimals == null ? 1 : spec.decimals, spec.signed),
      new THREE.Vector3(X(b.i), y + (b.c.v < 0 ? -0.32 : 0.32), Z(b.j) + BD / 2), { bar: b });
    o.d.style.opacity = "0";
    return o;
  });
  // an empty cell with a real sample size says so; a structurally empty one (n 0 / missing) stays quiet
  bars.filter(b => !b.has && b.c.n > 0).forEach(b => label("l-v l-empty", "n " + b.c.n, new THREE.Vector3(X(b.i), 0.25, Z(b.j)), {}));

  /* camera rig */
  const target = new THREE.Vector3(0, (Math.max(yTop, 0) + yFloor) / 2 + 0.2, 0);
  let TH0 = 0, PH0 = 0;
  function defaults() {
    const v = spec.view || {};
    TH0 = (narrow() ? (v.thetaNarrow != null ? v.thetaNarrow : -14) : (v.theta != null ? v.theta : -30)) * DEG;
    PH0 = (narrow() ? (v.phiNarrow != null ? v.phiNarrow : 19) : (v.phi != null ? v.phi : 17)) * DEG;
  }
  defaults();
  let theta = TH0, phi = PH0, radius = 20;
  let lastNarrow = null, lastW = 0, baseH = 0;
  const yHi = Math.max(yTop, 0);
  const geo = [];
  for (const x of [xmin, xmax]) for (const y of [yFloor, yHi]) for (const z of [zmin, zmax]) geo.push(new THREE.Vector3(x, y, z));
  const M = { t: 8, r: 8, b: 26, l: 8 };          // px kept clear inside the card (b: the drag hint)
  function ndcBox() {
    place();
    camera.updateMatrixWorld();
    const b = { x0: 9, x1: -9, y0: 9, y1: -9 };
    for (const c of geo) {
      const p = c.clone().project(camera);
      b.x0 = Math.min(b.x0, p.x); b.x1 = Math.max(b.x1, p.x); b.y0 = Math.min(b.y0, p.y); b.y1 = Math.max(b.y1, p.y);
    }
    return b;
  }
  function fit() {
    const w = host.clientWidth;
    if (!w) return;
    if (Math.abs(w - lastW) > 1) { host.style.height = ""; lastW = w; baseH = host.clientHeight; }
    const hgt = host.clientHeight;
    if (!hgt) return;
    renderer.setSize(w, hgt, false);
    camera.aspect = w / hgt;
    camera.clearViewOffset();
    if (lastNarrow !== narrow()) { lastNarrow = narrow(); defaults(); if (!shown || reduce) { theta = TH0; phi = PH0; } }
    host.classList.toggle("is-narrow", narrow());
    camera.updateProjectionMatrix();
    L.forEach(o => {
      if (o.kind === "x") o.d.textContent = useShort() && o.short ? o.short : o.full;
      if (o.kind === "z") o.d.textContent = narrow() && o.short ? o.short : o.full;
    });
    const th = theta, ph = phi;
    theta = TH0; phi = PH0;
    // 1) distance that makes the bars + floor + back wall fill `pad` of the frame;
    // 2) measure the real label boxes around it and shrink `pad` to make room;
    // 3) centre the whole thing (geometry + labels) with a view offset.
    let pad = 0.9, union = null, geoPx = null;
    for (let pass = 0; pass < 4; pass++) {
      camera.clearViewOffset();
      let lo = 2, hi = 160;
      for (let k = 0; k < 24; k++) {
        radius = (lo + hi) / 2;
        const b = ndcBox();
        if (Math.max(b.x1 - b.x0, b.y1 - b.y0) / 2 > pad) lo = radius; else hi = radius;
      }
      radius = hi;
      const box = ndcBox();
      camera.setViewOffset(w, hgt, ((box.x0 + box.x1) / 2) * w / 2, -((box.y0 + box.y1) / 2) * hgt / 2, w, hgt);
      place(); camera.updateMatrixWorld();
      projectLabels(true);
      geoPx = { x0: (box.x0 - (box.x0 + box.x1) / 2 + 1) * w / 2, x1: (box.x1 - (box.x0 + box.x1) / 2 + 1) * w / 2,
                y0: (1 - (box.y1 - (box.y0 + box.y1) / 2)) * hgt / 2, y1: (1 - (box.y0 - (box.y0 + box.y1) / 2)) * hgt / 2 };
      union = Object.assign({}, geoPx);
      const hr = host.getBoundingClientRect();
      L.forEach(o => {
        if (!o.d.textContent) return;
        const r = o.d.getBoundingClientRect();
        if (!r.width) return;
        union.x0 = Math.min(union.x0, r.left - hr.left); union.x1 = Math.max(union.x1, r.right - hr.left);
        union.y0 = Math.min(union.y0, r.top - hr.top); union.y1 = Math.max(union.y1, r.bottom - hr.top);
      });
      const gw = geoPx.x1 - geoPx.x0, gh = geoPx.y1 - geoPx.y0;
      const availW = w - M.l - M.r - ((union.x1 - union.x0) - gw), availH = hgt - M.t - M.b - ((union.y1 - union.y0) - gh);
      const sc = Math.min(availW / gw, availH / gh);
      if (Math.abs(sc - 1) < 0.01) break;
      pad = Math.max(0.25, Math.min(0.98, pad * sc));
    }
    // centre geometry + labels inside the margins
    const dx = (union.x0 + union.x1) / 2 - (M.l + (w - M.r)) / 2, dy = (union.y0 + union.y1) / 2 - (M.t + (hgt - M.b)) / 2;
    const vo = camera.view;
    camera.setViewOffset(w, hgt, vo.offsetX + dx, vo.offsetY + dy, w, hgt);
    // wide-and-short content: shorten the card instead of leaving a band of empty space
    const needH = Math.ceil((union.y1 - union.y0) + M.t + M.b);
    const minH = narrow() ? 250 : 320;
    if (needH < hgt - 24 && hgt <= baseH + 1) {
      const nh = Math.max(minH, needH);
      if (nh < hgt - 4) { host.style.height = nh + "px"; theta = th; phi = ph; return; } // the ResizeObserver re-fits
    }
    theta = th; phi = ph;
    measureVals();
  }
  function place() {
    camera.position.set(
      target.x + radius * Math.cos(phi) * Math.sin(theta),
      target.y + radius * Math.sin(phi),
      target.z + radius * Math.cos(phi) * Math.cos(theta));
    camera.lookAt(target);
  }

  const v3 = new THREE.Vector3();
  let valSize = new Map();
  function measureVals() {
    valSize = new Map();
    valLabels.forEach(o => valSize.set(o, { w: o.d.offsetWidth, h: o.d.offsetHeight }));
  }
  function projectLabels(fitting) {
    const w = host.clientWidth, hgt = host.clientHeight;
    const placed = [];
    L.forEach(o => {
      v3.copy(o.pos).project(camera);
      const x = (v3.x * 0.5 + 0.5) * w, y = (-v3.y * 0.5 + 0.5) * hgt;
      const base = o.d.classList.contains("l-z") || o.kind === "axis" ? "translate(0,-50%)" : o.d.classList.contains("l-t") ? "translate(-100%,-50%)" : "translate(-50%,-50%)";
      const rot = o.kind === "x" && narrow() ? "translate(-100%,-50%) rotate(-32deg)" : base;
      o.d.style.transformOrigin = o.kind === "x" && narrow() ? "100% 50%" : "";
      o.d.style.transform = `translate(${x.toFixed(1)}px,${y.toFixed(1)}px) ${rot}`;
      if (o.bar) {
        const b = o.bar;
        const vis = b.grow > 0.98 && (b.c.emph || b === hovered || b === tapped);
        o.d.style.opacity = vis ? "1" : "0";
        if (b.c.v < 0) o.pos.y = Y(b.c.v) - 0.32; // stays at the bar end
        if (vis && !fitting) placed.push({ o, x, y, pri: (b === hovered || b === tapped ? 100 : 0) + b.j * 2 + Math.abs(b.c.v) / 100 });
      }
    });
    if (placed.length < 2) return;
    // value labels that would overlap: keep the hovered / front-most one, move the
    // other above or below it, and if there is no room let it wait for hover
    placed.sort((a, b) => b.pri - a.pri);
    const taken = [];
    const hit = (r) => taken.some(t => r.x0 < t.x1 && r.x1 > t.x0 && r.y0 < t.y1 && r.y1 > t.y0);
    placed.forEach(p => {
      const sz = valSize.get(p.o) || { w: p.o.d.offsetWidth, h: p.o.d.offsetHeight };
      const at = dy => ({ x0: p.x - sz.w / 2 - 2, x1: p.x + sz.w / 2 + 2, y0: p.y + dy - sz.h / 2 - 1, y1: p.y + dy + sz.h / 2 + 1 });
      let dy = 0, r = at(0);
      if (hit(r)) {
        const opts = [-(sz.h + 3), sz.h + 3, -2 * (sz.h + 3), 2 * (sz.h + 3)];
        const ok = opts.find(d => !hit(at(d)));
        if (ok === undefined) { p.o.d.style.opacity = "0"; return; }
        dy = ok; r = at(dy);
        p.o.d.style.transform = `translate(${p.x.toFixed(1)}px,${(p.y + dy).toFixed(1)}px) translate(-50%,-50%)`;
      }
      taken.push(r);
    });
  }

  /* render on demand */
  let raf = 0, alive = true;
  const anims = [];
  function frame(now) {
    raf = 0;
    if (!alive) return;
    let more = false;
    for (let k = anims.length - 1; k >= 0; k--) { if (anims[k](now)) more = true; else anims.splice(k, 1); }
    place();
    renderer.render(scene, camera);
    projectLabels();
    if (more) invalidate();
  }
  function invalidate() { if (!raf && alive) raf = requestAnimationFrame(frame); }
  function animate(ms, fn, delay = 0) {
    const t0 = performance.now() + delay;
    anims.push(now => {
      const k = Math.max(0, Math.min(1, (now - t0) / ms));
      fn(k >= 1 ? 1 : 1 - Math.pow(2, -10 * k));
      return k < 1;
    });
    invalidate();
  }

  /* interaction */
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  function pick(ev) {
    const r = host.getBoundingClientRect();
    ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObjects(bars.map(b => b.mesh), false)[0];
    return hit ? hit.object.userData.bar : null;
  }
  function highlight(b) {
    bars.forEach(x => {
      x.mat.emissiveIntensity = x === b ? (x.c.emph ? 0.45 : 0.3) : (x.c.emph ? 0.22 : 0.05);
      if (x.whisker) x.whisker.visible = x.grow > 0.98 && (x === hovered || x === tapped);
    });
    invalidate();
  }
  function tipFor(b, ev) {
    if (!b) { h.hideTip(); return; }
    const d = { title: b.title, v: b.c.v, lo: b.c.lo, hi: b.c.hi, n: b.c.n, p: b.c.p, sig: b.c.sig, emph: b.c.emph, unit: spec.unit, note: b.c.note };
    h.showTip(h.tipHTML(d, spec), ev.clientX, ev.clientY - 8);
  }
  let drag = null;
  const onDown = ev => {
    drag = { x: ev.clientX, y: ev.clientY, t: theta, p: phi, moved: false, id: ev.pointerId, type: ev.pointerType };
    host.classList.add("is-touched");
  };
  const onMove = ev => {
    if (drag && drag.id === ev.pointerId) {
      const dx = ev.clientX - drag.x, dy = ev.clientY - drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true;
      if (drag.moved) {
        if (!host.hasPointerCapture(ev.pointerId)) try { host.setPointerCapture(ev.pointerId); } catch (e) {}
        theta = Math.max(-78 * DEG, Math.min(78 * DEG, drag.t - dx * 0.0065));
        if (drag.type !== "touch") phi = Math.max(3 * DEG, Math.min(64 * DEG, drag.p + dy * 0.004));
        h.hideTip();
        invalidate();
      }
      return;
    }
    if (ev.pointerType === "touch") return;
    const b = pick(ev);
    if (b !== hovered) { hovered = b; highlight(b); }
    tipFor(b, ev);
  };
  const onUp = ev => {
    if (drag && !drag.moved) {
      const b = pick(ev);
      tapped = b === tapped ? null : b;
      highlight(tapped);
      tipFor(tapped, ev);
    }
    drag = null;
  };
  const onLeave = () => { if (!drag) { hovered = null; highlight(tapped); h.hideTip(); } };
  const onKey = ev => {
    const step = 9 * DEG;
    if (ev.key === "ArrowLeft") theta = Math.max(-78 * DEG, theta - step);
    else if (ev.key === "ArrowRight") theta = Math.min(78 * DEG, theta + step);
    else if (ev.key === "ArrowUp") phi = Math.min(64 * DEG, phi + step / 2);
    else if (ev.key === "ArrowDown") phi = Math.max(3 * DEG, phi - step / 2);
    else return;
    ev.preventDefault();
    host.classList.add("is-touched");
    invalidate();
  };
  host.addEventListener("pointerdown", onDown);
  host.addEventListener("pointermove", onMove);
  host.addEventListener("pointerup", onUp);
  host.addEventListener("pointercancel", () => { drag = null; });
  host.addEventListener("pointerleave", onLeave);
  host.addEventListener("keydown", onKey);
  const ro = new ResizeObserver(() => { fit(); invalidate(); });
  ro.observe(host);
  fit();
  invalidate();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { if (alive) { lastW = 0; fit(); invalidate(); } });

  return {
    animateIn(instant) {
      if (shown) return;
      shown = true;
      if (instant || reduce) { bars.forEach(b => setGrow(b, 1)); invalidate(); return; }
      const t0 = theta;
      theta = t0 - 24 * DEG; phi = 30 * DEG;
      animate(1700, k => { theta = t0 - 24 * DEG * (1 - k); phi = (30 - 8 * k) * DEG; });
      bars.forEach((b, n) => animate(950, k => setGrow(b, k), 120 + (b.j * nx + b.i) * 55));
    },
    destroy() {
      alive = false;
      if (raf) cancelAnimationFrame(raf);
      ro.disconnect();
      h.hideTip();
      disposables.forEach(d => d.dispose && d.dispose());
      renderer.dispose();
      renderer.forceContextLoss && renderer.forceContextLoss();
      host.innerHTML = "";
    },
  };
}
