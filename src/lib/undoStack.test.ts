import { describe, expect, it, vi } from 'vitest'
import { MAX_UNDO_ENTRIES, findEntry, pushEntry, removeEntry, type UndoEntry } from './undoStack'

// Builders so each test reads as intent, not plumbing.
let nextId = 0
const deferred = (onCommit = vi.fn()): UndoEntry => ({
  id: ++nextId,
  message: 'm',
  onUndo: vi.fn(),
  onCommit,
  kind: 'deferred',
})
const compensating = (): UndoEntry => ({ id: ++nextId, message: 'm', onUndo: vi.fn(), kind: 'compensating' })

describe('undoStack', () => {
  it('pushes newest LAST and reports nothing to commit under the cap', () => {
    const a = deferred()
    const b = deferred()
    const r1 = pushEntry([], a)
    const r2 = pushEntry(r1.entries, b)
    expect(r2.entries.map((e) => e.id)).toEqual([a.id, b.id])
    expect(r1.committed).toEqual([])
    expect(r2.committed).toEqual([])
  })

  it('evicts the OLDEST when over the cap and reports the evicted deferred entry to commit', () => {
    // Fill to the cap, all deferred.
    let entries: UndoEntry[] = []
    const oldest = deferred()
    entries = pushEntry(entries, oldest).entries
    for (let i = 1; i < MAX_UNDO_ENTRIES; i++) entries = pushEntry(entries, deferred()).entries
    expect(entries).toHaveLength(MAX_UNDO_ENTRIES)

    // One more pushes the oldest off — and it must be reported for commit.
    const overflow = pushEntry(entries, deferred())
    expect(overflow.entries).toHaveLength(MAX_UNDO_ENTRIES)
    expect(overflow.entries.find((e) => e.id === oldest.id)).toBeUndefined()
    expect(overflow.committed.map((e) => e.id)).toEqual([oldest.id])
  })

  it('does NOT report an evicted compensating entry to commit (its write already landed)', () => {
    let entries: UndoEntry[] = []
    const oldest = compensating()
    entries = pushEntry(entries, oldest).entries
    for (let i = 1; i < MAX_UNDO_ENTRIES; i++) entries = pushEntry(entries, deferred()).entries

    const overflow = pushEntry(entries, deferred())
    expect(overflow.entries.find((e) => e.id === oldest.id)).toBeUndefined()
    expect(overflow.committed).toEqual([]) // compensating rolls off silently
  })

  it('removeEntry drops only the matching id and is a no-op for an unknown id', () => {
    const a = deferred()
    const b = compensating()
    const entries = [a, b]
    expect(removeEntry(entries, a.id).map((e) => e.id)).toEqual([b.id])
    expect(removeEntry(entries, 9999).map((e) => e.id)).toEqual([a.id, b.id])
  })

  it('findEntry locates by id', () => {
    const a = deferred()
    expect(findEntry([a], a.id)).toBe(a)
    expect(findEntry([a], -1)).toBeUndefined()
  })
})
