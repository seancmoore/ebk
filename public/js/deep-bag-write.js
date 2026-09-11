/* EBK Deep Bag · author editor — gated the same way public/js/admin.js gates
   on EBKF.isAdmin(): wait for auth state, show #denied or the editor. */
(function () {
  "use strict";
  var $ = function (s) { return document.querySelector(s); };
  function esc(s) { return String(s).replace(/[<>&"']/g, function (c) { return { "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&#39;" }[c]; }); }

  function slugify(s) {
    return String(s || "").toLowerCase().trim()
      .replace(/['"]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 140);
  }

  var slugTouched = false;
  $("#f-title").addEventListener("input", function () {
    if (!slugTouched) $("#f-slug").value = slugify($("#f-title").value);
  });
  $("#f-slug").addEventListener("input", function () { slugTouched = true; });

  var previewTO = null;
  $("#f-body").addEventListener("input", function () {
    clearTimeout(previewTO);
    previewTO = setTimeout(function () {
      EBKRender.toHtml($("#f-body").value).then(function (html) { $("#f-preview").innerHTML = html; });
    }, 250);
  });

  function resetForm() {
    $("#f-slug-orig").value = "";
    $("#f-title").value = ""; $("#f-slug").value = ""; $("#f-cover").value = "";
    $("#f-tags").value = ""; $("#f-excerpt").value = ""; $("#f-body").value = "";
    $("#f-preview").innerHTML = "";
    slugTouched = false;
    $("#btn-new").hidden = true;
    $("#save-msg").textContent = "";
  }
  $("#btn-new").addEventListener("click", resetForm);

  function fillForm(p) {
    $("#f-slug-orig").value = p.slug;
    $("#f-title").value = p.title || "";
    $("#f-slug").value = p.slug || "";
    $("#f-cover").value = p.coverImage || "";
    $("#f-tags").value = (p.tags || []).join(", ");
    $("#f-excerpt").value = p.excerpt || "";
    $("#f-body").value = p.body || "";
    slugTouched = true; // don't let further title edits clobber a deliberate slug
    $("#btn-new").hidden = false;
    $("#save-msg").textContent = "";
    EBKRender.toHtml(p.body).then(function (html) { $("#f-preview").innerHTML = html; });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function readForm(status) {
    var title = $("#f-title").value.trim();
    var slug = slugify($("#f-slug").value);
    var body = $("#f-body").value;
    var tags = $("#f-tags").value.split(",").map(function (t) { return t.trim(); }).filter(Boolean).slice(0, 8);
    return {
      title: title, slug: slug, body: body,
      excerpt: $("#f-excerpt").value.trim().slice(0, 300),
      coverImage: $("#f-cover").value.trim().slice(0, 500),
      tags: tags, status: status,
    };
  }

  async function save(status) {
    var data = readForm(status);
    if (!data.title) { $("#save-msg").textContent = "Needs a title."; return; }
    if (!data.slug) { $("#save-msg").textContent = "Needs a URL slug."; return; }
    if (!data.body.trim()) { $("#save-msg").textContent = "Needs some body text."; return; }
    var origSlug = $("#f-slug-orig").value;

    if (data.slug !== origSlug) {
      var existing = await EBKF.getPost(data.slug).catch(function () { return null; });
      if (existing) {
        if (!confirm('The slug "' + data.slug + '" is already used by "' + existing.title + '". Overwrite it?')) return;
      }
    }

    $("#save-msg").textContent = "Saving…";
    try {
      await EBKF.savePost(data.slug, data);
      if (origSlug && origSlug !== data.slug) await EBKF.deletePost(origSlug).catch(function () {});
      $("#f-slug-orig").value = data.slug;
      $("#btn-new").hidden = false;
      $("#save-msg").textContent = status === "published" ? "Published!" : "Draft saved.";
      loadMyPosts();
    } catch (e) {
      $("#save-msg").textContent = "Couldn't save: " + (e && e.message || e);
    }
  }
  $("#btn-draft").addEventListener("click", function () { save("draft"); });
  $("#btn-publish").addEventListener("click", function () { save("published"); });

  function postRow(p) {
    return '<div class="db-post-row" data-slug="' + esc(p.slug) + '">' +
      '<span><span class="nm">' + esc(p.title) + '</span>' +
      '<span class="status ' + p.status + '">' + p.status + "</span></span>" +
      '<span class="acts">' +
      '<button class="ebk-signin edit">Edit</button>' +
      (p.status === "published" ? '<a class="ebk-signin" href="/deep-bag/post/?s=' + encodeURIComponent(p.slug) + '">View</a>' : "") +
      '<button class="ebk-signin del">Delete</button>' +
      "</span></div>";
  }

  var myPostsCache = {};
  function loadMyPosts() {
    EBKF.myPosts().then(function (posts) {
      myPostsCache = {};
      posts.forEach(function (p) { myPostsCache[p.slug] = p; });
      $("#my-posts").hidden = !posts.length;
      $("#my-posts-list").innerHTML = posts.map(postRow).join("");
    });
  }
  $("#my-posts-list").addEventListener("click", function (e) {
    var row = e.target.closest(".db-post-row");
    if (!row) return;
    var slug = row.dataset.slug;
    if (e.target.classList.contains("edit")) fillForm(myPostsCache[slug]);
    if (e.target.classList.contains("del")) {
      if (!confirm('Delete "' + (myPostsCache[slug] || {}).title + '"? This can\'t be undone.')) return;
      EBKF.deletePost(slug).then(loadMyPosts);
    }
  });

  function show(id) {
    ["denied", "loading", "editor"].forEach(function (x) { $("#" + x).hidden = x !== id; });
  }
  function start() {
    if (!(window.EBKF && EBKF.onChange)) return setTimeout(start, 60);
    EBKF.onChange(function () {
      if (!(EBKF.isAuthor && EBKF.isAuthor())) { show("denied"); $("#my-posts").hidden = true; return; }
      show("editor");
      loadMyPosts();
    });
  }
  start();
})();
