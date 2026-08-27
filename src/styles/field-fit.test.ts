import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// The field-fit conventions (pages/fields.css « A labeled CTA never squeezes the
// text » + the --gutter token in core.css). Sibling of keyboard-fit.test.ts: the
// same class of bug — a layout rule that is INVISIBLE when it breaks, because the
// surface still renders, just with the content squeezed out of it.
//
// What shipped, twice: a composer's labeled submit rode beside the box on one
// line and could never wrap, because `flex: 1 1 10rem` under-reports the box's
// width so the wrap never triggers (the fixed-flex-basis trap CLAUDE.md names
// under « Horizontal overflow »). On a 390px phone the ＋ sheet's « Restants » row
// spent ~178px on « ＋ À finir bientôt » and left ~60px of typing width — the
// placeholder clipped to « Ajouter un ». It was fixed once by hand for board
// cards (`.bento .edit-field__box`) and never generalized.
//
// So, structurally:
//
// 1. The row IS the container — delete that one declaration and every stacked
//    composer silently reverts to the squeezed layout.
// 2. A narrow container gives the box the whole line and drops the CTA beneath.
// 3. A fixed rem/px flex basis on the box is the trap itself: allowed only where
//    a dense one-line row deliberately opts out (and is listed here).
// 4. A committed surface's side margin comes from --gutter, so the sheet and the
//    scenes can't drift apart — or quietly re-widen on a small phone.
//
// (The runtime half lives in e2e/composer-fit.spec.ts — the per-composer
// input-width FLOOR, which only ever moves up. See LEAN.md « Generous inside ».)

const stylesDir = join(dirname(fileURLToPath(import.meta.url)))

function cssFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) return cssFiles(p)
    return name.endsWith('.css') ? [p] : []
  })
}

// Innermost `selector { body }` pairs (an @media / @container header never
// matches — its inner rules do). Same parser as keyboard-fit.test.ts.
function rules(css: string): { selector: string; body: string }[] {
  const bare = css.replace(/\/\*[\s\S]*?\*\//g, '')
  const out: { selector: string; body: string }[] = []
  for (const m of bare.matchAll(/([^{}]+)\{([^{}]*)\}/g)) out.push({ selector: m[1].trim(), body: m[2] })
  return out
}

// Dense one-line rows that deliberately opt out of wrapping. A new entry here is
// a decision ("this row is not a composer"), not a formality.
const NOWRAP_ALLOWED = ['.deck__card .edit-field__row']
// Hosts allowed to pin the box to a fixed basis, for the same reason.
// (The primitive's own base rule in pages/fields.css is the shrink-friendly
// default for a row with no labeled CTA; the @container rule overrides it where
// it would bite. Every OTHER host is the fork this guard exists to catch.)
const FIXED_BASIS_ALLOWED = ['.edit-field__box', '.deck__card .edit-field__box']

describe('field fit conventions', () => {
  const files = cssFiles(stylesDir)
  const fields = readFileSync(join(stylesDir, 'pages', 'fields.css'), 'utf8')

  it('found the stylesheets', () => {
    expect(files.length).toBeGreaterThan(10)
  })

  it('the ROW is the size container (that one line is what makes the rule work)', () => {
    const row = rules(fields).find((r) => r.selector === '.edit-field__row')
    expect(row?.body, 'pages/fields.css must keep `container: edit-field / inline-size` on .edit-field__row').toMatch(
      /container\s*:\s*edit-field\s*\/\s*inline-size/,
    )
  })

  it('a narrow container gives a labeled CTA its own line', () => {
    expect(fields, 'the @container query is the fix — see « A labeled CTA never squeezes the text »').toMatch(
      /@container\s+edit-field\s*\(max-width:\s*30rem\)/,
    )
    const box = rules(fields).find((r) => r.selector === '.edit-field--cta .edit-field__box')
    expect(box?.body, 'the box must take the whole line under a narrow container').toMatch(/flex-basis\s*:\s*100%/)
    const submit = rules(fields).find((r) => r.selector === '.edit-field--cta .edit-field__submit')
    // `flex` (not `width: 100%`) so the CTA still shares that second line with a
    // trailing ✕ / 🔍 / a second CTA when they fit.
    expect(submit?.body, 'the CTA drops beneath the field and grows to fill it').toMatch(/flex\s*:\s*1\s+1\s/)
  })

  it('no host pins the field box to a fixed basis (the trap), outside the dense-row allowlist', () => {
    const offenders: string[] = []
    for (const f of files) {
      for (const r of rules(readFileSync(f, 'utf8'))) {
        if (!r.selector.includes('.edit-field__box')) continue
        if (FIXED_BASIS_ALLOWED.includes(r.selector)) continue
        // A basis in rem/px that isn't 0 or 100% is the under-reporting form.
        if (/flex(-basis)?\s*:\s*(\d+\s+\d+\s+)?\d*\.?\d+(rem|px)/.test(r.body))
          offenders.push(`${relative(stylesDir, f)} → ${r.selector}`)
      }
    }
    expect(offenders, 'a fixed basis smaller than the content stops the row wrapping — let it be 100% or auto').toEqual([])
  })

  it('no composer row is pinned nowrap outside the dense-row allowlist', () => {
    const offenders: string[] = []
    for (const f of files) {
      for (const r of rules(readFileSync(f, 'utf8'))) {
        if (!r.selector.includes('.edit-field__row')) continue
        if (NOWRAP_ALLOWED.includes(r.selector)) continue
        if (/flex-wrap\s*:\s*nowrap/.test(r.body)) offenders.push(`${relative(stylesDir, f)} → ${r.selector}`)
      }
    }
    expect(offenders, 'a composer that cannot wrap cannot give its field a full line').toEqual([])
  })

  it('--gutter is declared once and owns every committed surface\u2019s side margin', () => {
    const core = readFileSync(join(stylesDir, 'core.css'), 'utf8')
    expect(core, 'core.css declares the token').toMatch(/--gutter\s*:\s*\d+px/)
    // The narrow-phone step-down is the point of the token: 22px a side costs
    // 44px of a 390px screen.
    expect(core).toMatch(/@media\s*\(max-width:\s*400px\)\s*\{\s*:root\s*\{\s*--gutter/)

    const surfaces: [string, string][] = [
      ['sheets/capture.css', '.sheet'],
      ['sheets/scene.css', '.scene__head'],
      ['sheets/scene.css', '.scene__body'],
    ]
    for (const [file, selector] of surfaces) {
      const r = rules(readFileSync(join(stylesDir, ...file.split('/')), 'utf8')).find((x) => x.selector === selector)
      expect(r?.body, `${selector} must take its side margin from var(--gutter)`).toMatch(
        /padding\s*:[^;]*var\(--gutter\)/,
      )
    }
  })
})
