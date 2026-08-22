/* EBK · first-party, cookieless usage counter. No SDK, no cookies, no
   personal data: each event is one anonymous Firestore doc
   { p: path, s: traffic source (utm_source), v: rotating random visitor id,
     r: referring host, e: view|start|finish, t: ms }.
   Reads are admin-only (see firestore.rules /hits). Silently no-ops off the
   live Firebase domain (init.json 404s on localhost). Opt out with
   localStorage.ebk_optout = "1". */
(function () {
  "use strict";
  if (window.EBKA) return;
  try { if (localStorage.getItem("ebk_optout")) { window.EBKA = { send: function () {} }; return; } } catch (e) {}

  // Anonymous visitor id. Without it every event is a disconnected hit and
  // "unique visitors" is not a number anyone can compute — which matters,
  // because that is the metric the site is actually being judged on. It is a
  // random value minted in this browser, rotated every 30 days, joined to
  // nothing and never leaving first-party storage: it says "the same browser
  // came back" and nothing more. Storage blocked (private mode, locked-down
  // browser) just means an empty id and the event still counts as a view.
  var vid = "";
  try {
    var now = Date.now();
    var born = parseInt(localStorage.getItem("ebk_vid_t") || "0", 10);
    vid = localStorage.getItem("ebk_vid") || "";
    if (!vid || !born || now - born > 2592000000) {
      vid = (window.crypto && crypto.randomUUID
        ? crypto.randomUUID().replace(/-/g, "")
        : String(now) + Math.random().toString(16).slice(2)).slice(0, 16);
      localStorage.setItem("ebk_vid", vid);
      localStorage.setItem("ebk_vid_t", String(now));
    }
  } catch (e) { vid = ""; }

  // Referring host, so Instagram traffic is visible even when someone reaches
  // the site without the campaign parameter on the link. Same-host referrers
  // are internal navigation, not a referral, so they are dropped.
  var ref = "";
  try {
    ref = document.referrer ? new URL(document.referrer).hostname.slice(0, 40) : "";
    if (ref === location.hostname) ref = "";
  } catch (e) {}

  // remember the entry utm_source for the session so game starts deeper in
  // the visit still attribute to the campaign that brought the visitor
  var src = "";
  try {
    src = new URLSearchParams(location.search).get("utm_source") || "";
    if (src) sessionStorage.setItem("ebk_src", src);
    else src = sessionStorage.getItem("ebk_src") || "";
  } catch (e) {}

  var cfgP = null;
  function cfg() {
    if (!cfgP) cfgP = fetch("/__/firebase/init.json").then(function (r) {
      if (!r.ok) throw new Error("no config");
      return r.json();
    });
    return cfgP;
  }

  function send(event) {
    try {
      cfg().then(function (c) {
        var url = "https://firestore.googleapis.com/v1/projects/" + c.projectId +
          "/databases/(default)/documents/hits?key=" + c.apiKey;
        return fetch(url, {
          method: "POST",
          keepalive: true,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fields: {
            p: { stringValue: location.pathname.slice(0, 100) },
            s: { stringValue: src.slice(0, 30) },
            v: { stringValue: vid },
            r: { stringValue: ref },
            e: { stringValue: event },
            t: { integerValue: String(Date.now()) },
            // TTL field: with a Firestore TTL policy on `x`, raw events
            // self-delete after ~6 months
            x: { timestampValue: new Date(Date.now() + 15552000000).toISOString() },
          } }),
        });
      }).catch(function () {});
    } catch (e) {}
  }

  window.EBKA = { send: send };
  send("view");
})();
