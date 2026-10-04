/* EBK · Leaderboards — rankings from Firestore.
   Categories: best run per sport+game, per-sport totals, per-game totals
   (across sports), overall total, most games played. Totals = sum of a
   player's best runs in each mode they've played. */
(function () {
  "use strict";
  var $ = function (s) { return document.querySelector(s); };
  var catSel = $("#cat"), sportSel = $("#sport"), gameSel = $("#game"),
      board = $("#board"), status = $("#status"), metricTh = $("#metric");

  var METRIC = { "higher-lower": "Best streak", "stat-line": "Best score",
                 "career-path": "Best score", "player-grid": "Best (of 9)" };

  function liveSports() { return EBK.sports.filter(function (s) { return EBK.sportLive(s.key); }); }
  function liveGames(sport) {
    return EBK.games.filter(function (g) {
      return g.slug !== "team" && (!sport || EBK.isLive(sport, g.slug));
    });
  }

  var BALL = { nfl: "football", cfb: "football", nba: "basketball", mlb: "baseball", nhl: "hockey", soccer: "soccer" };
  function fillSports() {
    var list = liveSports();
    sportSel.innerHTML = list.map(function (s) {
      return '<option value="' + s.key + '">' + s.emoji + " " + s.name + "</option>";
    }).join("");
    // quick-pick chips: a skin over the same <select> (it stays the source of truth)
    var chips = $("#sport-chips");
    if (chips) {
      chips.innerHTML = list.map(function (s) {
        return '<button type="button" class="k-chip lb-chip" data-v="' + s.key + '" aria-pressed="false">' +
          '<span class="k-ball ' + (BALL[s.key] || "football") + '" aria-hidden="true"></span>' + esc(s.name) + "</button>";
      }).join("");
      chips.addEventListener("click", function (e) {
        var b = e.target.closest && e.target.closest(".lb-chip");
        if (!b || sportSel.value === b.dataset.v) return;
        sportSel.value = b.dataset.v;
        sportSel.dispatchEvent(new Event("change"));
      });
    }
    syncChips();
  }
  function syncChips() {
    document.querySelectorAll(".lb-chip").forEach(function (b) {
      b.setAttribute("aria-pressed", String(b.dataset.v === sportSel.value));
    });
  }
  function fillGames() {
    var sport = catSel.value === "game" ? sportSel.value : null;
    gameSel.innerHTML = liveGames(sport).map(function (g) {
      return '<option value="' + g.slug + '">' + g.title + "</option>";
    }).join("");
  }

  function applyCat() {
    var cat = catSel.value;
    $("#sport-field").style.display = (cat === "game" || cat === "sport") ? "" : "none";
    $("#game-field").style.display = (cat === "game" || cat === "game-all") ? "" : "none";
    fillGames();
    load();
  }

  function repBtn(r, mine) {
    return mine ? "" : '<button class="rep-btn" title="Report name" aria-label="Report name" data-uid="' +
      esc(r.uid || "") + '" data-name="' + esc(r.name || "") + '">⚑</button>';
  }
  function rowHTML(r, i, me, valueOf) {
    var mine = me && r.uid === me;
    var v = valueOf(r);
    return "<tr" + (mine ? ' class="me"' : "") +
      '><td class="rank"><span class="k-mled dim">' + (i + 1) +
      '</span></td><td class="pname">' + esc(r.name || "Player") + (mine ? ' <span class="k-tag soft">You</span>' : "") + repBtn(r, mine) +
      '</td><td class="metric">' + (v != null ? Number(v).toLocaleString() : "—") +
      '</td><td class="plays">' + (r.plays || 0) + "</td></tr>";
  }
  // top three: scoreboard cards with LED rank + LED metric
  var PLACE = ["1st", "2nd", "3rd"];
  function podHTML(r, i, me, valueOf, metricLabel) {
    var mine = me && r.uid === me;
    var v = valueOf(r);
    var num = v != null ? String(Math.round(Number(v) * 10) / 10) : "--";
    return '<li class="k-card lb-p p' + (i + 1) + (mine ? " me" : "") + '">' +
      '<div class="lb-p-top"><span class="lb-rk" data-seg="' + (i + 1) + '" data-seg-label="Rank ' + (i + 1) + '"></span>' +
      '<span class="lb-who"><span class="lb-pl">' + PLACE[i] + "</span>" +
      '<b class="lb-nm">' + esc(r.name || "Player") + (mine ? ' <span class="k-tag soft">You</span>' : "") + "</b></span>" +
      repBtn(r, mine) + "</div>" +
      '<div class="k-board full lb-sb"><div class="k-cell"><span class="k-lbl">' + esc(metricLabel) + '</span>' +
      '<span class="k-led y" data-seg="' + num + '" data-seg-label="' + esc(v != null ? Number(v).toLocaleString() : "none") + '"></span></div>' +
      '<div class="k-cell"><span class="k-lbl">Plays</span><span class="k-led w sm" data-seg="' + (r.plays || 0) + '"></span></div></div>' +
      "</li>";
  }
  function openHTML(i) {
    return '<li class="k-card lb-p lb-open p' + (i + 1) + '" aria-label="' + PLACE[i] + ' place is open">' +
      '<div class="lb-p-top"><span class="lb-rk k-seg off" data-seg="' + (i + 1) + '" aria-hidden="true"></span>' +
      '<span class="lb-who"><span class="lb-pl">' + PLACE[i] + '</span><b class="lb-nm">Open spot</b></span></div>' +
      '<p class="lb-open-t">Post a run to claim it.</p></li>';
  }
  function emptyHTML(t, sub) {
    return '<li class="k-empty lb-empty"><span class="k-ball ' + (BALL[sportSel.value] || "football") + '" aria-hidden="true"></span>' +
      "<b>" + esc(t) + "</b>" + (sub ? "<p>" + esc(sub) + "</p>" : "") + "</li>";
  }
  function setWhat() {
    var cat = catSel.value, w = $("#lb-what");
    if (!w) return;
    var sp = sportSel.options[sportSel.selectedIndex], gm = gameSel.options[gameSel.selectedIndex];
    var sn = sp ? sp.textContent.replace(/^\S+\s/, "") : "", gn = gm ? gm.textContent : "";
    var t = cat === "game" ? [sn, gn] : cat === "sport" ? [sn, "All games"] : cat === "game-all" ? [gn, "All sports"]
      : cat === "plays" ? ["Most played", "Every game"] : ["Overall", "Everything"];
    w.innerHTML = esc(t[0]) + " <i>" + esc(t[1]) + "</i>";
  }

  var connTries = 0;
  function load() {
    var cat = catSel.value, sport = sportSel.value, game = gameSel.value;
    board.innerHTML = "";
    var pod = $("#podium"), tw = $("#lb-tw");
    tw.hidden = true; setWhat(); syncChips();
    pod.innerHTML = '<li class="lb-p lb-ghost"></li><li class="lb-p lb-ghost"></li><li class="lb-p lb-ghost"></li>';
    pod.setAttribute("aria-busy", "true");
    status.textContent = "Loading…";
    if (!window.EBKF) {
      if (++connTries > 40) { status.textContent = ""; pod.removeAttribute("aria-busy"); pod.innerHTML = emptyHTML("Can't reach EBK right now", "Check your connection and refresh."); return; }
      status.textContent = "Connecting…"; return setTimeout(load, 200);
    }
    connTries = 0;

    var p, valueOf;
    if (cat === "game") {
      metricTh.textContent = METRIC[game] || "Best";
      valueOf = function (r) { return r.best; };
      p = EBKF.leaderboard(sport, game, 100);
    } else {
      var field = cat === "sport" ? "s_" + sport
        : cat === "game-all" ? EBKF.gameField(game)
        : cat === "plays" ? "plays" : "overall";
      metricTh.textContent = cat === "plays" ? "Games played" : "Total";
      valueOf = function (r) { return r[field]; };
      p = EBKF.topTotals(field, 100).then(function (rows) {
        return rows.filter(function (r) { return (r[field] || 0) > 0; });
      });
    }

    p.then(function (rows) {
      var me = EBKF.user && EBKF.user.uid;
      pod.removeAttribute("aria-busy");
      if (!rows.length) { status.textContent = ""; pod.innerHTML = emptyHTML("No scores here yet", "Be the first to play and take the top spot."); return; }
      status.textContent = rows.length + " player" + (rows.length === 1 ? "" : "s");
      var top = rows.slice(0, 3).map(function (r, i) { return podHTML(r, i, me, valueOf, metricTh.textContent); });
      for (var oi = top.length; oi < 3; oi++) top.push(openHTML(oi));   // unclaimed podium spots
      pod.innerHTML = top.join("");
      if (window.EBKKit) EBKKit.digits(pod);
      board.innerHTML = rows.slice(3).map(function (r, i) { return rowHTML(r, i + 3, me, valueOf); }).join("");
      tw.hidden = rows.length <= 3;
    }).catch(function (e) {
      pod.removeAttribute("aria-busy");
      status.textContent = "";
      pod.innerHTML = emptyHTML("Leaderboards aren't available yet", e && e.message ? e.message : "");
    });
  }
  function esc(s) { return String(s).replace(/[<>&"']/g, function (c) { return { "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&#39;" }[c]; }); }

  $("#lb-res").addEventListener("click", function (e) {
    var b = e.target.closest && e.target.closest(".rep-btn");
    if (!b) return;
    if (!(window.EBKF && EBKF.user)) { window.EBKopenAuth && EBKopenAuth(); return; }
    var reason = prompt("Report \"" + b.dataset.name + "\" as an inappropriate name?\nOptional reason:", "");
    if (reason === null) return;
    EBKF.reportName(b.dataset.uid, b.dataset.name, reason)
      .then(function () { b.textContent = "✓"; b.disabled = true; b.title = "Reported"; })
      .catch(function () { alert("Couldn't submit the report — try again."); });
  });

  fillSports(); fillGames(); applyCat();
  catSel.addEventListener("change", applyCat);
  sportSel.addEventListener("change", function () { fillGames(); load(); });
  gameSel.addEventListener("change", load);
  // refresh once auth resolves (to highlight the user's row); give up quietly
  // after ~10s — the board itself already shows a connection error via load()
  var ticks = 0;
  var t = setInterval(function () {
    if (window.EBKF && EBKF.onChange) { clearInterval(t); EBKF.onChange(function () { load(); }); }
    else if (++ticks > 100) clearInterval(t);
  }, 100);
})();
