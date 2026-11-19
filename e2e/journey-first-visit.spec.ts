import { test, expect, type App } from './fixtures'
import { settled } from './measure'
import { type Theme, mockApi, seedState, BASE } from './mocks'
import { test as test3, type Page, test as test4, test as test5, test as test7, devices, test as test8 } from '@playwright/test'

// JOURNEY — FIRST VISIT & THE DEMO (review #43; was landing-door.spec.ts + home-welcome.spec.ts + demo-sandbox.spec.ts + demo-claim.spec.ts + first-run-quiet.spec.ts + onboarding.spec.ts + stranger-quiet.spec.ts + install-hint.spec.ts).
//
// Review #30 (2026-11-17), Marco as a stranger:
//   · a device that once tapped « tablette au mur » never saw the landing again;
//   · « J'ai déjà un compte » went to /setup, which reads « create your household »;
//   · the page title stayed French under an English UI on /signup, /login, /conditions;
//   · the privacy page's real selling points sat in the footer.

test.describe('landing-door', () => {
  test('a device that chose a surface but has no account still gets the landing', async ({ app, page }) => {
    await app.boot({ api: { signedIn: false }, state: { surface: 'kiosk' } })
    await page.goto('/')
    await expect(page.locator('.home__hero')).toBeVisible({ timeout: 15_000 })
    // « J'ai déjà un compte » goes to the login.
    await expect(page.locator('.home__cta-link')).toHaveAttribute('href', '/login')
    // The privacy points are on the door, beside the promise.
    await expect(page.locator('.home__promises')).toContainText('Une copie de sauvegarde chaque nuit')
  })

  test('the signed-out board offers the way back to the pitch', async ({ app, page }) => {
    await app.boot({ api: { signedIn: false, unauthorized: true }, state: { surface: 'kiosk' }, route: '/board' })
    await expect(page.locator('.pairprompt__home')).toHaveAttribute('href', '/')
  })

  test('a standalone page is titled in the reader’s language', async ({ app, page }) => {
    await app.boot({ api: { signedIn: false }, state: { lang: 'en' }, route: '/login' })
    await expect(page).toHaveTitle('Babillard · The whole household, at a glance')
  })
})

// ── folded from journey-first-visit.spec.ts ──────────────────────────────────────────────
test.describe('home-welcome', () => {
  // One-off capture of the welcome/marketing front door (the brand-new-visitor
  // Home). NOT seeding a surface keeps `chosen` false so Entry renders <Home>
  // instead of redirecting to /board. Writes e2e/screenshots/home-*.png.

  const PHONE = { width: 390, height: 844 }
  const WIDE = { width: 1000, height: 900 }

  // Brand-new visitor: signed-out (Entry shows <Home> only when not signed in), and no
  // surface in the seed, so the device has not "chosen" yet.
  async function arrive(app: App, theme: Theme, format: { width: number; height: number }) {
    const { page } = app
    await app.boot({ viewport: format, state: { theme, calm: true, audience: undefined, surface: undefined } })
    await page.route('**/api/auth/me', (route) => route.fulfill({ status: 401, contentType: 'application/json', body: '{}' }))
    await page.goto('/')
    await page.locator('.home').waitFor({ state: 'visible', timeout: 15_000 })
    await settled(page)
  }

  // « Essayer sans compte » — the demo door mints a per-visitor SANDBOX (POST
  // /api/demo → { sandbox: true } + session cookies) and lands on /board with no
  // ?guest= (the visitor is a real operator of a throwaway household). The legacy
  // read-only fallback ({ guestToken }) keeps the old ?guest= boot — asserted too.
  test('demo button: sandbox lands on /board, fallback keeps ?guest=', async ({ page, app }) => {
    await arrive(app, 'day', PHONE)
    await page.route('**/api/demo', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ sandbox: true, expiresAt: 9999999999 }) }),
    )
    await page.getByRole('button', { name: 'Essayer sans compte' }).click()
    await page.waitForURL('**/board')

    // Fallback shape: past the sandbox cap the endpoint returns a guest token.
    await arrive(app, 'day', PHONE)
    await page.route('**/api/demo', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ guestToken: 'tok_demo', expiresAt: 9999999999 }) }),
    )
    await page.getByRole('button', { name: 'Essayer sans compte' }).click()
    await page.waitForURL('**/board?guest=tok_demo')
  })

  for (const theme of ['day', 'night'] as Theme[]) {
    const sfx = theme === 'night' ? '-night' : ''
    test(`home-phone${sfx}`, async ({ page, app }) => {
      await arrive(app, theme, PHONE)
      await page.screenshot({ path: `e2e/screenshots/home-phone${sfx}.png`, fullPage: true })
    })
    test(`home-wide${sfx}`, async ({ page, app }) => {
      await arrive(app, theme, WIDE)
      await page.screenshot({ path: `e2e/screenshots/home-wide${sfx}.png`, fullPage: true })
    })
    test(`setup${sfx}`, async ({ page, app }) => {
      await arrive(app, theme, PHONE)
      await page.goto('/setup')
      await page.locator('.setup__choices').waitFor({ state: 'visible', timeout: 15_000 })
      await settled(page)
      await page.screenshot({ path: `e2e/screenshots/setup${sfx}.png`, fullPage: true })
    })
  }
})


// ── folded from journey-first-visit.spec.ts ──────────────────────────────────────────────
test3.describe('demo-sandbox', () => {
  // The demo SANDBOX board (functions/api/demo.ts — an ordinary operator session whose
  // email marks it throwaway). Its board used to open on TWO stacked banners about the
  // demo — the try-this welcome card AND the claim strip — so a visitor who came to SEE
  // the app got a screen and a half of chrome and no board.
  //
  // The invariant now: the « Garder ma maisonnée » offer is on screen EXACTLY ONCE —
  // inside the welcome card while that's up, and in the strip once it's dismissed. Never
  // twice (the fold), never zero (the conversion path can't vanish).
  test3.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await mockApi(page, { sandbox: true })
    await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile' })
  })

  test3('the sandbox board offers « Garder ma maisonnée » exactly once, before and after dismissal', async ({ page }) => {
    await page.goto('/board')
    const welcome = page.locator('.welcome-card')
    await expect(welcome).toBeVisible({ timeout: 15_000 })

    // One card, and the claim lives inside it — not in a second banner.
    const claimCta = page.getByRole('link', { name: /garder ma maisonnée/i })
    await expect(claimCta).toHaveCount(1)
    await expect(welcome.locator('.welcome-card__claim')).toBeVisible()
    await expect(page.locator('.sample-banner')).toHaveCount(0)

    // Put the card away → the strip takes the offer over, in the same beat.
    await welcome.locator('.welcome-card__dismiss').click()
    await expect(welcome).toHaveCount(0)
    await expect(page.locator('.sample-banner')).toBeVisible()
    await expect(page.getByRole('link', { name: /garder ma maisonnée/i })).toHaveCount(1)
  })

  test3('a sandbox visitor can reach the claim form', async ({ page }) => {
    await page.goto('/board')
    await page.getByRole('link', { name: /garder ma maisonnée/i }).click()
    await expect(page).toHaveURL(/\/garder/)
  })
})


// ── folded from journey-first-visit.spec.ts ──────────────────────────────────────────────
test4.describe('demo-claim', () => {
  // « Garder ma maisonnée » — the sandbox claim flow. A demo-sandbox session is an
  // ORDINARY operator whose /api/auth/me email is `demo-<id>@babillard.invalid`
  // (functions/api/demo.ts); the SPA detects that pattern (lib/demo.ts) and the
  // board's SampleBanner wears its claim face → /garder → POST /api/demo/claim.
  // These pin the whole client leg: banner shows for a sandbox (and only one),
  // the form validates + fires the POST, and non-sandbox visitors bounce.

  const PHONE = { width: 390, height: 844 }
  const SANDBOX_ME = {
    signedIn: true,
    email: 'demo-h1@babillard.invalid',
    household: { id: 'h1', name: 'La maisonnée démo', tier: 'free' },
  }

  async function bootSandbox(page: Page, path = '/board') {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.setViewportSize(PHONE)
    await mockApi(page)
    // Registered after mockApi so it wins: the sandbox operator identity.
    await page.route('**/api/auth/me', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SANDBOX_ME) }),
    )
    await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile' })
    await page.goto(path)
  }

  test4('the claim banner shows for a sandbox session and leads to /garder', async ({ page }) => {
    await bootSandbox(page)
    // The claim offer opens INSIDE the welcome card (one card, not two banners about
    // the demo — see e2e/journey-first-visit.spec.ts); the strip takes it over once that card
    // is dismissed. This test owns the strip's own face + its route to /garder.
    await page.locator('.welcome-card__dismiss').click()

    const banner = page.locator('.sample-banner')
    await expect(banner).toBeVisible()
    await expect(banner).toContainText('C’est ta maisonnée d’essai')
    // The claim face replaces the ordinary sample face — never both strips.
    await expect(page.getByRole('button', { name: 'Vider et commencer' })).toHaveCount(0)

    await banner.getByRole('link', { name: 'Garder ma maisonnée' }).click()
    await page.waitForURL('**/garder')
    await expect(page.getByRole('heading', { name: 'Garder ma maisonnée' })).toBeVisible()
  })

  test4('the claim form fires POST /api/demo/claim with the chosen credentials', async ({ page }) => {
    await bootSandbox(page, '/garder')
    await expect(page.getByRole('heading', { name: 'Garder ma maisonnée' })).toBeVisible()

    let claimBody: Record<string, unknown> | null = null
    await page.route('**/api/demo/claim', (route) => {
      claimBody = route.request().postDataJSON() as Record<string, unknown>
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, email: 'famille@exemple.ca' }),
      })
    })

    // The two new-password inputs share their autocomplete; label text embeds the
    // inline hint, so target by input attributes (the Signup field structure).
    await page.locator('input[type="email"]').fill('famille@exemple.ca')
    await page.locator('input[autocomplete="new-password"]').first().fill('motdepasse1')
    await page.locator('input[autocomplete="new-password"]').nth(1).fill('motdepasse1')
    await page.getByRole('button', { name: 'Garder ma maisonnée' }).click()

    await page.waitForURL('**/board')
    expect(claimBody).not.toBeNull()
    expect(claimBody).toMatchObject({ email: 'famille@exemple.ca', password: 'motdepasse1' })
  })

  test4('mismatched passwords surface an error instead of posting', async ({ page }) => {
    await bootSandbox(page, '/garder')
    let posted = false
    await page.route('**/api/demo/claim', (route) => {
      posted = true
      return route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' })
    })
    await page.locator('input[type="email"]').fill('famille@exemple.ca')
    await page.locator('input[autocomplete="new-password"]').first().fill('motdepasse1')
    await page.locator('input[autocomplete="new-password"]').nth(1).fill('motdepasse2')
    await page.getByRole('button', { name: 'Garder ma maisonnée' }).click()
    await expect(page.getByRole('alert')).toContainText('ne concordent pas')
    expect(posted).toBe(false)
  })

  test4('the sandbox welcome card lists try-this deep links (never the setup checklist)', async ({ page }) => {
    await bootSandbox(page)
    const card = page.locator('.welcome-card')
    await expect(card).toBeVisible()
    await expect(card).toContainText('Essaie sans compte')
    // The first two land ON their target once the seeded rows load (stranger review
    // 2026-10-23): a recipe, and a routine's run scene — not the bare tab.
    await expect(card.getByRole('link', { name: 'Ouvre une recette, pars le mode cuisson' })).toHaveAttribute(
      'href',
      '/kitchen/recipe/rc1',
    )
    await expect(card.getByRole('link', { name: 'Fais une routine d’enfant, étape par étape' })).toHaveAttribute(
      'href',
      new RegExp('^/routine/[^/]+/run$'),
    )
    // Deep links ride the existing URL grammar (DISCOVERY.md): ?plus= / ?edit=1.
    await expect(card.getByRole('link', { name: 'Ajoute quelque chose à la liste' })).toHaveAttribute(
      'href',
      '/liste?plus=1',
    )
    await expect(card.getByRole('link', { name: 'Déplace une carte du babillard' })).toHaveAttribute(
      'href',
      '/board?edit=1',
    )
    // The real-household setup steps stay out of the sandbox face.
    await expect(card.getByRole('link', { name: 'Jumeler une tablette (optionnel)' })).toHaveCount(0)
  })

  test4('a regular (non-sandbox) session sees no claim banner and /garder bounces home', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.setViewportSize(PHONE)
    await mockApi(page) // default AUTH_ME: famille@exemple.ca — a real account
    await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile' })
    await page.goto('/garder')
    await page.waitForURL('**/board')
    await expect(page.locator('.sample-banner').getByRole('link', { name: 'Garder ma maisonnée' })).toHaveCount(0)
  })

  test4('the trial phone board is a short curated glance, with « Tout voir » for the rest', async ({ page }) => {
    await bootSandbox(page)
    const cards = page.locator('.board-band > *, .board-grid > *')
    await expect(page.getByRole('button', { name: 'Tout voir' })).toBeVisible()
    const before = await cards.count()
    expect(before).toBeLessThanOrEqual(5)
    await page.getByRole('button', { name: 'Tout voir' }).click()
    await expect(page.getByRole('button', { name: 'Voir moins' })).toBeVisible()
    expect(await cards.count()).toBeGreaterThan(before)
  })
})


// ── folded from journey-first-visit.spec.ts ──────────────────────────────────────────────
test5.describe('first-run-quiet', () => {
  // THE FIRST DAY BELONGS TO THE WELCOME (lib/habitCheckin + lib/tour).
  //
  // Two shell-level automations both fire on a brand-new device: the essentials tour
  // auto-launches for a first-time parent, and « Le point du jour » opens itself the
  // first time the app is opened on a new local day when a habit is due. The seed puts
  // habits on today, so the demo walk of 2026-09-16 found a stranger's FIRST screen was
  // the habits scene with the welcome dialog drawn over it (STATE.md §4-K wave 1).
  //
  // The rule: on a device that has not met the tour, the check-in stamps the day and
  // stands down. The control case pins that the morning open still works once the
  // welcome has been seen — a guard that only proved the quiet half would pass by the
  // feature being broken.

  const fresh = async (page: Parameters<typeof seedState>[0], opts: { tourSeen: boolean }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.clock.setFixedTime(new Date(BASE * 1000))
    await mockApi(page)
    // Production's shape, not the mock's: the habits payload arrives from the NETWORK
    // after the tour has already started, so the check-in's navigation lands LAST and
    // wins. An instant stub answers before the tour mounts, the tour's own navigation
    // wins instead, and the old code passed this spec by accident. Registered after
    // mockApi so it runs first, waits, then falls through to the stub.
    await page.route('**/api/habits**', async (route) => {
      await new Promise((r) => setTimeout(r, 700))
      await route.fallback()
    })
    // `habitCheckin: true` leaves the store at its defaults (autoOpen on, day never
    // stamped) — the state a brand-new browser is in. `tour: true` leaves the tour unseen.
    await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', habitCheckin: true, tour: !opts.tourSeen })
  }

  test5('a brand-new device lands on the board under the welcome — never on the habits scene', async ({ page }) => {
    await fresh(page, { tourSeen: false })
    await page.goto('/board')
    // The welcome is the first thing on screen…
    await expect(page.locator('.tour')).toBeVisible({ timeout: 15_000 })
    // …over the BOARD, not over « Le point du jour ».
    await expect(page).toHaveURL(/\/board(\?|$)/)
    await expect(page.locator('.habitudes')).toHaveCount(0)
    await expect(page.locator('.wg-slot').first()).toBeVisible()

    // Skipping the tour does not hand the day to the check-in either: it was stamped.
    // Scoped to the card: the board's own « Le point du jour » card offers a « Passer » too.
    await page.locator('.tour').getByRole('button', { name: 'Passer' }).click()
    await expect(page.locator('.tour')).toHaveCount(0)
    // Proving nothing pulled the page away: nothing marks an absence, so give it the time it would have taken.
    await page.waitForTimeout(400)
    await expect(page).toHaveURL(/\/board(\?|$)/)
    await page.reload()
    await expect(page.locator('.wg-slot').first()).toBeVisible({ timeout: 15_000 })
    await expect(page).toHaveURL(/\/board(\?|$)/)
  })

  test5('control: on a device that is no longer new, the morning open still opens the scene', async ({ page }) => {
    // The half that proves the feature is not simply switched off. It needs a device that
    // is NOT on its first day — which is a change from the first version of this control,
    // and worth saying why: the quiet rule used to be « has this device met the tour? »,
    // so a fresh browser with the tour marked seen got the morning open on its very first
    // paint. That question could be answered differently depending on when a lazy chunk
    // arrived (see the last test), so the rule is now the device's FIRST DAY. The cost is
    // exactly this: day one is quiet even for someone who skipped the welcome — which is
    // what « the first day belongs to the welcome » said all along; the old mechanism just
    // never delivered it. From day two everything is as before, and that is what this pins.
    await fresh(page, { tourSeen: true })
    await page.addInitScript(() => {
      // Yesterday, in the same local-midnight unit lib/tour stamps.
      const d = new Date()
      d.setHours(0, 0, 0, 0)
      localStorage.setItem('babillard-first-day', String(Math.floor(d.getTime() / 1000) - 86_400))
    })
    await page.goto('/board')
    await expect(page).toHaveURL(/\/board\/habitudes/, { timeout: 15_000 })
    await expect(page.locator('.habitudes')).toBeVisible()
  })

  test5('…and the same holds when the SESSION is what arrives late — the sandbox shape', async ({ page }) => {
    // THE CASE THE FIRST FIX MISSED, found by the live stranger walk on 2026-09-22 and
    // reproduced here.
    //
    // The stand-down was placed « BEFORE the data gate » — but three guards still sat
    // above it, and one of them is `!signedIn && !isPaired()`. A demo sandbox is signed in
    // by the mint's own response, so on the first paints of the board `signedIn` is still
    // false and the effect returns BEFORE stamping the day. By the time the session lands,
    // a quick visitor has already skipped the welcome — so `hasTourSeen` is now true, the
    // stand-down branch is never taken, the day was never stamped, and the morning open
    // fires onto the stranger's first screen. Exactly the 2026-09-16 defect, through a
    // door the fix for it left open.
    //
    // The delay is what makes this a test rather than a decoration: with an instant
    // auth/me the old code passes.
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.clock.setFixedTime(new Date(BASE * 1000))
    await mockApi(page)
    await page.route('**/api/auth/me**', async (route) => {
      await new Promise((r) => setTimeout(r, 900))
      await route.fallback()
    })
    await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', habitCheckin: true, tour: true })

    await page.goto('/board')
    await expect(page.locator('.tour')).toBeVisible({ timeout: 15_000 })
    // Skip the welcome immediately — before the session has confirmed.
    await page.locator('.tour').getByRole('button', { name: 'Passer' }).click()
    await expect(page.locator('.tour')).toHaveCount(0)

    // Now let the session land. The board must still be under us.
    await page.waitForTimeout(1500)
    await expect(page).toHaveURL(/\/board(\?|$)/)
    await expect(page.locator('.habitudes')).toHaveCount(0)
  })

  test5('…and when the BOARD CHUNK is what arrives late — the shape production actually has', async ({ page }) => {
    // THE CASE THE FIRST FIX MISSED, found by the live stranger walk on 2026-09-22 and
    // reproduced against production three times before being written down here.
    //
    // The stand-down asked « has this device met the tour? » from inside
    // `useHabitCheckinTrigger`, which lives in HubLayout — a LAZY chunk since the
    // door-weight pass. On a real connection the shell paints and the welcome starts while
    // the board is still « Chargement… ». A visitor who skips the welcome inside that
    // window flips the answer to true before the hook exists, so the stand-down is never
    // taken and the morning open throws them into « Le point du jour ».
    //
    // Delaying the hub module is what makes this a test: without the delay the hook is
    // always mounted first and the old code passes, which is exactly why it did.
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.clock.setFixedTime(new Date(BASE * 1000))
    await mockApi(page)
    await page.route('**/HubLayout*', async (route) => {
      await new Promise((r) => setTimeout(r, 2500))
      await route.fallback()
    })
    await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', habitCheckin: true, tour: true })

    await page.goto('/board')
    // The welcome is up while the board is still loading — the real first screen.
    await expect(page.locator('.tour')).toBeVisible({ timeout: 15_000 })
    await page.locator('.tour').getByRole('button', { name: 'Passer' }).click()
    await expect(page.locator('.tour')).toHaveCount(0)

    // Now let the hub arrive. The board must be what lands, not the habits scene.
    await expect(page.locator('.wg-slot').first()).toBeVisible({ timeout: 15_000 })
    // Proving nothing pulled the page away: nothing marks an absence, so give it the time it would have taken.
    await page.waitForTimeout(600)
    await expect(page).toHaveURL(/\/board(\?|$)/)
    await expect(page.locator('.habitudes')).toHaveCount(0)
  })

  // A DEEP LINK IS NOT HIJACKED (2026-09-29). The tour lives at the app root and used to
  // auto-start on WHATEVER page a new device opened first — and its first act is to go to
  // its start route. So a newcomer who opened a Réglages link, a shared page or any
  // bookmark before meeting the tour was pulled to the board mid-load. The weekly stranger
  // walk hit it every Monday on the phone (« navigation interrupted by another navigation
  // to /board ») and only passed on retry. The welcome now waits for the board.
  test5('a brand-new device that opens a deep link stays there — the welcome waits for the board', async ({ page }) => {
    await fresh(page, { tourSeen: false })
    await page.goto('/settings?tab=settings')
    await expect(page.locator('#operator-panel')).toBeVisible({ timeout: 15_000 })
    // Long enough for the auth check to resolve and the old auto-launch to navigate.
    await page.waitForTimeout(1_500)
    await expect(page, 'the tour pulled a deep link to the board').toHaveURL(/\/settings/)
    await expect(page.locator('.tour')).toHaveCount(0)

    // …and it has not been lost: the first visit to the board is where it begins.
    await page.getByRole('link', { name: 'Aujourd’hui' }).first().click()
    await expect(page.locator('.tour')).toBeVisible({ timeout: 15_000 })
  })
})


// ── folded from journey-first-visit.spec.ts ──────────────────────────────────────────────
test.describe('onboarding', () => {
  // The first-run onboarding SEQUENCE (not a pile-up). A real signup lands EMPTY on the
  // setup checklist (WelcomeCard) since 2026-09-23; its « Charger des exemples » loads
  // the demo family on request (POST /api/seed). While that family is present, the board
  // shows ONLY the explore banner (SampleBanner) and the checklist stays hidden — its
  // "add your family" step would read as done off the demo rows. « Vider et commencer »
  // clears the demo (DELETE /api/seed) → the checklist takes over again.
  //
  // Frontend-only against mocked /api/*. /api/seed is stubbed with a STATEFUL count
  // (GET returns it, DELETE clears it), registered AFTER mockApi so it wins for that
  // path. The essentials tour is pre-marked seen so its overlay doesn't gate the cards.
  async function openBoard(app: App, opts: { hasSample: boolean; fresh?: boolean }) {
    const { page } = app
    await app.boot({ api: { fresh: opts.fresh } })
    let count = opts.hasSample ? 47 : 0
    await page.route('**/api/seed', async (route) => {
      const method = route.request().method()
      if (method === 'DELETE') count = 0
      else if (method === 'POST') count = 47
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ count }) })
    })
    await page.goto('/board')
    await page.locator('.hub').first().waitFor({ state: 'visible', timeout: 15_000 })
  }

  // « Not loaded yet » is not « not done ». A finished household's board opened with 412px of
  // checklist over it until the paired devices arrived, then jumped back up. The matrix saw it
  // on board-kiosk (746px against a 368px budget) whenever that read lost the race.
  test('a finished household never sees the checklist while its devices load', async ({ page, app }) => {
    await app.boot({ api: {} })
    await page.route('**/api/seed', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ count: 0 }) }),
    )
    let release = () => {}
    const held = new Promise<void>((r) => (release = r))
    await page.route('**/api/pair/devices', async (route) => {
      await held
      await route.fallback()
    })
    await page.goto('/board')
    await page.locator('.wg-slot').first().waitFor({ state: 'visible', timeout: 15_000 })
    await page.waitForResponse('**/api/meals', { timeout: 5_000 }).catch(() => {})
    await expect(page.locator('.welcome-card')).toHaveCount(0)
    release()
    await page.waitForResponse('**/api/pair/devices')
    await expect(page.locator('.welcome-card')).toHaveCount(0)
  })

  test('demo present → only the explore banner shows; the setup checklist is suppressed', async ({ page, app }) => {
    await openBoard(app, { hasSample: true })
    const banner = page.locator('.sample-banner')
    await expect(banner).toBeVisible()
    await expect(banner).toContainText('Vider et commencer')
    // The setup checklist would mislead while the demo fills the board — it must not show.
    await expect(page.locator('.welcome-card')).toHaveCount(0)
  })

  test('« Vider et commencer » fires the clear (DELETE /api/seed) and the banner unmounts', async ({ page, app }) => {
    await openBoard(app, { hasSample: true })
    await page.locator('.sample-banner').getByRole('button', { name: /Vider et commencer/ }).click()
    const [req] = await Promise.all([
      page.waitForRequest((r) => r.url().includes('/api/seed') && r.method() === 'DELETE'),
      // Confirm the dialog.
      page.locator('.confirm').getByRole('button', { name: /Vider et commencer/ }).click(),
    ])
    expect(req.method()).toBe('DELETE')
    // count → 0 (stateful stub) → the shared sample query refetches → the banner unmounts.
    await expect(page.locator('.sample-banner')).toHaveCount(0)
  })

  test('fresh empty household, no demo → the setup checklist shows directly, no banner', async ({ page, app }) => {
    await openBoard(app, { hasSample: false, fresh: true })
    await expect(page.locator('.sample-banner')).toHaveCount(0)
    const welcome = page.locator('.welcome-card')
    await expect(welcome).toBeVisible()
    await expect(welcome).toContainText('étapes')
  })

  // A failed examples write SAYS so. All five examples handlers used to swallow the error:
  // the button re-enabled and nothing else happened (2026-09-23). useSampleWrite owns
  // the notice now; these two pin it on the two board doors.
  test('a failed « Charger des exemples » says so, and the checklist stays', async ({ page, app }) => {
    await openBoard(app, { hasSample: false, fresh: true })
    await page.route('**/api/seed', (route) =>
      route.request().method() === 'POST' ? route.fulfill({ status: 500, contentType: 'application/json', body: '{}' }) : route.fallback(),
    )
    const welcome = page.locator('.welcome-card')
    await welcome.getByRole('button', { name: /Charger des exemples/ }).click()
    await expect(page.getByText('Pas enregistré — réessaie.')).toBeVisible()
    await expect(welcome).toBeVisible()
    await expect(welcome.getByRole('button', { name: /Charger des exemples/ })).toBeEnabled()
  })

  test('a failed « Vider et commencer » says so, and the banner stays', async ({ page, app }) => {
    await openBoard(app, { hasSample: true })
    await page.route('**/api/seed', (route) =>
      route.request().method() === 'DELETE' ? route.fulfill({ status: 500, contentType: 'application/json', body: '{}' }) : route.fallback(),
    )
    await page.locator('.sample-banner').getByRole('button', { name: /Vider et commencer/ }).click()
    await page.locator('.confirm').getByRole('button', { name: /Vider et commencer/ }).click()
    await expect(page.getByText('Pas enregistré — réessaie.')).toBeVisible()
    await expect(page.locator('.sample-banner')).toBeVisible()
  })

  test('the checklist offers the examples on request — and hands over to the banner', async ({ page, app }) => {
    await openBoard(app, { hasSample: false, fresh: true })
    const welcome = page.locator('.welcome-card')
    const [req] = await Promise.all([
      page.waitForRequest((r) => r.url().includes('/api/seed') && r.method() === 'POST'),
      welcome.getByRole('button', { name: /Charger des exemples/ }).click(),
    ])
    expect(req.method()).toBe('POST')
    // count → 47 (stateful stub) → the banner explains them, the checklist steps aside.
    await expect(page.locator('.sample-banner')).toBeVisible()
    await expect(welcome).toHaveCount(0)
  })
})


// ── folded from journey-first-visit.spec.ts ──────────────────────────────────────────────
test7.describe('stranger-quiet', () => {
  // WHAT A STRANGER MUST NOT SEE (STATE.md §4-K wave 1 — the demo walk, 2026-09-16).
  //
  // Two things the walk found on production that no fixture-driven spec had ever asked:
  //
  //   1. The marketing page opened the household realtime socket with NO credential. The
  //      server 401'd the handshake, the client's backoff retried every 2→30 s forever,
  //      and the error sat in the visitor's console. The socket now follows the SESSION
  //      (lib/auth connects on a confirmed sign-in; main.tsx only for a paired tablet).
  //   2. Réglages ▸ Découvrir greeted a brand-new device with « Quoi de neuf » about a
  //      RENAME — something that is only news to someone who knew the old name. A device
  //      with no history starts with every current line marked seen.
  //
  // …and a third, added 2026-09-17 after the LIVE walk caught the same shape returning:
  // the household-timezone sync asked /api/household on the marketing door and took a 401
  // on every load. The general rule is what this now pins: a visitor with no credential
  // makes NO authenticated request at all. That is cheaper to hold here, on every push,
  // than to rediscover weekly against production.

  const socketsOpened = (page: Page) => {
    let n = 0
    // Only OUR socket: the harness is Vite, whose HMR channel is a websocket too.
    page.on('websocket', (ws) => {
      if (ws.url().includes('/api/live')) n++
    })
    return () => n
  }

  test7('the marketing page, signed out, never opens the realtime socket', async ({ page }) => {
    const count = socketsOpened(page)
    // No seedState on purpose: a stored surface alone sends `/` to /board (router Entry).
    await mockApi(page, { signedIn: false })
    await page.goto('/')
    await expect(page.locator('.home__cta-demo')).toBeVisible()
    // Long enough for the boot path AND the first reconnect tick (2 s) to have fired.
    await page.waitForTimeout(2600)
    expect(count(), 'a visitor with no session must not knock on /api/live').toBe(0)
  })

  // The door's whole legitimate appetite: who am I, and what can this deployment do. Both
  // answer 200 signed-out; everything else under /api/ needs a credential a stranger has
  // not got, and asking anyway is a 401 in their console on every load.
  const DOOR_MAY_ASK = new Set(['/api/auth/me', '/api/health'])

  test7('the marketing page, signed out, asks the API for nothing it cannot have', async ({ page }) => {
    // Asserted on the REQUESTS, not on 4xx responses — and that distinction is the test7.
    // The first version of this case watched for 401s and passed with the defect present,
    // because `mockApi` answers /api/household with a 200 fixture: a stubbed harness can
    // never show you a status the real server would have sent. What it CAN show, exactly,
    // is which doors were knocked on.
    const asked: string[] = []
    await mockApi(page, { signedIn: false })
    page.on('request', (r) => {
      const { pathname } = new URL(r.url())
      if (pathname.startsWith('/api/') && !DOOR_MAY_ASK.has(pathname)) asked.push(`${r.method()} ${pathname}`)
    })
    await page.goto('/')
    await expect(page.locator('.home__cta-demo')).toBeVisible()
    // Proving no request left: nothing marks an absence, so give it the time it would have taken.
    await page.waitForTimeout(2600)
    expect([...new Set(asked)], 'the signed-out door asked for something only a household can have').toEqual([])
  })

  test7('control: a confirmed operator session opens the socket', async ({ page }) => {
    const count = socketsOpened(page)
    await mockApi(page)
    await seedState(page, { theme: 'day', lang: 'fr' })
    await page.goto('/board')
    await expect(page.locator('.wg-slot').first()).toBeVisible()
    await expect.poll(count, { timeout: 5000 }).toBeGreaterThan(0)
  })

  test7('a brand-new device sees no « Quoi de neuf » — it has nothing to compare with', async ({ page }) => {
    await mockApi(page)
    await seedState(page, { theme: 'day', lang: 'fr' })
    await page.goto('/settings')
    await expect(page.locator('.operator__section, .operator__tabs').first()).toBeVisible()
    await expect(page.getByText('Quoi de neuf')).toHaveCount(0)
  })

  test7('control: a device that dismissed an OLDER line still meets the newer one', async ({ page }) => {
    await mockApi(page)
    await seedState(page, { theme: 'day', lang: 'fr' })
    // A seen list that names a line which is NOT the newest: this device has a before.
    await page.addInitScript(() => {
      localStorage.setItem('babillard-whatsnew-seen', JSON.stringify(['some-older-line-this-device-dismissed']))
    })
    await page.goto('/settings')
    await expect(page.getByText('Quoi de neuf')).toBeVisible()
  })
})


// ── folded from journey-first-visit.spec.ts ──────────────────────────────────────────────
test8.describe('install-hint', () => {
  // « Sur l'écran d'accueil » (lib/install + InstallHint, STATE.md §4-K wave 2).
  //
  // The app has been a PWA for months and nothing ever said so. The rule (Marc,
  // 2026-09-16): ONE quiet line, once, on a device that can install — in Réglages ▸
  // Affichage, and on the board right after an account is created on that device.
  // Two platforms, two shapes: Chromium hands us a `beforeinstallprompt` event and our
  // button calls its prompt(); iOS Safari fires nothing, so the hint is the words for
  // the share sheet. Already standalone → nothing to offer.

  /** Chromium's install offer, faked: the event our listener keeps. */
  const fireInstallPrompt = (page: Page, outcome: 'accepted' | 'dismissed' = 'accepted') =>
    page.evaluate((outcome) => {
      const ev = new Event('beforeinstallprompt', { cancelable: true }) as Event & {
        prompt: () => Promise<void>
        userChoice: Promise<{ outcome: string }>
        prompted?: boolean
      }
      ev.prompt = async () => {
        ev.prompted = true
        ;(window as unknown as { __prompted: boolean }).__prompted = true
      }
      ev.userChoice = Promise.resolve({ outcome })
      window.dispatchEvent(ev)
    }, outcome)

  // Only when the key is ABSENT: an init script runs on every navigation, and re-seeding
  // « pending » on the reload would undo the very dismissal the spec is checking.
  const nudgePending = (page: Page) =>
    page.addInitScript(() => {
      if (!localStorage.getItem('babillard-install')) localStorage.setItem('babillard-install', JSON.stringify({ nudge: 'pending' }))
    })

  test8('after an account is created, the board offers the home screen ONCE — and the button calls the browser’s prompt', async ({ page }) => {
    await mockApi(page)
    await seedState(page, { theme: 'day', lang: 'fr' })
    await nudgePending(page)
    await page.goto('/board')
    await expect(page.locator('.wg-slot').first()).toBeVisible()
    // No prompt event yet, not iOS: nothing to offer, so nothing shows.
    await expect(page.locator('.install-hint')).toHaveCount(0)
    await fireInstallPrompt(page)
    const hint = page.locator('.install-hint')
    await expect(hint).toBeVisible()
    await hint.getByRole('button', { name: 'Installer' }).click()
    await expect.poll(() => page.evaluate(() => (window as unknown as { __prompted?: boolean }).__prompted)).toBe(true)
    // Accepted → the nudge is spent, and it does not come back on the next load.
    await expect(hint).toHaveCount(0)
    await page.reload()
    await expect(page.locator('.wg-slot').first()).toBeVisible()
    await fireInstallPrompt(page)
    await expect(page.locator('.install-hint')).toHaveCount(0)
  })

  test8('« Plus tard » is forever: dismissed once, never again on this device', async ({ page }) => {
    await mockApi(page)
    await seedState(page, { theme: 'day', lang: 'fr' })
    await nudgePending(page)
    await page.goto('/board')
    await expect(page.locator('.wg-slot').first()).toBeVisible()
    await fireInstallPrompt(page)
    await page.locator('.install-hint').getByRole('button', { name: 'Plus tard' }).click()
    await expect(page.locator('.install-hint')).toHaveCount(0)
    await page.reload()
    await expect(page.locator('.wg-slot').first()).toBeVisible()
    await fireInstallPrompt(page)
    await expect(page.locator('.install-hint')).toHaveCount(0)
  })

  test8('a device with no nudge pending never sees the board card, even when it could install', async ({ page }) => {
    await mockApi(page)
    await seedState(page, { theme: 'day', lang: 'fr' })
    await page.goto('/board')
    await expect(page.locator('.wg-slot').first()).toBeVisible()
    await fireInstallPrompt(page)
    // Proving the hint stayed away: nothing marks an absence, so give it the time it would have taken.
    await page.waitForTimeout(300)
    await expect(page.locator('.install-hint')).toHaveCount(0)
  })

  test8('Réglages ▸ Affichage is the standing door: words on Chromium with a prompt, nothing without one', async ({ page }) => {
    await mockApi(page)
    await seedState(page, { theme: 'day', lang: 'fr' })
    await page.goto('/settings?tab=settings&lens=regler&focus=display')
    await expect(page.locator('.operator__section').first()).toBeVisible()
    await expect(page.locator('.install-hint')).toHaveCount(0)
    await fireInstallPrompt(page)
    await expect(page.locator('.install-hint')).toBeVisible()
    await expect(page.locator('.install-hint').getByRole('button', { name: 'Installer' })).toBeVisible()
  })

  test8.describe('iPhone Safari', () => {
    // Only the UA: the full descriptor carries a browser type, which a describe block
    // cannot set. The hint reads the UA, nothing else about the device.
    test8.use({ userAgent: devices['iPhone 13'].userAgent, viewport: devices['iPhone 13'].viewport })
    test8('the hint is the share-sheet words, with no button — Safari has no prompt to call', async ({ page }) => {
      await mockApi(page)
      await seedState(page, { theme: 'day', lang: 'fr' })
      await nudgePending(page)
      await page.goto('/board')
      await expect(page.locator('.wg-slot').first()).toBeVisible()
      const hint = page.locator('.install-hint')
      await expect(hint).toBeVisible()
      await expect(hint).toContainText('Partager')
      await expect(hint.getByRole('button', { name: 'Installer' })).toHaveCount(0)
    })
  })
})
