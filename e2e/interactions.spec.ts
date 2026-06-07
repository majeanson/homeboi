import { test, expect, type Page, type Request } from '@playwright/test'
import { mockApi, seedState, type Audience, type Lang } from './mocks'

// Interaction coverage: navigation, tabs, toggles, forms, and clicks across
// every surface. Complements screenshots.spec.ts (which only shoots static
// frames). Same frontend-only harness: Vite dev server + stubbed /api/** (see
// mocks.ts). Every write returns a generic { ok:true }, so for forms we assert
// the CORRECT request fired (method + path) rather than a refetched outcome;
// for the optimistic flows (list check, pantry clear) and pure-frontend ones
// (toggles, modals, the servings scaler) we assert the visible result.

const APP = (path: string, audience: Audience = 'parent', lang: Lang = 'fr') =>
  async (page: Page) => {
    // Emulate prefers-reduced-motion so the app's decorative loops (the toddler
    // picture-card float, entrance fades) are off. Otherwise an INFINITE CSS
    // animation never lets an element go "stable", and Playwright's click waits
    // for stability — a tap on the floating card would time out. (Done here, not
    // via test.use({ reducedMotion }), which doesn't reach the page in this setup.)
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await mockApi(page)
    await seedState(page, { theme: 'day', audience, lang, calm: true })
    await page.goto(path)
  }

// Wait for a surface's anchor element so we don't act on a half-mounted page.
async function settle(page: Page, ready: string) {
  await page.locator(ready).first().waitFor({ state: 'visible', timeout: 15_000 })
}

// A predicate matching one of our API calls by method + exact pathname (query
// strings ignored, so `deals?q=…` still matches 'deals').
const isApi = (method: string, path: string) => (r: Request) =>
  r.method() === method && new URL(r.url()).pathname === `/api/${path}`

// Run `action` and assert the expected API call fires as a result of it. The
// waiter is armed BEFORE the action so a fast request can't slip through.
async function expectApi(page: Page, method: string, path: string, action: () => Promise<void>) {
  await Promise.all([page.waitForRequest(isApi(method, path), { timeout: 15_000 }), action()])
}

// ───────────────────────────── navigation ──────────────────────────────

test.describe('navigation', () => {
  test('the marketing front door routes through setup to pair / login', async ({ page }) => {
    // A first-time visitor — signed out, no device role chosen — sees marketing.
    // (A returning device would be redirected straight to /board by the smart entry.)
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await mockApi(page, { signedIn: false })
    await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', calm: true })
    await page.goto('/')
    await settle(page, '.home__title')
    await page.locator('a[href="/setup"]').first().click()
    await expect(page).toHaveURL(/\/setup$/)
    // "Wall tablet" (first card) is the pairing path.
    await page.locator('.setup__choice').first().click()
    await expect(page).toHaveURL(/\/pair$/)
  })

  test('setup → personal device leads to sign-in', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await mockApi(page, { signedIn: false })
    await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', calm: true })
    await page.goto('/setup')
    await settle(page, '.setup__choices')
    // "My device" (second card) is the sign-in path.
    await page.locator('.setup__choice').nth(1).click()
    await expect(page).toHaveURL(/\/login$/)
  })

  test('hub nav switches every section and marks the active tab', async ({ page }) => {
    await APP('/board')(page)
    await settle(page, '.hub')
    for (const seg of ['kitchen', 'routines', 'liste', 'settings']) {
      await page.locator(`.hubnav a[href="/${seg}"]`).click()
      await expect(page).toHaveURL(new RegExp(`/${seg}$`))
      await expect(page.locator(`.hubnav a[href="/${seg}"]`)).toHaveClass(/is-active/)
    }
  })

  test('the corner gear deep-links into settings', async ({ page }) => {
    await APP('/board')(page)
    await settle(page, '.hub')
    await page.locator('a.page-gear').click()
    await expect(page).toHaveURL(/\/settings/)
    await expect(page.locator('.operator__tabs')).toBeVisible()
  })
})

// ─────────────────────────── settings tabs ─────────────────────────────

test.describe('settings tabs', () => {
  test('every sub-tab selects and shows its panel', async ({ page }) => {
    await APP('/settings')(page)
    await settle(page, '.operator__tabs')
    const tabs = page.getByRole('tab')
    const n = await tabs.count()
    expect(n).toBe(11)
    for (let i = 0; i < n; i++) {
      await tabs.nth(i).click()
      await expect(tabs.nth(i)).toHaveAttribute('aria-selected', 'true')
      await expect(page.locator('.operator__panel h2').first()).toBeVisible()
    }
  })
})

// ───────────────────────── display + calm toggles ──────────────────────

test.describe('toggles', () => {
  async function openDisplay(page: Page) {
    await APP('/settings')(page)
    await settle(page, '.operator__tabs')
    await page.getByRole('tab').nth(9).click() // Display
  }

  test('theme toggle flips the persisted theme', async ({ page }) => {
    await openDisplay(page)
    const btn = page.locator('.operator__seg').nth(0).locator('button')
    expect(await page.evaluate(() => localStorage.getItem('babillard-theme'))).toBe('day')
    await btn.click()
    await expect
      .poll(() => page.evaluate(() => localStorage.getItem('babillard-theme')))
      .toBe('night')
  })

  test('language toggle flips FR ↔ EN', async ({ page }) => {
    await openDisplay(page)
    const btn = page.locator('.operator__seg').nth(1).locator('button')
    await expect(btn).toHaveText('Français')
    await btn.click()
    await expect(btn).toHaveText('English')
  })

  test('audience switch flips the hub into the toddler layer', async ({ page }) => {
    await openDisplay(page)
    const toddler = page.locator('.audience-switch__opt').nth(1)
    await toddler.click()
    await expect(toddler).toHaveAttribute('aria-pressed', 'true')
    await expect(page.locator('.hub')).toHaveAttribute('data-audience', 'toddler')
  })

  test('calm toggle flips and persists the opt-out', async ({ page }) => {
    await APP('/settings')(page)
    await settle(page, '.operator__tabs')
    await page.getByRole('tab').nth(10).click() // Calm
    const btn = page.locator('.operator__panel button[aria-pressed]')
    await expect(btn).toHaveAttribute('aria-pressed', 'true')
    await btn.click()
    await expect(btn).toHaveAttribute('aria-pressed', 'false')
    await expect
      .poll(() => page.evaluate(() => localStorage.getItem('babillard-calm')))
      .toBe('off')
  })
})

// ───────────────────────────── auth form ───────────────────────────────

test('login posts credentials and lands on the board', async ({ page }) => {
  await APP('/login')(page)
  await settle(page, 'form')
  await page.locator('input[type="email"]').fill('famille@exemple.ca')
  await page.locator('input[type="password"]').fill('hunter2')
  await expectApi(page, 'POST', 'auth/login', () =>
    page.locator('button[type="submit"]').click(),
  )
  // Signing in is the personal-device path — land on the mobile home (the board).
  await expect(page).toHaveURL(/\/board$/)
})

// ─────────────────────────── settings forms ────────────────────────────

test.describe('settings forms', () => {
  test.beforeEach(async ({ page }) => {
    await APP('/settings')(page)
    await settle(page, '.operator__tabs')
  })

  test('add a household member', async ({ page }) => {
    const form = page.locator('.operator__panel form.operator__inline-form')
    await form.locator('input.input').first().fill('Mamie')
    await expectApi(page, 'POST', 'members', () => form.locator('button[type="submit"]').click())
  })

  test('add an event', async ({ page }) => {
    await page.getByRole('tab').nth(1).click() // Agenda
    const form = page.locator('.operator__panel form.operator__inline-form')
    await form.locator('input.input').first().fill('Réunion parents')
    await form.locator('input[type="date"]').fill('2026-07-01')
    await expectApi(page, 'POST', 'events', () => form.locator('button[type="submit"]').click())
  })

  test('add a chore', async ({ page }) => {
    await page.getByRole('tab').nth(2).click() // Chores
    const form = page.locator('.operator__chore-form')
    await form.locator('input.input').first().fill('Balayer la cuisine')
    await expectApi(page, 'POST', 'chores', () => form.locator('button[type="submit"]').click())
  })

  test('add a kid routine', async ({ page }) => {
    await page.getByRole('tab').nth(3).click() // Routines
    const form = page.locator('.operator__routine-form')
    await form.locator('.picker-chips').first().locator('.chip').first().click() // pick a child
    await form.locator('input.input').first().fill('Routine du soir')
    await expectApi(page, 'POST', 'routines', () => form.locator('button[type="submit"]').click())
  })

  test('save the shopping postal code', async ({ page }) => {
    await page.getByRole('tab').nth(4).click() // Shopping
    const form = page.locator('.operator__panel form.operator__inline-form')
    await form.locator('input.input').first().fill('H2X 1Y4')
    await expectApi(page, 'PATCH', 'household', () => form.locator('button[type="submit"]').click())
  })

  test('add a ghost-list staple', async ({ page }) => {
    await page.getByRole('tab').nth(5).click() // Ghost
    const form = page.locator('.operator__panel form.operator__inline-form')
    await form.locator('input.input').first().fill('Savon à vaisselle')
    await expectApi(page, 'PATCH', 'ghost', () => form.locator('button[type="submit"]').click())
  })

  test('claim a tablet with a 6-digit code', async ({ page }) => {
    await page.getByRole('tab').nth(6).click() // Devices
    const form = page.locator('.operator__claim form')
    await form.locator('input.input').first().fill('123456')
    await expectApi(page, 'POST', 'pair/claim', () => form.locator('button[type="submit"]').click())
  })

  test('generate the weekly recap', async ({ page }) => {
    await page.getByRole('tab').nth(8).click() // Recap
    await expectApi(page, 'GET', 'recap', () => page.locator('.operator__panel button').click())
    await expect(page.locator('.operator__panel')).toContainText('Belle semaine')
  })
})

// ───────────────────────── add sheet (capture) ─────────────────────────

test.describe('add sheet', () => {
  // On the mobile board the prominent quick-capture bar (.qcap) replaces the
  // floating ＋ FAB; it opens the same shared sheet.
  test('quick-capture posts the typed note', async ({ page }) => {
    await APP('/board')(page)
    await settle(page, '.hub')
    await page.locator('.qcap').click()
    await expect(page.locator('.sheet.show')).toBeVisible()
    await page.locator('.sheet__field input').fill('Acheter du lait')
    await expectApi(page, 'POST', 'capture', () =>
      page.locator('.sheet form button[type="submit"]').click(),
    )
  })

  test('switching to the event mode reveals the full event form', async ({ page }) => {
    await APP('/board')(page)
    await settle(page, '.hub')
    await page.locator('.qcap').click()
    await expect(page.locator('.sheet.show')).toBeVisible()
    // Wait for the sheet to finish mounting (capture input present) before
    // switching modes, so a cold-compiled first paint can't race the click.
    await expect(page.locator('.sheet__field input')).toBeVisible()
    await page.locator('.cat-pick').nth(1).click() // Event mode
    await expect(page.locator('.sheet input[type="date"]')).toBeVisible()
  })
})

// ──────────────────────────── kitchen ──────────────────────────────────

test.describe('kitchen', () => {
  test.beforeEach(async ({ page }) => {
    await APP('/kitchen')(page)
    await settle(page, '.hub')
  })

  test('add a running-low pantry item', async ({ page }) => {
    const form = page.locator('.kitchen__low-add')
    await form.locator('input.input').fill('Lait')
    await expectApi(page, 'POST', 'pantry', () => form.locator('button[type="submit"]').click())
  })

  test('clear a pantry item (optimistic) and delete after the undo window', async ({ page }) => {
    const lows = page.locator('.kitchen__low li')
    await expect(lows).toHaveCount(3)
    await expectApi(page, 'DELETE', 'pantry', () =>
      lows.first().locator('button.board__list-item').click(),
    )
    await expect(lows).toHaveCount(2)
  })

  test('undo restores a cleared pantry item', async ({ page }) => {
    const lows = page.locator('.kitchen__low li')
    await lows.first().locator('button.board__list-item').click()
    await expect(lows).toHaveCount(2)
    await expect(page.locator('.undo-toast')).toBeVisible()
    await page.locator('.undo-toast__btn').click()
    await expect(lows).toHaveCount(3)
  })

  test('planning a supper asks for its staples', async ({ page }) => {
    await page.locator('.kitchen__day-meal').first().click()
    const edit = page.locator('.kitchen__day-edit')
    await edit.locator('input.input').fill('Pizza maison')
    await expectApi(page, 'POST', 'meal-staples', () =>
      edit.locator('button[type="submit"]').click(),
    )
  })

  test('shop the week gathers ingredients and adds them to the list', async ({ page }) => {
    await page.getByRole('button', { name: /Magasiner la semaine/ }).click()
    await expect(page.locator('.kitchen__shop')).toBeVisible()
    await expectApi(page, 'POST', 'recipe-to-list', () =>
      page.locator('.kitchen__shop .btn--primary').click(),
    )
  })

  test('adding a use-soon item posts it (and never touches the list)', async ({ page }) => {
    const form = page.locator('.kitchen__soon-add')
    await form.locator('input.input').fill('Épinards')
    await expectApi(page, 'POST', 'use-soon', () => form.locator('button[type="submit"]').click())
  })
})

// ────────────────────────────── recipes ────────────────────────────────

test.describe('recipes', () => {
  test.beforeEach(async ({ page }) => {
    await APP('/kitchen')(page)
    await settle(page, '.hub')
  })

  test('the servings scaler rescales ingredient quantities', async ({ page }) => {
    await page.locator('.recipe-card').first().click() // Spaghetti, 4 servings
    const modal = page.locator('.recipe-modal')
    await expect(modal.locator('.recipe-view__ings')).toContainText('400 g')
    await modal.locator('[aria-label="Plus de portions"]').click() // 4 → 5 servings
    await expect(modal.locator('.recipe-view__ings')).toContainText('500 g')
  })

  test('a recipe pushes its ingredients to the list and opens cook mode', async ({ page }) => {
    await page.locator('.recipe-card').first().click()
    const modal = page.locator('.recipe-modal')
    await expectApi(page, 'POST', 'recipe-to-list', () =>
      modal.getByRole('button', { name: 'Ajouter à la liste' }).click(),
    )
    await modal.locator('.recipe-actions .btn--primary').click() // Cook
    await expect(page.locator('.cook')).toBeVisible()
  })

  test('a step with a duration offers a tappable cook-mode timer', async ({ page }) => {
    await page.locator('.recipe-card').first().click() // Spaghetti — steps carry durations
    const modal = page.locator('.recipe-modal')
    await modal.locator('.recipe-actions .btn--primary').click() // Cook
    const cook = page.locator('.cook')
    await expect(cook).toBeVisible()
    await cook.locator('.cook__arrow--next').click() // ingredients → step 1 ("10 minutes")
    const chip = cook.locator('.cook__timer-chip')
    await expect(chip).toBeVisible()
    await chip.click()
    await expect(cook.locator('.cook__timer-clock')).toContainText(':') // counting down mm:ss
  })

  test('"quoi cuisiner?" toggles a cookability ranking with badges', async ({ page }) => {
    const toggle = page.locator('.kitchen__cook-filter')
    await expect(toggle).toBeVisible() // pantry has out-of-stock items to rank against
    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-pressed', 'true')
    // None of the seeded recipes need Beurre/Café/Papier, so they read as ready.
    await expect(page.locator('.recipe-card__ready').first()).toBeVisible()
  })

  test('tag chips filter the recipe grid', async ({ page }) => {
    const cards = page.locator('.recipe-card')
    await expect(cards).toHaveCount(3)
    await page.locator('.kitchen__tag-filter .chip', { hasText: 'préféré' }).click()
    await expect(cards).toHaveCount(1) // only the recipe tagged "préféré"
    await page.locator('.kitchen__tag-filter .chip', { hasText: 'rapide' }).click()
    await expect(cards).toHaveCount(2) // two recipes tagged "rapide"
  })

  test('creating a recipe posts it', async ({ page }) => {
    await page.locator('.kitchen__head').nth(1).locator('button').click() // Add recipe
    const modal = page.locator('.recipe-modal')
    await modal.locator('.recipe-title-input').fill('Soupe aux légumes')
    await expectApi(page, 'POST', 'recipes', () =>
      modal.locator('.recipe-modal__foot button[type="submit"]').click(),
    )
  })
})

// ──────────────────────────── shared list ──────────────────────────────

test.describe('list', () => {
  test.beforeEach(async ({ page }) => {
    await APP('/liste')(page)
    await settle(page, '.today-feed')
  })

  test('checking an item removes it (optimistic) and patches the list', async ({ page }) => {
    const rows = page.locator('.list-row')
    await expect(rows).toHaveCount(4)
    // The write is deferred behind the undo toast, so the PATCH lands a few
    // seconds later (well within waitForRequest's window); the row goes at once.
    await expectApi(page, 'PATCH', 'list', () => rows.first().locator('.list-row__main').click())
    await expect(rows).toHaveCount(3)
  })

  test('undo restores a checked-off item', async ({ page }) => {
    const rows = page.locator('.list-row')
    await rows.first().locator('.list-row__main').click()
    await expect(rows).toHaveCount(3)
    await expect(page.locator('.undo-toast')).toBeVisible()
    await page.locator('.undo-toast__btn').click()
    await expect(rows).toHaveCount(4)
    await expect(page.locator('.undo-toast')).toHaveCount(0)
  })

  test('a ghost suggestion adds itself to the list', async ({ page }) => {
    await expectApi(page, 'POST', 'list', () =>
      page.locator('.ghost-strip__chip').first().click(),
    )
  })

  test('the flyer browser opens', async ({ page }) => {
    await page.locator('.list-actions').first().locator('button').click()
    await expect(page.locator('.pm-overlay .deals-search')).toBeVisible()
  })

  test('staging a deal from the browser adds it to the list (→ cashier)', async ({ page }) => {
    await page.locator('.list-actions').first().locator('button').click()
    await expect(page.locator('.deals-search')).toBeVisible()
    await page.locator('.deals-search input').fill('lait')
    await page.locator('.deals-search button[type="submit"]').click()
    await expect(page.locator('.deal').first()).toBeVisible()
    await expectApi(page, 'POST', 'list', () =>
      page.getByRole('button', { name: /Montrer à la caisse/ }).first().click(),
    )
  })

  test('the by-store tab opens a store flyer without searching', async ({ page }) => {
    await page.locator('.list-actions').first().locator('button').click()
    await expect(page.locator('.deal-tabs')).toBeVisible()
    await page.getByRole('button', { name: /Par magasin/ }).click()
    await expect(page.locator('.flyer-store').first()).toBeVisible()
    await page.locator('.flyer-store', { hasText: 'Super C' }).click()
    await expect(page.locator('.flyer-overlay')).toBeVisible()
  })
})

// ──────────────────────── toddler routine story ────────────────────────

test.describe('profile', () => {
  test('picking a face greets you on the board', async ({ page }) => {
    await APP('/board')(page)
    await settle(page, '.hub')
    await page.locator('.profile-chip').click()
    await expect(page.locator('.sheet.show')).toBeVisible()
    await page.locator('.profile-face', { hasText: 'Maman' }).click()
    await expect(page.locator('.greet')).toContainText('Maman')
  })

  test('the shared list shows who added an item', async ({ page }) => {
    await APP('/liste')(page)
    await settle(page, '.today-feed')
    // l1 (Lait) is seeded added_by m1 (Maman) → an "M" tint on that row.
    await expect(page.locator('.list-row__by').first()).toBeVisible()
  })

  test('kiosk switcher flips between a member and Maisonnée', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await mockApi(page)
    await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'kiosk' })
    await page.goto('/board')
    await settle(page, '.hub')
    await expect(page.locator('.mswitch')).toBeVisible()
    await page.locator('.mswitch__opt', { hasText: 'Papa' }).click()
    await expect(page.locator('.greet')).toContainText('Papa')
    await page.locator('.mswitch__opt', { hasText: 'Maisonnée' }).click()
    await expect(page.locator('.greet')).not.toContainText('Papa')
  })
})

test('toddler reads a step aloud, then starts + finishes it', async ({ page }) => {
  await APP('/routines', 'toddler')(page)
  await settle(page, '.kid')
  await page.locator('.kid__face').first().click()
  // Tapping the picture only reads it aloud — it must NOT mark the step done.
  const tap = page.locator('.tdl-illus--tap')
  await expect(tap).toBeVisible()
  await tap.click()
  // Doing it is the start → finish flow; finishing marks the step done (PATCH).
  await page.locator('.tdl-start').click()
  await expect(page.locator('.tdl-clock')).toBeVisible()
  await expectApi(page, 'PATCH', 'routines', () => page.locator('.tdl-finish').click())
})
