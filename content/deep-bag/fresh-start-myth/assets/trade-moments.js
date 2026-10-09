/* The Fresh-Start Myth: in-article moment (article_v15). The static markup is the end state
   (no JS, reduced motion: Pickett already sits 2nd on Philadelphia's chart). With motion allowed,
   the figure is armed at the start state and plays once when most of it is on screen. */
(function () {
  var mq = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)");
  if ((mq && mq.matches) || !("IntersectionObserver" in window)) return;
  var figs = document.querySelectorAll(".td-moment");
  Array.prototype.forEach.call(figs, function (f) {
    f.classList.add("is-armed");
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        if (e.isIntersecting) { f.classList.add("is-run"); io.disconnect(); }
      });
    }, { threshold: 0.65 });
    io.observe(f);
  });
})();
