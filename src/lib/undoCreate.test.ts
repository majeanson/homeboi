import { describe, it, expect } from 'vitest'
import { createdId } from './undoCreate'

// The offline-safety contract of the create-then-undo helper: an undo may only
// DELETE a row the server actually created. createdId must yield an id ONLY for a
// real, non-queued response — never for a queued (offline) or refused (guest) write,
// where deleting by a missing/temp id would be wrong.
describe('createdId', () => {
  it('returns the server id for a real online create', () => {
    expect(createdId({ data: { id: 'srv_1' }, queued: false })).toBe('srv_1')
  })

  it('returns undefined when the write was queued offline', () => {
    expect(createdId({ data: null, queued: true })).toBeUndefined()
  })

  it('returns undefined when the response is null (transport caught)', () => {
    expect(createdId(null)).toBeUndefined()
  })

  it('returns undefined for a refused guest write (data null, not queued)', () => {
    // useWrite returns { data: null, queued: false } for a guest — no id to delete.
    expect(createdId({ data: null as unknown as { id?: string }, queued: false })).toBeUndefined()
  })

  it('returns undefined when the server omitted an id', () => {
    expect(createdId({ data: {}, queued: false })).toBeUndefined()
  })
})
