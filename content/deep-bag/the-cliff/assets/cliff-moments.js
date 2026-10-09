/* the-cliff · two small in-article moments (article_v08), markup from scripts/17_export_hero_v3.py.
   figure[data-moment="fog"]   the survivorship strip: when it scrolls in, the fog lifts and the
                               faint figures (the backs an average-by-age chart stops counting) appear.
   figure[data-moment="step"]  the last step: a runner jogs the running back trail past the 27 and 28
                               sell signs and steps off at 29 into the mist. Plays each time it comes
                               into view, then rests. Nothing runs while it is off screen.
   Reduced motion: the fog strip shows its end state, the runner stands still at 28. */
(function () {
  "use strict";
  var reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  var figs = document.querySelectorAll("figure[data-moment]");
  if (!figs.length) return;

  function onView(el, ratio, fn) {
    if (!("IntersectionObserver" in window)) { fn(true); return; }
    new IntersectionObserver(function (es) { es.forEach(function (e) { fn(e.isIntersecting && e.intersectionRatio >= ratio); }); },
      { threshold: [0, ratio] }).observe(el);
  }

  /* ---------------------------------------------------------- the fog -- */
  function fog(fig) {
    if (reduce) { fig.classList.add("is-in"); return; }
    onView(fig, 0.55, function (on) { if (on) fig.classList.add("is-in"); });
  }

  /* ---------------------------------------------------- the last step -- */
  function step(fig) {
    var d;
    try { d = JSON.parse(fig.getAttribute("data-step")); } catch (e) { return; }
    var path = d.path, fogY = d.fog;
    var g = fig.querySelector(".cls-runner");
    if (!g || !path || path.length < 2) return;
    var L = {};
    g.querySelectorAll("line").forEach(function (l) { L[l.getAttribute("data-k")] = l; });
    var head = g.querySelector(".hd"), hip = g.querySelector(".hp");
    var U = 13;                                        // px per body unit (a runner is about 2.1 units tall)
    var lens = [0], total = 0;
    for (var i = 1; i < path.length; i++) { total += Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]); lens.push(total); }
    function at(s) {                                     // point on the trail at arc length s
      for (var i = 1; i < path.length; i++) if (lens[i] >= s) {
        var k = (s - lens[i - 1]) / Math.max(1e-6, lens[i] - lens[i - 1]);
        return [path[i - 1][0] + (path[i][0] - path[i - 1][0]) * k, path[i - 1][1] + (path[i][1] - path[i - 1][1]) * k];
      }
      return path[path.length - 1];
    }
    function set(l, a, b) { l.setAttribute("x1", a[0]); l.setAttribute("y1", a[1]); l.setAttribute("x2", b[0]); l.setAttribute("y2", b[1]); }
    function seg(o, ang, len) { return [o[0] + Math.sin(ang) * len * U, o[1] + Math.cos(ang) * len * U]; }
    function pose(x, y, ph, fall, warm) {
      var tl, tr, sl, sr, al, ar, fl, fr, lean, bob = 0;
      if (fall > 0) {
        tl = 0.6 + 0.3 * Math.sin(ph); tr = -0.5 - 0.3 * Math.sin(ph); sl = -0.9; sr = -0.4;
        al = Math.PI - 0.6 + 0.2 * Math.sin(ph * 1.3); ar = Math.PI + 0.5 - 0.2 * Math.cos(ph * 1.2); fl = 0.4; fr = 0.3; lean = 0.1;
      } else {
        tl = 0.78 * Math.sin(ph) + 0.12; tr = 0.78 * Math.sin(ph + Math.PI) + 0.12;
        sl = -0.25 - 1.15 * Math.max(0, Math.sin(ph - 1.6)); sr = -0.25 - 1.15 * Math.max(0, Math.sin(ph + Math.PI - 1.6));
        al = -0.75 * Math.sin(ph); ar = -0.75 * Math.sin(ph + Math.PI); fl = 1.45; fr = 1.45; lean = -0.22; bob = 0.07 * Math.abs(Math.cos(ph));
      }
      var H = [x, y - (1.02 + bob) * U];
      var S = [H[0] - Math.sin(lean) * 0.66 * U, H[1] - Math.cos(lean) * 0.66 * U];
      var hd = [S[0] - Math.sin(lean) * 0.3 * U, S[1] - Math.cos(lean) * 0.3 * U];
      var kl = seg(H, tl, 0.5), kr = seg(H, tr, 0.5), el = seg(S, al, 0.32), er = seg(S, ar, 0.32);
      set(L.tl, H, kl); set(L.sl, kl, seg(kl, tl + sl, 0.5)); set(L.tr, H, kr); set(L.sr, kr, seg(kr, tr + sr, 0.5));
      set(L.al, S, el); set(L.fl, el, seg(el, al + fl, 0.3)); set(L.ar, S, er); set(L.fr, er, seg(er, ar + fr, 0.3));
      set(L.body, H, S);
      head.setAttribute("cx", hd[0]); head.setAttribute("cy", hd[1]);
      hip.setAttribute("cx", H[0]); hip.setAttribute("cy", H[1] + 1);
      var rot = fall > 0 ? Math.min(1.9, fall * 0.9) * 57.3 : 0;
      g.setAttribute("transform", rot ? "rotate(" + rot.toFixed(1) + " " + H[0].toFixed(1) + " " + H[1].toFixed(1) + ")" : "");
      g.style.setProperty("--warm", warm.toFixed(3));
    }
    var RUN = 3.6, FALL = 1.5, raf = 0, t0 = 0, visible = false;
    function frame(now) {
      if (!t0) t0 = now;
      var t = (now - t0) / 1000;
      if (t < RUN) {
        var k = t / RUN, e = k * (0.92 + 0.08 * k);     // a touch quicker toward the edge
        var p = at(e * total);
        pose(p[0], p[1], t * 8.4, 0, 0);
        g.style.opacity = Math.min(1, t / 0.35);
      } else if (t < RUN + FALL) {
        var tau = t - RUN, lip = path[path.length - 1];
        var x = lip[0] + tau * 52, y = lip[1] - 30 * tau + 0.5 * 190 * tau * tau;
        pose(x, y, tau * 3, tau * 1.7, Math.min(1, tau * 1.4));
        g.style.opacity = String(Math.max(0, 1 - Math.max(0, (y - fogY + 8) / 40)));
      } else { g.style.opacity = "0"; raf = 0; return; }
      raf = requestAnimationFrame(frame);
    }
    function play() { if (raf) return; t0 = 0; raf = requestAnimationFrame(frame); }
    if (reduce) { var p0 = at(total * 0.72); pose(p0[0], p0[1], 1.2, 0, 0); g.style.opacity = "1"; return; }
    g.style.opacity = "0";
    onView(fig, 0.6, function (on) {
      if (on && !visible) play();
      visible = on;
    });
    document.addEventListener("visibilitychange", function () { if (document.hidden && raf) { cancelAnimationFrame(raf); raf = 0; g.style.opacity = "0"; } });
  }

  figs.forEach(function (f) {
    var m = f.getAttribute("data-moment");
    if (m === "fog") fog(f); else if (m === "step") step(f);
  });
})();
