/* Sport hub (/<sport>): fills the game cards and the hero scoreboard from the
   EBK catalog. Set <body data-sport="nba">. Reads localStorage (bests, today's
   grid) and never writes it. Presentation only. */
(function () {
  "use strict";
  var key = document.body.dataset.sport;
  var S = window.EBK && EBK.sport(key);
  if (!S) return;
  var K = window.EBKKit;

  if (S.accent) document.documentElement.style.setProperty("--accent", S.accent);
  document.title = S.name + " · EBK";

  // league-flavored sting on the visitor's first tap/click (autoplay-safe)
  document.addEventListener("pointerdown", function () {
    setTimeout(function () { try { window.EBKS && EBKS.jingle(key); } catch (e) {} }, 60);
  }, { once: true, passive: true });

  /* ---------- read-only local state ---------- */
  function ls(k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } }
  function num(k) { var v = +ls(k); return v > 0 && isFinite(v) ? Math.floor(v) : 0; }
  var nfl = key === "nfl";
  function hlBest() {
    var o = null, m = 0;
    try { o = JSON.parse(ls(nfl ? "ebk_best" : "ebk_" + key + "_best")); } catch (e) {}
    if (o && typeof o === "object") for (var c in o) { var v = +o[c]; if (v > m && isFinite(v)) m = Math.floor(v); }
    return m;
  }
  var BEST = {
    "higher-lower": hlBest,
    "stat-line": function () { return num(nfl ? "ebk_statline_best_v2" : "ebk_statline_" + key + "_best"); },
    "career-path": function () { return num(nfl ? "ebk_careerpath_best_v2" : "ebk_careerpath_" + key + "_best"); },
    "player-grid": function () { return num(nfl ? "ebk_grid_best" : "ebk_grid_" + key + "_best"); },
  };
  function best(slug) { try { return BEST[slug] ? BEST[slug]() : 0; } catch (e) { return 0; } }

  var D = window.EBKDaily, today = null, rackSport = null, resetIn = "";
  try { if (D) { today = (D.today() || {})[key] || null; rackSport = D.sportOn(); resetIn = D.hoursToReset(); } } catch (e) {}
  var hasGrid = EBK.isLive(key, "player-grid");
  var onRack = hasGrid && rackSport === key;
  var gridState = today ? today.state : "none";           // none | partial | done
  var gridScore = today && typeof today.score === "number" ? Math.max(0, Math.min(9, today.score)) : 0;

  /* ---------- hero scoreboard: TODAY cell ---------- */
  var todayCell = document.getElementById("hub-today");
  if (todayCell && K && gridState !== "none") {
    var led = todayCell.querySelector(".k-led");
    led.removeAttribute("data-seg");       // so the kit's DOMContentLoaded scan leaves it alone
    led.classList.remove("off", "k-seg");
    led.classList.add("y");
    led.innerHTML = "";
    var d = document.createElement("span");
    led.appendChild(d);
    K.seg(d, String(gridScore), gridScore + " of 9 squares today");
    var of9 = document.createElement("span");
    of9.className = "hub-of";
    of9.setAttribute("aria-hidden", "true");
    of9.textContent = "/9";
    led.appendChild(of9);
  }

  /* ---------- game cards ---------- */
  var grid = document.getElementById("games");
  if (!grid) return;

  var ARROW = K ? K.arrow : "";
  var NOUN = key === "soccer" ? "club" : key === "cfb" ? "program" : "franchise";
  // copy lives here (the catalog descs carry dashes the hubs no longer use)
  var MODES = {
    "player-grid": { tag: "Daily", desc: "Nine squares where a team meets a stat. Name a player for each one, one guess per square.", foot: "Play today's grid",
      icon: '<rect x="3" y="3" width="5" height="5" rx="1.2"/><rect x="9.5" y="3" width="5" height="5" rx="1.2"/><rect x="16" y="3" width="5" height="5" rx="1.2"/><rect x="3" y="9.5" width="5" height="5" rx="1.2"/><rect x="9.5" y="9.5" width="5" height="5" rx="1.2" class="f"/><rect x="16" y="9.5" width="5" height="5" rx="1.2"/><rect x="3" y="16" width="5" height="5" rx="1.2"/><rect x="9.5" y="16" width="5" height="5" rx="1.2"/><rect x="16" y="16" width="5" height="5" rx="1.2"/>' },
    "higher-lower": { tag: "Streak", desc: "Two player-seasons, one stat. Call higher or lower and keep the streak alive.", foot: "Play",
      icon: '<path d="M7 20V5M3 9l4-4 4 4"/><path d="M17 4v15M13 15l4 4 4-4"/>' },
    "stat-line": { tag: "Mystery", desc: "A real season's numbers with the name scratched off. Read the line and name the player.", foot: "Play",
      icon: '<path d="M6 3h12v18l-2-1.5-2 1.5-2-1.5-2 1.5-2-1.5L6 21z"/><path d="M9 8h6M9 12h6M9 16h3"/>' },
    "career-path": { tag: "Clues", desc: "Follow the clues and the stops along the way back to one player.", foot: "Play",
      icon: '<circle cx="5" cy="18" r="2.2"/><circle cx="19" cy="6" r="2.2"/><path d="M7 17c5-1 2-7 6-8s3-2 4-2.5" stroke-dasharray="2.4 2.6"/><path d="M12 14.5l1.2 1.2"/>' },
    "team": { tag: "Browse", desc: "Every player-season for one " + NOUN + ", ready to filter and sort.", foot: "Open",
      icon: '<path d="M4 20V11M10 20V5M16 20v-6M22 20H2"/>' },
  };
  if (key === "cfb") MODES["player-grid"].desc = "The college grid is in the works. Four games are ready to play now.";

  function icon(slug) {
    return '<span class="hub-ico" aria-hidden="true"><svg viewBox="0 0 24 24">' + MODES[slug].icon + "</svg></span>";
  }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }

  // the board on the featured card: today's 3x3 for the grid, a streak board otherwise
  function miniGrid() {
    var lit = gridState === "none" ? 0 : gridScore, h = "";
    for (var i = 0; i < 9; i++) {
      // an unplayed grid shows the sport ball waiting in the centre square
      var ball = !lit && i === 4 ? '<span class="k-ball auto"></span>' : "";
      h += '<i class="' + (i < lit ? "on" : "") + (ball ? " c" : "") + '" style="--d:' + ((i % 3) + Math.floor(i / 3)) * 70 + 'ms">' + ball + "</i>";
    }
    return '<div class="hub-mini" aria-hidden="true"><div class="hub-nine">' + h + "</div></div>";
  }
  function miniBoard(slug) {
    var b = best(slug);
    return '<div class="hub-mini" aria-hidden="true"><div class="k-board"><div class="k-cell"><span class="k-lbl">Streak</span>' +
      '<span class="k-led k-seg hub-dim">' + (K ? K.seg7("00") : "00") + '</span></div><div class="k-cell"><span class="k-lbl">Best</span>' +
      '<span class="k-led k-seg y' + (b ? "" : " hub-dim") + '">' + (K ? K.seg7(String(b).padStart(2, "0")) : b) + "</span></div></div></div>";
  }

  function card(slug, feat) {
    var m = MODES[slug], g = EBK.games.filter(function (x) { return x.slug === slug; })[0];
    if (!m || !g) return null;
    var live = EBK.isLive(key, slug);
    var el = document.createElement(live ? "a" : "div");
    el.className = "k-card glow hub-g" + (feat ? " feat" : "") + (live ? "" : " soon");
    el.setAttribute("data-mode", slug);
    if (live) el.href = EBK.href(key, slug);
    else el.setAttribute("aria-disabled", "true");

    var tag = '<span class="k-tag soft">' + m.tag + "</span>", foot = m.foot, left = "";
    if (!live) tag = '<span class="k-tag hub-soon">Coming soon</span>';
    if (slug === "player-grid" && live) {
      if (onRack) tag = '<span class="k-tag">Today\'s Rack</span>' + tag;
      if (gridState === "done") { left = '<span class="k-mled y">Today ' + gridScore + "/9</span>"; foot = "See your grid"; }
      else {
        el.classList.add("ring");
        left = gridState === "partial" ? '<span class="k-mled">In progress</span>'
          : resetIn ? '<span class="hub-reset">New grid in <b>' + esc(resetIn) + "</b></span>" : "";
        if (gridState === "partial") foot = "Finish today's grid";
      }
    } else if (live) {
      var b = best(slug);
      if (b) left = '<span class="k-mled y">Best ' + b + "</span>";
    }
    var title = g.title === "Guess the Stat Line" ? "Stat Line" : g.title;
    var body =
      '<div class="hub-g-top">' + icon(slug) + '<span class="hub-tags">' + tag + "</span></div>" +
      "<h3>" + esc(title) + "</h3>" +
      "<p>" + esc(m.desc) + "</p>" +
      '<div class="k-foot">' + (left || "<span></span>") +
      (live ? '<span class="k-cta">' + foot + " " + ARROW + "</span>" : '<span class="hub-dev">In development</span>') + "</div>";
    if (feat) {
      el.innerHTML = '<div class="hub-g-main">' + body + "</div>" + (slug === "player-grid" ? miniGrid() : miniBoard(slug));
    } else el.innerHTML = body;
    if (live) el.setAttribute("aria-label", title + ": " + m.desc + (left ? " " + el.querySelector(".k-foot > span").textContent + "." : ""));
    return el;
  }

  var order = hasGrid
    ? [["player-grid", 1], ["higher-lower"], ["stat-line"], ["career-path"], ["team"]]
    : [["higher-lower", 1], ["stat-line"], ["career-path"], ["team"], ["player-grid"]];
  var frag = document.createDocumentFragment();
  order.forEach(function (o) { var c = card(o[0], !!o[1]); if (c) frag.appendChild(c); });
  grid.appendChild(frag);

  if (K) {
    K.calm(".hub-hero, #hub-h2h");
    // touch has no hover: the featured board and the matchup "play" once on scroll-in
    if (window.matchMedia && matchMedia("(hover: none)").matches && !K.reduced())
      K.onView(".hub-g.feat, #hub-h2h", function (el) { el.classList.add("play"); }, 0.6);
  }
})();
