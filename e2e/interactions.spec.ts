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

  test('the login card cross-links to signup', async ({ page }) => {
    await APP('/login')(page)
    await settle(page, '.auth__card')
    await page.locator('.auth__alt a[href="/signup"]').click()
    await expect(page).toHaveURL(/\/signup$/)
    await settle(page, '.auth__card')
  })

  test('signup creates the household and lands in settings', async ({ page }) => {
    // Direct load (not a client-side hop): the first hit on this lazy route
    // cold-compiles in Vite on CI, and a mid-test dev-server reload would wipe
    // the filled form (see playwright.config.ts on lazy-route cold compiles).
    await APP('/signup')(page)
    await settle(page, '.auth__card')
    await page.locator('.auth__card input').first().fill('Maison Test')
    await page.locator('.auth__card input[type="email"]').fill('nouvelle@famille.ca')
    await page.locator('.auth__card input[type="password"]').fill('mot-de-passe-solide')
    const submit = page.locator('.auth__card button[type="submit"]')
    await expect(submit).toBeEnabled()
    // The create POST fires, then the flow lands in Réglages ▸ La maisonnée
    // (the obvious next step: add your family).
    await expectApi(page, 'POST', 'auth/signup', () => submit.click())
    await expect(page).toHaveURL(/\/settings\?tab=household$/)
    await expect(page.locator('.operator__tabs')).toBeVisible()
    await expect(page.getByRole('tab', { name: 'La maisonnée' })).toHaveAttribute('aria-selected', 'true')
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

  test('the nav audience switch enters the kid view as a one-way door', async ({ page }) => {
    await APP('/board')(page)
    await settle(page, '.hub')
    // Parent → Enfant: the toddler lens comes up and Réglages leaves the nav.
    await page.locator('.hubnav__peek').click()
    await expect(page.locator('.hub')).toHaveAttribute('data-audience', 'toddler')
    await expect(page.locator('.hubnav a[href="/settings"]')).toHaveCount(0)
    // The instant entry switch is gone — there's no one-tap flip back to the
    // parent view, and /settings redirects away. The only way out is the gated
    // exit switch (3s hold + math), so the door stays one-way for the child.
    await expect(page.locator('.hubnav__peek')).toHaveCount(0)
    await expect(page.locator('.kid-exit-switch')).toBeVisible()
    // goto reloads the shell, re-running seedState's init (which re-seeds parent);
    // pin the toddler lens first so the reloaded shell still bounces /settings → /board.
    await page.addInitScript(() => localStorage.setItem('babillard-audience', 'toddler'))
    await page.goto('/settings')
    await expect(page).toHaveURL(/\/board$/)
  })

  test('a locked kiosk (?kid=1) has no audience switch and no settings tab', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await mockApi(page)
    await page.goto('/board?kid=1')
    await settle(page, '.hub')
    await expect(page.locator('.hubnav__peek')).toHaveCount(0)
    await expect(page.locator('.hubnav a[href="/settings"]')).toHaveCount(0)
    await expect(page.locator('.add-fab')).toHaveCount(0)
    // The gated exit switch is the one allowed way out of a locked kiosk.
    await expect(page.locator('.kid-exit-switch')).toBeVisible()
  })

  test('the gated exit switch leaves the toddler lens after a 3s hold + correct math', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await mockApi(page)
    await page.goto('/board?kid=1')
    await settle(page, '.hub')
    await expect(page.locator('.hub')).toHaveAttribute('data-audience', 'toddler')

    // A sustained ~3s press on the footer switch arms the parental gate.
    const sw = page.locator('.kid-exit-switch')
    const box = await sw.boundingBox()
    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2)
    await page.mouse.down()
    await page.waitForTimeout(3300)
    await page.mouse.up()

    // Solve the arithmetic challenge it shows (random addends — read + sum them).
    const modal = page.locator('.kid-exit-modal')
    await expect(modal).toBeVisible()
    const q = await modal.locator('.kid-exit-modal__q span').first().innerText()
    const m = q.match(/(\d+)\s*\+\s*(\d+)/)
    await modal.locator('input').fill(String(Number(m![1]) + Number(m![2])))
    await modal.getByRole('button', { name: 'Sortir' }).click()

    // Lock cleared, back in the parent lens — the door opened for the adult.
    await expect(page.locator('.hub')).toHaveAttribute('data-audience', 'parent')
  })
})

// ─────────────────────────── settings tabs ─────────────────────────────

test.describe('settings tabs', () => {
  test('every sub-tab selects and shows its panel', async ({ page }) => {
    await APP('/settings')(page)
    await settle(page, '.operator__tabs')
    const tabs = page.getByRole('tab')
    const n = await tabs.count()
    // 14 sections: the in-app Guide (now first/default) + the 12 originals +
    // the AI-error journal (ai-log).
    expect(n).toBe(14)
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
    // By name, not index — adding a settings tab must not shift these tests.
    await page.getByRole('tab', { name: 'Affichage' }).click()
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
    await page.locator('.audience-switch__opt').nth(1).click()
    // Flipping to the kid lens in Réglages bounces out of settings (the one-way
    // door): the hub comes up in the toddler layer on the board.
    await expect(page.locator('.hub')).toHaveAttribute('data-audience', 'toddler')
    await expect(page).toHaveURL(/\/board$/)
  })

  test('calm toggle flips and persists the opt-out', async ({ page }) => {
    await APP('/settings')(page)
    await settle(page, '.operator__tabs')
    await page.getByRole('tab', { name: 'Mode calme' }).click()
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
    // Land on the default tab (Guide). It has no <button>/<form>, so each case
    // below can click its own tab and the panel locators wait for the target
    // panel to render — starting on a form-heavy tab would race the switch.
    await APP('/settings')(page)
    await settle(page, '.operator__tabs')
  })

  test('add a household member', async ({ page }) => {
    await page.getByRole('tab', { name: 'La maisonnée' }).click()
    const form = page.locator('.operator__panel form.operator__inline-form')
    await form.locator('input.input').first().fill('Mamie')
    await expectApi(page, 'POST', 'members', () => form.locator('button[type="submit"]').click())
  })

  test('add an event', async ({ page }) => {
    await page.getByRole('tab', { name: 'Rendez-vous' }).click()
    const form = page.locator('.operator__panel form.operator__inline-form')
    await form.locator('input.input').first().fill('Réunion parents')
    await form.locator('input[type="date"]').fill('2026-07-01')
    await expectApi(page, 'POST', 'events', () => form.locator('button[type="submit"]').click())
  })

  test('add a chore', async ({ page }) => {
    await page.getByRole('tab', { name: 'Corvées' }).click()
    const form = page.locator('.operator__chore-form')
    await form.locator('input.input').first().fill('Balayer la cuisine')
    await expectApi(page, 'POST', 'chores', () => form.locator('button[type="submit"]').click())
  })

  test('add a kid routine', async ({ page }) => {
    await page.getByRole('tab', { name: 'Routines (mode enfant)' }).click()
    const form = page.locator('.operator__routine-form')
    await form.locator('.picker-chips').first().locator('.chip').first().click() // pick a child
    await form.locator('input.input').first().fill('Routine du soir')
    await expectApi(page, 'POST', 'routines', () => form.locator('button[type="submit"]').click())
  })

  test('save the shopping postal code', async ({ page }) => {
    await page.getByRole('tab', { name: 'Magasinage' }).click()
    const form = page.locator('.operator__panel form.operator__inline-form')
    await form.locator('input.input').first().fill('H2X 1Y4')
    await expectApi(page, 'PATCH', 'household', () => form.locator('button[type="submit"]').click())
  })

  test('add a ghost-list staple', async ({ page }) => {
    await page.getByRole('tab', { name: 'Liste fantôme' }).click()
    const form = page.locator('.operator__panel form.operator__inline-form')
    await form.locator('input.input').first().fill('Savon à vaisselle')
    await expectApi(page, 'PATCH', 'ghost', () => form.locator('button[type="submit"]').click())
  })

  test('a frequent buy is offered for tracking — one deliberate tap tracks it', async ({ page }) => {
    await page.getByRole('tab', { name: 'Liste fantôme' }).click()
    // Tracking is conscious: candidates sit apart from the tracked rows, and
    // nothing enters the set until this tap.
    const chip = page.locator('.ghost-admin__candidate-chips .chip').first()
    await expect(chip).toBeVisible()
    await expectApi(page, 'PATCH', 'ghost', () => chip.click())
  })

  test('rename a bought-item history entry to a generic name (merge)', async ({ page }) => {
    await page.getByRole('tab', { name: 'Magasinage' }).click()
    // "Yogourt grec" is in the grocery history → rename it to the generic "Yogourt"
    // so quick-add folds it in and suggests the generic item.
    await page.locator('.ghost-admin__row', { hasText: 'Yogourt grec' }).getByRole('button', { name: 'Renommer' }).click()
    const form = page.locator('.ghost-admin__row form.operator__inline-form')
    await form.locator('input.input').fill('Yogourt')
    const [req] = await Promise.all([
      page.waitForRequest(isApi('PATCH', 'list')),
      form.getByRole('button', { name: 'Enregistrer' }).click(),
    ])
    expect(JSON.parse(req.postData() || '{}')).toMatchObject({ historyKey: 'yogourt grec', renameTo: 'Yogourt' })
  })

  test('remove a bought-item history entry so quick-add stops suggesting it', async ({ page }) => {
    await page.getByRole('tab', { name: 'Magasinage' }).click()
    const [req] = await Promise.all([
      page.waitForRequest(isApi('DELETE', 'list')),
      page.locator('.ghost-admin__row', { hasText: 'Bananes' }).getByRole('button', { name: 'Retirer' }).click(),
    ])
    expect(JSON.parse(req.postData() || '{}')).toMatchObject({ historyKey: 'bananes' })
  })

  test('claim a tablet with a 6-digit code', async ({ page }) => {
    await page.getByRole('tab', { name: 'Tablettes jumelées' }).click()
    const form = page.locator('.operator__claim form')
    await form.locator('input.input').first().fill('123456')
    await expectApi(page, 'POST', 'pair/claim', () => form.locator('button[type="submit"]').click())
  })

  test('generate the weekly recap', async ({ page }) => {
    await page.getByRole('tab', { name: 'Bilan de la semaine' }).click()
    await expectApi(page, 'GET', 'recap', () => page.locator('.operator__panel button').click())
    await expect(page.locator('.operator__panel')).toContainText('Belle semaine')
  })
})

// ───────────────────────── add sheet (capture) ─────────────────────────

test.describe('add sheet', () => {
  // The single floating ＋ FAB is the add affordance everywhere — and it is
  // CONTEXTUAL: the board keeps the quick-capture chooser, the other sections
  // open their own actions (tested below).
  test('quick-capture posts the typed note', async ({ page }) => {
    await APP('/board')(page)
    await settle(page, '.hub')
    await page.locator('.add-fab').click()
    await expect(page.locator('.sheet.show')).toBeVisible()
    await page.locator('.sheet__field input').fill('Acheter du lait')
    await expectApi(page, 'POST', 'capture', () =>
      page.locator('.sheet form button[type="submit"]').click(),
    )
  })

  test('switching to the event mode reveals the full event form', async ({ page }) => {
    await APP('/board')(page)
    await settle(page, '.hub')
    await page.locator('.add-fab').click()
    await expect(page.locator('.sheet.show')).toBeVisible()
    // Wait for the sheet to finish mounting (capture input present) before
    // switching modes, so a cold-compiled first paint can't race the click.
    await expect(page.locator('.sheet__field input')).toBeVisible()
    await page.locator('.cat-pick').nth(1).click() // Event mode
    await expect(page.locator('.sheet input[type="date"]')).toBeVisible()
  })

  test('the kitchen ＋ offers recipe / meal / pantry — no quick note', async ({ page }) => {
    await APP('/kitchen')(page)
    await settle(page, '.hub')
    await page.locator('.add-fab').click()
    await expect(page.locator('.sheet.show')).toBeVisible()
    await expect(page.locator('.cat-pick')).toHaveCount(3)
    await expect(page.locator('.cat-pick', { hasText: 'Note rapide' })).toHaveCount(0)
    // The meal planner is pre-selected (recipe is a navigate-only tile): day +
    // slot selects over a title field, posting the light {date, slot, title}.
    await expect(page.locator('.sheet__row select')).toHaveCount(2)
    await page.locator('.sheet .sheet__field input').fill('Spaghetti')
    await expectApi(page, 'POST', 'meals', () =>
      page.locator('.sheet form button[type="submit"]').click(),
    )
  })

  test('the liste ＋ adds straight to the list (no chooser)', async ({ page }) => {
    await APP('/liste')(page)
    await settle(page, '.hub')
    await page.locator('.add-fab').click()
    await expect(page.locator('.sheet.show')).toBeVisible()
    await expect(page.locator('.cat-pick')).toHaveCount(0) // single action → direct form
    await page.locator('.sheet__field input').fill('Beurre')
    await expectApi(page, 'POST', 'list', () =>
      page.locator('.sheet form button[type="submit"]').click(),
    )
  })

  test('the routines ＋ opens the routine builder directly', async ({ page }) => {
    await APP('/routines')(page)
    await settle(page, '.hub')
    await page.locator('.add-fab').click()
    await expect(page.locator('.sheet.show')).toBeVisible()
    await expect(page.locator('.cat-pick')).toHaveCount(0)
    await expect(page.locator('.sheet .operator__routine-form')).toBeVisible()
  })
})

// ──────────────────────────── kitchen ──────────────────────────────────

test.describe('kitchen', () => {
  test.beforeEach(async ({ page }) => {
    await APP('/kitchen')(page)
    await settle(page, '.hub')
  })

  test('add a running-low pantry item', async ({ page }) => {
    await page.locator('.subtabs__opt', { hasText: 'Garde-manger' }).click()
    const form = page.locator('.kitchen__low-add')
    await form.locator('input.input').fill('Lait')
    await expectApi(page, 'POST', 'pantry', () => form.locator('button[type="submit"]').click())
  })

  test('checking a low item adds it to the list (explicit) and clears the reminder', async ({ page }) => {
    await page.locator('.subtabs__opt', { hasText: 'Garde-manger' }).click()
    const lows = page.locator('.kitchen__low li')
    await expect(lows).toHaveCount(3)
    // The explicit check is the ONLY thing that puts a low item on the shopping
    // list (marking something low no longer auto-adds). It posts to /list, then
    // clears the low flag; the row leaves the reminder at once.
    await expectApi(page, 'POST', 'list', () =>
      lows.first().locator('button.board__list-item').click(),
    )
    await expect(lows).toHaveCount(2)
  })

  test('undo restores a cleared pantry item', async ({ page }) => {
    await page.locator('.subtabs__opt', { hasText: 'Garde-manger' }).click()
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

  test('a day shows its breakfast/lunch/snack slots and sets one (POST meals)', async ({ page }) => {
    // Day one's breakfast is seeded ("Crêpes") — a side slot beside the souper.
    await expect(page.locator('.kitchen__slot.is-set', { hasText: 'Crêpes' }).first()).toBeVisible()
    // Setting a lunch is a plain title — straight POST, no staples step.
    const slot = page.locator('.kitchen__day').first().locator('.kitchen__slot', { hasText: 'Dîner' })
    await slot.click()
    const edit = page.locator('.kitchen__slot-edit')
    await edit.locator('input.input').fill('Sandwich au jambon')
    await expectApi(page, 'POST', 'meals', () => edit.locator('button[type="submit"]').click())
  })

  test('shop the week gathers ingredients and adds them to the list', async ({ page }) => {
    await page.getByRole('button', { name: /Magasiner la semaine/ }).click()
    await expect(page.locator('.kitchen__shop')).toBeVisible()
    await expectApi(page, 'POST', 'recipe-to-list', () =>
      page.locator('.kitchen__shop .btn--primary').click(),
    )
  })

  test('adding a use-soon item posts it (and never touches the list)', async ({ page }) => {
    await page.locator('.subtabs__opt', { hasText: 'Garde-manger' }).click()
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
    // The recipe book now lives behind the "Recettes" sub-tab (kitchen de-densify).
    await page.locator('.subtabs__opt', { hasText: 'Recettes' }).click()
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
    // "Ajouter à la liste" now opens an ingredient PICKER (e40f990) with nothing
    // pre-selected; pick all, then confirm — that's what posts recipe-to-list.
    await modal.getByRole('button', { name: 'Ajouter à la liste' }).click()
    await modal.locator('.recipe-list-pick__all').click() // Tout sélectionner
    await expectApi(page, 'POST', 'recipe-to-list', () =>
      modal.locator('.recipe-list-pick__actions .btn--primary').click(),
    )
    await modal.locator('.recipe-actions .btn--primary').click() // Cook
    await expect(page.locator('.cook')).toBeVisible()
  })

  test('a step with a duration offers a tappable cook-mode timer', async ({ page }) => {
    // Per-step timers live in the stepper, which now follows the toddler PROFILE
    // (not an in-cook toggle) — so reach it through the kid kitchen: tap a planned
    // meal that maps to a recipe (Spaghetti → rc1). Hear-first, so two taps commit.
    await APP('/kitchen', 'toddler')(page)
    await settle(page, '.bigtiles .bigtile')
    const tile = page.locator('.bigtiles .bigtile').first()
    await tile.click() // arm
    await tile.click() // commit → Cook mode
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
    await expect(cards).toHaveCount(4)
    await page.locator('.kitchen__tag-filter .chip', { hasText: 'préféré' }).click()
    await expect(cards).toHaveCount(1) // only the recipe tagged "préféré"
    await page.locator('.kitchen__tag-filter .chip', { hasText: 'rapide' }).click()
    await expect(cards).toHaveCount(2) // two recipes tagged "rapide"
  })

  test('creating a recipe posts it', async ({ page }) => {
    // Recipe creation moved to the contextual ＋: FAB → "Ajouter une recette"
    // tile → navigates to /kitchen/recipe/new (the recipe builder route).
    await page.locator('.add-fab').click()
    await page.locator('.cat-pick').first().click()
    const modal = page.locator('.recipe-modal')
    await modal.waitFor({ state: 'visible' })
    await modal.locator('.recipe-title-input').fill('Soupe aux légumes')
    await expectApi(page, 'POST', 'recipes', () =>
      modal.locator('.recipe-modal__foot button[type="submit"]').click(),
    )
  })

  test('a recipe step edits in a memo, one open at a time', async ({ page }) => {
    await page.locator('.add-fab').click()
    await page.locator('.cat-pick').first().click() // Ajouter une recette
    const modal = page.locator('.recipe-modal')
    await expect(modal).toBeVisible()
    // Steps start collapsed — no wall of open boxes.
    await expect(modal.locator('.recipe-step__memo')).toHaveCount(0)
    const addStep = modal.getByRole('button', { name: 'Ajouter une étape' })
    await addStep.click() // a fresh step opens straight into its memo
    await expect(modal.locator('.recipe-step__memo')).toHaveCount(1)
    await modal.locator('.recipe-step__memo').fill('Faire revenir l’oignon.')
    // Opening another step collapses the first → still exactly ONE memo open.
    await addStep.click()
    await expect(modal.locator('.recipe-step__memo')).toHaveCount(1)
    await expect(modal.locator('.recipe-step__text', { hasText: 'Faire revenir' })).toBeVisible()
  })
})

// ──────────────────────── kid meal suggestion ──────────────────────────

test('a kid recipe pick suggests a supper into an empty day', async ({ page }) => {
  await APP('/kitchen', 'toddler')(page)
  await settle(page, '.hub')
  // Hear-first: a toddler action tile speaks on the FIRST tap and arms; a SECOND
  // tap commits — so nothing happens by accident. Pick the first recipe (two taps).
  const recipe = page.locator('.kid-pick .bigtile').first()
  await recipe.click()
  await expect(recipe).toHaveClass(/is-armed/)
  await recipe.click()
  await expect(page.locator('.kid-pick .bigtile', { hasText: 'Mardi' })).toBeVisible()
  // Tapping an EMPTY day (Mardi) posts a SUGGESTION (suggest:true) — but only on
  // the confirming second tap. First tap arms + speaks "Mardi : <recipe>".
  const mardi = page.locator('.kid-pick .bigtile', { hasText: 'Mardi' })
  await mardi.click()
  await expect(mardi).toHaveClass(/is-armed/)
  const [req] = await Promise.all([
    page.waitForRequest(isApi('POST', 'meals'), { timeout: 15_000 }),
    mardi.click(),
  ])
  expect(JSON.parse(req.postData() || '{}')).toMatchObject({ suggest: true })
})

test('routines surface the current moment first (morning vs evening)', async ({ page }) => {
  // Freeze the clock so timeOfDay() is deterministic. 12:00Z = 8 AM in the
  // config's America/Toronto (June, UTC-4) → morning.
  await page.clock.setFixedTime(new Date('2026-06-08T12:00:00Z'))
  await APP('/routines', 'toddler')(page)
  await settle(page, '.kid__faces')
  // Matin (Léa, timeOfDay: morning) leads in the morning…
  await expect(page.locator('.kid__face').first()).toContainText('Léa')
  // …and Dodo (Noah, evening) leads at 8 PM. Nothing hides — just the order.
  await page.clock.setFixedTime(new Date('2026-06-09T00:00:00Z'))
  await page.reload()
  await settle(page, '.kid__faces')
  await expect(page.locator('.kid__face').first()).toContainText('Noah')
  await expect(page.locator('.kid__face')).toHaveCount(2)
})

test('a routine runs start → next → next → stop on one timer', async ({ page }) => {
  await APP('/routines', 'toddler')(page)
  await settle(page, '.hub')
  await page.locator('.kid__face', { hasText: 'Noah' }).click() // Dodo: 3 steps, none done
  // ▶ start once, then advance through with the single → button, ✓ on the last.
  await page.locator('.tdl-start').click()
  await expect(page.locator('.tdl-finish')).toBeVisible()
  await page.locator('.tdl-finish').click() // → step 1
  await page.locator('.tdl-finish').click() // → step 2
  await page.locator('.tdl-finish').click() // ✓ last → stop
  // It ends on the picture recap (each step wearing its ✓), not a start button.
  await expect(page.locator('.tdl-recap')).toBeVisible()
  await expect(page.locator('.tdl-recap__step')).toHaveCount(3)
})

// ──────────────────────────── shared list ──────────────────────────────

// One active list: a check is a MARK (the row stays, struck through via
// .list-row__main.done) until "Clear checked" removes the ticked ones. Past /
// predicted re-adds live behind the ⚡ Quick add panel. A row's check toggle is
// its own button — the row body (image / name) taps open the flyer / editor — so
// check via the toggle, not a click on the row.
const openList = (page: Page) => page.locator('.today-feed > .list-rows > .list-row')
const checkedRows = (page: Page) => page.locator('.list-row__main.done')
const checkOff = (row: ReturnType<Page['locator']>) => row.locator('.list-row__toggle').click()

test.describe('list', () => {
  test.beforeEach(async ({ page }) => {
    await APP('/liste')(page)
    await settle(page, '.today-feed')
  })

  test('checking an item marks it in place (it stays) and patches the list', async ({ page }) => {
    const rows = openList(page)
    await expect(rows).toHaveCount(4)
    await expectApi(page, 'PATCH', 'list', () => checkOff(rows.first()))
    // A check is a mark, not a removal — the item STAYS, just struck through.
    await expect(rows).toHaveCount(4)
    await expect(checkedRows(page)).toHaveCount(1)
  })

  test('tapping a checked item again unchecks it', async ({ page }) => {
    const rows = openList(page)
    await checkOff(rows.first())
    await expect(checkedRows(page)).toHaveCount(1)
    await checkOff(rows.first())
    await expect(checkedRows(page)).toHaveCount(0)
  })

  test('clear checked removes the ticked items and leaves the rest', async ({ page }) => {
    const rows = openList(page)
    await checkOff(rows.first())
    const clear = page.getByRole('button', { name: /Vider les cochés/ })
    await expect(clear).toBeVisible()
    // Deferred behind the undo toast: the rows go at once, the PATCH lands later.
    await expectApi(page, 'PATCH', 'list', () => clear.click())
    await expect(rows).toHaveCount(3)
  })

  test('undo restores cleared items', async ({ page }) => {
    const rows = openList(page)
    await checkOff(rows.first())
    await page.getByRole('button', { name: /Vider les cochés/ }).click()
    await expect(rows).toHaveCount(3)
    await expect(page.locator('.undo-toast')).toBeVisible()
    await page.locator('.undo-toast__btn').click()
    // Back on the list, and still checked (undo restores the snapshot as-is).
    await expect(rows).toHaveCount(4)
    await expect(checkedRows(page)).toHaveCount(1)
  })

  test('a cleared item stays gone after the confirming board refetch', async ({ page }) => {
    const rows = openList(page)
    const firstText = (await rows.first().locator('.title').innerText()).trim()
    await checkOff(rows.first())
    await expectApi(page, 'PATCH', 'list', () =>
      page.getByRole('button', { name: /Vider les cochés/ }).click(),
    )
    await expect(rows).toHaveCount(3)
    await expect(rows.locator('.title', { hasText: firstText })).toHaveCount(0)
  })

  test('the add bar posts a new line straight to the list', async ({ page }) => {
    await page.locator('.list-add .input').fill('Bananes')
    await expectApi(page, 'POST', 'list', () =>
      page.locator('.list-add button[type="submit"]').click(),
    )
  })

  test('the quick-add panel re-adds a past item and stays open', async ({ page }) => {
    await page.locator('.list-quick').click()
    const panel = page.locator('.pm-sheet.qa')
    await expect(panel).toBeVisible()
    const chip = panel.locator('.qa__chip', { hasText: 'Beurre' })
    await expect(chip).toHaveCount(1)
    await expectApi(page, 'POST', 'list', () => chip.click())
    // The panel STAYS open (multi-add); the chip locks with a ✓ and a count shows.
    await expect(panel).toBeVisible()
    await expect(chip).toHaveClass(/is-added/)
    await expect(panel.locator('.qa__count')).toBeVisible()
  })

  test('quick-add re-adds an item with the flyer synonyms it last carried', async ({ page }) => {
    await page.locator('.list-quick').click()
    const chip = page.locator('.pm-sheet.qa .qa__chip', { hasText: 'Beurre' })
    const [req] = await Promise.all([
      page.waitForRequest((r) => r.url().includes('/api/list') && r.method() === 'POST'),
      chip.click(),
    ])
    expect(JSON.parse(req.postData() || '{}')).toMatchObject({ text: 'Beurre', search_terms: ['beurre', 'butter'] })
  })

  test('a due-soon prediction shows in quick-add with a tag', async ({ page }) => {
    await page.locator('.list-quick').click()
    // Œufs is 'soon' in the ghost mock and not on the list → tagged in the panel.
    const oeufs = page.locator('.pm-sheet.qa .qa__chip', { hasText: 'Œufs' })
    await expect(oeufs).toHaveCount(1)
    await expect(oeufs.locator('.qa__tag')).toBeVisible()
  })

  test('the flyer browser opens', async ({ page }) => {
    await page.getByRole('button', { name: /Parcourir/ }).click()
    await expect(page.locator('.scene .deals-search')).toBeVisible()
  })

  test('a browsed deal LINKS onto the matching list item, not a new specific-named line', async ({ page }) => {
    await page.getByRole('button', { name: /Parcourir/ }).click()
    await expect(page.locator('.deals-search')).toBeVisible()
    await page.locator('.deals-search input').fill('lait')
    await page.locator('.deals-search button[type="submit"]').click()
    await expect(page.locator('.deal').first()).toBeVisible()
    // "Lait" is already on the list, so the deal links onto that recurring line
    // (PATCH id l1) — it does NOT spawn a "Lait 2% 4L" duplicate. The item stays
    // generic; only the weekly deal riding on it changes.
    const [req] = await Promise.all([
      page.waitForRequest(isApi('PATCH', 'list')),
      page.locator('.deal').first().getByRole('button', { name: /Ajouter à la liste/ }).click(),
    ])
    expect(JSON.parse(req.postData() || '{}')).toMatchObject({ id: 'l1' })
  })

  test('a browsed deal for a new item adds it under the SEARCHED name, not the product name', async ({ page }) => {
    await page.getByRole('button', { name: /Parcourir/ }).click()
    await page.locator('.deals-search input').fill('fromage') // not on the list yet
    await page.locator('.deals-search button[type="submit"]').click()
    await expect(page.locator('.deal').first()).toBeVisible()
    const [req] = await Promise.all([
      page.waitForRequest(isApi('POST', 'list')),
      page.locator('.deal').first().getByRole('button', { name: /Ajouter à la liste/ }).click(),
    ])
    // The new line is the generic thing searched ("fromage"), NOT the flyer's
    // "Lait 2% 4L" — so quick-add keeps suggesting the generic item next week.
    expect(JSON.parse(req.postData() || '{}')).toMatchObject({ text: 'fromage' })
  })

  test('clearing a checked item drops its staged cashier deal', async ({ page }) => {
    // l1 (Lait) carries a staged deal → the cashier button shows with no mode to
    // switch into (the shopping tools are always available now).
    await expect(page.getByRole('button', { name: /Montrer à la caisse/ })).toBeVisible()
    // Tick Lait, then clear it → it leaves the list and so leaves the cashier set.
    await checkOff(openList(page).filter({ hasText: 'Lait' }))
    await expectApi(page, 'PATCH', 'list', () =>
      page.getByRole('button', { name: /Vider les cochés/ }).click(),
    )
    await expect(page.getByRole('button', { name: /Montrer à la caisse/ })).toHaveCount(0)
  })

  test('the by-store tab opens a store flyer without searching', async ({ page }) => {
    await page.getByRole('button', { name: /Parcourir/ }).click()
    await expect(page.locator('.deal-tabs')).toBeVisible()
    await page.getByRole('tab', { name: /Par magasin/ }).click()
    await expect(page.locator('.flyer-store')).toHaveCount(3)
    // Flyers are separated by date: this week's two + next week's IGA (future start),
    // each badged so you can open the upcoming one to prep next week.
    await expect(page.locator('.flyer-store__when--upcoming')).toHaveCount(1)
    await expect(page.locator('.flyer-store__when--upcoming')).toHaveText(/À venir/)
    await expect(
      page.locator('.flyer-store', { hasText: 'Super C' }).locator('.flyer-store__when--current'),
    ).toBeVisible()
    await page.locator('.flyer-store', { hasText: 'Super C' }).click()
    await expect(page.locator('.flyer-overlay')).toBeVisible()
    // The fixture flyer has 2 pages but only page 1 carries an item; the empty
    // cover page must be skipped, so exactly one page renders (no blank box).
    await expect(page.locator('.flyer-page-wrap')).toHaveCount(1)
    await expect(page.locator('.flyer-page-label')).toHaveText(/1/)
    // The "full flyer" link deep-links Flipp by id + merchant slug + postal.
    await expect(page.locator('.flyer-full-link')).toHaveAttribute(
      'href',
      'https://flipp.com/fr-ca/circulaire/5001-super-c-circulaire?postal_code=H2X1Y4',
    )
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

test.describe('recurring chores on the board', () => {
  test('a chore due today shows in Aujourd\'hui and checks off (PATCH complete)', async ({ page }) => {
    await APP('/board')(page)
    await settle(page, '.hub')
    const chore = page.locator('.act', { hasText: 'Sortir les poubelles' })
    await expect(chore).toBeVisible()
    await expect(chore).toContainText('Léa') // whose turn
    await expectApi(page, 'PATCH', 'chores', () => chore.click())
  })

  test('an upcoming chore shows under À venir with its day', async ({ page }) => {
    await APP('/board')(page)
    await settle(page, '.hub')
    await expect(page.locator('.act', { hasText: 'Vaisselle' })).toBeVisible()
  })

  test('a chore can be given a weekly schedule in settings (PATCH recur)', async ({ page }) => {
    await APP('/settings?tab=chores')(page)
    await settle(page, '.operator__tabs')
    await page.getByRole('tab', { name: 'Corvées' }).click()
    // Open the schedule editor on the first chore, pick weekly → PATCH recur.
    await page.locator('.operator__chore-row').first().getByRole('button', { name: /céduler|schedule/i }).click()
    await expectApi(page, 'PATCH', 'chores', () =>
      page.locator('.operator__chore-schedule select').selectOption('weekly'),
    )
  })
})

test.describe('fridge notes', () => {
  test('a note shows on the board and clears with a tap (DELETE)', async ({ page }) => {
    await APP('/board')(page)
    await settle(page, '.hub')
    const note = page.locator('.note-card', { hasText: 'examen' })
    await expect(note).toBeVisible()
    await expectApi(page, 'DELETE', 'notes', () => note.click())
    await expect(note).toHaveCount(0) // optimistically removed
  })

  test('toddler sees the note too (read-aloud, not cleared)', async ({ page }) => {
    await APP('/board', 'toddler')(page)
    await settle(page, '.kid__main')
    await expect(page.locator('.notes--kid .note-card', { hasText: 'examen' })).toBeVisible()
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
