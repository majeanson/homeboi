import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// The fixed-overlay LAYER ORDER (the scale is written out in sheets/capture.css).
// Sibling of field-fit.test.ts / keyboard-fit.test.ts: the same class of bug — a
// stacking rule that is invisible in code review and, when it breaks, does not
// throw. The overlay renders; it just renders UNDERNEATH, so the app looks frozen.
//
// What actually happened, both directions, in one change:
//
//  • `.sheet` sat at 31 because a Sheet only ever opened from ordinary page chrome.
//    NoteEditor's « Pour qui » picker opens one from INSIDE a full-screen scene
//    (.note-editor, 140) — the sheet rendered behind the scene and its buttons were
//    dead. Fixed by lifting .scrim/.sheet over every scene.
//  • That lift immediately broke the OTHER direction: `.confirm` (120/121) carried a
//    comment promising it "sits above any open sheet", which the detail peek relies
//    on — EventPeekActions awaits confirm() with its Sheet still mounted. At 120 the
//    dialog would have opened behind a 156 sheet: scroll locked, nothing to answer.
//
// So the invariant is a SANDWICH, and neither slice can move alone:
//     every full-screen scene  <  .scrim < .sheet  <  confirm / modal / screensaver
//
// The scan below discovers every `position: fixed; inset: 0` overlay that declares a
// z-index, and every one of them must be CLASSIFIED here — below the sheet or above
// it. An unlisted overlay fails the build rather than defaulting to either side.
//
// That "must be classified" is the second lesson, learned an hour after the first:
// the guard's original shape assumed anything already below the sheet was a scene and
// therefore fine. `.tour` sat at 60, so it passed — while being broken, because a tour
// is a TEACHING layer that walks inside the ＋ sheet and the lift had just buried it
// (tour-nav.spec.ts, caught by CI). A green guard proved nothing; only forcing a
// decision per overlay does.

const stylesDir = dirname(fileURLToPath(import.meta.url))

function cssFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) return cssFiles(p)
    return name.endsWith('.css') ? [p] : []
  })
}

// Innermost `selector { body }` pairs (an @media / @container header never matches —
// its inner rules do). Same parser as field-fit.test.ts / keyboard-fit.test.ts.
function rules(css: string): { selector: string; body: string }[] {
  const bare = css.replace(/\/\*[\s\S]*?\*\//g, '')
  const out: { selector: string; body: string }[] = []
  for (const m of bare.matchAll(/([^{}]+)\{([^{}]*)\}/g)) out.push({ selector: m[1].trim(), body: m[2] })
  return out
}

const files = cssFiles(stylesDir)

/** Every `z-index: <n>` declaration in the stylesheets, by selector. */
const zBySelector = new Map<string, { z: number; file: string; body: string }>()
for (const f of files) {
  for (const { selector, body } of rules(readFileSync(f, 'utf8'))) {
    const m = /(?:^|;)\s*z-index\s*:\s*(-?\d+)/.exec(body)
    if (!m) continue
    // First declaration wins — a later `.hub .x` override tweaks size, not layer.
    if (!zBySelector.has(selector)) zBySelector.set(selector, { z: +m[1], file: relative(stylesDir, f), body })
  }
}

function z(selector: string): number {
  const hit = zBySelector.get(selector)
  expect(hit, `no z-index rule found for \`${selector}\` — did the selector get renamed?`).toBeTruthy()
  return hit!.z
}

// Overlays that MUST paint over an open sheet rather than hide behind it: the guided
// tour (a section tour walks INSIDE the ＋ sheet — tour-nav.spec.ts), the two dialogs
// (a heavy delete's yes/no, the generic Modal), the screensaver — which owns the
// screen outright — and the zoom overlay, opened from a peek's own thumbnail.
const ABOVE_SHEET = ['.tour', '.confirm-backdrop', '.kit-modal__backdrop', '.ambient', '.zoom-overlay']

// Full-screen SCENES: a surface the user navigated into, which a sheet opened from
// within it is expected to cover. Adding one here is the decision "a sheet may sit on
// top of this"; if that is wrong for the new surface, it belongs in ABOVE_SHEET.
const BELOW_SHEET = ['.flyer-overlay', '.cook', '.note-editor', '.drawpad']

describe('fixed-overlay layer order', () => {
  it('found the stylesheets', () => {
    expect(files.length).toBeGreaterThan(10)
  })

  it('the sheet paints above its own scrim', () => {
    expect(z('.sheet')).toBeGreaterThan(z('.scrim'))
  })

  // Every full-screen fixed overlay in the stylesheets, discovered rather than listed.
  const overlays = [...zBySelector.entries()]
    .filter(([, v]) => /position\s*:\s*fixed/.test(v.body) && /inset\s*:\s*0/.test(v.body) && v.z > 0)
    .map(([selector, v]) => ({ selector, z: v.z, file: v.file }))

  it('found the overlays (a broken parser must not pass vacuously)', () => {
    expect(overlays.map((o) => o.selector)).toEqual(
      expect.arrayContaining(['.note-editor', '.drawpad', '.scrim', '.tour', '.confirm-backdrop']),
    )
  })

  it('every full-screen overlay is classified — below the sheet, or above it', () => {
    for (const o of overlays) {
      if (o.selector === '.scrim') continue
      expect(
        BELOW_SHEET.includes(o.selector) || ABOVE_SHEET.includes(o.selector),
        `${o.selector} (${o.file}, z-index ${o.z}) is a new full-screen overlay and nothing here says where it sits. ` +
          'Add it to BELOW_SHEET (a scene a sheet opened from within it may cover) or to ABOVE_SHEET ' +
          '(it must paint over an open sheet). See the layer scale in sheets/capture.css.',
      ).toBe(true)
    }
  })

  it('a Sheet opened from inside a full-screen scene lands ON TOP of it', () => {
    for (const sel of BELOW_SHEET) {
      expect(z(sel), `${sel} must sit under .scrim, or it belongs in ABOVE_SHEET`).toBeLessThan(z('.scrim'))
    }
  })

  it('a confirm / modal raised from an OPEN sheet is not painted underneath it', () => {
    // The detail peek awaits confirm() with its Sheet still mounted
    // (components/detail/EventPeekActions.tsx) — this is the live path.
    for (const sel of ABOVE_SHEET) expect(z(sel), `${sel} must clear .sheet`).toBeGreaterThan(z('.sheet'))
    expect(z('.confirm'), 'the dialog must sit above its own backdrop').toBeGreaterThan(z('.confirm-backdrop'))
    // …and a dialog is an answer the tour must not obscure.
    expect(z('.tour'), 'a confirm covers the tour, not the other way round').toBeLessThan(z('.confirm-backdrop'))
  })

  it('the screensaver still owns the screen, over every dialog', () => {
    expect(z('.ambient')).toBeGreaterThan(z('.confirm'))
  })
})
