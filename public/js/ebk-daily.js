/* EBK · Daily Card — the return-tomorrow loop.
 *
 * Every daily grid already writes `ebk_daily_<sport>_<YYYY-MM-DD>` to
 * localStorage when it is played. Nothing has ever read those keys back, so a
 * player who has come back five days running is told nothing about it and the
 * keys just accumulate. This module derives two things from data that has been
 * sitting there all along:
 *
 *   streak  — consecutive ET days on which at least one daily grid was
 *             completed. Today not being played does NOT break it: the streak
 *             stands until yesterday is also empty, so there is a live "keep it
 *             alive" state rather than a silent reset at midnight.
 *   today   — per-sport state of the five live daily grids, so a player who has
 *             done one knows four more are waiting right now.
 *
 * It reads and derives only. No score, leaderboard entry or rarity number is
 * rewritten or reinterpreted; the raw per-day keys keep exactly the meaning
 * they had. The one write is a compact `ebk_days` ledger of completed dates,
 * which lets the streak survive pruning the raw keys (they were unbounded —
 * ~1.5KB x 5 sports x 365 days would have walked into the storage quota).
 */
(function () {
  "use strict";

  var GRID_SPORTS = ["nfl", "nba", "mlb", "nhl", "soccer"];
  var LEDGER = "ebk_days";     // ["2026-08-24","2026-08-25",...] completed days
  var KEEP_RAW_DAYS = 14;      // prune per-day snapshots older than this
  var LEDGER_CAP = 400;

  function ls() { try { return window.localStorage; } catch (e) { return null; } }
  function get(k) { var s = ls(); try { return s ? s.getItem(k) : null; } catch (e) { return null; } }
  function set(k, v) { var s = ls(); try { s && s.setItem(k, v); } catch (e) {} }
  function del(k) { var s = ls(); try { s && s.removeItem(k); } catch (e) {} }
  function parse(s) { try { return JSON.parse(s); } catch (e) { return null; } }

  /* ET calendar date, optionally shifted by whole days. Arithmetic is done on
     the calendar string via UTC so it never drifts across a DST boundary. */
  function etDate(offsetDays) {
    var s = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());
    if (!offsetDays) return s;
    var p = s.split("-");
    var d = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2]));
    d.setUTCDate(d.getUTCDate() + offsetDays);
    return d.toISOString().slice(0, 10);
  }

  function hoursToReset() {
    var p = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York", hour12: false,
      hour: "2-digit", minute: "2-digit",
    }).formatToParts(new Date());
    var g = function (t) { return +p.find(function (x) { return x.type === t; }).value; };
    var mins = 1440 - ((g("hour") % 24) * 60 + g("minute"));
    return Math.floor(mins / 60) + "h " + (mins % 60) + "m";
  }

  /* ---- ledger ---------------------------------------------------------- */

  /* Merge any completed day found in the raw per-day keys into the ledger, then
     drop raw keys older than KEEP_RAW_DAYS. Idempotent and cheap: it runs over
     localStorage keys, not values, except for days it has not seen. */
  function syncLedger() {
    var store = ls();
    if (!store) return [];
    var days = parse(get(LEDGER));
    if (!Array.isArray(days)) days = [];
    var seen = Object.create(null);
    days.forEach(function (d) { seen[d] = 1; });

    var cutoff = etDate(-KEEP_RAW_DAYS);
    var stale = [];
    for (var i = 0; i < store.length; i++) {
      var k = store.key(i);
      if (!k || k.indexOf("ebk_daily_") !== 0) continue;
      var date = k.slice(k.lastIndexOf("_") + 1);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
      if (!seen[date]) {
        var rec = parse(get(k));
        if (rec && rec.done) { seen[date] = 1; days.push(date); }
      }
      if (date < cutoff) stale.push(k);
    }
    stale.forEach(del);

    days.sort();
    if (days.length > LEDGER_CAP) days = days.slice(days.length - LEDGER_CAP);
    set(LEDGER, JSON.stringify(days));
    return days;
  }

  /* Record today as played. Called by a game the moment a daily is completed,
     so the streak is correct without waiting for the next syncLedger pass. */
  function markPlayed(date) {
    var d = date || etDate();
    var days = parse(get(LEDGER));
    if (!Array.isArray(days)) days = [];
    if (days.indexOf(d) === -1) { days.push(d); days.sort(); set(LEDGER, JSON.stringify(days)); }
  }

  /* ---- derived state --------------------------------------------------- */

  function streak() {
    var days = syncLedger();
    var have = Object.create(null);
    days.forEach(function (d) { have[d] = 1; });
    var today = etDate(), playedToday = !!have[today];
    /* Count back from today if played, else from yesterday — an unplayed today
       leaves the streak standing but at risk, which is the whole hook. */
    var anchor = playedToday ? 0 : (have[etDate(-1)] ? -1 : null);
    if (anchor === null) return { days: 0, atRisk: false, playedToday: false };
    var n = 0;
    for (var i = anchor; i > -LEDGER_CAP; i--) { if (!have[etDate(i)]) break; n++; }
    return { days: n, atRisk: !playedToday, playedToday: playedToday };
  }

  function today() {
    var date = etDate(), out = {};
    GRID_SPORTS.forEach(function (s) {
      var rec = parse(get("ebk_daily_" + s + "_" + date));
      if (!rec) { out[s] = { state: "none" }; return; }
      out[s] = {
        state: rec.done ? "done" : "partial",
        score: typeof rec.score === "number" ? rec.score : null,
        rarity: typeof rec.rarity === "number" ? rec.rarity : null,
      };
    });
    return out;
  }

  /* ---- the card -------------------------------------------------------- */

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  /* Game pages do not load catalog.js, so the card carries its own short labels
     and accents and only upgrades from EBK when that catalog happens to be
     present (the home page). Keep these in step with js/catalog.js. */
  var FALLBACK = {
    nfl:    { label: "NFL", accent: "#3ddc97" },
    nba:    { label: "NBA", accent: "#ff7a3c" },
    mlb:    { label: "MLB", accent: "#4aa3ff" },
    nhl:    { label: "NHL", accent: "#5fd0e6" },
    soccer: { label: "SOC", accent: "#8ee04a" },
  };
  function sportLabel(key) { return (FALLBACK[key] || {}).label || key.toUpperCase(); }
  function sportAccent(key) {
    var meta = window.EBK && EBK.sport ? EBK.sport(key) : null;
    return (meta && meta.accent) || (FALLBACK[key] || {}).accent || null;
  }

  /* opts.exclude — a sport to leave out (the one just played)
     opts.compact — no streak headline, used inline on an end screen */
  function card(opts) {
    opts = opts || {};
    var st = streak(), td = today();
    var sports = GRID_SPORTS.filter(function (s) { return s !== opts.exclude; });
    var doneCount = GRID_SPORTS.filter(function (s) { return td[s].state === "done"; }).length;

    var root = el("section", "daily-card");
    root.setAttribute("aria-label", "Your daily grids");

    if (!opts.compact) {
      var head = el("div", "dc-head");
      var flame = el("span", "dc-flame", st.days > 0 ? "\u{1F525}" : "\u{1F532}");
      flame.setAttribute("aria-hidden", "true");
      head.appendChild(flame);
      /* A cold visitor should be invited, not shown a zero. */
      if (st.days > 0) head.appendChild(el("span", "dc-num", String(st.days)));
      var lab = el("div", "dc-lab");
      lab.appendChild(el("span", "dc-lab-k", st.days > 0 ? "DAY STREAK" : "START A STREAK"));
      lab.appendChild(el("span", "dc-lab-v",
        st.days === 0
          ? "Finish any grid today and it counts from here."
          : st.atRisk
            ? "Play any grid today to make it " + (st.days + 1) + "."
            : "Come back tomorrow to make it " + (st.days + 1) + "."));
      head.appendChild(lab);
      if (st.atRisk && st.days > 0) head.appendChild(el("span", "dc-risk", "AT RISK"));
      root.appendChild(head);
    }

    var row = el("div", "dc-row");
    row.appendChild(el("span", "dc-row-k", opts.compact ? "STILL OPEN TODAY" : "TODAY"));
    var chips = el("div", "dc-chips");
    sports.forEach(function (s) {
      var t = td[s];
      var a = el("a", "dc-chip is-" + t.state);
      a.href = "/" + s + "/player-grid";
      var accent = sportAccent(s);
      if (accent) a.style.setProperty("--accent", accent);
      a.appendChild(el("span", "dc-chip-s", sportLabel(s)));
      a.appendChild(el("span", "dc-chip-v",
        t.state === "done" ? t.score + "/9" : t.state === "partial" ? "…" : "·"));
      a.setAttribute("aria-label",
        sportLabel(s) + " daily grid — " +
        (t.state === "done" ? "finished, " + t.score + " of 9"
          : t.state === "partial" ? "in progress" : "not played yet"));
      chips.appendChild(a);
    });
    row.appendChild(chips);
    root.appendChild(row);

    var foot = el("p", "dc-foot");
    foot.appendChild(el("span", null, doneCount + " of " + GRID_SPORTS.length + " done today"));
    foot.appendChild(el("span", "dc-dot", "·"));
    foot.appendChild(el("span", "dc-reset", "new grids in " + hoursToReset()));
    root.appendChild(foot);

    return root;
  }

  /* Mount into #daily-card if the page has one. */
  function mount() {
    var host = document.getElementById("daily-card");
    if (!host) return;
    try {
      host.innerHTML = "";
      host.appendChild(card());
      host.hidden = false;
    } catch (e) { host.hidden = true; }
  }

  window.EBKDaily = {
    GRID_SPORTS: GRID_SPORTS,
    etDate: etDate,
    hoursToReset: hoursToReset,
    streak: streak,
    today: today,
    markPlayed: markPlayed,
    card: card,
    mount: mount,
  };

  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", mount);
  else mount();
})();
