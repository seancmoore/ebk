/* EBK · user dashboard — aggregate stats from the user's Firestore scores. */
(function () {
  "use strict";
  var $ = function (s) { return document.querySelector(s); };
  var sportName = {}, sportEmoji = {}, gameName = {}, sportAccent = {};
  var BALL = { nfl: "football", cfb: "football", nba: "basketball", mlb: "baseball", nhl: "hockey", soccer: "soccer" };
  function ball(k, size) { return '<span class="k-ball ' + (BALL[k] || "football") + '" style="--s:' + size + 'px" aria-hidden="true"></span>'; }
  function seg(root) { if (window.EBKKit) EBKKit.digits(root); }
  (window.EBK ? EBK.sports : []).forEach(function (s) {
    sportName[s.key] = s.name; sportAccent[s.key] = s.accent;
    sportEmoji[s.key] = EBK.logoTag ? EBK.logoTag(s) : s.emoji;
  });
  (window.EBK ? EBK.games : []).forEach(function (g) { gameName[g.slug] = g.title; });

  $("#signin-cta") && $("#signin-cta").addEventListener("click", function () { window.EBKopenAuth && EBKopenAuth(); });

  function show(id) { ["signedout", "loading", "stats"].forEach(function (x) { $("#" + x).hidden = x !== id; }); }

  // the Rack streak (this device), same numbers as the home rack. Purely a readout.
  (function rackBoard() {
    try {
      if (!window.EBKDaily || !EBKDaily.rack) return;
      var r = EBKDaily.rack(), two = function (n) { return (n < 10 ? "0" : "") + n; };
      var set = function (id, v, l) { var el = $(id); el.setAttribute("data-seg", v); el.setAttribute("data-seg-label", l); };
      set("#rk-days", two(r.days), r.days + " days");
      set("#rk-pts", two(r.pts), r.pts + " points");
      set("#rk-best", two(r.best ? r.best.d : 0), (r.best ? r.best.d : 0) + " day best streak");
      $("#db-rack").hidden = false;
      seg($("#db-rack"));
    } catch (e) {}
  })();
  function heroName(user) {
    var nm = (window.EBKF && EBKF.profileName) || user.displayName || "Player";
    $("#hello").innerHTML = "Hey, <em>" + esc(nm) + "</em>";
    var coin = $("#db-coin");
    if (coin) coin.innerHTML = "<b>" + esc(nm.charAt(0).toUpperCase()) + "</b>";
  }

  function render(rows, user) {
    heroName(user);
    if (!rows.length) {
      show("stats"); $("#cards").innerHTML = ""; $("#bysport").innerHTML = ""; $("#db-has").hidden = true;
      $("#gametable").innerHTML = ""; $("#empty").hidden = false;
      $("#subline").textContent = "No games logged yet.";
      return;
    }
    $("#empty").hidden = true; $("#db-has").hidden = false;
    var totalPlays = 0, totalScore = 0, best = null, bySport = {};
    rows.forEach(function (r) {
      totalPlays += r.plays || 0; totalScore += r.sumScore || 0;
      if (!best || r.best > best.best) best = r;
      var s = bySport[r.sport] || (bySport[r.sport] = { plays: 0, best: 0, score: 0 });
      s.plays += r.plays || 0; s.best = Math.max(s.best, r.best || 0); s.score += r.sumScore || 0;
    });
    var topSport = Object.keys(bySport).sort(function (a, b) { return bySport[b].plays - bySport[a].plays; })[0];
    var avg = totalPlays ? (totalScore / totalPlays) : 0;

    $("#subline").textContent = "Across " + rows.length + " game mode" + (rows.length === 1 ? "" : "s") + ".";
    $("#cards").innerHTML =
      card(String(totalPlays), "Games played", "", "w") +
      card(best ? String(best.best) : null, "Best run", best ? (gameName[best.game] + " · " + sportName[best.sport]) : "", "y") +
      card(avg.toFixed(1), "Avg / run", "", "") +
      card(null, "Top sport", topSport ? bySport[topSport].plays + " games" : "", "", topSport ? sportName[topSport] : "--", topSport);
    seg($("#cards"));

    var keys = Object.keys(bySport).sort(function (a, b) { return bySport[b].plays - bySport[a].plays; });
    $("#db-nsports").textContent = keys.length + (keys.length === 1 ? " sport" : " sports");
    $("#bysport").innerHTML = keys.map(function (k) {
        var s = bySport[k];
        return '<a class="k-card glow db-sport" href="/' + k + '" style="--c:' + (sportAccent[k] || "var(--accent)") + '">' +
          ball(k, 54) + '<div class="db-sport-t"><h3>' + esc(sportName[k] || k) + "</h3>" +
          '<div class="db-sport-m"><span class="k-mled">Best ' + s.best + '</span><span class="db-plays">' + s.plays + " games</span></div></div></a>";
      }).join("");

    $("#gametable").innerHTML = rows.slice().sort(function (a, b) { return (b.best || 0) - (a.best || 0); })
      .map(function (r) {
        var a = r.plays ? (r.sumScore / r.plays).toFixed(1) : "—";
        return '<tr><td><span class="db-sp">' + ball(r.sport, 22) + esc(sportName[r.sport] || r.sport) + "</span>" +
          '</td><td class="db-gm">' + esc(gameName[r.game] || r.game) + '</td><td class="db-best">' + (r.best != null ? r.best.toLocaleString() : "—") +
          "</td><td>" + (r.plays || 0) + "</td><td>" + a + "</td></tr>";
      }).join("");
    show("stats");
  }
  // one scoreboard cell: LED digits, or LED-styled text for non-digits
  function card(v, k, sub, color, text, sportKey) {
    var led = v != null
      ? '<span class="k-led ' + (color || "") + '" data-seg="' + v + '" data-seg-label="' + esc(v) + '"></span>'
      : '<span class="k-led ' + (color || "") + '"' + (sportKey ? ' style="--c:' + (sportAccent[sportKey] || "var(--accent)") + '"' : "") +
        '><span class="t">' + esc(text != null ? text : "--") + "</span></span>";
    return '<div class="k-cell"><span class="k-lbl">' + esc(k) + "</span>" + led +
      (sub ? '<span class="db-sub">' + esc(sub) + "</span>" : "") + "</div>";
  }

  // ---- account management ----
  function msg(t, ok) {
    var el = $("#acct-msg");
    if (el) { el.textContent = t || ""; el.style.color = ok ? "var(--accent)" : ""; }
  }
  function renderAccount(user) {
    $("#acct-name").textContent = (EBKF.profileName || user.displayName || "Player");
    var verified = user.emailVerified;
    $("#acct-email").innerHTML = esc(user.email || "") +
      ' <span class="acct-badge ' + (verified ? "ok" : "warn") + '">' +
      (verified ? "verified" : "unverified") + "</span>";
    $("#acct-verify").hidden = verified;
  }
  function esc(s) { return String(s).replace(/[<>&"']/g, function (c) { return { "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&#39;" }[c]; }); }

  $("#acct-rename") && $("#acct-rename").addEventListener("click", function () {
    var nn = prompt("New display name (2-20 characters, shown on public leaderboards):",
                    EBKF.profileName || "");
    if (nn == null) return;
    msg("Renaming…");
    EBKF.renameSelf(nn)
      .then(function (name) { msg("Done — you're now " + name + ".", true); renderAccount(EBKF.user); })
      .catch(function (e) {
        var c = (e && e.code) || "";
        msg(c === "ebk/name-taken" ? "That name is taken." :
            c.indexOf("name") > -1 ? "That name isn't allowed (2-20 simple characters)." :
            "Couldn't rename: " + (e && e.message || e));
      });
  });

  $("#acct-signout") && $("#acct-signout").addEventListener("click", function () {
    EBKF.signOut().then(function () { location.href = "/"; })
      .catch(function () { location.href = "/"; });
  });

  $("#acct-verify") && $("#acct-verify").addEventListener("click", function () {
    msg("Sending…");
    EBKF.resendVerification()
      .then(function () { msg("Verification email sent — check your inbox.", true); })
      .catch(function (e) { msg("Couldn't send: " + (e && e.message || e)); });
  });

  $("#acct-delete") && $("#acct-delete").addEventListener("click", function () {
    if (!confirm("Delete your EBK account?\n\nThis permanently removes your account, scores, and leaderboard entries. There is no undo.")) return;
    var pw = prompt("Confirm your password to delete the account:");
    if (pw == null) return;
    msg("Deleting account…");
    EBKF.deleteAccount(pw)
      .then(function () { alert("Your account and data have been deleted."); location.href = "/"; })
      .catch(function (e) {
        var c = (e && e.code) || "";
        msg(c.indexOf("wrong-password") > -1 || c.indexOf("invalid-credential") > -1
          ? "Wrong password — account not deleted."
          : "Couldn't delete: " + (e && e.message || e));
      });
  });

  var connTries = 0;
  function start() {
    if (!(window.EBKF && EBKF.onChange)) {
      if (++connTries > 130) {
        var el = $("#loading");
        if (el) el.textContent = "Can't reach EBK right now — check your connection and refresh.";
        return;
      }
      return setTimeout(start, 60);
    }
    EBKF.onChange(function (user) {
      if (!user) { show("signedout"); return; }
      show("loading");
      renderAccount(user);
      EBKF.myScores().then(function (rows) { render(rows, user); })
        .catch(function () { render([], user); });
    });
  }
  start();
})();
