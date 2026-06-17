import { test, type Page } from '@playwright/test'
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
  await page.locator('.recipe-card').first().click()
  await page.locator('.recipe-modal').waitFor({ state: 'visible' })
}

for (const theme of ['day', 'night'] as Theme[]) {
  const sfx = theme === 'night' ? '-night' : ''

  test(`sheet-add-capture${sfx}`, async ({ page }) => {
    await boot(page, '/board', theme)
    await page.locator('.add-fab').click()
    await page.locator('.sheet__field input').waitFor({ state: 'visible' })
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
    await page.locator('.list-row__img').first().click()
    await page.locator('.scene').waitFor({ state: 'visible' })
    await page.locator('.deal-list').waitFor({ state: 'visible' }).catch(() => {})
    await page.waitForTimeout(300)
    await shoot(page, `sheet-pricematch-phone${sfx}`)
  })

  test(`sheet-cashier-review${sfx}`, async ({ page }) => {
    await boot(page, '/liste', theme)
    await page.locator('.add-fab').click() // auto-pick (Meilleurs prix) lives in the ＋ sheet now
    await page.getByRole('button', { name: /Choisir les meilleurs/ }).click()
    await page.locator('.cashier').waitFor({ state: 'visible', timeout: 15_000 })
    await page.locator('.review-row').first().waitFor({ state: 'visible' }).catch(() => {})
    await page.waitForTimeout(300)
    await shoot(page, `sheet-cashier-review-phone${sfx}`)
  })
}

// Day-only one-offs (forms / secondary states).
test('scene-add-event', async ({ page }) => {
  await boot(page, '/board')
  await page.locator('.add-fab').click()
  await page.locator('.sheet__field input').waitFor({ state: 'visible' })
  // The event tile is navigate-only now — it leaves the sheet for the
  // full-screen /event/new scene (tall forms strand under the keyboard).
  await Promise.all([
    page.waitForURL(/\/event\/new/),
    page.locator('.cat-pick').nth(1).click(),
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

test('sheet-cashier-present', async ({ page }) => {
  await boot(page, '/liste')
  await page.locator('.add-fab').click() // auto-pick (Meilleurs prix) lives in the ＋ sheet now
  await page.getByRole('button', { name: /Choisir les meilleurs/ }).click()
  await page.locator('.cashier').waitFor({ state: 'visible', timeout: 15_000 })
  // The "present" CTA moved from a bottom bar (.cashier__go) to the top bar next
  // to ✕ (iOS-toolbar-safe) — see CashierMode.
  await page.locator('.cashier__present').click()
  await page.locator('.bigcard').waitFor({ state: 'visible' })
  await page.waitForTimeout(250)
  await shoot(page, 'sheet-cashier-present-phone')
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
