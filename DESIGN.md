# EBK — Design DNA

**Status: this describes what actually ships.** Rewritten 23 Aug 2026 by the
weekly Studio review. The previous version of this file described a
retro-futurist, chrome-and-acid-yellow, light-mode identity (Unbounded +
Space Grotesk, `--accent-9:#d1b800`) that was dealt by a design generator on
28 July and **was never built**. Nothing in the repo, the live site or the
Instagram templates ever used it. It was quietly misleading every agent that
read this file for the brand, so it has been replaced with the real thing.
The dealt hand is preserved at the bottom for provenance.

---

## The identity in one line

A **dark scoreboard** — deep navy, never black — with **one acid-green accent**
that only ever marks the answer, and heavy condensed type. It should look like
the readout of a machine that knows whether you are right.

## Palette — the single source is `public/css/base.css`

`assets/ebk.css` in the ebk-content skill mirrors these exactly, so the feed and
the product are the same object. Change one, change both.

| Token | Hex | Use |
|---|---|---|
| `--bg` | `#0a0e1c` | The ground. Never flat black — it crushes to nothing on OLED. |
| `--bg-2` | `#121a32` | Lifted background |
| `--panel-1` | `#16203f` | Card surface |
| `--panel-2` | `#1a1530` | Axis chips, secondary surface |
| `--text` | `#f3f6ff` | Body |
| `--muted` | `#9aa6cc` | Support copy. Never the point of a frame. |
| `--accent` | `#3ddc97` | **The** colour. Answers, highlights, the URL. |
| `--accent-ink` | `#06251a` | Text on accent fills |
| `--accent-2` | `#5b7cff` | Head-to-head, secondary data series |
| `--pop` | `#a855f7` | Rare accents only |
| `--lower` | `#ff5d6c` | Wrong, under, out of time |
| `--gold` | `#ffd166` | Leaderboards, records |

**One accent per frame.** If green is doing the work, red is not in the shot.

The acid accent is **green `#3ddc97`**, not the dealt yellow. That decision is
now load-bearing: it is on the live site across ~20 pages, in every published
reel, and in the wordmark's ring. Treat it as locked.

## Type

- **Anton** — hooks, answers, section heads. Condensed, heavy, all caps.
- **Archivo Black** — numbers only. Tabular figures, so counters do not jitter.
- **Inter** — everything else. (The site's own stack resolves to Segoe UI on
  Sean's machine; Inter is the closest thing that renders identically in the
  render container.)

## The wordmark

`E` + a green-ringed `B` + `K`, built in CSS as `.lockup` — no image file, so
it scales cleanly. Wordmark rides with `ELITE BALL KNOWLEDGE` letter-spaced in
`--muted` where there is room, and alone where there is not. Tagline is
**"Prove it."**

**It must survive the crop.** See the 4:5 rule below — this is the constraint
that governs where the mark is allowed to sit in any reel.

---

## The 4:5 rule (added v1, 23 Aug 2026)

Instagram crops a 1080×1920 reel to **4:5 about its centre** for the profile
grid — that is `y 285…1635` — and draws that tile about **129px wide** on a
phone. Everything that has to survive on the profile has to live inside that
window and be legible at that size.

Consequences that are not optional:

1. **Nothing brand-critical above y=330 or below y=1590.** The wordmark sat at
   y=214 until v1 and therefore appeared on *no* profile tile, while also
   sitting under the player's own top gradient.
2. **Compose on y=960, not on the top third.** A block that looks centred in a
   9:16 preview is in the top quarter of the 4:5 tile.
3. **The cover frame is the design.** It is what the profile grid shows
   forever. It must name the specific thing this post is about — if two posts
   in the same format can share a cover, the format is wrong, because nine
   identical tiles give a stranger nothing to click.

## Motion

- Entrances land in **~0.45s**. Slower reads as lag at scroll speed.
- `outExpo` to arrive, `outBack` to land with weight, `inQuad` to leave.
  Everything leaves; things that vanish read as a bug.
- **Cuts, not crossfades.**
- Nothing holds still for more than ~3s. A 1.03–1.05 push-in costs nothing.
- The reveal gets the biggest move in the piece.
- Everything is a pure function of `t`. `requestAnimationFrame`, CSS
  transitions and `@keyframes` flicker in the export — the renderer grabs
  frames out of real time.

## Team identity

**Site:** league and team logos are approved and stay (decision 23 Aug, see
`env.policies.logosOnTheSite`). They are hotlinked to third-party CDNs and are
therefore fragile, not illegitimate.

**Instagram:** **no league marks, no team logos, no player photographs — ever.**
Deliberately stricter than the site, for two reasons that have nothing to do
with the footer: a brand-new account *is* the growth plan and an IP strike
would end the month; and flat type on the palette simply reads better at
thumb-scroll size than a 40px logo. Teams are carried by **name and colour**.
Colour map is in the skill's `references/brand.md`; verify a hex against the
club's own site before using it, and leave a chip untinted rather than tint it
wrong.

## What this should never look like

Stock-footage montages with text over them. Neon gradients, glassmorphism, or
anything not in the palette above. More than one idea per frame. Small type —
if it is not readable in a 320px-wide contact sheet, it is not readable.

---

## Change log

### v1 — 23 Aug 2026 · "the cover has to survive being a thumbnail"

Shipped as `{"mode":"state","key":"design"}` version 1 on `ebkQueue`; the
planner appends `cssOverride` to every 9:16 reel render. Scoped with
`@media (max-aspect-ratio: 3/5)` so 1080×1350 post cards are untouched, and
purely additive — no palette variable is redefined.

Found by rendering the week's two grid reels and tiling their covers into a
simulated profile grid at true thumbnail size. Three failures, all measurable:

| | Before | After |
|---|---|---|
| Wordmark | `y=214` — outside the 4:5 crop, on zero tiles | `y=330` — on every tile |
| Hook block | `y=520`, 126px — top quarter of the tile, ~⅔ of it empty | `y=820`, 150px — centred on `y=960` |
| Hook text | `NAME A PLAYER / WHO DID BOTH` on *every* grid reel | the actual matchup: `PACKERS × / JETS` |
| Sport pill | 30px, illegible at tile size | 38px, wider tracking |
| Shot clock | 170px ring, 88px numerals, floating in dead space | 280px ring, 148px numerals — the loudest object in the countdown |

Rationale for the hook change: the ask (*name a player who did both*) is an
instruction, and it was identical on every cover. The two team names are the
interesting part, they are different every single day, and they turn the
profile grid from nine copies of one tile into nine different questions. The
ask now lives in the caption and in the reel's own board beat.

**Do not undo without saying why here.** Reverting `.topbar` to 214 puts the
wordmark back outside the crop; reverting the hook string makes every cover
identical again.

### v0 — the dealt hand (never built, kept for provenance)

design-for-ai dealer, project `ebk-brand`, 2026-07-28, reroll 1, pin
family=retro-futurist. Family: Retro-Futurist (Y2K bright: chrome/silver
neutrals + one acid accent). Composition: Split Stage. Hue: dealt 99.18 acid
yellow (`--accent-9:#d1b800`), with swap candidates seed 128 acid green
(`#91ce00`) and seed 25 signal red (`#ff002b`). Display: Unbounded; body:
Space Grotesk. Signature: baseline ruler as yard lines. Texture engine:
Phosphor Stadium generative system. Research brief:
`.design-foundations/research/2026-07-28-ebk-refresh.md`.

What actually shipped kept exactly one idea from that hand — *dark surface plus
a single acid accent* — and rejected the rest. The green in the live product
(`#3ddc97`) is not the dealt green (`#91ce00`); it was chosen against the navy
and is what every asset now uses.
