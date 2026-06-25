import { test as base, expect, type Page } from '@playwright/test'
import { BOARD, mockApi, seedState, type Theme, type Surface } from './mocks'

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
  { id: 104, flyerId: 5002, name: 'Couches Pampers méga', price: 24.97, unitPrice: null, unitLabel: null, merchant: 'Walmart' },
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
  validFrom: null,
  validTo: '2026-06-30T23:59:59-04:00',
})
const boardWithDeals = (long: boolean) => ({
  ...BOARD,
  list: BOARD.list.map((item, i) => ({
    ...item,
    text: long ? `${item.text} ${LONG}` : item.text,
    deal_json: JSON.stringify(stagedDeal(DEALS[i] ?? DEALS[0], long)),
  })),
})

// Open the till GRID with several picks. Both operator and guest just tap "Montrer à
// la caisse" — the picks come from a board route override (above mockApi) that stages
// a deal on every line, so no write is needed (writes are blocked for a guest anyway).
async function openGrid(
  page: Page,
  opts: { theme?: Theme; surface?: Surface; viewport?: { width: number; height: number }; longText?: boolean; guest?: boolean } = {},
) {
  const { theme = 'day', surface = 'mobile', viewport = PHONE, longText = false, guest = false } = opts
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
  await expect(page.locator('.bigcard__valid')).toContainText('juin') // date is high-level, not fine print
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
