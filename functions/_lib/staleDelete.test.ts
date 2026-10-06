import { describe, it, expect, vi, beforeEach } from 'vitest'
import { healClear } from './staleDelete'

// « Vider les cochés » with a STALE snapshot (2026-10-06). The client names the rows it
// ticked by id; an id the database never had used to clear nothing and answer « ok », and
// the ticked lines repainted. healClear picks the stand-ins — pure, so every rule is pinned
// here and the handlers (worker/listDoors.d1.test.ts) only have to wire it.

const row = (id: string, text: string, created_at: number) => ({ id, text, created_at })
const T = 1_000_000 // the gesture's time

describe('healClear', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  it('stands a same-named ticked row in for a stale id', () => {
    const eligible = [row('real-1', 'Lait', T - 500), row('real-2', 'Pain', T - 400)]
    const healed = healClear(eligible, [{ id: 'tmp-9', text: 'lait' }], T, new Set())
    expect(healed.map((r) => r.id)).toEqual(['real-1'])
  })

  it('leaves alone an id that already matched — nothing to heal', () => {
    const eligible = [row('real-1', 'Lait', T - 500)]
    expect(healClear(eligible, [{ id: 'real-1', text: 'Lait' }], T, new Set(['real-1']))).toEqual([])
  })

  it('never reaches a row created AFTER the gesture — a late replay must not eat a re-add', () => {
    const eligible = [row('real-1', 'Lait', T + 60)]
    expect(healClear(eligible, [{ id: 'tmp-9', text: 'Lait' }], T, new Set())).toEqual([])
  })

  it('uses each stand-in once: two stale « Lait » lines heal onto two rows, never the same one twice', () => {
    const eligible = [row('a', 'Lait', T - 300), row('b', 'Lait', T - 200)]
    const healed = healClear(
      eligible,
      [
        { id: 'tmp-1', text: 'Lait' },
        { id: 'tmp-2', text: 'Lait' },
        { id: 'tmp-3', text: 'Lait' },
      ],
      T,
      new Set(),
    )
    expect(healed.map((r) => r.id)).toEqual(['a', 'b'])
  })

  it('does not heal onto a row the id-match already took', () => {
    const eligible = [row('a', 'Lait', T - 300)]
    expect(healClear(eligible, [{ id: 'tmp-1', text: 'Lait' }], T, new Set(['a']))).toEqual([])
  })

  it('heals nothing without the gesture time or without names — an old queued entry degrades to the plain clear', () => {
    const eligible = [row('a', 'Lait', T - 300)]
    expect(healClear(eligible, [{ id: 'tmp-1', text: 'Lait' }], undefined, new Set())).toEqual([])
    expect(healClear(eligible, undefined, T, new Set())).toEqual([])
    expect(healClear(eligible, 'nope', T, new Set())).toEqual([])
  })

  it('ignores malformed entries instead of throwing on a hostile body', () => {
    const eligible = [row('a', 'Lait', T - 300)]
    expect(healClear(eligible, [null, 42, { id: 1, text: 'Lait' }, { id: 'x' }, { id: 'y', text: '' }], T, new Set())).toEqual([])
  })
})
