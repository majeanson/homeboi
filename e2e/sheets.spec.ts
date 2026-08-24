import { test, expect, type Page } from '@playwright/test'
import { mockApi, seedState, type Theme } from './mocks'

// Visual capture of the overlay surfaces (sheets / modals) that screenshots.spec
// can't reach — they only exist after an interaction. Phone format (these are
// phone-first), day + night. Writes PNGs to e2e/screenshots for review; not
// pixel-regression. Run: npx playwright test sheets.spec.ts

const PHONE = { width: 390, height: 844 }

async function boot(page: Page, path: string, theme: Theme = 'day') {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.setViewportSize(PHONE)
  await mockApi(page)
  await seedState(page, { theme, audience: 'parent', lang: 'fr', calm: true, surface: 'mobile' })
  await page.goto(path)
  await page.locator('.hub, .page').first().waitFor({ state: 'visible', timeout: 15_000 }).catch(() => {})
  await page.evaluate(() => (document as any).fonts?.ready).catch(() => {})
}

const shoot = (page: Page, name: string) => page.screenshot({ path: `e2e/screenshots/${name}.png` })

// Open the recipe book (behind the Recettes sub-tab) and a recipe modal.
async function openRecipe(page: Page) {
  await page.locator('.subtabs__opt', { hasText: 'Recettes' }).click()
  // A recipe card now navigates STRAIGHT to the recipe view route
  // (/kitchen/recipe/:id) where the .recipe-modal lives — the old detail peek
  // (with its "Ouvrir la recette" button) was removed.
  await page.locator('.recipe-card').first().click()
  await page.locator('.recipe-modal').waitFor({ state: 'visible' })
}

for (const theme of ['day', 'night'] as Theme[]) {
  const sfx = theme === 'night' ? '-night' : ''

  test(`sheet-add-capture${sfx}`, async ({ page }) => {
    await boot(page, '/board', theme)
    await page.locator('.add-fab').click()
    // The board ＋ hoists the « Note rapide » box to the top of the sheet, so the
    // note input is visible immediately (no tile to pick first).
    await page.locator('.addsheet__lead input.edit-field__input').waitFor({ state: 'visible' })
    await page.waitForTimeout(250)
    await shoot(page, `sheet-add-capture-phone${sfx}`)
  })

  test(`sheet-recipe${sfx}`, async ({ page }) => {
    await boot(page, '/kitchen', theme)
    await openRecipe(page)
    await page.waitForTimeout(250)
    await shoot(page, `sheet-recipe-phone${sfx}`)
  })

  test(`sheet-cook-full${sfx}`, async ({ page }) => {
    // From a parent profile, "Cuisiner" opens the whole-recipe full view (the
    // toddler stepper is reached from the kid kitchen instead — see coverage spec).
    await boot(page, '/kitchen', theme)
    await openRecipe(page)
    await page.locator('.recipe-actions .btn--primary').click() // Cuisiner
    await page.locator('.cook').waitFor({ state: 'visible' })
    await page.locator('.cook__full').waitFor({ state: 'visible' })
    await page.waitForTimeout(250)
    await shoot(page, `sheet-cook-full-phone${sfx}`)
  })

  test(`sheet-deals${sfx}`, async ({ page }) => {
    await boot(page, '/liste', theme)
    await page.locator('.add-fab').click() // flyer browser lives in the ＋ sheet now
    await page.getByRole('dialog').getByRole('button', { name: /Parcourir/ }).click()
    await page.locator('.scene').waitFor({ state: 'visible' })
    await page.locator('.deal-stores .chip', { hasText: 'lait' }).first().click()
    await page.locator('.deal-list').waitFor({ state: 'visible' }).catch(() => {})
    await page.waitForTimeout(300)
    await shoot(page, `sheet-deals-phone${sfx}`)
  })

  test(`sheet-pricematch${sfx}`, async ({ page }) => {
    await boot(page, '/liste', theme)
    // The row's picture opens the edit scene now (compact-rows pass); the per-item
    // deals lookup is the « Voir les rabais » button inside it.
    await page.locator('.list-row__img').first().click()
    await page.locator('.scene .li-edit').waitFor({ state: 'visible' })
    await page.getByRole('button', { name: 'Voir les rabais' }).click()
    await page.locator('.scene').waitFor({ state: 'visible' })
    await page.locator('.deal-list').waitFor({ state: 'visible' }).catch(() => {})
    await page.waitForTimeout(300)
    await shoot(page, `sheet-pricematch-phone${sfx}`)
  })

  test(`sheet-cashier-grid${sfx}`, async ({ page }) => {
    await boot(page, '/liste', theme)
    await page.locator('.add-fab').click() // auto-pick (Meilleurs prix) lives in the ＋ sheet now
    await page.getByRole('button', { name: /Choisir les meilleurs/ }).click()
    await page.locator('.cashier').waitFor({ state: 'visible', timeout: 15_000 })
    await page.locator('.cashier__tile').first().waitFor({ state: 'visible' }).catch(() => {})
    await page.waitForTimeout(300)
    await shoot(page, `sheet-cashier-grid-phone${sfx}`)
  })
}

// Day-only one-offs (forms / secondary states).
test('scene-add-event', async ({ page }) => {
  await boot(page, '/board')
  await page.locator('.add-fab').click()
  // The board ＋ hoists capture to the top; the chooser below holds the override
  // tiles (event / chore / …). Pick the event tile BY NAME (capture is no longer a
  // tile, so positional .nth() would land on the wrong one). It's navigate-only —
  // it leaves the sheet for the full-screen /event/new scene.
  await page.locator('.cat-pick', { hasText: 'Rendez-vous' }).waitFor({ state: 'visible' })
  await Promise.all([
    page.waitForURL(/\/event\/new/),
    page.locator('.cat-pick', { hasText: 'Rendez-vous' }).click(),
  ])
  await page.locator('.scene input[type="date"]').waitFor({ state: 'visible' })
  await page.waitForTimeout(250)
  await shoot(page, 'scene-add-event-phone')
})

test('sheet-recipe-form', async ({ page }) => {
  await boot(page, '/kitchen')
  // The recipe builder is a standalone route (the ＋ recipe tile just navigates here).
  await page.goto('/kitchen/recipe/new')
  await page.locator('.recipe-modal').waitFor({ state: 'visible' })
  await page.waitForTimeout(250)
  await shoot(page, 'sheet-recipe-form-phone')
})

test('sheet-cashier-peek', async ({ page }) => {
  await boot(page, '/liste')
  await page.locator('.add-fab').click() // auto-pick (Meilleurs prix) lives in the ＋ sheet now
  await page.getByRole('button', { name: /Choisir les meilleurs/ }).click()
  await page.locator('.cashier').waitFor({ state: 'visible', timeout: 15_000 })
  // Random-access now: tap the tile of the item being scanned → its big proof peek
  // (no sequential present-stepper anymore). See CashierMode.
  await page.locator('.cashier__tile').first().click()
  await page.locator('.bigcard').waitFor({ state: 'visible' })
  await page.waitForTimeout(250)
  await shoot(page, 'sheet-cashier-peek-phone')
})

test('sheet-deals-store', async ({ page }) => {
  await boot(page, '/liste')
  await page.locator('.add-fab').click() // flyer browser lives in the ＋ sheet now
  await page.getByRole('dialog').getByRole('button', { name: /Parcourir/ }).click()
  await page.locator('.scene').waitFor({ state: 'visible' })
  await page.locator('.deal-tabs .subtabs__opt', { hasText: 'magasin' }).click()
  await page.locator('.flyer-stores').waitFor({ state: 'visible' }).catch(() => {})
  await page.waitForTimeout(300)
  await shoot(page, 'sheet-deals-store-phone')
})

test('sheet-cook-ings', async ({ page }) => {
  await boot(page, '/kitchen')
  await openRecipe(page)
  await page.locator('.recipe-actions .btn--primary').click() // Cuisiner
  await page.locator('.cook').waitFor({ state: 'visible' })
  await page.waitForTimeout(300)
  await shoot(page, 'sheet-cook-ings-phone')
})

test('routine-story', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.setViewportSize(PHONE)
  await mockApi(page)
  await seedState(page, { theme: 'day', audience: 'toddler', lang: 'fr', calm: true, surface: 'mobile' })
  await page.goto('/routines')
  await page.locator('.kid__face').first().click() // pick a routine → the picture-card story
  await page.locator('.tdl-stage').waitFor({ state: 'visible' })
  await page.waitForTimeout(300)
  await shoot(page, 'routine-story-phone')
})

test('sheet-flyer', async ({ page }) => {
  await boot(page, '/liste')
  await page.locator('.add-fab').click() // flyer browser lives in the ＋ sheet now
  await page.getByRole('dialog').getByRole('button', { name: /Parcourir/ }).click()
  await page.locator('.scene').waitFor({ state: 'visible' })
  await page.locator('.deal-tabs .subtabs__opt', { hasText: 'magasin' }).click()
  await page.locator('.flyer-store').first().click()
  await page.locator('.flyer-overlay').waitFor({ state: 'visible' })
  await page.waitForTimeout(400)
  await shoot(page, 'sheet-flyer-phone')
})

// « Depuis ce matin » (A-3) — the only sheet in this file with real assertions
// rather than a screenshot: the ⚠ calm guarantee (no cache/unread state once
// closed) is a DOM fact (the row list unmounts on close), not a pixel.
test('sheet-since-morning: open -> rows -> close leaves no residue', async ({ page }) => {
  await boot(page, '/board')
  await page.locator('.greet__btn').click()
  await expect(page.locator('.sheet.show')).toBeVisible()
  // One row per today-changes mock entry (list_item, meal, face-less event).
  await expect(page.locator('.ledger__row')).toHaveCount(3)
  await expect(page.getByText('Papa a ajouté du lait')).toBeVisible()
  await expect(page.getByText('Léa a proposé une pizza')).toBeVisible()
  await expect(page.getByText('Nouveau rendez-vous : Dentiste')).toBeVisible()
  await shoot(page, 'sheet-since-morning-phone')

  // Close — the query body unmounts (gcTime:0), so the rows leave the DOM at once,
  // not just slide off-screen behind the still-mounted `.sheet` shell. Every Sheet
  // instance is always-mounted (AddSheet, EntityDetailSheet…), so scope to the one
  // actually showing.
  await page.locator('.sheet.show .sheet__close').click()
  await expect(page.locator('.sheet.show')).toHaveCount(0)
  await expect(page.locator('.ledger__row')).toHaveCount(0)

  // Reopening re-fetches from cold (no stale "N new" carried over) — the same
  // three rows come back, proving the close wasn't a silent data loss either.
  await page.locator('.greet__btn').click()
  await expect(page.locator('.sheet.show')).toBeVisible()
  await expect(page.locator('.ledger__row')).toHaveCount(3)
})
