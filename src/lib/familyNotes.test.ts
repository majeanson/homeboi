import { describe, it, expect } from 'vitest'
import { sortNotes, visibleNotes, type FamilyNote } from './familyNotes'

// Build a minimal family note with just the fields the viewing filter reads.
const note = (id: string, memberId: string | null, extra?: Partial<FamilyNote>): FamilyNote => ({
  id,
  member_id: memberId,
  author_member_id: null,
  title: '',
  text: id,
  media_kind: null,
  media_key: null,
  scene_key: null,
  position: 0,
  created_at: 0,
  updated_at: null,
  ...extra,
})

describe('visibleNotes — self vs Maisonnée viewing filter', () => {
  const all = [note('fam', null), note('lea', 'lea'), note('cam', 'cam')]

  it('Maisonnée (no face) sees ONLY the family-wide notes', () => {
    expect(visibleNotes(all, null).map((n) => n.id)).toEqual(['fam'])
  })

  it('a member sees THEIR personal notes PLUS the Maisonnée notes', () => {
    expect(visibleNotes(all, 'lea').map((n) => n.id).sort()).toEqual(['fam', 'lea'])
  })

  it('never leaks another member’s personal notes', () => {
    expect(visibleNotes(all, 'lea').some((n) => n.id === 'cam')).toBe(false)
  })

  it('a member with no personal notes still sees the family ones', () => {
    expect(visibleNotes([note('fam', null)], 'lea').map((n) => n.id)).toEqual(['fam'])
  })
})

describe('sortNotes — manual drag order first, newest-first within a tie', () => {
  it('an untouched list (all position 0) keeps the iOS newest-first feel', () => {
    const all = [note('old', null, { created_at: 10 }), note('new', null, { created_at: 30 }), note('mid', null, { created_at: 20 })]
    expect(sortNotes(all).map((n) => n.id)).toEqual(['new', 'mid', 'old'])
  })

  it('a stored position wins over recency (the first drag pins the order)', () => {
    const all = [note('b', null, { position: 1, created_at: 30 }), note('a', null, { position: 0, created_at: 10 })]
    expect(sortNotes(all).map((n) => n.id)).toEqual(['a', 'b'])
  })

  it('an edit (updated_at) reorders only within a position tie', () => {
    const all = [
      note('pinned', null, { position: 0, created_at: 5 }),
      note('edited', null, { position: 0, created_at: 1, updated_at: 99 }),
      note('later', null, { position: 1, created_at: 100 }),
    ]
    expect(sortNotes(all).map((n) => n.id)).toEqual(['edited', 'pinned', 'later'])
  })

  it('does not mutate the input', () => {
    const all = [note('b', null, { position: 1 }), note('a', null, { position: 0 })]
    sortNotes(all)
    expect(all.map((n) => n.id)).toEqual(['b', 'a'])
  })
})
