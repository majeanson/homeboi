import { describe, it, expect } from 'vitest'
import { FLIPP_BOOKMARKLET, FLIPP_BOOKMARKLET_BODY, flippListPayload, mergeFlippList, type FlippPayload } from './flippList'
import type { Pick } from './deals'

// The bookmarklet is a STRING a household pastes into a bookmark — nothing compiles
// it, nothing types it, and it runs on flipp.com where we cannot watch it. So it is
// run here, against a fake page, and held to the readable twin it must not drift
// from. The storage shapes are Flipp's, dumped from a real session on 2026-09-10:
// a clipping (`SLFlyerItemClipping`) and a typed item (`SLListItem`: id, term, checked).

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

type StoredList = {
  _delegate: boolean
  _outstandingOps: unknown[]
  flyerItemClippings: { id: string; flyerItemId: number; name?: string }[]
  listItems: { id: string; term: string; checked: boolean }[]
  id?: string
}

/** Run the bookmarklet body on a fake page: localStorage, prompt, alert, location. */
function runBookmarklet(stored: string | null, pasted: string | null) {
  const store = new Map<string, string>()
  if (stored != null) store.set('shopping_list', stored)
  const alerts: string[] = []
  const location = { href: '/fr-ca/item/101' }
  const fn = new Function('localStorage', 'prompt', 'alert', 'location', FLIPP_BOOKMARKLET_BODY)
  fn(
    { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v) },
    () => pasted,
    (m: string) => alerts.push(m),
    location,
  )
  const raw = store.get('shopping_list') ?? null
  return { stored: raw, list: raw ? (JSON.parse(raw) as StoredList) : null, alerts, location }
}

describe('flippListPayload — every pick with a Flipp id as a clipping, every line as a typed item', () => {
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
    expect(out.items).toEqual([])
  })

  it('an older staged deal (no merchantId / box) still clips, with nulls', () => {
    const out = JSON.parse(flippListPayload([pick('a', { merchantId: undefined, box: undefined })])) as FlippPayload
    expect(out.clippings[0].merchantId).toBeNull()
    expect(out.clippings[0].left).toBeNull()
  })

  it('typed lines ride as items — trimmed, deduped case-insensitively, blanks dropped', () => {
    const out = JSON.parse(flippListPayload([], [' Pain ', 'pain', 'Oeufs', '', 'PAIN'])) as FlippPayload
    expect(out.items).toEqual([{ term: 'Pain' }, { term: 'Oeufs' }])
  })
})

describe('the bookmarklet, run against a fake flipp.com page', () => {
  const payload = flippListPayload([pick('a'), pick('b', { id: 102, name: 'Pain' })], ['Oeufs', 'Beurre'])

  it('writes a local list with both clippings and both typed items, and goes to the list page', () => {
    const r = runBookmarklet(null, payload)
    expect(r.alerts).toEqual([])
    const list = r.list!
    expect(list._delegate).toBe(false)
    expect(list._outstandingOps).toEqual([])
    expect(list.flyerItemClippings.map((c) => c.id)).toEqual(['item-clipping-101', 'item-clipping-102'])
    // Typed items: Flipp's own shape, their own id convention (term, spaces stripped, a suffix).
    expect(list.listItems.map((i) => [i.term, i.checked])).toEqual([
      ['Oeufs', false],
      ['Beurre', false],
    ])
    expect(list.listItems[0].id).toMatch(/^oeufs-/)
    expect(r.location.href).toBe('/liste_dachats')
  })

  it('merges into an existing LOCAL list and never duplicates a flyer item or a term', () => {
    const existing = JSON.stringify({
      _outstandingOps: [],
      flyerItemClippings: [{ id: 'item-clipping-101', flyerItemId: 101, name: 'déjà là' }],
      listItems: [{ id: 'oeufs-abc', term: 'oeufs', checked: true }],
      photos: [],
      ecomItems: [],
      _delegate: false,
    })
    const list = runBookmarklet(existing, payload).list!
    expect(list.flyerItemClippings.map((c) => c.flyerItemId)).toEqual([101, 102])
    expect(list.flyerItemClippings[0].name).toBe('déjà là') // theirs wins; ours only adds
    // « oeufs » already there (checked, even) — kept as is, case-insensitively; « Beurre » added.
    expect(list.listItems.map((i) => [i.id, i.term, i.checked])).toEqual([
      ['oeufs-abc', 'oeufs', true],
      [expect.stringMatching(/^beurre-/), 'Beurre', false],
    ])
  })

  it('replaces a server PROXY list (logged in) with a local one — Flipp merges that itself', () => {
    const proxy = JSON.stringify({ id: 'srv-9', commitVersion: 4, _delegate: true, flyerItemClippings: [{ id: 'x', flyerItemId: 555 }] })
    const list = runBookmarklet(proxy, payload).list!
    expect(list._delegate).toBe(false)
    expect(list.id).toBeUndefined()
    expect(list.flyerItemClippings.map((c) => c.flyerItemId)).toEqual([101, 102])
  })

  it('a payload of typed items ONLY (no deal staged this week) is still a list', () => {
    const list = runBookmarklet(null, flippListPayload([], ['Lait'])).list!
    expect(list.flyerItemClippings).toEqual([])
    expect(list.listItems.map((i) => i.term)).toEqual(['Lait'])
  })

  it('refuses anything that is not a Babillard payload, and writes nothing', () => {
    for (const bad of ['', 'not json', '{"v":2,"clippings":[],"items":[]}', '{"v":1,"clippings":[],"items":[]}', '[1,2]', '{"v":1}']) {
      const r = runBookmarklet(null, bad)
      expect(r.stored, `pasted ${JSON.stringify(bad)}`).toBeNull()
      expect(r.location.href).toBe('/fr-ca/item/101')
      if (bad !== '') expect(r.alerts).toHaveLength(1)
    }
  })

  it('agrees with its readable twin, mergeFlippList', () => {
    const existing = JSON.stringify({ flyerItemClippings: [{ id: 'item-clipping-101', flyerItemId: 101 }], listItems: [], _delegate: false })
    const twin = mergeFlippList(existing, JSON.parse(payload) as FlippPayload, (key) => key + '-ID')
    const real = runBookmarklet(existing, payload).list!
    // The typed-item id carries a random suffix in the real one — compare everything else.
    const strip = (l: StoredList) => ({ ...l, listItems: l.listItems.map(({ id, ...rest }) => ({ ...rest, idPrefix: id.split('-')[0] })) })
    expect(strip(real)).toEqual(strip(JSON.parse(JSON.stringify(twin.list)) as StoredList))
    expect(twin.added).toBe(3) // 102 + Oeufs + Beurre
  })

  it('is a javascript: URL with its body encoded once', () => {
    expect(FLIPP_BOOKMARKLET.startsWith('javascript:')).toBe(true)
    expect(decodeURIComponent(FLIPP_BOOKMARKLET.slice('javascript:'.length))).toBe(FLIPP_BOOKMARKLET_BODY)
    // ES5 on purpose: a bookmark runs in whatever browser the phone has.
    expect(FLIPP_BOOKMARKLET_BODY).not.toMatch(/=>|\bconst\b|\blet\b|`/)
  })
})
