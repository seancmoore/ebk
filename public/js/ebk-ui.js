/* EBK · auth widget + sign-in modal. Self-loads firebase + its CSS.
   Add <script src="/js/ebk-ui.js"></script> on any page with a .site-header. */
(function () {
  "use strict";
  if (window.__ebkui) return;
  window.__ebkui = true;

  if (!document.querySelector('link[href="/css/ebk-ui.css"]')) {
    var l = document.createElement("link"); l.rel = "stylesheet"; l.href = "/css/ebk-ui.css";
    document.head.appendChild(l);
  }
  if (!window.EBKF) {
    var s = document.createElement("script"); s.src = "/js/ebk-firebase.js";
    document.head.appendChild(s);
  }

  // ---- modal ----
  var modal = document.createElement("div");
  modal.className = "ebk-modal-back"; modal.hidden = true;
  modal.innerHTML =
    '<div class="ebk-modal">' +
    '<button class="ebk-x" data-act="close" aria-label="Close">&times;</button>' +
    '<h3>Welcome to EBK</h3><p class="sub">Save your scores and climb the leaderboards.</p>' +
    '<div class="ebk-tabs"><button class="ebk-tab active" data-tab="in">Sign in</button>' +
    '<button class="ebk-tab" data-tab="up">Sign up</button></div>' +
    '<div class="ebk-namewrap" hidden>' +
    '<input class="ebk-field" id="ebk-name" placeholder="Display name (public)" autocomplete="nickname" maxlength="20" />' +
    '<span class="ebk-avail" id="ebk-avail"></span></div>' +
    '<input class="ebk-field" id="ebk-email" type="text" placeholder="Email or username" autocomplete="username" />' +
    '<div class="ebk-pwwrap">' +
    '<input class="ebk-field" id="ebk-pw" type="password" placeholder="Password" autocomplete="current-password" />' +
    '<button class="ebk-eye" data-act="eye" type="button" aria-label="Show password">👁</button></div>' +
    '<label class="ebk-consent" hidden><input type="checkbox" id="ebk-agree" /> <span>I\'m 13 or older and I agree to the ' +
    '<a href="/terms" target="_blank">Terms</a> and <a href="/privacy" target="_blank">Privacy Policy</a>.</span></label>' +
    '<div class="ebk-err" id="ebk-err"></div>' +
    '<button class="ebk-btn" data-act="submit">Sign in</button>' +
    '<button class="ebk-forgot" data-act="forgot">Forgot password?</button>' +
    '</div>';
  document.body.appendChild(modal);

  var mode = "in";
  var nameF = modal.querySelector("#ebk-name"), emailF = modal.querySelector("#ebk-email"),
      pwF = modal.querySelector("#ebk-pw"), errEl = modal.querySelector("#ebk-err"),
      submitBtn = modal.querySelector('[data-act="submit"]'),
      forgotBtn = modal.querySelector(".ebk-forgot"),
      nameWrap = modal.querySelector(".ebk-namewrap"),
      availEl = modal.querySelector("#ebk-avail"),
      consentEl = modal.querySelector(".ebk-consent"),
      agreeF = modal.querySelector("#ebk-agree");

  function clearMsg() { errEl.textContent = ""; errEl.classList.remove("ok"); }
  function openModal() { modal.hidden = false; clearMsg(); emailF.focus(); }
  function closeModal() { modal.hidden = true; }
  function setMode(m) {
    mode = m; clearMsg();
    modal.querySelectorAll(".ebk-tab").forEach(function (t) { t.classList.toggle("active", t.dataset.tab === m); });
    nameWrap.hidden = m !== "up";
    consentEl.hidden = m !== "up";
    forgotBtn.hidden = m === "up";
    submitBtn.textContent = m === "up" ? "Create account" : "Sign in";
    pwF.autocomplete = m === "up" ? "new-password" : "current-password";
    emailF.placeholder = m === "up" ? "Email" : "Email or username";
    emailF.type = m === "up" ? "email" : "text";
    emailF.autocomplete = m === "up" ? "email" : "username";
  }

  // live display-name availability (debounced)
  var availTO = null;
  nameF.addEventListener("input", function () {
    clearTimeout(availTO);
    var v = nameF.value.trim();
    availEl.textContent = ""; availEl.className = "ebk-avail";
    if (v.length < 2 || !window.EBKF || !EBKF.nameAvailable) return;
    availTO = setTimeout(function () {
      EBKF.nameAvailable(v).then(function (free) {
        if (nameF.value.trim() !== v) return;       // stale
        availEl.textContent = free ? "✓ available" : "✕ taken";
        availEl.className = "ebk-avail " + (free ? "ok" : "no");
      }).catch(function () {});
    }, 350);
  });

  modal.addEventListener("click", function (e) {
    var act = e.target.dataset.act, tab = e.target.dataset.tab;
    if (e.target === modal || act === "close") return closeModal();
    if (tab) return setMode(tab);
    if (act === "submit") return doSubmit();
    if (act === "forgot") return doForgot();
    if (act === "eye") {
      pwF.type = pwF.type === "password" ? "text" : "password";
      e.target.setAttribute("aria-label", pwF.type === "password" ? "Show password" : "Hide password");
    }
  });

  function doForgot() {
    var email = emailF.value.trim();
    clearMsg();
    if (!email) { errEl.textContent = "Enter your email above first, then tap Forgot password."; return; }
    if (email.indexOf("@") === -1) { errEl.textContent = "Password resets need your email address, not your username."; return; }
    errEl.textContent = "…";
    EBKF.resetPassword(email).then(function () {
      errEl.classList.add("ok");
      errEl.textContent = "Reset link sent to " + email + " — check your inbox.";
    }).catch(function (e) { errEl.classList.remove("ok"); errEl.textContent = pretty(e); });
  }

  function doSubmit() {
    var email = emailF.value.trim(), pw = pwF.value, name = nameF.value.trim();
    if (!email || !pw) { errEl.textContent = "Email and password required."; return; }
    if (mode === "up" && pw.length < 6) { errEl.textContent = "Password must be at least 6 characters."; return; }
    if (mode === "up" && !agreeF.checked) {
      errEl.textContent = "Please confirm you're 13+ and agree to the Terms & Privacy Policy.";
      return;
    }
    submitBtn.disabled = true; errEl.textContent = "…";
    var p = mode === "up" ? EBKF.signUp(email, pw, name || email.split("@")[0]) : EBKF.signIn(email, pw);
    p.then(closeModal).catch(function (e) { errEl.textContent = pretty(e); })
      .finally(function () { submitBtn.disabled = false; if (errEl.textContent === "…") errEl.textContent = ""; });
  }
  function doGoogle() {
    errEl.textContent = "…";
    EBKF.signInGoogle().then(closeModal).catch(function (e) { errEl.textContent = pretty(e); });
  }
  function pretty(e) {
    var c = (e && e.code) || "";
    if (c === "ebk/weak-password") return "Password must be at least 6 characters.";
    if (c === "ebk/name-profane") return "Please choose a cleaner display name.";
    if (c === "ebk/name-taken") return "That display name is taken — try another.";
    if (c === "ebk/name-short") return "Display name must be at least 2 characters.";
    if (c === "ebk/name-long") return "Display name must be 20 characters or fewer.";
    if (c === "ebk/name-invalid") return "Use letters, numbers, spaces and emoji only.";
    if (c === "ebk/no-user") return "No account with that username.";
    if (c === "ebk/bad-credentials") return "Wrong username or password.";
    if (c === "ebk/login-not-setup") return "Username sign-in isn't enabled yet for this account — sign in with your email once to turn it on.";
    if (c.indexOf("wrong-password") > -1 || c.indexOf("invalid-credential") > -1) return "Wrong email or password.";
    if (c.indexOf("email-already") > -1) return "That email already has an account — sign in.";
    if (c.indexOf("weak-password") > -1) return "Password should be at least 6 characters.";
    if (c.indexOf("invalid-email") > -1) return "Enter a valid email.";
    if (c.indexOf("user-not-found") > -1) return "No account with that email.";
    if (c.indexOf("too-many-requests") > -1) return "Too many attempts — try again shortly.";
    if (c.indexOf("operation-not-allowed") > -1) return "Auth isn't enabled yet (admin).";
    if (c.indexOf("popup") > -1) return "Popup blocked — allow popups and retry.";
    return (e && e.message) || "Something went wrong.";
  }
  window.EBKopenAuth = openModal;

  // ---- header nav + account ----
  function injectNav() {
    document.querySelectorAll(".site-header").forEach(function (h) {
      if (h.querySelector(".ebk-nav")) return;
      var nav = document.createElement("div");
      nav.className = "ebk-nav";
      nav.innerHTML =
        '<a class="ebk-admin-link" href="/admin" hidden>Admin</a>' +
        '<a href="/leaderboard">Leaderboard</a>' +
        '<a class="ebk-dash-link" href="/dashboard">Dashboard</a>' +
        '<span class="ebk-acct"></span>';
      h.appendChild(nav);
      // mark the page you're on (purely visual + aria)
      var here = location.pathname.replace(/\/+$/, "") || "/";
      nav.querySelectorAll("a[href]").forEach(function (a) {
        if (a.getAttribute("href") === here) a.setAttribute("aria-current", "page");
      });
    });
    renderAccount(window.EBKF && EBKF.user);
  }
  function esc(s) { return String(s).replace(/[<>&"']/g, function (c) { return { "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function initial(nm) { var c = String(nm).trim().match(/[A-Za-z0-9]/); return c ? c[0].toUpperCase() : "#"; }
  function renderAccount(user) {
    var admin = !!(window.EBKF && EBKF.isAdmin && EBKF.isAdmin());
    document.querySelectorAll(".ebk-admin-link").forEach(function (el) { el.hidden = !admin; });
    // when signed in, the name chip links to the dashboard, so hide the
    // redundant "Dashboard" text link to keep the header uncluttered
    document.querySelectorAll(".ebk-dash-link").forEach(function (el) { el.hidden = !!user; });
    document.querySelectorAll(".ebk-acct").forEach(function (el) {
      if (user) {
        var nm = (window.EBKF && EBKF.profileName) || user.displayName || "Player";
        el.innerHTML = '<a class="ebk-user" href="/dashboard" title="Your dashboard">' +
          '<span class="av0" aria-hidden="true">' + esc(initial(nm)) + '</span><span class="nm">' + esc(nm) + "</span></a>";
      } else {
        el.innerHTML = '<button class="ebk-signin">Sign in</button>';
      }
    });
  }
  document.addEventListener("click", function (e) {
    // only the header's Sign in button (admin tools reuse the .ebk-signin look)
    if (e.target.classList.contains("ebk-signin") && e.target.closest(".ebk-acct")) openModal();
    if (e.target.classList.contains("ebk-out")) EBKF.signOut();
  });

  function whenReady(cb) {
    if (window.EBKF && EBKF.onChange) cb();
    else setTimeout(function () { whenReady(cb); }, 40);
  }
  injectNav();
  whenReady(function () { EBKF.onChange(renderAccount); });
})();
