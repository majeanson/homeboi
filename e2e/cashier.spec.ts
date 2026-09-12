import { test as base, expect, type Page } from '@playwright/test'
import { mockApi, seedState, type Theme, type Surface } from './mocks'
import { boxOf } from './measure'
import { boardWithDeals } from './dealFixture'

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

// The staged-deal fixture moved to e2e/dealFixture.ts on 2026-09-12: « Ma liste Flipp »
// left the till and reads the SAME board, and two copies is how two specs start
// proving different things about one payload.

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
    /** Every staged deal from a PAST flyer — the list a household forgot for a week. */
    allEnded?: boolean
  } = {},
) {
  const { theme = 'day', surface = 'mobile', viewport = PHONE, longText = false, guest = false, allEnded = false } = opts
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.setViewportSize(viewport)
  await mockApi(page, { longText })
  // Override the (static) mock board with one that has a deal on every line. Registered
  // AFTER mockApi so this handler wins for the board read; all other paths fall to mockApi.
  await page.route(/\/api\/board(\?|$)/, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(boardWithDeals(longText, allEnded)) }),
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
// « MONTRER FLIPP », ONE AFTER THE OTHER (2026-09-11). The door FRAMES Flipp's own
// item page over the till (flipp.com sends no X-Frame-Options / frame-ancestors —
// probed that day) and « Suivant » swaps the frame to the next live pick: one tap per
// item, no tab, no app switch. The URL is the DIRECT item page, not /action: /action
// is the Flipp iOS app's universal-link path and the app opened on its empty list
// instead of the item (lib/deals flippItemUrl). Every pick the pager lands on is
// marked shown (the tile ✓), and the grid's own door resumes at the first not shown.
test('« Montrer Flipp » frames Flipp\'s own item page and steps to the next pick — and only when a postal code exists', async ({ page }) => {
  await stubFlipp(page)
  await openGrid(page) // four picks, Flipp ids 101..104 — 104 ended, so three live
  await page.locator('.cashier__tile').first().click()
  const door = page.locator('button.bigcard__flipp')
  await expect(door).toBeVisible()
  await expect(door).toHaveText(/Montrer Flipp/)
  // The in-app flyer path stays beside it — the door is an addition, not a replacement.
  await expect(page.locator('.bigcard__flyer')).toBeVisible()
  await door.click()
  const pager = page.locator('.flipp-pager')
  await expect(pager).toBeVisible()
  const frame = pager.locator('iframe.flipp-pager__frame')
  await expect(frame).toHaveAttribute('src', 'https://flipp.com/fr-ca/item/101?postal_code=H2X%201Y4')
  // The same page in a real tab — the escape if Flipp ever refuses frames.
  const open = pager.locator('a.flipp-pager__open')
  await expect(open).toHaveAttribute('href', 'https://flipp.com/fr-ca/item/101?postal_code=H2X%201Y4')
  await expect(open).toHaveAttribute('target', '_blank')
  await expect(pager.locator('.flipp-pager__count')).toHaveText('1 de 3')
  await expect(pager.locator('.flipp-pager__prev')).toBeDisabled()
  // Flipp's cookie-consent card (312px, pinned to the frame's bottom, back on every
  // item) sits UNDER the fold: the frame's viewport is taller than the body showing
  // it, and the body scrolls (not clips) so a long item's foot stays reachable.
  const body = await boxOf(pager.locator('.flipp-pager__body'))
  const fr = await boxOf(frame)
  expect(fr.height - body.height, 'the frame runs past the body by at least the consent card').toBeGreaterThanOrEqual(312)
  await expect(pager.locator('.flipp-pager__body')).toHaveCSS('overflow-y', 'auto')
  await expectNoOverflow(page)
  await shot(page, 'flipp-pager')
  // Suivant → the next live pick's page, in place.
  await pager.locator('.flipp-pager__next').click()
  await expect(frame).toHaveAttribute('src', 'https://flipp.com/fr-ca/item/102?postal_code=H2X%201Y4')
  await expect(pager.locator('.flipp-pager__count')).toHaveText('2 de 3')
  await expect(pager.locator('.flipp-pager__prev')).toBeEnabled()
  // Keyboard mirror (the desktop rule): → steps too.
  await pager.locator('.flipp-pager__next').focus()
  await page.keyboard.press('ArrowRight')
  await expect(frame).toHaveAttribute('src', 'https://flipp.com/fr-ca/item/103?postal_code=H2X%201Y4')
  await expect(pager.locator('.flipp-pager__count')).toHaveText('3 de 3')
  // On the last one the primary reads « Terminé » and closes the pager.
  await expect(pager.locator('.flipp-pager__next')).toHaveText(/Terminé/)
  await pager.locator('.flipp-pager__next').click()
  await expect(pager).toHaveCount(0)
  // Back on the grid: every pick the pager showed wears the ✓, the ended one does not.
  await page.getByRole('button', { name: /Retour/ }).click()
  await expect(page.locator('.cashier__tile.is-shown')).toHaveCount(3)
  // The door is PER ITEM now (2026-09-12): the grid-wide « Montrer Flipp » went with
  // the Flipp row, so the pager opens on the pick whose card you tapped — which is the
  // one the cashier is holding. Tapping the second tile starts at the second pick.
  await page.locator('.cashier__reset').click()
  await page.locator('.cashier__tile').nth(1).click()
  await page.locator('button.bigcard__flipp').click()
  await expect(page.locator('.flipp-pager__count')).toHaveText('2 de 3')
  await page.locator('.flipp-pager').getByRole('button', { name: /Fermer/ }).click()
  await expect(page.locator('.flipp-pager')).toHaveCount(0)
})

test('without a postal code the Flipp door does not render at all', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await mockApi(page, { overrides: { household: { name: 'Maison Tremblay', postal: null, includedStores: [], aiEnabled: true } } })
  await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile' })
  await page.goto('/liste/cashier')
  await page.locator('.cashier__tile').first().waitFor({ state: 'visible', timeout: 15_000 })
  await page.locator('.cashier__tile').first().click()
  await expect(page.locator('.bigcard__price')).toBeVisible()
  await expect(page.locator('.bigcard__flipp')).toHaveCount(0)
  // …and the rest of the proof is untouched: the card degrades by losing one door,
  // not by losing its evidence.
  await expect(page.locator('.bigcard__valid')).toBeVisible()
  await expect(page.locator('.bigcard__flyer')).toBeVisible()
})

// THE FLIPP LOOP (2026-09-10). Marc: « any way to pre-create the list and then show
// it from flipp? ». Probed in a real browser: no. flipp.com's « Ajouter à la liste »
// writes that browser's OWN localStorage (`shopping_list`) and makes no request; the
// list page `/fr-ca/liste_dachats` ignores every URL param tried; the app's list is
// The doors open the real flipp.com in a popup: it is stubbed, the door is what's tested.
const stubFlipp = (page: Page) =>
  page.context().route('https://flipp.com/**', (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<title>flipp</title>' }))

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
  await expect(page.locator('.bigcard__flipp')).toHaveCount(0)
  // The rest of the proof stays: the price, the in-app flyer, the source.
  await expect(page.locator('.bigcard__price')).toContainText('24,97')
  await expect(page.locator('.bigcard__flyer')).toBeVisible()
  await shot(page, 'peek-ended')
  await expectNoOverflow(page)
})

// REFRESH THE ENDED DEALS. A week after « Choisir les meilleurs » the grid is all
// « Aubaine terminée » (Marc's list, 2026-09-10). One tap re-runs this week's best
// price for exactly those lines — read from the WRITE: the mock's /api/deals answers
// its Lait deal (id 101) to any query, so the ended « Couches » line (l4) gets it
// PATCHed on, and the live lines are never touched.
test('« rabais terminés · chercher ceux de cette semaine » re-stages only the ended lines', async ({ page }) => {
  const writes: { id?: string; deal?: { id: number } | null }[] = []
  page.on('request', (r) => {
    if (r.method() === 'PATCH' && new URL(r.url()).pathname === '/api/list') writes.push(JSON.parse(r.postData() ?? '{}'))
  })
  await openGrid(page)
  const btn = page.locator('button.cashier__refresh')
  await expect(btn).toHaveText(/1 rabais terminé · chercher ceux de cette semaine/)
  await btn.click()
  await expect.poll(() => writes.length, { timeout: 10_000 }).toBeGreaterThanOrEqual(1)
  expect(writes).toEqual([{ id: 'l4', deal: expect.objectContaining({ id: 101 }) }])
  await expect(page.getByText(/1 retrouvé/)).toBeVisible()
})

test('a guest sees no refresh button (it writes)', async ({ page }) => {
  await openGrid(page, { guest: true })
  await expect(page.locator('.cashier__tile.is-ended')).toHaveCount(1)
  await expect(page.locator('button.cashier__refresh')).toHaveCount(0)
})
