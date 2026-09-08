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
// Sentences: a terminal mark followed by a space and a capital (or an opening
// quote / bracket), or the end. A « ? » inside « … ? » and an « ex. » mid-sentence
// are not sentence ends — the first draft counted them, and read « qu’est-ce qu’on
// mange vendredi ? » as two sentences.
const sentences = (s: string) => s.split(/[.!?…](?=\s+[A-ZÀ-ÝŒ«“(])|[.!?…]$/).filter((x) => x.trim()).length

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

describe('guide concision budgets (DISCOVERY.md)', () => {
  const over = measure()

  it('every card’s one-liner (`what`) is ≤ 15 words — the line a grandparent reads first', () => {
    expect(over.what.map((o) => `${o.where}: ${o.what}`), 'say it in fifteen plain words, or fewer').toEqual([])
  })

  it('every point label is ≤ 5 words', () => {
    expect(over.label.map((o) => `${o.where}: ${o.what}`)).toEqual([])
  })

  // Both classes reached zero on 2026-09-08 (the alias drill: six cards merged
  // down to their cap, every long detail trimmed) — so these are hard now too.
  it('every point detail is ≤ 2 sentences', () => {
    expect(over.detail.map((o) => `${o.where}: ${o.what}`), 'a detail ran past two sentences — say less, or split the point').toEqual([])
  })

  it('no card exceeds its point cap (concept ≤ 8, section ≤ 12)', () => {
    expect(over.points.map((o) => `${o.where}: ${o.what}`), 'a card gained a point past its cap — merge two points, or move one to a neighbour (DISCOVERY.md, the alias drill)').toEqual([])
  })
})
