import { dirname, join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { sourceFiles, readScanned } from './buildGuardScan'

// THE LENS RULE (2026-11-05, wave 0.3 of plans/2026-11-05-SOLIDIFY.md) — sibling of
// chip-rule / img-rule: the same fail-closed shape over the shared scanner.
//
// `lib/audience.ts` `useLens()` is the ONE place that says what each audience may see
// and do (teaches · interrupts · acts · spoken, plus the three view flags). Before it,
// 46 sites compared `audience === '…'` for themselves and the `simple` lens was gated
// by accident — three sites let it see help, six hid the edit doors from it, and no
// file knew about the other. A surface that compares the string again is a fork of
// that decision, so it fails here; it reads a flag and thereby NAMES what it gates.
//
// Two shapes are caught:
//   1. `audience === 'toddler'` / `'parent' !== audience` … outside the three files
//      that legitimately hold the raw value (the hook itself, the boot in main.tsx, the
//      Réglages switch that SETS it).
//   2. a threaded prop or local spelled `kid` / `isToddler` — the flag is `toddler`,
//      one name, so a reader never wonders whether `kid` means the lens or a person.

const srcDir = join(dirname(fileURLToPath(import.meta.url)), '..')
const rootDir = join(srcDir, '..')
const rel = (f: string) => relative(rootDir, f).split(sep).join('/')

// file → why the raw value is compared there.
const ALLOWED = new Map<string, string>([
  ['src/lib/audience.ts', 'the hook that DEFINES the flags'],
  ['src/main.tsx', 'boot: stamps data-lens on <html> before React renders'],
  ['src/components/operator/display.tsx', 'the Réglages switch — it SETS the audience and shows which is active'],
])

const COMPARE = /\baudience\s*[!=]==\s*'(parent|toddler|simple)'|'(parent|toddler|simple)'\s*[!=]==\s*audience\b/g
const BAD_NAME = /\b(kid|isToddler)\s*(?::\s*boolean|=\s*audience|=\{)/g

interface Site { file: string; line: number; text: string }

function scan(re: RegExp): Site[] {
  const out: Site[] = []
  for (const f of sourceFiles(srcDir)) {
    const file = rel(f)
    if (ALLOWED.has(file)) continue
    const src = readScanned(f)
    for (const m of src.matchAll(re)) {
      const line = src.slice(0, m.index).split('\n').length
      out.push({ file, line, text: m[0] })
    }
  }
  return out
}

describe('lens rule', () => {
  it('no surface compares `audience` to a string — it reads a useLens() flag and names what it gates', () => {
    const bad = scan(COMPARE)
    expect(
      bad.map((s) => `${s.file}:${s.line}  ${s.text}`).join('\n'),
      'pick the flag: toddler/simple/parent to choose a VIEW; teaches for the help layer; interrupts for an uninvited prompt; acts for an edit/share door; spoken for tap-to-hear',
    ).toBe('')
  })

  it('the lens flag is spelled `toddler`, never `kid` or `isToddler`', () => {
    const bad = scan(BAD_NAME)
    expect(bad.map((s) => `${s.file}:${s.line}  ${s.text}`).join('\n')).toBe('')
  })

  it('every ALLOWED file still compares the raw value (a stale exemption is a silent hole)', () => {
    for (const [file] of ALLOWED) {
      const src = readScanned(join(rootDir, file))
      expect(COMPARE.test(src), `${file} no longer compares audience — drop it from ALLOWED`).toBe(true)
      COMPARE.lastIndex = 0
    }
  })
})
