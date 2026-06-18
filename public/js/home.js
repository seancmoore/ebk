/* EBK · home page — multi-sport marquee + "choose your sport" grid. */
(function () {
  "use strict";

  // ---- greet the player by name in the headline (else "guest")
  (function () {
    var el = document.getElementById("hero-name");
    if (!el) return;
    function set(user) {
      var nm = user ? ((window.EBKF && EBKF.profileName) || user.displayName || "Player") : "guest";
      el.textContent = nm;
    }
    var tick = function () {
      if (window.EBKF && EBKF.onChange) EBKF.onChange(set);
      else setTimeout(tick, 80);
    };
    tick();
  })();

  // ---- all-sports marquee: each league logo leads a run of its team logos
  (function () {
    var strip = document.getElementById("logo-strip");
    if (!strip || !window.EBK || !window.EBKBanner) return;
    var items = [];
    EBK.sports.forEach(function (s) {
      if (!EBK.sportLive(s.key)) return;
      if (s.logo) items.push({ href: "/" + s.key, title: s.name, src: s.logo, big: true });
      items = items.concat(EBKBanner.teamItems(s.key, 5));
    });
    if (items.length) EBKBanner.build(strip, items, "strip-arena");
    else strip.remove();
  })();

  // ---- daily-grid reset countdown (midnight ET)
  (function () {
    var el = document.getElementById("daily-reset");
    if (!el) return;
    function fmt() {
      var p = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(new Date());
      var g = function (t) { return +p.find(function (x) { return x.type === t; }).value; };
      var secs = 86400 - (((g("hour") % 24) * 3600) + g("minute") * 60 + g("second"));
      el.textContent = "New grids in " + Math.floor(secs / 3600) + "h " + Math.floor((secs % 3600) / 60) + "m";
    }
    fmt(); setInterval(fmt, 30000);
  })();

  // ---- personal "your form" line (signed in only)
  (function () {
    var el = document.getElementById("replay-you");
    if (!el) return;
    function show(user) {
      if (!user) { el.hidden = true; return; }
      Promise.all([
        EBKF.myScores ? EBKF.myScores().catch(function () { return []; }) : Promise.resolve([]),
        EBKF.db.collection("elo").doc(user.uid).get().then(function (d) { return d.exists ? d.data() : null; }).catch(function () { return null; }),
      ]).then(function (res) {
        var scores = res[0] || [], elo = res[1];
        var plays = scores.reduce(function (n, r) { return n + (r.plays || 0); }, 0);
        var parts = ["Welcome back, " + ((EBKF.profileName || user.displayName || "Player"))];
        if (plays) parts.push(plays.toLocaleString() + " games played");
        if (elo) {
          var best = null;
          Object.keys(elo).forEach(function (k) { if (k.indexOf("e_") === 0 && typeof elo[k] === "number" && (!best || elo[k] > best.v)) best = { s: k.slice(2), v: elo[k] }; });
          if (best) parts.push(best.s.toUpperCase() + " Elo " + best.v);
        }
        el.textContent = parts.join("  ·  ");
        el.hidden = false;
      });
    }
    var tick = function () { if (window.EBKF && EBKF.onChange) EBKF.onChange(show); else setTimeout(tick, 80); };
    tick();
  })();

  // ---- sports grid
  (function () {
    var grid = document.getElementById("sports-grid");
    if (!grid || !window.EBK) return;
    var liveCount = 0;
    EBK.sports.forEach(function (s) {
      var live = EBK.sportLive(s.key);
      if (live) liveCount++;
      var a = document.createElement("a");
      a.className = "game-card live sport-card";
      a.href = "/" + s.key;
      a.style.setProperty("--accent", s.accent);
      a.innerHTML =
        '<span class="badge ' + (live ? "play" : "soon") + '">' + (live ? "Play" : "Soon") + "</span>" +
        '<span class="card-logo">' + EBK.logoTag(s) + "</span>" +
        '<h3 class="game-title">' + s.name + "</h3>" +
        '<p class="game-desc">' + s.blurb + "</p>" +
        '<span class="game-foot">' + (live ? ((EBK.live[s.key] || []).length + " games live") : "Preview games") + "</span>";
      grid.appendChild(a);
    });
    var c = document.getElementById("sport-count");
    if (c) c.textContent = liveCount + " live · " + (EBK.sports.length - liveCount) + " coming soon";
  })();
})();
