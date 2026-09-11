import { test, expect, type Page, type APIRequestContext } from '@playwright/test'
import { FLIPP_BOOKMARKLET_BODY, flippListPayload, flippAddTextsUrl, type FlippPayload } from '../src/lib/flippList'
import type { Deal, Pick } from '../src/lib/deals'

// THE FLIPP LIVE CONTRACT — what flipp.com must still do for « Ma liste Flipp » to
// work, checked against the REAL site (e2e/flipp.config.ts: no Vite, no stubs).
//
// lib/flippList writes Flipp's own list storage in Flipp's own shape, from a
// bookmark that runs on their origin. Every fact that makes that work lives on
// THEIR side and was established by probing on 2026-09-10; none of it is documented
// anywhere, and all of it can move without notice. A comment saying "the shape is
// X" would stay green forever. This spec goes and looks:
//
//   1. a real « Ajouter à la liste » still stores the shape our payload writes
//      (theirs ⊇ ours — a field they dropped, or renamed, fails here and PRINTS the
//      new dump so the fix is a re-read, not a guess);
//   2. our bookmarklet, the exact string households save, still renders a payload
//      on their real list page — by store, with the clipping photos;
//   3. the routes still hold: the item page needs a postal code, `/liste_dachats`
//      BARE is the list, `/fr-ca/liste_dachats` is not;
//   4. (needs a Flipp account: FLIPP_EMAIL + FLIPP_PASSWORD) signing in after the
//      bookmark merges the local list into the account — the half that reaches the
//      phone app, read from their `joinLocalList` and exercised only here.
//
// A red run is never "fix the test": it is the fact that moved. Re-dump, then
// update lib/flippList — out loud, in a commit that says what changed.

const POSTAL = 'H2X1Y4'
const shot = (page: Page, name: string) => page.screenshot({ path: `e2e/screenshots/flipp/${name}.png`, fullPage: true })

interface SearchItem {
  flyer_item_id?: number
  flyer_id?: number
  name?: string
  current_price?: number | null
  merchant_id?: number
  merchant_name?: string
  merchant_logo?: string
  clean_image_url?: string
  clipping_image_url?: string
  valid_to?: string
  left?: number
  right?: number
  top?: number
  bottom?: number
}

/** Live search hits, one per store, priced, with an id — the same backend /api/deals reads. */
async function liveDeals(request: APIRequestContext, queries: string[], max: number): Promise<SearchItem[]> {
  const hits: SearchItem[] = []
  for (const q of queries) {
    const r = await request.get(`https://backflipp.wishabi.com/flipp/items/search?locale=fr-ca&postal_code=${POSTAL}&q=${encodeURIComponent(q)}`, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
    })
    expect(r.ok(), `search "${q}" answered ${r.status()}`).toBe(true)
    const { items } = (await r.json()) as { items: SearchItem[] }
    const it = items.find((x) => x.flyer_item_id && typeof x.current_price === 'number' && x.merchant_name && !hits.some((h) => h.merchant_name === x.merchant_name))
    if (it) hits.push(it)
    if (hits.length >= max) break
  }
  expect(hits.length, 'live search returned enough priced items from distinct stores').toBeGreaterThanOrEqual(Math.min(max, 2))
  return hits
}

/** A search hit as the Deal our /api/deals would serve — so the payload is built by
 *  the SAME lib/flippList code a household's till runs, not a hand copy of it. */
const asPick = (it: SearchItem, i: number): Pick => {
  const deal: Deal = {
    id: it.flyer_item_id ?? null,
    flyerId: it.flyer_id ?? null,
    name: it.name ?? '',
    price: typeof it.current_price === 'number' ? it.current_price : null,
    wasPrice: null,
    unitPrice: null,
    unitLabel: null,
    unitKind: null,
    unitApprox: false,
    merchant: it.merchant_name ?? '',
    logo: it.merchant_logo ?? null,
    premium: false,
    image: it.clean_image_url ?? it.clipping_image_url ?? null,
    validFrom: null,
    validTo: it.valid_to ?? null,
    merchantId: it.merchant_id ?? null,
    box:
      typeof it.left === 'number' && typeof it.right === 'number' && typeof it.top === 'number' && typeof it.bottom === 'number'
        ? { left: it.left, right: it.right, top: it.top, bottom: it.bottom }
        : null,
  }
  return { itemId: `live-${i}`, itemText: it.name ?? '', deal }
}

async function open(page: Page, path: string) {
  // flipp.com keeps long-lived connections open — networkidle never comes.
  await page.goto(`https://flipp.com${path}`, { waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: /accepter tout/i }).click({ timeout: 8_000 }).catch(() => {})
}

const stored = (page: Page) => page.evaluate(() => localStorage.getItem('shopping_list'))

/** Run the households' bookmark on the current page, with the paste stubbed. */
async function runBookmarklet(page: Page, payload: string) {
  await page.evaluate(
    ([body, pasted]) => {
      window.prompt = () => pasted
      window.confirm = () => true
      window.alert = (m: string) => {
        throw new Error('bookmarklet refused the payload: ' + m)
      }
      // eslint-disable-next-line no-eval
      eval(body)
    },
    // A headless context has no clipboard permission: readText rejects → the prompt.
    // Evaluated inline (no <script src>), so the body has no origin — import only.
    [FLIPP_BOOKMARKLET_BODY, payload] as const,
  )
  await page.waitForURL(/\/liste_dachats/, { timeout: 60_000 })
  await page.waitForTimeout(2_500)
}

test('1 · a real « Ajouter à la liste » still stores the shape lib/flippList writes', async ({ page, request }) => {
  const [it] = await liveDeals(request, ['lait', 'pain'], 1)
  await open(page, `/fr-ca/item/${it.flyer_item_id}?postal_code=${POSTAL}`)
  await expect(page.getByText(it.name!.slice(0, 20), { exact: false }).first()).toBeVisible({ timeout: 30_000 })
  await page.locator('button', { hasText: /ajouter à la liste/i }).first().click()
  await expect(page.locator('button', { hasText: /retirer de la liste/i }).first()).toBeVisible({ timeout: 15_000 })

  const raw = await stored(page)
  expect(raw, 'their add wrote localStorage.shopping_list').not.toBeNull()
  const theirs = JSON.parse(raw!) as Record<string, unknown> & { flyerItemClippings: Record<string, unknown>[] }

  // Ours, built by the same code the till runs, from the same item.
  const ours = JSON.parse(flippListPayload([asPick(it, 0)])) as FlippPayload
  const ourClipping = { ...ours.clippings[0], id: 'x' }

  // Top level: everything the bookmarklet reads or writes must still be there.
  for (const key of ['_outstandingOps', 'flyerItemClippings', 'listItems', 'photos', 'ecomItems', '_delegate']) {
    expect(theirs, `top-level key "${key}" — their dump: ${raw}`).toHaveProperty(key)
  }
  const real = theirs.flyerItemClippings.find((c) => c.flyerItemId === it.flyer_item_id)
  expect(real, `their clipping for ${it.flyer_item_id} — dump: ${raw}`).toBeTruthy()
  // Clipping: theirs ⊇ ours, and the two typed facts that matter.
  for (const key of Object.keys(ourClipping)) {
    expect(real, `clipping key "${key}" — their clipping: ${JSON.stringify(real)}`).toHaveProperty(key)
  }
  expect(real!.id).toBe(`item-clipping-${it.flyer_item_id}`)
  expect(typeof real!.price, 'price is stored as a STRING').toBe('string')
  await shot(page, '1-item-added')
})

test('2 · the bookmarklet renders a payload on their real list page, by store', async ({ page, request }) => {
  const hits = await liveDeals(request, ['lait', 'pain', 'poulet', 'pommes'], 3)
  const payload = flippListPayload(hits.map(asPick), ['Oeufs Babillard'])
  await open(page, `/liste_dachats?postal_code=${POSTAL}`)
  await runBookmarklet(page, payload)

  for (const it of hits) {
    await expect(page.getByText(it.merchant_name!, { exact: false }).first(), `store "${it.merchant_name}" on the list page`).toBeVisible({ timeout: 30_000 })
  }
  // The typed line too — their « Ma liste » group, the shape SLListItem reads.
  await expect(page.getByText('Oeufs Babillard', { exact: false }).first()).toBeVisible({ timeout: 30_000 })
  // The clippings render as their photos, not as text — count the photo tiles.
  const photos = page.locator('img[src*="wishabi.net/page_items"], img[src*="clean_image"]')
  await expect.poll(() => photos.count(), { timeout: 30_000 }).toBeGreaterThanOrEqual(hits.length)
  // And the storage is the LOCAL shape the bookmark wrote, untouched by the page.
  const list = JSON.parse((await stored(page))!) as { _delegate: boolean; flyerItemClippings: { flyerItemId: number }[] }
  expect(list._delegate).toBe(false)
  expect(list.flyerItemClippings.map((c) => c.flyerItemId).sort()).toEqual(hits.map((h) => h.flyer_item_id!).sort())
  await shot(page, '2-bookmarklet-list')
})

test('3 · the routes still hold: item page needs a postal; bare /liste_dachats is the list, the prefixed one is not', async ({ page, request }) => {
  const [it] = await liveDeals(request, ['lait', 'pain'], 1)
  // Without a postal code, in a FRESH browser: not the item (Flipp's error state) —
  // which is why lib/deals builds no door. Fresh matters: once any page has been
  // opened with a postal, flipp.com remembers it (`location_info` in storage) and
  // the bare item URL renders after all. This check therefore comes first.
  await open(page, `/fr-ca/item/${it.flyer_item_id}`)
  await page.waitForTimeout(4_000)
  await expect(page.getByText(it.name!.slice(0, 20), { exact: false })).toHaveCount(0)
  await shot(page, '3-item-no-postal')
  // With a postal code: the item.
  await open(page, `/fr-ca/item/${it.flyer_item_id}?postal_code=${POSTAL}`)
  await expect(page.getByText(it.name!.slice(0, 20), { exact: false }).first()).toBeVisible({ timeout: 30_000 })

  // A local list in storage: the bare route shows it, the prefixed shell does not.
  const payload = flippListPayload([asPick(it, 0)])
  await open(page, `/liste_dachats?postal_code=${POSTAL}`)
  await runBookmarklet(page, payload)
  await expect(page.getByText(it.merchant_name!, { exact: false }).first()).toBeVisible({ timeout: 30_000 })
  await open(page, `/fr-ca/liste_dachats?postal_code=${POSTAL}`)
  await page.waitForTimeout(4_000)
  await expect(page.locator('img[src*="wishabi.net/page_items"]')).toHaveCount(0)
})

test('4 · signed in, Flipp merges the local list into the account (the half that reaches the app)', async ({ page, request }) => {
  const email = process.env.FLIPP_EMAIL
  const password = process.env.FLIPP_PASSWORD
  // An EMAIL + PASSWORD account, made with « Inscrivez-vous » on /signin. One created
  // with « Connexion avec Google » has no Flipp password and Google refuses a
  // headless OAuth popup — Marc's own account is one of those (2026-09-10), so this
  // half was exercised by hand on the phone instead; a throwaway email account
  // makes it run here weekly.
  test.skip(!email || !password, 'needs a Flipp account: FLIPP_EMAIL + FLIPP_PASSWORD (never committed)')

  const hits = await liveDeals(request, ['lait', 'pain', 'poulet'], 2)
  const payload = flippListPayload(hits.map(asPick))
  await open(page, `/liste_dachats?postal_code=${POSTAL}`)
  await runBookmarklet(page, payload)

  // Sign in with the email form (/signin: email, password, the two consent boxes).
  const accountCalls: string[] = []
  page.on('request', (r) => {
    if (r.url().includes('flippback.com/accounts') && r.url().includes('shopping_lists')) accountCalls.push(`${r.method()} ${r.url()}`)
  })
  await open(page, '/signin')
  await page.locator('input[name="email"]').fill(email!)
  await page.locator('input[name="password"]').fill(password!)
  for (const box of ['terms', 'privacy']) {
    const cb = page.locator(`input[name="${box}"]`)
    if ((await cb.count()) && !(await cb.isChecked())) await cb.check({ force: true })
  }
  await page.getByRole('button', { name: /connectez-vous/i }).click()
  await page.waitForURL((u) => !u.pathname.includes('/signin'), { timeout: 60_000 })

  // The list page, signed in: joinLocalList runs, the local list becomes the
  // account's (a server PROXY, `_delegate: true`) and still carries our items.
  await open(page, `/liste_dachats?postal_code=${POSTAL}`)
  await expect
    .poll(async () => {
      const raw = await stored(page)
      if (!raw) return 'no storage'
      const l = JSON.parse(raw) as { _delegate?: boolean; flyerItemClippings?: { flyerItemId: number }[] }
      const ids = (l.flyerItemClippings ?? []).map((c) => c.flyerItemId)
      return `${l._delegate ? 'proxy' : 'local'}:${hits.every((h) => ids.includes(h.flyer_item_id!)) ? 'all' : 'missing'}`
    }, { timeout: 60_000, intervals: [1_000, 2_000, 4_000] })
    .toBe('proxy:all')
  expect(accountCalls.some((c) => c.startsWith('PUT') || c.startsWith('POST')), `a write reached the account list — saw: ${accountCalls.join(' | ')}`).toBe(true)
  for (const it of hits) {
    await expect(page.getByText(it.merchant_name!, { exact: false }).first()).toBeVisible({ timeout: 30_000 })
  }
  await shot(page, '4-signed-in-merged')
})

test('5 · « Envoyer à Flipp »: /action?command=add_text_to_list adds the lines as typed items and lands on the list', async ({ page }) => {
  const url = flippAddTextsUrl(['Oeufs Babillard', 'Pain, tranché'], POSTAL)!
  await page.goto(url, { waitUntil: 'domcontentloaded' })
  await page.waitForURL(/\/shopping_list|\/liste_dachats/, { timeout: 60_000 })
  await page.waitForTimeout(3_000)
  const raw = await stored(page)
  expect(raw, 'their /action wrote the list').not.toBeNull()
  const items = (JSON.parse(raw!) as { listItems: { term: string }[] }).listItems.map((i) => i.term)
  // The comma inside a line became a space: their splitter is a bare comma.
  expect(items).toEqual(['Oeufs Babillard', 'Pain tranché'])
  await shot(page, '5-action-add-texts')
})
