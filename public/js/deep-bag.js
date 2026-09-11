/* EBK Deep Bag · public post list. */
(function () {
  "use strict";
  var $ = function (s) { return document.querySelector(s); };
  function esc(s) { return String(s).replace(/[<>&"']/g, function (c) { return { "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function fmtDate(ts) {
    try { return ts.toDate().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }); }
    catch (e) { return ""; }
  }

  var tag = new URLSearchParams(location.search).get("tag") || "";

  function card(p) {
    var href = "/deep-bag/post/?s=" + encodeURIComponent(p.slug);
    var cover = p.coverImage ? '<img class="db-cover" src="' + esc(p.coverImage) + '" alt="" loading="lazy" onerror="this.remove()" />' : "";
    var tags = (p.tags || []).map(function (t) { return "<span>" + esc(t) + "</span>"; }).join("");
    return '<a class="db-card" href="' + href + '">' + cover +
      "<h3>" + esc(p.title) + "</h3>" +
      '<div class="db-excerpt">' + esc(p.excerpt || "") + "</div>" +
      '<div class="db-meta"><span>' + esc(p.authorName || "") + "</span> · <span>" + fmtDate(p.publishedAt) + "</span></div>" +
      (tags ? '<div class="db-tags">' + tags + "</div>" : "") +
      "</a>";
  }

  function render(posts) {
    $("#loading").hidden = true;
    if (!posts.length) { $("#empty").hidden = false; $("#grid").innerHTML = ""; return; }
    $("#empty").hidden = true;
    $("#grid").innerHTML = posts.map(card).join("");

    var tags = {};
    posts.forEach(function (p) { (p.tags || []).forEach(function (t) { tags[t] = true; }); });
    var names = Object.keys(tags).sort();
    if (names.length) {
      $("#filters").hidden = false;
      $("#filters").innerHTML = '<a class="db-tag' + (!tag ? " active" : "") + '" href="/deep-bag">All</a>' +
        names.map(function (t) {
          return '<a class="db-tag' + (t === tag ? " active" : "") + '" href="/deep-bag?tag=' + encodeURIComponent(t) + '">' + esc(t) + "</a>";
        }).join("");
    }
  }

  function load() {
    (window.EBKF && EBKF.listPublishedPosts ? EBKF.listPublishedPosts(tag) : Promise.resolve([]))
      .then(render)
      .catch(function (e) {
        $("#loading").textContent = "Couldn't load posts. " + (e && e.message || "");
      });
  }

  function whenReady(cb) {
    if (window.EBKF && EBKF.ready) EBKF.ready.then(cb);
    else setTimeout(function () { whenReady(cb); }, 60);
  }
  whenReady(load);

  // "Write" link only shows for authors, once we know who's signed in.
  function checkAuthor() {
    if (window.EBKF && EBKF.onChange) {
      EBKF.onChange(function () {
        $("#write-link").hidden = !(EBKF.isAuthor && EBKF.isAuthor());
      });
    } else setTimeout(checkAuthor, 60);
  }
  checkAuthor();
})();
