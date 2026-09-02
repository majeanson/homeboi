import { describe, it, expect, beforeEach } from 'vitest'
import { _deferredRemovalStore as store } from './useDeferredRemoval'
import { recordTmpId, _resetTmpIds } from './tmpIds'

// The pure module store behind useDeferredRemoval — the bit that makes a deferred
// delete hide on every surface at once (cross-instance) without React in the loop.
describe('deferred-removal store', () => {
  beforeEach(() => {
    // Clear any state a prior test left so each runs from empty.
    _resetTmpIds()
    store.unhideIds('todos', [...store.snapshot('todos')])
    store.unhideIds('leftovers', [...store.snapshot('leftovers')])
  })

  it('derives a scope from the query key head, sharing across day-scoped keys', () => {
    // Board glance (['todos']) and a day page (['todos', 123]) land in ONE bucket.
    expect(store.scopeOf(['todos'])).toBe('todos')
    expect(store.scopeOf(['todos', 123])).toBe('todos')
    expect(store.scopeOf(['leftovers'])).toBe('leftovers')
  })

  it('hides ids in a scope and reports them via the snapshot', () => {
    store.hideIds('todos', ['a', 'b'])
    expect(store.snapshot('todos').has('a')).toBe(true)
    expect(store.snapshot('todos').has('b')).toBe(true)
    expect(store.snapshot('todos').has('c')).toBe(false)
  })

  it('keeps scopes isolated — a todo delete never hides a leftover', () => {
    store.hideIds('todos', ['a'])
    expect(store.snapshot('leftovers').has('a')).toBe(false)
    expect(store.snapshot('leftovers')).toBe(store.EMPTY)
  })

  it('returns a STABLE snapshot ref while unchanged (no render churn) and a NEW one on change', () => {
    const empty1 = store.snapshot('todos')
    const empty2 = store.snapshot('todos')
    expect(empty1).toBe(empty2) // same EMPTY singleton → useSyncExternalStore stays put
    store.hideIds('todos', ['a'])
    const after = store.snapshot('todos')
    expect(after).not.toBe(empty1) // a mutation produces a fresh Set
    expect(store.snapshot('todos')).toBe(after) // …but stable again until the next change
  })

  it('un-hides ids and drops the bucket back to EMPTY when the last one clears', () => {
    store.hideIds('todos', ['a', 'b'])
    store.unhideIds('todos', ['a'])
    expect(store.snapshot('todos').has('a')).toBe(false)
    expect(store.snapshot('todos').has('b')).toBe(true)
    store.unhideIds('todos', ['b'])
    expect(store.snapshot('todos')).toBe(store.EMPTY) // emptied → back to the shared singleton
  })

  // The tmp→real bridge (lib/tmpIds). The bug: delete a row while its optimistic
  // create was still reconciling → only the tmp id was hidden, so the refetch's
  // real-id twin visibly CAME BACK mid-undo — and the eventual unhide couldn't
  // find what hide had added.
  it('keeps hiding a row across its tmp→real id swap (resolution AFTER hide)', () => {
    store.hideIds('todos', ['tmp-1-a'])
    recordTmpId('tmp-1-a', 'real-1') // the create reconciles while the delete is held
    expect(store.snapshot('todos').has('real-1')).toBe(true) // the refetched real row stays hidden
    expect(store.snapshot('todos').has('tmp-1-a')).toBe(true) // …and stale frames still rendering the tmp row too
  })

  it('hides the real row even when resolution landed BEFORE the hide', () => {
    recordTmpId('tmp-1-a', 'real-1')
    store.hideIds('todos', ['tmp-1-a']) // gesture on a tmp row the cache still renders
    expect(store.snapshot('todos').has('real-1')).toBe(true)
  })

  it('un-hides both spellings, whichever the caller passes', () => {
    store.hideIds('todos', ['tmp-1-a'])
    recordTmpId('tmp-1-a', 'real-1')
    store.unhideIds('todos', ['tmp-1-a']) // undo/commit closures captured the tmp id
    expect(store.snapshot('todos')).toBe(store.EMPTY)
  })
})
