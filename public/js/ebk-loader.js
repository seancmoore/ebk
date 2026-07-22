/* EBK · preloader + scroll behavior (loaded in <head> on every page). */

/* EBKD.inflate — reverses the lossless compaction that tools/slim_players.py
   applies to the players.json files (headshot prefix hoisted to `hsPrefix`,
   zero stat entries omitted per record via `z` = statCols indices of exactly
   the dropped keys). Restores each record's ORIGINAL stat key set — presence
   of a key is semantic ("threw for 0 yards" vs "never threw"), and category
   pools depend on the difference. Idempotent; safe on unslimmed files too.
   Lives here because this file is in the <head> of every page. */
window.EBKD = {
  inflate: function (d) {
    if (!d || d.__inflated) return d;
    var pre = d.hsPrefix || "";
    var cols = d.statCols || [];
    (d.players || []).forEach(function (r) {
      if (pre && r.headshot && r.headshot.charAt(0) === "~")
        r.headshot = pre + r.headshot.slice(1);
      if (r.z) {
        var s = r.stats || (r.stats = {});
        for (var i = 0; i < r.z.length; i++) s[cols[r.z[i]]] = 0;
        delete r.z;
      }
    });
    d.__inflated = true;
    return d;
  },
  // Higher/Lower pool eligibility (shared by game.js and h2h.js so solo play
  // and both H2H clients agree): the stat must have applied AND be meaningful
  // — nonzero everywhere, and at least 10 for yardage categories so trick-play
  // passing lines etc. don't enter the pool.
  hlEligible: function (p, key, label) {
    var v = p.stats[key];
    if (v == null || v <= 0) return false;
    if (/yard|yds/i.test(key + " " + (label || "")) && v < 10) return false;
    return true;
  },
};

(function () {
  "use strict";

  // ---------- per-sport accent ----------
  // Every page with <body data-sport> takes its league's accent color, so
  // game screens (timers, buttons, glows) match the sport you're playing.
  var ACCENTS = { nfl: "#3ddc97", cfb: "#f4a300", nba: "#ff7a3c",
                  mlb: "#4aa3ff", nhl: "#5fd0e6", soccer: "#8ee04a" };
  function applyAccent() {
    var sport = document.body && document.body.dataset.sport;
    var a = sport && ACCENTS[sport];
    if (a) document.documentElement.style.setProperty("--accent", a);
  }
  if (document.body) applyAccent();
  else document.addEventListener("DOMContentLoaded", applyAccent);

  // ---------- scroll behavior ----------
  // Lock page scroll when the content fits the viewport on desktop; allow
  // scrolling on mobile, on touch, or whenever content is taller than the
  // viewport (so nothing is ever unreachable).
  function applyScrollNow() {
    var el = document.documentElement;
    var mobile = window.matchMedia("(max-width: 820px)").matches ||
                 window.matchMedia("(pointer: coarse)").matches;
    var desired;
    if (mobile) {
      desired = "";
    } else {
      var content = Math.max(el.scrollHeight, document.body ? document.body.scrollHeight : 0);
      // Hysteresis: the scrollbar appearing/disappearing reflows the page, and
      // this runs FROM a ResizeObserver on <body> — without a dead zone the
      // two states feed each other in a relayout loop whenever content height
      // hovers near the viewport height (which game rounds cause constantly).
      // Once scrollable, stay scrollable until content is clearly shorter.
      if (content > window.innerHeight + 1) desired = "auto";
      else if (el.style.overflowY === "auto" && content > window.innerHeight - 32) desired = "auto";
      else desired = "hidden";
    }
    if (el.style.overflowY !== desired) el.style.overflowY = desired;
  }
  var scrollTO = null;
  function applyScroll() {
    clearTimeout(scrollTO);
    scrollTO = setTimeout(applyScrollNow, 80);
  }
  function initScroll() {
    applyScrollNow();
    window.addEventListener("resize", applyScroll);
    window.addEventListener("load", applyScroll);
    if (window.ResizeObserver && document.body) {
      try { new ResizeObserver(applyScroll).observe(document.body); } catch (e) { setInterval(applyScroll, 1200); }
    } else {
      setInterval(applyScroll, 1200);
    }
  }
  if (document.body) initScroll();
  else document.addEventListener("DOMContentLoaded", initScroll);

  // ---------- branded preloader (once per session) ----------
  var seen = false;
  try { seen = !!sessionStorage.getItem("ebk_seen"); } catch (e) {}
  if (seen) return;

  var MIN = 500, MAX = 7000, start = Date.now();
  var css =
    '#ebk-load{position:fixed;inset:0;z-index:99999;display:flex;flex-direction:column;' +
    'align-items:center;justify-content:center;gap:20px;' +
    'background:radial-gradient(120% 80% at 50% -20%,#121a32,#0a0e1c 60%);' +
    'opacity:1;transition:opacity .45s ease;}' +
    '#ebk-load.ebk-hide{opacity:0;pointer-events:none;}' +
    '#ebk-load .wm{font-family:"Segoe UI",system-ui,-apple-system,Arial,sans-serif;font-weight:900;' +
    'font-size:clamp(2.6rem,9vw,4.4rem);letter-spacing:-.03em;color:#f3f6ff;line-height:1;}' +
    '#ebk-load .wm b{color:#3ddc97;}' +
    '#ebk-load .ring{width:40px;height:40px;border-radius:50%;border:3px solid rgba(255,255,255,.15);' +
    'border-top-color:#3ddc97;animation:ebkspin .8s linear infinite;}' +
    '#ebk-load .sub{font-family:"Segoe UI",system-ui,sans-serif;color:#9aa6cc;font-size:.72rem;' +
    'letter-spacing:.28em;text-transform:uppercase;}' +
    '@keyframes ebkspin{to{transform:rotate(360deg);}}' +
    '@media (prefers-reduced-motion:reduce){#ebk-load .ring{animation:none;}}';

  var st = document.createElement("style");
  st.textContent = css;
  (document.head || document.documentElement).appendChild(st);

  var o = document.createElement("div");
  o.id = "ebk-load";
  o.setAttribute("aria-hidden", "true");
  o.innerHTML = '<div class="wm">E<b>B</b>K</div><div class="ring"></div><div class="sub">Elite Ball Knowledge</div>';
  (document.body || document.documentElement).appendChild(o);

  function intoBody() { if (document.body && o.parentNode !== document.body) document.body.appendChild(o); }
  document.addEventListener("DOMContentLoaded", intoBody);

  var done = false;
  function hide() {
    if (done) return; done = true;
    intoBody();
    try { sessionStorage.setItem("ebk_seen", "1"); } catch (e) {}
    var wait = Math.max(0, MIN - (Date.now() - start));
    setTimeout(function () {
      o.classList.add("ebk-hide");
      setTimeout(function () { if (o.parentNode) o.parentNode.removeChild(o); }, 500);
    }, wait);
  }
  // reveal at DOMContentLoaded (CSS is applied by then — end-of-body scripts
  // gate it) rather than window load, which waits on the 3D hero and images
  if (document.readyState !== "loading") hide();
  else document.addEventListener("DOMContentLoaded", hide);
  setTimeout(hide, MAX);
})();
