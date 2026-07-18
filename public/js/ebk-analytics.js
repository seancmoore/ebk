/* EBK · first-party, cookieless usage counter. No SDK, no cookies, no
   personal data: each event is one anonymous Firestore doc
   { p: path, s: traffic source (utm_source), e: view|start|finish, t: ms }.
   Reads are admin-only (see firestore.rules /hits). Silently no-ops off the
   live Firebase domain (init.json 404s on localhost). Opt out with
   localStorage.ebk_optout = "1". */
(function () {
  "use strict";
  if (window.EBKA) return;
  try { if (localStorage.getItem("ebk_optout")) { window.EBKA = { send: function () {} }; return; } } catch (e) {}

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
            e: { stringValue: event },
            t: { integerValue: String(Date.now()) },
          } }),
        });
      }).catch(function () {});
    } catch (e) {}
  }

  window.EBKA = { send: send };
  send("view");
})();
