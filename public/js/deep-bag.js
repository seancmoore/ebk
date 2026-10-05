/* EBK Deep Bag · index. Merges two sources into one newest-first list:
   1. /data/deep-bag.json: long-form studies baked to static pages by
      tools/build_deep_bag.py (served at /deep-bag/<slug>).
   2. Firestore posts written in the browser at /deep-bag/write (served at
      /deep-bag/<slug> too, via the /deep-bag/** rewrite in firebase.json).
   On localhost it also lists draft studies from /deep-bag/.drafts/, which
   never deploy, so a draft can be previewed in context before publishing.
   The newest item is the lead card; the rest (or a tag's matches) fill the
   grid. Studies with a share image show it; everything else gets a teal
   placeholder in the study's own accent. */
(function () {
  "use strict";
  var $ = function (s) { return document.querySelector(s); };
  function esc(s) { return String(s == null ? "" : s).replace(/[<>&"']/g, function (c) { return { "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  var LOCAL = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
  var tag = (new URLSearchParams(location.search).get("tag") || "").toLowerCase();
  var ARROW = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  var HEX = /^#[0-9a-f]{3,8}$/i;

  function fmtDate(iso) {
    if (!iso) return "";
    var d = new Date(iso.length === 10 ? iso + "T12:00:00" : iso);
    return isNaN(d) ? "" : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  }
  function getJSON(url) {
    return fetch(url).then(function (r) { return r.ok ? r.json() : { articles: [] }; })
      .catch(function () { return { articles: [] }; });
  }
  function seg(el, v, label) {
    if (!el) return;
    if (window.EBKKit) EBKKit.seg(el, v, label); else el.textContent = v;
  }

  function fromStudy(a, draft) {
    var img = a.image || "";
    if (draft && img) img = img.replace(/^\/deep-bag\//, "/deep-bag/.drafts/");
    return {
      kind: "study", slug: a.slug, title: a.title, dek: a.dek, date: a.date || "",
      tags: a.tags || [], sports: a.sports || [], readMins: a.readMins,
      accent: HEX.test(a.accent || "") ? a.accent : "", image: img,
      report: !!a.report, draft: !!draft,
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
      image: /^https:\/\//.test(p.coverImage || "") ? p.coverImage : "",
      // python's http.server has no rewrites, so locally use the query form
      href: LOCAL ? "/deep-bag/post/?s=" + encodeURIComponent(p.slug) : "/deep-bag/" + encodeURIComponent(p.slug),
    };
  }

  function sportsOf(it) { return (it.sports || []).map(function (s) { return s.toUpperCase(); }).join(" · "); }
  function art(it, lead) {
    if (it.image) {
      var img = '<img src="' + esc(it.image) + '" width="1200" height="630" alt="" ' + (lead ? "" : 'loading="lazy" ') + 'decoding="async"';
      // the lead's column is taller than 1200x630: show the whole card over a blurred copy of itself
      return '<span class="dbl-art">' + (lead ? img + ' class="dbl-art-bd" aria-hidden="true" />' : "") + img + " /></span>";
    }
    return '<span class="dbl-art dbl-ph" aria-hidden="true"><span class="dbl-ph-k">' + esc(sportsOf(it) || "Deep Bag") + "</span></span>";
  }
  function metaLine(it) {
    var bits = [];
    if (it.draft) bits.push('<span class="k-tag gold">Draft</span>');
    else if (it.date) bits.push("<span>" + esc(fmtDate(it.date)) + "</span>");
    if (it.readMins) bits.push('<span><span class="k-mled dim">' + esc(it.readMins) + "</span> min read</span>");
    return '<span class="dbl-meta">' + bits.join('<i aria-hidden="true">·</i>') + "</span>";
  }
  function tagsLine(it) {
    if (!it.tags.length && !it.report) return "";
    return '<span class="dbl-tags">' + it.tags.slice(0, 4).map(function (t) { return '<span class="k-tag soft">' + esc(t) + "</span>"; }).join("") +
      (it.report ? '<span class="dbl-nerd" title="Ships with the full technical report">+ nerd version</span>' : "") + "</span>";
  }
  function card(it, lead) {
    var kick = it.kind === "study" ? "Study" : "Post";
    var sp = sportsOf(it);
    return '<a class="k-card dbl-card' + (lead ? " dbl-lead" : "") + '" href="' + esc(it.href) + '"' +
      (it.accent ? ' style="--sa:' + esc(it.accent) + '"' : "") + ">" +
      art(it, lead) +
      '<span class="dbl-body">' +
      '<span class="k-kick">' + kick + (sp ? " <i>" + esc(sp) + "</i>" : "") + "</span>" +
      "<h3>" + esc(it.title) + "</h3>" +
      "<p>" + esc(it.dek) + "</p>" +
      tagsLine(it) +
      '<span class="k-foot">' + metaLine(it) + '<span class="k-cta">' + (lead ? "Read the study " : "Read ") + ARROW + "</span></span>" +
      "</span></a>";
  }

  function filters(all) {
    var counts = {};
    all.forEach(function (it) { it.tags.forEach(function (t) { counts[t] = (counts[t] || 0) + 1; }); });
    var names = Object.keys(counts).sort();
    if (names.length < 2) return;
    var f = $("#filters");
    f.hidden = false;
    f.innerHTML = '<a class="k-chip' + (!tag ? " on" : "") + '" href="/deep-bag"' + (!tag ? ' aria-current="true"' : "") + ">All</a>" +
      names.map(function (t) {
        var on = t === tag;
        return '<a class="k-chip' + (on ? " on" : "") + '" href="/deep-bag?tag=' + encodeURIComponent(t) + '"' + (on ? ' aria-current="true"' : "") + ">" + esc(t) + "</a>";
      }).join("");
  }

  function render(items, drafts) {
    $("#loading").hidden = true;
    var all = drafts.concat(items);
    var leagues = {};
    items.forEach(function (it) { (it.sports || []).forEach(function (s) { leagues[s] = 1; }); });
    var nStudies = items.filter(function (it) { return it.kind === "study"; }).length;
    seg($("#n-studies"), (nStudies < 10 ? "0" : "") + nStudies, nStudies + " published studies");
    var nl = Object.keys(leagues).length;
    seg($("#n-leagues"), (nl < 10 ? "0" : "") + nl, nl + " leagues covered");

    if (!all.length) {
      $("#empty").hidden = false;
      return;
    }
    $("#content").hidden = false;
    filters(all);

    var shown = tag ? all.filter(function (it) { return it.tags.indexOf(tag) > -1; }) : all;
    if (!shown.length) {
      $("#all-sec").hidden = false;
      $("#grid").innerHTML = "";
      $("#empty").hidden = false;
      $("#empty-t").textContent = "Nothing tagged “" + tag + "” yet.";
      $("#empty-p").textContent = "Try another tag, or see everything in the Bag.";
      $("#empty-btn").textContent = "Show all studies";
      $("#empty-btn").setAttribute("href", "/deep-bag");
      return;
    }
    var lead = tag ? null : shown[0];
    var rest = tag ? shown : shown.slice(1);
    if (lead) {
      $("#lead-sec").hidden = false;
      $("#lead").innerHTML = card(lead, true);
      $("#lead-note").textContent = lead.draft ? "Draft preview, localhost only" : fmtDate(lead.date);
    }
    if (rest.length || tag) {
      $("#all-sec").hidden = false;
      if (!lead) seg($("#all-n"), "01");
      $("#all-note").textContent = rest.length + (rest.length === 1 ? " story" : " stories") + (tag ? " tagged " + tag : "");
      $("#grid").innerHTML = rest.map(function (it) { return card(it, false); }).join("");
    }
  }

  function load() {
    var posts = (window.EBKF && EBKF.listPublishedPosts ? EBKF.listPublishedPosts() : Promise.resolve([]))
      .catch(function () { return []; }); // Firestore down shouldn't hide the studies
    // never let a slow Firestore hold the static studies hostage
    var postsOrTimeout = Promise.race([posts, new Promise(function (r) { setTimeout(function () { r(null); }, 6000); })]);
    Promise.all([
      getJSON("/data/deep-bag.json"),
      LOCAL ? getJSON("/deep-bag/.drafts/index.json") : Promise.resolve({ articles: [] }),
      postsOrTimeout,
    ]).then(function (r) {
      var studies = (r[0].articles || []).map(function (a) { return fromStudy(a, false); });
      var drafts = (r[1].articles || []).map(function (a) { return fromStudy(a, true); });
      var taken = {};
      studies.forEach(function (s) { taken[s.slug] = true; });
      // a static study owns its URL, so a same-slug Firestore post would be unreachable
      var fs = (r[2] || []).filter(function (p) { return p && p.slug && !taken[p.slug]; }).map(fromPost);
      var items = studies.concat(fs).sort(function (a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : 0; });
      render(items, drafts);
    }).catch(function () {
      $("#loading").hidden = true;
      $("#empty").hidden = false;
      $("#empty-t").textContent = "Couldn't open the Bag.";
      $("#empty-p").textContent = "Check your connection and refresh to try again.";
    });
  }

  function whenReady(cb, n) {
    if (window.EBKF && EBKF.ready) EBKF.ready.then(cb, cb);
    else if ((n || 0) > 80) cb();               // Firebase never loaded: show the studies anyway
    else setTimeout(function () { whenReady(cb, (n || 0) + 1); }, 60);
  }
  whenReady(load);

  // "Write" link only shows for authors, once we know who's signed in.
  function checkAuthor(n) {
    if (window.EBKF && EBKF.onChange) {
      EBKF.onChange(function () {
        $("#write-link").hidden = !(EBKF.isAuthor && EBKF.isAuthor());
      });
    } else if ((n || 0) < 150) setTimeout(function () { checkAuthor((n || 0) + 1); }, 60);
  }
  checkAuthor();
})();
