/* Champagne, No Hangover: two small themed moments in the article (v08, 2026-10-09).
   1. figure.cn-pour  Two flutes filled to the same line on title night pour off what
                      each team lost the next season: the 2024-25 Thunder (4 wins, gold)
                      and their five closest regular-season twins (7.2). A dashed line
                      marks the ~6 regression expected. Bubbles keep rising in both.
   2. .cn-confetti    A one-time confetti pop over the 37% big number once its counter
                      has run (champions mostly beat the benchmark).
   The markup's static state is the final one, so no-JS and reduced motion see the
   finished picture and nothing moves. Plain script, no dependencies, ~4 KB. */
(function () {
  var doc = document;
  var reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduce || !("IntersectionObserver" in window)) return;

  function onView(el, fn, th) {
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) { io.disconnect(); fn(); } });
    }, { threshold: th || 0.45 });
    io.observe(el);
  }
  function ease(k) { return k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2; }

  /* ---- 1. the pour ---- */
  doc.querySelectorAll("figure.cn-pour").forEach(function (fig) {
    var lv = [].slice.call(fig.querySelectorAll("[data-level]"));
    var top = parseFloat(fig.getAttribute("data-top") || "0");
    var finals = lv.map(function (r) { return parseFloat(r.getAttribute("y")); });
    lv.forEach(function (r) { r.setAttribute("y", top); });
    fig.classList.add("is-armed");
    // bubbles only animate while the figure is on screen
    var live = new IntersectionObserver(function (es) { fig.classList.toggle("is-live", es[0].isIntersecting); });
    live.observe(fig);
    onView(fig, function () {
      var t0 = 0, D = 1900, DELAY = 450;
      function frame(now) {
        if (!t0) t0 = now;
        var k = Math.min(1, Math.max(0, (now - t0 - DELAY) / D));
        lv.forEach(function (r, i) { r.setAttribute("y", top + (finals[i] - top) * ease(k)); });
        if (k < 1) requestAnimationFrame(frame);
        else fig.classList.add("is-poured");
      }
      requestAnimationFrame(frame);
    }, 0.55);
  });

  /* ---- 2. the confetti pop ---- */
  doc.querySelectorAll(".cn-confetti").forEach(function (host) {
    onView(host, function () {
      setTimeout(function () {
        var c = doc.createElement("canvas");
        c.className = "cn-confetti-canvas"; c.setAttribute("aria-hidden", "true");
        host.appendChild(c);
        var dpr = Math.min(2, window.devicePixelRatio || 1);
        var W = c.offsetWidth, H = c.offsetHeight;
        c.width = W * dpr; c.height = H * dpr;
        var g = c.getContext("2d"); g.scale(dpr, dpr);
        var cols = ["#f2c45a", "#f2c45a", "#d99a32", "#fff4dc", "#e4e9f6"];
        var ox = Math.min(W * 0.2, 150), oy = H * 0.6, P = [];
        for (var i = 0; i < 70; i++) {
          var a = -Math.PI / 2 + (Math.random() - 0.5) * 2.1, sp = 180 + Math.random() * 300;
          P.push({ x: ox, y: oy, vx: Math.cos(a) * sp + 60, vy: Math.sin(a) * sp, r: Math.random() * 6.3, vr: (Math.random() - 0.5) * 14,
            w: 5 + Math.random() * 5, h: 2.5 + Math.random() * 2.5, c: cols[i % cols.length], f: Math.random() * 6.3 });
        }
        var last = 0, age = 0;
        function frame(now) {
          var dt = last ? Math.min(0.05, (now - last) / 1000) : 0.016; last = now; age += dt;
          g.clearRect(0, 0, W, H);
          P.forEach(function (p) {
            p.vx *= 1 - 1.8 * dt; p.vy += 520 * dt; if (p.vy > 150) p.vy = 150;   // gravity, then a slow flutter down
            p.x += (p.vx + Math.sin(age * 5 + p.f) * 30) * dt; p.y += p.vy * dt; p.r += p.vr * dt;
            g.save(); g.translate(p.x, p.y); g.rotate(p.r); g.scale(1, Math.cos(age * 8 + p.f));
            g.globalAlpha = Math.max(0, 1 - Math.max(0, age - 2.1) / 0.9);
            g.fillStyle = p.c; g.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); g.restore();
          });
          if (age < 3) requestAnimationFrame(frame); else c.remove();
        }
        requestAnimationFrame(frame);
      }, 1250);
    }, 0.6);
  });
})();
