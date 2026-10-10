/* StreakSkin — static front-end. Reads data/players.json.
   Enhanced motion via anime.js when present; degrades to CSS/instant otherwise. */
(() => {
  "use strict";

  const SPORT = document.body.dataset.sport || "nfl";
  const LEAGUE = window[SPORT.toUpperCase()] || window.NFL; // team logo/name helper
  const DATA_URL = (SPORT === "nfl" ? "/data/players.json" : "/data/" + SPORT + "/players.json") + "?v=10";
  const BEST_KEY = SPORT === "nfl" ? "ebk_best" : "ebk_" + SPORT + "_best";
  (function () { if (!window.EBKF) { var s = document.createElement("script"); s.src = "/js/ebk-firebase.js"; document.head.appendChild(s); } })();
  const ebkRecord = (score) => { try { window.EBKF && EBKF.recordScore(SPORT, "higher-lower", score); } catch (e) {} };
  const sfx = (n) => { try { window.EBKS && EBKS.play(n); } catch (e) {} };
  const REVEAL_PAUSE = 1100;            // ms to admire the reveal before advancing
  const TIME_LIMIT = 7000;              // ms to make each higher/lower guess
  const $ = (sel, root = document) => root.querySelector(sel);
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const A = () => (reduceMotion ? null : window.anime); // anime.js if loaded & motion allowed

  const state = {
    data: null,
    category: null,   // {key,label,min,decimals,icon}
    pool: [],
    anchor: null,
    challenger: null,
    streak: 0,
    best: 0,
    locked: false,
    run: 0,           // bumped on every start / quit; stale timers check it
  };

  // ---- utilities ------------------------------------------------------------

  const randItem = (arr) => arr[(Math.random() * arr.length) | 0];

  // setTimeout that is dropped if the run it belongs to has ended (quitting
  // mid-reveal must not fire that run's advance / gameOver afterwards)
  function later(fn, ms) {
    const run = state.run;
    setTimeout(() => { if (run === state.run) fn(); }, ms);
  }

  // one cached Intl formatter per decimal count: toLocaleString(opts) builds a
  // new formatter per call, and the count-up runs this every animation frame
  const NF = {};
  function fmt(value, decimals) {
    const nf = NF[decimals] || (NF[decimals] = new Intl.NumberFormat("en-US", {
      minimumFractionDigits: decimals,   // .300 / 14.0, like a box score
      maximumFractionDigits: decimals,
    }));
    return nf.format(Number(value));
  }
  // ---- presentation: LED scoreboard digits (EBKKit, /js/ebk-kit.js) ----
  const pad2 = (v) => (+v < 10 ? "0" : "") + v;
  function led(el, v) {
    if (!el) return;
    if (window.EBKKit) EBKKit.seg(el, pad2(v), String(v)); else el.textContent = v;
  }
  // a formatted stat ("1,532", "14.0", ".300") as seven-segment digits; commas
  // stay as plain glyphs so big numbers keep their thousands separators
  function setStat(el, str) {
    if (!window.EBKKit) { el.textContent = str; return; }
    if (el.__v === str) return;
    el.__v = str;
    el.innerHTML = '<span class="k-seg" aria-hidden="true">' +
      str.split(",").map(EBKKit.seg7).join('<i class="cm">,</i>') + '</span><span class="k-sr">' + str + "</span>";
  }
  // stat glyphs: the hub cards' stroke-icon set on an LED bezel (no emoji)
  const G = {
    rate: '<path d="M3 17l5.5-5.5 4 3.5L20 7"/><path d="M15 7h5v5"/>',
    pct: '<circle cx="7" cy="7" r="2.4"/><circle cx="17" cy="17" r="2.4"/><path d="M18.5 5.5l-13 13"/>',
    shield: '<path d="M12 3l7 3v5.5c0 4.6-3.2 8-7 9.5-3.8-1.5-7-4.9-7-9.5V6z"/>',
    post: '<path d="M12 21v-8M5 13h14M5 13V3M19 13V3"/>',
    yards: '<path d="M3 19h18M7 19v-2.5M12 19v-2.5M17 19v-2.5"/><path d="M4 10h14M14 6l4 4-4 4"/>',
    arc: '<path d="M3 20c2.5-8.5 8.5-14 17-15"/><circle cx="20" cy="5" r="1.6" class="f"/>',
    bolt: '<path d="M13 3L5 13.5h6L10 21l8-10.5h-6z"/>',
    net: '<path d="M3 19V7h18v12"/><path d="M3 11h18M3 15h18M9 7v12M15 7v12"/>',
    pass: '<circle cx="5.5" cy="17.5" r="2.3"/><circle cx="18.5" cy="6.5" r="2.3"/><path d="M7.5 16l8.5-7.5" stroke-dasharray="2.4 2.4"/>',
    cycle: '<path d="M19.5 9A8 8 0 0 0 5.2 7.5"/><path d="M4.5 3.5v4.4h4.4"/><path d="M4.5 15a8 8 0 0 0 14.3 1.5"/><path d="M19.5 20.5v-4.4h-4.4"/>',
    swap: '<path d="M4 8h12.5a3.5 3.5 0 0 1 0 7H8"/><path d="M11 12l-3 3 3 3"/>',
    block: '<circle cx="12" cy="12" r="8.5"/><path d="M6 6l12 12"/>',
    burst: '<path d="M12 3v4.5M12 16.5V21M3 12h4.5M16.5 12H21M5.6 5.6l3.2 3.2M15.2 15.2l3.2 3.2M5.6 18.4l3.2-3.2M15.2 8.8l3.2-3.2"/>',
    catch: '<path d="M12 3v10M8 9.5l4 4 4-4"/><path d="M4 14.5V18a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3.5"/>',
    k: '<path d="M7 4v16M17.5 4L9 12l8.5 8"/>',
    plate: '<path d="M5 4h14v8l-7 8-7-8z"/>',
    target: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3.2"/><path d="M12 1.5v3.5M12 19v3.5M1.5 12H5M19 12h3.5"/>',
    run: '<path d="M4 6l6 6-6 6M12.5 6l6 6-6 6"/>',
    trophy: '<path d="M8 4h8v5a4 4 0 0 1-8 0z"/><path d="M8 6H5a3 3 0 0 0 3 4.5M16 6h3a3 3 0 0 1-3 4.5M12 13v4M8 20.5h8"/>',
    lock: '<rect x="5" y="11" width="14" height="9.5" rx="2.2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
    clock: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4.2l2.8 1.8M9.5 2.5h5"/>',
    pm: '<path d="M3.5 8h7M7 4.5v7M13.5 16h7"/><path d="M17 4L7 20" opacity=".55"/>',
    star: '<path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"/>',
    bars: '<path d="M5 20v-8M12 20V4M19 20v-11"/>',
  };
  const GLYPH_RULES = [
    [/\/ ?game/i, "rate"], [/avg|%/i, "pct"], [/^era$|gaa|conceded|defended/i, "shield"],
    [/\btds?\b/i, "post"], [/yards/i, "yards"], [/home run/i, "arc"], [/power-play|stolen/i, "bolt"],
    [/goal/i, "net"], [/assist/i, "pass"], [/rebound/i, "cycle"], [/steal|intercept|forced/i, "swap"],
    [/block/i, "block"], [/sack|tackle/i, "burst"], [/reception/i, "catch"], [/strikeout/i, "k"],
    [/rbi/i, "plate"], [/hits|shots|pointers/i, "target"], [/runs|rushing|carries/i, "run"],
    [/wins/i, "trophy"], [/save|shutout|clean/i, "lock"], [/minute/i, "clock"], [/plus/i, "pm"],
    [/fantasy|bonus|fpl/i, "star"],
  ];
  const glyph = (cat) => {
    const hit = GLYPH_RULES.find(([re]) => re.test(cat.label));
    return '<svg viewBox="0 0 24 24">' + G[hit ? hit[1] : "bars"] + "</svg>";
  };
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const LEAGUE_NAME = { nfl: "NFL", nba: "NBA", mlb: "MLB", nhl: "NHL", cfb: "College FB", soccer: "Premier League" }[SPORT] || SPORT.toUpperCase();

  // panel-sized photo (raw headshots are up to 600px / several MB)
  const photo = (url) => (EBKD.img ? EBKD.img(url, 256) : url);

  function bestStore() {
    try { return JSON.parse(localStorage.getItem(BEST_KEY)) || {}; }
    catch { return {}; }
  }
  function getBest(catKey) { return bestStore()[catKey] || 0; }
  function setBest(catKey, value) {
    const store = bestStore();
    store[catKey] = value;
    try { localStorage.setItem(BEST_KEY, JSON.stringify(store)); } catch { /* ignore */ }
  }

  function showScreen(id) {
    document.querySelectorAll(".screen").forEach((s) => s.classList.remove("is-active"));
    $("#" + id).classList.add("is-active");
    $("#app").dataset.screen = id;               // the top bar adapts per screen (CSS)
  }

  // Resolve once an image is cached (or after a short timeout / on error) so
  // panels never render with a half-loaded photo popping in.
  function preloadImg(src, ms = 1800) {
    return new Promise((resolve) => {
      if (!src) return resolve();
      const img = new Image();
      const done = () => { clearTimeout(to); resolve(); };
      const to = setTimeout(done, ms);
      img.onload = done; img.onerror = done;
      img.src = src;
    });
  }
  const preloadPlayer = (p) =>
    Promise.all([preloadImg(p && photo(p.headshot)),
                 preloadImg(p && p.team && LEAGUE ? LEAGUE.logo(p.team) : null, 1200)]);

  // Entrance animations are enhancement only: content is visible by default,
  // and every animated element is force-settled to its natural state after the
  // animation window — so a stalled rAF (background tab, GPU jank) can never
  // leave the game invisible.
  function fxTargets(targets) {
    const out = [];
    (Array.isArray(targets) ? targets : [targets]).forEach((t) => {
      if (typeof t === "string") out.push(...document.querySelectorAll(t));
      else if (t && t.length != null && !t.nodeType) out.push(...t);
      else if (t) out.push(t);
    });
    return out;
  }
  function fxSettle(targets, ms) {
    setTimeout(() => fxTargets(targets).forEach((el) => {
      el.style.opacity = ""; el.style.transform = "";
    }), ms);
  }
  function entrance(params, settleMs) {
    const anime = A();
    if (!anime || document.hidden) return;
    anime(params);
    fxSettle(params.targets, settleMs);
  }

  // Count a number element from 0 -> value with anime.js, or set instantly.
  function countTo(el, value, decimals) {
    const anime = A();
    if (!anime) { setStat(el, fmt(value, decimals)); return; }
    const obj = { n: 0 };
    anime({
      targets: obj,
      n: value,
      round: decimals === 0 ? 1 : Math.pow(10, decimals),
      duration: 900,
      easing: "easeOutExpo",
      update: () => { setStat(el, fmt(obj.n, decimals)); },
    });
  }

  // ---- data load ------------------------------------------------------------

  async function load() {
    try {
      const res = await fetch(DATA_URL);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      state.data = EBKD.inflate(await res.json());
      buildCategoryGrid();
    } catch (err) {
      $("#loading").textContent =
        "Couldn't load player data. Serve /public over HTTP (see README): " + err.message;
    }
  }

  // pool sizes never change for a loaded dataset; the grid is rebuilt every
  // time the player returns to the menu, so count each category once
  const counts = new Map();
  const eligibleCount = (cat) => {
    if (!counts.has(cat.key))
      counts.set(cat.key, state.data.players.reduce((n, p) => (EBKD.hlEligible(p, cat.key, cat.label) ? n + 1 : n), 0));
    return counts.get(cat.key);
  };

  function buildCategoryGrid() {
    const grid = $("#category-grid");
    grid.innerHTML = "";
    state.data.categories.forEach((cat) => {
      const el = document.createElement("button");
      el.className = "cat-card";
      const b = getBest(cat.key);
      el.innerHTML =
        `<span class="cat-top"><span class="cat-icon" aria-hidden="true">${glyph(cat)}</span>` +
        (b ? `<span class="k-mled y"><span aria-hidden="true">Best </span>${b}<span class="k-sr"> best streak</span></span>` : "") + `</span>` +
        `<span class="cat-label">${cat.label}</span>` +
        `<span class="cat-count"><b>${eligibleCount(cat).toLocaleString()}</b> seasons</span>` +
        `<span class="cat-go" aria-hidden="true">Play <svg viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg></span>`;
      el.addEventListener("click", () => startRun(cat));
      grid.appendChild(el);
    });
    $("#loading").hidden = true;
    grid.hidden = false;
    const top = Math.max(0, ...state.data.categories.map((c) => getBest(c.key)));
    led($("#start-best"), top);
    $("#start-best").classList.toggle("off", !top);   // no best yet: an unlit board
    const cc = $("#cat-count");
    if (cc) cc.textContent = state.data.categories.length + " stats";

    // staggered entrance
    const anime = A();
    if (anime && !document.hidden) {
      entrance({
        targets: grid.children,
        opacity: [0, 1],
        translateY: [16, 0],
        delay: anime.stagger(45),
        duration: 420,
        easing: "easeOutCubic",
      }, 420 + 45 * grid.children.length + 300);
    }
  }

  // ---- game flow ------------------------------------------------------------

  function startRun(cat) {
    try { window.EBKA && EBKA.send("start"); } catch (e) {}
    state.category = cat;
    const run = ++state.run;
    state.pool = state.data.players.filter((p) => EBKD.hlEligible(p, cat.key, cat.label));
    state.streak = 0;
    state.best = getBest(cat.key);
    state.anchor = randItem(state.pool);
    state.challenger = pickChallenger(state.anchor);

    $("#hud-cat").innerHTML = `<span class="k-kick">${LEAGUE_NAME} <i>Higher / Lower</i></span><p class="gtitle">${esc(cat.label)}</p>`;
    led($("#streak"), 0);
    led($("#best"), state.best);
    // wait for both photos before the panels appear (timer starts after)
    Promise.all([preloadPlayer(state.anchor), preloadPlayer(state.challenger)]).then(() => {
      if (run !== state.run) return;              // quit while photos loaded
      showScreen("screen-game");
      renderRound(true);
    });
  }

  // Different player-season whose value isn't an exact tie with the anchor —
  // guaranteed: ties are unanswerable (only higher/lower can be picked), so
  // pick from the tie-free candidates directly instead of retry-and-hope.
  function pickChallenger(anchor) {
    const key = state.category.key;
    const cands = state.pool.filter((p) => p !== anchor && p.stats[key] !== anchor.stats[key]);
    if (cands.length) return randItem(cands);
    return state.pool.find((p) => p !== anchor) || anchor; // degenerate pool; unreachable in practice
  }

  const statValue = (p) => p.stats[state.category.key];

  // ---- guess timer ----------------------------------------------------------

  let timerTO = null, timerLowTO = null, timerEl = null;

  function ensureTimer() {
    if (timerEl) return timerEl;
    const host = $("#screen-game .divider") || $("#screen-game");
    const wrap = document.createElement("div");
    wrap.className = "hl-timer";
    wrap.innerHTML = '<div class="fill"></div>';
    host.appendChild(wrap);
    timerEl = wrap;
    return wrap;
  }

  function startTimer() {
    const fill = $(".fill", ensureTimer());
    clearTimeout(timerTO); clearTimeout(timerLowTO);
    fill.classList.remove("low");
    fill.style.transition = "none";
    fill.style.transform = "scaleX(1)";
    void fill.offsetWidth;                       // flush so the transition restarts
    fill.style.transition = `transform ${TIME_LIMIT}ms linear`;
    fill.style.transform = "scaleX(0)";
    timerLowTO = setTimeout(() => { if (!state.locked) fill.classList.add("low"); }, TIME_LIMIT - 2500);
    timerTO = setTimeout(timeUp, TIME_LIMIT);
  }

  function stopTimer() {
    clearTimeout(timerTO); clearTimeout(timerLowTO);
    if (!timerEl) return;
    const fill = $(".fill", timerEl);
    const w = getComputedStyle(fill).transform; // freeze at current position
    fill.style.transition = "none";
    fill.style.transform = w;
  }

  function timeUp() {
    if (state.locked) return;
    state.locked = true;
    stopTimer();
    const c = statValue(state.challenger);
    $("#ask").classList.add("hide");
    const reveal = $("#challenger-reveal");
    reveal.classList.add("show");
    countTo($(".stat-value", reveal), c, state.category.decimals);
    const panel = $("#panel-challenger");
    panel.classList.add("result-wrong");
    if (!reduceMotion) panel.classList.add("shake");
    sfx("timeout");
    const verdict = $("#verdict");
    verdict.textContent = "Time's up!";
    verdict.className = "verdict bad show";
    later(gameOver, REVEAL_PAUSE + 200);
  }

  function fillPanel(sel, p, revealed) {
    const panel = $(sel);
    const dec = state.category.decimals;
    panel.classList.remove("result-correct", "result-wrong", "shake");

    $(".panel-name", panel).textContent = p.name;
    const logo = (p.team && LEAGUE) ? `<img class="tlogo" src="${LEAGUE.logo(p.team)}" alt="" /> ` : "";
    // soccer teams are FPL codes ("14") and MLB's are franchise ids ("ANA"),
    // so show the club name there, as h2h.js does
    const tname = p.team && LEAGUE && (SPORT === "soccer" || SPORT === "mlb") ? LEAGUE.name(p.team) : p.team;
    $(".panel-meta", panel).innerHTML = `${p.seasonLabel || p.season} · ${logo}${tname || "—"} · ${p.pos || "—"}`;

    const img = $(".panel-photo img", panel);
    const bg = $(".panel-bg", panel);
    img.style.display = "";
    img.onerror = () => { img.onerror = null; img.src = "/img/avatar.svg"; };
    const src = photo(p.headshot);
    img.src = src || "/img/avatar.svg";
    bg.style.backgroundImage = src ? `url("${src}")` : "";

    if (revealed) {
      setStat($(".stat-value", panel), fmt(statValue(p), dec));
      $(".stat-label", panel).textContent = state.category.label;
    }
  }

  function renderRound(animateIn) {
    state.locked = false;

    fillPanel("#panel-anchor", state.anchor, true);
    fillPanel("#panel-challenger", state.challenger, false);

    // challenger back to "ask" mode
    $(".hl-stat", $("#ask")).textContent = state.category.label;
    $("#ask").classList.remove("hide");
    const reveal = $("#challenger-reveal");
    reveal.classList.remove("show");
    setStat($(".stat-value", reveal), "0");
    $(".stat-label", reveal).textContent = state.category.label;

    $("#verdict").className = "verdict";

    // coin-spin the VS badge for the new matchup
    const vs = $(".vs-badge");
    if (vs && !reduceMotion) { vs.classList.remove("spin"); void vs.offsetWidth; vs.classList.add("spin"); }

    // panels must be visible even if a prior fade-out was interrupted
    fxTargets(["#panel-anchor .panel-body", "#panel-challenger .panel-body"])
      .forEach((el) => { el.style.opacity = ""; el.style.transform = ""; });
    const anime = A();
    if (animateIn && anime && !document.hidden) {
      entrance({
        targets: ["#panel-anchor .panel-body", "#panel-challenger .panel-body"],
        opacity: [0, 1],
        translateY: [18, 0],
        delay: anime.stagger(90),
        duration: 420,
        easing: "easeOutCubic",
      }, 420 + 90 * 2 + 300);
    }
    startTimer();
  }

  function guess(direction) {
    if (state.locked) return;
    state.locked = true;
    stopTimer();

    const a = statValue(state.anchor);
    const c = statValue(state.challenger);
    const correct = (direction === "higher") ? c > a : c < a;

    // swap challenger to reveal mode + count up
    $("#ask").classList.add("hide");
    const reveal = $("#challenger-reveal");
    reveal.classList.add("show");
    countTo($(".stat-value", reveal), c, state.category.decimals);

    const panel = $("#panel-challenger");
    panel.classList.add(correct ? "result-correct" : "result-wrong");

    const verdict = $("#verdict");
    if (correct) {
      state.streak += 1;
      bumpStreak();
      sfx("correct");
      // pick + preload the next challenger during the reveal pause
      state.next = pickChallenger(state.challenger);
      state.nextReady = preloadPlayer(state.next);
      verdict.textContent = "Correct! +1";
      verdict.className = "verdict good show";
      later(advance, REVEAL_PAUSE);
    } else {
      if (!reduceMotion) panel.classList.add("shake");
      sfx("wrong");
      verdict.textContent = "Wrong!";
      verdict.className = "verdict bad show";
      later(gameOver, REVEAL_PAUSE + 200);
    }
  }

  function bumpStreak() {
    const el = $("#streak");
    led(el, state.streak);
    el.classList.remove("pop"); void el.offsetWidth; el.classList.add("pop");
    if (state.streak > state.best) {
      state.best = state.streak;
      setBest(state.category.key, state.best);
      led($("#best"), state.best);
    }
  }

  function advance() {
    state.anchor = state.challenger;          // challenger becomes the new anchor
    state.challenger = state.next || pickChallenger(state.anchor);
    const ready = state.nextReady || Promise.resolve();
    state.next = null; state.nextReady = null;
    // the next round must NEVER depend on anime's rAF-driven complete callback
    // firing (a stalled rAF would freeze the game mid-run) — a plain timeout
    // watchdog advances regardless, whichever comes first
    let advanced = false;
    const run = state.run;
    const go = () => {
      if (advanced) return;
      advanced = true;
      ready.then(() => { if (run === state.run) renderRound(true); });
    };
    const anime = A();
    if (anime && !document.hidden) {
      // slide the round upward: anchor takes over, fresh challenger enters
      anime({
        targets: "#panel-challenger .panel-body",
        opacity: [1, 0],
        translateY: [0, -12],
        duration: 180,
        easing: "easeInCubic",
        complete: go,
      });
      setTimeout(go, 500);
    } else {
      go();
    }
  }

  function gameOver() {
    stopTimer();
    ebkRecord(state.streak);
    const cat = state.category;
    const a = state.anchor, c = state.challenger;
    led($("#final-streak"), state.streak);
    $("#final-streak").classList.toggle("off", !state.streak);   // a zero streak stays unlit
    led($("#over-best"), Math.max(state.best, getBest(cat.key)));
    $("#over-cat").innerHTML = `${LEAGUE_NAME} <i>${esc(cat.label)}</i>`;
    const isNewBest = state.streak > 0 && state.streak === state.best &&
                      state.streak === getBest(cat.key);
    sfx(isNewBest ? "best" : "over");
    $("#new-best").hidden = !isNewBest;
    const odRow = (p, cls) =>
      `<div class="od-row ${cls}"><img src="${photo(p.headshot) || "/img/avatar.svg"}" alt="" onerror="this.onerror=null;this.src='/img/avatar.svg'" />` +
      `<span class="od-n"><b>${esc(p.name)}</b><span>${p.seasonLabel || p.season}</span></span>` +
      `<span class="od-v">${fmt(statValue(p), cat.decimals)}</span></div>`;
    $("#over-detail").innerHTML =
      `<span class="od-k">The call that ended it <i>${esc(cat.label)}</i></span>` +
      odRow(a, "a") + odRow(c, "c");
    // keep playing: the other stats as glyph pills (same action as the menu tiles)
    const more = $("#over-cats");
    if (more) {
      more.innerHTML = "";
      state.data.categories.filter((o) => o.key !== cat.key).forEach((o) => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "over-cat";
        b.innerHTML = `<span class="oc-ic" aria-hidden="true">${glyph(o)}</span>${esc(o.label)}`;
        b.addEventListener("click", () => startRun(o));
        more.appendChild(b);
      });
    }
    showScreen("screen-over");
    const anime = A();
    if (anime && !document.hidden) {
      entrance({
        targets: ["#screen-over .over-card > *", "#over-more"],
        opacity: [0, 1],
        translateY: [16, 0],
        delay: anime.stagger(60),
        duration: 380,
        easing: "easeOutCubic",
      }, 380 + 60 * 8 + 300);
    }
  }

  // ---- wiring ---------------------------------------------------------------

  document.querySelectorAll(".guess-btn").forEach((b) =>
    b.addEventListener("click", () => guess(b.dataset.dir)));
  $("#again-btn").addEventListener("click", () => startRun(state.category));
  const toMenu = () => { stopTimer(); state.locked = true; state.run++; showScreen("screen-start"); buildCategoryGrid(); };
  $("#menu-btn").addEventListener("click", toMenu);
  $("#quit-btn").addEventListener("click", toMenu);

  document.addEventListener("keydown", (e) => {
    if (!$("#screen-game").classList.contains("is-active")) return;
    if (e.key === "ArrowUp") { e.preventDefault(); guess("higher"); }
    if (e.key === "ArrowDown") { e.preventDefault(); guess("lower"); }
  });

  // the hero ball bobs only while the start screen is on screen
  try { window.EBKKit && EBKKit.calm(".hl-hero"); } catch (e) {}

  load();
})();
