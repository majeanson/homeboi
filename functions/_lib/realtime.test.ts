import { describe, it, expect } from 'vitest'
import { keysForPath } from './realtime'

// keysForPath is the PURE path→invalidation-keys mapping the realtime broadcast
// hook (#20) uses to nudge only the caches a given write actually touches. It
// must mirror the SPA's `affectedKeys` per endpoint, never throw, and default
// safely. These tests pin the mapping so a renamed endpoint/key is caught.

describe('keysForPath', () => {
  it('maps the shared list to board + ghosts + history', () => {
    expect(keysForPath('list')).toEqual([['board'], ['ghosts'], ['list-history']])
  })

  it('maps chores and the chores ledger to chores + board + month', () => {
    expect(keysForPath('chores')).toEqual([['chores'], ['board'], ['month']])
    expect(keysForPath('chores-ledger')).toEqual([['chores'], ['board'], ['month']])
  })

  it('maps events to events + board + month + a-regler (driverless ride heads-up)', () => {
    expect(keysForPath('events')).toEqual([['events'], ['board'], ['month'], ['a-regler']])
  })

  it('maps trips to trips + board + month; trip-notes + packing to their keys; doc-media silent', () => {
    expect(keysForPath('trips')).toEqual([['trips'], ['board'], ['month']])
    expect(keysForPath('trip-notes')).toEqual([['trip-notes'], ['month'], ['board']])
    expect(keysForPath('trip-packing')).toEqual([['trip-packing']])
    expect(keysForPath('trip-doc-media')).toEqual([])
  })

  it('maps « Voyage partagé » endpoints to their own keys; media + invite silent', () => {
    expect(keysForPath('shared-trip')).toEqual([['shared-trips'], ['trips'], ['board'], ['month']])
    // A dated shared itinerary note shows on the writer's month grid + day page (['month']).
    expect(keysForPath('shared-trip-notes')).toEqual([['shared-trip-notes'], ['month']])
    expect(keysForPath('shared-trip-packing')).toEqual([['shared-trip-packing']])
    expect(keysForPath('shared-trip-join')).toEqual([['shared-trips']])
    expect(keysForPath('shared-trip-leave')).toEqual([['shared-trips'], ['trips'], ['board'], ['month']])
    expect(keysForPath('shared-trip-media')).toEqual([])
    expect(keysForPath('shared-trip-invite')).toEqual([])
  })

  // The default-to-[['board']] trap (keysForPath) would silently mis-route any
  // unmapped shared-trip* write to the writer's board room — wrong cache + board spam.
  // Pin that EVERY shared-trip* path is explicitly mapped (its own keys) or silent.
  it('never lets a shared-trip* path fall through to the [[board]] default', () => {
    for (const p of [
      'shared-trip',
      'shared-trip-notes',
      'shared-trip-packing',
      'shared-trip-join',
      'shared-trip-leave',
      'shared-trip-media',
      'shared-trip-invite',
    ]) {
      expect(keysForPath(p)).not.toEqual([['board']])
    }
  })

  it('maps the meal plan to meals + board + a-regler (empty/low supper heads-up)', () => {
    expect(keysForPath('meals')).toEqual([['meals'], ['board'], ['a-regler']])
    expect(keysForPath('meal-leftovers')).toEqual([['leftovers'], ['board']])
  })

  // meals + month ride along because the meal ORDER/HERO are applied server-side, so
  // reordering on one device must re-sort another's kitchen grid + calendar, not just
  // re-tint them.
  it('maps household settings to household + board + health + meals + month', () => {
    expect(keysForPath('household')).toEqual([['household'], ['board'], ['health'], ['meals'], ['month']])
  })

  it('maps routines to routines + board', () => {
    expect(keysForPath('routines')).toEqual([['routines'], ['board']])
  })

  it('maps À compléter todos to todos + board + month, templates to their own key', () => {
    expect(keysForPath('todos')).toEqual([['todos'], ['board'], ['month']])
    expect(keysForPath('todo-templates')).toEqual([['todo-templates']])
  })

  it('maps recipe endpoints to the recipe keys', () => {
    expect(keysForPath('recipes')).toEqual([['recipes'], ['a-regler']])
    expect(keysForPath('recipe-tags')).toEqual([['recipes'], ['recipe-tags']])
    // The shared list lives under ['board']; there is no separate ['list'] cache.
    expect(keysForPath('recipe-to-list')).toEqual([['board']])
    expect(keysForPath('recipe-loves')).toEqual([['recipe-loves']])
  })

  it('maps « Partager » to the shares ledger; the public reader is silent (GET-only)', () => {
    expect(keysForPath('share')).toEqual([['shares']])
    // share-public is unmapped/GET-only; keysForPath is only consulted for writes, but a
    // stray call must not invent a broadcast — it falls to the safe board default.
    expect(keysForPath('share-public')).toEqual([['board']])
  })

  // Regression guard: these endpoints each own a dedicated client query key, so a
  // realtime push must nudge THAT key — not silently fall to the [['board']] default
  // (which would downgrade cross-device refresh to poll latency for their own tab).
  it('maps keyed cercle/auto/gallery endpoints to their own key, not the board default', () => {
    expect(keysForPath('pets')).toEqual([['cercle']])
    expect(keysForPath('businesses')).toEqual([['businesses']])
    expect(keysForPath('family-notes')).toEqual([['family-notes']])
    expect(keysForPath('schedule')).toEqual([['schedule'], ['board']])
    expect(keysForPath('car-day')).toEqual([['car'], ['board']])
    expect(keysForPath('drawings')).toEqual([['drawings']])
    // None of them should be the bare board default.
    for (const p of ['pets', 'businesses', 'family-notes', 'schedule', 'car-day', 'drawings', 'recipe-loves']) {
      expect(keysForPath(p)).not.toEqual([['board']])
    }
  })

  it('maps capture to every target it can route a note to', () => {
    expect(keysForPath('capture')).toEqual([['board'], ['meals'], ['pantry'], ['leftovers'], ['a-regler']])
  })

  it('maps sample-data seed/clear to a broad board-facing superset (not the bare board default)', () => {
    const keys = keysForPath('seed')
    expect(keys).toContainEqual(['board'])
    expect(keys).toContainEqual(['members'])
    expect(keys).toContainEqual(['meals'])
    expect(keys).toContainEqual(['routines'])
    expect(keys).not.toEqual([['board']])
  })

  it('broadcasts NOTHING for endpoints that change no shared cache', () => {
    for (const p of [
      'auth/login',
      'auth/me',
      'pair/start',
      'pair/poll',
      'transcribe',
      'suggest-meal',
      'recipe-draft',
      'weather',
      'health',
      'photos',
      'members/avatar',
    ]) {
      expect(keysForPath(p)).toEqual([])
    }
  })

  it('treats image blob routes (img/<key>) as silent', () => {
    expect(keysForPath('img/abc123')).toEqual([])
  })

  it('defaults an unmapped, non-silent write to the board key (safe superset)', () => {
    expect(keysForPath('something-new')).toEqual([['board']])
  })

  it('normalizes leading slash, api/ prefix, query string and trailing slash', () => {
    expect(keysForPath('/api/list')).toEqual([['board'], ['ghosts'], ['list-history']])
    expect(keysForPath('api/meals?date=123')).toEqual([['meals'], ['board'], ['a-regler']])
    expect(keysForPath('chores/')).toEqual([['chores'], ['board'], ['month']])
    // A full URL pathname (what route.ts passes) works too.
    expect(keysForPath('/api/events')).toEqual([['events'], ['board'], ['month'], ['a-regler']])
  })

  it('never throws and returns [] on empty input', () => {
    expect(keysForPath('')).toEqual([])
    // @ts-expect-error — defensive: the runtime tolerates a non-string.
    expect(() => keysForPath(undefined)).not.toThrow()
  })
})
