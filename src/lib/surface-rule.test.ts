import { readFileSync } from 'node:fs'
import { dirname, join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { readScanned, sourceFiles } from './buildGuardScan'

// THE SURFACE RULE (solidify plan, wave 6.6 — CLAUDE.md « Device role / presentation
// lens: useSurface() / useLens() … don't branch on width »).
//
// What a screen SHOWS is decided by the device's role (kiosk vs mobile, lib/surface) and
// the audience lens (lib/audience), plus CSS for the layout. A wall tablet in portrait is
// as narrow as a big phone; a phone in landscape is as wide as a small tablet. A
// component that reads the window width to decide what to render ties behaviour to a
// number that says nothing about who is holding the screen — and it gets it wrong on
// exactly the cheap kiosk this app is for.
//
// Reading the viewport is not always that, so the rule is about SHAPE:
//   · a preference query — `matchMedia('(prefers-…)')`, `matchMedia('(display-mode: …)')`
//     — asks the user's or the OS's setting, not the size: allowed anywhere;
//   · `innerWidth` / `innerHeight` / `screen.width|height` / `outerWidth`, and any
//     matchMedia with a width/height query or a non-literal argument, need their FILE in
//     ALLOWED with the reason. Positioning math (keep a bubble on screen, scale a cast
//     frame) is the usual one. FAIL-CLOSED, and a stale entry fails too.

const srcDir = join(dirname(fileURLToPath(import.meta.url)), '..')
const rootDir = join(srcDir, '..')

const ALLOWED = new Map<string, string>([
  ['src/lib/motion.ts', 'positioning: « is the landed row on screen yet? » after a scroll glide'],
  ['src/lib/viewportVars.ts', 'THE visual-viewport reader (keyboard fit, --vvh) — the one place that measures it'],
  ['src/components/GlossaryTerm.tsx', 'positioning: clamps the definition bubble inside the window'],
  ['src/components/RemarkComposer.tsx', 'positioning: clamps the composer beside the tapped element'],
  ['src/components/tour/TourOverlay.tsx', 'positioning: places the coachmark beside its anchor'],
  ['src/pages/CastPage.tsx', 'positioning: scales the fixed-size board frame to the TV it is cast on'],
  [
    'src/lib/curatedBoard.ts',
    'content AMOUNT, not role: a trial visitor on a phone-width window sees five cards instead of the whole ' +
      'masonry (stranger review 2026-10-23) — and a rotated tablet should flip it too, which surface cannot say',
  ],
])

// A width-dependent read: the window/screen dimensions, or a matchMedia that is not a
// preference query.
export function sizeReads(src: string): { line: number; text: string }[] {
  const out: { line: number; text: string }[] = []
  const push = (at: number) => out.push({ line: src.slice(0, at).split('\n').length, text: src.slice(at, at + 60).split('\n')[0]! })
  for (const m of src.matchAll(/\b(?:innerWidth|innerHeight|outerWidth|outerHeight)\b|\bscreen\.(?:width|height|availWidth|availHeight)\b/g)) push(m.index ?? 0)
  for (const m of src.matchAll(/\bmatchMedia\(\s*(['"\x60]\(\s*(?:prefers-|display-mode)[^'"\x60]*['"\x60])?/g)) {
    if (m[1]) continue // a preference query
    // `typeof matchMedia === 'function'` guards are not calls; only `matchMedia(` reaches here.
    push(m.index ?? 0)
  }
  return out.sort((a, b) => a.line - b.line)
}

describe('the surface rule (what renders follows surface/lens — never the window width)', () => {
  it('the detector sees every size read and passes preference queries', () => {
    const fixture = [
      `if (window.innerWidth < 700) return <Phone />`, // ← line 1
      `const mq = window.matchMedia('(max-width: 699px)')`, // ← line 2
      `window.matchMedia(QUERY)`, // ← line 3
      `window.matchMedia('(prefers-reduced-motion: reduce)').matches`,
      `matchMedia('(display-mode: standalone)').matches`,
      `const w = screen.width`, // ← line 6
      `el.offsetWidth`,
      `typeof window.matchMedia === 'function'`,
    ].join('\n')
    expect(sizeReads(fixture).map((h) => h.line)).toEqual([1, 2, 3, 6])
  })

  it('no width-dependent read outside an ALLOWED file', () => {
    const offenders: string[] = []
    for (const f of sourceFiles(srcDir)) {
      const file = relative(rootDir, f).split(sep).join('/')
      if (ALLOWED.has(file)) continue
      for (const hit of sizeReads(readScanned(f))) offenders.push(`${file}:${hit.line} ${hit.text}`)
    }
    expect(
      offenders,
      'Pick what renders from useSurface() / useLens() (lib/surface, lib/audience) and lay it out with CSS ' +
        '(the canonical breakpoints, or a container query). If this read is positioning math or a deliberate ' +
        'content-amount choice, add the file to ALLOWED with the reason.',
    ).toEqual([])
  })

  it('every ALLOWED file still reads the viewport (a stale exception is an unwatched door)', () => {
    for (const [file, why] of ALLOWED) {
      expect(why.length, `${file}: the reason is the point`).toBeGreaterThan(10)
      const src = readFileSync(join(rootDir, file), 'utf8')
      expect(sizeReads(src).length + (/visualViewport/.test(src) ? 1 : 0), `${file} no longer reads the viewport — drop it from ALLOWED`).toBeGreaterThan(0)
    }
  })
})
