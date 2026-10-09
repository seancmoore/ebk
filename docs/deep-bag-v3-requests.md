
## Reading layout (2026-10-09, layout agent)

1. **Phone version of the study clip.** On a 390px phone the 16:9 clip is 390x219 and its smallest words (row labels, the "fpts per game" line) render around 7px. The clip now runs edge to edge on phones (no rounded frame, play button moved to the top corner where the clip has no words), but the words are still small. Request: in each article's `<video>`, add a 4:5 (or 1:1) source ahead of the 16:9 ones, e.g. `<source media="(max-width: 760px)" src="../outputs/linkedin/SLUG_4x5.webm" type="video/webm">` plus an mp4 twin, and a matching `poster` choice. Without it the 16:9 clip keeps playing (works, just small). Note the frame's CSS is `aspect-ratio: 16/9`; if a 4:5 source is added, also add `class="is-tall-on-phone"` to `.v2-film-frame` and the CSS will switch it to 4:5 under 760px (rule already in deep-bag-v2.css).
2. **Non-breaking hyphen in hyphenated titles (optional).** At 360px "The Fresh-Start Myth" balances to "The Fresh- / Start Myth". Writing the title as `Fresh&#8209;Start` keeps the compound together ("The / Fresh-Start Myth"). Purely cosmetic.

## the-cliff hero scene (2026-10-09, the-cliff 3D agent)

1. **`ctx.renderer` for scenes.** The scene API hands a scene no renderer, so a scene cannot build a PMREM environment (RoomEnvironment-style lighting) or pick its tone mapping. `cliff-ridges.js` works around it inside its own file: `scene.onBeforeRender` captures the renderer on the first frame (and sets ACES tone mapping before any material compiles), the scene stays hidden for that frame, and the PMREM environment is built on the second `update()`. Request: pass `renderer` in `ctx` (and maybe `toneMapping` in opts) so other scenes need no hook. Nothing else in the API blocked this work.
2. **Phones.** Phones still skip the WebGL scene (gating in deep-bag-v2.js). the-cliff now ships a 2x WebP still of its own scene as the `.v2-hero-fallback.is-custom` (two `<img>`, wide and tall, chosen by aspect ratio), which also covers reduced motion and no-WebGL.

## champagne-no-hangover hero (champagne-bubbles rewrite, 2026-10-09)
- **ctx.renderer, please.** The scene needs the renderer for a PMREM studio environment, ACES tone mapping and a
  4x MSAA half-float target (the core renders with antialias off). Worked around inside the scene file: it takes
  the renderer from `scene.onBeforeRender` on the first frame, redirects the main render into its own target and
  blits it (tone-mapped) in `scene.onAfterRender`. A `ctx.renderer` (or `antialias`/`toneMapping` opts) in the core
  would make that hack unnecessary.
- **fps below 30 snaps to 20.** With the 60 Hz rAF and `now - last < minDt - 1`, any `opts.fps` from 21 to 29 runs at
  20 fps. The article passes `data-scene-opts='{"fps":24}'` (effective 20) to keep the 3D still life near budget.
- **Phones.** The core never runs a scene on coarse-pointer phones; the study ships a 2x WebP still rendered from the
  scene (`cn-hero-wide.webp` / `cn-hero-tall.webp` in a `<picture>` inside `.v2-hero-fallback.is-custom`), which
  also serves reduced motion, no-WebGL and low-power. The `<source srcset>` is only rewritten by the publisher because
  the same path also appears in a `<link rel="preload" href>`; collecting `srcset` in `LOCAL_REF` would be cleaner.
- **Docs.** The table row for `champagne-bubbles` in deep-bag-v2.md is stale: data is now optional (confetti count
  and gold share), opts are `seed`, `confetti`, `still {t, morning}`, `fitW`, `fitFloor`, `caption`; the clip motif
  is `champagne` (ebk-studio `src/formats/deepbag/motifs/champagne.tsx`).

## fresh-start-myth hero (trade-desk, 2026-10-09, fresh-start 3D agent)
- **Register `trade-desk` as a built-in.** The scene lives at `public/js/deep-bag-v2-scenes/trade-desk.js`, but
  `BUILT_IN_MODULES` in the core only lists the other three, so article_v15 names it with
  `data-scene-src="/js/deep-bag-v2-scenes/trade-desk.js"` (absolute, so the publisher leaves it alone; no `?v=`
  cache-busting). Adding `"trade-desk": 1` to `BUILT_IN_MODULES` would let the markup drop `data-scene-src`.
  The built-in `trade-field` is no longer used by any study.
- **ctx.renderer** (same as the-cliff and champagne): trade-desk captures it in `scene.onBeforeRender`, sets ACES,
  builds a procedural studio PMREM on the second frame. An `antialias` opt would also help; edges are softened
  with alpha borders in the canvas textures instead.
- **Layout hand-off.** trade-desk measures `.v2-title` and `.v2-standfirst` (ResizeObserver) and fits the jersey,
  papers and depth chart into the free bands beside / under / above the type, so a hero layout change needs no scene
  change. It adds one study-scoped rule: `.td-hero::after { height: 12% }` (shorter melt; the papers sit at the
  bottom edge).
- **Docs.** The scene table in deep-bag-v2.md should gain `trade-desk` (fresh-start-myth, no data, no opts; QA hooks
  `window.__tradeDesk.seek(t) / .scroll(v) / .box([x0,x1,yTop,yBot]) / .pixelRatio(v)`), the clip motif `trade`, and
  `--art outputs/web/hero/trade-desk-share-art.png` for the share card.
