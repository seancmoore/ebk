/* EBK Deep Bag · single post reader for Firestore posts. Reached as
   /deep-bag/<slug> (firebase.json rewrites unknown /deep-bag/* paths here;
   static studies are real files and win) or /deep-bag/post/?s=<slug>. */
(function () {
  "use strict";
  var $ = function (s) { return document.querySelector(s); };
  function esc(s) { return String(s).replace(/[<>&"']/g, function (c) { return { "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function fmtDate(ts) {
    try { return ts.toDate().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }); }
    catch (e) { return ""; }
  }

  var pathSlug = (location.pathname.match(/^\/deep-bag\/([a-z0-9-]+)\/?$/) || [])[1];
  var slug = new URLSearchParams(location.search).get("s") || (pathSlug !== "post" && pathSlug) || "";

  // The shell is indexable so real posts can be; a miss must not be.
  function notFound() {
    $("#loading").hidden = true; $("#notfound").hidden = false;
    var m = document.createElement("meta");
    m.name = "robots"; m.content = "noindex";
    document.head.appendChild(m);
  }

  function setMeta(p) {
    var title = p.title + " · EBK Deep Bag";
    document.title = title;
    $("#doc-title").textContent = title;
    $("#og-title").setAttribute("content", title);
    if (p.excerpt) $("#og-desc").setAttribute("content", p.excerpt);
    if (p.coverImage) $("#og-image").setAttribute("content", p.coverImage);
    var canon = document.createElement("link");
    canon.rel = "canonical";
    canon.href = "https://eliteballknowledge.web.app/deep-bag/" + encodeURIComponent(slug);
    document.head.appendChild(canon);
  }

  function render(p) {
    $("#loading").hidden = true;
    setMeta(p);
    $("#p-title").textContent = p.title;
    var tags = (p.tags || []).map(function (t) {
      return '<a class="db-tag" href="/deep-bag?tag=' + encodeURIComponent(t) + '">' + esc(t) + "</a>";
    }).join(" ");
    $("#p-meta").innerHTML = esc(p.authorName || "") + " · " + fmtDate(p.publishedAt) + (tags ? " · " + tags : "");
    if (p.coverImage) {
      var img = $("#p-cover");
      img.src = p.coverImage; img.hidden = false;
      img.onerror = function () { img.hidden = true; };
    }
    EBKRender.toHtml(p.body).then(function (html) {
      $("#p-body").innerHTML = html;
    });
    $("#post").hidden = false;
  }

  function load() {
    if (!slug) return notFound();
    EBKF.getPost(slug).then(function (p) {
      if (!p) return notFound();
      if (p.status !== "published" && !(EBKF.isAuthor && EBKF.isAuthor())) return notFound();
      render(p);
    }).catch(notFound);
  }

  function whenReady(cb) {
    if (window.EBKF && EBKF.ready) EBKF.ready.then(function () { EBKF.onChange(function () { cb(); }); });
    else setTimeout(function () { whenReady(cb); }, 60);
  }
  var loaded = false;
  whenReady(function () { if (!loaded) { loaded = true; load(); } });
})();
