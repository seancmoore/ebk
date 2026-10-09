/* EBK Deep Bag v2 hero scene "champagne-bubbles" (scene API 2, docs/deep-bag-v2.md).
   Study: champagne-no-hangover. Rewritten 2026-10-09 as an illustrated still life
   ("Champagne, No Hangover"): the old columns of data dots are gone.

   The story in three beats
     1. The pop (establishing, once): a bottle leaning in an ice bucket trembles, the
        cork flies, foam sprays toward the title and confetti bursts and rains down.
     2. The party (the loop): confetti and a few streamers keep drifting down, bubbles
        rise in two flutes, warm stage bokeh glows behind, the gold cup turns a little
        and catches glints. Nothing repeats loudly, so it can run for minutes.
     3. The morning after (scroll-linked): as the reader scrolls past the hero the
        confetti stops falling and settles on the floor, the streamers lie flat, the
        warm stage light gives way to a cool window light with dust in the beam, and
        the trophy keeps shining while the champagne keeps fizzing. That is the finding:
        champions do fall back, but no further than the math says. No hangover.

   Data (optional, data-scene-data JSON { c: [[league, season, zThis, zNext, zExp], ...] }):
   one piece of confetti per champion; a champion who finished at or above its
   regression benchmark the next season is a gold piece, one who fell short is silver
   (63% gold across the 352). Without data: 340 pieces, the same mix.

   Everything is procedural (lathe bottle, flutes, bucket and cup; instanced confetti;
   GPU particles for spray, bubbles, glints and dust); no models, no logos, no league
   trophies. Glass is cheated (fresnel + highlight alpha instead of transmission) so the
   whole hero costs about one draw pass. The scene renders into a 4x MSAA half-float
   target and tone-maps on the way to the canvas (antialiased edges, soft gold
   highlights); without WebGL2 it renders straight to the canvas.

   opts { seed: 7, confetti: n, still: { t: seconds, morning: 0..1 } (poster renders), fitW, fitFloor (framing for stills),
          caption: string } */
export default function champagnePop(ctx, opts) {
  const { THREE, scene, hero, data } = ctx;
  opts = opts || {};
  const V3 = THREE.Vector3;
  const TAU = Math.PI * 2;
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  const sstep = (a, b, x) => { const k = clamp((x - a) / (b - a), 0, 1); return k * k * (3 - 2 * k); };
  const lerp = (a, b, k) => a + (b - a) * k;
  let seed = (opts.seed || 7) >>> 0;
  const rnd = () => { seed = (seed + 0x6d2b79f5) >>> 0; let t = seed; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const still = opts.still || null;

  const POP = 1.9;                       // seconds after mount: the cork goes
  const GOLD = new THREE.Color("#f2c45a");
  const accent = ctx.accent ? ctx.accent.clone() : GOLD.clone();

  /* ------------------------------------------------------------ canvas -- */
  function canvasTex(w, h, draw, srgb = true) {
    const c = document.createElement("canvas"); c.width = w; c.height = h;
    draw(c.getContext("2d"), w, h);
    const t = new THREE.CanvasTexture(c);
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  }
  const SERIF = 'Georgia, "Times New Roman", serif';
  const labelTex = canvasTex(1024, 512, (g, w, h) => {
    const bg = g.createLinearGradient(0, 0, w, 0);
    bg.addColorStop(0, "#cbbd98"); bg.addColorStop(0.3, "#f3ead5"); bg.addColorStop(0.5, "#f7f0de"); bg.addColorStop(0.7, "#f3ead5"); bg.addColorStop(1, "#cbbd98");
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    const cx = w / 2;
    g.strokeStyle = "#b08532"; g.lineWidth = 6; g.strokeRect(cx - 250, 36, 500, h - 72);
    g.lineWidth = 2; g.strokeRect(cx - 238, 48, 476, h - 96);
    g.fillStyle = "#a57a28"; g.textAlign = "center"; g.textBaseline = "middle";
    // laurel-ish ornament: two arcs of leaves around a star
    g.save(); g.translate(cx, 128);
    for (const s of [-1, 1]) for (let i = 0; i < 6; i++) {
      const a = (-0.2 - i * 0.24) * s + (s < 0 ? Math.PI : 0);
      g.save(); g.translate(Math.cos(a) * 46 * s * s, Math.sin(a) * 30 + 6); g.rotate(a + Math.PI / 2 * s);
      g.beginPath(); g.ellipse(0, 0, 4, 10, 0, 0, TAU); g.fill(); g.restore();
    }
    g.beginPath();
    for (let i = 0; i < 10; i++) { const r = i % 2 ? 7 : 17, a = -Math.PI / 2 + i * Math.PI / 5; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
    g.closePath(); g.fill(); g.restore();
    g.fillStyle = "#1d2440";
    g.font = `600 22px ${SERIF}`; g.fillText("C U V É E   D E S", cx, 196);
    g.font = `700 64px ${SERIF}`; g.fillText("CHAMPIONS", cx, 252);
    g.fillStyle = "#a57a28"; g.fillRect(cx - 90, 296, 180, 3);
    g.fillStyle = "#1d2440"; g.font = `italic 400 38px ${SERIF}`; g.fillText("Brut", cx, 340);
    g.font = `600 17px ${SERIF}`; g.fillStyle = "#56607e"; g.fillText("N O   H A N G O V E R   ·   M M X X V I", cx, 398);
  });
  const plateTex = canvasTex(512, 128, (g, w, h) => {
    g.fillStyle = "#f6e6b8"; g.fillRect(0, 0, w, h);
    g.strokeStyle = "#6d5222"; g.lineWidth = 4; g.strokeRect(10, 10, w - 20, h - 20);
    g.fillStyle = "#4a3714"; g.textAlign = "center"; g.textBaseline = "middle";
    g.font = `700 46px ${SERIF}`; g.fillText("C H A M P I O N S", w / 2, h / 2 + 2);
  });
  const blobTex = canvasTex(128, 128, (g, w, h) => {
    const gr = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    gr.addColorStop(0, "rgba(0,0,0,1)"); gr.addColorStop(0.45, "rgba(0,0,0,0.55)"); gr.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  }, false);
  const windowTex = canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = "#000"; g.fillRect(0, 0, w, h);
    g.filter = "blur(10px)"; g.fillStyle = "#fff";
    const pw = 132, ph = 190, gx = 26, gy = 26, x0 = (w - 3 * pw - 2 * gx) / 2, y0 = (h - 2 * ph - gy) / 2;
    for (let r = 0; r < 2; r++) for (let c = 0; c < 3; c++) g.fillRect(x0 + c * (pw + gx), y0 + r * (ph + gy), pw, ph);
  }, false);

  /* --------------------------------------------------------- materials -- */
  const envMats = [];
  // MeshStandardMaterial throughout (clearcoat dropped): cheaper per draw, the env does the gloss
  function phys(p) { delete p.clearcoat; delete p.clearcoatRoughness; const m = new THREE.MeshStandardMaterial(p); envMats.push([m, m.envMapIntensity]); return m; }
  // shader patches: glass (fresnel + highlight alpha), rim glow, reflection fade
  function patch(m, o) {
    const key = JSON.stringify(o);
    m.customProgramCacheKey = () => key;
    m.onBeforeCompile = (sh) => {
      if (o.fade) {
        sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nvarying float vCnWY;")
          .replace("#include <project_vertex>", "#include <project_vertex>\nvCnWY = (modelMatrix * vec4(transformed, 1.0)).y;");
        sh.fragmentShader = sh.fragmentShader.replace("#include <common>", "#include <common>\nvarying float vCnWY;");
      }
      let inj = "";
      if (o.rim) inj += `outgoingLight += vec3(${o.rim.join(",")}) * pow(1.0 - clamp(abs(dot(normal, normalize(vViewPosition))), 0.0, 1.0), 3.0);\n`;
      if (o.glass) inj += `{ float cnF = pow(1.0 - clamp(abs(dot(normal, normalize(vViewPosition))), 0.0, 1.0), 2.4);
        float cnL = max(max(outgoingLight.r, outgoingLight.g), outgoingLight.b);
        diffuseColor.a = clamp(diffuseColor.a + cnF * ${o.glass[0].toFixed(3)} + cnL * ${o.glass[1].toFixed(3)}, 0.0, 1.0); }\n`;
      if (o.fade) inj += `{ float cnK = smoothstep(-1.5, 0.0, vCnWY); diffuseColor.a *= ${o.fade.toFixed(3)} * cnK * cnK; }\n`;
      sh.fragmentShader = sh.fragmentShader.replace("#include <opaque_fragment>", inj + "#include <opaque_fragment>");
    };
    return m;
  }
  const M = {};
  const glassMat = (tint, base, k) => patch(phys({ color: tint, metalness: 0, roughness: 0.03, clearcoat: 1, clearcoatRoughness: 0.02,
    transparent: true, opacity: base, depthWrite: false, envMapIntensity: 2.2 }), { glass: k });
  M.glass = glassMat("#0d1018", 0.06, [0.55, 0.75]);
  M.ice = glassMat("#a9c4ff", 0.22, [0.45, 0.6]);
  M.liquid = patch(phys({ color: "#e9b949", emissive: "#5a3a06", emissiveIntensity: 0.55, metalness: 0, roughness: 0.12, clearcoat: 1,
    transparent: true, opacity: 0.62, depthWrite: false, envMapIntensity: 1.4 }), { glass: [0.25, 0.2] });

  /* -------------------------------------------------------- geometry -- */
  const v2 = (r, y) => new THREE.Vector2(r, y);
  function smoothProfile(pts, n) {
    const curve = new THREE.SplineCurve(pts.map(([r, y]) => v2(r, y)));
    return curve.getSpacedPoints(n);
  }
  const lathe = (pts, segs = 64) => new THREE.LatheGeometry(pts, segs);
  const rAtFrom = (prof) => (y) => {        // radius of an outer profile at height y
    for (let i = 1; i < prof.length; i++) {
      const a = prof[i - 1], b = prof[i];
      if ((a.y - y) * (b.y - y) <= 0 && a.y !== b.y) return lerp(a.x, b.x, (y - a.y) / (b.y - a.y));
    }
    return prof[prof.length - 1].x;
  };
  function mesh(geo, mat, parent, ro) { const m = new THREE.Mesh(geo, mat); if (ro !== undefined) m.renderOrder = ro; parent.add(m); return m; }
  // merge [geometry, matrix?] parts into one geometry (fewer draw calls: the hero is CPU-bound on draw calls)
  function merge(parts) {
    const gs = parts.map(([g0, m]) => { const g = g0.index ? g0.toNonIndexed() : g0.clone(); if (m) g.applyMatrix4(m); return g; });
    const out = new THREE.BufferGeometry();
    Object.keys(gs[0].attributes).forEach(name => {
      const size = gs[0].attributes[name].itemSize;
      const arrs = gs.map(g => g.attributes[name] ? g.attributes[name].array : new Float32Array(g.attributes.position.count * size));
      const n = arrs.reduce((a, b) => a + b.length, 0), buf = new Float32Array(n); let o = 0;
      arrs.forEach(a => { buf.set(a, o); o += a.length; });
      out.setAttribute(name, new THREE.BufferAttribute(buf, size));
    });
    return out;
  }
  const at = (x, y, z, rx = 0, ry = 0, rz = 0, s = 1) => new THREE.Matrix4().compose(new V3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new V3(s, s, s));

  const root = new THREE.Group(); scene.add(root);

  /* One "uber" material draws every opaque object: colour, metalness, roughness and the
     bottle's green rim glow ride on vertex attributes, and the bottle label and the cup's
     plate sit in one texture atlas. Each group (bucket + bottle, cup, cork) is one merged
     mesh, so the whole still life is a handful of draw calls with no material switches. */
  const atlas = document.createElement("canvas"); atlas.width = atlas.height = 1024;
  {
    const g = atlas.getContext("2d");
    g.drawImage(labelTex.image, 0, 0, 1024, 512);
    g.drawImage(plateTex.image, 0, 512, 512, 128);
    g.fillStyle = "#fff"; g.fillRect(768, 768, 256, 256);
  }
  const atlasTex = new THREE.CanvasTexture(atlas); atlasTex.colorSpace = THREE.SRGBColorSpace; atlasTex.anisotropy = 4;
  const uber = new THREE.MeshStandardMaterial({ vertexColors: true, map: atlasTex, metalness: 1, roughness: 1, envMapIntensity: 1.35 });
  envMats.push([uber, 1.35]);
  function uberPatch(m, fade) {
    const key = "uber" + (fade || "");
    m.customProgramCacheKey = () => key;
    m.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nattribute vec3 aMR; varying vec3 vMR; varying float vCnWY;")
        .replace("#include <begin_vertex>", "#include <begin_vertex>\nvMR = aMR;")
        .replace("#include <project_vertex>", "#include <project_vertex>\nvCnWY = (modelMatrix * vec4(transformed, 1.0)).y;");
      sh.fragmentShader = sh.fragmentShader.replace("#include <common>", "#include <common>\nvarying vec3 vMR; varying float vCnWY;")
        .replace("#include <roughnessmap_fragment>", "float roughnessFactor = vMR.y;")
        .replace("#include <metalnessmap_fragment>", "float metalnessFactor = vMR.x;")
        .replace("#include <opaque_fragment>",
          "outgoingLight += vec3(0.02, 0.16, 0.08) * vMR.z * pow(1.0 - clamp(abs(dot(normal, normalize(vViewPosition))), 0.0, 1.0), 3.0);\n" +
          (fade ? `{ float cnK = smoothstep(-1.5, 0.0, vCnWY); diffuseColor.a *= ${fade.toFixed(3)} * cnK * cnK; }\n` : "") +
          "#include <opaque_fragment>");
    };
    return m;
  }
  uberPatch(uber, 0);
  const SPEC = {
    gold: ["#ffd060", 1, 0.2], collar: ["#d9a03c", 1, 0.3], foil: ["#c9973a", 1, 0.36], plate: ["#e8b24a", 1, 0.28, 0, "plate"],
    lacquer: ["#0b0e18", 0.2, 0.1], bottle: ["#0b3a24", 0, 0.07, 1], label: ["#ffffff", 0, 0.55, 0, "label"], steel: ["#eef1f7", 0.82, 0.12],
  };
  // a part for the uber mesh: geometry (+ placement) tagged with its look
  function U8(geo, m, kind) {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    if (m) g.applyMatrix4(m);
    const [hex, met, rough, rim = 0, uvm] = SPEC[kind], n = g.attributes.position.count, col = new THREE.Color(hex);
    const c = new Float32Array(n * 3), mr = new Float32Array(n * 3), uv = g.attributes.uv ? g.attributes.uv.array : new Float32Array(n * 2), uo = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) {
      c[i * 3] = col.r; c[i * 3 + 1] = col.g; c[i * 3 + 2] = col.b;
      mr[i * 3] = met; mr[i * 3 + 1] = rough; mr[i * 3 + 2] = rim;
      const u = uv[i * 2], v = uv[i * 2 + 1];
      if (uvm === "label") { uo[i * 2] = u; uo[i * 2 + 1] = 0.5 + 0.5 * v; }
      else if (uvm === "plate") { uo[i * 2] = 0.5 * u; uo[i * 2 + 1] = 0.375 + 0.125 * v; }
      else { uo[i * 2] = 0.875; uo[i * 2 + 1] = 0.125; }
    }
    g.setAttribute("color", new THREE.BufferAttribute(c, 3));
    g.setAttribute("aMR", new THREE.BufferAttribute(mr, 3));
    g.setAttribute("uv", new THREE.BufferAttribute(uo, 2));
    return [g];
  }

  /* the bottle leaning in its ice bucket: one mesh */
  const bucketG = new THREE.Group(); root.add(bucketG);
  const bottleG = new THREE.Group(); bucketG.add(bottleG);           // empty: placement for the mouth, cork and spray
  bottleG.position.set(-0.05, 0.5, 0.05); bottleG.scale.setScalar(1.2); bottleG.rotation.set(0.1, 0, -0.32);
  bottleG.updateMatrix();
  const BM = bottleG.matrix, BOTTLE_TOP = 3.13, BOTTLE_LEAN = -0.32;
  const bucketProf = smoothProfile([[0.0, 0.0], [0.68, 0.0], [0.73, 0.04], [0.75, 0.3], [0.765, 0.33], [0.758, 0.37], [0.84, 0.95], [0.9, 1.3],
    [0.915, 1.33], [0.906, 1.37], [0.93, 1.5], [0.97, 1.62], [1.0, 1.68], [0.985, 1.73], [0.95, 1.71], [0.9, 1.55], [0.8, 0.95], [0.72, 0.14], [0.0, 0.13]], 110);
  const bottleProf = smoothProfile([[0.0, 0.06], [0.3, 0.0], [0.43, 0.02], [0.465, 0.12], [0.465, 1.0], [0.465, 1.72], [0.44, 1.98], [0.36, 2.22],
    [0.25, 2.45], [0.18, 2.66], [0.162, 2.86], [0.158, 3.02], [0.172, 3.06], [0.176, 3.13], [0.15, 3.16], [0.12, 3.12], [0.115, 2.9]], 120);
  const rB = rAtFrom(bottleProf.slice(0, 100));
  const foilProf = [];
  for (let y = 2.36; y <= 3.14; y += 0.02) foilProf.push(v2(rB(Math.min(y, 3.1)) + 0.012, y));
  foilProf.push(v2(0.13, 3.15));
  const bm = (x, y, z) => BM.clone().multiply(at(x, y, z));
  const bucketMesh = mesh(merge([
    U8(lathe(bucketProf, 72), null, "steel"),
    U8(lathe(bottleProf, 64), BM, "bottle"),
    U8(lathe(foilProf, 48), BM, "foil"),
    U8(new THREE.CylinderGeometry(rB(2.36) + 0.016, rB(2.2) + 0.016, 0.16, 48, 1, true), bm(0, 2.28, 0), "collar"),
    U8(new THREE.CylinderGeometry(0.469, 0.469, 0.82, 64, 1, true, -1.62, 3.24), bm(0, 1.06, 0), "label"),
  ]), uber, bucketG);
  const iceParts = [];
  for (let i = 0; i < 6; i++) {
    const a = 0.6 + i * 1.05, r = 0.55 + (i % 2) * 0.12;
    iceParts.push([new THREE.BoxGeometry(0.34, 0.3, 0.32), at(Math.cos(a) * r, 1.3 + (i % 3) * 0.06, Math.sin(a) * r, rnd() * 1.2, rnd() * 3, rnd() * 1.2)]);
  }
  mesh(merge(iceParts), M.ice, bucketG, 4);
  // the cork under its foil cap (flies at the pop)
  const corkG = new THREE.Group(); root.add(corkG);
  mesh(merge([U8(lathe(smoothProfile([[0, -0.13], [0.11, -0.13], [0.115, 0.0], [0.13, 0.0], [0.16, 0.06], [0.175, 0.18], [0.16, 0.26], [0.0, 0.28]], 34), 32), null, "foil")]), uber, corkG);
  corkG.scale.setScalar(1.2);

  /* two flutes, merged into one group (same spacing in every layout) */
  const fluteOuter = [[0.0, 0.0], [0.33, 0.0], [0.345, 0.02], [0.3, 0.045], [0.07, 0.07], [0.034, 0.13], [0.03, 0.55], [0.03, 0.92], [0.05, 1.0],
    [0.15, 1.13], [0.225, 1.4], [0.258, 1.8], [0.27, 2.32]];
  const fluteInner = [[0.258, 2.32], [0.248, 1.8], [0.214, 1.4], [0.135, 1.14], [0.03, 1.035], [0.0, 1.03]];
  const fluteProf = smoothProfile(fluteOuter, 80).concat([v2(0.268, 2.335), v2(0.262, 2.335)]).concat(smoothProfile(fluteInner, 50));
  const fluteGeo = lathe(fluteProf, 56);
  const rIn = rAtFrom(smoothProfile(fluteInner.slice().reverse(), 50));
  function liquidGeo(fill) {
    const p = [v2(0, 1.04)];
    for (let y = 1.045; y <= fill; y += 0.03) p.push(v2(Math.max(0.0, rIn(y) - 0.008), y));
    p.push(v2(rIn(fill) - 0.008, fill)); p.push(v2(rIn(fill) - 0.03, fill + 0.012)); p.push(v2(0, fill + 0.014));
    return lathe(p, 48);
  }
  const flutesG = new THREE.Group(); root.add(flutesG);
  const flutes = [{ p: new V3(0, 0, 0), ry: 0.3, fill: 1.98 }, { p: new V3(0.6, 0, -1.5), ry: -0.6, fill: 1.72 }];
  mesh(merge(flutes.map(f => [liquidGeo(f.fill), at(f.p.x, 0, f.p.z, 0, f.ry)])), M.liquid, flutesG, 2);
  mesh(merge(flutes.map(f => [fluteGeo, at(f.p.x, 0, f.p.z, 0, f.ry)])), M.glass, flutesG, 5);

  /* the cup: black two-tier plinth with a gold plate, gold loving cup with two handles: one mesh */
  const trophyG = new THREE.Group(); root.add(trophyG);
  const cupProf = smoothProfile([[0.0, 0.76], [0.6, 0.76], [0.63, 0.8], [0.58, 0.87], [0.42, 0.96], [0.25, 1.12], [0.2, 1.28], [0.29, 1.43], [0.3, 1.5],
    [0.19, 1.64], [0.12, 1.82], [0.12, 1.98], [0.2, 2.1], [0.42, 2.2], [0.72, 2.44], [0.92, 2.84], [1.02, 3.3], [1.08, 3.68], [1.13, 3.84], [1.16, 3.92],
    [1.13, 3.97], [1.07, 3.92], [1.0, 3.7], [0.88, 3.2], [0.5, 2.78], [0.0, 2.68]], 160);
  let trophyMesh;
  {
    const parts = [
      U8(new THREE.CylinderGeometry(1.0, 1.08, 0.44, 72), at(0, 0.22, 0), "lacquer"),
      U8(new THREE.CylinderGeometry(0.82, 0.9, 0.32, 72), at(0, 0.6, 0), "lacquer"),
      U8(new THREE.CylinderGeometry(1.046, 1.064, 0.2, 32, 1, true, -0.42, 0.84), at(0, 0.22, 0), "plate"),
      U8(lathe(cupProf, 80), null, "gold"),
      U8(new THREE.TorusGeometry(1.0, 0.018, 8, 90), at(0, 0.44, 0, Math.PI / 2), "gold"),
    ];
    for (const s of [-1, 1]) {
      const c = new THREE.CatmullRomCurve3([new V3(0.98 * s, 3.5, 0), new V3(1.42 * s, 3.62, 0), new V3(1.72 * s, 3.3, 0),
        new V3(1.62 * s, 2.88, 0), new V3(1.2 * s, 2.62, 0), new V3(0.8 * s, 2.5, 0)]);
      parts.push(U8(new THREE.TubeGeometry(c, 60, 0.072, 12), null, "gold"), U8(new THREE.SphereGeometry(0.1, 16, 12), at(1.71 * s, 3.18, 0), "gold"));
    }
    trophyMesh = mesh(merge(parts), uber, trophyG);
  }

  /* ------------------------------------------------ floor, shadows -- */
  // One plane carries the floor's navy pool, warm pools of stage light under each object and
  // the soft contact shadows, painted into its texture by layout() (one draw call for all of it).
  const FW = 34, FD = 13, FZ = 0.5;
  const floorCanvas = document.createElement("canvas"); floorCanvas.width = 1024; floorCanvas.height = 512;
  const floorTex = new THREE.CanvasTexture(floorCanvas); floorTex.colorSpace = THREE.SRGBColorSpace;
  const floorMat = new THREE.MeshBasicMaterial({ map: floorTex, transparent: true, depthWrite: false });
  const floor = mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), floorMat, root, -2);
  floor.scale.set(FW, 1, FD); floor.position.set(0, -0.002, FZ);
  function paintFloor(spots) {
    const g = floorCanvas.getContext("2d"), W = floorCanvas.width, H = floorCanvas.height;
    const fx = x => (x / FW + 0.5) * W, fz = z => ((z - FZ) / FD + 0.5) * H, sx = W / FW, sz = H / FD;
    g.clearRect(0, 0, W, H);
    const ell = (x, z, rx, rz, stops) => {
      g.save(); g.translate(fx(x), fz(z)); g.scale(rx * sx, rz * sz);
      const gr = g.createRadialGradient(0, 0, 0, 0, 0, 1);
      stops.forEach(([o, c]) => gr.addColorStop(o, c));
      g.fillStyle = gr; g.beginPath(); g.arc(0, 0, 1, 0, TAU); g.fill(); g.restore();
    };
    ell(0, 0.8, 16.5, 5.6, [[0, "rgba(30,42,96,0.62)"], [0.55, "rgba(22,32,78,0.3)"], [1, "rgba(16,24,60,0)"]]);
    spots.forEach(s => ell(s.x, s.z, s.pool[0], s.pool[1], [[0, `rgba(255,205,120,${s.k})`], [0.45, `rgba(255,190,100,${s.k * 0.35})`], [1, "rgba(255,190,100,0)"]]));
    spots.forEach(s => ell(s.x, s.z, s.sh[0], s.sh[1], [[0, `rgba(2,3,8,${s.sk})`], [0.5, `rgba(2,3,8,${s.sk * 0.5})`], [1, "rgba(2,3,8,0)"]]));
    floorTex.needsUpdate = true;
  }

  /* stage light: a soft halo behind the cup and behind the bottle */
  const glowTex = canvasTex(256, 256, (g, w, h) => {
    const gr = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    gr.addColorStop(0, "rgba(255,255,255,1)"); gr.addColorStop(0.3, "rgba(255,255,255,0.45)"); gr.addColorStop(0.65, "rgba(255,255,255,0.1)"); gr.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  }, false);
  function halo(parent, pos, size, col, k) {
    const m = addBlend(new THREE.SpriteMaterial({ map: glowTex, color: new THREE.Color(col).multiplyScalar(k), transparent: true, depthWrite: false }));
    const sp = new THREE.Sprite(m); sp.position.set(...pos); sp.scale.set(size, size, 1); sp.renderOrder = -4; parent.add(sp);
    sp.userData.base = m.color.clone(); return sp;
  }
  const cupHalo = halo(trophyG, [0, 2.7, -1.4], 8.5, "#ffc96a", 0.2);
  const bucketHalo = halo(bucketG, [0.6, 2.4, -1.2], 6, "#ffc96a", 0.11);
  const dawn = halo(root, [-10, 9, -9], 22, "#9fb8ff", 0.16);
  const CUP_MORNING = new THREE.Color(0.2, 0.2, 0.19);

  /* reflections: the bucket and the plinth mirrored under the floor, fading with depth */
  function reflMat(m) {
    const r = m.clone();
    r.transparent = true; r.depthWrite = false;
    envMats.push([r, m.envMapIntensity]);
    return uberPatch(r, 0.42);
  }
  const reflRoot = new THREE.Group(); reflRoot.scale.y = -1; root.add(reflRoot);
  const reflPairs = [[bucketG, bucketMesh], [trophyG, trophyMesh]].map(([g, src]) => {
    const c = new THREE.Group(); reflRoot.add(c);
    const m = new THREE.Mesh(src.geometry, reflMat(src.material)); m.renderOrder = -1; c.add(m);
    return [g, c];
  });

  /* --------------------------------------------------- particle shaders -- */
  const U = {
    uTime: { value: 0 }, uScale: { value: 800 }, uPop: { value: -1 }, uMorning: { value: 0 },
    uOrigin: { value: new V3() }, uDir: { value: new V3(0, 1, 0) }, uGold: { value: accent.clone() },
  };
  const OUT = `#include <tonemapping_fragment>\n#include <colorspace_fragment>`;
  // additive light that leaves alpha alone, so it adds onto the page behind the canvas
  function addBlend(m) {
    m.blending = THREE.CustomBlending; m.blendEquation = THREE.AddEquation;
    m.blendSrc = THREE.SrcAlphaFactor; m.blendDst = THREE.OneFactor;
    m.blendSrcAlpha = THREE.ZeroFactor; m.blendDstAlpha = THREE.OneFactor;
    return m;
  }

  /* spray: foam and droplets from the neck, all in the vertex shader */
  const SPRAY = 900;
  let spray;
  {
    const seeds = new Float32Array(SPRAY * 4), pos = new Float32Array(SPRAY * 3);
    for (let i = 0; i < SPRAY * 4; i++) seeds[i] = rnd();
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 4));
    const m = new THREE.ShaderMaterial({
      uniforms: U, transparent: true, depthWrite: false,
      vertexShader: `
        uniform float uPop; uniform float uScale; uniform vec3 uOrigin; uniform vec3 uDir;
        attribute vec4 aSeed; varying float vA; varying float vMist; varying float vWarm;
        void main() {
          float born = pow(aSeed.x, 1.7) * 1.1;
          float age = uPop - born;
          float life = 1.1 + aSeed.y * 1.5;
          vMist = step(0.9, aSeed.w);
          if (age < 0.0 || age > life) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; vA = 0.0; return; }
          vec3 up = abs(uDir.y) > 0.9 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 0.0);
          vec3 a1 = normalize(cross(uDir, up)), a2 = cross(uDir, a1);
          float ang = aSeed.z * 6.2832, spread = (0.05 + 0.24 * pow(fract(aSeed.y * 7.13), 1.6)) * (1.0 + vMist);
          vec3 dir = normalize(uDir + (a1 * cos(ang) + a2 * sin(ang)) * spread);
          float speed = (7.0 + 9.0 * fract(aSeed.x * 13.7)) * (1.0 - 0.6 * aSeed.x) * (1.0 - 0.45 * vMist);
          float k = 1.5, e = (1.0 - exp(-k * age)) / k;
          vec3 g = vec3(0.0, -7.5, 0.0);
          vec3 p = uOrigin + dir * speed * e + g / k * (age - e);
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          float size = mix(0.035 + 0.05 * aSeed.w, 0.2 + 0.2 * aSeed.w, vMist) * (1.0 + age * (0.6 + 1.6 * vMist));
          gl_PointSize = size * uScale / -mv.z;
          float f = age / life;
          vA = (1.0 - f) * (1.0 - f) * mix(0.95, 0.07, vMist) * smoothstep(0.0, 0.06, age);
          vWarm = fract(aSeed.w * 5.3);
        }`,
      fragmentShader: `
        uniform vec3 uGold; varying float vA; varying float vMist; varying float vWarm;
        void main() {
          vec2 q = gl_PointCoord - 0.5; float d = length(q); if (d > 0.5) discard;
          float body = mix(smoothstep(0.5, 0.2, d), smoothstep(0.5, 0.0, d), vMist);
          float hi = (1.0 - vMist) * smoothstep(0.2, 0.0, length(q - vec2(-0.12, -0.12)));
          vec3 c = mix(vec3(1.0, 0.96, 0.86), uGold * 1.15, vWarm * 0.45) * (1.1 + hi * 1.5);
          gl_FragColor = vec4(c, vA * body);
          ${OUT}
        }`,
    });
    spray = new THREE.Points(g, m); spray.frustumCulled = false; spray.renderOrder = 8; root.add(spray);
  }

  /* bubbles rising in both flutes (one Points; each bubble knows its flute's base and fill) */
  {
    const N = 70 * flutes.length, seeds = new Float32Array(N * 4), base = new Float32Array(N * 4), pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const f = flutes[i % flutes.length];
      seeds[i * 4] = Math.floor(rnd() * 5) / 5 + rnd() * 0.02; seeds[i * 4 + 1] = rnd(); seeds[i * 4 + 2] = rnd(); seeds[i * 4 + 3] = rnd();
      base.set([f.p.x, f.p.y, f.p.z, f.fill], i * 4);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 4));
    g.setAttribute("aBase", new THREE.BufferAttribute(base, 4));
    const m = addBlend(new THREE.ShaderMaterial({
      uniforms: U, transparent: true, depthWrite: false,
      vertexShader: `
        uniform float uTime; uniform float uScale;
        attribute vec4 aSeed; attribute vec4 aBase; varying float vA;
        void main() {
          float fill = aBase.w;
          float k = fract(aSeed.y + uTime * (0.16 + 0.1 * aSeed.z));
          float y = mix(1.07, fill - 0.02, k);
          float r = mix(0.02, 0.17 * smoothstep(1.03, 1.5, y) + 0.04, 0.35 + 0.65 * aSeed.w);
          float a = aSeed.x * 6.2832 + sin(uTime * 2.3 + aSeed.y * 30.0) * 0.08;
          vec3 p = aBase.xyz + vec3(cos(a) * r, y, sin(a) * r);
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = (0.016 + 0.022 * k) * uScale / -mv.z;
          vA = smoothstep(0.0, 0.08, k) * (1.0 - smoothstep(0.9, 1.0, k));
        }`,
      fragmentShader: `
        varying float vA;
        void main() {
          float d = length(gl_PointCoord - 0.5); if (d > 0.5) discard;
          float ring = smoothstep(0.5, 0.3, d) * (0.35 + 0.65 * smoothstep(0.1, 0.35, d));
          gl_FragColor = vec4(vec3(1.0, 0.95, 0.8) * 1.4, ring * vA);
          ${OUT}
        }`,
    }));
    const p = new THREE.Points(g, m); p.frustumCulled = false; p.renderOrder = 3; flutesG.add(p);
  }

  /* glints: four-point stars that flare on the cup, bottle and glass */
  const GL_N = 7;
  const glintPos = new Float32Array(GL_N * 3), glintSeed = new Float32Array(GL_N * 2);
  const glintGeo = new THREE.BufferGeometry();
  glintGeo.setAttribute("position", new THREE.BufferAttribute(glintPos, 3));
  for (let i = 0; i < GL_N; i++) { glintSeed[i * 2] = i * 0.618 % 1; glintSeed[i * 2 + 1] = 0.7 + rnd() * 0.6; }
  glintGeo.setAttribute("aSeed", new THREE.BufferAttribute(glintSeed, 2));
  const glints = new THREE.Points(glintGeo, addBlend(new THREE.ShaderMaterial({
    uniforms: U, transparent: true, depthWrite: false, depthTest: false,
    vertexShader: `
      uniform float uTime; uniform float uScale; uniform float uMorning; uniform float uPop;
      attribute vec2 aSeed; varying float vA;
      void main() {
        float period = mix(5.5, 3.6, uMorning) * aSeed.y;
        float ph = fract(uTime / period + aSeed.x);
        float flare = pow(max(0.0, 1.0 - abs(ph - 0.5) * 7.0), 2.0);
        vA = flare * smoothstep(0.0, 1.0, uPop) * (0.8 + 0.5 * uMorning);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = (0.5 + 0.55 * flare) * uScale / -mv.z;
      }`,
    fragmentShader: `
      uniform vec3 uGold; varying float vA;
      void main() {
        vec2 q = (gl_PointCoord - 0.5) * 2.0;
        float star = max(exp(-abs(q.x) * 26.0) * exp(-abs(q.y) * 2.6), exp(-abs(q.y) * 26.0) * exp(-abs(q.x) * 2.6));
        float core = exp(-dot(q, q) * 18.0);
        vec3 c = mix(vec3(1.0, 0.92, 0.75), vec3(1.0), core) * 2.2;
        gl_FragColor = vec4(c, (star * 0.9 + core) * vA);
        ${OUT}
      }`,
  })));
  glints.frustumCulled = false; glints.renderOrder = 20; root.add(glints);

  /* stage bokeh behind (the party) and dust in the window beam (the morning) */
  function softPoints(N, place, frag, extraVert, ro) {
    const pos = new Float32Array(N * 3), seeds = new Float32Array(N * 4);
    for (let i = 0; i < N; i++) { const p = place(i); pos.set(p, i * 3); for (let k = 0; k < 4; k++) seeds[i * 4 + k] = rnd(); }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 4));
    const m = addBlend(new THREE.ShaderMaterial({ uniforms: U, transparent: true, depthWrite: false, vertexShader: extraVert, fragmentShader: frag }));
    const p = new THREE.Points(g, m); p.frustumCulled = false; p.renderOrder = ro; root.add(p);
    return p;
  }
  const bokeh = softPoints(34, () => [(rnd() * 2 - 1) * 30, 1 + rnd() * 16, -22 - rnd() * 14], `
      uniform vec3 uGold; varying float vA; varying float vW;
      void main() {
        float d = length(gl_PointCoord - 0.5); if (d > 0.5) discard;
        float disc = smoothstep(0.5, 0.3, d) * (0.7 + 0.3 * smoothstep(0.1, 0.45, d));
        gl_FragColor = vec4(mix(uGold, vec3(1.0, 0.9, 0.75), vW), disc * vA);
        ${OUT}
      }`, `
      uniform float uTime; uniform float uScale; uniform float uMorning; uniform float uPop;
      attribute vec4 aSeed; varying float vA; varying float vW;
      void main() {
        vec3 p = position + vec3(sin(uTime * 0.05 + aSeed.x * 6.0) * 1.2, sin(uTime * 0.07 + aSeed.y * 6.0) * 0.6, 0.0);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = (0.9 + aSeed.z * 1.7) * uScale / -mv.z;
        float tw = 0.75 + 0.25 * sin(uTime * (0.4 + aSeed.w) + aSeed.x * 20.0);
        vA = (0.035 + 0.07 * aSeed.w) * tw * (0.3 + 0.7 * smoothstep(4.0, 13.0, abs(position.x))) * (1.0 - uMorning) * (0.35 + 0.65 * smoothstep(0.0, 0.8, uPop));
        vW = aSeed.y;
      }`, -5);
  const dust = softPoints(110, () => [-11 + rnd() * 11, rnd() * 9, -3 + rnd() * 5], `
      varying float vA;
      void main() {
        float d = length(gl_PointCoord - 0.5); if (d > 0.5) discard;
        gl_FragColor = vec4(vec3(0.85, 0.9, 1.0) * 1.3, smoothstep(0.5, 0.0, d) * vA);
        ${OUT}
      }`, `
      uniform float uTime; uniform float uScale; uniform float uMorning;
      attribute vec4 aSeed; varying float vA;
      void main() {
        vec3 p = position + vec3(sin(uTime * 0.09 + aSeed.x * 9.0) * 0.6, mod(uTime * 0.05 * (0.3 + aSeed.y), 1.0) * 1.2 - 0.6, cos(uTime * 0.07 + aSeed.z * 9.0) * 0.4);
        // inside the slanted beam only
        float beam = smoothstep(2.6, 0.6, abs((p.x + 6.2) + (p.y - 5.2) * 0.45));
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = (0.04 + 0.05 * aSeed.w) * uScale / -mv.z;
        vA = uMorning * beam * (0.25 + 0.5 * aSeed.w) * (0.6 + 0.4 * sin(uTime * (0.5 + aSeed.y) + aSeed.z * 30.0));
      }`, 9);

  /* morning: a soft window beam falling from the upper left and its panes on the floor */
  const beamMat = addBlend(new THREE.ShaderMaterial({
    uniforms: U, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `
      uniform float uMorning; varying vec2 vUv;
      void main() {
        float across = smoothstep(0.0, 0.35, vUv.x) * smoothstep(1.0, 0.65, vUv.x);
        float along = smoothstep(0.0, 0.3, vUv.y) * smoothstep(1.0, 0.55, vUv.y);
        gl_FragColor = vec4(vec3(0.72, 0.82, 1.0), across * along * 0.085 * uMorning);
        ${OUT}
      }`,
  }));
  const beam = mesh(new THREE.PlaneGeometry(3.6, 14), beamMat, root, 6);
  beam.position.set(-6.2, 5.2, -2.2); beam.rotation.set(0, 0, 0.42);
  const paneMat = addBlend(new THREE.MeshBasicMaterial({ color: new THREE.Color(0.55, 0.66, 0.95), alphaMap: windowTex, transparent: true, opacity: 0, depthWrite: false }));
  const panes = mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), paneMat, root, -1);
  panes.scale.set(4.4, 1, 3.0); panes.position.set(0.6, 0.006, 1.2); panes.rotation.y = 0.35;

  /* ------------------------------------------------------- confetti -- */
  const champs = data && Array.isArray(data.c) ? data.c : null;
  const NC = clamp(opts.confetti || (champs ? champs.length : 340), 60, 600);
  const goldShare = champs ? champs.filter(c => c[3] >= c[4]).length / champs.length : 0.63;
  const confGeo = new THREE.PlaneGeometry(0.17, 0.085, 4, 1);
  { const p = confGeo.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i); p.setZ(i, 0.03 * Math.cos((x / 0.085) * 1.4)); } confGeo.computeVertexNormals(); }
  const confMat = new THREE.MeshStandardMaterial({ metalness: 0.5, roughness: 0.3, side: THREE.DoubleSide, envMapIntensity: 1.5 });
  envMats.push([confMat, 1.3]);
  const conf = new THREE.InstancedMesh(confGeo, confMat, NC);
  conf.instanceMatrix.setUsage(THREE.DynamicDrawUsage); conf.frustumCulled = false; conf.renderOrder = 1;
  root.add(conf);
  const cPal = { gold: new THREE.Color("#f0bf55"), gold2: new THREE.Color("#d79a33"), silver: new THREE.Color("#f4f6fc"), cream: new THREE.Color("#fff4dc") };
  const C = {
    p: new Float32Array(NC * 3), v: new Float32Array(NC * 3), ax: new Float32Array(NC * 3), ang: new Float32Array(NC), spin: new Float32Array(NC),
    state: new Uint8Array(NC), timer: new Float32Array(NC), size: new Float32Array(NC), term: new Float32Array(NC), ph: new Float32Array(NC),
    yaw: new Float32Array(NC), sx: new Float32Array(NC), done: new Uint8Array(NC),
  };
  for (let i = 0; i < NC; i++) {
    const isGold = (i + 0.5) / NC < goldShare;
    conf.setColorAt(i, isGold ? (rnd() < 0.6 ? cPal.gold : cPal.gold2) : (rnd() < 0.6 ? cPal.silver : cPal.cream));
    const a = new V3(rnd() * 2 - 1, rnd() * 2 - 1, rnd() * 2 - 1).normalize();
    C.ax.set([a.x, a.y, a.z], i * 3);
    C.spin[i] = (2.5 + rnd() * 5) * (rnd() < 0.5 ? -1 : 1);
    C.size[i] = 0.75 + rnd() * 0.5; C.sx[i] = rnd() < 0.3 ? 0.55 : 1;
    C.term[i] = 0.75 + rnd() * 0.6; C.ph[i] = rnd() * TAU; C.yaw[i] = rnd() * TAU;
    C.state[i] = 3; // waiting for the pop
  }
  conf.instanceColor.needsUpdate = true;
  const AIR = 0, LANDED = 1, FADING = 2, WAIT = 3, IM = conf.instanceMatrix.array;
  // spawn x: the full width, thinned over the type column
  function spawnX() { let x = (rnd() * 2 - 1) * 12; if (Math.abs(x) < 3.2 && rnd() < 0.55) x = (x < 0 ? -1 : 1) * (3.2 + rnd() * 8.5); return x; }
  function spawnTop(i, yMin) {
    C.p[i * 3] = spawnX(); C.p[i * 3 + 1] = yMin + rnd() * 5; C.p[i * 3 + 2] = -4 + rnd() * 8;
    C.v[i * 3] = 0; C.v[i * 3 + 1] = -C.term[i]; C.v[i * 3 + 2] = 0; C.state[i] = AIR; C.done[i] = 0;
  }
  const mouth = new V3(), axis = new V3();
  function burst() {
    for (let i = 0; i < NC; i++) {
      if (i % 3 === 0) {                     // a third bursts out with the cork
        const sp = 5 + rnd() * 7, side = new V3(rnd() * 2 - 1, rnd() * 2 - 1, rnd() * 2 - 1).multiplyScalar(0.55);
        const d = axis.clone().add(side).normalize();
        C.p.set([mouth.x, mouth.y, mouth.z], i * 3); C.done[i] = 0;
        C.v.set([d.x * sp, d.y * sp, d.z * sp + 0.8], i * 3);
        C.state[i] = AIR;
      } else spawnTop(i, 8.2 + (i / NC) * 6);
    }
  }
  const qa = new THREE.Quaternion(), qb = new THREE.Quaternion(), qFlat = new THREE.Quaternion().setFromAxisAngle(new V3(1, 0, 0), -Math.PI / 2);
  const mtx = new THREE.Matrix4(), sc = new V3(), pv = new V3(), axv = new V3(), Y = new V3(0, 1, 0), XAX = new V3(1, 0, 0);
  const FLOOR_Z0 = -5, FLOOR_Z1 = 6.5;
  // half the pieces step on each frame (each at 15 Hz with its own dt): the flutter hides it, the CPU halves
  const cAcc = [0, 0]; let cPar = 0;
  function stepConfetti(t, dt0, morning) {
    const fall = 1 + 2.6 * morning, respawn = morning < 0.5;
    cAcc[0] += dt0; cAcc[1] += dt0; cPar ^= 1;
    const dt = cAcc[cPar]; cAcc[cPar] = 0;
    for (let i = cPar; i < NC; i += 2) {
      const s = C.state[i], j = i * 3;
      if (s === WAIT) { if (!C.done[i]) { C.done[i] = 1; mtx.makeScale(0, 0, 0); conf.setMatrixAt(i, mtx); } continue; }
      let scale = C.size[i];
      if (s === AIR) {
        const k = Math.min(1, 1.8 * dt), sway = 0.55;
        C.v[j] += (Math.sin(t * 1.3 + C.ph[i]) * sway + 0.12 - C.v[j]) * k;
        C.v[j + 1] += (-C.term[i] * fall - C.v[j + 1]) * k;
        C.v[j + 2] += (Math.cos(t * 1.1 + C.ph[i]) * sway * 0.6 - C.v[j + 2]) * k;
        C.p[j] += C.v[j] * dt; C.p[j + 1] += C.v[j + 1] * dt; C.p[j + 2] += C.v[j + 2] * dt;
        C.ang[i] += C.spin[i] * dt * (0.6 + 0.4 * Math.min(1, Math.abs(C.v[j + 1])));
        if (C.p[j + 1] <= 0.012) {
          const z = C.p[j + 2];
          if (z > FLOOR_Z0 && z < FLOOR_Z1 && Math.abs(C.p[j]) < 16) { C.p[j + 1] = 0.006 + (i % 7) * 0.0008; C.state[i] = LANDED; C.timer[i] = 7 + rnd() * 12; }
          else if (C.p[j + 1] < -4) { if (respawn) spawnTop(i, 9); }
        }
        if (C.state[i] === AIR) {
          // fast path: axis-angle straight into the instance matrix (no Quaternion/compose)
          const x = C.ax[j], y = C.ax[j + 1], z = C.ax[j + 2], a = C.ang[i], c = Math.cos(a), sn = Math.sin(a), tt = 1 - c;
          const sx = scale * C.sx[i], e = IM, o = i * 16;
          e[o] = (c + x * x * tt) * sx; e[o + 1] = (y * x * tt + z * sn) * sx; e[o + 2] = (z * x * tt - y * sn) * sx; e[o + 3] = 0;
          e[o + 4] = (x * y * tt - z * sn) * scale; e[o + 5] = (c + y * y * tt) * scale; e[o + 6] = (z * y * tt + x * sn) * scale; e[o + 7] = 0;
          e[o + 8] = (x * z * tt + y * sn) * scale; e[o + 9] = (y * z * tt - x * sn) * scale; e[o + 10] = (c + z * z * tt) * scale; e[o + 11] = 0;
          e[o + 12] = C.p[j]; e[o + 13] = C.p[j + 1]; e[o + 14] = C.p[j + 2]; e[o + 15] = 1;
          continue;
        }
        qa.identity();
      } else {
        if (respawn) C.timer[i] -= dt;
        if (s === LANDED && C.timer[i] < 0) { C.state[i] = FADING; C.timer[i] = 0.6; }
        if (C.state[i] === FADING) {
          if (!respawn) { C.state[i] = LANDED; C.timer[i] = 4 + rnd() * 8; C.done[i] = 0; }
          else { C.timer[i] -= dt; scale *= Math.max(0, C.timer[i] / 0.6); if (C.timer[i] <= -0.01) spawnTop(i, 9); }
        }
        if (C.state[i] === LANDED) { if (C.done[i]) continue; C.done[i] = 1; }
        qb.setFromAxisAngle(Y, C.yaw[i]); qa.copy(qb).multiply(qFlat);
      }
      pv.set(C.p[j], C.p[j + 1], C.p[j + 2]);
      sc.set(scale * C.sx[i], scale, scale);
      mtx.compose(pv, qa, sc); conf.setMatrixAt(i, mtx);
    }
    conf.instanceMatrix.needsUpdate = true;
  }

  /* streamers: curly ribbons that drift down and lie flat as coils */
  const NS = 7;
  const strGeo = (() => {
    const turns = 3.2, n = 160, r = 0.16, hgt = 1.5, w = 0.045, pos = [], idx = [];
    for (let k = 0; k <= n; k++) {
      const s = k / n, a = s * turns * TAU, x = Math.cos(a) * r, z = Math.sin(a) * r, y = s * hgt - hgt / 2;
      pos.push(x, y - w, z, x, y + w, z);
      if (k < n) { const b = k * 2; idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2); }
    }
    const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
    return g;
  })();
  const strMat = new THREE.MeshStandardMaterial({ metalness: 0.6, roughness: 0.3, side: THREE.DoubleSide, envMapIntensity: 1.3 });
  envMats.push([strMat, 1.3]);
  const strm = new THREE.InstancedMesh(strGeo, strMat, NS); strm.frustumCulled = false; strm.instanceMatrix.setUsage(THREE.DynamicDrawUsage); root.add(strm);
  const S = [];
  for (let i = 0; i < NS; i++) {
    strm.setColorAt(i, i % 3 === 2 ? cPal.cream : cPal.gold);
    S.push({ p: new V3(), vy: 0, yaw: rnd() * TAU, tilt: (rnd() - 0.5) * 0.5, state: WAIT, flat: 0, timer: 0, ph: rnd() * TAU, delay: 0.4 + i * 0.9 + rnd() * 0.6 });
  }
  strm.instanceColor.needsUpdate = true;
  function spawnStreamer(o, y) {
    let x = (rnd() * 2 - 1) * 10; if (Math.abs(x) < 3.5) x = (x < 0 ? -1 : 1) * (3.5 + rnd() * 6);
    o.p.set(x, y, -2.5 + rnd() * 5.5); o.state = AIR; o.flat = 0; o.vy = 0.55 + rnd() * 0.3;
  }
  function stepStreamers(t, dt, morning, sincePop) {
    const respawn = morning < 0.5;
    S.forEach((o, i) => {
      if (o.state === WAIT) { if (sincePop > o.delay) spawnStreamer(o, 8.6 + rnd() * 2); else { mtx.makeScale(0, 0, 0); strm.setMatrixAt(i, mtx); return; } }
      if (o.state === AIR) {
        o.p.y -= o.vy * (1 + 2.4 * morning) * dt; o.p.x += Math.sin(t * 0.8 + o.ph) * 0.25 * dt; o.yaw += dt * 0.9;
        if (o.p.y <= 0.75 * (1 - o.flat) + 0.03) { o.state = LANDED; o.timer = 10 + rnd() * 10; }
      } else {
        o.flat = Math.min(1, o.flat + dt * 1.8);
        if (respawn) { o.timer -= dt; if (o.timer < 0) spawnStreamer(o, 9 + rnd() * 2); }
      }
      const f = o.flat, sy = lerp(1, 0.07, f);
      pv.set(o.p.x, o.state === AIR ? o.p.y : lerp(o.p.y, 0.03 + 0.75 * sy, f), o.p.z);
      qa.setFromAxisAngle(Y, o.yaw); qb.setFromAxisAngle(XAX, o.tilt * (1 - f)); qa.multiply(qb);
      sc.set(1, sy, 1); mtx.compose(pv, qa, sc); strm.setMatrixAt(i, mtx);
    });
    strm.instanceMatrix.needsUpdate = true;
  }

  /* ---------------------------------------------------------- lights -- */
  // one key light: warm from the front right at the party, cool from the window (left) in the morning
  const key = new THREE.DirectionalLight(new THREE.Color("#ffd49a"), 1.5); key.position.set(4, 10, 8); root.add(key);
  const WARM = new THREE.Color("#ffd49a"), COOL = new THREE.Color("#b9cdff"), KW = new V3(4, 10, 8), KC = new V3(-10, 7, 2);
  const flash = halo(root, [0, 0, 0], 3.2, "#ffe6b0", 0.9); flash.visible = false;

  /* ----------------------------------------------------------- layout -- */
  // wide: bottle + flutes left of the title, the cup right of it; narrow: all three under it
  let layoutKey = "";
  const look = new V3(), camBase = { dist: 17.5, h: 1.5 };
  function layout(aspect) {
    const narrow = aspect < 1.05, key = narrow ? "n" : "w";
    if (key === layoutKey) return;
    layoutKey = key;
    if (!narrow) {
      bucketG.position.set(-6.75, 0, -0.9); trophyG.position.set(6.35, 0, -0.5); trophyG.scale.setScalar(1.1);
      flutesG.position.set(-4.4, 0, 1.15);
    } else {
      bucketG.position.set(-2.55, 0, -1.2); trophyG.position.set(2.35, 0, -0.9); trophyG.scale.setScalar(1.0);
      flutesG.position.set(-0.75, 0, 1.6);
    }
    bottleG.position.set(-0.05, 0.5, 0.05); bottleG.scale.setScalar(1.2); corkG.scale.setScalar(1.2); bottleG.rotation.set(0.1, 0, BOTTLE_LEAN);
    reflPairs.forEach(([g, c]) => { c.position.copy(g.position); c.rotation.copy(g.rotation); c.scale.copy(g.scale); });
    const B = bucketG.position, T = trophyG.position, F = flutesG.position, ts = trophyG.scale.x;
    paintFloor([
      { x: B.x, z: B.z, pool: [2.8, 1.9], k: 0.3, sh: [1.45, 1.25], sk: 0.85 },
      { x: T.x, z: T.z, pool: [2.9, 2.0], k: 0.36, sh: [1.5 * ts, 1.35 * ts], sk: 0.85 },
      ...flutes.map(f => ({ x: F.x + f.p.x, z: F.z + f.p.z, pool: [0.9, 0.7], k: 0.22, sh: [0.48, 0.42], sk: 0.5 })),
    ]);
    // the glints: cup rim and handle, bottle shoulder, flute rims, the plate
    const gp = [];
    gp.push([T.x - 0.72 * ts, 3.92 * ts, T.z + 0.85 * ts], [T.x + 1.62 * ts, 3.45 * ts, T.z + 0.1], [T.x + 0.3 * ts, 2.6 * ts, T.z + 0.95 * ts]);
    bottleG.updateWorldMatrix(true, false);
    gp.push(new V3(0.32, 1.95, 0.25).applyMatrix4(bottleG.matrixWorld).toArray());
    flutes.forEach(f => gp.push([F.x + f.p.x - 0.18, 2.33, F.z + f.p.z + 0.2]));
    gp.push([T.x - 0.3 * ts, 0.25 * ts, T.z + 1.1 * ts]);
    gp.forEach((p, i) => glintPos.set(p, i * 3));
    glintGeo.attributes.position.needsUpdate = true;
    mouth.set(0, BOTTLE_TOP + 0.04, 0).applyMatrix4(bottleG.matrixWorld);
    axis.set(0, 1, 0).transformDirection(bottleG.matrixWorld).normalize();
    camBase.narrow = narrow;
  }

  /* ------------------------------------------------- env + render path -- */
  let R = null, rt = null, blit = null, envDone = false;
  const dbs = new THREE.Vector2();
  function studio() {
    const s = new THREE.Scene();
    const room = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.06, 0.06, 0.075), side: THREE.BackSide }));
    room.scale.set(40, 22, 40); room.position.y = 8; s.add(room);
    const panel = (w, h, pos, col, k) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(col).multiplyScalar(k), side: THREE.DoubleSide }));
      m.position.set(...pos); m.lookAt(0, 2.5, 0); s.add(m);
    };
    panel(16, 9, [0, 17, 4], "#ffffff", 4.0);          // overhead softbox
    panel(3, 18, [-15, 7, 6], "#ffffff", 7.0);         // left strip: the long highlight down every cylinder
    panel(2.6, 16, [15, 6, 5], "#ffd7a0", 6.0);        // right strip, warm
    panel(9, 7, [-9, 6, 15], "#ffffff", 2.6);          // front left, big and soft
    panel(7, 6, [10, 4, 15], "#ffe6c4", 2.0);          // front right
    panel(16, 5, [0, 4.5, 18], "#fff1dc", 1.5);        // wide panel behind the camera: the cup's face
    panel(18, 4, [0, 6, -17], "#9cb2ff", 1.8);         // cool back rim
    panel(8, 5, [-10, 3, -12], "#ffcf86", 2.4);        // warm kicker behind left
    const bounce = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), new THREE.MeshBasicMaterial({ color: new THREE.Color("#3c4250").multiplyScalar(0.35), side: THREE.DoubleSide }));
    bounce.rotation.x = -Math.PI / 2; bounce.position.y = -2.5; s.add(bounce);   // warm floor bounce
    return s;
  }
  function onBefore(renderer) {
    if (!R) {
      R = renderer;
      R.toneMapping = THREE.ACESFilmicToneMapping;
      R.toneMappingExposure = 1.1;
      if (R.capabilities.isWebGL2 && !opts.noRT) {
        rt = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: 4, depthBuffer: true });
        const bs = new THREE.Scene();
        const bm = new THREE.ShaderMaterial({
          uniforms: { tMap: { value: rt.texture } }, depthTest: false, depthWrite: false, blending: THREE.NoBlending,
          vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
          fragmentShader: `uniform sampler2D tMap; varying vec2 vUv;
            void main(){ gl_FragColor = texture2D(tMap, vUv); gl_FragColor.rgb = max(gl_FragColor.rgb, vec3(0.0));
${OUT}
}`,
        });
        const q = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), bm); q.frustumCulled = false; bs.add(q);
        blit = { scene: bs, cam: new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1) };
      }
    }
    if (!envDone) {
      envDone = true;
      try {
        const pm = new THREE.PMREMGenerator(R);
        scene.environment = pm.fromScene(studio(), 0.03).texture;
        pm.dispose();
      } catch (e) { /* no env: the lights still carry it */ }
    }
    R.getDrawingBufferSize(dbs);
    U.uScale.value = dbs.y / (2 * Math.tan((ctx.camera.fov * Math.PI) / 360));
    if (rt) {
      if (rt.width !== dbs.x || rt.height !== dbs.y) rt.setSize(dbs.x, dbs.y);
      R.setRenderTarget(rt);
    }
  }
  scene.onBeforeRender = (renderer) => { try { onBefore(renderer); } catch (e) { rt = null; } };
  scene.onAfterRender = () => {
    if (!rt || !R) return;
    R.setRenderTarget(null);
    R.render(blit.scene, blit.cam);
  };

  /* ----------------------------------------------------------- update -- */
  let lastM = -1, morning = still ? (still.morning || 0) : 0, popped = false, simT = 0, scrollNow = 0, kick = 0;
  const cork = { p: new V3(), v: new V3(), spin: new V3(), rest: false, flying: false };
  const corkQ = new THREE.Quaternion();
  function step(t, dt) {
    const target = still ? (still.morning || 0) : sstep(0.05, 0.42, scrollNow);
    morning += (target - morning) * Math.min(1, dt * 3);
    const m = morning;
    const since = t - POP;
    U.uTime.value = t; U.uMorning.value = m; U.uPop.value = since;
    U.uOrigin.value.copy(mouth); U.uDir.value.copy(axis);
    // cork: tremble, then fly, bounce once, rest
    if (!popped) {
      const k = sstep(POP - 0.9, POP, t);
      const jit = k * 0.012 * Math.sin(t * 90);
      cork.p.copy(axis).multiplyScalar(0.06 * k * k + jit).add(mouth);
      corkG.position.copy(cork.p); corkG.quaternion.copy(bottleG.getWorldQuaternion(corkQ));
      if (t >= POP) {
        popped = true; cork.flying = true; kick = 1;
        cork.v.copy(axis).multiplyScalar(11.5).add(new V3(-1.2, 2.6, 1.6));
        cork.spin.set(9, 3, 6);
        burst();
      }
    } else if (cork.flying) {
      cork.v.y -= 11 * dt;
      cork.p.addScaledVector(cork.v, dt);
      corkG.rotateX(cork.spin.x * dt); corkG.rotateZ(cork.spin.z * dt);
      if (cork.p.y < 0.13 && cork.v.y < 0) {
        cork.p.y = 0.13;
        if (Math.abs(cork.v.y) > 2) { cork.v.y *= -0.32; cork.v.x *= 0.5; cork.v.z *= 0.5; cork.spin.multiplyScalar(0.4); }
        else { cork.flying = false; corkG.rotation.set(0, 0.8, Math.PI / 2); }
      }
      corkG.position.copy(cork.p);
    }
    // lights: warm stage -> cool morning; the pop flash
    key.intensity = lerp(1.5, 3.2, m); key.color.copy(WARM).lerp(COOL, m); key.position.copy(KW).lerp(KC, m);
    flash.visible = since > 0 && since < 0.7;
    if (flash.visible) { flash.position.copy(mouth).addScaledVector(axis, 0.3); flash.material.color.copy(flash.userData.base).multiplyScalar(Math.exp(-since * 6)); }
    if (Math.abs(m - lastM) > 0.0005) {
      lastM = m;
      const envK = lerp(1, 0.7, m);
      for (const [mat, base] of envMats) mat.envMapIntensity = base * envK;
      paneMat.opacity = 0.32 * m;
      dawn.material.color.copy(dawn.userData.base).multiplyScalar(m);
      cupHalo.material.color.copy(cupHalo.userData.base).lerp(CUP_MORNING, m * 0.5);   // the cup keeps its glow
      bucketHalo.material.color.copy(bucketHalo.userData.base).multiplyScalar(lerp(1, 0.3, m));
      floorMat.color.setRGB(lerp(1, 0.72, m), lerp(1, 0.82, m), lerp(1, 1.08, m));
      // what can't be seen is not drawn
      const am = m > 0.004, party = m < 0.996;
      dawn.visible = am; dust.visible = am; beam.visible = am; panes.visible = am; bokeh.visible = party;
    }
    spray.visible = since > -0.1 && since < 4.5;
    // the cup turns a little to catch the light
    trophyG.rotation.y = Math.sin(t * 0.22) * 0.16;
    reflPairs.forEach(([g, c]) => { c.rotation.y = g.rotation.y; });
    if (popped) stepConfetti(t, dt, m); else stepConfetti(t, 0, m);
    stepStreamers(t, dt, m, since);
    kick *= Math.exp(-dt * 7);
  }

  function upd(t, dt) {
    if (still) {
      if (simT === 0) {
        const h = 1 / 30;
        layout(ctx.camera.aspect || 1.6);
        for (let k = h; k <= still.t; k += h) { simT = k; step(k, h); }
        simT = still.t;
      }
      U.uTime.value = still.t;
      return;
    }
    layout(ctx.camera.aspect || 1.6);
    step(t, Math.min(dt, 1 / 15));
  }
  const CAM = {
    fov: [30, 34], far: 200,
    move(cam, s) {
      scrollNow = s.scroll;
      layout(cam.aspect);
      const tanv = Math.tan((cam.fov * Math.PI) / 360);
      const narrow = camBase.narrow;
      const t = still ? still.t : s.t;
      const sc2 = still ? (still.morning || 0) * 0.4 : s.scroll;
      // fit the still life's width, keep the floor about a quarter up from the hero's bottom
      const halfW = opts.fitW || (narrow ? (cam.aspect < 0.6 ? 4.6 : 6.5) : 8.9);
      let d = Math.max(opts.fitW ? 8 : narrow ? 15 : 17.5, halfW / (tanv * cam.aspect));
      d *= 1 - 0.07 * sstep(0, 0.6, sc2);
      const floorNdc = opts.fitFloor !== undefined ? opts.fitFloor : narrow ? -0.84 : -0.5;
      const ly = -floorNdc * d * tanv + (narrow ? -0.4 : 0);
      const yaw = Math.sin(t * 0.06) * 0.045 + (still ? 0 : s.mx) * 0.06;
      const pitch = 0.07 + (still ? 0 : s.my) * 0.03 + 0.05 * sstep(0, 0.6, sc2);
      look.set(0, ly, 0);
      cam.position.set(Math.sin(yaw) * d, ly + Math.tan(pitch) * d, Math.cos(yaw) * d);
      if (kick > 0.001) cam.position.y += Math.sin(t * 70) * 0.05 * kick;
      cam.lookAt(look);
    },
  };

  return {
    caption: opts.caption || "",
    update: upd,
    camera: CAM,
  };
}
