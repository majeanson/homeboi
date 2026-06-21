import { describe, it, expect } from 'vitest'
import { visibleNotes, type FamilyNote } from './familyNotes'

// Build a minimal family note with just the fields the viewing filter reads.
const note = (id: string, memberId: string | null): FamilyNote => ({
  id,
  member_id: memberId,
  author_member_id: null,
  text: id,
  media_kind: null,
  media_key: null,
  scene_key: null,
  created_at: 0,
  updated_at: null,
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
