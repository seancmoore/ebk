/* EBK Deep Bag v2 · article runtime (docs/deep-bag-v2.md)
   Classic deferred script. The page reads fine without it: every chart ships
   with its data table, the hero has a static fallback, the video has a poster.
   With it: scroll reveals, counters, 2D charts drawn from the JSON in each
   .v2-chart, a 3D view for "bars3d" charts, the extra chart types (agecurve,
   rangeplot, ridge3d: deep-bag-v2-xcharts.js), the ambient hero scene
   (deep-bag-v2-scene.js + deep-bag-v2-scenes/<name>.js), and the clip that
   plays only while it is on screen. three.js and every module load only when
   a page needs them: the 3D chart code when a 3D chart comes near the
   viewport, the scene only when the hero may animate.
   Everything that moves is skipped under prefers-reduced-motion. */
(function () {
  "use strict";
  var doc = document, root = doc.documentElement;
  root.classList.add("v2-js");
  var mq = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : { matches: false };
  var reduce = mq.matches;
  var NS = "http://www.w3.org/2000/svg";
  var MINUS = "−";
  var BASE = "/js/";
  // the ?v= on this script's URL versions every module it loads
  var Q = (function () {
    try { var m = (doc.currentScript && doc.currentScript.src || "").match(/[?&]v=([^&#]+)/); return m ? "?v=" + m[1] : ""; }
    catch (e) { return ""; }
  })();

  /* ------------------------------------------------------------ utils -- */
  function webglOK() {
    try {
      var c = doc.createElement("canvas");
      return !!(window.WebGLRenderingContext && (c.getContext("webgl2") || c.getContext("webgl")));
    } catch (e) { return false; }
  }
  // Phones and data-savers get the static hero; 3D charts still load on demand (render-on-demand, cheap).
  function lowPower() {
    var n = navigator, c = n.connection || {};
    if (c.saveData) return true;
    if (n.deviceMemory && n.deviceMemory < 4) return true;
    var coarse = window.matchMedia && matchMedia("(pointer: coarse)").matches;
    return coarse && Math.min(screen.width, screen.height) < 820;
  }
  function fmt(v, dec, signed) {
    if (v === null || v === undefined || isNaN(v)) return "n/a";
    var s = Math.abs(v).toFixed(dec == null ? 1 : dec);
    if (+s === 0) return s;
    if (v < 0) return MINUS + s;
    return (signed ? "+" : "") + s;
  }
  function fmtP(p) {
    if (p === undefined || p === null) return "";
    if (p < 0.001) return "p < 0.001";
    return "p = " + (p < 0.01 ? p.toFixed(3) : p.toFixed(2)).replace(/^0/, "0");
  }
  function el(tag, attrs, parent) {
    var e = doc.createElementNS(NS, tag);
    for (var k in attrs) if (attrs[k] !== undefined && attrs[k] !== null) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  function txt(parent, x, y, s, cls, anchor) {
    var t = el("text", { x: x, y: y, "class": cls, "text-anchor": anchor || "start", "dominant-baseline": "middle" }, parent);
    t.textContent = s;
    return t;
  }
  function ease(t) { return t >= 1 ? 1 : 1 - Math.pow(2, -10 * t); } // outExpo
  function tween(ms, step, done) {
    if (reduce) { step(1); if (done) done(); return; }
    var t0 = performance.now();
    (function f(now) {
      var k = Math.min(1, (now - t0) / ms);
      step(ease(k));
      if (k < 1) requestAnimationFrame(f); else if (done) done();
    })(t0);
  }
  function niceTicks(a, b, target) {
    var span = b - a, raw = span / (target || 5), mag = Math.pow(10, Math.floor(Math.log10(raw)));
    var steps = [1, 2, 2.5, 5, 10], step = mag;
    for (var i = 0; i < steps.length; i++) { if (steps[i] * mag >= raw) { step = steps[i] * mag; break; } }
    var out = [], v = Math.ceil(a / step - 1e-9) * step;
    for (; v <= b + 1e-9; v += step) out.push(Math.round(v * 1e6) / 1e6);
    return out;
  }
  function onView(node, cb, opts) {
    if (!("IntersectionObserver" in window)) { cb(); return; }
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) { io.disconnect(); cb(); } });
    }, opts || { threshold: 0.25 });
    io.observe(node);
  }

  /* --------------------------------------------------------- tooltip -- */
  var tip = doc.createElement("div");
  tip.className = "v2-tip"; tip.setAttribute("role", "status"); tip.setAttribute("aria-live", "polite");
  doc.body.appendChild(tip);
  function tipHTML(d, spec) {
    var dec = spec.decimals == null ? 1 : spec.decimals;
    var h = "<b>" + esc(d.title) + "</b>";
    if (d.v === null || d.v === undefined) {
      h += '<span class="tm">' + esc(d.note || "not averaged") + (d.n ? " · n = " + d.n : "") + "</span>";
      return h;
    }
    h += '<span class="tv' + (d.emph ? " is-emph" : "") + '">' + fmt(d.v, dec, spec.signed) + "</span>";
    if (d.unit) h += "<span>" + esc(d.unit) + "</span><br>";
    var bits = [];
    if (d.lo !== undefined) bits.push("95% CI " + fmt(d.lo, dec, true) + " to " + fmt(d.hi, dec, true));
    if (d.n) bits.push("n = " + d.n);
    if (d.p !== undefined) bits.push(fmtP(d.p));
    h += '<span class="tm">' + bits.join(" · ") + "</span>";
    if (d.sig === false) h += '<br><span class="tm">Can’t be told apart from zero</span>';
    return h;
  }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function showTip(html, x, y) {
    tip.innerHTML = html;
    var w = tip.offsetWidth || 200;
    x = Math.max(w / 2 + 8, Math.min(window.innerWidth - w / 2 - 8, x));
    tip.style.left = x + "px"; tip.style.top = Math.max(tip.offsetHeight + 20, y) + "px";
    tip.classList.add("on");
  }
  function hideTip() { tip.classList.remove("on"); }
  window.addEventListener("scroll", hideTip, { passive: true });

  /* ------------------------------------------------------- 2D: hbar -- */
  function hatchDefs(svg) {
    var defs = el("defs", {}, svg);
    var p = el("pattern", { id: "v2-hatch", width: 6, height: 6, patternUnits: "userSpaceOnUse", patternTransform: "rotate(45)" }, defs);
    el("rect", { width: 6, height: 6, fill: "rgba(143,156,194,0.10)" }, p);
    el("line", { x1: 0, y1: 0, x2: 0, y2: 6, stroke: "rgba(143,156,194,0.55)", "stroke-width": 2 }, p);
  }

  function drawHbar(stage, spec, panels) {
    stage.innerHTML = "";
    var W = Math.max(280, stage.clientWidth || 600);
    var narrow = W < 560;
    var side = panels.length > 1 && W >= 760;
    var gap = 44;
    var panelW = side ? (W - gap * (panels.length - 1)) / panels.length : W;
    var rowH = narrow ? 38 : 42, barH = narrow ? 15 : 18, grpH = 32;
    var dec = spec.decimals == null ? 1 : spec.decimals;
    var anims = [];
    // heights
    function panelHeight(p) {
      var h = (p.title ? 30 : 0) + 8;
      p.groups.forEach(function (g) { h += (g.label ? grpH : 0) + g.rows.length * rowH; });
      return h + 44; // axis + unit
    }
    var heights = panels.map(panelHeight);
    var H = side ? Math.max.apply(null, heights) : heights.reduce(function (a, b) { return a + b + 26; }, -26);
    var svg = el("svg", { "class": "v2-svg", viewBox: "0 0 " + W + " " + H, width: W, height: H, role: "img", "aria-label": spec.title || "" }, stage);
    hatchDefs(svg);
    var oy = 0;
    panels.forEach(function (p, pi) {
      var ox = side ? pi * (panelW + gap) : 0;
      var py = side ? 0 : oy;
      var g0 = el("g", { transform: "translate(" + ox + "," + py + ")" }, svg);
      var labelW = narrow ? Math.min(150, panelW * 0.4) : Math.min(side ? 130 : 250, panelW * 0.36);
      var valW = narrow ? 58 : 66;
      var x0 = labelW + 12, x1 = panelW - valW - 8;
      var d = p.domain || [-1, 1];
      var sx = function (v) { return x0 + (Math.max(d[0], Math.min(d[1], v)) - d[0]) / (d[1] - d[0]) * (x1 - x0); };
      var y = 0;
      if (p.title) { txt(g0, 0, 12, p.title, "t-panel"); y += 30; }
      var top = y;
      var ticks = niceTicks(d[0], d[1], narrow ? 4 : 5);
      var bodyH = panelHeight(p) - 44 - (p.title ? 30 : 0);
      var gridG = el("g", {}, g0);
      ticks.forEach(function (t) {
        el("line", { x1: sx(t), x2: sx(t), y1: top, y2: top + bodyH, "class": t === 0 ? "zero" : "grid" }, gridG);
        txt(g0, sx(t), top + bodyH + 14, fmt(t, Math.abs(t) % 1 ? 1 : 0, spec.signed), "t-tick", "middle");
      });
      if (ticks.indexOf(0) < 0 && d[0] < 0 && d[1] > 0) el("line", { x1: sx(0), x2: sx(0), y1: top, y2: top + bodyH, "class": "zero" }, gridG);
      txt(g0, (x0 + x1) / 2, top + bodyH + 34, p.unit || spec.unit || "", "t-unit", "middle");
      y += 8;
      p.groups.forEach(function (grp) {
        if (grp.label) { txt(g0, 0, y + grpH / 2 + 2, grp.label, "t-grp"); y += grpH; }
        grp.rows.forEach(function (r) {
          var cy = y + rowH / 2;
          var row = el("g", { "class": "row", tabindex: 0 }, g0);
          var label = (narrow && r.short) ? r.short : r.label;
          txt(row, 0, cy, label, "t-row");
          var unclear = r.sig === false, emph = !!r.emph;
          var cls = "bar" + (emph ? " is-emph" : "") + (unclear ? " is-unclear" : "");
          var has = r.v !== null && r.v !== undefined;
          var rect = el("rect", { x: sx(0), y: cy - barH / 2, width: 0, height: barH, rx: Math.min(5, barH / 2), "class": cls }, row);
          var ci = (r.lo !== undefined && has) ? el("line", { x1: sx(r.v), x2: sx(r.v), y1: cy, y2: cy, "class": "ci", opacity: 0 }, row) : null;
          var vt = has ? txt(row, x1 + valW + 4, cy, fmt(r.v, dec, spec.signed), "t-val" + (emph ? " is-emph" : ""), "end")
                       : txt(row, x1 + valW + 4, cy, r.note || "n/a", r.note ? "t-n t-note" : "t-val", "end");
          if (!narrow && r.n && has) txt(row, x1 + valW + 4, cy + 13, "n " + r.n, "t-n", "end"), vt.setAttribute("y", cy - 5);
          el("rect", { x: 0, y: y, width: panelW, height: rowH, "class": "hit" }, row);
          var datum = { title: (grp.label ? grp.label + ": " : "") + r.label, v: r.v, lo: r.lo, hi: r.hi, n: r.n, p: r.p, sig: r.sig, emph: emph, unit: p.unit || spec.unit, note: r.note };
          bindTip(row, datum, spec);
          if (has) anims.push(function (k) {
            var a = sx(0), b = sx(0 + (r.v - 0) * k);
            rect.setAttribute("x", Math.min(a, b)); rect.setAttribute("width", Math.max(0.5, Math.abs(b - a)));
            if (ci) {
              var m = sx(r.v);
              ci.setAttribute("x1", m + (sx(r.lo) - m) * k); ci.setAttribute("x2", m + (sx(r.hi) - m) * k);
              ci.setAttribute("opacity", Math.min(1, k * 1.4));
            }
          });
          y += rowH;
        });
      });
      oy += heights[pi] + 26;
    });
    return function animate(instant) {
      if (instant || reduce) { anims.forEach(function (f) { f(1); }); return; }
      anims.forEach(function (f, i) { setTimeout(function () { tween(760, f); }, i * 55); });
    };
  }

  function bindTip(node, datum, spec) {
    function at(e) {
      var r = node.getBoundingClientRect();
      var x = e && e.clientX !== undefined ? e.clientX : r.left + r.width / 2;
      showTip(tipHTML(datum, spec), x, r.top);
    }
    node.addEventListener("pointerenter", at);
    node.addEventListener("pointermove", at);
    node.addEventListener("pointerleave", hideTip);
    node.addEventListener("focus", function () { at(); });
    node.addEventListener("blur", hideTip);
  }

  /* ------------------------------------------------------- 2D: line -- */
  function drawLine(stage, spec) {
    stage.innerHTML = "";
    var W = Math.max(280, stage.clientWidth || 600), narrow = W < 560;
    var H = narrow ? 290 : 330;
    var svg = el("svg", { "class": "v2-svg", viewBox: "0 0 " + W + " " + H, width: W, height: H, role: "img", "aria-label": spec.title || "" }, stage);
    var dec = spec.decimals == null ? 1 : spec.decimals;
    var padL = narrow ? 40 : 52, padR = narrow ? 70 : 120, padT = 30, padB = 56;
    var d = spec.domain || [-2, 2];
    var sy = function (v) { return padT + (d[1] - v) / (d[1] - d[0]) * (H - padT - padB); };
    var cats = spec.x.cats, n = cats.length;
    var span = (W - padL - padR);
    var sx = function (i) { return padL + span * (i + 0.5) / (n + 0.35); };
    var markX = W - padR + (narrow ? 26 : 50);
    niceTicks(d[0], d[1], 4).forEach(function (t) {
      el("line", { x1: padL - 8, x2: W - 10, y1: sy(t), y2: sy(t), "class": t === 0 ? "zero" : "grid" }, svg);
      txt(svg, padL - 14, sy(t), fmt(t, 0, spec.signed), "t-tick", "end");
    });
    // trade marker
    el("line", { x1: markX, x2: markX, y1: padT - 10, y2: H - padB + 6, "class": "marker" }, svg);
    if (spec.marker) txt(svg, markX, H - padB + 22, spec.marker.label, "marker-t", "middle");
    cats.forEach(function (c, i) { txt(svg, sx(i), H - padB + 22, c.label, "t-row", "middle"); });
    var pts = spec.points.map(function (p) { var i = cats.map(function (c) { return c.key; }).indexOf(p.x); return { p: p, x: sx(i), y: sy(p.v) }; });
    var path = "M" + pts.map(function (q) { return q.x + "," + q.y; }).join(" L");
    var ghost = el("path", { d: "M" + pts[pts.length - 1].x + "," + pts[pts.length - 1].y + " L" + markX + "," + pts[pts.length - 1].y, "class": "line-ghost", opacity: 0 }, svg);
    var line = el("path", { d: path, "class": "line" }, svg);
    var len = 0;
    for (var i = 1; i < pts.length; i++) len += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    line.style.strokeDasharray = len; line.style.strokeDashoffset = len;
    var dots = pts.map(function (q, i) {
      var g = el("g", { "class": "row", tabindex: 0, opacity: 0 }, svg);
      if (q.p.lo !== undefined) el("line", { x1: q.x, x2: q.x, y1: sy(q.p.lo), y2: sy(q.p.hi), "class": "ci" }, g);
      el("circle", { cx: q.x, cy: q.y, r: 7, "class": "dot" }, g);
      var above = q.p.v >= 0;
      txt(g, q.x + 14, q.y + (above ? -16 : 16), fmt(q.p.v, dec, spec.signed), "t-val", "start");
      if (q.p.n) txt(g, q.x + 14, q.y + (above ? -1 : 31), "n " + q.p.n + (q.p.p !== undefined && !narrow ? " · " + fmtP(q.p.p) : ""), "t-n", "start");
      el("circle", { cx: q.x, cy: q.y, r: 22, "class": "hit" }, g);
      bindTip(g, { title: cats[i].label + (q.p.label ? " (" + q.p.label.toLowerCase() + ")" : ""), v: q.p.v, lo: q.p.lo, hi: q.p.hi, n: q.p.n, p: q.p.p, sig: q.p.sig, unit: spec.unit }, spec);
      return g;
    });
    return function animate(instant) {
      if (instant || reduce) { line.style.strokeDashoffset = 0; dots.forEach(function (g) { g.setAttribute("opacity", 1); }); ghost.setAttribute("opacity", 1); return; }
      dots[0].setAttribute("opacity", 1);
      tween(900, function (k) { line.style.strokeDashoffset = len * (1 - k); }, function () { ghost.setAttribute("opacity", 1); });
      dots.forEach(function (g, i) { setTimeout(function () { g.setAttribute("opacity", 1); }, 120 + i * 800 / Math.max(1, dots.length - 1)); });
    };
  }

  /* --------------------------------------------------- bars3d -> flat -- */
  function flatPanels(spec) {
    var by = spec.flat === "z" ? "z" : "x", other = by === "x" ? "z" : "x";
    var cell = {};
    spec.cells.forEach(function (c) { cell[c.x + "|" + c.z] = c; });
    return [{
      unit: spec.unit, domain: spec.domain,
      groups: spec[by].cats.map(function (g) {
        return {
          label: g.label,
          rows: spec[other].cats.map(function (o) {
            var c = cell[(by === "x" ? g.key + "|" + o.key : o.key + "|" + g.key)] || {};
            return { label: o.label, short: o.short, v: c.v, lo: c.lo, hi: c.hi, n: c.n, p: c.p, sig: c.sig, emph: c.emph, note: c.note };
          })
        };
      })
    }];
  }

  /* ------------------------------------------------------ chart init -- */
  var three = null, xmod = null;
  function load3d() {
    if (!three) three = import(BASE + "deep-bag-v2-chart3d.js" + Q);
    return three;
  }
  function loadX() {
    if (!xmod) xmod = import(BASE + "deep-bag-v2-xcharts.js" + Q);
    return xmod;
  }
  var GL = webglOK();
  var XTYPES = { agecurve: 1, rangeplot: 1, ridge3d: 1 };

  function initChart(fig) {
    var data = fig.querySelector("script.v2-chart-data");
    var stage = fig.querySelector(".v2-chart-stage");
    if (!data || !stage) return;
    var spec;
    try { spec = JSON.parse(data.textContent); } catch (e) { return; }
    if (XTYPES[spec.type]) { loadX().then(function (m) { m.initFigure(fig); }).catch(function () {}); return; }
    var head = fig.querySelector(".v2-fig-head");
    var is3d = spec.type === "bars3d" && GL;
    var views = spec.type === "bars3d" ? (GL ? ["3D", "Flat", "Table"] : ["Chart", "Table"]) : ["Chart", "Table"];
    var current = null, animate = null, ctl3d = null, seen = false, near = false, pending3d = null;
    var group = doc.createElement("div");
    group.className = "v2-views"; group.setAttribute("role", "group"); group.setAttribute("aria-label", "Chart view");
    var btns = views.map(function (v) {
      var b = doc.createElement("button");
      b.type = "button"; b.textContent = v; b.setAttribute("aria-pressed", "false");
      b.addEventListener("click", function () { show(v, true); });
      group.appendChild(b);
      return b;
    });
    if (head) head.appendChild(group);
    fig.classList.add("is-drawn");

    function draw2d() {
      if (spec.type === "line") return drawLine(stage, spec);
      if (spec.type === "hbar") return drawHbar(stage, spec, spec.panels);
      return drawHbar(stage, spec, flatPanels(spec));
    }
    function show(v, user) {
      if (v === current) return;
      current = v;
      btns.forEach(function (b) { b.setAttribute("aria-pressed", String(b.textContent === v)); });
      fig.classList.toggle("view-table", v === "Table");
      if (ctl3d && v !== "3D") { ctl3d.destroy(); ctl3d = null; }
      if (v === "Table") { stage.innerHTML = ""; return; }
      if (v === "3D") {
        stage.innerHTML = "";
        var host = doc.createElement("div");
        host.className = "v2-3d"; host.tabIndex = 0;
        host.setAttribute("role", "img");
        host.setAttribute("aria-label", (spec.title || "3D chart") + ". Drag or use arrow keys to turn it. The table view lists every value.");
        stage.appendChild(host);
        // the host is sized by CSS now (no layout shift); three.js and the
        // chart module load only when the figure comes near the viewport
        var mount3d = function () {
          pending3d = null;
          load3d().then(function (m) {
            if (current !== "3D" || ctl3d) return;
            ctl3d = m.mountBars3D(host, spec, { reduce: reduce, fmt: fmt, tipHTML: tipHTML, showTip: showTip, hideTip: hideTip });
            if (seen || user) ctl3d.animateIn(!!user && false);
          }).catch(function () { show("Flat"); });
        };
        if (near || user) mount3d(); else pending3d = mount3d;
        return;
      }
      animate = draw2d();
      if (seen || user) animate(!!user);
    }
    show(views[0]);
    if (is3d) {
      onView(fig, function () { load3d(); }, { rootMargin: "1100px 0px" });      // fetch ahead
      onView(fig, function () { near = true; if (pending3d) pending3d(); }, { rootMargin: "450px 0px" });
    }
    onView(fig, function () {
      seen = true;
      if (ctl3d) ctl3d.animateIn(false);
      else if (animate && current !== "Table") animate(false);
    }, { threshold: 0.3 });
    // redraw 2D on width change (crisp text at the real pixel size)
    var lastW = stage.clientWidth;
    if ("ResizeObserver" in window) new ResizeObserver(function () {
      var w = stage.clientWidth;
      if (Math.abs(w - lastW) < 8 || current === "3D" || current === "Table") return;
      lastW = w; animate = draw2d(); animate(true);
    }).observe(stage);
  }

  // Charts whose study module used to draw them (the-cliff's figure.cliff-chart
  // with script.cliff-chart-data). The shared module draws them now, unless the
  // page still loads the study's own module (then that module does).
  function initLegacyCharts() {
    var figs = doc.querySelectorAll("figure.cliff-chart");
    if (!figs.length || studyModule("the-cliff-v2.js")) return;
    loadX().then(function (m) { figs.forEach(function (f) { m.initFigure(f); }); }).catch(function () {});
  }

  /* ------------------------------------------------------ hero scene -- */
  // Opt-in: <header class="v2-hero" data-scene="NAME" [data-scene-data="JSON-SCRIPT-ID"]
  //   [data-scene-opts='{...}'] [data-scene-src="study-module.js"]>.
  // Older study markup still works (each maps to a shared scene); if the page
  // still loads the study's own scene module, that module keeps the hero.
  var LEGACY_HERO = [
    { attr: "data-study-scene", value: "return-bowl", scene: "return-bowl", data: "rg-scene-data", opts: "data-study-scene-opts", script: "revenge-bowl.js" },
    { attr: "data-study-scene", value: "champagne", scene: "champagne-bubbles", data: "cn-hero-data", opts: "data-study-scene-opts", script: "champagne-scene.js" },
    { attr: "data-cliff-scene", value: "ridges", scene: "cliff-ridges", data: "cliff-scene-data", opts: "data-cliff-scene-opts", script: "the-cliff-v2.js" }
  ];
  function studyModule(file) { return !!doc.querySelector('script[type="module"][src*="' + file + '"]'); }
  function initHero() {
    var hero = doc.querySelector(".v2-hero[data-scene], .v2-hero[data-study-scene], .v2-hero[data-cliff-scene]");
    if (!hero || reduce || !GL || lowPower()) return;
    var name = hero.getAttribute("data-scene"), dataId = hero.getAttribute("data-scene-data");
    var optsRaw = hero.getAttribute("data-scene-opts"), src = hero.getAttribute("data-scene-src");
    if (!name) {
      var L = null;
      LEGACY_HERO.forEach(function (l) { if (!L && hero.getAttribute(l.attr) === l.value) L = l; });
      if (!L || studyModule(L.script)) return;
      name = L.scene; dataId = dataId || L.data; optsRaw = optsRaw || hero.getAttribute(L.opts);
    }
    var opts = {}, data = null;
    try { opts = JSON.parse(optsRaw || "{}"); } catch (e) {}
    var dn = dataId && doc.getElementById(dataId);
    if (dn) { try { data = JSON.parse(dn.textContent); } catch (e) {} }
    var mount = hero.querySelector(".v2-hero-scene");
    if (!mount) { mount = doc.createElement("div"); mount.className = "v2-hero-scene"; hero.insertBefore(mount, hero.firstChild); }
    import(BASE + "deep-bag-v2-scene.js" + Q).then(function (m) {
      return m.mountScene(mount, name, opts, hero, { data: data, src: src });
    }).then(function (ok) {
      if (ok) requestAnimationFrame(function () { hero.classList.add("has-scene"); });
    }).catch(function () {});
  }

  /* ------------------------------------------------------------ film -- */
  function initFilm() {
    doc.querySelectorAll(".v2-film video").forEach(function (v) {
      v.muted = true; v.loop = true; v.playsInline = true;
      v.setAttribute("muted", ""); v.setAttribute("playsinline", "");
      var frame = v.closest(".v2-film-frame") || v.parentNode;
      var btn = doc.createElement("button");
      btn.type = "button"; btn.className = "v2-film-btn";
      var PLAY = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 2.5v11l9-5.5z" fill="currentColor"/></svg>';
      var PAUSE = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 2.5h3v11H4zM9 2.5h3v11H9z" fill="currentColor"/></svg>';
      var userPaused = reduce;
      function sync() { var p = !v.paused; btn.innerHTML = p ? PAUSE : PLAY; btn.setAttribute("aria-label", p ? "Pause the clip" : "Play the clip"); }
      btn.addEventListener("click", function () {
        if (v.paused) { userPaused = false; v.play().catch(function () {}); } else { userPaused = true; v.pause(); }
      });
      v.addEventListener("play", sync); v.addEventListener("pause", sync);
      frame.appendChild(btn); sync();
      if (!("IntersectionObserver" in window)) return;
      var io = new IntersectionObserver(function (es) {
        es.forEach(function (e) {
          if (e.isIntersecting && e.intersectionRatio >= 0.5) {
            if (v.preload !== "auto") v.preload = "auto";
            if (!userPaused && !doc.hidden) { v.autoplay = true; v.play().catch(function () {}); }
          } else if (!v.paused) v.pause();
        });
      }, { threshold: [0, 0.5] });
      io.observe(v);
      doc.addEventListener("visibilitychange", function () { if (doc.hidden && !v.paused) v.pause(); });
    });
  }

  /* -------------------------------------------- reveals and counters -- */
  function initReveals() {
    if (reduce || !("IntersectionObserver" in window)) return;
    var nodes = doc.querySelectorAll(".v2-body > h2, .v2-body > .v2-fig, .v2-body > .v2-pull, .v2-body > .v2-bignum, .v2-body > .v2-note, .v2-end-in > *");
    var vh = window.innerHeight;
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        if (!e.isIntersecting) return;
        io.unobserve(e.target);
        e.target.classList.add("v2-in");
        e.target.classList.remove("v2-pre");
      });
    }, { threshold: 0.08, rootMargin: "0px 0px -6% 0px" });
    nodes.forEach(function (n) {
      if (n.getBoundingClientRect().top > vh * 0.95) { n.classList.add("v2-pre"); io.observe(n); }
    });
  }
  function initCounters() {
    doc.querySelectorAll(".v2-count[data-to]").forEach(function (n) {
      var to = parseFloat(n.getAttribute("data-to")), dec = parseInt(n.getAttribute("data-dec") || "0", 10);
      var signed = n.hasAttribute("data-signed"), sep = n.hasAttribute("data-sep");
      var final = n.textContent;
      if (reduce || isNaN(to)) return;
      var show = function (v) {
        var s = fmt(v, dec, signed);
        if (sep) s = s.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
        n.textContent = s;
      };
      onView(n, function () { tween(1300, function (k) { show(to * k); }, function () { n.textContent = final; }); }, { threshold: 0.6 });
      show(0);
    });
  }

  /* ---------------------------------------------------------- layout -- */
  // Margin notes. In the markup a note follows the paragraph it belongs to, which is
  // where it reads best as an inline callout (phones, tablets). On wide screens it
  // floats into the right margin, and a float lines up with what comes AFTER it, so
  // the note is lifted to just before its paragraph there and put back below 1280px.
  function initNotes() {
    var notes = [].slice.call(doc.querySelectorAll(".v2-body > .v2-note"));
    if (!notes.length || !window.matchMedia) return;
    var wide = matchMedia("(min-width: 1280px)");
    var homes = notes.map(function (n) { var m = doc.createComment("v2-note"); n.parentNode.insertBefore(m, n); return m; });
    function place() {
      notes.forEach(function (n, i) {
        var home = homes[i], prev = home.previousElementSibling;
        if (wide.matches && prev && prev.tagName === "P") prev.parentNode.insertBefore(n, prev);
        else home.parentNode.insertBefore(n, home.nextSibling);
      });
    }
    place();
    if (wide.addEventListener) wide.addEventListener("change", place); else if (wide.addListener) wide.addListener(place);
  }

  // Section index in the left margin (desktop, 3+ sections): section names only. It
  // shows once the hero is gone, hides at the colophon, and steps aside while a wide
  // figure, pull quote or left note passes under it. Hidden by CSS below 1280px.
  function initToc() {
    var body = doc.querySelector(".v2-body");
    if (!body || !doc.querySelector(".v2-hero")) return;
    var hs = [].slice.call(body.querySelectorAll(":scope > h2"));
    if (hs.length < 3 || !("IntersectionObserver" in window)) return;
    var nav = doc.createElement("nav");
    nav.setAttribute("aria-label", "Sections");
    var ol = doc.createElement("ol");
    ol.className = "v2-toc";
    var links = hs.map(function (h, i) {
      if (!h.id) h.id = (h.textContent.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "section") + (doc.getElementById(h.id) ? "-" + i : "");
      var li = doc.createElement("li"), a = doc.createElement("a");
      a.href = "#" + h.id; a.textContent = h.textContent;
      li.appendChild(a); ol.appendChild(li);
      return a;
    });
    nav.appendChild(ol);
    body.parentNode.insertBefore(nav, body);
    var pastHero = false, beforeEnd = true, blocked = 0;
    function sync() { ol.classList.toggle("is-on", pastHero && beforeEnd && blocked === 0); }
    new IntersectionObserver(function (es) { pastHero = !es[0].isIntersecting && es[0].boundingClientRect.top < 0; sync(); })
      .observe(doc.querySelector(".v2-hero"));
    var end = body.querySelector(".v2-colophon") || body.lastElementChild;
    new IntersectionObserver(function (es) { beforeEnd = !(es[0].isIntersecting || es[0].boundingClientRect.top < 0); sync(); })
      .observe(end);
    // the band of the viewport the index occupies; anything wide crossing it hides it
    var wideIO = null, inBand = new Set();
    function watchWide() {
      if (wideIO) wideIO.disconnect();
      inBand.clear(); blocked = 0;
      var r = ol.getBoundingClientRect(), vh = window.innerHeight;
      if (!r.height) { r = { top: vh / 2 - 150, bottom: vh / 2 + 150 }; }
      wideIO = new IntersectionObserver(function (es) {
        es.forEach(function (e) { if (e.isIntersecting) inBand.add(e.target); else inBand.delete(e.target); });
        blocked = inBand.size; sync();
      }, { rootMargin: -Math.max(0, Math.round(r.top - 16)) + "px 0px " + -Math.max(0, Math.round(vh - r.bottom - 16)) + "px 0px" });
      var tl = ol.getBoundingClientRect().right || 0;
      body.querySelectorAll(":scope > *").forEach(function (n) {
        if (n.matches(".v2-toc, nav")) return;
        if (n.getBoundingClientRect().left < tl + 8) wideIO.observe(n);
      });
    }
    var current = -1;
    var tick = false;
    function active() {
      tick = false;
      var y = window.innerHeight * 0.38, i = -1;
      for (var k = 0; k < hs.length; k++) { if (hs[k].getBoundingClientRect().top < y) i = k; else break; }
      if (i === current) return;
      current = i;
      links.forEach(function (a, k) { if (k === i) a.setAttribute("aria-current", "true"); else a.removeAttribute("aria-current"); });
    }
    window.addEventListener("scroll", function () { if (!tick) { tick = true; requestAnimationFrame(active); } }, { passive: true });
    var rt = null;
    window.addEventListener("resize", function () { clearTimeout(rt); rt = setTimeout(watchWide, 200); });
    // measure once fonts (and so the index's own height) have settled
    ol.style.visibility = "hidden"; ol.style.display = "block";
    (doc.fonts && doc.fonts.ready ? doc.fonts.ready : Promise.resolve()).then(function () {
      ol.style.visibility = ""; ol.style.display = "";
      watchWide(); active();
    });
  }

  // Anything that scrolls sideways inside its own box (fallback tables, report tables
  // and figure strips) gets a fade on the side with more and a one-line hint above it,
  // only while it actually overflows (so a hidden or narrow table shows nothing).
  var SCROLLERS = ".v2-data-wrap, .dbx-study .table-wrap, .dbx-study .fig-wrap, .dbx-study .matrix-wrap, .cliff-sheet-wrap";
  var ARROW = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 8h11M9 4l4 4-4 4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  function initScrollers() {
    doc.querySelectorAll(SCROLLERS).forEach(function (w) {
      if (w.parentNode && w.parentNode.closest && w.parentNode.closest(SCROLLERS)) return;
      var hint = doc.createElement("div");
      hint.className = "v2-scroll-hint"; hint.hidden = true;
      hint.innerHTML = '<span class="go">' + (w.matches(".fig-wrap") ? "Swipe sideways to see the whole figure" : "Swipe the table sideways for more") + "</span>" + ARROW;
      // an overflowing table's caption would scroll away with it: show it above instead
      var cap = w.querySelector(":scope > table > caption");
      if (cap) {
        var c = doc.createElement("span");
        c.className = "cap"; c.setAttribute("aria-hidden", "true"); c.textContent = cap.textContent;
        hint.insertBefore(c, hint.firstChild); hint.classList.add("has-cap");
      }
      w.parentNode.insertBefore(hint, w);
      function check() {
        // a fallback table hidden behind its chart is clipped to 1px: never hint at it
        var over = w.clientWidth > 120 && w.scrollWidth > w.clientWidth + 4;
        w.classList.toggle("v2-scrolls", over);
        w.classList.toggle("cap-out", over && !!cap);
        hint.hidden = !over;
        if (!over) return;
        w.classList.toggle("is-scrolled", w.scrollLeft > 4);
        w.classList.toggle("at-end", w.scrollLeft + w.clientWidth >= w.scrollWidth - 4);
      }
      w.addEventListener("scroll", check, { passive: true });
      if ("ResizeObserver" in window) new ResizeObserver(check).observe(w);
      var t = w.querySelector("table, img, svg");
      if (t && "ResizeObserver" in window) new ResizeObserver(check).observe(t);
      check();
    });
  }

  function go() {
    initNotes();
    initToc();
    doc.querySelectorAll(".v2-chart").forEach(initChart);
    initScrollers();
    initLegacyCharts();
    initHero();
    initFilm();
    initReveals();
    initCounters();
  }
  if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", go); else go();
})();
