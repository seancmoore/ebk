/* EBK · Deep Cut — one deep ball-knowledge question per ET day.
 *
 * The schedule is /data/deep-cuts.json, built by tools/build_deep_cuts.py from
 * the verified bank in data/deep-cuts/. Everyone gets the same question on the
 * same ET date. Three guesses; a hint after each miss; number answers also say
 * higher or lower.
 *
 * State (localStorage):
 *   ebk_dcut_<YYYY-MM-DD>  { g: [guess...], done, win, n }   today's play
 *   ebk_dcut_log           { "<date>": 0|1|2|3 }  compact history (0 = missed,
 *                          k = solved on guess k) used for the streak/solved chips
 * Finishing also calls EBKDaily.markPlayed() so it keeps the site-wide daily
 * streak alive, same as a grid.
 *
 * Community numbers (signed-in players only, one per account per day, enforced
 * in firestore.rules): deepCutStats/{date} = { p, s1, s2, s3, x }.
 */
(function () {
  "use strict";

  var DATA_URL = "/data/deep-cuts.json";
  var MAX_GUESSES = 3;
  var LOG = "ebk_dcut_log";
  var KEEP_RAW_DAYS = 14;

  var $ = function (s) { return document.querySelector(s); };
  function ls() { try { return window.localStorage; } catch (e) { return null; } }
  function get(k) { var s = ls(); try { return s ? s.getItem(k) : null; } catch (e) { return null; } }
  function set(k, v) { var s = ls(); try { s && s.setItem(k, v); } catch (e) {} }
  function parse(s) { try { return JSON.parse(s); } catch (e) { return null; } }
  function esc(s) {
    return String(s).replace(/[<>&"']/g, function (c) {
      return { "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  // Firebase loads lazily, like the grid: the question never waits on it.
  (function () {
    if (!window.EBKF) {
      var s = document.createElement("script");
      s.src = "/js/ebk-firebase.js";
      document.head.appendChild(s);
    }
  })();

  function etDate(offsetDays) {
    if (window.EBKDaily) return EBKDaily.etDate(offsetDays);
    var s = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());
    if (!offsetDays) return s;
    var p = s.split("-");
    var d = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2]));
    d.setUTCDate(d.getUTCDate() + offsetDays);
    return d.toISOString().slice(0, 10);
  }
  function dayIndex(start, date) {
    var a = start.split("-"), b = date.split("-");
    return Math.round((Date.UTC(+b[0], +b[1] - 1, +b[2]) - Date.UTC(+a[0], +a[1] - 1, +a[2])) / 864e5);
  }

  /* ---- answer matching ------------------------------------------------ */

  // Must match norm() in tools/build_deep_cuts.py.
  function norm(s) {
    s = String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    s = s.replace(/&/g, " and ").replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
    return s.replace(/^the /, "");
  }
  function squash(s) { return norm(s).replace(/ /g, ""); }
  function lev(a, b) {
    if (a === b) return 0;
    var m = a.length, n = b.length, prev = [], cur, i, j;
    for (j = 0; j <= n; j++) prev[j] = j;
    for (i = 1; i <= m; i++) {
      cur = [i];
      for (j = 1; j <= n; j++) {
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      }
      prev = cur;
    }
    return prev[n];
  }
  // Typos are forgiven in proportion to length: none under 5 letters (Jets vs
  // Nets), one up to 9, two beyond. Compared with spaces removed so "TJ Watt",
  // "T.J. Watt" and "T. J. Watt" all land the same.
  function textMatch(guess, accepted) {
    var g = squash(guess);
    if (!g) return false;
    for (var i = 0; i < accepted.length; i++) {
      var a = accepted[i].replace(/ /g, "");
      if (g === a) return true;
      var tol = a.length >= 10 ? 2 : a.length >= 5 ? 1 : 0;
      if (tol && Math.abs(g.length - a.length) <= tol && lev(g, a) <= tol) return true;
    }
    return false;
  }
  function parseNum(s) {
    var t = String(s || "").replace(/[,$%\s]/g, "");
    if (!/^-?\d+(\.\d+)?$/.test(t)) return null;
    return parseFloat(t);
  }

  function unpack(x) {
    var b = x.split("").reverse().join("");
    var bin = atob(b);
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return JSON.parse(new TextDecoder("utf-8").decode(bytes));
  }

  /* ---- labels --------------------------------------------------------- */

  var SPORT_META = {
    nfl: { name: "NFL" }, nba: { name: "NBA" }, mlb: { name: "MLB" }, nhl: { name: "NHL" },
    cfb: { name: "College Football" }, soccer: { name: "Soccer" },
    cbb: { name: "College Hoops", emoji: "\u{1F3C0}", accent: "#ff9f43" },
  };
  function sportTag(key) {
    var m = (window.EBK && EBK.sport && EBK.sport(key)) || null;
    var meta = SPORT_META[key] || { name: key.toUpperCase() };
    var name = meta.name;
    var logo = m && m.logo
      ? '<img class="dc-sport-logo" src="' + m.logo + '" alt="" onerror="this.remove()" />'
      : '<span class="dc-sport-emoji" aria-hidden="true">' + (meta.emoji || (m && m.emoji) || "") + "</span>";
    return logo + "<span>" + esc(name) + "</span>";
  }
  function sportAccent(key) {
    var m = (window.EBK && EBK.sport && EBK.sport(key)) || null;
    return (m && m.accent) || (SPORT_META[key] || {}).accent || null;
  }
  var TYPE_LABEL = {
    "player": "Name the player", "player-season": "Name the player",
    "number": "Name the number", "year": "Name the year", "team": "Name the team",
    "coach": "Name the coach", "venue": "Name the place", "nickname": "Name them", "other": "Name it",
  };
  var LEVELS = { 2: "Deep", 3: "Deeper", 4: "Elite" };
  var PLACEHOLDER = {
    number: "Type a number…", year: "Type a year…", team: "Type a team…",
    coach: "Type a name…", venue: "Type a place…",
  };

  /* ---- state ---------------------------------------------------------- */

  var S = { date: etDate(), day: null, a: null, g: [], done: false, win: false, no: 0 };

  function saveToday() {
    set("ebk_dcut_" + S.date, JSON.stringify({ g: S.g, done: S.done, win: S.win, n: S.no, id: S.day.id }));
  }
  function logResult() {
    var log = parse(get(LOG)) || {};
    log[S.date] = S.win ? S.g.length : 0;
    // keep a year and change of history
    var keys = Object.keys(log).sort();
    while (keys.length > 400) delete log[keys.shift()];
    set(LOG, JSON.stringify(log));
    // prune old per-day snapshots; the log keeps what the chips need
    var store = ls();
    if (!store) return;
    var cutoff = etDate(-KEEP_RAW_DAYS), stale = [];
    for (var i = 0; i < store.length; i++) {
      var k = store.key(i);
      if (k && k.indexOf("ebk_dcut_2") === 0 && k.slice(9) < cutoff) stale.push(k);
    }
    stale.forEach(function (k) { try { store.removeItem(k); } catch (e) {} });
  }
  function chips() {
    var log = parse(get(LOG)) || {};
    var solved = 0;
    Object.keys(log).forEach(function (d) { if (log[d] > 0) solved++; });
    // solve streak: consecutive days solved, counting back from today if it is
    // done, else from yesterday (an unplayed today does not break it yet)
    var n = 0, i = log[S.date] != null ? 0 : -1;
    for (; i > -400; i--) { var r = log[etDate(i)]; if (!(r > 0)) break; n++; }
    $("#dc-streak").textContent = n;
    $("#dc-solved").textContent = solved;
  }

  /* ---- render --------------------------------------------------------- */

  function render() {
    var d = S.day, a = S.a;
    var acc = sportAccent(d.s);
    if (acc) document.body.style.setProperty("--sport", acc);
    $("#dc-no").textContent = "· #" + S.no;
    $("#dc-sport").innerHTML = sportTag(d.s);
    $("#dc-level").innerHTML = [2, 3, 4].map(function (l) {
      return '<i class="' + (l <= d.lv ? "on" : "") + '"></i>';
    }).join("") + "<span>" + LEVELS[d.lv] + "</span>";
    $("#dc-type").textContent = TYPE_LABEL[d.t] || "Name it";
    $("#dc-q").textContent = d.q;

    var isNum = a.k === "number";
    var inp = $("#dc-input");
    inp.placeholder = PLACEHOLDER[d.t] || (isNum ? PLACEHOLDER.number : "Type your answer…");
    inp.setAttribute("inputmode", isNum ? "decimal" : "text");

    // guesses so far
    $("#dc-guesses").innerHTML = S.g.map(function (g, i) {
      var right = S.win && i === S.g.length - 1;
      var dir = "";
      if (!right && isNum) {
        var v = parseNum(g);
        if (v != null) dir = v < a.n ? '<span class="dc-dir">Higher ↑</span>' : '<span class="dc-dir">Lower ↓</span>';
      }
      return '<li class="' + (right ? "ok" : "no") + '"><span class="dc-mark">' + (right ? "✓" : "✕") +
        "</span><span class=\"dc-gtext\">" + esc(g) + "</span>" + dir + "</li>";
    }).join("");

    // hints: one per miss, both once the round is over
    var misses = S.g.length - (S.win ? 1 : 0);
    var shown = S.done ? a.h.length : Math.min(misses, a.h.length);
    $("#dc-hints").innerHTML = a.h.slice(0, shown).map(function (h, i) {
      return '<p class="dc-hint"><span>Hint ' + (i + 1) + "</span>" + esc(h) + "</p>";
    }).join("");

    var left = MAX_GUESSES - S.g.length;
    $("#dc-form").hidden = S.done;
    $("#dc-giveup").hidden = S.done;
    $("#dc-left").textContent = S.done ? "" : left + (left === 1 ? " guess left" : " guesses left");
    $("#dc-left").className = "dc-left" + (left === 1 ? " last" : "");
    if (S.done) showResult();
    chips();
  }

  function showResult() {
    var a = S.a;
    $("#dc-result").hidden = false;
    var b = $("#dc-banner");
    if (S.win) {
      b.textContent = S.g.length === 1 ? "First try. Elite ball knowledge." :
        S.g.length === 2 ? "Got it in two." : "Got it on the last guess.";
      b.className = "banner good";
    } else {
      b.textContent = S.g.length ? "Not today." : "You gave up. Respect the honesty.";
      b.className = "banner bad";
    }
    $("#dc-answer").textContent = a.a;
    $("#dc-fact").textContent = a.f;
    var src = $("#dc-src");
    if (a.src && /^https?:\/\//.test(a.src)) {
      src.href = a.src;
      try { src.textContent = "Source: " + new URL(a.src).hostname.replace(/^www\./, ""); } catch (e) {}
      src.parentNode.hidden = false;
    } else src.parentNode.hidden = true;

    var row = $("#dc-btns");
    row.innerHTML = "";
    addBtn(row, "Share result", "primary", doShare);
    var bag = document.createElement("a");
    bag.className = "gbtn ghost"; bag.href = "/deep-bag"; bag.textContent = "Read the Deep Bag";
    row.appendChild(bag);
    $("#dc-next").textContent = "Next Deep Cut in " + (window.EBKDaily ? EBKDaily.hoursToReset() : "a few hours") + ".";
    loadStats();
    showDaily();
  }

  function addBtn(row, label, kind, fn) {
    var btn = document.createElement("button");
    btn.type = "button"; btn.className = "gbtn " + kind; btn.textContent = label;
    btn.addEventListener("click", fn); row.appendChild(btn);
  }

  function showDaily() {
    try {
      if (!window.EBKDaily) return;
      var host = $("#dc-daily");
      host.innerHTML = "";
      host.appendChild(EBKDaily.card({ compact: true, exclude: "deep-cut" }));
    } catch (e) {}
  }

  /* ---- guessing ------------------------------------------------------- */

  function isRight(guess) {
    var a = S.a;
    if (a.k === "number") {
      var v = parseNum(guess);
      return v != null && Math.abs(v - a.n) < 1e-9;
    }
    return textMatch(guess, a.acc);
  }

  function msg(t, bad) {
    var m = $("#dc-msg");
    m.textContent = t || "";
    m.className = "dc-msg" + (bad ? " bad" : "");
  }

  function submit(e) {
    if (e) e.preventDefault();
    if (S.done) return;
    var inp = $("#dc-input");
    var guess = inp.value.trim();
    if (!guess) return;
    if (S.a.k === "number" && parseNum(guess) == null) { msg("Numbers only for this one.", true); return; }
    var seen = S.g.some(function (g) {
      return S.a.k === "number" ? parseNum(g) === parseNum(guess) : squash(g) === squash(guess);
    });
    if (seen) { msg("Already tried that one.", true); return; }
    msg("");
    S.g.push(guess.slice(0, 60));
    inp.value = "";
    if (isRight(guess)) {
      S.win = true; S.done = true;
      sfx("best");
    } else if (S.g.length >= MAX_GUESSES) {
      S.done = true;
      sfx("over");
    } else {
      sfx("wrong");
      var card = $("#game");
      card.classList.remove("shake"); void card.offsetWidth; card.classList.add("shake");
    }
    finishIfDone();
    render();
    if (!S.done) inp.focus();
  }

  function giveUp() {
    if (S.done) return;
    var btn = $("#dc-giveup");
    if (!btn.classList.contains("confirm")) {
      btn.classList.add("confirm");
      btn.textContent = "Sure? Tap again";
      setTimeout(function () { btn.classList.remove("confirm"); btn.textContent = "Give up"; }, 3000);
      return;
    }
    S.done = true; S.win = false;
    sfx("over");
    finishIfDone();
    render();
  }

  function finishIfDone() {
    saveToday();
    if (!S.done) return;
    logResult();
    try { window.EBKDaily && EBKDaily.markPlayed(S.date); } catch (e) {}
    try { window.EBKA && EBKA.send("finish"); } catch (e) {}
    recordCommunity();
  }

  function sfx(n) { try { window.EBKS && EBKS.play(n); } catch (e) {} }

  /* ---- community numbers ---------------------------------------------- */

  function whenFirebase(cb, tries) {
    tries = tries || 0;
    if (window.EBKF && EBKF.ready) return EBKF.ready.then(function () { cb(); }).catch(function () {});
    if (tries < 100) setTimeout(function () { whenFirebase(cb, tries + 1); }, 100);
  }

  function recordCommunity() {
    var result = S.win ? S.g.length : 0;
    whenFirebase(function () {
      if (!EBKF.recordDeepCut) return;
      var fire = function () {
        EBKF.recordDeepCut(S.date, result, S.g).then(loadStats).catch(function () {});
      };
      // auth state lands a beat after ready on a fresh load
      if (EBKF.user) fire();
      else EBKF.onChange(function (u) { if (u && !S._sent) { S._sent = true; fire(); } });
    });
  }

  function loadStats() {
    whenFirebase(function () {
      if (!EBKF.deepCutStats) return;
      $("#dc-signin").hidden = !!EBKF.user;
      EBKF.deepCutStats(S.date).then(function (st) {
        if (!st || !st.p) return;
        var rows = [
          { k: "1st", v: st.s1 || 0 }, { k: "2nd", v: st.s2 || 0 },
          { k: "3rd", v: st.s3 || 0 }, { k: "Miss", v: st.x || 0, miss: true },
        ];
        var solved = (st.s1 || 0) + (st.s2 || 0) + (st.s3 || 0);
        var mine = S.win ? S.g.length - 1 : 3;
        $("#dc-stats-k").textContent = Math.round(100 * solved / st.p) + "% of " + st.p +
          (st.p === 1 ? " player" : " players") + " got it today";
        $("#dc-dist").innerHTML = rows.map(function (r, i) {
          var pct = Math.round(100 * r.v / st.p);
          return '<div class="dc-bar' + (r.miss ? " miss" : "") + (i === mine ? " me" : "") + '">' +
            '<span class="dc-bar-k">' + r.k + "</span>" +
            '<span class="dc-bar-t"><span style="width:' + Math.max(pct, 2) + '%"></span></span>' +
            '<span class="dc-bar-v">' + pct + "%</span></div>";
        }).join("");
        $("#dc-stats").hidden = false;
      }).catch(function () {});
    });
  }

  /* ---- share ---------------------------------------------------------- */

  function shareText() {
    var sq = "";
    for (var i = 0; i < MAX_GUESSES; i++) {
      if (i < S.g.length) sq += (S.win && i === S.g.length - 1) ? "\u{1F7E9}" : "\u{1F7E5}";
      else sq += "⬜";
    }
    var name = (SPORT_META[S.day.s] || {}).name || S.day.s.toUpperCase();
    var line = S.win ? "Solved " + S.g.length + "/3" : "X/3";
    return "EBK Deep Cut #" + S.no + " · " + name + " · " + LEVELS[S.day.lv] + "\n" +
      line + "  " + sq + "\n\nhttps://eliteballknowledge.web.app/deep-cut?utm_source=share";
  }
  async function doShare() {
    var text = shareText();
    try { if (navigator.share) { await navigator.share({ text: text }); return; } }
    catch (e) { if (e && e.name === "AbortError") return; }
    try { await navigator.clipboard.writeText(text); msg("Result copied. Paste it anywhere."); return; }
    catch (e) {}
    msg("Couldn't copy. Screenshot it instead.", true);
  }

  /* ---- boot ----------------------------------------------------------- */

  function showYesterday(data) {
    var i = dayIndex(data.start, etDate(-1));
    var y = data.days[i];
    if (!y) return;
    try {
      var ya = unpack(y.x);
      $("#dc-yday-q").textContent = y.q;
      $("#dc-yday-a").textContent = ya.a;
      $("#dc-yday").hidden = false;
    } catch (e) {}
  }

  function restoreFromCloud() {
    // a play finished on another device shows up here once signed in
    whenFirebase(function () {
      if (!EBKF.getDeepCutPlay) return;
      EBKF.onChange(function (u) {
        if (!u || S.done) return;
        EBKF.getDeepCutPlay(S.date).then(function (p) {
          if (!p || S.done) return;
          S.g = (p.g || []).slice(0, MAX_GUESSES);
          S.win = p.r > 0; S.done = true;
          saveToday(); logResult();
          render();
        }).catch(function () {});
      });
    });
  }

  function boot() {
    fetch(DATA_URL).then(function (r) {
      if (!r.ok) throw new Error(r.status);
      return r.json();
    }).then(function (data) {
      var n = data.days.length;
      var i = dayIndex(data.start, S.date);
      if (!n) throw new Error("empty");
      // past the end of the bank: loop around rather than go dark
      var idx = ((i % n) + n) % n;
      S.day = data.days[idx];
      S.no = i + 1;
      S.a = unpack(S.day.x);
      var saved = parse(get("ebk_dcut_" + S.date));
      if (saved && saved.id === S.day.id) {
        S.g = saved.g || []; S.done = !!saved.done; S.win = !!saved.win;
      }
      $("#loading").hidden = true;
      $("#game").hidden = false;
      render();
      showYesterday(data);
      if (!S.done) {
        restoreFromCloud();
        // don't pop the keyboard over the question on phones
        if (window.matchMedia && matchMedia("(pointer: fine)").matches) $("#dc-input").focus();
      }
      try { window.EBKA && EBKA.send("start"); } catch (e) {}
    }).catch(function () {
      $("#loading").hidden = true;
      $("#load-err").hidden = false;
    });
  }

  $("#dc-form").addEventListener("submit", submit);
  $("#dc-giveup").addEventListener("click", giveUp);
  boot();

  // exposed for tests
  window.EBKDeepCut = { norm: norm, textMatch: textMatch, parseNum: parseNum, unpack: unpack };
})();
