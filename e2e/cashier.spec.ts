import { test as base, expect, type Page } from '@playwright/test'
import { BOARD, mockApi, seedState, flyerIso, type Theme, type Surface } from './mocks'

// Dedicated capture + guards for « Montrer à la caisse » — a CORE, high-stress moment
// (standing at the till with the cashier waiting). The mode is random-access: a GRID
// of picked deals; tap the one being scanned → its price proof blown up full-screen,
// ‹ Retour back to pick the next. The thing that MUST never break here is that the
// proof is shown CORRECTLY — store, item, big price, dates, "voir la circulaire" — and
// nothing is clipped or pushed off-screen, on any surface or under any name length.
//
// Screenshots (cashier-*.png) are for eyeballing; the hard assertions are "the key
// info is visible" + "no horizontal overflow". Crash-smoke guarded: a blank-portal
// render throws a pageerror and fails the test (how a render crash would surface).
const test = base.extend({
  page: async ({ page }, use) => {
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(e.message))
    await use(page)
    expect(errors, 'pageerror at the till').toEqual([])
  },
})

const PHONE = { width: 390, height: 844 }
const WALL = { width: 1280, height: 800 } // a wall tablet held up at the counter

const shot = (page: Page, name: string) =>
  page.screenshot({ path: `e2e/screenshots/cashier-${name}.png`, fullPage: false })

// No horizontal overflow anywhere in the till portal — a deal name or price must
// never spill off-screen, and every tile must contain its own content (long names
// ellipsize, they don't blow out the grid). Polled because images settle async.
async function noOverflow(page: Page): Promise<string> {
  return page.evaluate(() => {
    const doc = document.documentElement
    if (doc.scrollWidth > doc.clientWidth + 1) return 'doc-overflow'
    const portal = document.querySelector('.cashier') as HTMLElement | null
    if (portal && portal.scrollWidth > portal.clientWidth + 1) return 'cashier-overflow'
    for (const tile of Array.from(document.querySelectorAll('.cashier__tile')) as HTMLElement[]) {
      if (tile.scrollWidth > tile.clientWidth + 1) return 'tile-overflow'
    }
    return 'ok'
  })
}
const expectNoOverflow = (page: Page) =>
  expect.poll(() => noOverflow(page), { timeout: 6000, intervals: [200, 400, 800] }).toBe('ok')

// The unbreakable stress word the long-text fixture uses — reused here so the
// cashier's own staged deals get genuinely long names in the long-text tests.
const LONG = 'à la bolognaise maison avec béchamel gratinée Supercalifragilisticexpialidocieux'

// A staged deal per list line, so the grid has SEVERAL distinct tiles (different
// store / price / name) — the real high-stress shape. The mock board is static, so
// the spec serves this via its own board route override rather than staging writes.
const DEALS = [
  { id: 101, flyerId: 5001, name: 'Lait 2% 4L', price: 4.99, unitPrice: 1.25, unitLabel: '/L', merchant: 'Super C' },
  { id: 102, flyerId: 5002, name: 'Pain tranché blé entier', price: 2.49, unitPrice: 0.5, unitLabel: '/100g', merchant: 'IGA' },
  { id: 103, flyerId: 5001, name: 'Pommes Gala 3 lb', price: 3.99, unitPrice: 1.32, unitLabel: '/lb', merchant: 'Metro' },
  // ENDED on purpose (validTo two days back): the staged deal a household forgot
  // on its list from last week's flyer — Marc's mini-concombres at Provigo.
  { id: 104, flyerId: 5002, name: 'Couches Pampers méga', price: 24.97, unitPrice: null, unitLabel: null, merchant: 'Walmart', endedDaysAgo: 2 },
]
const stagedDeal = (d: (typeof DEALS)[number], long: boolean) => ({
  id: d.id,
  flyerId: d.flyerId,
  name: long ? `${d.name} ${LONG}` : d.name,
  price: d.price,
  wasPrice: null,
  unitPrice: d.unitPrice,
  unitLabel: d.unitLabel,
  unitKind: null,
  unitApprox: false,
  merchant: long ? `${d.merchant} ${LONG}` : d.merchant,
  logo: null,
  premium: true,
  // The mock serves /api/flyer-img as a tiny SVG, so the tile thumbnail + the peek's
  // two-column picture|facts layout both render (and the wide layout fills the space).
  image: `/api/flyer-img?d=${d.id}`,
  // Live-clock dates (the fixture doctrine of 2026-09-10): a fixed June date reads
  // as ENDED on every surface once the calendar passes it, silently.
  validFrom: flyerIso(-2),
  validTo: 'endedDaysAgo' in d && d.endedDaysAgo ? flyerIso(-d.endedDaysAgo) : flyerIso(4),
})
const boardWithDeals = (long: boolean) => ({
  ...BOARD,
  list: [
    ...BOARD.list.map((item, i) => ({
      ...item,
      text: long ? `${item.text} ${LONG}` : item.text,
      deal_json: JSON.stringify(stagedDeal(DEALS[i] ?? DEALS[0], long)),
    })),
    // Two plain lines — no deal — so « Ma liste Flipp » has typed items to carry;
    // the checked one must NOT go (it is already bought).
    { id: 'l5', text: 'Oeufs', source: 'manual' },
    { id: 'l6', text: 'Beurre', source: 'manual', checked_at: 1_700_000_000 },
  ],
})

// Open the till GRID with several picks. Both operator and guest just tap "Montrer à
// la caisse" — the picks come from a board route override (above mockApi) that stages
// a deal on every line, so no write is needed (writes are blocked for a guest anyway).
async function openGrid(
  page: Page,
  opts: {
    theme?: Theme
    surface?: Surface
    viewport?: { width: number; height: number }
    longText?: boolean
    guest?: boolean
    /** Flipp ids already opened by the loop on this device (see the Flipp loop tests). */
    clipped?: number[]
  } = {},
) {
  const { theme = 'day', surface = 'mobile', viewport = PHONE, longText = false, guest = false, clipped } = opts
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.setViewportSize(viewport)
  await mockApi(page, { longText })
  // Override the (static) mock board with one that has a deal on every line. Registered
  // AFTER mockApi so this handler wins for the board read; all other paths fall to mockApi.
  await page.route(/\/api\/board(\?|$)/, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(boardWithDeals(longText)) }),
  )
  await seedState(page, { theme, audience: 'parent', lang: 'fr', calm: true, surface })
  if (guest) await page.addInitScript(() => localStorage.setItem('babillard-guest-preview', '1'))
  if (clipped) await page.addInitScript((ids) => localStorage.setItem('babillard-flipp-clipped', JSON.stringify(ids)), clipped)
  await page.goto('/liste')
  await page.locator('.hub').first().waitFor({ state: 'visible', timeout: 15_000 })
  await page.getByRole('button', { name: /Montrer à la caisse/ }).click()
  await page.locator('.cashier__tile').first().waitFor({ state: 'visible', timeout: 15_000 })
  await page.evaluate(() => (document as any).fonts?.ready).catch(() => {})
}

// Tap a tile → its full-screen proof peek.
async function openPeek(page: Page) {
  await page.locator('.cashier__tile').first().click()
  await page.locator('.bigcard').waitFor({ state: 'visible' })
}

// --- The grid (pick the item being scanned) -------------------------------
for (const theme of ['day', 'night'] as Theme[]) {
  const sfx = theme === 'night' ? '-night' : ''
  test(`grid @phone${sfx}`, async ({ page }) => {
    await openGrid(page, { theme })
    // The high-stress essentials: more than one item, each identifiable by its
    // grocery name, with a price right there on the tile.
    expect(await page.locator('.cashier__tile').count()).toBeGreaterThan(1)
    await expect(page.locator('.cashier__tile-for').first()).toBeVisible()
    await expect(page.getByText(/4,99/).first()).toBeVisible()
    await shot(page, `grid-phone${sfx}`)
    await expectNoOverflow(page)
  })
}

test('grid @wall', async ({ page }) => {
  await openGrid(page, { surface: 'kiosk', viewport: WALL })
  expect(await page.locator('.cashier__tile').count()).toBeGreaterThan(1)
  await shot(page, 'grid-wall')
  await expectNoOverflow(page)
})

// --- The proof peek (hold it up to the cashier) ---------------------------
test('proof peek @phone', async ({ page }) => {
  await openGrid(page)
  await openPeek(page)
  // Everything the cashier needs, all visible: store, which item it's for, the BIG
  // price, the prominent validity date, and a way to open the whole flyer as proof.
  await expect(page.locator('.bigcard__store')).toContainText('Super C')
  await expect(page.locator('.bigcard__for')).toContainText('Lait')
  await expect(page.locator('.bigcard__price')).toContainText('4,99')
  await expect(page.locator('.bigcard__valid')).toContainText(/[0-9]/) // a dated line, not fine print
  await expect(page.getByRole('button', { name: /Voir la circulaire/ })).toBeVisible()
  // The peek is a clean proof: NO edit/delete buttons anywhere.
  await expect(page.locator('.row-actions__btn')).toHaveCount(0)
  await shot(page, 'peek-phone')
  await expectNoOverflow(page)
})

test('proof peek @wall', async ({ page }) => {
  await openGrid(page, { surface: 'kiosk', viewport: WALL })
  await openPeek(page)
  await expect(page.locator('.bigcard__price')).toContainText('4,99')
  await shot(page, 'peek-wall')
  await expectNoOverflow(page)
})

// --- Shown ✓ within-trip aid + reset --------------------------------------
test('shown check + reset', async ({ page }) => {
  await openGrid(page)
  await openPeek(page)
  await page.getByRole('button', { name: /Retour/ }).click() // ‹ Retour back to grid
  await page.locator('.cashier__tile').first().waitFor({ state: 'visible' })
  // The tile we just showed is dimmed with a ✓.
  await expect(page.locator('.cashier__tile.is-shown')).toHaveCount(1)
  await expect(page.locator('.cashier__tile-check')).toHaveCount(1)
  await shot(page, 'grid-shown')
  // "Tout réafficher" clears the marks (calm: it's only a within-trip aid).
  await page.getByRole('button', { name: /Tout réafficher/ }).click()
  await expect(page.locator('.cashier__tile.is-shown')).toHaveCount(0)
})

// --- Read-only guest (babysitter) -----------------------------------------
test('guest can view the proof', async ({ page }) => {
  await openGrid(page, { guest: true })
  await openPeek(page)
  // A guest reaches the till and sees the full proof (read path works under a
  // read-only session) — and, like everyone, no edit/delete buttons.
  await expect(page.locator('.bigcard__price')).toContainText('4,99')
  await expect(page.getByRole('button', { name: /Voir la circulaire/ })).toBeVisible()
  await expect(page.locator('.row-actions__btn')).toHaveCount(0)
  await shot(page, 'peek-guest')
  await expectNoOverflow(page)
})

// --- Long names stress (info displayed correctly, always) -----------------
for (const f of [
  { name: 'phone', viewport: PHONE, surface: 'mobile' as Surface },
  { name: 'wall', viewport: WALL, surface: 'kiosk' as Surface },
]) {
  test(`long names @${f.name}`, async ({ page }) => {
    await openGrid(page, { surface: f.surface, viewport: f.viewport, longText: true })
    await shot(page, `grid-long-${f.name}`)
    await expectNoOverflow(page) // long deal names ellipsize inside the tile, never spill
    await openPeek(page)
    // The price is still the loud, unmissable thing even with a giant name above it.
    await expect(page.locator('.bigcard__price')).toContainText('4,99')
    await shot(page, `peek-long-${f.name}`)
    await expectNoOverflow(page)
  })
}

// « MONTRER FLIPP » — the till card's primary door, and the two facts a real-browser
// probe of flipp.com established on 2026-09-10 that this must not drift from:
//   · the route is `/fr-ca/item/{flyer_item_id}?postal_code=…` — `/flyer_item/…` is a
//     404, `en-ca` redirected to a broken store page, and WITHOUT a postal code the
//     page renders Flipp's error state;
//   · so the link is built only when the household has a postal code. A dead link is
//     worse than none at exactly the moment a cashier is waiting.
// The fixture's deal id 101 is Flipp's flyer_item_id (deals.ts maps it to `deal.id`),
// and the mock household's postal is 'H2X 1Y4'.
test('« Montrer Flipp » opens Flipp\'s own item page — and only when a postal code exists', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await mockApi(page)
  await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile' })
  await page.goto('/liste/cashier')
  await page.locator('.cashier__tile').first().click()
  const door = page.locator('a.bigcard__flipp')
  await expect(door).toBeVisible()
  await expect(door).toHaveText(/Montrer Flipp/)
  await expect(door).toHaveAttribute('href', 'https://flipp.com/fr-ca/item/101?postal_code=H2X%201Y4')
  await expect(door).toHaveAttribute('target', '_blank')
  // The in-app path stays beside it — the door is an addition, not a replacement.
  await expect(page.locator('.bigcard__flyer')).toBeVisible()
})

test('without a postal code the Flipp door does not render at all', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await mockApi(page, { overrides: { household: { name: 'Maison Tremblay', postal: null, includedStores: [], aiEnabled: true } } })
  await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile' })
  await page.goto('/liste/cashier')
  await page.locator('.cashier__tile').first().waitFor({ state: 'visible', timeout: 15_000 })
  // The grid's Flipp loop needs the same postal code, so it is not built either.
  await expect(page.locator('.cashier__flipp')).toHaveCount(0)
  await page.locator('.cashier__tile').first().click()
  await expect(page.locator('.bigcard__price')).toBeVisible()
  await expect(page.locator('a.bigcard__flipp')).toHaveCount(0)
  // …and the rest of the proof is untouched: the card degrades by losing one door,
  // not by losing its evidence.
  await expect(page.locator('.bigcard__valid')).toBeVisible()
  await expect(page.locator('.bigcard__flyer')).toBeVisible()
})

// THE FLIPP LOOP (2026-09-10). Marc: « any way to pre-create the list and then show
// it from flipp? ». Probed in a real browser: no. flipp.com's « Ajouter à la liste »
// writes that browser's OWN localStorage (`shopping_list`) and makes no request; the
// list page `/fr-ca/liste_dachats` ignores every URL param tried; the app's list is
// account-synced behind an undocumented backend. So the grid steps through the picks
// with Flipp's own button — one tap opens the NEXT pick's item page — and where the
// loop stands is remembered per device (a clipping lives in that same browser).
// The popup would load the real flipp.com: it is stubbed, the loop is what's tested.
const stubFlipp = (page: Page) =>
  page.context().route('https://flipp.com/**', (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<title>flipp</title>' }))

test('the Flipp loop: one tap opens the next pick, and the step survives a reload', async ({ page }) => {
  await stubFlipp(page)
  await openGrid(page) // four picks, Flipp ids 101..104; household postal 'H2X 1Y4'
  const step = page.locator('a.cashier__clip')
  await expect(step).toHaveText(/1 de 3/) // four picks, one ended — it is not in the loop
  await expect(step).toHaveAttribute('href', 'https://flipp.com/fr-ca/item/101?postal_code=H2X%201Y4')
  await expect(step).toHaveAttribute('target', '_blank')
  // The list door sits beside it, on Flipp's list page for this postal code — and
  // it is the plain button while a step remains.
  const list = page.locator('a.cashier__flipp-list')
  // Bare route, no locale prefix: `/fr-ca/liste_dachats` is the marketing shell and
  // renders the flyers home (shipped that way for an hour; the probe that found the
  // real list view is the same one that proved a crafted list renders there).
  await expect(list).toHaveAttribute('href', 'https://flipp.com/liste_dachats?postal_code=H2X%201Y4')
  await expect(list).not.toHaveClass(/btn--primary/)
  await expectNoOverflow(page)
  const [popup] = await Promise.all([page.context().waitForEvent('page'), step.click()])
  await popup.close()
  await expect(step).toHaveText(/2 de 3/)
  await expect(step).toHaveAttribute('href', 'https://flipp.com/fr-ca/item/102?postal_code=H2X%201Y4')
  // Come back tomorrow, same phone: the loop is where it was left.
  await page.reload()
  await page.locator('.cashier__tile').first().waitFor({ state: 'visible', timeout: 15_000 })
  await expect(page.locator('a.cashier__clip')).toHaveText(/2 de 3/)
})

test('every pick on the list → the list door leads, and « Reprendre du début » restarts', async ({ page }) => {
  await openGrid(page, { clipped: [101, 102, 103] })
  await expect(page.locator('a.cashier__clip')).toHaveCount(0)
  await expect(page.locator('a.cashier__flipp-list')).toHaveClass(/btn--primary/)
  await page.getByRole('button', { name: /Reprendre du début/ }).click()
  await expect(page.locator('a.cashier__clip')).toHaveText(/1 de 3/)
})

// « MA LISTE FLIPP » ALSO COPIES THE PICKS — for the bookmark (lib/flippList) that
// pastes them into Flipp's own list on flipp.com. Read back from the clipboard: the
// payload is Flipp's clipping shape, one per pick with a Flipp id, and the notice
// says the copy happened. Chromium grants the clipboard to the test context.
test('« Ma liste Flipp » copies the picks in Flipp\'s list shape, and says so', async ({ page }) => {
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'])
  await stubFlipp(page)
  await openGrid(page)
  const [popup] = await Promise.all([page.context().waitForEvent('page'), page.locator('a.cashier__flipp-list').click()])
  await popup.close()
  await expect(page.getByText(/Rabais copiés/)).toBeVisible()
  const text = await page.evaluate(() => navigator.clipboard.readText())
  const payload = JSON.parse(text) as { v: number; clippings: { flyerItemId: number; name: string; price: string; merchantName: string }[] }
  expect(payload.v).toBe(1)
  expect(payload.clippings.map((c) => c.flyerItemId)).toEqual([101, 102, 103]) // the ended one is not pasted as a clipping…
  // …it rides as a TYPED item instead, with the plain unchecked line; the checked line stays home.
  expect((payload as unknown as { items: { term: string }[] }).items.map((i) => i.term)).toEqual(['Couches', 'Oeufs'])
  expect(payload.clippings[0]).toMatchObject({ name: 'Lait 2% 4L', price: '4.99', merchantName: 'Super C' })
})

// AN ENDED DEAL AT THE TILL. Marc, from the iPhone (2026-09-10): a staged deal from
// last week's Provigo flyer opened Flipp's « This item is expired » → « Circulaires
// de Undefined » page — a dead screen held up to a cashier. The list row already
// says « Aubaine terminée » (lib/deals dealEnded); the till now reads the same fact.
test('an ended deal: the tile says so, the card swaps the dates for the word, and there is no Flipp door', async ({ page }) => {
  await openGrid(page)
  const tile = page.locator('.cashier__tile', { hasText: 'Couches' })
  await expect(tile).toHaveClass(/is-ended/)
  await expect(tile.locator('.cashier__tile-ended')).toHaveText(/Aubaine terminée/)
  // The live tiles are untouched.
  await expect(page.locator('.cashier__tile.is-ended')).toHaveCount(1)
  await tile.click()
  await page.locator('.bigcard').waitFor({ state: 'visible' })
  await expect(page.locator('.bigcard__ended')).toContainText(/Aubaine terminée/)
  await expect(page.locator('.bigcard__valid')).toHaveCount(0)
  await expect(page.locator('a.bigcard__flipp')).toHaveCount(0)
  // The rest of the proof stays: the price, the in-app flyer, the source.
  await expect(page.locator('.bigcard__price')).toContainText('24,97')
  await expect(page.locator('.bigcard__flyer')).toBeVisible()
  await shot(page, 'peek-ended')
  await expectNoOverflow(page)
})
