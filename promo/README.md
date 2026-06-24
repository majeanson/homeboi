# Promo & how-to videos

A two-stage, code-driven pipeline that turns **real in-app screens** into polished
promo / how-to videos. Both stages are deterministic and re-runnable: change the app
or a script, re-capture, re-render — no timeline to hand-edit.

```
promo/
  scripts/                 # PromoScript definitions — the single source of truth per video
    types.ts               #   Beat / PromoScript types
    tour.ts                #   the flagship ~60s showcase tour
    howto-kitchen.ts       #   example step-numbered how-to (clone this per feature)
    index.ts               #   SCRIPTS[] the capture rig shoots
  capture/                 # STAGE 1 — Playwright (reuses the e2e harness)
    promo.config.ts        #   separate Playwright config (own dev server reuse)
    capture.spec.ts        #   shoots retina stills + writes manifest.json
  remotion/                # STAGE 2 — Remotion (isolated package, own node_modules)
    src/                    #   compositions + components (DeviceFrame, Caption, …)
    public/captures/<id>/   #   GENERATED: PNG frames + manifest.json  (gitignored)
    public/music/           #   drop a calm track here (gitignored)
    out/                    #   GENERATED: rendered .mp4s  (gitignored)
    render-all.mjs          #   render every captured script × orientation × language
```

## How it works

1. A **`PromoScript`** (`promo/scripts/*.ts`) is a list of *beats*: a route to shoot,
   a bilingual caption, a hold duration, optional seed overrides (theme/audience), and
   optional click choreography.
2. **Capture** drives the frontend-only Vite dev server with the deterministic `/api`
   stubs from `e2e/mocks.ts` (same harness as the visual e2e sweep). For each content
   beat it shoots **both surfaces × both languages** at `deviceScaleFactor: 2`:
   - `wall`  → kiosk @ 1280×800  → the 16:9 landscape video
   - `phone` → mobile @ 390×844  → the 9:16 vertical video
   - `fr` / `en` → so the localized render shows localized UI.
   It writes the PNGs + a `manifest.json` into `remotion/public/captures/<id>/`.
3. **Compose** (Remotion) reads only that manifest + PNGs (no app imports). One
   composition per `script × orientation × language × cut` (e.g.
   `tour-landscape-fr-full`, `tour-vertical-en-short`), framing each still in a device
   bezel with motion (see below), bilingual captions, crossfade/slide transitions, and
   optional music.

### Motion: taps, highlight rings, zooms

A beat can pin **annotations** to real elements and request a **targeted zoom**:

```ts
{
  id: '08-liste', route: '/liste', surfaces: ['wall', 'phone'],
  annotations: [{ target: '.list-row__main', kind: 'tap', label: { fr: 'Coche', en: 'Check' } }],
  zoom: { target: '.now-card--supper', to: 1.9 },   // or { rect: {x,y,w,h}, to }
  caption: { ... },
}
```

At capture, the rig resolves each `target` selector to a bounding box and stores it
**normalized to the viewport**, per surface. Remotion renders the screenshot and the
annotations **inside the same transformed layer**, so a `tap` ripple / `ring` outline /
`zoom` push all stay locked to the element as it moves. Tips:

- Prefer stable selectors — `[data-tour="…"]`, `aria-label`, semantic classes.
- If a target is below the fold, scroll it in with an `action` (see `14-customize`).
- A missing target is logged and skipped — it never breaks the render.
- Motion is deliberately calm (slow eases, single soft ripples) per the brief's tenet.

### Cuts (long + short)

A script can declare `cuts: ['full', 'short']`. Beats flagged `short: true` form the
auto-trimmed short cut; everything is the full cut. Each cut renders as its own
composition (`…-full` / `…-short`). `render-all.mjs` renders only the cuts a script
declares.

## Usage

```bash
# STAGE 1 — capture (from the repo root; reuses @playwright/test already installed)
npm run promo:capture                 # all scripts → remotion/public/captures/*

# STAGE 2 — compose (isolated package; install once)
cd promo/remotion
npm install
npm run studio                        # live preview/scrub all compositions
npm run render                        # render everything → out/*.mp4
node render-all.mjs tour              # render only ids containing "tour"
# or a single composition:
npx remotion render tour-landscape-fr out/tour-landscape-fr.mp4
```

Outputs: `out/tour-landscape-fr-full.mp4`, `out/tour-vertical-en-short.mp4`, etc.

## Add a new video

1. Create `promo/scripts/<id>.ts` exporting a `PromoScript` (clone `howto-kitchen.ts`).
   Lift bilingual copy from the in-app Guide (`src/lib/guideContent.ts` —
   `GuideEntry.points[].detail` is the how-to step, `.why` the value prop).
2. Add it to `promo/scripts/index.ts`.
3. Add its `id` to `promo/remotion/src/scripts.ts` (`SCRIPT_IDS`).
4. `npm run promo:capture` then render.

## Notes & limits

- **Isolated from the app build.** `tsc -b` only compiles `src` / `functions` /
  `worker`, so nothing here can redden CI or bloat the deployed Worker bundle. The
  capture rig is a *separate* Playwright config — it is **not** part of `npm run e2e`.
- **Captions are baked in** (chosen: no voiceover). To add narration later, the beats
  already carry text + per-beat durations — feed them to a TTS step and add an
  `<Audio>` per `Series.Sequence`.
- **Motion is synthesized** from stills (Ken Burns + transitions). For beats where real
  motion matters (drag-reorder, the screensaver fade, day-part drift), capture a short
  `recordVideo` clip in the spec and swap the `<Img>` for `<OffthreadVideo>` in `Beat`.
- **Click choreography**: a beat can pass an `action(page, surface)` to open a sheet /
  scroll / tap before the shot. Keep selectors resilient (prefer `getByText`).
