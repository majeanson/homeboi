import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// The keyboard-fit conventions (core.css "Keyboard fit" block + lib/viewportVars)
// exist because each of these mistakes shipped and failed on a real device in
// July 2026. Like calm-tenets.test.ts, this makes the convention structural:
//
// 1. NEVER shrink a fixed shell to the visible band under `.kb-open`
//    (`height: var(--vvh)`) — it un-covers the strip the keyboard overlays,
//    turning it into a live, scrollable window onto the page behind. The fix is
//    CONTENT padding (--vvt / --kb) on a full-size shell.
// 2. That fit padding is defined ONCE, in core.css — a new surface joins the
//    grouped selector there (or carries .vv-fit/.vv-slack), it doesn't fork a
//    copy that will drift.
//
// (The matching runtime guards live in e2e/keyboard.spec.ts — strip-ownership
// elementFromPoint probes — and e2e/note-editor.spec.ts — slack ≥ 100px.)

const stylesDir = join(dirname(fileURLToPath(import.meta.url)))

function cssFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) return cssFiles(p)
    return name.endsWith('.css') ? [p] : []
  })
}

// Innermost `selector { body }` pairs — enough for our flat rules (an @media
// header simply never matches, its inner rules do).
function rules(css: string): { selector: string; body: string }[] {
  const bare = css.replace(/\/\*[\s\S]*?\*\//g, '') // comments would pollute selectors
  const out: { selector: string; body: string }[] = []
  for (const m of bare.matchAll(/([^{}]+)\{([^{}]*)\}/g)) out.push({ selector: m[1].trim(), body: m[2] })
  return out
}

describe('keyboard fit conventions', () => {
  const files = cssFiles(stylesDir)

  it('found the stylesheets', () => {
    expect(files.length).toBeGreaterThan(10)
  })

  it('no .kb-open rule shrinks a fixed shell (height: var(--vvh) is the banned form)', () => {
    const offenders: string[] = []
    for (const f of files) {
      for (const r of rules(readFileSync(f, 'utf8'))) {
        if (!r.selector.includes('.kb-open')) continue
        if (/(^|[^-])height\s*:\s*var\(--vvh/.test(r.body)) offenders.push(`${relative(stylesDir, f)} → ${r.selector}`)
      }
    }
    expect(offenders, 'shrink the CONTENT with padding (core.css "Keyboard fit"), never the shell').toEqual([])
  })

  it('the fit padding is defined once — in the core.css "Keyboard fit" block', () => {
    const declaring: string[] = []
    for (const f of files) {
      for (const r of rules(readFileSync(f, 'utf8'))) {
        if (r.selector.includes('.kb-open') && /padding-top\s*:\s*var\(--vvt/.test(r.body)) declaring.push(relative(stylesDir, f))
      }
    }
    expect(declaring, 'a new surface joins the grouped selector in core.css, it does not fork a copy').toEqual(['core.css'])
  })

  // 2026-09-24, from Marc's phone: « the keyboard covers the field or the Save button ».
  // The centred dialogs had NO keyboard rule at all — centred on the full screen, their
  // buttons landed under the keyboard — and the bottom sheet lifted by --kb, which under
  // iOS's viewport glue under-lifts by the pan. Three facts, each held here.
  it('a centred dialog fits the VISIBLE band under the keyboard (Modal + confirm)', () => {
    const all = files.flatMap((f) => rules(readFileSync(f, 'utf8')))
    for (const box of ['.kit-modal', '.confirm']) {
      const r = all.find((r) => r.selector.includes('.kb-open') && r.selector.includes(box) && !r.selector.includes('backdrop'))
      expect(r, `${box} has no .kb-open rule`).toBeDefined()
      expect(r!.body, `${box} must cap its height to the visible band`).toMatch(/max-height\s*:\s*calc\(var\(--vvh/)
    }
    // The Modal centres its box with flex inside its backdrop: the backdrop must be in
    // the core.css fit group, so the centring happens inside the visible band.
    const core = readFileSync(join(stylesDir, 'core.css'), 'utf8')
    const group = rules(core).find((r) => r.selector.includes('.kb-open') && /padding-top\s*:\s*var\(--vvt/.test(r.body))
    expect(group?.selector).toContain('.kit-modal__backdrop')
  })

  it('the bottom sheet lifts by --kb-fixed (glue-corrected), never by --kb alone', () => {
    const capture = readFileSync(join(stylesDir, 'sheets', 'capture.css'), 'utf8')
    const shown = rules(capture).find((r) => r.selector.trim() === '.sheet.show')
    expect(shown?.body).toMatch(/bottom\s*:\s*var\(--kb-fixed/)
  })

  it('core.css publishes the .vv-fit / .vv-slack opt-in utilities', () => {
    const core = readFileSync(join(stylesDir, 'core.css'), 'utf8')
    const fit = rules(core).find((r) => r.selector.includes('.vv-fit'))
    const slack = rules(core).find((r) => r.selector.includes('.vv-slack'))
    expect(fit?.selector).toContain('.kb-open')
    expect(fit?.body).toMatch(/padding-bottom\s*:\s*var\(--kb/)
    expect(slack?.selector).toContain('.kb-open')
    // The slack must clear the iOS floating accessory pill (~64px) + caret pad.
    const px = slack?.body.match(/padding-bottom\s*:\s*(\d+)px/)
    expect(Number(px?.[1] ?? 0)).toBeGreaterThanOrEqual(100)
  })
})
