import { readFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { describe, expect, it } from 'vitest'
import { sourceFiles, blankComments } from './buildGuardScan'

// A FACE IS DRAWN BY Avatar (solidify 2.2, 2026-11-05). Eight surfaces drew their own
// disc beside components/Avatar.tsx — « the first letter of the name, upper-cased, on
// the member's colour, or the photo » — because Avatar took an R2 key where they held
// a URL, or because they needed their own class for size and overlap. Avatar takes
// `photoUrl`, `className` and `decorative` now, and every copy folded onto it. The
// idiom that gave the copies away is the initial fallback: `(name?.[0] ?? '?')
// .toUpperCase()` / `name.slice(0, 1).toUpperCase()` — a face by hand. Outside the
// primitive it fails here; `lib/initials.ts` (`initialsFor`) is the one place that
// derives an initial.
//
// Fail-closed + ALLOWED(reason). Planted red with HeartButton's old disc restored.

const SRC = join(__dirname, '..')

const ALLOWED = new Map<string, string>([
  // (none today)
])

// The idiom AS A JSX CHILD: `>{ … (name?.[0] ?? '?').toUpperCase() … }` — a letter drawn
// into an element. A capitalize helper in lib/ (`label.charAt(0).toUpperCase() +
// label.slice(1)`) is not a face and does not sit in a JSX slot; the first draft of
// this regex read six of those and was narrowed to the slot.
const INITIAL_IDIOM = />\s*\{[\s\S]{0,160}?(\?\.\[0\]|\.slice\(0,\s*1\))\s*(\?\?\s*['"]\?['"]\s*\))?\s*\.toUpperCase\(\)/

const files = sourceFiles(SRC)
  .filter((f) => f.endsWith('.tsx'))
  .map((f) => ({ path: relative(SRC, f).split(sep).join('/'), raw: blankComments(readFileSync(f, 'utf8')) }))

describe('avatar rule — a face is drawn by Avatar', () => {
  it('the detector sees the hand-rolled face and not a capitalized label (canary)', () => {
    expect(files.some((f) => f.path === 'components/Avatar.tsx')).toBe(true)
    const face = `<span className="x__av" style={{ background: c }}>
      {photo ? <Img src={photo} alt="" /> : (m.display_name?.[0] ?? '?').toUpperCase()}
    </span>`
    const face2 = `<span className="y">{(r.memberName ?? '?').slice(0, 1).toUpperCase()}</span>`
    const label = `const month = { label: label.charAt(0).toUpperCase() + label.slice(1) }\n<b>{month.label}</b>`
    expect(INITIAL_IDIOM.test(face)).toBe(true)
    expect(INITIAL_IDIOM.test(face2)).toBe(true)
    expect(INITIAL_IDIOM.test(label)).toBe(false)
  })

  it('no file outside the primitive derives an initial by hand', () => {
    const offenders = files
      .filter((f) => f.path !== 'components/Avatar.tsx' && !ALLOWED.has(f.path) && INITIAL_IDIOM.test(f.raw))
      .map((f) => `${f.path}:${f.raw.slice(0, f.raw.search(INITIAL_IDIOM)).split('\n').length}`)
    expect(offenders, 'render <Avatar photoUrl|kind+photo colour name size className decorative /> — it draws the photo or the initial disc; add to ALLOWED only with the reason hosting it is impossible').toEqual([])
  })

  it('every ALLOWED entry still carries the idiom (a stale entry exempts the next arrival)', () => {
    const byPath = new Map(files.map((f) => [f.path, f.raw]))
    const stale = [...ALLOWED.keys()].filter((p) => !byPath.has(p) || !INITIAL_IDIOM.test(byPath.get(p)!))
    expect(stale).toEqual([])
  })
})
