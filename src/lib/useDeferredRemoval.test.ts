import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { QueryClient, QueryObserver } from '@tanstack/react-query'
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

// The freshness fence — the rule that broke on a real phone (Marc, 2026-09-02).
// Six « La liste » rows were swipe-deleted; production D1 confirmed every DELETE
// landed; the rows came back on screen anyway. Cause: the fence carried a 90 s cap
// that un-hid REGARDLESS of whether a fresh frame had arrived, so on a device whose
// READS were failing the rows were repainted out of the stale pre-delete frame that
// Query was still holding. A delete we know succeeded must outlive every frame that
// predates it.
describe('deferred-removal freshness fence', () => {
  beforeEach(() => {
    _resetTmpIds()
    store.unhideIds('board', [...store.snapshot('board')])
    vi.useRealTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  // A QueryClient holding ONE active query whose data is older than the delete —
  // i.e. exactly the stale frame that still contains the deleted rows.
  function staleClient() {
    const qc = new QueryClient()
    qc.setQueryData(['board'], { list: [{ id: 'a' }] })
    // An observer makes the query ACTIVE, the way a mounted list does — findAll({
    // type: 'active' }) is what the fence counts.
    // A never-settling queryFn + staleTime Infinity: the query is ACTIVE (an
    // 'enabled: false' observer is not) but never refreshes itself, so the test
    // controls exactly when a fresh frame lands.
    const obs = new QueryObserver(qc, {
      queryKey: ['board'],
      queryFn: () => new Promise(() => {}),
      staleTime: Infinity,
      retry: false,
    })
    const unsub = obs.subscribe(() => {})
    return { qc, unsub }
  }

  it('keeps a CONFIRMED delete hidden while no fresh frame arrives — even long past the old 90 s cap', () => {
    vi.useFakeTimers()
    const { qc } = staleClient()
    store.hideIds('board', ['a'])
    // t0 in the future of the cached frame: no successful fetch has happened since.
    store.unhideWhenFresh(qc, 'board', ['a'], Date.now() + 1_000, true)
    vi.advanceTimersByTime(300_000) // five minutes — the old cap fired at 90 s
    expect(store.snapshot('board').has('a')).toBe(true)
  })

  it('un-hides as soon as a genuinely fresh frame lands', () => {
    const { qc } = staleClient()
    const t0 = Date.now()
    store.hideIds('board', ['a'])
    store.unhideWhenFresh(qc, 'board', ['a'], t0 + 1, true)
    expect(store.snapshot('board').has('a')).toBe(true)
    // A successful refetch bumps dataUpdatedAt past the fence.
    qc.setQueryData(['board'], { list: [] }, { updatedAt: t0 + 5_000 })
    expect(store.snapshot('board').has('a')).toBe(false)
  })

  it('un-hides at once when the write FAILED — the row really is still there', () => {
    const { qc } = staleClient()
    store.hideIds('board', ['a'])
    store.unhideWhenFresh(qc, 'board', ['a'], Date.now() + 1_000, false)
    expect(store.snapshot('board').has('a')).toBe(false)
  })
})
