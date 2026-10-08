# Deep Bag v2: the article system

The look and the machinery for EBK Deep Bag studies from October 2026 on. The
flagship reference is **The Fresh-Start Myth**
(`Desktop\ebk-trade-study\reports\article_v13.html`, live at `/deep-bag/fresh-start-myth`).
Copy its structure, not its sentences.

## Files

| File | What it does |
|---|---|
| `public/css/deep-bag-v2.css` | Every `.v2-*` piece: tokens, type, hero, body, figures, charts, film, end matter, reduced motion. |
| `public/js/deep-bag-v2.js` | Classic deferred script: scroll reveals, counters, 2D charts (line, hbar) from JSON, view switch (3D / Flat / Table), hero scene boot, in-view video. Loads every module below only when the page needs it. |
| `public/js/deep-bag-v2-chart3d.js` | ES module (three.js 0.160 from jsDelivr): interactive 3D bar grid, render-on-demand. |
| `public/js/deep-bag-v2-xcharts.js` | ES module: the extra chart types `agecurve`, `rangeplot`, `ridge3d` (promoted from the-cliff). |
| `public/js/deep-bag-v2-scene.js` | ES module: hero scene core (registry, renderer, budget, loop, camera) + the built-in `trade-field`. |
| `public/js/deep-bag-v2-scenes/<name>.js` | One module per study scene: `return-bowl`, `champagne-bubbles`, `cliff-ridges`. They only draw. |
| `tools/build_deep_bag.py` | Publisher. Detects v2, renders the v2 chrome, copies video/poster assets, read time, lints house rules, drops superseded study modules. |
| `tools/deep_bag_charts.py` | Injects chart JSON + fallback data tables into an article between markers (all six chart types). |
| `tools/deep-bag-share.cjs` | 1200x630 share card in the v2 look (Edge + puppeteer-core), per-study motif, retries. |
| `ebk-studio/src/formats/DeepBagClip.tsx` | Remotion composition for the looping study clip (16:9 + 4:5). Motifs in `src/formats/deepbag/motifs.tsx`. |
| `ebk-studio/pipeline/render_deepbag.mjs` | Renders the clip set from its own entry (`src/formats/deepbag/entry.ts`) and bundle dir; never touches `src/Root.tsx` or the autopilot bundle. |

## How a study opts in

Put this in the study HTML `<head>`:

```html
<meta name="deep-bag-version" content="2">
<title>Study Title</title>
<meta name="description" content="One or two plain sentences. Used for og/twitter and the index card.">
<meta property="og:description" content="(same)">
<style>:root { --accent: #3ddc97; }</style>   <!-- the ONE accent; optional, EBK green by default -->
```

Without the meta the study renders with the old template, so studies migrate one at a time.
The publisher then loads the v2 fonts, CSS and JS, sets `--v2-accent` from the study's
`--accent`, and swaps in the v2 top bar and end matter (no numbered `shd()` badges anywhere;
`shd()` lost its number for old studies too). A report opts in the same way (the meta tag);
its own stylesheet still applies, scoped to the page. See `report_v13.html` for a dark skin
that matches.

Publish exactly as before:

```
python tools/build_deep_bag.py import <article_vN.html> --slug <slug> --report <report_vN.html> --share <share.png>
```

`src`, `href` and `poster` paths relative to the article (e.g. `../outputs/video/x.mp4`) are
copied into `content/deep-bag/<slug>/assets/` and published under `/deep-bag/<slug>/assets/`.

## Page anatomy

```html
<header class="v2-hero" data-scene="trade-field" data-scene-opts='{"arcs":5,"accentEvery":4}'>   <!-- see "Hero scenes" -->
  <div class="v2-hero-fallback" aria-hidden="true"></div>      <!-- CSS field: reduced motion, no WebGL, phones; add is-custom for your own SVG -->
  <div class="v2-hero-in">
    <h1 class="v2-title">Title</h1>
    <p class="v2-standfirst">One to three plain sentences. Becomes the dek on index cards.</p>
  </div>
  <a class="v2-cue" href="#start" aria-label="Start reading">(arrow svg)</a>
</header>
<article class="v2-body" id="start">
  <p class="v2-lede">First paragraph: a real player, a real moment, from the data. Gets the drop cap.</p>
  <p>...</p>
  <aside class="v2-note"><b>Short label</b><p>Margin note (right gutter at 1240px+, inline below).</p></aside>
  <h2>Short specific heading</h2>
  <div class="v2-bignum"><span class="v2-count" data-to="-3.5" data-dec="1">&minus;3.5</span><p><b>what it is</b> and the n.</p></div>
  <figure class="v2-fig v2-chart" data-chart="ID"><!--chart:ID--><!--/chart:ID--><figcaption>...</figcaption></figure>
  <figure class="v2-fig v2-bleed v2-chart" data-chart="ID3D">...</figure>        <!-- v2-bleed = wide break -->
  <blockquote class="v2-pull is-wide"><p>A sentence lifted from the body.</p></blockquote>
  <figure class="v2-fig v2-bleed v2-film"><div class="v2-film-frame">
    <video muted playsinline loop preload="none" poster="../outputs/video/SLUG_16x9_poster.jpg" aria-label="...">
      <source src="../outputs/video/SLUG_16x9.webm" type="video/webm">
      <source src="../outputs/video/SLUG_16x9.mp4" type="video/mp4"></video></div>
    <figcaption>...</figcaption></figure>
  <hr class="v2-break">
  <p>Closing paragraph.<span class="v2-end-mark" aria-hidden="true"></span></p>
  <footer class="v2-colophon"><p><b>Data.</b> ...</p><p><b>Method.</b> ...</p><p>... <a href="report_vN.html">technical report</a>.</p></footer>
</article>
```

Counters: `.v2-count` with `data-to`, `data-dec`, optional `data-signed`, `data-sep` (thousands
commas). The element's text must already be the final value (no-JS and reduced motion show it).
Inline numbers in prose stay in the text face; Martian Mono is for charts, tables, big numbers.

## Chart JSON

Numbers are never typed by hand. Each study gets a script (see
`ebk-trade-study/scripts/23_export_web.py`) that reads its `outputs/tables` CSVs and writes
`outputs/web/charts.json`, a list of specs. Then:

```
python tools/deep_bag_charts.py reports/article_vN.html outputs/web/charts.json   # idempotent, re-run after every export
```

It fills each `<!--chart:ID-->...<!--/chart:ID-->` with the card (title, stage, key, the data
table as the accessible/no-JS fallback, the source line) and the JSON in
`<script type="application/json" class="v2-chart-data">`.

Common fields: `id`, `type`, `title` (card title + table caption), `unit`, `decimals`, `signed`,
`source` (CSV files and rows), optional `subtitle`, `key_accent` (legend text for the accent).

Cell / row / point fields: `v` (value, or `null` = not averaged), `lo`, `hi` (95% CI), `n`, `p`,
`sig` (bool: CI excludes zero AND p < 0.05; `false` draws hatched/see-through "can't tell from
zero"), `emph` (accent; use it for the finding only), `note` (shown when `v` is null), `label`,
optional `short` (used on narrow screens and in 3D).

| `type` | Extra fields | Renders |
|---|---|---|
| `line` | `x.cats[{key,label}]`, `points[{x, ...cell}]`, `domain`, `marker{label}` | dots + CI whiskers + drawn line, a dashed accent marker on the right (e.g. "Traded"). |
| `hbar` | `panels[{title?, unit, domain, groups[{label?, rows[{label, ...cell}]}]}]` | horizontal bars from zero, grouped; several panels sit side by side on desktop, stack on phones. |
| `bars3d` | `x.cats`, `z.cats` (each `{key,label,short?}`), `cells[{x, z, ...cell}]`, `domain`, `flat` ("x" or "z": which axis groups the Flat view and table), optional `view{theta,phi,thetaNarrow,phiNarrow}` in degrees | the 3D grid (default view), plus Flat (hbar of the same cells) and Table. z runs back to front, so put the row you want read first LAST in `z.cats`. |

Every chart is legible at 420px: hbar/line redraw at the real pixel width; 3D switches to
short labels, rotates the front labels, and the Flat view is one tap away.

Empty bars3d cells: `{"x": ..., "z": ..., "v": null, "note": "no data before 1967"}` (omit `n`, or `n: 0`):
no floating label in 3D, the note in Flat and Table.


### Extra chart types (`deep-bag-v2-xcharts.js`)

Promoted from the-cliff on 2026-10-08 with the drawing unchanged, so the-cliff renders exactly as
before. Loaded only when an article has one of these charts. Classes keep the `cl-` prefix they
were born with; `deep-bag-v2.css` styles them (series colours `s-ink`, `s-ink2`, `s-muted`,
`s-accent`; segments `g-prime`, `g-slide`, `g-cliff`, `g-past`, `g-span`; marks `m-peak`,
`m-delta`, `m-fe`). Accent areas are hatched, never translucent fills.

| `type` | Fields | Renders |
|---|---|---|
| `agecurve` | `x{domain, ticks, label}`, `y{domain, ticks}`, `yfmt` ("pct" / "sd"), `series[{key, label, short?, cls, gaps?, points[{x, v, n?, thin?}]}]`, `band{lo, hi, from?, label}`, `bars{label, points[{x, v}], accentFrom?}`, `hlines[{v, label, cls?}]`, `marks[{series, x, label?, below?}]`, or `panels[...]` + `panelGroups` for small multiples | numeric-x lines that draw on scroll, end labels with collision nudging, a hatched band, dashed thin ages, count bars, a hover crosshair (arrow keys too). |
| `rangeplot` | `x{domain, ticks}`, `groups[{label, rows[{label, short?, emph?, value?, note?, segs[{a, b, cls, label?}], marks[{v, cls, label}]}]}]`, `ref{v, label}`, `legend[{cls, label}]`, `labelW` [narrow, wide] | rows of ranges and markers on one axis (dumbbells, prime/slide/cliff timelines). |
| `ridge3d` | `x{domain, ticks}`, `y{cap, threshold}`, `rows[{label, short, emph?, fe[{x, v, n?, thin?}], delta[...], fast, slow, end}]`, `flat` (an agecurve spec for the Flat view), `view{theta, phi, thetaNarrow, phiNarrow}` | one curtain per row, value hanging down, a glass waterline at `threshold`; 3D / Flat / Table. |

These three carry their own fallback table because their rows are not cells:
`"table": {"cols": [...], "rows": [[...]], "caption": "optional"}`, plus an optional
`"key": [{"cls": "line s-accent", "label": "..."}]` (each becomes `<i class="k-CLS">`; without it a
key is built from series / band / bars / legend). `deep_bag_charts.py` does the rest, as for the
other types. The-cliff's own markup (`figure.cliff-chart` + `script.cliff-chart-data`, filled by its
`scripts/15_export_web.py`) is still drawn by the shared module.

## 3D chart API (`deep-bag-v2-chart3d.js`)

`mountBars3D(host, spec, {reduce, fmt, tipHTML, showTip, hideTip}) -> {animateIn(instant), destroy()}`.
deep-bag-v2.js calls it; studies never do. Bars hang from (or rise above) a glass zero plane,
drag (horizontal only on touch, so the page still scrolls) or arrow keys to turn, hover/tap for
value, CI, n and p (the whisker shows on the hovered bar). It draws a frame only when something
changes, so an idle chart costs nothing. WebGL missing or the module failing to load falls back to Flat.

- **Framing.** The camera distance and centre are solved from the projected bars, floor and back
  wall plus the measured label boxes, so a 2x3 grid fills the card like a 5x4 one. When the content
  is wide and short (phones, most grids) the card itself gets shorter (min 250px phone / 320px
  desktop) instead of showing a band of empty space.
- **Labels.** Value labels that would overlap are nudged above/below; if there is no room the
  lower-priority one (further back) waits for hover. Empty cells print `n N` only when N > 0; a
  structurally empty cell (n 0 or missing) stays quiet, and the Flat view shows its `note` instead
  of "n/a". So a study can now include empty cells with `"v": null, "note": "no Elo ratings"`.
- **Can't-tell-from-zero bars** are hatched in screen space (full-strength stripes, nearly clear
  gaps), never a 20% fill: warm accents at low alpha over navy read brown.
- **Loading.** The 3D host is sized by CSS at once (no layout shift); three.js is fetched when the
  figure is ~1100px away and the chart mounts at ~450px. A page whose readers never reach a 3D
  chart never downloads three.js (unless the hero scene needs it).

## Hero scenes (`deep-bag-v2-scene.js`, scene API 2)

The shared core does all the shared work; a scene only draws.

- Gating (in deep-bag-v2.js, before anything loads): no scene under reduced motion, without WebGL,
  on coarse-pointer screens under 820px, on data-saver or `deviceMemory < 4`. The static
  `.v2-hero-fallback` stays.
- Budget (in the core): DPR capped at `opts.dpr` (1.5), FPS at `opts.fps` (30), no antialias.
  Frame budget: when the main-thread cost of a frame stays over `opts.budget` ms (4) or the
  achieved rate falls well under the cap for ~2 s, it steps the pixel ratio down to 1, then the
  rate to 24 and 20.
- The loop stops while the hero is off screen or the tab is hidden, and for good if the visitor
  switches reduced motion on or the WebGL context is lost (the fallback comes back).
- `window.__v2scene = {scene, frames, dpr, fps, cost}` for perf checks.

API: `mountScene(mount, name, opts, hero, {data, src}) -> Promise<bool>`; `registerScene(name, build)`.
A scene is `build(ctx, opts) -> {update(t, dt), camera, caption?}` or `null` (data missing: the
fallback stays). `ctx = {THREE, scene, camera, accent, uniforms (uTime, uDpr, uColor, uAccent), hero,
data}`. `camera = {pos, look, fov: [wide, narrow], far, drift: {sway, swaySpeed, mouseX, mouseY,
scrollY, scrollZ, lookMouse, lookScroll}}` or a `move(camera, {t, mx, my, scroll, pos, look})` of its
own. `caption` is shown under the standfirst only while the scene runs.

| Scene | Study | Data (`data-scene-data` JSON) | Opts |
|---|---|---|---|
| `trade-field` (built in) | fresh-start-myth | none | `arcs` 5, `accentEvery` 4, `surface` "football" / "plain", `color` |
| `return-bowl` | revenge-game | `{n, v: [fpts vs expected per game]}` | `arcs` 2, `accentEvery` 4, `arcColor`, `caption` |
| `champagne-bubbles` | champagne-no-hangover | `{c: [[league 0-3, season, zThis, zNext, zExp]]}` | `color`, `from`, `to`, `bubbles` |
| `cliff-ridges` | the-cliff | `{rows: [{pts, n, emph}], xmin, xmax, cap, threshold}` | none |

A new scene goes in `public/js/deep-bag-v2-scenes/<name>.js` (default export = build) and its name
in `BUILT_IN_MODULES` in the core; or a study hosts it and points at it with `data-scene-src` (the
publisher copies it as an asset). An unknown name with no module keeps the static fallback; it
never silently becomes the football field. It must relate to the study's subject.

Static fallback: `.v2-hero-fallback` draws the dotted pitch; a study that draws its own (an SVG of
its scene) adds `class="v2-hero-fallback is-custom"` to drop the pitch.

### Opt-in markup, per study

New articles use one form:

```html
<header class="v2-hero" data-scene="NAME" data-scene-data="JSON-SCRIPT-ID" data-scene-opts='{...}'>
<script type="application/json" id="JSON-SCRIPT-ID">{...}</script>   <!-- anywhere in the body -->
```

The four live studies keep the markup they shipped with; the runtime maps it, so the editor's new
versions need no change:

| Study | Hero markup it carries | Scene | Data | Charts |
|---|---|---|---|---|
| fresh-start-myth | `data-scene="trade-field" data-scene-opts='{"arcs":5,"accentEvery":4}'` | trade-field | none | shared `v2-chart-data` |
| revenge-game | `data-study-scene="return-bowl" data-study-scene-opts='{"arcs":2,"accentEvery":4}'` | return-bowl | `#rg-scene-data` | shared |
| champagne-no-hangover | `data-study-scene="champagne"` | champagne-bubbles | `#cn-hero-data` | shared |
| the-cliff | `data-cliff-scene="ridges"` | cliff-ridges | `#cliff-scene-data` | shared + `figure.cliff-chart` / `script.cliff-chart-data` (xcharts) |

Each of the three also has `<script type="module" src="../outputs/web/{revenge-bowl,champagne-scene,the-cliff-v2}.js">`.
The publisher drops those tags and does not ship the files (`SUPERSEDED_MODULES` in
build_deep_bag.py), so the shared modules draw the same markup. If a page still loads one of them
(say the publisher list is edited), the runtime sees it and leaves that hero / those charts to the
study module, so nothing draws twice. Opening the Desktop article file directly still uses the
study module, as before.

## Read time

`build_deep_bag.py` counts running prose only, at 238 words a minute, rounded: the words a reader
moves through top to bottom. Skipped: figures and captions, every table (data fallbacks and study
tables), chart keys and source lines, scripts, SVG, the hero's static fallback, video, pull quotes
(lifted from the body), the colophon, and margin notes longer than 80 words. Counted with a real
HTML parser, so extra classes on a table no longer leak it into the count. On 2026-10-08 that gave
fresh-start-myth 3,037 words (13 min, was 16), revenge-game 2,279 (10, was 13),
champagne-no-hangover 3,214 (14, was 18), the-cliff 2,964 (12, was 18).

## The clip (ebk-studio `DeepBagClip`)

Props (write them from the CSVs in the study's export script; see `outputs/web/clip.json`):
`kicker, title, question (*word* = accent), setup, unit, decimals, format ("num" | "pct"),
bars[{label, value, n, emph}], spread{label, note?, mainLabel?, style ("auto" | "rows" | "fan"),
domain?, points[{label?, value, main?}]} (optional), takeaway (*word* = accent), url, source,
accent, motif, duration (12 to 20, default 16)`.

- Values may be negative, positive or mixed. The spread axis is built from the data (zero always
  on it, nice steps, widened until the end labels fit), and each value label sits on the side of
  its dot away from the row labels and the line. `format: "pct"` puts % on every number and tick.
- `style`: "rows" = a few labelled methods (fresh-start, champagne, the-cliff); "fan" = many
  unlabelled specifications, sorted, the `main` one called out with `mainLabel` and the range
  ends labelled (revenge-game's 14 specs). "auto" picks fan for 8+ points or unlabelled ones.
  revenge-game's old `fan` block (with `spread: null`) is read as a fan spread, so its clip.json
  works unchanged; the study-scoped wrapper (`ebk-studio/studies/revenge-game`) is gone.
- `motif`: `field` (football + a trade arc), `stadium` (dotted bowl, crowd wave, a player arcing
  home), `bubbles` (four league lanes of rising bubble columns, caps settling, accent caps),
  `ridges` (aging ridgelines over a waterline, a runner dropping off the front cliff), `plain`.
  If clip.json has none, the render script uses the study default (fresh-start-myth field,
  revenge-game stadium, champagne-no-hangover bubbles, the-cliff ridges) or `--motif`.
- Every motif moves periodically over the clip length and the text beats sit inside safe
  margins (below the brand line in 4:5). The motif dims to half while words are up. Accent areas
  (the spread band) are hatched.

Beats: title + question, setup + bars counting up, the spread, takeaway + URL, fade to the motif
(frame 0 = last frame, so it loops cleanly). Silent, no grain (keeps files small). Render from
`C:\Users\panky\ebk-studio`, sequentially (8 GB RAM), taking the shared lock
`mkdir C:\Users\panky\nfl-higher-lower\.dbx-lock` (rmdir after) because builds and other agents use it:

```
node pipeline/render_deepbag.mjs <study>/outputs/web/clip.json <study>/outputs/video SLUG --only web       # 1280x720 mp4 + webm + poster
node pipeline/render_deepbag.mjs <study>/outputs/web/clip.json <study>/outputs/linkedin SLUG --only linkedin  # 1080x1350 for LinkedIn
node pipeline/render_deepbag.mjs <props> <dir> SLUG --only stills [--frames 60,240,370,430]               # review frames
```

The script bundles `src/formats/deepbag/entry.ts` (Deep Bag compositions only) into
`.bundle-deepbag`, so it never depends on `src/Root.tsx` or races the autopilot's `.bundle`.
The page plays the clip only while half of it is on screen, never under reduced motion
(a play button is always there), and pauses when the tab hides.

## Share card

```
node tools/deep-bag-share.cjs --title "..." --line "..." --stat "-3.5" --stat-label "..." --sport NFL \
     --accent "#3ddc97" --motif field --out reports/share_vN.png
```

`--motif` matches the hero: field, stadium, bubbles, ridges, plain. The script waits for network
idle and for every font face (a card whose fonts did not load is a failure, not written), has
60-120 s timeouts and retries three times with a fresh browser. The cards of 2026-10-08:

| Study | Card | Motif |
|---|---|---|
| fresh-start-myth | `ebk-trade-study\reports\share_v13.png` | field |
| revenge-game | `ebk-revenge-game\reports\share_v06.png` | stadium |
| champagne-no-hangover | `ebk-champions-hangover\reports\share_v06.png` | bubbles |
| the-cliff | `ebk-age-cliff\reports\share_v06.png` | ridges |

(The same PNGs are in `content/deep-bag/<slug>/share.png`, which is what the build publishes.)

## Performance (measured 2026-10-08)

Edge, 1440x900 at DPR 1.5, Sean's Iris Xe (ANGLE D3D11), hero on screen for 6 s, main-thread busy
from CDP `TaskDuration`. Single runs vary by 2 to 3 points with whatever else the PC is doing; a
paired re-run put the-cliff and fresh-start within a point of each other.

| Article | Scene | fps | Main thread | Scene JS / frame | Frames while scrolled away | Initial load (desktop / phone) | After scrolling the whole page |
|---|---|---|---|---|---|---|---|
| fresh-start-myth | trade-field | 30.1 | 6.7% | 0.53 ms | 0 | 567 KB / 389 KB | 2.26 MB |
| revenge-game | return-bowl | 30.1 | 6.3% | 0.56 ms | 0 | 593 KB / 401 KB | 2.41 MB |
| champagne-no-hangover | champagne-bubbles | 30.1 | 6.6% | 0.45 ms | 0 | 657 KB / 466 KB | 3.11 MB |
| the-cliff | cliff-ridges | 30.0 | 7.7% (8.8 / 10.1 paired with flagship 10.7 / 10.0) | 0.64 ms | 0 | 722 KB / 533 KB | 2.47 MB |

Desktop initial load includes three.js (163 KB) because the hero needs it. Phones and reduced
motion never load it at page load (verified); it comes only when a 3D chart is ~1100px away.
The-cliff also loads deep-bag-v2-xcharts.js (42 KB) because its charts start near the top.
Most of the scrolled weight is the clip (webm 0.7 to 1.4 MB) and fonts.

Clips rendered 2026-10-08 (16:9 mp4 / webm / poster, 4:5 LinkedIn mp4): fresh-start-myth
0.90 / 0.70 / 0.07 / 2.43 MB, revenge-game 0.91 / 0.81 / 0.08 / 2.29, champagne-no-hangover
1.38 / 1.44 / 0.08 / 3.68 (bubbles are busy to encode), the-cliff 0.88 / 0.72 / 0.07 / 2.28.


## House rules (the reason v2 exists)

Structure
- No numbered sections, segment badges, TL;DR or "key takeaways" boxes, kicker-dek-byline stacks, emoji, or identical card grids.
- Headings are short, specific and unnumbered. No rhetorical-question headings.
- Every chart, table and video gets a sentence of prose BEFORE it saying what to look for; captions after are optional.
- One accent colour, used for the finding. Everything else is navy, ink and slate.

Writing
- No em dashes. No en dashes used as dashes (ranges are "2002 to 2025"). Negative numbers use the minus sign `&minus;`.
- Banned: "it's not X, it's Y", "not just X but Y", rhythm-only lists of three, "here's the thing", "let's dive in", "the answer might surprise you", "in other words", "ultimately", "crucially", "delve", "tapestry", "landscape", "navigate", "robust" (outside a stats sense), "a testament to", tidy "so what does this mean" wrap-ups, bold lead-ins on every paragraph, every paragraph ending on a punchline, sections of identical length. The publisher warns on most of these.
- Open on a real player and a real moment from the data. Specific names, seasons, numbers. Vary sentence and paragraph length. Have a point of view. State uncertainty plainly in one place instead of hedging every sentence. Use "predicts / is associated with", not causal verbs, when the design is observational.
- "fpts" = fantasy points. Every number comes from the study's CSVs or raw data, checked; log new facts in the study's changelog.

Checks before handing off
- `import` the new version, serve `public/` with `python -m http.server 8101` IN THE BACKGROUND (or the CSP-applying server used in the 2026-10-08 QA), screenshot 1440px and 420px with puppeteer-core + Edge (hero, every chart, the video, the end), read the console, confirm no CSP violations (firebase.json CSP: scripts self + jsDelivr + gstatic; fonts Google; video/images must be self-hosted), check reduced motion, check the other studies still build.
- Grep the article for "—" and the banned phrases. Never overwrite an older article/report version.
