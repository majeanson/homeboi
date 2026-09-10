import { describe, it, expect } from 'vitest'
import { FLIPP_BOOKMARKLET, FLIPP_BOOKMARKLET_BODY, flippListPayload, mergeFlippList, type FlippPayload } from './flippList'
import type { Pick } from './deals'

// The bookmarklet is a STRING a household pastes into a bookmark — nothing compiles
// it, nothing types it, and it runs on flipp.com where we cannot watch it. So it is
// run here, against a fake page, and held to the readable twin it must not drift
// from. The storage shape is Flipp's, dumped from a real add on 2026-09-10.

const deal = (over: Partial<Pick['deal']>): Pick['deal'] => ({
  id: 101,
  flyerId: 5001,
  name: 'Lait 2% 4L',
  price: 4.99,
  wasPrice: null,
  unitPrice: null,
  unitLabel: null,
  unitKind: null,
  unitApprox: false,
  merchant: 'Super C',
  logo: 'https://images.wishabi.net/m/1.png',
  premium: true,
  image: 'https://f.wishabi.net/p/1.jpg',
  validFrom: null,
  validTo: '2026-09-16T23:59:59-04:00',
  merchantId: 3384,
  box: { left: 10, right: 20, top: -5, bottom: -15 },
  ...over,
})
const pick = (itemId: string, over: Partial<Pick['deal']> = {}): Pick => ({ itemId, itemText: 'x', deal: deal(over) })

/** Run the bookmarklet body on a fake page: localStorage, prompt, alert, location. */
function runBookmarklet(stored: string | null, pasted: string | null) {
  const store = new Map<string, string>()
  if (stored != null) store.set('shopping_list', stored)
  const alerts: string[] = []
  const location = { href: '/fr-ca/item/101' }
  const fn = new Function(
    'localStorage',
    'prompt',
    'alert',
    'location',
    FLIPP_BOOKMARKLET_BODY,
  )
  fn(
    { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v) },
    () => pasted,
    (m: string) => alerts.push(m),
    location,
  )
  return { stored: store.get('shopping_list') ?? null, alerts, location }
}

describe('flippListPayload — every pick with a Flipp id, in Flipp\'s clipping shape', () => {
  it('maps a pick and drops one without an id', () => {
    const out = JSON.parse(flippListPayload([pick('a'), pick('b', { id: null })])) as FlippPayload
    expect(out.v).toBe(1)
    expect(out.clippings).toHaveLength(1)
    expect(out.clippings[0]).toEqual({
      flyerItemId: 101,
      name: 'Lait 2% 4L',
      flyerId: 5001,
      price: '4.99', // a STRING, as Flipp stores it
      merchantId: 3384,
      merchantName: 'Super C',
      merchantLogoUrl: 'https://images.wishabi.net/m/1.png',
      thumbnailUrl: 'https://f.wishabi.net/p/1.jpg',
      validTo: '2026-09-16T23:59:59-04:00',
      left: 10,
      right: 20,
      top: -5,
      bottom: -15,
    })
  })

  it('an older staged deal (no merchantId / box) still clips, with nulls', () => {
    const out = JSON.parse(flippListPayload([pick('a', { merchantId: undefined, box: undefined })])) as FlippPayload
    expect(out.clippings[0].merchantId).toBeNull()
    expect(out.clippings[0].left).toBeNull()
  })
})

describe('the bookmarklet, run against a fake flipp.com page', () => {
  const payload = flippListPayload([pick('a'), pick('b', { id: 102, name: 'Pain' })])

  it('writes a local list with both clippings and goes to the list page', () => {
    const r = runBookmarklet(null, payload)
    expect(r.alerts).toEqual([])
    const list = JSON.parse(r.stored!)
    expect(list._delegate).toBe(false)
    expect(list._outstandingOps).toEqual([])
    expect(list.flyerItemClippings.map((c: { id: string }) => c.id)).toEqual(['item-clipping-101', 'item-clipping-102'])
    expect(list.listItems).toEqual([])
    expect(r.location.href).toBe('/liste_dachats')
  })

  it('merges into an existing LOCAL list and never duplicates a flyer item', () => {
    const existing = JSON.stringify({
      _outstandingOps: [],
      flyerItemClippings: [{ id: 'item-clipping-101', flyerItemId: 101, name: 'déjà là' }],
      listItems: [{ id: 'li1', name: 'oeufs' }],
      photos: [],
      ecomItems: [],
      _delegate: false,
    })
    const r = runBookmarklet(existing, payload)
    const list = JSON.parse(r.stored!)
    expect(list.flyerItemClippings.map((c: { flyerItemId: number }) => c.flyerItemId)).toEqual([101, 102])
    expect(list.flyerItemClippings[0].name).toBe('déjà là') // theirs wins; ours only adds
    expect(list.listItems).toEqual([{ id: 'li1', name: 'oeufs' }]) // their typed items untouched
  })

  it('replaces a server PROXY list (logged in) with a local one — Flipp merges that itself', () => {
    const proxy = JSON.stringify({ id: 'srv-9', commitVersion: 4, _delegate: true, flyerItemClippings: [{ id: 'x', flyerItemId: 555 }] })
    const list = JSON.parse(runBookmarklet(proxy, payload).stored!)
    expect(list._delegate).toBe(false)
    expect(list.id).toBeUndefined()
    expect(list.flyerItemClippings.map((c: { flyerItemId: number }) => c.flyerItemId)).toEqual([101, 102])
  })

  it('refuses anything that is not a Babillard payload, and writes nothing', () => {
    for (const bad of ['', 'not json', '{"v":2,"clippings":[]}', '{"v":1,"clippings":[]}', '[1,2]']) {
      const r = runBookmarklet(null, bad)
      expect(r.stored, `pasted ${JSON.stringify(bad)}`).toBeNull()
      expect(r.location.href).toBe('/fr-ca/item/101')
      if (bad !== '') expect(r.alerts).toHaveLength(1)
    }
  })

  it('agrees with its readable twin, mergeFlippList', () => {
    const existing = JSON.stringify({ flyerItemClippings: [{ id: 'item-clipping-101', flyerItemId: 101 }], _delegate: false })
    const twin = mergeFlippList(existing, JSON.parse(payload) as FlippPayload)
    const real = JSON.parse(runBookmarklet(existing, payload).stored!)
    expect(real).toEqual(JSON.parse(JSON.stringify(twin.list)))
    expect(twin.added).toBe(1)
  })

  it('is a javascript: URL with its body encoded once', () => {
    expect(FLIPP_BOOKMARKLET.startsWith('javascript:')).toBe(true)
    expect(decodeURIComponent(FLIPP_BOOKMARKLET.slice('javascript:'.length))).toBe(FLIPP_BOOKMARKLET_BODY)
    // ES5 on purpose: a bookmark runs in whatever browser the phone has.
    expect(FLIPP_BOOKMARKLET_BODY).not.toMatch(/=>|\bconst\b|\blet\b|`/)
  })
})
