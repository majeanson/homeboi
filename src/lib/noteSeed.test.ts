import { describe, it, expect } from 'vitest'
import { seedMd, type FamilyNote } from './familyNotes'

// « Les notes » in SIMPLE mode has no title field — the note's first words ARE its
// title (iOS style), and the save writes an empty one. So an existing note whose
// title lives in its own column must have that title FOLDED INTO the body when the
// editor opens, or closing the editor would silently drop it.

const note = (title: string, text: string): FamilyNote => ({
  id: 'n1',
  title,
  text,
  member_id: null,
  author_member_id: null,
  media_kind: null,
  media_key: null,
  scene_key: null,
  position: 0,
  created_at: 0,
  updated_at: 0,
})

describe('seedMd — the simple-mode title fold', () => {
  it('leaves the body untouched in advanced mode (the title field still owns it)', () => {
    expect(seedMd(note('Courses', 'lait\noeufs'), true)).toBe('lait\noeufs')
  })

  it('folds a stored title in as the first line — nothing is lost on save', () => {
    expect(seedMd(note('Courses', 'lait\noeufs'), false)).toBe('Courses\nlait\noeufs')
  })

  it('is idempotent: a title already leading the body is never doubled', () => {
    expect(seedMd(note('Courses', 'Courses\nlait'), false)).toBe('Courses\nlait')
  })

  it('ignores blank lines when deciding whether the title already leads', () => {
    expect(seedMd(note('Courses', '\n\nCourses\nlait'), false)).toBe('\n\nCourses\nlait')
  })

  it('a title-only note becomes a one-line body (no trailing blank line)', () => {
    expect(seedMd(note('Courses', '   '), false)).toBe('Courses')
  })

  it('an untitled note is passed straight through', () => {
    expect(seedMd(note('', 'lait'), false)).toBe('lait')
  })

  it('a brand-new note (no note at all) starts empty', () => {
    expect(seedMd(null, false)).toBe('')
    expect(seedMd(null, true)).toBe('')
  })
})
