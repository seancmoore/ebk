/* EBK · sliding logo banner. Generic marquee builder + auto-setup for sport
   hubs: a page with <div id="sport-banner"> and <body data-sport> gets a
   themed banner of that league's team logos. */
(function () {
  "use strict";

  var THEME = {
    nfl: "strip-field", cfb: "strip-field cfb",
    nba: "strip-court", mlb: "strip-diamond",
    nhl: "strip-ice", soccer: "strip-pitch",
  };

  function shuffle(a) {
    for (var i = a.length - 1; i > 0; i--) {
      var j = (Math.random() * (i + 1)) | 0, t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  // items: [{href, title, src, big}] — rendered twice for a seamless -50% loop
  function build(strip, items, theme) {
    strip.classList.add("logo-strip");
    if (theme) theme.split(" ").forEach(function (c) { strip.classList.add(c); });
    var track = document.createElement("div");
    track.className = "logo-track";
    // slower scroll for longer tracks so speed feels constant
    track.style.animationDuration = Math.max(30, items.length * 1.6) + "s";
    for (var pass = 0; pass < 2; pass++) {
      items.forEach(function (it) {
        var a = document.createElement("a");
        a.className = "strip-logo" + (it.big ? " big" : "");
        a.href = it.href; a.title = it.title;
        if (pass === 1) a.setAttribute("aria-hidden", "true");
        var img = document.createElement("img");
        img.alt = it.title; img.loading = "lazy";
        img.addEventListener("load", function () { img.classList.add("ld"); });
        img.addEventListener("error", function () { a.remove(); });
        img.src = it.src;
        a.appendChild(img);
        track.appendChild(a);
      });
    }
    strip.appendChild(track);
  }

  function teamItems(sportKey, max) {
    var L = window[sportKey.toUpperCase()];
    if (!L || !L.franchises) return [];
    var fr = L.franchises.slice();
    if (max && fr.length > max) fr = shuffle(fr).slice(0, max);
    return fr.map(function (f) {
      return { href: "/" + sportKey + "/team?t=" + encodeURIComponent(f.key),
               title: f.name, src: f.logo || L.logo(f.key) };
    });
  }

  window.EBKBanner = { build: build, teamItems: teamItems, theme: THEME, shuffle: shuffle };

  // auto-setup on sport hub pages
  var el = document.getElementById("sport-banner");
  var sport = document.body && document.body.dataset.sport;
  if (el && sport && !el.childElementCount) {
    var items = teamItems(sport, 36);
    if (items.length) {
      build(el, items, THEME[sport] || "strip-arena");
      // the hub strip is decorative (aria-hidden; the teams page lists every
      // team), so keep its links out of the tab order too
      if (el.getAttribute("aria-hidden") === "true")
        el.querySelectorAll("a").forEach(function (a) { a.tabIndex = -1; });
      // the marquee only runs while the strip is on screen
      if (window.EBKKit) EBKKit.calm(el);
    } else el.remove();
  }
})();
