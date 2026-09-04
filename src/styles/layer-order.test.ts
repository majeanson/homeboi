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
// The scan below is self-maintaining on purpose: it discovers every `position:
// fixed; inset: 0` overlay that declares a z-index, so a NEW scene is caught without
// anyone remembering to list it. A new overlay is either below the sheet (a scene)
// or named in ABOVE_SHEET (a dialog that must interrupt one) — there is no third
// answer, and picking one is the decision this guard exists to force.

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

// Overlays that MUST interrupt an open sheet rather than hide behind it: the two
// dialogs (a heavy delete's yes/no, the generic Modal), the screensaver — which owns
// the screen outright — and the zoom overlay, opened from a peek's own thumbnail.
const ABOVE_SHEET = ['.confirm-backdrop', '.kit-modal__backdrop', '.ambient', '.zoom-overlay']

describe('fixed-overlay layer order', () => {
  it('found the stylesheets', () => {
    expect(files.length).toBeGreaterThan(10)
  })

  it('the sheet paints above its own scrim', () => {
    expect(z('.sheet')).toBeGreaterThan(z('.scrim'))
  })

  it('a Sheet opened from inside a full-screen scene lands ON TOP of it', () => {
    // Every full-screen fixed overlay in the stylesheets, discovered not listed.
    const overlays = [...zBySelector.entries()]
      .filter(([, v]) => /position\s*:\s*fixed/.test(v.body) && /inset\s*:\s*0/.test(v.body) && v.z > 0)
      .map(([selector, v]) => ({ selector, z: v.z, file: v.file }))
    // Sanity: the scan really is finding them (a broken parser would pass vacuously).
    expect(overlays.map((o) => o.selector)).toEqual(expect.arrayContaining(['.note-editor', '.drawpad', '.scrim']))

    const scenes = overlays.filter((o) => o.selector !== '.scrim' && !ABOVE_SHEET.includes(o.selector))
    for (const s of scenes) {
      expect(
        s.z,
        `${s.selector} (${s.file}, z-index ${s.z}) is a full-screen overlay at or above .scrim (${z('.scrim')}). ` +
          'Either lower it below the sheet — a scene a sheet can cover — or add it to ABOVE_SHEET here, ' +
          'which means it must also be able to interrupt an open sheet. See the layer scale in sheets/capture.css.',
      ).toBeLessThan(z('.scrim'))
    }
  })

  it('a confirm / modal raised from an OPEN sheet is not painted underneath it', () => {
    // The detail peek awaits confirm() with its Sheet still mounted
    // (components/detail/EventPeekActions.tsx) — this is the live path.
    for (const sel of ABOVE_SHEET) expect(z(sel), `${sel} must clear .sheet`).toBeGreaterThan(z('.sheet'))
    expect(z('.confirm'), 'the dialog must sit above its own backdrop').toBeGreaterThan(z('.confirm-backdrop'))
  })

  it('the screensaver still owns the screen, over every dialog', () => {
    expect(z('.ambient')).toBeGreaterThan(z('.confirm'))
  })
})
