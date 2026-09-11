/* EBK Deep Bag · shared markdown -> sanitized HTML renderer.
   marked (GFM tables included) + DOMPurify, both from the CDN already
   whitelisted in firebase.json's CSP script-src (cdn.jsdelivr.net). Loaded
   lazily so pages that don't render a post body (e.g. the list page) don't
   pay for it. */
window.EBKRender = (function () {
  "use strict";
  var ready = null;
  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement("script");
      s.src = src; s.onload = resolve; s.onerror = reject;
      document.head.appendChild(s);
    });
  }
  function load() {
    if (ready) return ready;
    ready = Promise.all([
      window.marked ? Promise.resolve() : loadScript("https://cdn.jsdelivr.net/npm/marked@12/marked.min.js"),
      window.DOMPurify ? Promise.resolve() : loadScript("https://cdn.jsdelivr.net/npm/dompurify@3/dist/purify.min.js"),
    ]);
    return ready;
  }
  // markdown string -> sanitized HTML string, safe to assign to innerHTML.
  async function toHtml(md) {
    await load();
    var raw = window.marked.parse(String(md || ""), { gfm: true, breaks: true });
    return window.DOMPurify.sanitize(raw, { ADD_ATTR: ["target"] });
  }
  return { toHtml: toHtml };
})();
