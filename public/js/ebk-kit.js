/* EBK kit helpers (pairs with /css/ebk-kit.css). Purely visual.
   EBKKit.seg7("12:05")      -> SVG markup, identical to the home's EBKRack.seg7
   EBKKit.seg(el, "07", lbl) -> draws digits into el (adds .k-seg + a screen-reader copy)
   [data-seg="03"]           -> filled automatically on DOMContentLoaded (EBKKit.digits(root) to redo)
   EBKKit.calm(els)          -> toggles .offscreen so looping animations pause off screen
   EBKKit.onView(els, fn)    -> runs fn(el) once when el scrolls into view (touch "play" states)
   EBKKit.reduced()          -> true when the user prefers reduced motion
   EBKKit.arrow              -> the home's arrow SVG for buttons/CTAs */
(function () {
  "use strict";
  if (window.EBKKit) return;

  var SEGS = (function () {
    var w = 6.5;
    function H(y) { return "14," + y + " " + (14 + w) + "," + (y - w) + " " + (46 - w) + "," + (y - w) + " 46," + y + " " + (46 - w) + "," + (y + w) + " " + (14 + w) + "," + (y + w); }
    function V(x, y1, y2) { return x + "," + y1 + " " + (x + w) + "," + (y1 + w) + " " + (x + w) + "," + (y2 - w) + " " + x + "," + y2 + " " + (x - w) + "," + (y2 - w) + " " + (x - w) + "," + (y1 + w); }
    return { a: H(8), b: V(52, 12, 48), c: V(52, 52, 88), d: H(92), e: V(8, 52, 88), f: V(8, 12, 48), g: H(50) };
  })();
  // digits plus a few letters/blank that read well on a 7-seg face
  var DIG = { "0": "abcdef", "1": "bc", "2": "abged", "3": "abgcd", "4": "fgbc", "5": "afgcd", "6": "afgedc", "7": "abc", "8": "abcdefg", "9": "abcdfg",
              "-": "g", " ": "", "_": "d", "A": "abcefg", "E": "adefg", "L": "def", "P": "abefg", "H": "bcefg", "O": "abcdef", "U": "bcdef", "C": "adef", "F": "aefg" };
  var CACHE = {};
  function digit(ch) {
    if (CACHE[ch]) return CACHE[ch];
    var h;
    if (ch === ":") h = '<svg class="s7c" viewBox="0 0 20 100" aria-hidden="true"><circle cx="10" cy="32" r="6"/><circle cx="10" cy="68" r="6"/></svg>';
    else if (ch === ".") h = '<svg class="s7c" viewBox="0 0 20 100" aria-hidden="true"><circle cx="10" cy="90" r="6"/></svg>';
    else {
      var on = DIG[String(ch).toUpperCase()] || "";
      h = '<svg class="s7" viewBox="0 0 60 100" aria-hidden="true">';
      for (var k in SEGS) h += '<polygon class="' + (on.indexOf(k) > -1 ? "on" : "off") + '" points="' + SEGS[k] + '"/>';
      h += "</svg>";
    }
    return (CACHE[ch] = h);
  }
  function seg7(str) { return String(str).split("").map(digit).join(""); }

  function seg(el, value, label) {
    if (!el) return;
    var v = String(value);
    if (el.__kseg === v) return;               // unchanged: skip the DOM write
    el.__kseg = v;
    el.classList.add("k-seg");
    var hidden = el.getAttribute("aria-hidden") === "true";
    el.innerHTML = seg7(v) + (hidden ? "" : '<span class="k-sr">' + esc(label != null ? label : v) + "</span>");
  }
  function digits(root) {
    (root || document).querySelectorAll("[data-seg]").forEach(function (el) { seg(el, el.getAttribute("data-seg"), el.getAttribute("data-seg-label")); });
  }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function list(els) { return typeof els === "string" ? [].slice.call(document.querySelectorAll(els)) : els && els.length != null ? [].slice.call(els) : els ? [els] : []; }

  function calm(els, margin) {
    if (!("IntersectionObserver" in window)) return;
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) { e.target.classList.toggle("offscreen", !e.isIntersecting); });
    }, { rootMargin: margin || "100px 0px" });
    list(els).forEach(function (el) { io.observe(el); });
    return io;
  }
  function onView(els, fn, ratio) {
    var items = list(els);
    if (!("IntersectionObserver" in window)) { items.forEach(fn); return; }
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) { io.unobserve(e.target); fn(e.target); } });
    }, { threshold: ratio || 0.6 });
    items.forEach(function (el) { io.observe(el); });
    return io;
  }
  function reduced() { return !!(window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches); }

  window.EBKKit = {
    seg7: seg7, seg: seg, digits: digits, calm: calm, onView: onView, reduced: reduced,
    arrow: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>'
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", function () { digits(); });
  else digits();
})();
