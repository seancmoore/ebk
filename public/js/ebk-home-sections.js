/* EBK · home sections 02-03.
 *
 *  02 More Ways to Play — Head-to-Head shows the signed-in player's best Elo;
 *     Deep Cut shows today's number, question (ending blurred until the blade
 *     cuts) and guesses left, from /data/deep-cuts.json + localStorage.
 *  03 The Stat Lab — headline counts, the latest three Deep Bag posts (each
 *     post shuffles its own paper out of the backpack on hover), rolling team
 *     logos, and a team + player search that opens profile pop-ups.
 *     Search data: /data/stat-lab/index.json (names), loaded on first focus;
 *     /data/stat-lab/<sport>.json (seasons), loaded when a profile opens.
 *     Both are built by tools/build_stat_lab.py.
 *
 * Desktop plays the card animations on hover; touch devices play them once as
 * each card scrolls into view (CSS class .play). Reduced motion is respected.
 */
(function () {
  "use strict";

  var SPORTS = ["nfl", "cfb", "nba", "mlb", "nhl", "soccer"];
  var SHORT = { nfl: "NFL", cfb: "CFB", nba: "NBA", mlb: "MLB", nhl: "NHL", soccer: "SOC" };
  var HELPER = { nfl: "NFL", cfb: "CFB", nba: "NBA", mlb: "MLB", nhl: "NHL", soccer: "SOCCER" };
  var ARROW = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  var CHEV = '<svg class="chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  var reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  var touch = window.matchMedia && matchMedia("(hover: none)").matches;

  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function seg(str) { return window.EBKRack ? EBKRack.seg7(str) : esc(str); }
  function accent(k) { var s = window.EBK && EBK.sport ? EBK.sport(k) : null; return (s && s.accent) || "#3ddc97"; }
  function ballOf(k) { return { nfl: "football", cfb: "football", nba: "basketball", mlb: "baseball", nhl: "hockey", soccer: "soccer" }[k]; }
  function helper(k) { return window[HELPER[k]] || null; }
  // stat-lab files are rebuilt from players.json: keep ?v=N in step with DATA_URL in the game scripts
  var DATA_V = "?v=8";
  function getJSON(url) { return fetch(url).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }); }
  function ls(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } }
  function etDate() { return window.EBKDaily ? EBKDaily.etDate() : new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date()); }
  function whenFirebase(cb, n) { if (window.EBKF && EBKF.ready) EBKF.ready.then(cb).catch(function () {}); else if ((n || 0) < 150) setTimeout(function () { whenFirebase(cb, (n || 0) + 1); }, 120); }
  /* play once when the element is well inside the viewport (touch only) */
  function onView(el, cb, ratio) {
    if (!("IntersectionObserver" in window)) return;
    var io = new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting) { io.disconnect(); cb(); } }); }, { threshold: ratio || 0.6 });
    io.observe(el);
  }
  function near(el, cb) {
    if (!("IntersectionObserver" in window)) { setTimeout(cb, 1200); return; }
    var io = new IntersectionObserver(function (es) { if (es.some(function (e) { return e.isIntersecting; })) { io.disconnect(); cb(); } }, { rootMargin: "500px 0px" });
    io.observe(el);
  }

  /* ---------- scoreboard digits in headings and chips ---------- */
  function digits() { $$("[data-seg]").forEach(function (el) { el.innerHTML = seg(el.getAttribute("data-seg")); }); }

  /* ---------- Head-to-Head: your best rating ---------- */
  function h2h() {
    var card = $(".h2x");
    if (!card) return;
    if (touch && !reduce) onView(card, function () { card.classList.add("play"); });
    whenFirebase(function () {
      if (!EBKF.onChange) return;
      EBKF.onChange(function (u) {
        var elo = $("[data-h2h-elo]", card), nm = $("[data-h2h-name]", card);
        if (!u) { elo.textContent = "Unranked"; nm.textContent = "You"; return; }
        nm.textContent = EBKF.profileName || u.displayName || "You";
        EBKF.db.collection("elo").doc(u.uid).get().then(function (d) {
          var best = null, data = d.exists ? d.data() : {};
          Object.keys(data).forEach(function (k) { if (k.indexOf("e_") === 0 && typeof data[k] === "number" && (best === null || data[k] > best)) best = data[k]; });
          elo.textContent = best === null ? "Unranked" : String(Math.round(best));
        }).catch(function () {});
      });
    });
  }

  /* ---------- Deep Cut: today's number, question and guesses ---------- */
  function sparks() {
    var s = "";
    for (var i = 0; i < 14; i++) {
      var x = 18 + Math.random() * 64, a = (Math.random() * 2 - 1) * Math.PI, d = 18 + Math.random() * 34;
      s += '<b style="left:' + x.toFixed(1) + "%;top:" + (74 - (x - 50) * 0.07).toFixed(1) + "%;--sx:" + Math.round(Math.cos(a) * d) + "px;--sy:" + Math.round(Math.sin(a) * d - 10) + "px;--d:" + (0.15 + ((100 - x) / 100) * 0.25).toFixed(2) + 's"></b>';
    }
    return s;
  }
  function deepCut() {
    var card = $("[data-dc]");
    if (!card) return;
    $(".sparks", card).innerHTML = sparks();
    if (touch && !reduce) onView(card, function () { card.classList.add("play"); });
    near(card, function () {
      getJSON("/data/deep-cuts.json").then(function (data) {
        var date = etDate(), a = data.start.split("-"), b = date.split("-");
        var i = Math.round((Date.UTC(+b[0], +b[1] - 1, +b[2]) - Date.UTC(+a[0], +a[1] - 1, +a[2])) / 864e5);
        var n = data.days.length; if (!n) return;
        var day = data.days[((i % n) + n) % n];
        $("[data-dc-no]", card).innerHTML = seg(String(i + 1));
        var words = String(day.q).split(" "), k = Math.max(1, Math.min(3, words.length - 4));
        $("[data-dc-q]", card).innerHTML = esc(words.slice(0, -k).join(" ")) + ' <span class="blur">' + esc(words.slice(-k).join(" ")) + "</span>";
        var saved = ls("ebk_dcut_" + date), used = 0, done = false, win = false;
        if (saved && saved.id === day.id) { used = (saved.g || []).length; done = !!saved.done; win = !!saved.win; }
        var left = Math.max(0, 3 - used), dots = "";
        for (var j = 0; j < 3; j++) dots += "<i" + (j >= left ? ' class="used"' : "") + "></i>";
        var tries = $("[data-dc-tries]", card);
        tries.innerHTML = dots + "<small>" + (done ? (win ? "Solved in " + used : "Missed today") : left + " guess" + (left === 1 ? "" : "es")) + "</small>";
        tries.setAttribute("aria-label", done ? (win ? "Solved" : "Missed") : left + " guesses left");
        if (done) $("[data-dc-cta]", card).innerHTML = "See the answer " + ARROW;
      }).catch(function () {});
    });
  }

  /* ---------- Deep Bag: latest posts + the opening backpack ---------- */
  var STRIPS = ["/img/home/bag-0.webp", "/img/home/bag-1.webp", "/img/home/bag-2.webp"];
  function deepBag() {
    var card = $(".bagcard"), el = card && $(".bagopen", card), list = card && $("[data-bag-list]", card);
    if (!card) return;
    whenFirebase(function () {
      if (!EBKF.listPublishedPosts) return;
      EBKF.listPublishedPosts().then(function (posts) {
        posts = (posts || []).slice(0, 3);
        if (!posts.length) { list.innerHTML = '<li class="bc-empty">New research drops soon.</li>'; return; }
        list.innerHTML = posts.map(function (p, i) {
          return '<li><a class="art" data-p="' + (i % 3) + '" href="/deep-bag/post/?s=' + encodeURIComponent(p.slug) + '"><span class="bc-n">' + pad(i + 1) + '</span><span class="art-t">' + esc(p.title) + "</span>" + ARROW.replace("<svg", '<svg class="art-go"') + "</a></li>";
        }).join("");
        wireArts();
      }).catch(function () { list.innerHTML = '<li class="bc-empty">The Bag is closed right now. <a href="/deep-bag">Open it</a>.</li>'; });
    });
    near(card, function () { STRIPS.forEach(function (u) { var im = new Image(); im.src = u; }); });

    /* frame-stepped so only one bag is ever on screen; swapping posts tucks
       the old paper back in and raises the new one */
    var f = 0, p = 0, want = 0, open = false, timer = null;
    function paint() { el.style.backgroundImage = 'url("' + STRIPS[p] + '")'; el.style.backgroundPosition = (f / 11 * 100) + "% 0"; }
    function tick() {
      var goal = open ? 11 : 0;
      if (open && want !== p) { if (f > 5) { f--; paint(); return; } p = want; }
      if (f === goal) { clearInterval(timer); timer = null; return; }
      f += f < goal ? 1 : -1; paint();
    }
    function go() { if (reduce) { f = open ? 11 : 0; if (open) p = want; paint(); return; } if (!timer) timer = setInterval(tick, 34); }
    card.addEventListener("pointerenter", function (e) { if (e.pointerType === "mouse") { open = true; go(); } });
    card.addEventListener("pointerleave", function (e) { if (e.pointerType === "mouse") { open = false; go(); } });
    card.addEventListener("focusin", function (e) { open = true; var a = e.target.closest(".art"); if (a) want = +a.dataset.p; go(); });
    card.addEventListener("focusout", function (e) { if (!card.contains(e.relatedTarget)) { open = false; go(); } });
    function wireArts() { $$(".art", card).forEach(function (a) { a.addEventListener("pointerenter", function () { want = +a.dataset.p; open = true; go(); }); }); }
    if (touch) onView(card, function () { open = true; go(); }, 0.5);
    paint();
  }

  /* ---------- Stat Lab: counts ---------- */
  function teamCount() { return SPORTS.reduce(function (n, k) { var h = helper(k); return n + (h && h.franchises ? h.franchises.length : 0); }, 0); }
  function meta() {
    var box = $("[data-meta]");
    if (!box) return;
    var t = teamCount(); if (t) $('[data-m="teams"]', box).textContent = t.toLocaleString("en-US");
    getJSON("/data/stat-lab/meta.json" + DATA_V).then(function (m) {
      $('[data-m="playerSeasons"]', box).textContent = m.playerSeasons.toLocaleString("en-US");
      $('[data-m="categories"]', box).textContent = m.categories;
      $('[data-m="span"]', box).textContent = m.first + "–" + m.last;
    }).catch(function () {});
  }

  /* ---------- teams ---------- */
  function franchises(k) { var h = helper(k); return h && h.franchises ? h.franchises : []; }
  function canon(k, code) { var h = helper(k); try { return h && h.keyOf ? h.keyOf(code) : code; } catch (e) { return code; } }
  function tname(k, code) { var h = helper(k); try { return h ? h.name(code) : String(code); } catch (e) { return String(code); } }
  function tlogo(k, key) {
    var h = helper(k), f = franchises(k).filter(function (x) { return String(x.key) === String(key); })[0];
    try { return (f && f.logo) || (h && h.logo ? h.logo(key) : ""); } catch (e) { return ""; }
  }
  function abbr(k, key) {
    if (k === "nfl" || k === "nba" || k === "mlb" || k === "nhl") return String(key);
    var w = tname(k, key).replace(/[^A-Za-z ]/g, "").split(/\s+/).filter(Boolean);
    return (w.length > 1 ? w.map(function (x) { return x[0]; }).join("") : w.join("")).slice(0, 3).toUpperCase();
  }
  function badge(k, key, big) {
    var src = tlogo(k, key);
    return '<span class="tb' + (big ? " big" : "") + '" style="--c:' + accent(k) + '">' +
      (src ? '<img src="' + esc(src) + '" alt="" loading="lazy" onerror="this.outerHTML=\'<b>' + esc(abbr(k, key)) + '</b>\'">' : "<b>" + esc(abbr(k, key)) + "</b>") + "</span>";
  }
  function roll() {
    var host = $("[data-roll]");
    if (!host) return;
    var h = "";
    [0, 1, 2].forEach(function (lane) {
      var items = [];
      SPORTS.forEach(function (k, si) {
        var l = franchises(k), n = k === "cfb" ? 12 : 8;
        l.slice(lane * n, lane * n + n).forEach(function (f, i) { items.push({ k: k, key: f.key, o: i * 6 + si }); });
      });
      items.sort(function (a, b) { return a.o - b.o; });
      var row = items.map(function (x) {
        return '<button type="button" class="rb2" tabindex="-1" data-team="' + x.k + "|" + esc(String(x.key)) + '">' + badge(x.k, x.key) + "<span>" + esc(tname(x.k, x.key)) + "</span></button>";
      }).join("");
      h += '<div class="lane2' + (lane === 1 ? " rev" : "") + (lane === 2 ? " slow" : "") + '" aria-hidden="true">' + row + row + "</div>";
    });
    host.innerHTML = h;
  }

  /* ---------- search ---------- */
  var INDEX = null, LOADING = null, SPORTDATA = {};
  function loadIndex() { if (!LOADING) LOADING = getJSON("/data/stat-lab/index.json" + DATA_V).then(function (d) { INDEX = d.map(function (e) { e.push(fold(e[0])); return e; }); return INDEX; }); return LOADING; }
  function loadSport(k) { if (!SPORTDATA[k]) SPORTDATA[k] = getJSON("/data/stat-lab/" + k + ".json" + DATA_V); return SPORTDATA[k]; }
  function slabel(k, s) { return (k === "nba" || k === "nhl" || k === "soccer") ? (s - 1) + "–" + String(s).slice(2) : String(s); }
  function initials(n) { var w = String(n).replace(/[^A-Za-z .'-]/g, "").split(/\s+/).filter(Boolean); return ((w[0] || "?")[0] + (w.length > 1 ? w[w.length - 1][0] : "")).toUpperCase(); }
  function fmt(v) { return typeof v === "number" ? (Math.round(v) === v ? v.toLocaleString("en-US") : v.toFixed(1)) : (v == null ? "—" : v); }

  // search key: lowercase, accents and punctuation folded, so "odegaard" finds
  // Ødegaard, "jose ramirez" José Ramírez and "tj watt" T.J. Watt
  function fold(s) {
    s = String(s).toLowerCase();
    if (s.normalize) s = s.normalize("NFD").replace(/[̀-ͯ]/g, "");
    return s.replace(/ø/g, "o").replace(/æ/g, "ae").replace(/œ/g, "oe").replace(/ß/g, "ss").replace(/[łđ]/g, function (c) { return c === "ł" ? "l" : "d"; })
      .replace(/[.'’`]/g, "").replace(/-/g, " ").replace(/\s+/g, " ").trim();
  }

  function search(q) {
    q = fold(q);
    if (q.length < 2) return null;
    var teams = [];
    SPORTS.forEach(function (k) { franchises(k).forEach(function (f) { var n = fold(f.name || tname(k, f.key)); var i = n.indexOf(q); if (i > -1 || String(f.key).toLowerCase() === q) teams.push([k, f.key, i === 0 ? 0 : 1]); }); });
    teams.sort(function (a, b) { return a[2] - b[2]; });
    var pl = [];
    (INDEX || []).forEach(function (e) { var n = e[8], i = n.indexOf(q); if (i < 0) return; pl.push([e, (i === 0 || n[i - 1] === " ") ? 0 : 1]); });
    pl.sort(function (a, b) { return a[1] - b[1] || b[0][7] - a[0][7]; });
    return { teams: teams.slice(0, 6), players: pl.slice(0, 12).map(function (x) { return x[0]; }), more: Math.max(0, pl.length - 12) };
  }
  function renderResults(inp, res, rollEl) {
    var r = search(inp.value);
    if (!r) { res.hidden = true; rollEl.hidden = false; return; }
    rollEl.hidden = true; res.hidden = false;
    var h = "";
    if (r.teams.length) {
      h += '<div class="dgrp">Teams</div><div class="dlist">' + r.teams.map(function (x) {
        return '<button type="button" class="drow" data-team="' + x[0] + "|" + esc(String(x[1])) + '">' + badge(x[0], x[1]) + '<span class="dn"><b>' + esc(tname(x[0], x[1])) + "</b><small>" + SHORT[x[0]] + " · team</small></span>" + CHEV + "</button>";
      }).join("") + "</div>";
    }
    if (r.players.length) {
      h += '<div class="dgrp">Players</div><div class="dlist">' + r.players.map(function (e) {
        return '<button type="button" class="drow" data-player="' + e[1] + "|" + e[2] + '"><span class="av" style="--c:' + accent(e[1]) + '">' + esc(initials(e[0])) + '</span><span class="dn"><b>' + esc(e[0]) + "</b><small>" + SHORT[e[1]] + " · " + esc(e[3]) + " · " + slabel(e[1], e[4]) + "–" + String(slabel(e[1], e[5])).slice(-2) + " · " + esc(abbr(e[1], canon(e[1], e[6]))) + "</small></span>" + CHEV + "</button>";
      }).join("") + "</div>";
    }
    if (!INDEX) h += '<p class="dnote">Loading players…</p>';
    else if (!r.teams.length && !r.players.length) h = '<p class="dnote">Nothing called “' + esc(inp.value.trim()) + '” in the data yet.</p>';
    if (r.more) h += '<p class="dnote">+' + r.more + " more players. Keep typing to narrow it down.</p>";
    res.innerHTML = h;
  }

  /* ---------- profiles ---------- */
  function playerProfile(k, i, D) {
    var p = D.players[i], se = p[3], pref = D.pref, keys = pref[p[2]] || pref["*"] || pref[Object.keys(pref)[0]];
    var lab = function (key) { return D.labels[key] || key; };
    var tot = [0, 0, 0], teams = [], last = null;
    se.forEach(function (r) {
      for (var j = 0; j < 3; j++) tot[j] += +r[3 + j] || 0;
      var c = canon(k, r[1]);
      if (c !== last) { teams.push([c, r[0], r[0]]); last = c; } else teams[teams.length - 1][2] = r[0];
    });
    var peak = se.reduce(function (a, r) { return (+r[3]) > (+a[3]) ? r : a; }, se[0]);
    var max = Math.max.apply(null, se.map(function (r) { return +r[3] || 0; })) || 1;
    var h = '<div class="pf" style="--c:' + accent(k) + '"><div class="pf-head"><span class="av big">' + esc(initials(p[0])) + '</span><div><span class="pf-k">' + SHORT[k] + " · " + esc(p[1]) + '</span><h3 id="pf-h">' + esc(p[0]) + '</h3><span class="pf-sub">' + slabel(k, se[0][0]) + " to " + slabel(k, se[se.length - 1][0]) + " · " + se.length + " seasons · " + teams.length + " team" + (teams.length > 1 ? "s" : "") + "</span></div></div>";
    h += '<div class="pf-tot">' + keys.map(function (key, j) { return '<div><span class="lbl">Career ' + esc(lab(key)) + '</span><span class="led">' + seg(String(Math.round(tot[j]))) + "</span></div>"; }).join("") + "</div>";
    h += '<div class="pf-sec"><div class="pf-sk">Team journey</div><div class="pf-teams">' + teams.map(function (t) {
      return '<button type="button" class="drow" data-team="' + k + "|" + esc(String(t[0])) + '">' + badge(k, t[0]) + '<span class="dn"><b>' + esc(tname(k, t[0])) + "</b><small>" + slabel(k, t[1]) + (t[2] !== t[1] ? "–" + slabel(k, t[2]) : "") + "</small></span></button>";
    }).join("") + "</div></div>";
    h += '<div class="pf-sec"><div class="pf-sk">' + esc(lab(keys[0])) + " by season <span>peak " + slabel(k, peak[0]) + ": " + fmt(peak[3]) + '</span></div><div class="bars" role="img" aria-label="' + esc(lab(keys[0])) + ' by season">' +
      se.map(function (r) { var v = +r[3] || 0; return '<span class="bar' + (r === peak ? " pk" : "") + '" style="--h:' + Math.max(3, Math.round(v / max * 100)) + '%" title="' + slabel(k, r[0]) + ": " + fmt(v) + '"><i></i><em>' + String(r[0]).slice(2) + "</em></span>"; }).join("") + "</div></div>";
    h += '<div class="pf-sec"><div class="pf-sk">Season by season</div><div class="tbl-wrap"><table class="pft"><thead><tr><th>Season</th><th>Team</th><th>G</th>' + keys.map(function (key) { return "<th>" + esc(lab(key)) + "</th>"; }).join("") + "</tr></thead><tbody>" +
      se.slice().reverse().map(function (r) { return "<tr" + (r === peak ? ' class="pk"' : "") + "><td>" + slabel(k, r[0]) + "</td><td>" + esc(abbr(k, canon(k, r[1]))) + "</td><td>" + (r[2] || "—") + "</td><td>" + fmt(r[3]) + "</td><td>" + fmt(r[4]) + "</td><td>" + fmt(r[5]) + "</td></tr>"; }).join("") + "</tbody></table></div></div>";
    var games = (window.EBK && EBK.live && EBK.live[k]) || [];
    h += '<div class="pf-cta">' + [["career-path", "Career Path"], ["higher-lower", "Higher / Lower"], ["stat-line", "Stat Line"]].filter(function (g) { return games.indexOf(g[0]) > -1; }).map(function (g) { return '<a href="/' + k + "/" + g[0] + '">' + g[1] + " " + ARROW + "</a>"; }).join("") + "</div></div>";
    return h;
  }
  function teamProfile(k, key, D) {
    var rows = [], seasons = {};
    D.players.forEach(function (p, i) {
      var n = 0, v = 0, y0 = null, y1 = null;
      p[3].forEach(function (r) { if (String(canon(k, r[1])) === String(key)) { n++; v += +r[3] || 0; seasons[r[0]] = 1; if (y0 === null) y0 = r[0]; y1 = r[0]; } });
      if (n) rows.push([i, n, v, y0, y1]);
    });
    rows.sort(function (a, b) { return b[1] - a[1] || b[2] - a[2]; });
    var ys = Object.keys(seasons).map(Number).sort(function (a, b) { return a - b; });
    var h = '<div class="pf" style="--c:' + accent(k) + '"><div class="pf-head">' + badge(k, key, true) + '<div><span class="pf-k">' + SHORT[k] + ' · team</span><h3 id="pf-h">' + esc(tname(k, key)) + '</h3><span class="pf-sub">' + (ys.length ? slabel(k, ys[0]) + " to " + slabel(k, ys[ys.length - 1]) + " · " : "") + rows.length + " players in the data</span></div></div>";
    h += '<div class="pf-sec"><div class="pf-sk">Longest-serving players <span>seasons with the team</span></div><div class="dlist">' + rows.slice(0, 10).map(function (r) {
      var p = D.players[r[0]], pk = (D.pref[p[2]] || D.pref["*"] || D.pref[Object.keys(D.pref)[0]])[0];
      return '<button type="button" class="drow" data-player="' + k + "|" + r[0] + '"><span class="av" style="--c:' + accent(k) + '">' + esc(initials(p[0])) + '</span><span class="dn"><b>' + esc(p[0]) + "</b><small>" + esc(p[1]) + " · " + slabel(k, r[3]) + (r[4] !== r[3] ? "–" + slabel(k, r[4]) : "") + " · " + fmt(Math.round(r[2])) + " " + esc(String(D.labels[pk] || pk).toLowerCase()) + '</small></span><span class="mled">' + r[1] + "</span></button>";
    }).join("") + "</div></div>";
    h += '<div class="pf-cta"><a href="/' + k + "/team?t=" + encodeURIComponent(key) + '">Open Team Study ' + ARROW + "</a>" + ((window.EBK && EBK.isLive && EBK.isLive(k, "player-grid")) ? '<a href="/' + k + '/player-grid">Player Grid ' + ARROW + "</a>" : "") + "</div></div>";
    return h;
  }
  function dialog() {
    var d = $("#pfdlg");
    if (d) return d;
    d = document.createElement("dialog"); d.id = "pfdlg"; d.setAttribute("aria-labelledby", "pf-h");
    d.innerHTML = '<button type="button" class="pfx" aria-label="Close">×</button><div class="pfbody"></div>';
    document.body.appendChild(d);
    $(".pfx", d).addEventListener("click", function () { d.close(); });
    d.addEventListener("click", function (e) { if (e.target === d) d.close(); else openFrom(e); });
    return d;
  }
  function show(promise) {
    var d = dialog(), body = $(".pfbody", d);
    body.innerHTML = '<div class="pf"><p class="dnote">Loading…</p></div>';
    if (!d.open) { if (d.showModal) d.showModal(); else d.setAttribute("open", ""); }
    promise.then(function (html) { body.innerHTML = html; body.scrollTop = 0; })
      .catch(function () { body.innerHTML = '<div class="pf"><p class="dnote">Couldn’t load that profile. Try again in a moment.</p></div>'; });
  }
  function openFrom(e) {
    var b = e.target.closest && e.target.closest("[data-player],[data-team]");
    if (!b) return;
    e.preventDefault();
    if (b.dataset.player) { var x = b.dataset.player.split("|"); show(loadSport(x[0]).then(function (D) { return playerProfile(x[0], +x[1], D); })); }
    else { var y = b.dataset.team.split("|"); show(loadSport(y[0]).then(function (D) { return teamProfile(y[0], y[1], D); })); }
  }
  function statLab() {
    var panel = $(".dpanel");
    if (!panel) return;
    var inp = $("[data-dsearch]", panel), res = $("[data-dres]", panel), rollEl = $("[data-roll]", panel);
    roll();
    inp.addEventListener("focus", function () { loadIndex().then(function () { if (inp.value) renderResults(inp, res, rollEl); }).catch(function () {}); }, { once: true });
    inp.addEventListener("input", function () { if (!INDEX) loadIndex().then(function () { renderResults(inp, res, rollEl); }).catch(function () {}); renderResults(inp, res, rollEl); });
    panel.addEventListener("click", openFrom);
  }

  function init() {
    digits();
    try { h2h(); } catch (e) {}
    try { deepCut(); } catch (e) {}
    try { deepBag(); } catch (e) {}
    try { meta(); } catch (e) {}
    try { statLab(); } catch (e) {}
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
