import { describe, it, expect } from 'vitest'
import {
  FLIPP_BOOKMARKLET_BODY,
  FLIPP_PASTE_PATH,
  flippBookmarklet,
  flippAddTextsUrl,
  flippListOpenUrl,
  flippLinkBookmarklet,
  parseFlippLinkHash,
  flippSendText,
  flippListPayload,
  mergeFlippList,
  parseFlippHash,
  encodeFlippExport,
  type FlippPayload,
  type FlippExport,
} from './flippList'
import type { Pick } from './deals'

// The bookmarklet is a STRING a household pastes into a bookmark — nothing compiles
// it, nothing types it, and it runs on flipp.com where we cannot watch it. So it is
// run here, against a fake page, and held to the readable twin it must not drift
// from. The storage shapes are Flipp's, dumped from a real session on 2026-09-10:
// a clipping (`SLFlyerItemClipping`) and a typed item (`SLListItem`: id, term, checked).

const ORIGIN = 'https://babillard.test'

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

/** Run the bookmarklet body on a fake flipp.com page. `clipboard` = what
 *  navigator.clipboard.readText resolves to (undefined = no clipboard API, 'REFUSED'
 *  = the permission was denied); `prompt` = what the paste box returns; `confirm`
 *  = the answer to « Coller ta liste Babillard dans Flipp ? ». */
async function run(opts: { stored?: string | null; clipboard?: string | 'REFUSED'; prompt?: string | null; confirm?: boolean; hostname?: string }) {
  const store = new Map<string, string>()
  if (opts.stored != null) store.set('shopping_list', opts.stored)
  const alerts: string[] = []
  const prompts: string[] = []
  const location = { href: 'https://flipp.com/fr-ca/item/101', hostname: opts.hostname ?? 'flipp.com' }
  const navigator =
    opts.clipboard === undefined
      ? {}
      : { clipboard: { readText: () => (opts.clipboard === 'REFUSED' ? Promise.reject(new Error('denied')) : Promise.resolve(opts.clipboard)) } }
  // The body is SERVED (public/flipp-paste.js) and reads the household's origin off
  // its own <script src> — the fake document carries that, as flipp.com's page would.
  const document = { currentScript: { src: ORIGIN + FLIPP_PASTE_PATH + '?v=1' } }
  const fn = new Function('localStorage', 'prompt', 'alert', 'confirm', 'location', 'navigator', 'document', FLIPP_BOOKMARKLET_BODY)
  fn(
    { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v) },
    (msg: string) => {
      prompts.push(msg)
      return opts.prompt === undefined ? null : opts.prompt
    },
    (m: string) => alerts.push(m),
    () => opts.confirm ?? true,
    location,
    navigator,
    document,
  )
  // The clipboard path is a promise; let it settle.
  for (let i = 0; i < 3; i++) await new Promise((r) => setTimeout(r, 0))
  const raw = store.get('shopping_list') ?? null
  return { stored: raw, list: raw ? (JSON.parse(raw) as StoredList) : null, alerts, prompts, location }
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

describe('the bookmarklet, run against a fake flipp.com page — Babillard → Flipp', () => {
  const payload = flippListPayload([pick('a'), pick('b', { id: 102, name: 'Pain' })], ['Oeufs', 'Beurre'])

  it('clipboard first: a Babillard payload there, OK → the list is written, no prompt', async () => {
    const r = await run({ clipboard: payload, confirm: true })
    expect(r.prompts).toEqual([])
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

  it('no clipboard API → the paste box; a pasted payload is written', async () => {
    const r = await run({ prompt: payload })
    expect(r.prompts).toHaveLength(1)
    expect(r.list!.flyerItemClippings).toHaveLength(2)
    expect(r.location.href).toBe('/liste_dachats')
  })

  it('clipboard refused (permission denied) → the paste box, same result', async () => {
    const r = await run({ clipboard: 'REFUSED', prompt: payload })
    expect(r.prompts).toHaveLength(1)
    expect(r.list!.flyerItemClippings).toHaveLength(2)
  })

  it('clipboard holds something else → the paste box (never a silent import of noise)', async () => {
    const r = await run({ clipboard: 'https://example.com', prompt: payload })
    expect(r.prompts).toHaveLength(1)
    expect(r.list!.flyerItemClippings).toHaveLength(2)
  })

  it('merges into an existing LOCAL list and never duplicates a flyer item or a term', async () => {
    const existing = JSON.stringify({
      _outstandingOps: [],
      flyerItemClippings: [{ id: 'item-clipping-101', flyerItemId: 101, name: 'déjà là' }],
      listItems: [{ id: 'oeufs-abc', term: 'oeufs', checked: true }],
      photos: [],
      ecomItems: [],
      _delegate: false,
    })
    const list = (await run({ stored: existing, prompt: payload })).list!
    expect(list.flyerItemClippings.map((c) => c.flyerItemId)).toEqual([101, 102])
    expect(list.flyerItemClippings[0].name).toBe('déjà là') // theirs wins; ours only adds
    // « oeufs » already there (checked, even) — kept as is, case-insensitively; « Beurre » added.
    expect(list.listItems.map((i) => [i.id, i.term, i.checked])).toEqual([
      ['oeufs-abc', 'oeufs', true],
      [expect.stringMatching(/^beurre-/), 'Beurre', false],
    ])
  })

  it('replaces a server PROXY list (logged in) with a local one — Flipp merges that itself', async () => {
    const proxy = JSON.stringify({ id: 'srv-9', commitVersion: 4, _delegate: true, flyerItemClippings: [{ id: 'x', flyerItemId: 555 }] })
    const list = (await run({ stored: proxy, prompt: payload })).list!
    expect(list._delegate).toBe(false)
    expect(list.id).toBeUndefined()
    expect(list.flyerItemClippings.map((c) => c.flyerItemId)).toEqual([101, 102])
  })

  it('a payload of typed items ONLY (no deal staged this week) is still a list', async () => {
    const list = (await run({ prompt: flippListPayload([], ['Lait']) })).list!
    expect(list.flyerItemClippings).toEqual([])
    expect(list.listItems.map((i) => i.term)).toEqual(['Lait'])
  })

  it('refuses anything that is not a Babillard payload, and writes nothing', async () => {
    for (const bad of ['not json', '{"v":2,"clippings":[],"items":[]}', '{"v":1,"clippings":[],"items":[]}', '[1,2]', '{"v":1}']) {
      const r = await run({ prompt: bad })
      expect(r.stored, `pasted ${JSON.stringify(bad)}`).toBeNull()
      expect(r.location.href).toBe('https://flipp.com/fr-ca/item/101')
      expect(r.alerts).toHaveLength(1)
    }
  })

  it('run anywhere but flipp.com: says so, goes to their list page, touches nothing (Marc ran it on Google)', async () => {
    for (const host of ['www.google.com', 'babillard.marcportal.com']) {
      const r = await run({ hostname: host, clipboard: payload, stored: '{"listItems":[]}' })
      expect(r.alerts).toHaveLength(1)
      expect(r.prompts).toEqual([])
      expect(r.location.href).toBe('https://flipp.com/liste_dachats')
      expect(r.stored).toBe('{"listItems":[]}') // that site's storage is not ours to write
    }
    // …and their own subdomain still counts as flipp.com.
    const ok = await run({ hostname: 'www.flipp.com', prompt: payload })
    expect(ok.list!.flyerItemClippings).toHaveLength(2)
  })

  it('Cancel on the paste box does nothing at all', async () => {
    const r = await run({ prompt: null, stored: '{"flyerItemClippings":[{"flyerItemId":1,"name":"x"}]}' })
    expect(r.alerts).toEqual([])
    expect(r.location.href).toBe('https://flipp.com/fr-ca/item/101')
  })

  it('agrees with its readable twin, mergeFlippList', async () => {
    const existing = JSON.stringify({ flyerItemClippings: [{ id: 'item-clipping-101', flyerItemId: 101 }], listItems: [], _delegate: false })
    const twin = mergeFlippList(existing, JSON.parse(payload) as FlippPayload, (key) => key + '-ID')
    const real = (await run({ stored: existing, prompt: payload })).list!
    // The typed-item id carries a random suffix in the real one — compare everything else.
    const strip = (l: StoredList) => ({ ...l, listItems: l.listItems.map(({ id, ...rest }) => ({ ...rest, idPrefix: id.split('-')[0] })) })
    expect(strip(real)).toEqual(strip(JSON.parse(JSON.stringify(twin.list)) as StoredList))
    expect(twin.added).toBe(3) // 102 + Oeufs + Beurre
  })
})

describe('flippAddTextsUrl — « Envoyer à Flipp », their /action door', () => {
  it('joins the lines on a bare comma, encoded once, with the postal', () => {
    expect(flippAddTextsUrl(['Lait', 'Pain tranché'], 'H2X 1Y4')).toBe(
      'https://flipp.com/action?command=add_text_to_list&texts=Lait%2CPain%20tranch%C3%A9&postal_code=H2X%201Y4',
    )
  })
  it('a comma inside a line becomes a space (their splitter is bare), blanks and doubles drop', () => {
    const u = flippAddTextsUrl([' Pain, tranché ', 'pain  tranché', '', 'Oeufs'])!
    expect(decodeURIComponent(u.split('texts=')[1])).toBe('Pain tranché,Oeufs')
  })
  it('a percent sign travels as its fullwidth twin — one « % » dropped their whole batch', () => {
    const u = flippAddTextsUrl(['Lait 2%', 'Yogourt 100% naturel'])!
    const texts = decodeURIComponent(u.split('texts=')[1])
    expect(texts).toBe('Lait 2％,Yogourt 100％ naturel')
    expect(texts).not.toContain('%')
    // …and what their handler does next (decodeURIComponent on the decoded value) no longer throws.
    expect(() => decodeURIComponent(texts)).not.toThrow()
  })
  it('a Flipp product name goes short: before the « | », at most 40 characters, cut on a word', () => {
    expect(flippSendText('MIEL BILLY BEE | BILLY BEE HONEY 500 g')).toBe('MIEL BILLY BEE')
    expect(flippSendText('POITRINES DE POULET DÉSOSSÉES SANS PEAU FORMAT FAMILIAL 2 KG')).toBe('POITRINES DE POULET DÉSOSSÉES SANS PEAU')
    expect(flippSendText('Lait')).toBe('Lait')
    const u = flippAddTextsUrl(['MIEL BILLY BEE | BILLY BEE HONEY 500 g', 'Miel Billy Bee'])!
    expect(decodeURIComponent(u.split('texts=')[1])).toBe('MIEL BILLY BEE') // and the two are one line
  })
  it('nothing to send → null (the caller falls back to the plain list door)', () => {
    expect(flippAddTextsUrl([], 'H2X 1Y4')).toBeNull()
    expect(flippAddTextsUrl([' ', ','])).toBeNull()
  })
})

describe('flippListOpenUrl — where the bookmark runs, as a link', () => {
  const IOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
  it('hands the page to Safari itself on iOS (an installed app opens an in-app window otherwise)', () => {
    expect(flippListOpenUrl('H2X 1Y4', IOS)).toBe('x-safari-https://flipp.com/liste_dachats?postal_code=H2X%201Y4')
  })
  it('is the plain page elsewhere', () => {
    expect(flippListOpenUrl('H2X 1Y4', 'Mozilla/5.0 (Linux; Android 14) Chrome/120')).toBe('https://flipp.com/liste_dachats?postal_code=H2X%201Y4')
    expect(flippListOpenUrl(null, 'Mozilla/5.0 (X11)')).toBe('https://flipp.com/liste_dachats')
  })
})

describe('the way back — Flipp → Babillard', () => {
  const theirs = JSON.stringify({
    _delegate: false,
    flyerItemClippings: [
      { id: 'item-clipping-77', flyerItemId: 77, name: 'Yogourt', flyerId: 9, price: '3.49', merchantId: 12, merchantName: 'IGA', merchantLogoUrl: 'l', thumbnailUrl: 't', validTo: '2026-09-16T23:59:59-04:00', checked: true },
      { id: 'bad', name: 'no id' },
    ],
    listItems: [
      { id: 'pain-x', term: 'Pain', checked: false },
      { id: 'oeufs-y', term: 'Oeufs', checked: true },
    ],
  })

  const decode = (href: string): FlippExport => {
    const hash = href.slice(href.indexOf('#'))
    const e = parseFlippHash(hash)
    if (!e) throw new Error('not a flipp hash: ' + href)
    return e
  }

  it('an EMPTY paste box + OK opens Babillard with their list in the URL', async () => {
    const r = await run({ stored: theirs, prompt: '   ' })
    expect(r.location.href.startsWith(ORIGIN + '/liste#flipp=')).toBe(true)
    const e = decode(r.location.href)
    expect(e.from).toBe('flipp')
    expect(e.clippings).toEqual([
      { flyerItemId: 77, name: 'Yogourt', flyerId: 9, price: '3.49', merchantId: 12, merchantName: 'IGA', merchantLogoUrl: 'l', thumbnailUrl: 't', validTo: '2026-09-16T23:59:59-04:00', checked: true },
    ])
    expect(e.items).toEqual([
      { term: 'Pain', checked: false },
      { term: 'Oeufs', checked: true },
    ])
  })

  it('a Babillard payload on the clipboard + Annuler = the way back instead of a paste', async () => {
    const r = await run({ stored: theirs, clipboard: flippListPayload([pick('a')]), confirm: false })
    expect(r.prompts).toEqual([])
    expect(r.location.href.startsWith(ORIGIN + '/liste#flipp=')).toBe(true)
    expect(JSON.parse(r.stored!).flyerItemClippings).toHaveLength(2) // theirs untouched
  })

  it('an empty Flipp list has nothing to bring back — says so, goes nowhere', async () => {
    const r = await run({ stored: '{"flyerItemClippings":[],"listItems":[]}', prompt: '' })
    expect(r.alerts).toHaveLength(1)
    expect(r.location.href).toBe('https://flipp.com/fr-ca/item/101')
  })

  it('parseFlippHash / encodeFlippExport round-trip, and refuse what is not an export', () => {
    const e: FlippExport = { v: 1, from: 'flipp', clippings: [], items: [{ term: 'Crème à café', checked: false }] }
    expect(parseFlippHash('#flipp=' + encodeFlippExport(e))).toEqual(e)
    expect(parseFlippHash('')).toBeNull()
    expect(parseFlippHash('#other=1')).toBeNull()
    expect(parseFlippHash('#flipp=' + encodeFlippExport({ ...e, from: 'x' as 'flipp' }))).toBeNull()
    expect(parseFlippHash('#flipp=!!!')).toBeNull()
  })
})

describe('the bookmark string itself — a LOADER, the body is served', () => {
  it('is a short javascript: URL that adds a <script> from the household origin, cache-busted', () => {
    const url = flippBookmarklet(ORIGIN)
    expect(url.startsWith('javascript:')).toBe(true)
    const loader = decodeURIComponent(url.slice('javascript:'.length))
    expect(loader).toContain(`s.src="${ORIGIN}${FLIPP_PASTE_PATH}?v="+Date.now()`)
    expect(loader).toContain('document.body.appendChild(s)')
    // Short on purpose: the full body as a bookmark ADDRESS stopped running on an
    // iPhone past ~3 KB (Safari showed its Favorites page instead).
    expect(url.length).toBeLessThan(400)
    // ES5 on purpose, both halves: a bookmark runs in whatever browser the phone has.
    expect(loader).not.toMatch(/=>|\bconst\b|\blet\b|`/)
    expect(FLIPP_BOOKMARKLET_BODY).not.toMatch(/=>|\bconst\b|\blet\b|`/)
  })

  it('the body reads its origin off its own <script src>, and has none without one', async () => {
    // A body run with no currentScript (a probe eval, an old-style paste) exports to
    // a RELATIVE /liste — never to someone else's origin.
    const r = await run({ stored: '{"listItems":[{"term":"x","checked":false}]}', prompt: '' })
    expect(r.location.href.startsWith(ORIGIN + '/liste#flipp=')).toBe(true)
  })

  it('refuses an origin that is not a plain origin (a quote would break the bookmark)', () => {
    expect(() => flippBookmarklet('https://x.test/"+alert(1)+"')).toThrow()
    expect(() => flippBookmarklet('http://localhost:5173')).not.toThrow()
  })
})

describe('the account link — Flipp → Babillard (« Lier Flipp »)', () => {
  const ORIGIN2 = 'https://babillard.test'
  it('the link bookmark is a short javascript: address that lands on settings with the session in the hash', () => {
    const url = flippLinkBookmarklet(ORIGIN2)
    expect(url.startsWith('javascript:')).toBe(true)
    const body = decodeURIComponent(url.slice('javascript:'.length))
    expect(body).toContain('flipp-login')
    expect(body).toContain(ORIGIN2 + '/settings?tab=liste&focus=flipp#flipp-link=')
    expect(body).not.toMatch(/=>|\bconst\b|\blet\b|`/) // ES5, runs in any phone browser
    expect(url.length).toBeLessThan(1400)
  })
  it('refuses a non-plain origin', () => {
    expect(() => flippLinkBookmarklet('https://x/"+alert(1)')).toThrow()
  })
  it('parseFlippLinkHash round-trips a payload and refuses anything else', () => {
    const enc = (o: unknown) => btoa(unescape(encodeURIComponent(JSON.stringify(o)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    expect(parseFlippLinkHash('#flipp-link=' + enc({ v: 1, userId: '42', token: 'Tok', email: 'a@b.c' }))).toEqual({ v: 1, userId: '42', token: 'Tok', email: 'a@b.c' })
    expect(parseFlippLinkHash('#flipp-link=' + enc({ v: 1, userId: '42', token: 'Tok' }))).toEqual({ v: 1, userId: '42', token: 'Tok', email: null })
    expect(parseFlippLinkHash('#flipp-link=' + enc({ v: 1, userId: '', token: 'x' }))).toBeNull()
    expect(parseFlippLinkHash('#flipp-link=' + enc({ v: 2, userId: '1', token: 'x' }))).toBeNull()
    expect(parseFlippLinkHash('#flipp=abc')).toBeNull()
    expect(parseFlippLinkHash('#flipp-link=!!!')).toBeNull()
  })
})
