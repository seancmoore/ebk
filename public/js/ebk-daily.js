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
  var ETF = null, ETH = null;   // built once: each construction costs ~0.4ms
  function etDate(offsetDays) {
    ETF = ETF || new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" });
    var s = ETF.format(new Date());
    if (!offsetDays) return s;
    var p = s.split("-");
    var d = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2]));
    d.setUTCDate(d.getUTCDate() + offsetDays);
    return d.toISOString().slice(0, 10);
  }

  function hoursToReset() {
    ETH = ETH || new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York", hour12: false,
      hour: "2-digit", minute: "2-digit",
    });
    var p = ETH.formatToParts(new Date());
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

  /* ---- the rack: one counted grid a day, sport on a weekly rotation ----
   *
   * Only today's rotation sport counts toward the streak (the other grids are
   * still playable as practice). Filling at least one square keeps the streak;
   * every square filled is worth one point (max 9 a day). A missed day resets
   * the day count, but points are banked forever as career points.
   *
   * Points per day live in a small `ebk_rack` ledger {"YYYY-MM-DD": squares},
   * filled from the raw per-day grid keys while they still exist (14 days),
   * so a player who already played this week gets credit on first load. */
  var ROTATION = ["nfl", "nba", "nhl", "mlb", "nfl", "soccer", "soccer"]; // by ET weekday, Sun..Sat
  var RACK = "ebk_rack";

  function dayOfWeek(date) { var p = date.split("-"); return new Date(Date.UTC(+p[0], +p[1] - 1, +p[2])).getUTCDay(); }
  function sportOn(date) { return ROTATION[dayOfWeek(date || etDate())]; }

  function squaresOn(date) {
    var rec = parse(get("ebk_daily_" + sportOn(date) + "_" + date));
    return rec && typeof rec.score === "number" ? Math.max(0, Math.min(9, rec.score)) : 0;
  }

  function rackSync() {
    syncLedger();                       // keeps pruning the raw per-day keys
    var led = parse(get(RACK));
    if (!led || typeof led !== "object" || Array.isArray(led)) led = {};
    for (var i = 0; i >= -KEEP_RAW_DAYS; i--) {
      var d = etDate(i), n = squaresOn(d);
      if (n > (led[d] || 0)) led[d] = n;
    }
    var keys = Object.keys(led).sort();
    if (keys.length > LEDGER_CAP) keys.slice(0, keys.length - LEDGER_CAP).forEach(function (k) { delete led[k]; });
    set(RACK, JSON.stringify(led));
    return led;
  }

  /* Everything the home rack needs, in one pass. */
  function rack() {
    var led = rackSync(), today = etDate();
    var playedToday = (led[today] || 0) > 0;
    var anchor = playedToday ? 0 : ((led[etDate(-1)] || 0) > 0 ? -1 : null);
    var days = 0, pts = 0;
    if (anchor !== null) for (var i = anchor; i > -LEDGER_CAP; i--) { var n = led[etDate(i)] || 0; if (!n) break; days++; pts += n; }
    var career = 0, best = null, run = null, keys = Object.keys(led).sort(), prev = null;
    keys.forEach(function (k) {
      var n = led[k] || 0; career += n;
      if (!n) { run = null; prev = k; return; }
      var consecutive = prev && run && (Date.parse(k) - Date.parse(prev) === 864e5);
      run = consecutive ? { d: run.d + 1, p: run.p + n } : { d: 1, p: n };
      if (!best || run.d > best.d || (run.d === best.d && run.p > best.p)) best = { d: run.d, p: run.p };
      prev = k;
    });
    // this ET week, Monday first
    var wd = (dayOfWeek(today) + 6) % 7, week = [];
    for (var j = 0; j < 7; j++) {
      var off = j - wd, date = etDate(off);
      week.push({ date: date, off: off, sport: sportOn(date), squares: off <= 0 ? (led[date] || 0) : null });
    }
    return {
      today: today, sport: sportOn(today), playedToday: playedToday, squaresToday: led[today] || 0,
      days: days, pts: pts, atRisk: days > 0 && !playedToday,
      career: career, best: best, fresh: keys.length === 0, week: week,
    };
  }

  /* ---- derived state --------------------------------------------------- */

  /* Streak under the rack rules (today's rotation sport only). Kept under
     the old name so the share text and end screens follow the same count. */
  function streak() {
    var r = rack();
    return { days: r.days, pts: r.pts, atRisk: r.atRisk, playedToday: r.playedToday, sport: r.sport };
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
    // the daily question rides along in the same card
    var dc = parse(get("ebk_dcut_" + date));
    out["deep-cut"] = !dc ? { state: "none" }
      : { state: dc.done ? "done" : "partial", win: !!dc.win, n: (dc.g || []).length };
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

  /* The small end-screen card (grid + Deep Cut pages).
     opts.exclude — the sport/page just played
     opts.compact — no streak headline */
  function card(opts) {
    opts = opts || {};
    var r = rack(), s = r.sport, here = opts.exclude;
    var root = el("section", "daily-card");
    root.setAttribute("aria-label", "Your streak");

    if (!opts.compact) {
      var head = el("div", "dc-head");
      var flame = el("span", "dc-flame", r.days > 0 ? "\u{1F525}" : "\u{1F532}");
      flame.setAttribute("aria-hidden", "true");
      head.appendChild(flame);
      if (r.days > 0) head.appendChild(el("span", "dc-num", String(r.days)));
      var lab = el("div", "dc-lab");
      lab.appendChild(el("span", "dc-lab-k", r.days > 0 ? "DAY STREAK · " + r.pts + " PTS" : "START A STREAK"));
      lab.appendChild(el("span", "dc-lab-v",
        r.playedToday ? "Today's " + sportLabel(s) + " grid is in: +" + r.squaresToday + " pts. Back tomorrow to make it " + (r.days + 1) + "."
          : r.days > 0 ? "Fill a square in today's " + sportLabel(s) + " grid to make it " + (r.days + 1) + "."
          : "Fill one square in today's " + sportLabel(s) + " grid and it counts from here."));
      head.appendChild(lab);
      root.appendChild(head);
    }

    var row = el("div", "dc-row");
    row.appendChild(el("span", "dc-row-k", here && here !== s && here !== "deep-cut" ? "THAT WAS PRACTICE · TODAY'S GRID" : "TODAY'S GRID"));
    var chips = el("div", "dc-chips");
    var a = el("a", "dc-chip is-" + (r.playedToday ? "done" : "none"));
    a.href = "/" + s + "/player-grid";
    var accent = sportAccent(s);
    if (accent) a.style.setProperty("--accent", accent);
    a.appendChild(el("span", "dc-chip-s", sportLabel(s)));
    a.appendChild(el("span", "dc-chip-v", r.playedToday ? r.squaresToday + "/9" : "·"));
    a.setAttribute("aria-label", sportLabel(s) + " daily grid, today's counted grid — " +
      (r.playedToday ? r.squaresToday + " of 9 squares" : "not played yet"));
    chips.appendChild(a);
    row.appendChild(chips);
    root.appendChild(row);

    var foot = el("p", "dc-foot");
    foot.appendChild(el("span", null, "Career " + r.career + " pts"));
    foot.appendChild(el("span", "dc-dot", "·"));
    foot.appendChild(el("span", "dc-reset", "new grid in " + hoursToReset()));
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
    rack: rack,
    sportOn: sportOn,
    ROTATION: ROTATION,
    today: today,
    markPlayed: markPlayed,
    card: card,
    mount: mount,
  };

  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", mount);
  else mount();
})();
