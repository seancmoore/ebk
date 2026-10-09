/* EBK · home: "This Week's Rack" + the sport cards.
 *
 * Rack — one counted Daily Grid a day; the sport rotates on a fixed weekly
 * schedule (EBKDaily.ROTATION). The model (streak days, points, career, best
 * streak, this week) comes from EBKDaily.rack(); this file only draws it.
 *
 * Sport cards — each card "plays its sport" on hover (desktop) or tap (touch).
 * On touch the tap starts downloading the sport page and its player data right
 * away, plays the ~0.85s shot meanwhile, then navigates, so slow phones and
 * weak connections land on a page that is already loaded.
 */
(function () {
  "use strict";

  var WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  var LABEL = { nfl: "NFL", nba: "NBA", mlb: "MLB", nhl: "NHL", soccer: "SOC", cfb: "CFB" };
  var BALL = { nfl: "football", cfb: "football", nba: "basketball", mlb: "baseball", nhl: "hockey", soccer: "soccer" };
  var ACCENT = { nfl: "#3ddc97", cfb: "#f4a300", nba: "#ff7a3c", mlb: "#4aa3ff", nhl: "#5fd0e6", soccer: "#8ee04a" };
  var ARROW = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  var STAR = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6-4.9-4.6 6.6-.8z" fill="currentColor"/></svg>';

  function accent(k) { var s = window.EBK && EBK.sport ? EBK.sport(k) : null; return (s && s.accent) || ACCENT[k] || "#3ddc97"; }
  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function mdy(date) { var p = date.split("-"); return (+p[1]) + "/" + (+p[2]); }
  function wday(date) { var p = date.split("-"); return new Date(Date.UTC(+p[0], +p[1] - 1, +p[2])).getUTCDay(); }

  /* ---- seven-segment digits ---- */
  var SEGS = (function () {
    var w = 6.5;
    function H(y) { return "14," + y + " " + (14 + w) + "," + (y - w) + " " + (46 - w) + "," + (y - w) + " 46," + y + " " + (46 - w) + "," + (y + w) + " " + (14 + w) + "," + (y + w); }
    function V(x, y1, y2) { return x + "," + y1 + " " + (x + w) + "," + (y1 + w) + " " + (x + w) + "," + (y2 - w) + " " + x + "," + y2 + " " + (x - w) + "," + (y2 - w) + " " + (x - w) + "," + (y1 + w); }
    return { a: H(8), b: V(52, 12, 48), c: V(52, 52, 88), d: H(92), e: V(8, 52, 88), f: V(8, 12, 48), g: H(50) };
  })();
  var DIG = { "0": "abcdef", "1": "bc", "2": "abged", "3": "abgcd", "4": "fgbc", "5": "afgcd", "6": "afgedc", "7": "abc", "8": "abcdefg", "9": "abcdfg" };
  function seg7(str) {
    return String(str).split("").map(function (ch) {
      if (ch === ":") return '<svg class="s7c" viewBox="0 0 20 100" aria-hidden="true"><circle cx="10" cy="32" r="6"/><circle cx="10" cy="68" r="6"/></svg>';
      var on = DIG[ch] || "", h = '<svg class="s7" viewBox="0 0 60 100" aria-hidden="true">';
      for (var k in SEGS) h += '<polygon class="' + (on.indexOf(k) > -1 ? "on" : "off") + '" points="' + SEGS[k] + '"/>';
      return h + "</svg>";
    }).join("");
  }

  /* ---- rings: 9 bulbs; 9/9 = solid gold + a light sweep ---- */
  var SWN = 0;
  function ring(n, dashed) {
    var R = 46, C = 2 * Math.PI * R;
    var h = '<svg class="ring" viewBox="0 0 100 100" aria-hidden="true"><circle class="trk' + (dashed ? " dash" : "") + '" cx="50" cy="50" r="' + R + '"/>';
    if (n >= 9) {
      var id = "rk-sw" + (++SWN);
      h += '<circle class="prg" cx="50" cy="50" r="' + R + '"/>';
      h += '<defs><linearGradient id="' + id + '" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".7" stop-color="#fff7d6" stop-opacity=".9"/><stop offset="1" stop-color="#fff"/></linearGradient></defs>';
      h += '<g class="sweep"><circle cx="50" cy="50" r="' + R + '" stroke="url(#' + id + ')" stroke-dasharray="' + (C * 0.16).toFixed(1) + " " + C.toFixed(1) + '" transform="rotate(-90 50 50)"/></g>';
    }
    if (!dashed) {
      var L = (C * 32 / 360).toFixed(2);
      for (var i = 0; i < 9; i++) h += '<circle class="sg' + (i < n ? " on" : "") + '" cx="50" cy="50" r="' + R + '" stroke-dasharray="' + L + " " + C.toFixed(1) + '" transform="rotate(' + (-90 + i * 40 + 4) + ' 50 50)"/>';
    }
    return h + "</svg>";
  }
  function tier(n) { return n >= 9 ? "t4" : n >= 7 ? "t3" : n >= 4 ? "t2" : "t1"; }

  /* ---- the rack ---- */
  function cd() {
    var p = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(new Date());
    var g = function (t) { return +p.find(function (x) { return x.type === t; }).value; };
    var s = 86400 - (((g("hour") % 24) * 3600) + g("minute") * 60 + g("second"));
    return [Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60];
  }

  function renderRack(host) {
    var m = window.EBKDaily.rack();
    var wdIdx = m.week.findIndex(function (d) { return d.off === 0; });
    var cols = m.week.map(function (d) { return d.off === 0 ? "minmax(0,1.6fr)" : "minmax(0,1fr)"; }).join(" ");
    var h = '<div class="rk-panel" style="--tx:' + Math.round((wdIdx + 0.5) / 7 * 100) + '%">';
    h += '<div class="rk-top"><h2 id="rack-h" class="rk-title">This Week\'s Rack</h2><div class="rk-board">';
    h += '<div class="sbx" role="group" aria-label="Streak: ' + m.days + " days, " + m.pts + ' points">' +
      '<div><div class="lbl">Days</div><div class="led ' + (m.days ? "g" : "off") + '">' + seg7(pad(Math.min(m.days, 99))) + "</div></div>" +
      '<div><div class="lbl">Pts</div><div class="led ' + (m.pts ? "y" : "off") + '">' + seg7(pad(Math.min(m.pts, 99))) + "</div></div></div>";
    h += '<div class="rk-clock" role="timer" aria-live="off"><div class="lbl">' + (m.playedToday ? "Next grid" : "Shot clock") + '</div><div class="dig" data-rk-clock></div><div class="sub">' +
      (m.playedToday ? "at midnight ET" : "until the grid closes") + "</div></div></div></div>";
    h += '<ol class="rk-row" style="grid-template-columns:' + cols + '">';
    m.week.forEach(function (d) {
      var s = d.sport, cls = "r7", n = null, r = "", act = "", rg = "", extra = "",
        lab = WD[wday(d.date)] + " " + mdy(d.date) + ", " + (LABEL[s] || s) + " grid: ";
      if (d.off < 0) {
        if (d.squares > 0) n = d.squares;
        else if (m.fresh) { cls += " blank"; lab += "not played"; }
        else { cls += " missed"; r = "Missed"; lab += "missed"; }
      } else if (d.off === 0) {
        cls += " today";
        if (m.playedToday) n = m.squaresToday;
        else { rg = ring(0, true); lab += "today, not played yet"; }
        act = '<a class="go' + (m.playedToday ? " ghost" : "") + '" href="/' + s + '/player-grid">' + (m.playedToday ? "Review" : "Play" + ARROW) + "</a>";
      } else { cls += " future"; lab += "upcoming"; }
      if (n !== null) {
        cls += " played " + tier(n); rg = ring(n, false);
        r = '<b class="n">' + n + "/9</b> +" + n;
        lab += n + " of 9 squares, plus " + n + " points" + (n === 9 ? ", perfect" : "");
        if (n === 9) extra = '<span class="star">' + STAR + "</span>";
      }
      h += '<li class="' + cls + '" style="--c:' + (d.off === 0 && !m.playedToday ? "var(--accent)" : accent(s)) + (n !== null ? ";--f:" + (n / 9).toFixed(3) : "") + '" aria-label="' + esc(lab) + '">' +
        '<span class="o"><span class="bw">' + rg + '<span class="rb ' + BALL[s] + '" aria-hidden="true"></span>' + extra + "</span></span>" +
        '<span class="lab"><span class="w">' + (d.off === 0 ? "Today" : WD[wday(d.date)]) + " <i>" + mdy(d.date) + "</i></span><b>" + (LABEL[s] || s) + "</b>" +
        (r ? '<span class="r">' + r + "</span>" : "") + act + "</span></li>";
    });
    h += "</ol>";
    h += '<div class="rk-foot"><div class="fstats"><span class="st"><span class="k">Career</span><b class="v y">' + m.career + '</b><span class="u">pts</span></span>' +
      '<i class="sep" aria-hidden="true"></i><span class="st"><span class="k">Best streak</span><b class="v g">' + (m.best ? m.best.d : "—") + '</b><span class="u">' + (m.best ? (m.best.d === 1 ? "day" : "days") : "") + "</span></span></div></div>";
    h += "</div>";
    host.innerHTML = h;
    host.hidden = false;
    host.__risk = m.atRisk;
    tick();
  }

  function tick() {
    var c = cd(), host = document.getElementById("rack");
    document.querySelectorAll("[data-rk-clock]").forEach(function (el) {
      el.innerHTML = seg7(pad(c[0]) + ":" + pad(c[1])) + '<span class="ss">' + seg7(":" + pad(c[2])) + "</span>";
      el.parentNode.setAttribute("aria-label", c[0] + " hours " + c[1] + " minutes until the grid closes");
      // amber frame once a live streak is in its last 6 hours
      el.parentNode.classList.toggle("risk", !!(host && host.__risk && c[0] < 6));
    });
  }

  /* ---- sport cards ---- */
  var PROP = { mlb: '<span class="prop bat"></span>', nhl: '<span class="prop stick"></span>' };
  var TGT = {
    nba: '<span class="tgt hoop" data-fx=".5" data-fy=".56"></span>',
    nfl: '<span class="tgt uprights" data-fx=".5" data-fy=".3"></span>',
    cfb: '<span class="tgt gloves" data-fx=".5" data-fy=".42"></span>',
    soccer: '<span class="tgt goal" data-fx=".74" data-fy=".34"></span>',
  };

  // the images each card's shot needs: its spin strip and its prop/target
  var ASSETS = {
    nfl: ["balls/spin/kick", "props/uprights"], cfb: ["balls/spin/football", "props/gloves"],
    nba: ["balls/spin/basketball", "props/hoop"], mlb: ["balls/spin/baseball", "props/bat"],
    nhl: ["balls/spin/hockey", "props/stick"], soccer: ["balls/spin/soccer", "props/goal"],
  };

  function renderSports(grid) {
    if (!window.EBK) return;
    var today = window.EBKDaily ? EBKDaily.sportOn() : null;
    var h = "";
    EBK.sports.forEach(function (s) {
      if (!EBK.sportLive(s.key)) return;
      var isToday = s.key === today, n = (EBK.live[s.key] || []).length;
      h += '<a class="sp lg-' + s.key + (isToday ? " istoday" : "") + '" href="/' + s.key + '" style="--c:' + s.accent + '"><span class="spc">' +
        (isToday ? '<span class="todaytag">Today\'s grid</span>' : "") +
        (PROP[s.key] || "") +
        '<span class="sball k-' + BALL[s.key] + '" aria-hidden="true"><b class="ax"><i></i></b></span>' +
        (TGT[s.key] || "") +
        '<span class="st"><h3>' + esc(s.name) + "</h3><p>" + esc(s.blurb) + '</p><span class="cnt">' + n + " games" + ARROW + "</span></span></span></a>";
    });
    grid.innerHTML = h;
  }

  /* Aim the flight at this card's target (hoop, uprights, gloves, goal). */
  function aim(card) {
    var t = card.querySelector(".tgt"), b = card.querySelector(".sball");
    if (!t || !b) return;
    // layout offsets (not getBoundingClientRect) so the target's drop-in transform doesn't skew the aim
    var lift = parseFloat(getComputedStyle(t).getPropertyValue("--lift")) || 0;
    var dx = (t.offsetLeft + t.offsetWidth * +t.dataset.fx) - (b.offsetLeft + b.offsetWidth / 2);
    var dy = (t.offsetTop + t.offsetHeight * +t.dataset.fy) - (b.offsetTop + b.offsetHeight / 2) - lift;
    card.style.setProperty("--dx", Math.round(dx) + "px");
    card.style.setProperty("--dy", Math.round(dy) + "px");
    card.style.setProperty("--ap", Math.round(Math.max(Math.min(dy, 0) - 34, -46)) + "px");
  }

  /* A card plays its shot only once it is "armed": the flight is measured and
     its spin strip + prop have loaded. Until then hover just lifts the card and
     a tap goes straight to the page, so a half-ready shot (a ball spinning in
     place, a blank strip) never shows. Strips are fetched when the section is
     close to the viewport, so cards are normally armed before anyone reaches them. */
  var loaded = {};
  function arm(grid) {
    grid.querySelectorAll(".sp").forEach(function (c) {
      var key = (c.className.match(/lg-(\w+)/) || [])[1], need = ASSETS[key] || [];
      aim(c);
      // cards with a target (hoop, uprights, gloves, goal) also need a measured flight
      var aimed = !c.querySelector(".tgt") || c.style.getPropertyValue("--dx") !== "";
      var ok = aimed && need.every(function (a) { return loaded[a]; });
      c.classList.toggle("armed", ok);
    });
  }
  function preloadStrips(grid) {
    var done = false;
    function go() {
      if (done) return; done = true;
      Object.keys(ASSETS).forEach(function (k) {
        ASSETS[k].forEach(function (a) {
          if (loaded[a] !== undefined) return; loaded[a] = false;
          var i = new Image();
          i.onload = function () { loaded[a] = true; arm(grid); };
          i.src = "/img/" + a + ".webp";
        });
      });
    }
    if (!("IntersectionObserver" in window)) { setTimeout(go, 1500); return; }
    var io = new IntersectionObserver(function (es) { if (es.some(function (e) { return e.isIntersecting; })) { io.disconnect(); go(); } }, { rootMargin: "600px 0px" });
    io.observe(grid);
  }

  /* Warm the next page the moment a finger lands: the HTML and the sport's
     player data (same URL the game pages request, so it comes from cache;
     keep ?v=N in step with DATA_URL in the game scripts). */
  var warmed = {};
  function warm(href) {
    if (!href || warmed[href]) return; warmed[href] = 1;
    var add = function (url, as) { var l = document.createElement("link"); l.rel = "prefetch"; l.href = url; if (as) l.as = as; document.head.appendChild(l); };
    add(href);
    var key = href.replace(/^\//, "").split("/")[0];
    if (key) add((key === "nfl" ? "/data/players.json" : "/data/" + key + "/players.json") + "?v=9", "fetch");
  }

  function wireCards(grid) {
    var hoverable = window.matchMedia && matchMedia("(hover:hover)").matches;
    grid.addEventListener("pointerover", function (e) { var c = e.target.closest(".sp"); if (c) aim(c); });
    grid.addEventListener("focusin", function (e) { var c = e.target.closest(".sp"); if (c) aim(c); });
    grid.addEventListener("pointerdown", function (e) { var c = e.target.closest(".sp"); if (c) warm(c.getAttribute("href")); }, { passive: true });
    if (hoverable) return;            // desktop: hover plays, a click just navigates
    grid.addEventListener("click", function (e) {
      var c = e.target.closest(".sp");
      if (!c || e.metaKey || e.ctrlKey || e.shiftKey) return;
      var href = c.getAttribute("href");
      var reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
      var save = navigator.connection && navigator.connection.saveData;
      if (reduce || save || !c.classList.contains("armed")) { warm(href); return; }   // go straight there
      e.preventDefault();
      if (c.classList.contains("play")) { clearTimeout(c.__t); location.href = href; return; } // second tap skips
      warm(href); aim(c);
      c.classList.add("play");
      c.__t = setTimeout(function () { location.href = href; }, 850);
    });
    // coming back via the back button: don't leave a card frozen mid-shot
    window.addEventListener("pageshow", function () { grid.querySelectorAll(".sp.play").forEach(function (c) { c.classList.remove("play"); clearTimeout(c.__t); }); });
  }

  window.EBKRack = { seg7: seg7 };

  function init() {
    var host = document.getElementById("rack");
    if (host && window.EBKDaily) {
      try { renderRack(host); setInterval(tick, 1000); } catch (e) { host.hidden = true; }
    }
    var grid = document.getElementById("sport-cards");
    if (grid) {
      renderSports(grid); wireCards(grid); preloadStrips(grid);
      // re-measure flights whenever the cards change size (resize, fonts, breakpoints)
      if ("ResizeObserver" in window) new ResizeObserver(function () { arm(grid); }).observe(grid);
      else window.addEventListener("resize", function () { arm(grid); });
    }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
