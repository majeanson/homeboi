import { readFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { describe, expect, it } from 'vitest'
import { sourceFiles, blankComments, openTags } from './buildGuardScan'

// TABS SWITCH PANELS, Segmented SETS A VALUE (solidify 3.3, 2026-11-05). A hand-rolled
// tablist copies SubTabs' keyboard contract and drifts from it; a hand-rolled value
// picker announces a row of pressed buttons instead of « one of four ». Both fail here
// unless ALLOWED says why the primitive cannot host it. Planted red with a
// `boardview__opt` button restored.

const SRC = join(__dirname, '..')

const TABLIST_ALLOWED = new Map<string, string>([
  ['components/SubTabs.tsx', 'the primitive'],
  ['pages/Operator.tsx', 'Réglages’ section nav: a VERTICAL sticky sidebar on a wide screen with one hue per tab and aria-controls onto one panel — not the pill row SubTabs draws'],
])
const PICKER_TOKEN = /(__opt|__seg|__segbtn|__mode|__modes)$/
const PICKER_ALLOWED = new Map<string, string>([
  ['subtabs__opt', 'SubTabs itself'],
  ['segmented__opt', 'Segmented itself'],
  ['mswitch__opt', 'MemberSwitcher: a face picker with a photo per option, not a mode'],
  ['draw-choice__opt', 'three ACTIONS with a line of explanation each: tapping one acts and closes, nothing stays selected'],
  ['emoji-picker__opt', 'a large wrapping GRID of glyphs, not a few choices in a row'],
  ['tdl-sticker__opt', 'the toddler sticker grid: big art tiles, a tap acts'],
])

const files = sourceFiles(SRC)
  .filter((f) => f.endsWith('.tsx'))
  .map((f) => ({ path: relative(SRC, f).split(sep).join('/'), raw: blankComments(readFileSync(f, 'utf8')) }))

function tokens(tag: string): string[] {
  const m = /className=(?:"([^"]*)"|\{([\s\S]*)\})/.exec(tag)
  if (!m) return []
  if (m[1] !== undefined) return m[1].split(/\s+/)
  return [...m[2]!.matchAll(/['"`]([^'"`]*)['"`]/g)].flatMap((x) => x[1]!.trim().split(/\s+/))
}

describe('segmented rule — tabs are SubTabs, value pickers are Segmented', () => {
  it('the detector reads a built class name (canary)', () => {
    expect(tokens(`<button className={'boardview__opt' + (on ? ' is-on' : '')}>`).some((t) => PICKER_TOKEN.test(t))).toBe(true)
    expect(tokens(`<button className="btn btn--sm">`).some((t) => PICKER_TOKEN.test(t))).toBe(false)
  })

  it('no role="tablist" outside SubTabs', () => {
    const offenders = files.filter((f) => /role=["']tablist["']/.test(f.raw) && !TABLIST_ALLOWED.has(f.path)).map((f) => f.path)
    expect(offenders, 'render <SubTabs>').toEqual([])
  })

  it('no button wears a hand-rolled picker class', () => {
    const offenders = files.flatMap((f) =>
      openTags(f.raw, 'button').flatMap((tag) => tokens(tag).filter((t) => PICKER_TOKEN.test(t) && !PICKER_ALLOWED.has(t)).map((t) => `${f.path}: ${t}`)),
    )
    expect(offenders, 'render <Segmented options value onChange ariaLabel /> — role=radiogroup, one tab stop, arrows').toEqual([])
  })

  it('every ALLOWED entry is still live (a stale entry exempts the next arrival)', () => {
    const live = new Set(files.flatMap((f) => openTags(f.raw, 'button').flatMap(tokens)))
    expect([...PICKER_ALLOWED.keys()].filter((t) => !live.has(t))).toEqual([])
    const byPath = new Map(files.map((f) => [f.path, f.raw]))
    expect([...TABLIST_ALLOWED.keys()].filter((p) => !/role=["']tablist["']/.test(byPath.get(p) ?? ''))).toEqual([])
  })
})
