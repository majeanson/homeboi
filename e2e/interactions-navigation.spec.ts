import { test, expect, type Page } from '@playwright/test'
import { boxOf } from './measure'
import { mockApi, seedState } from './mocks'
import { APP, settle, expectApi } from './interact'

// Interaction coverage, navigation, display toggles and the login form. The harness and its discipline are at the top of interact.ts:
// a form asserts the request it fires, an optimistic flow asserts what the user sees.

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

  test('re-tapping the active tab returns it to the top and its default state', async ({ page }) => {
    // Deep inside La cuisine (the recipe sub-tab), scrolled down: tapping « La
    // cuisine » again must land on its default sub, at the top (HubLayout retapTab).
    // A short viewport so the 7-day plan is guaranteed to scroll — a page that
    // cannot scroll would pass the « back at the top » check without the fix.
    await page.setViewportSize({ width: 390, height: 500 })
    await APP('/kitchen?tab=recipes&x=1')(page)
    const repas = page.getByRole('tab', { name: 'Repas', exact: true })
    await settle(page, '.hub [role="tab"][aria-selected="true"]')
    await expect(repas).toHaveAttribute('aria-selected', 'false')
    const body = page.locator('.hub__body')
    // Scroll inside the poll: the recipe book fills in after the tab paints, and a
    // scroll issued before then has nowhere to go.
    await expect
      .poll(() =>
        body.evaluate((el) => {
          el.scrollTo({ top: el.scrollHeight })
          return el.scrollTop
        }),
      )
      .toBeGreaterThan(100)
    await page.locator('.hubnav a[href="/kitchen"]').click()
    await expect(page).toHaveURL(/\/kitchen$/)
    await expect(page.locator('.hubnav a[href="/kitchen"]')).toHaveClass(/is-active/)
    // The DEFAULT sub-tab, not just the top of the one we were on.
    await expect(repas).toHaveAttribute('aria-selected', 'true')
    await expect.poll(() => body.evaluate((el) => el.scrollTop)).toBe(0)
  })

  test('re-tapping the board tab returns to « Grille », the view picker remembered per device', async ({ page }) => {
    // The board's Grille · Semaine · Mois · Année toggle is NOT in the URL — it is
    // localStorage (lib/boardview) — so dropping ?params alone left a retap on Mois.
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await mockApi(page)
    await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', calm: true, boardView: 'month' })
    await page.goto('/board')
    const on = page.locator('.boardview .segmented__opt[aria-checked="true"]')
    await expect(on).toHaveAttribute('aria-label', 'Mois', { timeout: 15_000 })
    await page.locator('.hubnav a[href="/board"]').click()
    await expect(on).toHaveAttribute('aria-label', 'Grille')
    // …and the device remembers it (a reload here would re-run seedState's init script).
    expect(await page.evaluate(() => localStorage.getItem('babillard-boardview'))).toBe('bento')
  })

  test('Réglages: the « ? » and « Voir dans l’app » sit on the lens toggle’s centre line', async ({ page }) => {
    // SubTabs' wrapper carries a bottom margin; as a flex item in the lens row it was
    // centred WITH that margin, so the tools sat 10px low (Marc, 2026-10-01).
    await page.setViewportSize({ width: 1440, height: 900 })
    await APP('/settings?tab=kitchen')(page)
    const lens = page.locator('.operator__lensrow [role="tablist"]')
    await lens.waitFor({ timeout: 15_000 })
    const mid = (b: { y: number; height: number }) => b.y + b.height / 2
    const lensMid = mid(await boxOf(lens))
    for (const sel of ['.operator__lenstools .help-toggle', '.operator__goto']) {
      expect(Math.abs(mid(await boxOf(page.locator(sel))) - lensMid), sel).toBeLessThanOrEqual(1)
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
      .getByRole('radiogroup', { name: /Parent.*Enfant.*Invité/ })
      .getByRole('radio', { name: 'Enfant' })
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
    // (ToddlerExitGate requireMath={false}); the hold itself unlocks back to parent.
    const sw = page.locator('.kid-exit-switch')
    await expect(sw).toBeVisible()
    const box = await sw.boundingBox()
    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2)
    await page.mouse.down()
    // The hold IS the gesture: past 3 s, a press lasts a duration and no signal stands in for one.
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
    // The hold IS the gesture: past 3 s, a press lasts a duration and no signal stands in for one.
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
      .getByRole('radiogroup', { name: /Parent.*Enfant.*Invité/ })
      .getByRole('radio', { name: 'Enfant' })
      .click()
    // Flipping to the kid lens in Réglages bounces out of settings (the one-way
    // door): the hub comes up in the toddler layer on the board.
    await expect(page.locator('.hub')).toHaveAttribute('data-audience', 'toddler')
    await expect(page).toHaveURL(/\/board$/)
  })

  test('calm toggle flips and persists the opt-out', async ({ page }) => {
    // Calm mode stacks under Système ▸ « Affichage & veille » (28 → 14, 2026-09-08);
    // ?focus= names its card, so the link survives the next pill reshuffle.
    await APP('/settings?tab=settings&sub=display&focus=calm')(page)
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
