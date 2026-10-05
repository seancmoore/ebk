/* EBK Deep Bag · published study pages: reading-progress bar + share buttons.
   The page is fully readable without this file. */
(function () {
  "use strict";
  var bar = document.querySelector(".dbx-progress");
  if (bar) {
    var ticking = false;
    var update = function () {
      ticking = false;
      var h = document.documentElement.scrollHeight - window.innerHeight;
      bar.style.transform = "scaleX(" + (h > 0 ? Math.min(1, window.scrollY / h) : 0) + ")";
    };
    window.addEventListener("scroll", function () {
      if (!ticking) { ticking = true; requestAnimationFrame(update); }
    }, { passive: true });
    update();
  }

  var canon = document.querySelector('link[rel="canonical"]');
  var url = canon ? canon.href : location.href;
  var native = document.querySelector('[data-share="native"]');
  if (native && navigator.share) {
    native.hidden = false;
    native.addEventListener("click", function () {
      navigator.share({ title: document.title, url: url }).catch(function () {});
    });
  }
  var copy = document.querySelector('[data-share="copy"]');
  if (copy) {
    copy.addEventListener("click", function () {
      var done = function () {
        copy.textContent = "Link copied";
        copy.classList.add("done");
        setTimeout(function () { copy.textContent = "Copy link"; copy.classList.remove("done"); }, 2000);
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).then(done, function () { copy.textContent = url; });
      } else {
        copy.textContent = url; // last resort: show it so it can be selected
      }
    });
  }
})();
