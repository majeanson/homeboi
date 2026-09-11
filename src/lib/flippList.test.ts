import { describe, it, expect } from 'vitest'
import {
  FLIPP_BOOKMARKLET_BODY,
  FLIPP_PASTE_PATH,
  flippBookmarklet,
  flippAddTextsUrl,
  flippListOpenUrl,
  flippSendText,
  flippListPayload,
  mergeFlippList,
  flippAccountOps,
  flippClearOps,
  FLIPP_CLEAR_PAYLOAD,
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
type FakeCall = { method: string; url: string; body: unknown }
/** A signed-in fake: Flipp's `flipp-login` cookie, as their page sets it. */
const SIGNED_IN = 'flipp-login=' + encodeURIComponent(JSON.stringify({ token: { access_token: 'tok-abc', user_id: 4242 } })) + '; users=%5B%5D'
async function run(opts: {
  stored?: string | null
  clipboard?: string | 'REFUSED'
  prompt?: string | null
  confirm?: boolean
  hostname?: string
  /** document.cookie on the fake page (SIGNED_IN = a session). */
  cookie?: string
  /** What the account list holds (signed in): lists → [{id}], the list → this. `null` = no list yet. */
  account?: { commit_version?: number; flyer_item_clippings?: unknown[]; list_items?: unknown[] } | null
  /** Force a status on one step: 'lists' | 'list' | 'put' | 'create'. */
  failAt?: { step: string; status: number }
  /** A REAL page (happy-dom): the bookmark draws its sheet; the fake page (default) has no body → confirm/prompt fallbacks. */
  dom?: boolean
}) {
  const store = new Map<string, string>()
  if (opts.stored != null) store.set('shopping_list', opts.stored)
  const alerts: string[] = []
  const prompts: string[] = []
  const calls: FakeCall[] = []
  const reply = (status: number, json: unknown) => Promise.resolve({ status, text: () => Promise.resolve(json == null ? '' : JSON.stringify(json)) })
  const fetch = (url: string, init: { method: string; body?: string }) => {
    calls.push({ method: init.method, url, body: init.body ? JSON.parse(init.body) : undefined })
    const fail = (step: string) => (opts.failAt?.step === step ? opts.failAt.status : null)
    const isLists = /\/shopping_lists$/.test(url)
    if (init.method === 'GET' && isLists) return reply(fail('lists') ?? 200, { shopping_lists: opts.account === null ? [] : [{ id: 'L1' }] })
    if (init.method === 'POST' && isLists) return reply(fail('create') ?? 201, { id: 'L-new', commit_version: 0 })
    if (init.method === 'GET') return reply(fail('list') ?? 200, opts.account ?? { commit_version: 7, flyer_item_clippings: [], list_items: [] })
    if (init.method === 'PUT') return reply(fail('put') ?? 200, {})
    return reply(500, null)
  }
  const location = { href: 'https://flipp.com/fr-ca/item/101', hostname: opts.hostname ?? 'flipp.com' }
  const navigator =
    opts.clipboard === undefined
      ? {}
      : { clipboard: { readText: () => (opts.clipboard === 'REFUSED' ? Promise.reject(new Error('denied')) : Promise.resolve(opts.clipboard)) } }
  // The body is SERVED (public/flipp-paste.js) and reads the household's origin off
  // its own <script src> — the fake document carries that, as flipp.com's page would.
  const fakeDoc = { currentScript: { src: ORIGIN + FLIPP_PASTE_PATH + '?v=1' }, cookie: opts.cookie ?? '' }
  // The real document, with the two things flipp.com's page would carry: the script's
  // src (the household origin) and the session cookie. Methods are bound so the Proxy
  // can stand in for `document` inside the body.
  const realDoc = new Proxy(globalThis.document, {
    get(t, k) {
      if (k === 'currentScript') return fakeDoc.currentScript
      if (k === 'cookie') return fakeDoc.cookie
      const v = Reflect.get(t, k, t)
      return typeof v === 'function' ? v.bind(t) : v
    },
  })
  const document = opts.dom ? realDoc : fakeDoc
  if (opts.dom) globalThis.document.body.innerHTML = ''
  const fn = new Function('localStorage', 'prompt', 'alert', 'confirm', 'location', 'navigator', 'document', 'fetch', FLIPP_BOOKMARKLET_BODY)
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
    fetch,
  )
  // The clipboard path and the account calls are promises; let them settle.
  const settle = async () => {
    for (let i = 0; i < 12; i++) await new Promise((r) => setTimeout(r, 0))
  }
  await settle()
  const snap = () => {
    const raw = store.get('shopping_list') ?? null
    return { stored: raw, list: raw ? (JSON.parse(raw) as StoredList) : null, alerts, prompts, location, calls }
  }
  /** The sheet's buttons, by key, in order — [] when no sheet is up. */
  const sheet = () => [...globalThis.document.querySelectorAll('#bb-flipp [data-bb]')].map((b) => b.getAttribute('data-bb'))
  const sheetTitle = () => globalThis.document.querySelector('#bb-flipp p')?.textContent ?? null
  /** Tap a sheet button, let the consequences settle, and read the page again. */
  const click = async (key: string) => {
    const b = globalThis.document.querySelector<HTMLButtonElement>(`#bb-flipp [data-bb="${key}"]`)
    if (!b) throw new Error(`no sheet button "${key}" — sheet has: ${sheet().join(', ')}`)
    b.click()
    await settle()
    return snap()
  }
  return { ...snap(), sheet, sheetTitle, click }
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

  it('the clipping picture is the flyer CUTOUT when the deal carries one (as Flipp\'s own add stores it), else the photo', () => {
    const out = JSON.parse(flippListPayload([pick('a', { cutout: 'https://f.wishabi.net/page_items/1/cut.jpg' }), pick('b', { id: 102 })])) as FlippPayload
    expect(out.clippings.map((c) => c.thumbnailUrl)).toEqual(['https://f.wishabi.net/page_items/1/cut.jpg', 'https://f.wishabi.net/p/1.jpg'])
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
    const list = (await run({ stored: existing, prompt: payload, confirm: false })).list! // Annuler = ADD
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
    const real = (await run({ stored: existing, prompt: payload, confirm: false })).list!
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

describe('the bookmarklet, SIGNED IN — the account list, by their own join PUT (2026-09-11)', () => {
  const payload = flippListPayload([pick('a'), pick('b', { id: 102, name: 'Pain' })], ['Oeufs', 'Beurre'])

  it('with a flipp-login cookie: GET lists → GET the first → PUT post ops, then their list page; the local list is left alone', async () => {
    const r = await run({ cookie: SIGNED_IN, prompt: payload })
    expect(r.alerts).toEqual([])
    expect(r.calls.map((c) => c.method + ' ' + c.url.replace('https://cdn-gateflipp.flippback.com/accounts', ''))).toEqual([
      'GET /v1/users/4242/shopping_lists',
      'GET /v1/users/4242/shopping_lists/L1',
      'PUT /v1/users/4242/shopping_lists/L1',
    ])
    const put = r.calls[2].body as { commit_version: number; _ops: { verb: string; object: Record<string, unknown> }[] }
    expect(put.commit_version).toBe(7)
    expect(put._ops.map((o) => [o.verb, o.object.type, o.object.flyer_item_id ?? o.object.term])).toEqual([
      ['post', 'flyer_item_clipping', 101],
      ['post', 'flyer_item_clipping', 102],
      ['post', 'list_item', 'Oeufs'],
      ['post', 'list_item', 'Beurre'],
    ])
    // The clipping op is the object their SLFlyerItemClipping.createOp('post') builds.
    expect(put._ops[0].object).toEqual({
      id: null,
      commit_version: null,
      type: 'flyer_item_clipping',
      flyer_item_id: 101,
      name: 'Lait 2% 4L',
      flyer_id: 5001,
      right: 20,
      left: 10,
      top: -5,
      bottom: -15,
      price: '4.99',
      merchant_id: 3384,
      merchant_name: 'Super C',
      merchant_logo_url: 'https://images.wishabi.net/m/1.png',
      thumbnail_url: 'https://f.wishabi.net/p/1.jpg',
      valid_to: '2026-09-16T23:59:59-04:00',
    })
    expect(r.stored).toBeNull() // nothing written locally — the page rebuilds from the account
    expect(r.location.href).toBe('/liste_dachats')
  })

  it('a clipping WITHOUT its box goes as a typed item (its short name), never as a clipping — one null-geometry row breaks their whole list layout', async () => {
    const noBox = flippListPayload([pick('a', { box: null, name: 'MIEL BILLY BEE | BILLY BEE HONEY 500 g' }), pick('b', { id: 102, name: 'Pain' })], ['Oeufs'])
    const r = await run({ cookie: SIGNED_IN, prompt: noBox })
    const put = r.calls[2].body as { _ops: { object: Record<string, unknown> }[] }
    expect(put._ops.map((o) => [o.object.type, o.object.flyer_item_id ?? o.object.term])).toEqual([
      ['flyer_item_clipping', 102],
      ['list_item', 'MIEL BILLY BEE'],
      ['list_item', 'Oeufs'],
    ])
    expect(put._ops).toEqual(flippAccountOps({ commit_version: 7, flyer_item_clippings: [], list_items: [] }, JSON.parse(noBox) as FlippPayload))
  })

  it('never re-posts a clipping or a term the account list already has (their own uniqueness)', async () => {
    const r = await run({ cookie: SIGNED_IN, prompt: payload, confirm: false, account: { commit_version: 3, flyer_item_clippings: [{ id: 9, flyer_item_id: 101 }], list_items: [{ id: 8, term: 'oeufs' }] } })
    const put = r.calls[2].body as { _ops: { object: Record<string, unknown> }[] }
    expect(put._ops.map((o) => o.object.flyer_item_id ?? o.object.term)).toEqual([102, 'Beurre'])
  })

  it('no list on the account yet → POST one, then PUT into it', async () => {
    const r = await run({ cookie: SIGNED_IN, prompt: payload, account: null })
    expect(r.calls.map((c) => c.method)).toEqual(['GET', 'POST', 'GET', 'PUT'])
    expect(r.calls[3].url).toMatch(/\/shopping_lists\/L-new$/)
  })

  it('their API refusing (a 401 on the lists) → says so with the step and status, writes nothing, goes nowhere', async () => {
    const r = await run({ cookie: SIGNED_IN, prompt: payload, failAt: { step: 'lists', status: 401 } })
    expect(r.alerts).toHaveLength(1)
    expect(r.alerts[0]).toMatch(/listes 401/)
    expect(r.calls).toHaveLength(1)
    expect(r.stored).toBeNull()
    expect(r.location.href).toBe('https://flipp.com/fr-ca/item/101')
  })

  it('a cookie that is not a session (no token) → the local path, as signed out', async () => {
    const r = await run({ cookie: 'flipp-login=' + encodeURIComponent('{"token":{}}'), prompt: payload })
    expect(r.calls).toEqual([])
    expect(r.list!.flyerItemClippings).toHaveLength(2)
  })

  it('agrees with its readable twin, flippAccountOps', async () => {
    const account = { commit_version: 1, flyer_item_clippings: [{ id: 1, flyer_item_id: 102 }], list_items: [{ id: 2, term: 'Beurre' }] }
    const r = await run({ cookie: SIGNED_IN, prompt: payload, confirm: false, account })
    const put = r.calls[2].body as { _ops: unknown[] }
    expect(put._ops).toEqual(flippAccountOps(account, JSON.parse(payload) as FlippPayload))
  })

  it('OK on the paste question = REPLACE: one PUT with a delete per existing row, then every payload row — « Vider » and « Coller » in one run', async () => {
    const account = {
      commit_version: 4,
      flyer_item_clippings: [{ id: 'old1', commit_version: 2, flyer_item_id: 101, name: 'Lait (vieux)' }, { id: 'old2', commit_version: 1, flyer_item_id: 555 }],
      list_items: [{ id: 'oi', commit_version: 1, term: 'Oeufs', checked: true }],
    }
    const r = await run({ cookie: SIGNED_IN, prompt: payload, confirm: true, account })
    expect(r.calls.map((c) => c.method)).toEqual(['GET', 'GET', 'PUT'])
    const put = r.calls[2].body as { commit_version: number; _ops: { verb: string; object: Record<string, unknown> }[] }
    expect(put.commit_version).toBe(4)
    expect(put._ops.map((o) => [o.verb, o.object.type, o.object.id ?? o.object.flyer_item_id ?? o.object.term])).toEqual([
      ['delete', 'flyer_item_clipping', 'old1'],
      ['delete', 'flyer_item_clipping', 'old2'],
      ['delete', 'list_item', 'oi'],
      ['post', 'flyer_item_clipping', 101], // re-posted fresh, even though 101 was there
      ['post', 'flyer_item_clipping', 102],
      ['post', 'list_item', 'Oeufs'],
      ['post', 'list_item', 'Beurre'],
    ])
    expect(put._ops).toEqual(flippAccountOps(account, JSON.parse(payload) as FlippPayload, true))
    expect(r.location.href).toBe('/liste_dachats')
  })

  it('REPLACE, signed out: the local list becomes exactly the payload (theirs dropped)', async () => {
    const existing = JSON.stringify({ _delegate: false, flyerItemClippings: [{ id: 'item-clipping-777', flyerItemId: 777, name: 'vieux' }], listItems: [{ id: 'x', term: 'Vieux', checked: false }] })
    const r = await run({ stored: existing, prompt: payload, confirm: true })
    expect(r.calls).toEqual([])
    expect(r.list!.flyerItemClippings.map((c) => c.flyerItemId)).toEqual([101, 102])
    expect(r.list!.listItems.map((i) => i.term)).toEqual(['Oeufs', 'Beurre'])
    const twin = mergeFlippList(existing, JSON.parse(payload) as FlippPayload, (k) => k, true)
    expect((twin.list.flyerItemClippings as { flyerItemId: number }[]).map((c) => c.flyerItemId)).toEqual([101, 102])
    expect(twin.added).toBe(4)
  })
})

describe('the SHEET the bookmark draws on flipp.com — real buttons, the right words (2026-09-11)', () => {
  const payload = flippListPayload([pick('a'), pick('b', { id: 102, name: 'Pain' })], ['Oeufs', 'Beurre'])
  const theirs = JSON.stringify({ _delegate: false, flyerItemClippings: [{ id: 'item-clipping-777', flyerItemId: 777, name: 'vieux' }], listItems: [{ id: 'x', term: 'Vieux', checked: false }] })

  it('a Babillard list on the clipboard → four named buttons, nothing done yet, no native dialog', async () => {
    const r = await run({ dom: true, stored: theirs, clipboard: payload })
    expect(r.prompts).toEqual([])
    expect(r.sheet()).toEqual(['replace', 'add', 'back', 'cancel'])
    expect(r.sheetTitle()).toBe('Liste Babillard : 2 rabais, 2 articles. Quoi faire ?')
    expect(JSON.parse(r.stored!).flyerItemClippings).toHaveLength(1) // theirs, untouched so far
    expect(r.location.href).toBe('https://flipp.com/fr-ca/item/101')
  })

  it('« Remplacer ma liste Flipp » → the list is the payload; the sheet is gone', async () => {
    const r = await run({ dom: true, stored: theirs, clipboard: payload })
    const after = await r.click('replace')
    expect(after.list!.flyerItemClippings.map((c) => c.flyerItemId)).toEqual([101, 102])
    expect(after.list!.listItems.map((i) => i.term)).toEqual(['Oeufs', 'Beurre'])
    expect(r.sheet()).toEqual([])
    expect(after.location.href).toBe('/liste_dachats')
  })

  it('« Ajouter à ma liste Flipp » → theirs kept, ours added', async () => {
    const r = await run({ dom: true, stored: theirs, clipboard: payload })
    const after = await r.click('add')
    expect(after.list!.flyerItemClippings.map((c) => c.flyerItemId)).toEqual([777, 101, 102])
    expect(after.list!.listItems.map((i) => i.term)).toEqual(['Vieux', 'Oeufs', 'Beurre'])
  })

  it('« Rapporter Flipp → Babillard » → the way back, from the same sheet', async () => {
    const r = await run({ dom: true, stored: theirs, clipboard: payload })
    const after = await r.click('back')
    expect(after.location.href.startsWith(ORIGIN + '/liste#flipp=')).toBe(true)
    expect(JSON.parse(after.stored!).flyerItemClippings).toHaveLength(1)
  })

  it('« Annuler » → nothing at all', async () => {
    const r = await run({ dom: true, stored: theirs, clipboard: payload })
    const after = await r.click('cancel')
    expect(JSON.parse(after.stored!).flyerItemClippings).toHaveLength(1)
    expect(after.location.href).toBe('https://flipp.com/fr-ca/item/101')
    expect(r.sheet()).toEqual([])
  })

  it('signed in, « Remplacer » is the one PUT: deletes, then the payload', async () => {
    const account = { commit_version: 4, flyer_item_clippings: [{ id: 'old1', commit_version: 2, flyer_item_id: 555 }], list_items: [] }
    const r = await run({ dom: true, cookie: SIGNED_IN, clipboard: payload, account })
    const after = await r.click('replace')
    const put = after.calls[2].body as { _ops: { verb: string; object: Record<string, unknown> }[] }
    expect(put._ops.map((o) => o.verb)).toEqual(['delete', 'post', 'post', 'post', 'post'])
  })

  it('nothing on the clipboard → the menu: paste, the way back, clear, cancel — and « Vider » asks again, naming what is lost', async () => {
    const account = { commit_version: 5, flyer_item_clippings: [{ id: 'c1', commit_version: 2, flyer_item_id: 101 }], list_items: [{ id: 'i1', commit_version: 3, term: 'Oeufs' }] }
    const r = await run({ dom: true, cookie: SIGNED_IN, clipboard: 'REFUSED', account })
    expect(r.prompts).toEqual([]) // no native box popped
    expect(r.sheet()).toEqual(['paste', 'back', 'clear', 'cancel'])
    await r.click('clear')
    expect(r.sheet()).toEqual(['clear', 'cancel'])
    expect(r.sheetTitle()).toMatch(/^Vider ta liste Flipp \? Tout ce qui s’y trouve/)
    const after = await r.click('clear')
    const put = after.calls[2].body as { _ops: { verb: string }[] }
    expect(put._ops.map((o) => o.verb)).toEqual(['delete', 'delete'])
    expect(after.location.href).toBe('/liste_dachats')
  })

  it('« Coller un texte… » opens the paste box, and a pasted list gets the same four buttons', async () => {
    const r = await run({ dom: true, clipboard: 'REFUSED', prompt: payload })
    expect(r.prompts).toEqual([])
    await r.click('paste')
    expect(r.prompts).toHaveLength(1)
    expect(r.sheet()).toEqual(['replace', 'add', 'back', 'cancel'])
    const after = await r.click('add')
    expect(after.list!.flyerItemClippings.map((c) => c.flyerItemId)).toEqual([101, 102])
  })
})

describe('« Vider ma liste Flipp » — the clear payload, and « vider » in the paste box', () => {
  const account = {
    commit_version: 5,
    flyer_item_clippings: [{ id: 'c1', commit_version: 2, flyer_item_id: 101, name: 'Lait', merchant_name: 'Super C', price: 4.99 }, { id: 'c2', commit_version: 1, flyer_item_id: 555 }],
    list_items: [{ id: 'i1', commit_version: 3, term: 'Oeufs', checked: true }],
  }

  it('the till payload parses as a clear; signed in → one delete op per row, echoing id + commit_version, then their list page', async () => {
    const r = await run({ cookie: SIGNED_IN, clipboard: FLIPP_CLEAR_PAYLOAD, confirm: true, account })
    expect(r.prompts).toEqual([])
    const put = r.calls[2].body as { commit_version: number; _ops: { verb: string; object: Record<string, unknown> }[] }
    expect(put.commit_version).toBe(5)
    expect(put._ops.map((o) => [o.verb, o.object.type, o.object.id, o.object.commit_version])).toEqual([
      ['delete', 'flyer_item_clipping', 'c1', 2],
      ['delete', 'flyer_item_clipping', 'c2', 1],
      ['delete', 'list_item', 'i1', 3],
    ])
    expect(put._ops).toEqual(flippClearOps(account))
    expect(r.location.href).toBe('/liste_dachats')
  })

  it('« Annuler » on the confirm clears nothing — no call, no write', async () => {
    const r = await run({ cookie: SIGNED_IN, clipboard: FLIPP_CLEAR_PAYLOAD, confirm: false, account })
    expect(r.calls).toEqual([])
    expect(r.stored).toBeNull()
    expect(r.location.href).toBe('https://flipp.com/fr-ca/item/101')
  })

  it('signed out → the local list is emptied (kept as a list, not removed)', async () => {
    const stored = JSON.stringify({ _delegate: false, flyerItemClippings: [{ id: 'x', flyerItemId: 1 }], listItems: [{ id: 'y', term: 'Lait', checked: false }] })
    const r = await run({ stored, prompt: 'vider', confirm: true })
    expect(r.calls).toEqual([])
    expect(r.list).toEqual({ _outstandingOps: [], flyerItemClippings: [], listItems: [], photos: [], ecomItems: [], _delegate: false })
    expect(r.location.href).toBe('/liste_dachats')
  })

  it('« vider » typed in the paste box (any case, spaces around) is the clear — and so is "clear", the word the EN how-to gives', async () => {
    const r = await run({ cookie: SIGNED_IN, prompt: '  Vider ', confirm: true, account })
    expect(r.calls.map((c) => c.method)).toEqual(['GET', 'GET', 'PUT'])
    const en = await run({ cookie: SIGNED_IN, prompt: 'Clear', confirm: true, account })
    expect(en.calls.map((c) => c.method)).toEqual(['GET', 'GET', 'PUT'])
  })

  it('« diag » typed in the paste box shows the account list\'s raw rows in a prompt, to copy', async () => {
    const r = await run({ cookie: SIGNED_IN, prompt: 'diag', account: { commit_version: 9, flyer_item_clippings: [{ id: 'c1', flyer_item_id: 101, thumbnail_url: null }], list_items: [] } })
    expect(r.calls.map((c) => c.method)).toEqual(['GET', 'GET'])
    expect(r.prompts).toHaveLength(2) // the paste box, then the dump
    expect(r.prompts[1]).toMatch(/^Copie ceci/)
    expect(r.location.href).toBe('https://flipp.com/fr-ca/item/101')
  })

  it('an empty account list → no PUT at all, straight to their page', async () => {
    const r = await run({ cookie: SIGNED_IN, prompt: 'vider', confirm: true, account: { commit_version: 1, flyer_item_clippings: [], list_items: [] } })
    expect(r.calls.map((c) => c.method)).toEqual(['GET', 'GET'])
    expect(r.location.href).toBe('/liste_dachats')
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

  it('a Babillard payload on the clipboard + Annuler = ADD to their list (the way back moved to the empty paste box)', async () => {
    const r = await run({ stored: theirs, clipboard: flippListPayload([pick('a')]), confirm: false })
    expect(r.prompts).toEqual([])
    expect(r.location.href).toBe('/liste_dachats')
    const list = JSON.parse(r.stored!) as StoredList
    expect(list.flyerItemClippings.map((c) => c.flyerItemId)).toEqual([77, undefined, 101]) // theirs kept, ours added
    expect(list.listItems.map((i) => i.term)).toEqual(['Pain', 'Oeufs'])
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
