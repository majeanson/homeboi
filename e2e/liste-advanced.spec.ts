import { test, expect, type Page } from '@playwright/test'
import { BOARD, mockApi, seedState } from './mocks'

// « La liste » wears two faces, one device flag (src/lib/listeMode) — the same shape
// as « Les notes », through the same shared ModeToggle:
//
//   SIMPLE (the default) — the shopping face. A row is a picture, a name and a
//     check. A press-and-hold opens the shared PEEK (deal, aisle, who added it) with
//     « Modifier » inside it; the picture's tap opens the flyer
//     clipping full-screen with the deal spelled out under it.
//   AVANCÉ — the ✏️/🗑 come back on every row. Not decoration: a long-press is
//     invisible to a mouse and unreachable from a keyboard, so this IS the
//     non-touch door to editing (CLAUDE.md: never leave a touch gesture as the
//     only path to an action).
//
// Guards the four moves of that pass, and that the default face doesn't quietly
// grow its furniture back.

// A 1×1 png, so a clipping actually renders in the harness.
const PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

/** The board fixture with a real image on the first item's staged deal. */
function boardWithClipping(opts: { validTo?: string } = {}) {
  const board = JSON.parse(JSON.stringify(BOARD))
  const item = board.list[0]
  const d = JSON.parse(item.deal_json)
  d.image = PNG
  if (opts.validTo !== undefined) d.validTo = opts.validTo
  item.deal_json = JSON.stringify(d)
  return board
}

async function openListe(page: Page, opts: { clipping?: boolean; validTo?: string } = {}) {
  await page.setViewportSize({ width: 390, height: 844 })
  await mockApi(
    page,
    opts.clipping ? { overrides: { board: boardWithClipping({ validTo: opts.validTo }) } } : {},
  )
  await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile' })
  await page.goto('/liste')
  await page.locator('.list-row').first().waitFor()
}

test('the circulaires shortcut is the loud one of the three', async ({ page }) => {
  await openListe(page)
  const flyer = page.locator('.list-actions__icon--flyer')
  await expect(flyer).toBeVisible()

  const sizes = await page.evaluate(() => {
    const w = (sel: string) => Math.round(document.querySelector(sel)!.getBoundingClientRect().width)
    return { flyer: w('.list-actions__icon--flyer'), quiet: w('.list-actions__icon.btn--ghost') }
  })
  // Bigger target than the quiet shortcuts beside it.
  expect(sizes.flyer).toBeGreaterThan(sizes.quiet)

  // …and it carries a real background rather than the ghost's transparency, which is
  // what "orange" has to mean in a test that can't judge a hue.
  const bg = await flyer.evaluate((el) => getComputedStyle(el).backgroundColor)
  expect(bg).not.toBe('rgba(0, 0, 0, 0)')
  expect(bg).not.toBe('transparent')
})

test('« Vider les cochés » spans the width on a phone', async ({ page }) => {
  await openListe(page)
  // It only exists once something is ticked — that is the point of the control.
  await expect(page.locator('.list-clear')).toHaveCount(0)
  await page.locator('.list-row__toggle').first().click()

  const bar = page.locator('.list-clear .btn')
  await bar.waitFor()
  const m = await page.evaluate(() => {
    const b = document.querySelector('.list-clear .btn') as HTMLElement
    const wrap = document.querySelector('.list-clear') as HTMLElement
    return { btn: b.getBoundingClientRect().width, wrap: wrap.getBoundingClientRect().width }
  })
  // Full width, not a small chip tucked to the right.
  expect(m.btn).toBeGreaterThan(m.wrap * 0.95)
})

test('tapping a clipping zooms the picture and names the deal under it', async ({ page }) => {
  await openListe(page, { clipping: true })

  const thumb = page.locator('.list-row__img--zoom img').first()
  await expect(thumb).toBeVisible()
  await thumb.click()

  await expect(page.locator('.zoom-overlay')).toBeVisible()
  // The whole reason the caption exists: « est-ce encore l'aubaine ? » answered
  // without leaving the list — the item, the store, the price, and (cashier-peek
  // parity) the flyer product's own name.
  const cap = page.locator('.zoom-overlay__cap')
  await expect(cap).toContainText('Super C')
  await expect(cap).toContainText('4,99')
  await expect(cap).toContainText('Lait 2% 4L')

  // The caption must not eat the backdrop tap that closes the viewer.
  await expect(cap).toHaveCSS('pointer-events', 'none')
})

test('an ended deal is flagged on the row, and the zoom caption says it loud', async ({ page }) => {
  // validTo well in the past → dealEnded. The fixture's default deal has no
  // validTo (never flagged — unknown ≠ ended), which the base test above covers.
  await openListe(page, { clipping: true, validTo: '2020-01-05' })

  // The quick « ! » indicator, readable while scanning the list itself.
  const warn = page.locator('.list-row__deal-ended').first()
  await expect(warn).toBeVisible()
  await expect(warn).toContainText('Aubaine terminée')

  // …and the zoomed clipping spells it out with the date it ran to.
  await page.locator('.list-row__img--zoom img').first().click()
  const cap = page.locator('.zoom-overlay__cap')
  await expect(cap.locator('.zoom-cap__ended')).toContainText('Aubaine terminée')
  await expect(cap).toContainText('janv.')
})

test('a live deal shows no ended flag', async ({ page }) => {
  // A validTo far in the future must NOT trip the warning.
  await openListe(page, { clipping: true, validTo: '2099-12-31' })
  await expect(page.locator('.list-row__deal-ended')).toHaveCount(0)
})

test('press and hold a row opens the peek; « Modifier » inside it opens the editor', async ({ page }) => {
  await openListe(page)
  const row = page.locator('.list-row').first()
  const box = (await row.boundingBox())!
  const x = box.x + box.width / 2
  const y = box.y + box.height / 2

  await page.mouse.move(x, y)
  await page.mouse.down()
  // LONG_PRESS_MS is 500; hold past it without travelling (travel aborts the hold).
  await page.waitForTimeout(750)
  await page.mouse.up()

  // In a shop the hold answers « est-ce encore l'aubaine ? / quelle allée ? / qui
  // l'a mis ? » without leaving the list — the editor is one tap further, inside.
  const peek = page.locator('.detail-sheet')
  await expect(peek).toBeVisible()
  // Cashier-peek parity: the staged deal's own product name and store · price
  // are spelled out in the peek, not just the row's short chip.
  await expect(peek).toContainText('Lait 2% 4L')
  await expect(peek).toContainText('Super C')
  await peek.getByRole('button', { name: /Modifier l’article/ }).click()
  await expect(page).toHaveURL(/\/liste\/item\//)
})

test('AVANCÉ is the non-touch door: it puts ✏️/🗑 back on every row', async ({ page }) => {
  await openListe(page)
  // Simple: rows carry no action furniture at all.
  await expect(page.locator('.list-row__acts')).toHaveCount(0)

  const toggle = page.locator('.mode-toggle')
  await expect(toggle).toHaveAttribute('aria-pressed', 'false')
  await toggle.click()

  await expect(toggle).toHaveAttribute('aria-pressed', 'true')
  const rows = await page.locator('.list-row').count()
  expect(await page.locator('.list-row__acts').count()).toBe(rows)

  // A plain CLICK on the edit button opens the item — the mouse/keyboard path that
  // the long-press alone would not give.
  await page.locator('.list-row__acts button').first().click()
  await expect(page).toHaveURL(/\/liste\/item\//)
})

test('the mode is device-local, so it survives a reload', async ({ page }) => {
  await openListe(page)
  await page.locator('.mode-toggle').click()
  await expect(page.locator('.list-row__acts').first()).toBeVisible()

  await page.reload()
  await page.locator('.list-row').first().waitFor()
  await expect(page.locator('.mode-toggle')).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('.list-row__acts').first()).toBeVisible()
})
