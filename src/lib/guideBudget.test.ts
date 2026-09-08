import { describe, expect, it } from 'vitest'
import { GUIDE } from './guideContent'

// THE GUIDE'S CONCISION BUDGETS, held by a test. DISCOVERY.md has listed them as
// « invariants tests enforce » since the 55 → 32 agglomeration — and no test did:
// on 2026-09-08 the one-liner a grandparent reads before opening a card (`what`)
// was over its 15 words on 30 of 32 cards (todos 53, voyage 51, carnets 49), and
// 106 items sat over some budget. The `what` lines and the point labels were
// rewritten that day; the rest is RATCHETED — the numbers below only move down,
// and a new card or point is measured against the hard caps from the start.
//
//   what ≤ 15 words · point label ≤ 5 words · detail ≤ 2 sentences
//   concept card ≤ 8 points · section card ≤ 12 points
//
// Plain FR-CA counts; EN follows FR. A budget is a ceiling, not a target — a
// four-word `what` is a good `what`.

// Words carry a letter or a digit — « », « : », « — » and « ? » are typography, not
// words, and they made « Mode calme : ce qui change » read as six.
const words = (s: string) => s.trim().split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length
// Sentences: a terminal mark followed by a space or the end. « ex. » and « … »
// inside a sentence are the known false splits; the ratchet absorbs them.
const sentences = (s: string) => s.split(/[.!?…]\s|[.!?…]$/).filter((x) => x.trim()).length

type Over = { where: string; what: string }
function measure() {
  const over: Record<'what' | 'label' | 'detail' | 'points', Over[]> = { what: [], label: [], detail: [], points: [] }
  for (const c of GUIDE) {
    const w = words(c.what.fr)
    if (w > 15) over.what.push({ where: c.id, what: `${w} words` })
    const cap = c.group === 'concepts' ? 8 : 12
    if (c.points.length > cap) over.points.push({ where: c.id, what: `${c.points.length} points (cap ${cap})` })
    c.points.forEach((p, i) => {
      const lw = words(p.label.fr)
      if (lw > 5) over.label.push({ where: `${c.id} pt ${i}`, what: `${lw} words — « ${p.label.fr} »` })
      const ds = p.detail ? sentences(p.detail.fr) : 0
      if (ds > 2) over.detail.push({ where: `${c.id} pt ${i}`, what: `${ds} sentences` })
    })
  }
  return over
}
const fmt = (list: Over[]) => list.map((o) => `${o.where}: ${o.what}`).join('\n')

describe('guide concision budgets (DISCOVERY.md)', () => {
  const over = measure()

  it('every card’s one-liner (`what`) is ≤ 15 words — the line a grandparent reads first', () => {
    expect(over.what.map((o) => `${o.where}: ${o.what}`), 'say it in fifteen plain words, or fewer').toEqual([])
  })

  it('every point label is ≤ 5 words', () => {
    expect(over.label.map((o) => `${o.where}: ${o.what}`)).toEqual([])
  })

  // The two classes not yet at zero. Each number was read off the real count the
  // day this test landed; lower it in the same commit as a trim, never raise it.
  it('point details over 2 sentences do not grow (ratchet)', () => {
    expect(over.detail.length, 'a new detail ran past two sentences — move the rest into the card’s prose, or split the point:\n' + fmt(over.detail)).toBeLessThanOrEqual(62)
  })

  it('cards over their point cap do not grow (ratchet)', () => {
    expect(over.points.length, 'a card gained a point past its cap — merge two points, or move one to a neighbour:\n' + fmt(over.points)).toBeLessThanOrEqual(6)
  })
})
