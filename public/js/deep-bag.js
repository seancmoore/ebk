/* EBK Deep Bag · index. Merges two sources into one newest-first list:
   1. /data/deep-bag.json — long-form studies baked to static pages by
      tools/build_deep_bag.py (served at /deep-bag/<slug>).
   2. Firestore posts written in the browser at /deep-bag/write (served at
      /deep-bag/<slug> too, via the /deep-bag/** rewrite in firebase.json).
   On localhost it also lists draft studies from /deep-bag/.drafts/, which
   never deploy, so a draft can be previewed in context before publishing. */
(function () {
  "use strict";
  var $ = function (s) { return document.querySelector(s); };
  function esc(s) { return String(s == null ? "" : s).replace(/[<>&"']/g, function (c) { return { "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  var LOCAL = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
  var tag = new URLSearchParams(location.search).get("tag") || "";

  function fmtDate(iso) {
    if (!iso) return "";
    var d = new Date(iso.length === 10 ? iso + "T12:00:00" : iso);
    return isNaN(d) ? "" : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  }
  function getJSON(url) {
    return fetch(url).then(function (r) { return r.ok ? r.json() : { articles: [] }; })
      .catch(function () { return { articles: [] }; });
  }

  function fromStudy(a, draft) {
    return {
      kind: "study", slug: a.slug, title: a.title, dek: a.dek, date: a.date || "",
      tags: a.tags || [], sports: a.sports || [], readMins: a.readMins, accent: a.accent,
      report: a.report, draft: !!draft,
      href: draft ? "/deep-bag/.drafts/" + a.slug + "/" : "/deep-bag/" + a.slug,
    };
  }
  function fromPost(p) {
    var iso = "";
    try { iso = p.publishedAt.toDate().toISOString(); } catch (e) {}
    var words = String(p.body || "").split(/\s+/).filter(Boolean).length;
    return {
      kind: "post", slug: p.slug, title: p.title, dek: p.excerpt || "", date: iso,
      tags: p.tags || [], sports: [], readMins: Math.max(1, Math.ceil(words / 230)),
      // python's http.server has no rewrites, so locally use the query form
      href: LOCAL ? "/deep-bag/post/?s=" + encodeURIComponent(p.slug) : "/deep-bag/" + encodeURIComponent(p.slug),
    };
  }

  function label(it) {
    var what = it.kind === "study" ? "Study" : "Post";
    var sp = (it.sports || []).map(function (s) { return s.toUpperCase(); }).join(" · ");
    return (it.draft ? '<b class="db-draft">Draft</b> ' : "") + what + (sp ? " · " + sp : "") + " · " + it.readMins + " min";
  }
  function card(it, lead) {
    return '<a class="db-card' + (lead ? " db-lead" : "") + '" href="' + esc(it.href) + '"' +
      (it.accent ? ' style="--card-accent:' + esc(it.accent) + '"' : "") + ">" +
      '<span class="db-kicker">' + label(it) + "</span>" +
      "<h3>" + esc(it.title) + "</h3>" +
      '<span class="db-excerpt">' + esc(it.dek) + "</span>" +
      '<span class="db-meta">' + esc(it.draft ? "Not published" : fmtDate(it.date)) +
      (it.report ? " · Technical report included" : "") + "</span>" +
      "</a>";
  }

  function render(items) {
    $("#loading").hidden = true;
    var all = items.slice();
    var tags = {};
    all.forEach(function (it) { it.tags.forEach(function (t) { tags[t] = true; }); });
    var names = Object.keys(tags).sort();
    if (names.length > 1) {
      $("#filters").hidden = false;
      $("#filters").innerHTML = '<a class="db-tag' + (!tag ? " active" : "") + '" href="/deep-bag">All</a>' +
        names.map(function (t) {
          return '<a class="db-tag' + (t === tag ? " active" : "") + '" href="/deep-bag?tag=' + encodeURIComponent(t) + '">' + esc(t) + "</a>";
        }).join("");
    }
    if (tag) items = items.filter(function (it) { return it.tags.indexOf(tag) > -1; });
    if (!items.length) { $("#empty").hidden = false; $("#grid").innerHTML = ""; return; }
    $("#empty").hidden = true;
    $("#grid").innerHTML = items.map(function (it, i) { return card(it, i === 0 && !tag); }).join("");
  }

  function load() {
    var posts = (window.EBKF && EBKF.listPublishedPosts ? EBKF.listPublishedPosts() : Promise.resolve([]))
      .catch(function () { return []; }); // Firestore down shouldn't hide the studies
    Promise.all([
      getJSON("/data/deep-bag.json"),
      LOCAL ? getJSON("/deep-bag/.drafts/index.json") : Promise.resolve({ articles: [] }),
      posts,
    ]).then(function (r) {
      var studies = r[0].articles.map(function (a) { return fromStudy(a, false); });
      var drafts = r[1].articles.map(function (a) { return fromStudy(a, true); });
      var taken = {};
      studies.forEach(function (s) { taken[s.slug] = true; });
      // a static study owns its URL, so a same-slug Firestore post would be unreachable
      var fs = r[2].filter(function (p) { return !taken[p.slug]; }).map(fromPost);
      var items = studies.concat(fs).sort(function (a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : 0; });
      render(drafts.concat(items));
    }).catch(function (e) {
      $("#loading").textContent = "Couldn't load stories. " + (e && e.message || "");
    });
  }

  function whenReady(cb) {
    if (window.EBKF && EBKF.ready) EBKF.ready.then(cb, cb);
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
