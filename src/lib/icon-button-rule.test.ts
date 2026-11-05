import { readFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { describe, expect, it } from 'vitest'
import { sourceFiles, blankComments } from './buildGuardScan'

// AN ICON-ONLY BUTTON HAS A NAME, AND IT IS AN IconButton (solidify 2.5, 2026-11-05).
// A `<button>` whose whole content is one <Icon> says nothing to a screen reader and
// shows no title to a mouse unless someone remembered aria-label — two ＋ in the family
// builder shipped without one. `components/IconButton.tsx` makes the name a REQUIRED
// prop and owns the box (44px / 38px, ghost · solid · bare); the thirty `.btn`-family
// icon buttons and the three shells' closes ride it.
//
// Two rules:
//  · HARD, fail-closed: an icon-only <button> with no aria-label fails, anywhere.
//  · RATCHET: icon-only labelled <button>s spelled by hand (outside IconButton.tsx)
//    — the bespoke families (`drawpad__tool`, `edit-field__icon-btn`, `row-actions__btn`,
//    `monthv__nav`…) keep their own box for now. The count may fall, never rise; a
//    sweep lowers it in its own commit.
// Planted red by deleting the aria-label from a RowActions button.

const SRC = join(__dirname, '..')

// Icon-only labelled buttons spelled by hand, the day the primitive shipped: the 146
// the audit found minus the 43 that moved onto IconButton and Segmented so far.
const HAND_SPELLED_MAX = 103

const files = sourceFiles(SRC)
  .filter((f) => f.endsWith('.tsx'))
  .map((f) => ({ path: relative(SRC, f).split(sep).join('/'), raw: blankComments(readFileSync(f, 'utf8')) }))

// Every `<button …>…</button>` whose trimmed content is exactly one <Icon …/> or
// <InlineIcon …/>. The open tag is read brace-aware (an onClick arrow holds `>`).
export function iconOnlyButtons(src: string): { line: number; labeled: boolean; open: string }[] {
  const out: { line: number; labeled: boolean; open: string }[] = []
  const re = /<button\b/g
  let m: RegExpExecArray | null
  while ((m = re.exec(src))) {
    let i = m.index
    let depth = 0
    for (; i < src.length; i++) {
      const c = src[i]
      if (c === '{') depth++
      else if (c === '}') depth--
      else if (c === '>' && depth === 0) break
    }
    const open = src.slice(m.index, i + 1)
    if (open.endsWith('/>')) continue
    const close = src.indexOf('</button>', i)
    if (close < 0) continue
    const inner = src.slice(i + 1, close).trim()
    if (!/^<(Icon|InlineIcon)\b[^>]*\/>$/.test(inner)) continue
    out.push({ line: src.slice(0, m.index).split('\n').length, labeled: /\baria-label=/.test(open), open })
  }
  return out
}

describe('icon-button rule — a glyph button has a name, and it is an IconButton', () => {
  it('the detector sees an icon-only button and its label (canary)', () => {
    const src = [
      `<button type="button" className="x" onClick={() => go(1)} aria-label="Fermer"><Icon name="x-bold" size={18} /></button>`,
      `<button type="button" className="y" onClick={() => go(2)}>\n  <Icon name="plus-bold" />\n</button>`,
      `<button type="button" className="z"><Icon name="a" /> Texte</button>`,
    ].join('\n')
    expect(iconOnlyButtons(src).map((b) => [b.line, b.labeled])).toEqual([[1, true], [2, false]])
  })

  it('every icon-only button carries an aria-label', () => {
    const nameless = files.flatMap((f) => iconOnlyButtons(f.raw).filter((b) => !b.labeled).map((b) => `${f.path}:${b.line}`))
    expect(nameless, 'render <IconButton icon label …/> — label is the accessible name; a glyph alone says nothing').toEqual([])
  })

  it('hand-spelled icon-only buttons only ever get fewer (ratchet)', () => {
    const n = files.filter((f) => f.path !== 'components/IconButton.tsx').reduce((acc, f) => acc + iconOnlyButtons(f.raw).length, 0)
    expect(n, `hand-spelled icon-only buttons: ${n} (max ${HAND_SPELLED_MAX}) — a new one goes on <IconButton>; a sweep lowers the max in its own commit`).toBeLessThanOrEqual(HAND_SPELLED_MAX)
    expect(n, 'the ratchet is loose — lower HAND_SPELLED_MAX to the current count').toBeGreaterThan(HAND_SPELLED_MAX - 12)
  })
})
