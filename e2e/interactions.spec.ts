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
// waiter is armed BEFORE the action so a fast request can't slip through. The
// timeout sits ABOVE the 15 s undo-toast hold (toast.tsx DEFAULT_UNDO_MS): a
// deferred write (e.g. checking a low item → POST /list) only commits when that
// window closes, so a 15 s waiter raced it and flaked.
async function expectApi(page: Page, method: string, path: string, action: () => Promise<void>) {
  await Promise.all([page.waitForRequest(isApi(method, path), { timeout: 20_000 }), action()])
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
    // "Wall tablet" (second card now — your own device leads, step 1) is the
    // pairing path.
    await page.locator('.setup__choice').nth(1).click()
    await expect(page).toHaveURL(/\/pair$/)
  })

  test('setup → personal device leads to sign-in', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await mockApi(page, { signedIn: false })
    await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', calm: true })
    await page.goto('/setup')
    await settle(page, '.setup__choices')
    // "My device" (first card now — listed first, badged step 1) is the sign-in path.
    await page.locator('.setup__choice').first().click()
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
    // The create POST fires, then the flow lands on the board — a fresh household's
    // first-run WelcomeCard checklist guides adding the family from there.
    await expectApi(page, 'POST', 'auth/signup', () => submit.click())
    await expect(page).toHaveURL(/\/board$/)
    await expect(page.locator('.hub')).toBeVisible()
  })

  test('hub nav switches every section and marks the active tab', async ({ page }) => {
    await APP('/board')(page)
    await settle(page, '.hub')
    for (const seg of ['kitchen', 'maison', 'notes', 'liste', 'settings']) {
      await page.locator(`.hubnav a[href="/${seg}"]`).click()
      await expect(page).toHaveURL(new RegExp(`/${seg}$`))
      await expect(page.locator(`.hubnav a[href="/${seg}"]`)).toHaveClass(/is-active/)
    }
  })

  test('the audience switch enters the kid view as a one-way door', async ({ page }) => {
    // Entering the toddler lens lives in Réglages ▸ Système ▸ Affichage now (the
    // nav's one-tap peek is gone). Parent → Enfant from the display sub's switch.
    await APP('/settings?tab=settings&sub=display')(page)
    await settle(page, '.operator__tabs')
    // The Affichage tab now has several .audience-switch groups (contrast,
    // text-scale, view, tutorial); scope to the parent/kid/guest "view" group and
    // click its "Enfant" option rather than a global .nth(1).
    await page
      .getByRole('group', { name: /Parent.*Enfant.*Invité/ })
      .getByRole('button', { name: 'Enfant' })
      .click()
    // The toddler lens comes up (bounced to /board) and Réglages leaves the nav.
    await expect(page).toHaveURL(/\/board$/)
    await expect(page.locator('.hub')).toHaveAttribute('data-audience', 'toddler')
    await expect(page.locator('.hubnav a[href="/settings"]')).toHaveCount(0)
    // There's no one-tap flip back to the parent view, and /settings redirects
    // away. The only way out is the gated exit switch (3s hold + math), so the
    // door stays one-way for the child.
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

  test('a locked simple kiosk (?simple=1) mirrors the kid lock, and a 3s hold alone exits (no math)', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await mockApi(page)
    await page.goto('/board?simple=1')
    await settle(page, '.hub')
    // The simple lens is up: the four-zone grandma board, no audience switch,
    // no settings tab, no ＋ FAB — same restrictions as the kid lock.
    await expect(page.locator('.hub')).toHaveAttribute('data-audience', 'simple')
    await expect(page.locator('.today-simple')).toBeVisible()
    await expect(page.locator('.hubnav a[href="/settings"]')).toHaveCount(0)
    await expect(page.locator('.add-fab')).toHaveCount(0)
    // /settings redirects away while locked, exactly like ?kid=1.
    await page.addInitScript(() => localStorage.setItem('babillard-simple-lock', '1'))
    await page.goto('/settings')
    await expect(page).toHaveURL(/\/board$/)

    // The gated exit: a sustained ~3s hold on the footer switch. A capable
    // post-reader adult holds deliberately — so NO math challenge follows
    // (KidExitGate requireMath={false}); the hold itself unlocks back to parent.
    const sw = page.locator('.kid-exit-switch')
    await expect(sw).toBeVisible()
    const box = await sw.boundingBox()
    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2)
    await page.mouse.down()
    await page.waitForTimeout(3300)
    await page.mouse.up()
    await expect(page.locator('.kid-exit-modal')).toHaveCount(0)
    await expect(page.locator('.hub')).toHaveAttribute('data-audience', 'parent')
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
    // Scope to the settings tab strip: each tab's panel now carries its own SubTabs
    // (role=tab) row, so an unscoped getByRole('tab') would also count the sub-tabs.
    const tabs = page.locator('.operator__tabs').getByRole('tab')
    const n = await tabs.count()
    // Découvrir (first/default) + the six themed tabs, one per hub section in the
    // canonical order: Le babillard, La cuisine, La liste, Les notes, Maison,
    // Système (Le cercle + Routines merged into one Maison tab — still seven
    // tabs total). Each themed tab stacks its sections as sub-sections behind its
    // « Régler » lens (so every section is still reachable).
    expect(n).toBe(7)
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
    // Theme/language/audience are device-wide: Système ▸ Affichage now — deep-link
    // straight to that sub so only the display panel renders.
    await APP('/settings?tab=settings&sub=display')(page)
    await settle(page, '.operator__tabs')
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
    // Target the language button by its OWN text (Français/English), not the seg
    // label: the Affichage tab gained an "Ambiance du jour" seg (shifting indices)
    // AND the "Langue" label itself flips to "Language" on toggle, so a label-based
    // filter stops matching after the click. The button's text uniquely identifies
    // it among the segs (theme=Jour/Nuit, ambient=…, lang=Français/English).
    const btn = page.locator('.operator__seg button').filter({ hasText: /^(Français|English)$/ })
    await expect(btn).toHaveText('Français')
    await btn.click()
    await expect(btn).toHaveText('English')
  })

  test('audience switch flips the hub into the toddler layer', async ({ page }) => {
    await openDisplay(page)
    // Scope to the parent/kid/guest "view" group (the Affichage tab has several
    // .audience-switch groups now) and click its "Enfant" option.
    await page
      .getByRole('group', { name: /Parent.*Enfant.*Invité/ })
      .getByRole('button', { name: 'Enfant' })
      .click()
    // Flipping to the kid lens in Réglages bounces out of settings (the one-way
    // door): the hub comes up in the toddler layer on the board.
    await expect(page.locator('.hub')).toHaveAttribute('data-audience', 'toddler')
    await expect(page).toHaveURL(/\/board$/)
  })

  test('calm toggle flips and persists the opt-out', async ({ page }) => {
    // Calm mode lives under « IA & système » now, as its own sub-section — deep-link
    // straight to it (?tab=ai&sub=calm) so only the calm panel renders.
    await APP('/settings?tab=ai&sub=calm')(page)
    await settle(page, '.operator__tabs')
    const btn = page.locator('.operator__section', { hasText: 'Mode calme' }).locator('button[aria-pressed]')
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
    // Members live under Maison now (the merged Le cercle + Routines tab), on
    // its « La maisonnée » sub — Routines (the tab's default section) shows first.
    await page.locator('.operator__tabs').getByRole('tab', { name: 'Maison', exact: true }).click()
    await page.locator('.subtabs').getByRole('tab', { name: 'La maisonnée', exact: true }).click()
    // The member-add box is now the shared EditField (form.edit-field), no longer a
    // hand-rolled operator__inline-form.
    const form = page.locator('.operator__panel form.edit-field')
    await form.locator('input.input').first().fill('Mamie')
    await expectApi(page, 'POST', 'members', () => form.locator('button[type="submit"]').click())
  })

  test('add an event', async ({ page }) => {
    // Events live under Le babillard now (its first sub — the board IS the agenda).
    await page.locator('.operator__tabs').getByRole('tab', { name: 'Le babillard' }).click()
    // Adding now opens the full-screen event scene (the panel's inline form is
    // EDIT-only): "Ajouter un rendez-vous" navigates to /event/new with the same
    // EventForm — a scene, not a sheet, so its fields ride above the keyboard.
    // .first(): the agenda tab now stacks events + car + schedule, each with its own
    // .operator__add — the event one is first.
    await page.locator('.operator__add').first().click()
    await page.waitForURL(/\/event\/new/)
    const form = page.locator('.scene form.operator__inline-form')
    await form.locator('input.input').first().fill('Réunion parents')
    await form.locator('input[type="date"]').fill('2026-07-01')
    await expectApi(page, 'POST', 'events', () => form.locator('button[type="submit"]').click())
  })

  test('add a chore', async ({ page }) => {
    // Chores are the « Corvées » sub of the Maison themed tab now (Routines +
    // Le cercle merged).
    await page.locator('.operator__tabs').getByRole('tab', { name: 'Maison', exact: true }).click()
    await page.locator('.subtabs').getByRole('tab', { name: 'Corvées', exact: true }).click()
    // Adding a chore opens the full-screen /chore/new scene (Réglages rows are
    // edit/remove only).
    await page.locator('.operator__add').first().click()
    await page.waitForURL(/\/chore\/new/)
    const form = page.locator('.scene .operator__chore-form')
    await form.locator('input.input').first().fill('Balayer la cuisine')
    await expectApi(page, 'POST', 'chores', () => form.locator('button[type="submit"]').click())
  })

  test('add a kid routine', async ({ page }) => {
    // Routines is Maison's own sub-section (and its default section) now —
    // deep-link to it (?tab=maison&sub=routines) so the routines panel renders.
    await APP('/settings?tab=maison&sub=routines')(page)
    await settle(page, '.operator__tabs')
    await page.locator('.operator__section', { hasText: 'Routines (mode enfant)' }).locator('.operator__add').click()
    await page.waitForURL(/\/routine\/new/)
    const form = page.locator('.scene .operator__routine-form')
    await form.locator('.mswitch__opt').first().click() // pick a child (for-who MemberPicker)
    await form.locator('input.input').first().fill('Routine du soir')
    await expectApi(page, 'POST', 'routines', () => form.locator('button[type="submit"]').click())
  })

  test('save the shopping postal code', async ({ page }) => {
    // Shopping config lives under La liste now (its first sub, « Magasinage »).
    await page.locator('.operator__tabs').getByRole('tab', { name: 'La liste', exact: true }).click()
    // The postal form is the shared EditField (form.edit-field) now.
    const form = page.locator('.operator__panel form.edit-field')
    await form.locator('input.input').first().fill('H2X 1Y4')
    await expectApi(page, 'PATCH', 'household', () => form.locator('button[type="submit"]').click())
  })

  test('add a ghost-list staple', async ({ page }) => {
    // Ghost tracking is its own sub-section under « Magasinage » — deep-link to it.
    await APP('/settings?tab=shopping&sub=ghost')(page)
    await settle(page, '.operator__tabs')
    const form = page.locator('.operator__section', { hasText: 'Liste fantôme' }).locator('form.operator__inline-form')
    await form.locator('input.input').first().fill('Savon à vaisselle')
    await expectApi(page, 'PATCH', 'ghost', () => form.locator('button[type="submit"]').click())
  })

  test('a frequent buy is offered for tracking — one deliberate tap tracks it', async ({ page }) => {
    await APP('/settings?tab=shopping&sub=ghost')(page)
    await settle(page, '.operator__tabs')
    // Tracking is conscious: candidates sit apart from the tracked rows, and
    // nothing enters the set until this tap.
    const chip = page.locator('.ghost-admin__candidate-chips .chip').first()
    await expect(chip).toBeVisible()
    await expectApi(page, 'PATCH', 'ghost', () => chip.click())
  })

  test('rename a bought-item history entry to a generic name (merge)', async ({ page }) => {
    // The grocery-history list is its own sub-section under « Magasinage ».
    await APP('/settings?tab=shopping&sub=history')(page)
    await settle(page, '.operator__tabs')
    // "Yogourt grec" is in the grocery history → rename it to the generic "Yogourt"
    // so quick-add folds it in and suggests the generic item.
    await page.locator('.ghost-admin__row', { hasText: 'Yogourt grec' }).getByRole('button', { name: 'Renommer' }).click()
    // The inline rename editor is now the shared EditField (form.edit-field).
    const form = page.locator('.ghost-admin__row form.edit-field')
    await form.locator('input.input').fill('Yogourt')
    const [req] = await Promise.all([
      page.waitForRequest(isApi('PATCH', 'list')),
      form.getByRole('button', { name: 'Enregistrer' }).click(),
    ])
    expect(JSON.parse(req.postData() || '{}')).toMatchObject({ historyKey: 'yogourt grec', renameTo: 'Yogourt' })
  })

  test('remove a bought-item history entry so quick-add stops suggesting it', async ({ page }) => {
    await APP('/settings?tab=shopping&sub=history')(page)
    await settle(page, '.operator__tabs')
    const [req] = await Promise.all([
      // « Retirer » holds the DELETE behind the undo toast now (deferred removal),
      // so it fires on commit after the 15 s hold (toast.tsx DEFAULT_UNDO_MS) — the
      // wait must sit ABOVE that, like the expectApi helper above.
      page.waitForRequest(isApi('DELETE', 'list'), { timeout: 20_000 }),
      page.locator('.ghost-admin__row', { hasText: 'Bananes' }).getByRole('button', { name: 'Retirer' }).click(),
    ])
    expect(JSON.parse(req.postData() || '{}')).toMatchObject({ historyKey: 'bananes' })
  })

  test('claim a tablet with a 6-digit code', async ({ page }) => {
    // Pairing lives under Système now (its first sub, « Tablettes jumelées »).
    await page.locator('.operator__tabs').getByRole('tab', { name: 'Système' }).click()
    const form = page.locator('.operator__claim form')
    await form.locator('input.input').first().fill('123456')
    await expectApi(page, 'POST', 'pair/claim', () => form.locator('button[type="submit"]').click())
  })

  test('generate the weekly recap', async ({ page }) => {
    // The AI recap now sits with the week glance under one « La semaine » pill.
    await APP('/settings?tab=ai&sub=thisweek')(page)
    await settle(page, '.operator__tabs')
    await expectApi(page, 'GET', 'recap', () => page.getByRole('button', { name: 'Générer le bilan' }).click())
    await expect(page.locator('.operator__panel')).toContainText('Belle semaine')
  })
})

// ───────────────────────── add sheet (capture) ─────────────────────────

test.describe('add sheet', () => {
  // The single floating ＋ FAB is the add affordance everywhere — and it is
  // CONTEXTUAL: the board keeps the quick-capture chooser, the other sections
  // open their own actions (tested below).
  test('the board ＋ note box posts a fridge note', async ({ page }) => {
    await APP('/board')(page)
    await settle(page, '.hub')
    await page.locator('.add-fab').click()
    await expect(page.locator('.sheet.show')).toBeVisible()
    // The board ＋ hoists the « Note rapide » box to the TOP of the sheet (fast path),
    // so a note is one write-and-Add away — no tile to pick first. It POSTs /api/notes,
    // NOT /api/capture: the AI router moved to the header mic (see capture-*.spec.ts).
    await page.locator('.addsheet__lead input.edit-field__input').fill('Acheter du lait')
    await expectApi(page, 'POST', 'notes', () =>
      page.locator('.addsheet__lead .edit-field__submit').click(),
    )
  })

  test('the board ＋ note box carries a 📎 for a voice memo / drawing / photo', async ({ page }) => {
    await APP('/board')(page)
    await settle(page, '.hub')
    await page.locator('.add-fab').click()
    await expect(page.locator('.sheet.show')).toBeVisible()
    // The three memo actions are the field's own attach affordance now, not three
    // full-width buttons beside it that discarded whatever you'd typed.
    const attach = page.locator('.addsheet__lead .memo-attach__btn')
    await expect(attach).toHaveAttribute('aria-expanded', 'false')
    await attach.click()
    await expect(page.locator('.memo-attach__picks')).toBeVisible()
    await expect(page.locator('.memo-attach__picks button', { hasText: 'Mémo vocal' })).toBeVisible()
    await expect(page.locator('.memo-attach__picks button', { hasText: 'Dessiner' })).toBeVisible()
  })

  test('the board ＋ event tile opens the full-screen event form', async ({ page }) => {
    await APP('/board')(page)
    await settle(page, '.hub')
    await page.locator('.add-fab').click()
    await expect(page.locator('.sheet.show')).toBeVisible()
    // The board ＋ is a blank-slate chooser; wait for its tiles, then tap the
    // event tile. It's navigate-only: it leaves the sheet for the full-screen
    // /event/new scene (tall forms strand under the keyboard).
    await expect(page.locator('.cat-pick', { hasText: 'Rendez-vous' })).toBeVisible()
    await Promise.all([
      page.waitForURL(/\/event\/new/),
      page.locator('.cat-pick', { hasText: 'Rendez-vous' }).click(),
    ])
    await expect(page.locator('.scene input[type="date"]')).toBeVisible()
  })

  test('the board ＋ plan-today tile opens the day planner', async ({ page }) => {
    await APP('/board')(page)
    await settle(page, '.hub')
    await page.locator('.add-fab').click()
    await expect(page.locator('.sheet.show')).toBeVisible()
    // The board chooser shows every tile at once now (no "Plus…" overflow), so
    // "Planifier aujourd'hui" is directly present and navigates to that day's planner.
    await expect(page.locator('.cat-pick', { hasText: 'Planifier aujourd’hui' })).toBeVisible()
    await Promise.all([
      page.waitForURL(/\/kitchen\/day\/\d+/),
      page.locator('.cat-pick', { hasText: 'Planifier aujourd’hui' }).click(),
    ])
  })

  test('the kitchen ＋ offers cuisiner / recette / repas / restants / garde-manger / réserve — no quick note', async ({ page }) => {
    await APP('/kitchen')(page)
    await settle(page, '.hub')
    await page.locator('.add-fab').click()
    await expect(page.locator('.sheet.show')).toBeVisible()
    // The section chooser (direct child of .sheet) now has SEVEN tiles:
    // Cuisiner, Ajouter une recette, Planifier un repas, Restants, Ajouter un
    // aliment, La réserve, Le livre illustré (the new toddler picture-game door).
    // (The kitchen-week actions below sit in a separate .sheet__group.)
    const sectionTiles = page.locator('.sheet > .cat-grid > .cat-pick')
    await expect(sectionTiles).toHaveCount(7)
    await expect(sectionTiles, 'no quick-capture in the kitchen sheet').toHaveCount(7)
    await expect(page.locator('.cat-pick', { hasText: 'Note rapide' })).toHaveCount(0)
    // The sheet is a blank-slate chooser now: pick "Planifier un repas" to reveal
    // its DAY PICKER (chips that navigate to the day's editor scene /kitchen/day/…),
    // not an inline day-select + slot-picker + POST.
    await page.locator('.cat-pick', { hasText: 'Planifier un repas' }).click()
    await expect(page.locator('.sheet .addsheet__daypick')).toBeVisible()
    const days = page.locator('.sheet .addsheet__days .chip')
    await expect(days.first()).toBeVisible()
    await Promise.all([
      page.waitForURL(/\/kitchen\/day\/\d+/),
      days.first().click(),
    ])
  })

  test('the kitchen ＋ réserve tile posts to reserve', async ({ page }) => {
    await APP('/kitchen')(page)
    await settle(page, '.hub')
    await page.locator('.add-fab').click()
    await expect(page.locator('.sheet.show')).toBeVisible()
    await page.locator('.cat-pick', { hasText: 'La réserve' }).click()
    await page.locator('.addsheet__panel input.edit-field__input').fill('Sac de petits pois')
    await expectApi(page, 'POST', 'reserve', () =>
      page.locator('.addsheet__panel .edit-field__submit').click(),
    )
  })

  // F3 « À compléter » (PARITY Wave E, entry 10) — the board todo card was smoke
  // -rendered only; nothing created a todo. The board ＋ « À compléter » tile opens a
  // compose box (scope chips + the templates combobox) that POSTs /api/todos.
  test('the board ＋ « À compléter » box posts a todo', async ({ page }) => {
    await APP('/board')(page)
    await settle(page, '.hub')
    await page.locator('.add-fab').click()
    await expect(page.locator('.sheet.show')).toBeVisible()
    await page.locator('.cat-pick', { hasText: 'À compléter' }).click()
    await page.locator('.addsheet__todo input.edit-field__input').fill('Sac de piscine')
    await expectApi(page, 'POST', 'todos', () =>
      page.locator('.addsheet__todo .edit-field__submit').click(),
    )
  })

  // F14 Restants (PARITY Wave E, entry 10) — the ＋ « Restants » field was reached in
  // keyboard.spec but nothing POSTed a leftover. The kitchen ＋ « Restants » tile opens
  // the unified free-text/meal combobox that POSTs /api/meal-leftovers.
  test('the kitchen ＋ « Restants » box posts a leftover', async ({ page }) => {
    await APP('/kitchen')(page)
    await settle(page, '.hub')
    await page.locator('.add-fab').click()
    await expect(page.locator('.sheet.show')).toBeVisible()
    await page.locator('.cat-pick', { hasText: 'Restants' }).click()
    await page.locator('.sheet.show input.edit-field__input').fill('Reste de spaghetti')
    await expectApi(page, 'POST', 'meal-leftovers', () =>
      page.locator('.sheet.show .edit-field__submit').click(),
    )
  })

  // C-14 — the kitchen ＋ sheet's week-action tiles shrank to 2 (shop + « Idées »):
  // Vide-frigo now opens from the IdeasDrawer's own footer button, not a direct
  // ＋ tile. The tile navigates to the drawer's full-screen scene (/kitchen/idees).
  // The button lives in the 🤖 « IA » source's footer, not under every source: it IS an
  // AI ask, and hanging it under Favoris / À écouler / 👧 read as a fifth, unrelated
  // action on tabs that never call the model. So the spec picks that source first.
  test('the kitchen ＋ Idées tile opens the drawer, whose IA footer runs Vide-frigo', async ({ page }) => {
    await APP('/kitchen')(page)
    await settle(page, '.hub')
    await page.locator('.add-fab').click()
    await expect(page.locator('.sheet.show')).toBeVisible()
    await page.locator('.cat-pick', { hasText: 'Idées de repas' }).click()
    const drawer = page.locator('.ideas-drawer.scene')
    await expect(drawer).toBeVisible()
    await expect(page).toHaveURL(/\/kitchen\/idees/)
    // The drawer opens on « Idées »; Vide-frigo hangs off the 🤖 IA source.
    await drawer.locator('.subtabs__opt', { hasText: 'IA' }).click()
    await drawer.getByRole('button', { name: 'Vide-frigo AI' }).click()
    // Step 1 — the sheet auto-loads a batch of dish names (checkable chips).
    const modal = page.locator('.kit-modal.fridge-modal')
    await expect(modal).toBeVisible()
    const ideas = modal.locator('.fridge-modal__ideas .chip')
    await expect(ideas.first()).toBeVisible()
    // Tick one idea, then build its recipe (a fresh empty-fridge POST, step 'recipes').
    await ideas.first().click()
    await expectApi(page, 'POST', 'empty-fridge', () =>
      modal.getByRole('button', { name: /Voir les recettes/ }).click(),
    )
    // Step 2 — the recipe card renders; « Garder » saves it to the book (recipes POST).
    await expect(modal.locator('.fridge-recipe')).toBeVisible()
    await expectApi(page, 'POST', 'recipes', () =>
      modal.getByRole('button', { name: 'Garder' }).click(),
    )
  })

  // C-14 — the regression that made the drawer a scene: as a content-height bottom
  // sheet it grew from the bottom edge, so swapping an empty « Favoris » for a full
  // 🤖 IA batch shoved the tab row itself up and down under the thumb. A scene pins
  // its head, so the tabs must hold their y across every source.
  test('the Idées scene holds its tab row at one y across every source', async ({ page }) => {
    await APP('/kitchen/idees')(page)
    const tabs = page.locator('.ideas-drawer .subtabs')
    await expect(tabs).toBeVisible()
    const ys: Record<string, number> = {}
    for (const label of ['Idées', 'Favoris', 'À écouler', 'IA', 'Proposé par']) {
      await page.locator('.ideas-drawer .subtabs__opt', { hasText: label }).click()
      await expect(page.locator('.ideas-drawer .subtabs__opt.is-on', { hasText: label })).toBeVisible()
      ys[label] = (await tabs.boundingBox())!.y
    }
    expect([...new Set(Object.values(ys))], `tab row moved: ${JSON.stringify(ys)}`).toHaveLength(1)
  })

  // C-14 — a child's suggestion (meal_ideas `date` + `suggested_by`) surfaces a
  // small chip on the matching empty day tile; tapping it deep-links to the drawer
  // scene on 👧 « Proposé par » (?tab=kid) — never auto-plans.
  test('a kid-suggested idea chip on an empty day opens the drawer on 👧', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await mockApi(page)
    // Override AFTER mockApi so this route wins (mocks.ts's own catch-all is
    // registered first — Playwright runs the LAST-registered matching handler).
    await page.route('**/api/meal-ideas**', (r) => {
      if (r.request().method() !== 'GET') return r.fulfill({ contentType: 'application/json', body: '{"ok":true}' })
      r.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          ideas: [
            { id: 'kid1', title: 'Pizza maison', recipe_id: null, suggested_by: 'm3', date: 1_749_960_000, created_at: 0 },
          ],
        }),
      })
    })
    await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', calm: true })
    await page.goto('/kitchen')
    await settle(page, '.hub')
    const chip = page.locator('.kitchen__day-kidsuggest', { hasText: 'propose' })
    await expect(chip).toBeVisible()
    await chip.click()
    const drawer = page.locator('.ideas-drawer.scene')
    await expect(drawer).toBeVisible()
    await expect(page).toHaveURL(/\/kitchen\/idees\?tab=kid/)
    await expect(drawer.locator('.subtabs__opt.is-on', { hasText: 'Proposé par' })).toBeVisible()
    await expect(drawer.getByText('Pizza maison')).toBeVisible()
  })

  test('the liste ＋ offers add-line / quick-add / flyer / best-prices, defaulting to the add form', async ({ page }) => {
    await APP('/liste')(page)
    await settle(page, '.hub')
    await page.locator('.add-fab').click()
    await expect(page.locator('.sheet.show')).toBeVisible()
    // Liste's ＋ is now a chooser: add a line, Ajout rapide, Parcourir les
    // circulaires, and (since the seeded list isn't empty) Choisir les meilleurs.
    const tiles = page.locator('.sheet > .cat-grid > .cat-pick')
    await expect(tiles).toHaveCount(4)
    // Blank-slate chooser: pick the add-a-line tile (quick-add/flyer are
    // navigate-only, best-prices runs an action) to reveal the form that POSTs to list.
    // Picking a tile DRILLS IN — the chooser is replaced by that tile's form (titled with
    // the action, ← back to the tiles), so the form opens at the top of the sheet instead
    // of below the fold. So the tiles are gone, not merely un-highlighted.
    await page.locator('.cat-pick', { hasText: 'Ajouter à la liste' }).click()
    await expect(tiles).toHaveCount(0)
    await expect(page.locator('.sheet.show .sheet__title--back')).toHaveText(/Ajouter à la liste/)
    await page.locator('.addsheet__panel input.edit-field__input').fill('Beurre')
    await expectApi(page, 'POST', 'list', () =>
      page.locator('.addsheet__panel .edit-field__submit').click(),
    )
  })

  test('a drilled-in ＋ form goes back to the chooser', async ({ page }) => {
    await APP('/liste')(page)
    await settle(page, '.hub')
    await page.locator('.add-fab').click()
    const tiles = page.locator('.sheet > .cat-grid > .cat-pick')
    await expect(tiles).toHaveCount(4)
    await page.locator('.cat-pick', { hasText: 'Ajouter à la liste' }).click()
    await expect(tiles).toHaveCount(0)
    // ← returns to the tiles (the ✕ still closes the whole sheet from either level).
    await page.locator('.sheet.show .sheet__back').click()
    await expect(tiles).toHaveCount(4)
    await expect(page.locator('.sheet.show .sheet__back')).toHaveCount(0)
  })

  test('the routines ＋ opens the routine builder directly', async ({ page }) => {
    await APP('/maison')(page)
    await settle(page, '.hub')
    // Maison's ＋ now opens the merged chooser (routines + the cercle add-set) —
    // the "Routines" tile leads it and drills into the manage picker (new + edit
    // existing routines) in place; its "Nouvelle routine" goes to the full-screen
    // routine scene.
    await page.locator('.add-fab').click()
    await page.getByRole('dialog').locator('.cat-pick[data-mode="routine-pick"]').click()
    await Promise.all([
      page.waitForURL(/\/routine\/new/),
      page.getByRole('dialog').getByRole('button', { name: 'Nouvelle routine' }).click(),
    ])
    await expect(page.locator('.scene .operator__routine-form')).toBeVisible()
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
    // The add box waits behind its section's ＋ (SectionAdd) — three permanently-open
    // composers used to own the garde-manger's whole first screen.
    await page.getByRole('button', { name: 'Ajouter un aliment', exact: true }).click()
    const input = page.getByRole('textbox', { name: 'Ajouter un aliment', exact: true })
    await input.fill('Lait')
    await expectApi(page, 'POST', 'pantry', () => input.press('Enter'))
  })

  test('checking a low item adds it to the list (explicit) and clears the reminder', async ({ page }) => {
    await page.locator('.subtabs__opt', { hasText: 'Garde-manger' }).click()
    const lows = page.locator('.kitchen__low li')
    await expect(lows).toHaveCount(3)
    // The explicit check is the ONLY thing that puts a low item on the shopping
    // list (marking something low no longer auto-adds). It posts to /list, then
    // clears the low flag; the row leaves the reminder at once.
    await expectApi(page, 'POST', 'list', () =>
      lows.first().locator('button.checkrow__check').click(),
    )
    await expect(lows).toHaveCount(2)
  })

  test('undo restores a cleared pantry item', async ({ page }) => {
    await page.locator('.subtabs__opt', { hasText: 'Garde-manger' }).click()
    const lows = page.locator('.kitchen__low li')
    await lows.first().locator('button.checkrow__check').click()
    await expect(lows).toHaveCount(2)
    await expect(page.locator('.undo-toast')).toBeVisible()
    await page.locator('.undo-toast__btn').click()
    await expect(lows).toHaveCount(3)
  })

  test('Ctrl+Z takes back the newest undo entry, but not while typing', async ({ page }) => {
    // bmad/12 #16 — the desktop mirror of « Annuler ». The stack was always there;
    // only the touch door existed.
    await page.locator('.subtabs__opt', { hasText: 'Garde-manger' }).click()
    const lows = page.locator('.kitchen__low li')
    await lows.first().locator('button.checkrow__check').click()
    await expect(lows).toHaveCount(2)
    await expect(page.locator('.undo-toast')).toBeVisible()
    await page.keyboard.press('Control+z')
    await expect(lows).toHaveCount(3)

    // …and it must NOT hijack the browser's own undo while a field has focus:
    // there Ctrl+Z means « un-type that », and stealing it to resurrect a row
    // would be the worst kind of surprise.
    await lows.first().locator('button.checkrow__check').click()
    await expect(lows).toHaveCount(2)
    const low = page.locator('section', { has: page.locator('.kitchen__low') })
    await low.locator('.sec-label__actbtn').first().click()
    const field = low.locator('.edit-field input').first()
    await field.fill('abc')
    await expect(field).toBeFocused()
    await page.keyboard.press('Control+z')
    await expect(lows).toHaveCount(2)
  })

  test('planning a supper saves directly; "+ ingrédients" opt-in fetches staples', async ({ page }) => {
    // The per-day planning controls live in the day editor SCENE now
    // (/kitchen/day/:date). Souper renders LAST (chronological order). The
    // grocery-staples step is OPT-IN via the "+ ingrédients" toggle — off by
    // default so "Mettre" just saves the meal (one less step).
    await page.locator('.kitchen__day').first().getByRole('button', { name: /Gérer/ }).click()
    const sheet = page.locator('.scene')
    await sheet.locator('[data-dnd-zone="supper"] .day-mng__sec-head-row .sec-label__actbtn').click()
    // The supper title editor is an EntityCombobox (reuses .edit-field styling but
    // is NOT a form — Enter commits the free text → beginSetMeal).
    const edit = sheet.locator('[data-dnd-zone="supper"] .edit-field')
    await edit.locator('input.input').fill('Pizza maison')
    // Default (opt-in OFF): Enter just saves — a straight POST meals, no staples.
    await expectApi(page, 'POST', 'meals', () => edit.locator('input.input').press('Enter'))

    // Re-open and turn the "+ ingrédients" opt-in ON → committing now fetches the
    // staple list first (POST meal-staples).
    await sheet.locator('[data-dnd-zone="supper"] .day-mng__sec-head-row .sec-label__actbtn').click()
    const edit2 = sheet.locator('[data-dnd-zone="supper"] .edit-field')
    await edit2.locator('input.input').fill('Lasagne')
    await edit2.locator('.kitchen__recipe-staples').click()
    await expectApi(page, 'POST', 'meal-staples', () => edit2.locator('input.input').press('Enter'))
  })

  test('a day shows its breakfast/lunch/snack slots and sets one (POST meals)', async ({ page }) => {
    await page.locator('.kitchen__day').first().getByRole('button', { name: /Gérer/ }).click()
    const sheet = page.locator('.scene')
    // The day editor exposes the chronological side slots: déjeuner / dîner /
    // collation, each with its own "＋ Ajouter" (the per-slot editing the grid
    // delegates here). (NOTE: the seeded "Crêpes" meal can't be asserted — the
    // mock seeds meal dates at BASE 08:00Z, not local-midnight, so they don't
    // bucket onto the grid; a mocks.ts fix would be needed, see report.)
    await expect(sheet.locator('.day-mng__sec', { hasText: 'Déjeuner' })).toBeVisible()
    await expect(sheet.locator('.day-mng__sec', { hasText: 'Collation' })).toBeVisible()
    // Setting a lunch is a plain title — a straight POST (append, saveSlot), no
    // staples step. The "＋ Ajouter" sits in the Dîner section's header; scope to it.
    const dinerSec = sheet.locator('.day-mng__sec', { hasText: 'Dîner' })
    await dinerSec.locator('.day-mng__sec-head-row .sec-label__actbtn').click()
    // The per-slot title editor is an EntityCombobox (reuses .edit-field styling but
    // is NOT a form — Enter commits the free text → saveSlot → POST meals).
    const edit = dinerSec.locator('.edit-field')
    await edit.locator('input.input').fill('Sandwich au jambon')
    await expectApi(page, 'POST', 'meals', () => edit.locator('input.input').press('Enter'))
  })

  test('shop the week gathers ingredients and adds them to the list', async ({ page }) => {
    // "Magasiner la semaine" moved into the ＋ Add sheet's kitchen-week actions
    // (Repas tab). Tapping it closes the sheet and surfaces the shop prompt on the
    // grid; confirming posts the gathered ingredients to the list.
    await page.locator('.add-fab').click()
    await expect(page.locator('.sheet.show')).toBeVisible()
    await page.locator('.sheet.show').getByRole('button', { name: /Magasiner la semaine/ }).click()
    await expect(page.locator('.kitchen__shop')).toBeVisible()
    // The picker starts all-unchecked now — tick everything, then confirm posts it.
    await page.locator('.kitchen__shop').getByRole('button', { name: 'Tout cocher' }).click()
    await expectApi(page, 'POST', 'recipe-to-list', () =>
      page.locator('.kitchen__shop .btn--primary').click(),
    )
  })

  test('adding a use-soon item posts it (and never touches the list)', async ({ page }) => {
    await page.locator('.subtabs__opt', { hasText: 'Garde-manger' }).click()
    await page.getByRole('button', { name: 'Ajouter un aliment à finir', exact: true }).click()
    // getByRole, not getByLabel: the ＋ and the field it opens share one accessible
    // name (they are the same action), so the generic label locator now matches both.
    const input = page.getByRole('textbox', { name: 'Ajouter un aliment à finir', exact: true })
    await input.fill('Épinards')
    await expectApi(page, 'POST', 'use-soon', () => input.press('Enter'))
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
    // A card opens the recipe view route directly (the detail peek was removed).
    await page.locator('.recipe-card', { hasText: 'Spaghetti' }).first().click() // 4 servings, 400 g pâtes
    const modal = page.locator('.recipe-modal')
    await expect(modal.locator('.recipe-view__ings')).toContainText('400 g')
    await modal.locator('[aria-label="Plus de portions"]').click() // 4 → 5 servings
    await expect(modal.locator('.recipe-view__ings')).toContainText('500 g')
  })

  test('a recipe pushes its ingredients to the list and opens cook mode', async ({ page }) => {
    await page.locator('.recipe-card').first().click() // → recipe view directly (peek removed)
    const modal = page.locator('.recipe-modal')
    // "Ajouter à la liste" lives in the header's ⋯ overflow now (the footer keeps
    // only Cuisiner + Planifier). It opens an ingredient PICKER (e40f990) with
    // nothing pre-selected; pick all, then confirm — that's what posts recipe-to-list.
    await modal.locator('.action-menu__btn').click()
    // The panel is PORTALED to <body>, so it is NOT a descendant of .recipe-modal —
    // reach for it on the page, not inside the modal (ActionMenu.tsx).
    await page.getByRole('menuitem', { name: 'Ajouter à la liste' }).click()
    await modal.locator('.recipe-list-pick__all').click() // Tout sélectionner
    await expectApi(page, 'POST', 'recipe-to-list', () =>
      modal.locator('.recipe-list-pick__actions .btn--primary').click(),
    )
    await modal.locator('.recipe-actions .btn--primary').click() // Cook
    await expect(page.locator('.cook')).toBeVisible()
  })

  test('a step with a duration offers a tappable cook-mode timer', async ({ page }) => {
    // Cook mode is a standalone route now; go straight to it. The parent (full) view
    // lays out every step, and rc1's "Faire bouillir les pâtes 10 minutes" exposes a
    // tappable timer chip — tapping it starts a counting clock in the timer rail.
    await page.goto('/kitchen/recipe/rc1/cook')
    const cook = page.locator('.cook')
    await expect(cook).toBeVisible()
    const chip = cook.locator('.cook__timer-chip').first()
    await expect(chip).toBeVisible()
    await chip.click()
    await expect(cook.locator('.cook__timer-clock')).toContainText(':') // counting down mm:ss
  })

  test('"quoi cuisiner?" toggles a cookability ranking with badges', async ({ page }) => {
    // "Quoi cuisiner?" is a filter pill (recipePills system), not a standalone toggle —
    // and the pills now wait inside the « Filtrer » panel, shut by default so the book
    // opens on recipes rather than on the machinery for narrowing them.
    await page.locator('.recipe-filter').click()
    const toggle = page.locator('.kitchen__pill', { hasText: 'Quoi cuisiner' })
    await expect(toggle).toBeVisible() // pantry has out-of-stock items to rank against
    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-pressed', 'true')
    // None of the seeded recipes need Beurre/Café/Papier, so they read as ready.
    await expect(page.locator('.recipe-card__ready').first()).toBeVisible()
  })

  test('tag chips filter the recipe grid', async ({ page }) => {
    const cards = page.locator('.recipe-card')
    await expect(cards).toHaveCount(4)
    // Tag chips share the « Filtrer » panel with the pills.
    await page.locator('.recipe-filter').click()
    const prefere = page.locator('.kitchen__tag-filter .chip', { hasText: 'préféré' })
    const rapide = page.locator('.kitchen__tag-filter .chip', { hasText: 'rapide' })
    await prefere.click()
    await expect(cards).toHaveCount(1) // only the recipe tagged "préféré" (rc1)
    // Tag filters are multi-select with AND semantics now: adding "rapide" keeps
    // only recipes that carry BOTH tags — still just rc1.
    await rapide.click()
    await expect(cards).toHaveCount(1)
    // Deselect "préféré" → filtered by "rapide" alone: the two recipes tagged rapide.
    await prefere.click()
    await expect(cards).toHaveCount(2)
  })

  test('creating a recipe posts it', async ({ page }) => {
    // The recipe builder is a standalone route (/kitchen/recipe/new) rendering the
    // RecipeForm (.recipe-modal). The ＋ FAB → "Ajouter une recette" tile just
    // navigates here (covered by the add-sheet test); go straight to the builder.
    await page.goto('/kitchen/recipe/new')
    const modal = page.locator('.recipe-modal')
    await modal.waitFor({ state: 'visible' })
    await modal.locator('.recipe-title-input').fill('Soupe aux légumes')
    await expectApi(page, 'POST', 'recipes', () =>
      modal.locator('.recipe-modal__foot button[type="submit"]').click(),
    )
  })

  test('a recipe step edits in a memo, one open at a time', async ({ page }) => {
    // Straight to the recipe builder route (the ＋→tile nav is covered elsewhere).
    await page.goto('/kitchen/recipe/new')
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

// ──────────────────────── tapping a planned meal ───────────────────────

// The two halves of useOpenMeal (components/detail/useOpenMeal). A meal that resolves a
// recipe navigates to it — pinned as a 1-tap budget in tap-budget.spec.ts. A free-text
// meal has no page to jump to, so it still peeks, and the peek is where the plan actions
// live. « Salade César » is the fixture's recipe-less supper; « Spaghetti maison » matches
// recipe rc1 by title.
test('a recipe-less meal still opens the peek, with its plan actions', async ({ page }) => {
  await APP('/board')(page)
  await settle(page, '.board-wall')
  await page.locator('.now-card__meal').filter({ hasText: 'Salade César' }).first().click()

  const sheet = page.locator('.detail-sheet')
  await sheet.waitFor({ state: 'visible', timeout: 10_000 })
  await expect(sheet.locator('.detail-sheet__title')).toHaveText('Salade César')
  // It stayed put — a peek, not a navigation.
  await expect(page).toHaveURL(/\/board$/)
  // The actions a recipe view could never carry, because they belong to the PLAN.
  const actions = sheet.locator('.detail-sheet__actions')
  await expect(actions.getByText('Voir la journée', { exact: true })).toBeVisible()
  await expect(actions.getByText('Retirer du plan', { exact: true })).toBeVisible()
  // …and none of the "go to the recipe" buttons that used to make this a menu.
  await expect(actions.getByText('Ouvrir la recette', { exact: true })).toHaveCount(0)
  await expect(actions.getByText('Cuisiner', { exact: true })).toHaveCount(0)
})

// ──────────────────────── kid meal suggestion ──────────────────────────

test('a kid recipe pick drops a dated idea into the meal-ideas pool', async ({ page }) => {
  await APP('/kitchen', 'toddler')(page)
  await settle(page, '.hub')
  // Hear-first: a toddler action tile speaks on the FIRST tap and arms; a SECOND
  // tap commits — so nothing happens by accident. Pick a recipe by name (the
  // shelf's first tile is now the "Les collections" door, not a recipe).
  const recipe = page.locator('.kid-pick .bigtile', { hasText: 'Spaghetti maison' }).first()
  await recipe.click()
  await expect(recipe).toHaveClass(/is-armed/)
  await recipe.click()
  await expect(page.locator('.kid-pick .bigtile', { hasText: 'Mardi' })).toBeVisible()
  // Tapping a day (Mardi) no longer schedules the supper — a pre-reader shouldn't
  // silently commit a real day. It drops an IDEA into "Idées de repas" (C-14: the
  // real `date` column now, not the old "<recipe> (Mardi)" title-suffix hack),
  // keeping the recipe link + the chosen day, for a parent to place later. Still
  // gated by the confirming second tap (first arms + speaks).
  const mardi = page.locator('.kid-pick .bigtile', { hasText: 'Mardi' })
  await mardi.click()
  await expect(mardi).toHaveClass(/is-armed/)
  const [req] = await Promise.all([
    page.waitForRequest(isApi('POST', 'meal-ideas'), { timeout: 15_000 }),
    mardi.click(),
  ])
  const body = JSON.parse(req.postData() || '{}')
  expect(body).toMatchObject({ title: 'Spaghetti maison', recipeId: 'rc1' })
  expect(typeof body.date).toBe('number')
})

test('routines surface the current moment first (morning vs evening)', async ({ page }) => {
  // Freeze the clock so timeOfDay() is deterministic. 12:00Z = 8 AM in the
  // config's America/Toronto (June, UTC-4) → morning.
  await page.clock.setFixedTime(new Date('2026-06-08T12:00:00Z'))
  await APP('/maison', 'toddler')(page)
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
  await APP('/maison', 'toddler')(page)
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

// Going BACK — Marc's ask: a three-year-old taps → too fast, and the story had no
// rewind. Two ways, both un-marking the step (the current one is DERIVED, so an
// un-done step IS the story rewinding to it): the big ← beside the →, and a
// hear-first two-tap on a done step in the filmstrip (BigTiles' arm pattern).
test('a routine can go back: the ← un-does the last step, and a done strip step rewinds on the second tap', async ({ page }) => {
  await APP('/maison', 'toddler')(page)
  await settle(page, '.hub')
  await page.locator('.kid__face', { hasText: 'Noah' }).click() // Dodo: 3 steps, none done
  // Nothing is done yet → nowhere to go back to.
  await expect(page.locator('.tdl-prev')).toHaveCount(0)
  await page.locator('.tdl-start').click()
  await page.locator('.tdl-finish').click() // → step 1 done, we're on step 2

  // ← un-marks the step we just finished (PATCH done:false) and the ✓ leaves the strip.
  const strip = page.locator('.tdl-step')
  await expect(strip.nth(0).locator('.tdl-step__check')).toBeVisible()
  const [back] = await Promise.all([
    page.waitForRequest((r) => r.method() === 'PATCH' && new URL(r.url()).pathname.endsWith('/api/routines')),
    page.locator('.tdl-prev').click(),
  ])
  expect(back.postDataJSON()).toMatchObject({ cardIdx: 0, done: false })
  await expect(strip.nth(0).locator('.tdl-step__check')).toHaveCount(0)
  await expect(page.locator('.tdl-prev')).toHaveCount(0) // back on step 1: nowhere behind

  // The filmstrip: a DONE step is hear-first — tap 1 arms + speaks, tap 2 rewinds.
  await page.locator('.tdl-finish').click() // step 1 done again
  let patched = false
  page.on('request', (r) => {
    if (r.method() === 'PATCH' && new URL(r.url()).pathname.endsWith('/api/routines')) patched = true
  })
  await strip.nth(0).click()
  await expect(strip.nth(0)).toHaveClass(/is-armed/)
  expect(patched).toBe(false) // the first tap only speaks — a wandering finger commits nothing
  await strip.nth(0).click()
  await expect(strip.nth(0)).not.toHaveClass(/is-armed/)
  await expect(strip.nth(0).locator('.tdl-step__check')).toHaveCount(0)
  expect(patched).toBe(true)

  // A FUTURE step never jumps the story — it only speaks itself.
  await strip.nth(2).click()
  await expect(strip.nth(2).locator('.tdl-step__check')).toHaveCount(0)
})

// Picking a routine back up mid-day: the ▶ says « Continuer », not « Commencer »
// (Léa's Matin arrives with step 1 already done in the mock).
test('a half-done routine resumes: the ▶ reads « Continuer »', async ({ page }) => {
  await APP('/maison', 'toddler')(page)
  await settle(page, '.hub')
  await page.locator('.kid__face', { hasText: 'Léa' }).click()
  await expect(page.getByRole('button', { name: 'Continuer' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Commencer' })).toHaveCount(0)
})

// ──────────────────────────── shared list ──────────────────────────────

// One active list: a check is a MARK (the row stays, struck through via
// .list-row__main.done) until "Clear checked" removes the ticked ones. Past /
// predicted re-adds live behind the ⚡ Quick add panel. The row CENTRE (the name)
// toggles the check — same handler as the far-right disc (the in-store gesture);
// the PICTURE opens the edit scene (compact-rows pass: no always-on pencil; the
// per-item deals lookup moved inside that scene).
const openList = (page: Page) => page.locator('.today-feed > .list-rows > .list-row')
const checkedRows = (page: Page) => page.locator('.list-row__main.done')
const checkOff = (row: ReturnType<Page['locator']>) => row.locator('.list-row__toggle').click()
const editRow = (row: ReturnType<Page['locator']>) => row.locator('.list-row__img').click()

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

  // The row CENTRE is the check too (shop seam #1): tapping the name toggles the
  // mark — the big target does the frequent in-store job; the editor now waits
  // behind the explicit ✏️ instead of ambushing a mis-aimed thumb.
  test('tapping the row centre (the name) toggles the check', async ({ page }) => {
    const rows = openList(page)
    await expectApi(page, 'PATCH', 'list', () => rows.first().locator('.list-row__name').click())
    await expect(checkedRows(page)).toHaveCount(1)
    // Same target unchecks — a mis-tap costs one more tap, never an edit scene.
    await rows.first().locator('.list-row__name').click()
    await expect(checkedRows(page)).toHaveCount(0)
  })

  // « Pas pressé »: an item we only buy on a good deal. ONE switch on the row's own
  // edit scene, off by default (an added item is always a real errand), written the
  // moment it's flipped. The row comes back to the list wearing its second class:
  // a faded card + a NAMED tag, never colour alone — and settled at the BOTTOM, out
  // of the way of the real errands.
  test('flagging an item « pas pressé » fades its row, names it, and sinks it', async ({ page }) => {
    const rows = openList(page)
    await expect(page.locator('.list-row--norush')).toHaveCount(0)
    // The ✏️ pencil opens the edit scene (the name/centre toggles the check now).
    const flagged = await rows.nth(1).locator('.title').innerText()
    await editRow(rows.nth(1))
    const chip = page.getByRole('button', { name: 'Pas pressé' })
    // Off by default — the scene asks nothing of an ordinary grocery line.
    await expect(chip).toHaveAttribute('aria-pressed', 'false')
    await expectApi(page, 'PATCH', 'list', () => chip.click())
    await expect(chip).toHaveAttribute('aria-pressed', 'true')
    await page.getByRole('button', { name: 'Fermer' }).click()
    // Back on the list, the flag survives the board refetch — exactly one row, and
    // it's now the last one: an aubaine-only line never sits between two errands.
    await expect(page.locator('.list-row--norush')).toHaveCount(1)
    await expect(rows.last().locator('.list-row__norush')).toHaveText(/Pas pressé/)
    await expect(rows.last().locator('.title')).toHaveText(flagged)
  })

  // The same switch is the way back — a mis-tap costs one tap, not a delete + re-add.
  test('the « pas pressé » switch turns the flag back off', async ({ page }) => {
    const rows = openList(page)
    await editRow(rows.nth(1))
    const chip = page.getByRole('button', { name: 'Pas pressé' })
    await chip.click()
    await expect(chip).toHaveAttribute('aria-pressed', 'true')
    await expectApi(page, 'PATCH', 'list', () => chip.click())
    await expect(chip).toHaveAttribute('aria-pressed', 'false')
    await page.getByRole('button', { name: 'Fermer' }).click()
    await expect(page.locator('.list-row--norush')).toHaveCount(0)
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
    // The list add bar is the shared EditField (form.edit-field), and it has no
    // « Ajouter » button any more — Enter IS the commit (the lean pass). The mic stays,
    // so the box still has buttons; the SUBMIT is the keystroke.
    const bar = page.locator('.edit-field .input').first()
    await bar.fill('Bananes')
    await expectApi(page, 'POST', 'list', () => bar.press('Enter'))
  })

  test('the quick-add panel re-adds a past item and stays open', async ({ page }) => {
    await page.locator('.add-fab').click() // Ajout rapide lives in the ＋ sheet now
    await page.getByRole('dialog').getByRole('button', { name: 'Ajout rapide' }).click() // scope to sheet (page has its own shortcut)
    const panel = page.locator('.scene')
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
    await page.locator('.add-fab').click() // Ajout rapide lives in the ＋ sheet now
    await page.getByRole('dialog').getByRole('button', { name: 'Ajout rapide' }).click() // scope to sheet (page has its own shortcut)
    const chip = page.locator('.scene .qa__chip', { hasText: 'Beurre' })
    const [req] = await Promise.all([
      page.waitForRequest((r) => r.url().includes('/api/list') && r.method() === 'POST'),
      chip.click(),
    ])
    expect(JSON.parse(req.postData() || '{}')).toMatchObject({ text: 'Beurre', search_terms: ['beurre', 'butter'] })
  })

  test('a due-soon prediction shows in quick-add with a tag', async ({ page }) => {
    await page.locator('.add-fab').click() // Ajout rapide lives in the ＋ sheet now
    await page.getByRole('dialog').getByRole('button', { name: 'Ajout rapide' }).click() // scope to sheet (page has its own shortcut)
    // Œufs is 'soon' in the ghost mock and not on the list → tagged in the panel.
    const oeufs = page.locator('.scene .qa__chip', { hasText: 'Œufs' })
    await expect(oeufs).toHaveCount(1)
    await expect(oeufs.locator('.qa__tag')).toBeVisible()
  })

  test('the flyer browser opens', async ({ page }) => {
    await page.locator('.add-fab').click() // flyer browser lives in the ＋ sheet now
    await page.getByRole('dialog').getByRole('button', { name: /Parcourir/ }).click()
    await expect(page.locator('.scene .deals-search')).toBeVisible()
  })

  test('a browsed deal LINKS onto the matching list item, not a new specific-named line', async ({ page }) => {
    await page.locator('.add-fab').click() // flyer browser lives in the ＋ sheet now
    await page.getByRole('dialog').getByRole('button', { name: /Parcourir/ }).click()
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
    // …and the button says WHICH line it rode on: the flyer's product name is
    // nowhere on the list, so a bare ✓ reads as "nothing happened".
    await expect(page.locator('.deal').first().locator('.deal__choose')).toHaveText(/Lait/)
  })

  test('a browsed deal for a new item adds it under the SEARCHED name, not the product name', async ({ page }) => {
    await page.locator('.add-fab').click() // flyer browser lives in the ＋ sheet now
    await page.getByRole('dialog').getByRole('button', { name: /Parcourir/ }).click()
    await page.locator('.deals-search input').fill('fromage') // not on the list yet
    await page.locator('.deals-search button[type="submit"]').click()
    await expect(page.locator('.deal').first()).toBeVisible()
    const [req] = await Promise.all([
      page.waitForRequest(isApi('POST', 'list')),
      page.locator('.deal').first().getByRole('button', { name: /Ajouter à la liste/ }).click(),
    ])
    // The new line is the generic thing searched ("fromage"), NOT the flyer's
    // "Lait 2% 4L" — so quick-add keeps suggesting the generic item next week.
    // `match: true` asks the server to re-run the same reuse-not-duplicate
    // decision before it inserts — the backstop for a cold cache / offline replay.
    expect(JSON.parse(req.postData() || '{}')).toMatchObject({ text: 'fromage', match: true })
  })

  test('a deal add fires ONE write however fast you tap — and the done button is inert', async ({ page }) => {
    // The double-tap bug: two taps = two concurrent adds racing to insert the
    // same line; the label could flip « Ajouté à la liste » → « Sur « fromage » »
    // depending on which answer landed last, and a later re-tap could re-CREATE a
    // line the household had just deleted. Now: writes for one name serialize
    // (lib/picks queuedByName), the caller answers a re-tap from memory, and the
    // done button goes inert with an honest « Ajouté » label.
    await page.locator('.add-fab').click()
    await page.getByRole('dialog').getByRole('button', { name: /Parcourir/ }).click()
    await page.locator('.deals-search input').fill('fromage') // not on the list yet
    await page.locator('.deals-search button[type="submit"]').click()
    await expect(page.locator('.deal').first()).toBeVisible()
    const listWrites: string[] = []
    page.on('request', (r) => {
      if ((r.method() === 'POST' || r.method() === 'PATCH') && /\/api\/list(\?|$)/.test(r.url()))
        listWrites.push(r.postData() ?? '')
    })
    const btn = page.locator('.deal').first().locator('.deal__choose')
    await btn.click({ clickCount: 2, delay: 30 }) // a fast double-tap
    // Honest done state: « Ajouté à la liste » (a NEW line), never the still-armed
    // verb, and never « Sur « fromage » » from the second tap's re-match.
    await expect(btn).toHaveText(/Ajouté à la liste/)
    // A third, later tap is inert — no re-run of the match, no resurrection.
    // (force: Playwright itself refuses an aria-disabled click, which is half the
    // proof; the forced tap proves the handler is gone too, not just the ARIA.)
    await btn.click({ force: true })
    await page.waitForTimeout(400)
    await expect(btn).toHaveText(/Ajouté à la liste/)
    expect(listWrites).toHaveLength(1)
  })

  test('the drag grip is a keyboard door too — ↑ on a focused grip PATCHes the new order', async ({ page }) => {
    // « Mon ordre » reorder was drag-only (ACTIONS.md ¹³): a mouse can drag, a
    // keyboard could not. The ⠿ grip is now focusable and ↑/↓ run the same
    // splice — Tab to the grip, arrow, and the order persists.
    const grips = page.locator('.list-row__grip')
    await expect(grips.first()).toBeVisible()
    const second = grips.nth(1)
    await second.focus()
    const [req] = await Promise.all([page.waitForRequest(isApi('PATCH', 'list')), second.press('ArrowUp')])
    const body = JSON.parse(req.postData() || '{}')
    // The second row moved to the front: a full-order reorder write, its id first.
    expect(Array.isArray(body.reorder)).toBe(true)
    expect(body.reorder[0]).toBe('l2')
  })

  test('a store-flyer add links the SPECIFIC product name onto the generic line', async ({ page }) => {
    // Browsing a whole store flyer has no search concept, so the add carries the
    // raw product name ("Lait 2% 4L"). The matcher must still land it on the
    // generic "Lait" line (whole-word containment) — before, every store-mode add
    // spawned a specific-named duplicate that lost the line's saved synonyms.
    await page.locator('.add-fab').click()
    await page.getByRole('dialog').getByRole('button', { name: /Parcourir/ }).click()
    await page.getByRole('tab', { name: /Par magasin/ }).click()
    await page.locator('.flyer-store', { hasText: 'Super C' }).click()
    await page.getByRole('tab', { name: /Offres/ }).click()
    await page.locator('.flyer-grid__cell').click()
    const [req] = await Promise.all([
      page.waitForRequest(isApi('PATCH', 'list')),
      page.locator('.flyer-detail__add').click(),
    ])
    const body = JSON.parse(req.postData() || '{}')
    expect(body).toMatchObject({ id: 'l1' })
    expect(body.deal?.name).toBe('Lait 2% 4L')
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
    await page.locator('.add-fab').click() // flyer browser lives in the ＋ sheet now
    await page.getByRole('dialog').getByRole('button', { name: /Parcourir/ }).click()
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
    // The viewer now opens on the Plan reconstruction; switch to the gap-free "Offres"
    // grid — one clipping in the fixture.
    await page.getByRole('tab', { name: /Offres/ }).click()
    await expect(page.locator('.flyer-grid__cell')).toHaveCount(1)
    // The position-faithful page reconstruction lives behind the "Plan" tab. The
    // fixture flyer has 2 pages but only page 1 carries an item; the empty cover
    // page must be skipped, so exactly one page renders (no blank box).
    await page.getByRole('tab', { name: /Plan/ }).click()
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
    // l1 (Lait) is seeded added_by m1 (Maman, #B06A93) → since the compact-rows
    // pass, "who" is the TITLE's tint (tintInk inlines the member hex), not an
    // avatar disc.
    const title = page.locator('.list-row', { hasText: 'Lait' }).locator('.title')
    await expect(title).toHaveAttribute('style', /#B06A93/i)
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
    // The row is split now (body peeks the detail, the check disc ticks) — click the check.
    await expectApi(page, 'PATCH', 'chores', () => chore.locator('.act__checkbtn').click())
  })

  test('an upcoming chore shows under À venir with its day', async ({ page }) => {
    await APP('/board')(page)
    await settle(page, '.hub')
    await expect(page.locator('.act', { hasText: 'Vaisselle' })).toBeVisible()
  })

  test('a chore can be given a weekly schedule in settings (PATCH recur)', async ({ page }) => {
    // The legacy ?tab=chores deep-link folds to Maison ▸ Corvées directly (its
    // panel opens on the Corvées SubTab), so no tab click is needed.
    await APP('/settings?tab=chores')(page)
    await settle(page, '.operator__tabs')
    // The "Céduler"-only expander is gone — a chore row is now a ListRow whose
    // RowActions ✏️ ("Modifier la corvée") expands the SAME full ChoreForm (one
    // editor) with the RecurPicker. The .operator__chore-row class only appears on
    // the row while it's editing, so target the edit button via the chores list.
    await page
      .locator('.operator__list')
      .first()
      .locator('li')
      .first()
      .getByRole('button', { name: 'Modifier la corvée' })
      .click()
    const form = page.locator('.operator__chore-row--editing .operator__chore-form')
    await form.locator('.recur select').selectOption('weekly')
    await expectApi(page, 'PATCH', 'chores', () =>
      form.getByRole('button', { name: 'Enregistrer' }).click(),
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

  // Tidy seam #1: « Tout effacer » empties the whole strip as ONE undoable action —
  // the notes hide at once, the writes wait behind the single undo toast, and
  // « Annuler » brings every note back (nothing was deleted server-side yet).
  test('« Tout effacer » batch-dismisses the strip behind one undo toast', async ({ page }) => {
    await APP('/board')(page)
    await settle(page, '.hub')
    // Scope to the fridge-notes strip — the DAY note (DayNote, .notes.day-note)
    // wears .note-card too but is read-only and must survive the sweep.
    const notes = page.locator('.notes:not(.day-note) .note-card')
    await expect(notes).toHaveCount(2)
    await page.getByRole('button', { name: 'Tout effacer' }).click()
    await expect(notes).toHaveCount(0)
    await expect(page.locator('.undo-toast')).toBeVisible()
    await page.locator('.undo-toast__btn').click()
    await expect(notes).toHaveCount(2)
  })
})

// F6 × D8 (Wave T): the toddler board now folds « Mes habitudes » in as read-aloud
// tiles, so a pre-reader hears what today is still asking (« brosse tes dents »).
test('toddler board shows « Mes habitudes » due today, read-aloud not marked', async ({ page }) => {
  await APP('/board', 'toddler')(page)
  await settle(page, '.kid__main')
  // « Bouger un peu » is an every-day 'hours' household habit — due today under any
  // clock — so it surfaces as a picture-first hear-first tile (no frozen clock needed).
  const tile = page.locator('.today-kid__section .bigtile', { hasText: 'Bouger un peu' })
  await expect(tile).toBeVisible()
  // Reading is a nicety, not a mark: a tap on a habit tile must NOT fire a habits write
  // (a parent still marks it in « Le point du jour »).
  let wrote = false
  page.on('request', (r) => {
    if (r.method() !== 'GET' && new URL(r.url()).pathname.endsWith('/api/habits')) wrote = true
  })
  await tile.click()
  await expect(tile).toBeVisible()
  expect(wrote).toBe(false)
})

test('toddler reads a step aloud, then starts + finishes it', async ({ page }) => {
  await APP('/maison', 'toddler')(page)
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
