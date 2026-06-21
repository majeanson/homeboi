import { describe, it, expect, beforeEach } from 'vitest'
import { _deferredRemovalStore as store } from './useDeferredRemoval'

// The pure module store behind useDeferredRemoval — the bit that makes a deferred
// delete hide on every surface at once (cross-instance) without React in the loop.
describe('deferred-removal store', () => {
  beforeEach(() => {
    // Clear any state a prior test left so each runs from empty.
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
})
