import { test, expect, type Page } from '@playwright/test'
import { mockApi, seedState } from './mocks'
import { boxOf } from './measure'
import { boardWithDeals } from './dealFixture'

// « Ma liste Flipp » — the LIST-level Flipp doors, on La liste.
//
// They used to live on « Montrer à la caisse ». Marc, 2026-09-12: « we should discern
// montrer à la caisse and flipp actions ». The two answer different questions at
// different moments — the till is for standing at a register with a cashier waiting;
// sending your list to Flipp is something you do at home before leaving — and the till,
// the one surface with someone waiting on you, was carrying both. These tests moved
// here with the doors; the till keeps only the per-item proof (cashier.spec.ts).
//
// The doors open the real flipp.com in a popup: it is stubbed, the door is what's tested.
const stubFlipp = (page: Page) =>
  page.context().route('https://flipp.com/**', (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<title>flipp</title>' }))

const PHONE = { width: 390, height: 844 }

async function openSheet(
  page: Page,
  opts: { allEnded?: boolean; postal?: string | null; open?: boolean; tillHidden?: string[] } = {},
) {
  const { allEnded = false, postal = 'H2X 1Y4', open = true, tillHidden } = opts
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.setViewportSize(PHONE)
  const household = { name: 'Maison Tremblay', postal, includedStores: [], aiEnabled: true, cashierExcludedStores: tillHidden ?? [] }
  await mockApi(page, postal === null || tillHidden ? { overrides: { household } } : {})
  // A deal on every line + two plain rows, one of them checked — the shape that makes
  // "what travels" answerable (shared fixture, e2e/dealFixture).
  await page.route(/\/api\/board(\?|$)/, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(boardWithDeals(false, allEnded)) }),
  )
  await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', calm: true, surface: 'mobile' })
  await page.goto('/liste')
  await page.locator('.hub').first().waitFor({ state: 'visible', timeout: 15_000 })
  if (open) await page.getByRole('button', { name: /Ma liste Flipp/ }).click()
}

test('the door is on La liste, beside the till — and the till no longer carries it', async ({ page }) => {
  await openSheet(page, { open: false })
  await expect(page.getByRole('button', { name: /Ma liste Flipp/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /Montrer à la caisse/ })).toBeVisible()

  // The till: no Flipp ROW any more. Its per-item proof door stays on the card.
  await page.getByRole('button', { name: /Montrer à la caisse/ }).click()
  await page.locator('.cashier__tile').first().waitFor({ state: 'visible', timeout: 15_000 })
  await expect(page.locator('.cashier__flipp')).toHaveCount(0)
  await expect(page.locator('a.cashier__copy')).toHaveCount(0)
  await expect(page.locator('a.cashier__send')).toHaveCount(0)
  await expect(page.locator('a.cashier__clear-flipp')).toHaveCount(0)
  await page.locator('.cashier__tile').first().click()
  await expect(page.locator('button.bigcard__flipp')).toBeVisible()
})

// THE ＋ FAB FLOATS OVER THE PAGE, and both shopping doors sit at the bottom of it.
// A control half-covered by another control is the documented reachability bug (the
// .list-row__del pane that swallowed clicks): the label still reads, so nothing looks
// wrong, and the taps land on the wrong thing. Measured against the FAB's real box.
test('neither shopping door sits under the ＋ FAB', async ({ page }) => {
  await openSheet(page, { open: false })
  const fab = await boxOf(page.locator('.add-fab'))
  for (const name of [/Montrer à la caisse/, /Ma liste Flipp/]) {
    const b = await boxOf(page.getByRole('button', { name }))
    const overlaps = b.x < fab.x + fab.width && b.x + b.width > fab.x && b.y < fab.y + fab.height && b.y + b.height > fab.y
    expect(overlaps, `${name} overlaps the ＋ FAB`).toBe(false)
  }
})

test('it says WHAT will travel before the tap — and that ticked lines stay home', async ({ page }) => {
  await openSheet(page)
  // 3 live deals (the 4th ended) + 2 typed rows… minus the checked one, which stays.
  await expect(page.locator('.flippsheet__what')).toHaveText(/5 articles · 3 rabais avec sa photo/)
  await expect(page.locator('.flippsheet__rule')).toContainText('Seulement ce qui reste à acheter part.')
  await expect(page.locator('.flippsheet__rule')).toContainText(/1 cochée reste ici/)
})

// The list rides in the ADDRESS (#bb=), where the bookmark reads it first: no copy
// step, no paste permission. Read back and decoded, it is Flipp's own clipping shape.
test('« Envoyer ma liste » opens flipp.com with the list in the address, in Flipp\'s list shape', async ({ page }) => {
  await stubFlipp(page)
  await openSheet(page)
  const door = page.locator('a.flippsheet__send')
  const href = await door.getAttribute('href')
  expect(href).toMatch(/^https:\/\/flipp\.com\/liste_dachats\?postal_code=H2X%201Y4#bb=[A-Za-z0-9_-]+$/)
  const [popup] = await Promise.all([page.context().waitForEvent('page'), door.click()])
  await popup.close()
  // Under the doors and PERSISTENT — a toast would be behind the flipp.com window.
  await expect(page.locator('.flippsheet__done')).toContainText(/partie avec le lien/)

  const payload = JSON.parse(
    await page.evaluate((h) => decodeURIComponent(escape(atob(h.split('#bb=')[1].replace(/-/g, '+').replace(/_/g, '/')))), href!),
  ) as { v: number; clippings: { flyerItemId: number; name: string; price: string; merchantName: string }[]; items: { term: string }[] }
  expect(payload.v).toBe(1)
  // The ended deal is not a clipping…
  expect(payload.clippings.map((c) => c.flyerItemId)).toEqual([101, 102, 103])
  // …it rides as a TYPED item instead, with the plain unchecked line. The checked one
  // (« Beurre ») is absent — that is the whole rule, asserted rather than described.
  expect(payload.items.map((i) => i.term)).toEqual(['Couches', 'Oeufs'])
  expect(payload.clippings[0]).toMatchObject({ name: 'Lait 2% 4L', price: '4.99', merchantName: 'Super C' })
})

test('« Envoyer sans les rabais » sends every unchecked line as words, no bookmark needed', async ({ page }) => {
  await stubFlipp(page)
  await openSheet(page, { allEnded: true })
  const send = page.locator('a.flippsheet__words')
  await expect(send).toBeVisible()
  // Five lines: the ended « Couches » included, the checked « Beurre » not.
  await expect(send).toHaveAttribute(
    'href',
    'https://flipp.com/action?command=add_text_to_list&texts=Lait%2CPain%2CPommes%2CCouches%2COeufs&postal_code=H2X%201Y4',
  )
  const [popup] = await Promise.all([page.context().waitForEvent('page'), send.click()])
  await popup.close()
  await expect(page.locator('.flippsheet__done')).toContainText(/5 lignes/)
})

test('« Ouvrir flipp.com » repeats the door, list included — only after a tap', async ({ page }) => {
  await stubFlipp(page)
  await openSheet(page)
  await expect(page.locator('a.flippsheet__open')).toHaveCount(0)
  const [popup] = await Promise.all([page.context().waitForEvent('page'), page.locator('a.flippsheet__send').click()])
  await popup.close()
  const again = await page.locator('a.flippsheet__open').getAttribute('href')
  expect(again).toMatch(/^https:\/\/flipp\.com\/liste_dachats\?postal_code=H2X%201Y4#bb=[A-Za-z0-9_-]+$/)
  expect(again).toBe(await page.locator('a.flippsheet__send').getAttribute('href'))
})

test('no postal code: one sentence and the door that fixes it, not four doors that would fail', async ({ page }) => {
  await openSheet(page, { postal: null })
  await expect(page.getByText(/Ajoute ton code postal/)).toBeVisible()
  await expect(page.locator('a.flippsheet__send')).toHaveCount(0)
  await expect(page.locator('a.flippsheet__words')).toHaveCount(0)
  await expect(page.locator('a.flippsheet__clear')).toHaveCount(0)
  await expect(page.getByRole('link', { name: /Ajouter mon code postal/ })).toBeVisible()
})

test('the « Comment ça marche » chip lands on the walkthrough card, even when the cards above load late', async ({ page }) => {
  await openSheet(page)
  // Registered after mockApi → wins: the store-filter card's data arrives 1.5 s late.
  await page.route(/\/api\/flyers(\?|$)/, async (route) => {
    await new Promise((r) => setTimeout(r, 1500))
    await route.fallback()
  })
  await page.locator('.flippsheet a[href^="/settings"]').click()
  const card = page.locator('#op-flipp')
  await expect(card).toBeVisible({ timeout: 15_000 })
  // Give the late rows time to land and the settle loop time to answer them.
  await page.waitForTimeout(3_000)
  const top = (await boxOf(card)).y // boxOf, never the bare call — the documented trap
  expect(Math.abs(top), `card top edge should sit at the top of the view, was ${top}px`).toBeLessThanOrEqual(40)
})

test.describe('on an iPhone', () => {
  test.use({
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  })
  test('the doors hand flipp.com to Safari itself, list included', async ({ page }) => {
    await openSheet(page)
    const href = await page.locator('a.flippsheet__send').getAttribute('href')
    expect(href).toMatch(/^x-safari-https:\/\/flipp\.com\/liste_dachats\?postal_code=H2X%201Y4#bb=[A-Za-z0-9_-]+$/)
    const clear = await page.locator('a.flippsheet__clear').getAttribute('href')
    expect(clear).toMatch(/^x-safari-https:\/\/flipp\.com\/liste_dachats\?postal_code=H2X%201Y4#bb=/)
  })
})

// Screenshots for the LOOK pass (LEAN.md: photograph the first screen at 390px and
// look — do not reason about it). Ignored by git, regenerated on demand.
test('capture the list, the sheet and the till at 390px', async ({ page }) => {
  await openSheet(page, { open: false })
  await page.screenshot({ path: 'e2e/screenshots/flipp-liste.png', fullPage: true })
  await page.getByRole('button', { name: /Ma liste Flipp/ }).click()
  await expect(page.locator('.flippsheet__what')).toBeVisible()
  await page.screenshot({ path: 'e2e/screenshots/flipp-sheet.png' })
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: /Montrer à la caisse/ }).click()
  await page.locator('.cashier__tile').first().waitFor({ state: 'visible', timeout: 15_000 })
  await page.screenshot({ path: 'e2e/screenshots/flipp-till.png', fullPage: true })

  // The walkthrough the two doors point at — numbered, one gesture per step.
  await page.goto('/settings?tab=liste&focus=flipp')
  await page.locator('#op-flipp').waitFor({ state: 'visible', timeout: 15_000 })
  await page.locator('#op-flipp').screenshot({ path: 'e2e/screenshots/flipp-reglages.png' })
})

// MARC'S BUG, 2026-09-12: « flipp didnt add one of maxi flyer deals ».
//
// « À la caisse : Non » (Réglages ▸ Magasinage) means « don't show me this store's own
// flyer at its own register » — the store you actually shop at. It says NOTHING about
// what belongs in Flipp, where browsing by store is the whole point. But the sheet was
// handed the TILL's picks, so a hidden store's deals were quietly demoted to typed
// words: the line still arrived, without its photo or price, which from Flipp looks
// exactly like « my deal wasn't added ».
test('a store hidden AT THE TILL still sends its deals to Flipp, with their photo', async ({ page }) => {
  await stubFlipp(page)
  await openSheet(page, { tillHidden: ['super c'] })
  const href = await page.locator('a.flippsheet__send').getAttribute('href')
  const payload = JSON.parse(
    await page.evaluate((h) => decodeURIComponent(escape(atob(h.split('#bb=')[1].replace(/-/g, '+').replace(/_/g, '/')))), href!),
  ) as { clippings: { flyerItemId: number; merchantName: string }[]; items: { term: string }[] }
  // Super C's deal (101) is STILL a clipping — with its photo, not demoted to a word.
  expect(payload.clippings.map((c) => c.flyerItemId)).toEqual([101, 102, 103])
  expect(payload.clippings.find((c) => c.merchantName === 'Super C')).toBeTruthy()
  expect(payload.items.map((i) => i.term)).not.toContain('Lait')

  // …and the till still honours the same setting: Super C's tile is not on the grid.
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: /Montrer à la caisse/ }).click()
  await page.locator('.cashier__tile').first().waitFor({ state: 'visible', timeout: 15_000 })
  await expect(page.locator('.cashier__tile')).toHaveCount(3)
  await expect(page.locator('.cashier__grid')).not.toContainText('Super C')
})
