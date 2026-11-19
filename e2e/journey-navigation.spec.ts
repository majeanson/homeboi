import { test, expect, type Page } from '@playwright/test'
import { boxOf, settled } from './measure'
import { mockApi, seedState, BASE, MMID, notesFromMots, somedayTask } from './mocks'
import { APP, settle, expectApi } from './interact'
import { test as test2, test as test3, test as test4, test as test5, test as test10, test as test11 } from './fixtures'

// JOURNEY — FINDING THINGS & LANDING ON THEM (review #43; was interactions-navigation.spec.ts + nav-tabs.spec.ts + nav-restructure.spec.ts + guide-deeplink.spec.ts + door-landing.spec.ts + door-sweep.spec.ts + embedded-door.spec.ts + stale-link.spec.ts + search.spec.ts + search-landing.spec.ts + back-closes-overlay.spec.ts).
//
// Interaction coverage, navigation, display toggles and the login form. The harness and its discipline are at the top of interact.ts:
// a form asserts the request it fires, an optimistic flow asserts what the user sees.

// ───────────────────────────── navigation ──────────────────────────────

test.describe('interactions-navigation', () => {
  test.describe('navigation', () => {
    test('the marketing front door leads to the login, and the login to pairing', async ({ page }) => {
      // A first-time visitor — signed out, no account on this device — sees marketing.
      // « J'ai déjà un compte » goes straight to the login since review #30 (it went through
      // /setup, which reads « create your household »); a wall tablet pairs from there.
      await page.emulateMedia({ reducedMotion: 'reduce' })
      await mockApi(page, { signedIn: false })
      await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', calm: true })
      await page.goto('/')
      await settle(page, '.home__title')
      await page.locator('.home__cta-link').click()
      await expect(page).toHaveURL(/\/login$/)
      await page.locator('a[href="/pair"]').first().click()
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
      await expect(on).toHaveAttribute('aria-label', 'Aperçu')
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
})

// ── folded from journey-navigation.spec.ts ──────────────────────────────────────────────
test2.describe('nav-tabs', () => {
  // Tab navigation must actually swap the routed screen — and must never trip an
  // infinite render loop. This is a regression guard for the bug where leaving
  // La cuisine flipped the shell's kitchen-action flags true→false→true every
  // render (HubLayout ↔ Kitchen ping-pong), exceeding React's update depth and
  // freezing the tree: the nav bar changed, the screen didn't. See Kitchen.tsx's
  // registerKitchen effect (idempotent, clears only on unmount) + HubLayout's
  // value-bailing registrar.

  const TABS = [
    { href: '/board', marker: '.board-wall' },
    { href: '/kitchen', marker: '.kitchen' },
    // /maison (Routines is its default section — /cercle was deliberately absent
    // from this list before the nav restructure; the merged tab now covers both).
    { href: '/maison', marker: '.routines-grid' },
    { href: '/notes', marker: '.cercle-notes' },
    { href: '/liste', marker: '.hub__body' },
    { href: '/settings', marker: '.operator' },
  ] as const

  // Fail the test if React ever logs the update-depth warning during navigation.
  function watchForLoop(page: Page): { assertNone: () => void } {
    const hits: string[] = []
    page.on('console', (m) => {
      if (m.type() === 'error' && m.text().includes('Maximum update depth')) hits.push(m.text())
    })
    return {
      assertNone: () => expect(hits, 'React hit an infinite render loop during navigation').toEqual([]),
    }
  }

  async function goTab(page: Page, href: string, marker: string) {
    await page.locator(`.hubnav a[href="${href}"]`).click()
    await expect(page).toHaveURL(new RegExp(`${href.replace('/', '\\/')}$`))
    await expect(page.locator(marker).first()).toBeVisible({ timeout: 10_000 })
  }

  // Leaving La cuisine for every other tab must paint that tab (the original bug
  // only manifested on the way OUT of Kitchen).
  for (const dest of TABS.filter((t) => t.href !== '/kitchen')) {
    test2(`kitchen -> ${dest.href} swaps the screen`, async ({ page, app }) => {
      const loop = watchForLoop(page)
      await app.boot({ viewport: { width: 390, height: 844 } })
      await page.goto('/kitchen')
      await expect(page.locator('.kitchen')).toBeVisible({ timeout: 15_000 })
      await goTab(page, dest.href, dest.marker)
      await expect(page.locator('.kitchen')).toHaveCount(0) // Kitchen actually unmounted
      loop.assertNone()
    })
  }

  // A full round-trip through every tab — content swaps each hop, no loop anywhere.
  test2('round-trip through all tabs swaps content with no render loop', async ({ page, app }) => {
    const loop = watchForLoop(page)
    await app.boot({ viewport: { width: 390, height: 844 } })
    await page.goto('/board')
    await expect(page.locator('.board-wall')).toBeVisible({ timeout: 15_000 })
    for (const tab of [...TABS.slice(1), TABS[0]]) {
      await goTab(page, tab.href, tab.marker)
    }
    loop.assertNone()
  })

  // The in-page SubTabs (La cuisine's Repas · Garde-manger · Recettes · Historique,
  // Le cercle's section switch, etc.) are a WAI-ARIA tablist: ONE tab stop (roving tabindex) and
  // ←/→/Home/End move + select. Locks the a11y keyboard nav added to the shared control.
  test2('SubTabs are keyboard-navigable (roving tabindex + arrow keys)', async ({ page, app }) => {
    await app.boot({ viewport: { width: 390, height: 844 } })
    await page.goto('/kitchen')
    const tablist = page.locator('[data-tour="kitchen-tabs"]')
    await expect(tablist).toBeVisible({ timeout: 15_000 })
    // Roving tabindex: exactly one tab is in the tab order (the selected one).
    await expect(tablist.locator('.subtabs__opt[tabindex="0"]')).toHaveCount(1)
    await expect(tablist.locator('.subtabs__opt[aria-selected="true"]')).toHaveText(/Repas/)
    // ArrowRight moves + selects the next tab; End jumps to the last.
    await tablist.locator('.subtabs__opt[aria-selected="true"]').focus()
    await page.keyboard.press('ArrowRight')
    await expect(tablist.locator('.subtabs__opt[aria-selected="true"]')).toHaveText(/Garde-manger/)
    await page.keyboard.press('End')
    await expect(tablist.locator('.subtabs__opt[aria-selected="true"]')).toHaveText(/Historique/)
    await expect(tablist.locator('.subtabs__opt[tabindex="0"]')).toHaveCount(1)
  })
})


// ── folded from journey-navigation.spec.ts ──────────────────────────────────────────────
test3.describe('nav-restructure', () => {
  // The nav restructure (2026-08): the six hub tabs went from
  // board/kitchen/liste/cercle/routines/settings to board/kitchen/liste/notes/
  // maison/settings. « Le cercle » + Routines merged into ONE /maison tab
  // (Routines · Famille · Social · Business · Carnets, Routines the default
  // section); « Le cercle »'s family-notes board split out into its own /notes
  // tab. This spec pins the query-preserving legacy redirects (router.tsx's
  // LegacyHubRedirect) and the toddler-lens split that the merge/split created —
  // coverage the per-file specs (nav-tabs, interactions, cercle-visual, …) don't
  // exercise end-to-end as a REDIRECT.

  test3.describe('legacy hub redirects (query-preserving)', () => {
    test3('/routines?plus=1 redirects to /maison and opens the ＋ sheet', async ({ page, app }) => {
      await app.boot({ state: { calm: true } })
      await page.goto('/routines?plus=1')
      await expect(page).toHaveURL(/\/maison/)
      await expect(page).not.toHaveURL(/plus=/) // consumed, not replayed on back/refresh
      // Maison's ＋ has more than one tile (routine-pick + the cercle add-set), so
      // '?plus=1' opens the blank chooser sheet, not a single form.
      await expect(page.locator('.sheet.show')).toBeVisible()
      await expect(page.locator('.sheet.show .cat-grid')).toBeVisible()
    })

    test3('/cercle?section=notes&item=<id> redirects to /notes?item=<id> and focuses the note', async ({ page, app }) => {
      const NOTE = {
        id: 'nr1',
        member_id: null,
        author_member_id: null,
        title: 'Recommandation',
        text: 'Plombier de mamie',
        media_kind: null,
        media_key: null,
        scene_key: null,
        created_at: BASE,
        updated_at: BASE,
      }
      await app.boot({ state: { calm: true } })
      await page.route('**/api/family-notes**', async (route) => {
        if (route.request().method() !== 'GET') return route.fallback()
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ notes: [NOTE] }) })
      })
      await page.goto('/cercle?section=notes&item=nr1')
      await expect(page).toHaveURL(/\/notes/)
      await expect(page).not.toHaveURL(/section=notes/) // the stray `view`/`section` params are dropped
      await expect(page).not.toHaveURL(/item=/) // consumed by Notes.tsx's own one-shot door
      await expect(page.locator('.cnote.is-focus')).toBeVisible()
    })

    test3('/cercle?add=business&import=<url> redirects to /maison with the business form open, import pre-filled', async ({ page, app }) => {
      const MAPS_URL = 'https://maps.app.goo.gl/hCpMvxRRDUhwLCPi9?g_st=ic'
      await app.boot({ state: { calm: true } })
      await page.route('**/api/place-import**', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ name: 'Garage Roy', address: '1 rue Principale', category: 'Garage', photoKey: null, lat: null, lng: null, mapUrl: MAPS_URL, empty: false }),
        })
      })
      const importReq = page.waitForRequest((r) => r.url().includes('/api/place-import') && r.method() === 'POST')
      await page.goto(`/cercle?add=business&import=${encodeURIComponent(MAPS_URL)}`)
      await expect(page).toHaveURL(/\/maison/)
      await expect(page).not.toHaveURL(/add=|import=/) // stripped by Maison's own one-shot door
      await importReq
      const form = page.locator('.kit-modal .operator__inline-form')
      await expect(form).toBeVisible()
      await expect(form.getByRole('textbox', { name: 'Nom' })).toHaveValue('Garage Roy')
    })

    test3('bare /cercle redirects to /maison?section=family (the old cercle default)', async ({ page, app }) => {
      await app.boot({ state: { calm: true } })
      await page.goto('/cercle')
      await expect(page).toHaveURL(/\/maison\?section=family$/)
      // Scoped to the section pill row (data-tour="maison-sections") — Famille also
      // renders its own Liste/Liens/Arbre view switch, a second `.subtabs__opt` row.
      await expect(page.locator('[data-tour="maison-sections"] .subtabs__opt[aria-selected="true"]')).toHaveText(/Famille/)
    })

    test3('/kid redirects to /maison, landing a toddler on the routine picture-story picker', async ({ page, app }) => {
      await app.boot({ state: { calm: true, audience: 'toddler' } })
      await page.goto('/kid')
      await expect(page).toHaveURL(/\/maison$/)
      await expect(page.locator('.kid__faces')).toBeVisible()
    })
  })

  test3.describe('toddler lens split (Maison vs Les notes)', () => {
    test3('toddler /notes is the hear-first read-only list — no composer, no « Nouvelle note »', async ({ page, app }) => {
      const NOTE = {
        id: 'nk1',
        member_id: null,
        author_member_id: null,
        title: 'Liste d’épicerie de mamie',
        text: 'Pain, lait, oeufs',
        media_kind: null,
        media_key: null,
        scene_key: null,
        created_at: BASE,
        updated_at: BASE,
      }
      await app.boot({ state: { calm: true, audience: 'toddler' } })
      await page.route('**/api/family-notes**', async (route) => {
        if (route.request().method() !== 'GET') return route.fallback()
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ notes: [NOTE] }) })
      })
      await page.goto('/notes')
      await expect(page.locator('.cercle-kid__grid')).toBeVisible()
      await expect(page.getByText('Liste d’épicerie de mamie')).toBeVisible()
      await expect(page.locator('.note-editor')).toHaveCount(0)
      await expect(page.getByRole('button', { name: 'Nouvelle note' })).toHaveCount(0)
      await expect(page.locator('.add-fab')).toHaveCount(0) // toddler lens never gets the ＋
    })

    test3('toddler /maison (default section) is the kid routine picture-story view', async ({ page, app }) => {
      await app.boot({ state: { calm: true, audience: 'toddler' } })
      await page.goto('/maison')
      await expect(page.locator('.kid__faces')).toBeVisible()
      await expect(page.locator('.cercle-kid__grid')).toHaveCount(0)
    })

    test3('toddler /maison?section=family is the circle kid faces grid', async ({ page, app }) => {
      await app.boot({ state: { calm: true, audience: 'toddler' } })
      await page.goto('/maison?section=family')
      await expect(page.locator('.cercle-kid__grid')).toBeVisible()
      await expect(page.locator('.kid__faces')).toHaveCount(0)
    })
  })

  test3('the ＋ on /notes opens a blank note directly — no sheet, no chooser', async ({ page, app }) => {
    // /notes carries a single add-mode ('cnote'), but it's in FORM_ROUTES (2026-09-04:
    // iOS-Notes style) — so a tap NAVIGATES to /notes?add=1 and opens the full-screen
    // NoteEditor, never the sheet. Holding the ＋ still opens the quick voice/text/📎
    // composer (VOICE_MODES, see journey-capture.spec.ts) — that door didn't move.
    await app.boot({ state: { calm: true } })
    await page.goto('/notes')
    await page.locator('.add-fab').click()
    await expect(page.locator('.sheet.show')).toHaveCount(0)
    const editor = page.locator('.note-editor')
    await expect(editor).toBeVisible()
    await expect(editor.locator('.note-editor__title')).toHaveCount(0) // no title field, ever
    await expect(editor.locator('.note-editor__toggle')).toHaveCount(0) // no BETA chip, ever

    // Closing (back arrow) auto-saves what was typed — no Cancel, iOS-Notes style.
    await editor.locator('.note-tiptap').click()
    await page.keyboard.type('Rapport de la piscine')
    const [req] = await Promise.all([
      page.waitForRequest((r) => r.url().includes('/api/family-notes') && r.method() === 'POST'),
      page.locator('.note-editor__back').click(),
    ])
    const posted = JSON.parse(req.postData() || '{}')
    expect(posted.text).toBe('Rapport de la piscine')
    expect(posted.title).toBe('') // derived from the first line, never stored
    await expect(page.locator('.note-editor')).toHaveCount(0)
  })

  test3('/notes?add=1 still opens the rich editor — every time, not just once', async ({ page, app }) => {
    // The rich-editor door survives as a URL (a stray deep-link out in the wild), and
    // it's what the ＋ FAB itself now navigates to on every tap.
    await app.boot({ state: { calm: true } })
    await page.goto('/notes?add=1')
    await expect(page.locator('.note-editor')).toBeVisible()
    await expect(page).not.toHaveURL(/add=/) // the one-shot door strips it once opened

    // The regression this guards: asking again while ALREADY on /notes is a same-route
    // navigation, so the page never remounts. The door used to be read once at mount
    // (a lazy `useState` initializer), which made it work on a fresh arrival and then
    // go silently dead for the rest of the session. It's a bumped nonce now.
    await page.locator('.note-editor__back').click()
    await expect(page.locator('.note-editor')).toHaveCount(0)
    await page.goto('/notes?add=1')
    await expect(page.locator('.note-editor')).toBeVisible()
  })
})


// ── folded from journey-navigation.spec.ts ──────────────────────────────────────────────
test4.describe('guide-deeplink', () => {
  // Landing a guide deep-link ON the thing it named.
  //
  // A "?" bubble's « Voir le guide » (and every ?card=/?point= link) is a promise: you
  // tapped a control on ONE screen and got moved to a manual on another. If the reader
  // arrives at the top of a long page, that promise is broken in the most confusing way
  // possible — they didn't choose to be here, and now they have to hunt.
  //
  // It WAS broken, in two compounding ways, which is why these assertions are about
  // geometry and not about the URL (the old spec only checked the URL and passed
  // happily while the page sat at scrollTop 0):
  //   1. Two scrolls raced. GuideCard scrolled the point, GuideSection scrolled the
  //      card, and React runs the child's effect FIRST — so the card always won and
  //      the point was left below the fold.
  //   2. Both were dropped anyway. The wiring consumes its own ?card=/?point= with a
  //      `replace` navigation right after; the re-render killed the smooth scroll
  //      mid-glide and the reader stayed at the top.
  // One owner scrolls one node, once the layout has settled (lib/motion
  // `scrollIntoViewSettled`), and verifies it actually landed.

  const PHONE = { width: 390, height: 844 }

  /** Where the deep-link's highlighted target ended up, once everything settled. */
  async function landing(page: Page) {
    await page.locator('.guide__card').first().waitFor({ state: 'visible', timeout: 15_000 })
    // The settle wait + smooth glide + the one verification pass: the target arrives on
    // screen, then the page goes quiet, and only then is it read.
    await expect.poll(() => measureTarget(page).then((l) => l?.onScreen ?? false), { timeout: 10_000 }).toBe(true)
    await settled(page)
    return measureTarget(page)
  }

  async function measureTarget(page: Page) {
    return await page.evaluate(() => {
      const pt = document.querySelector('.guide__point.is-target') as HTMLElement | null
      const card = document.querySelector('.guide__card.is-target') as HTMLElement | null
      const el = pt ?? card
      if (!el) return null
      const r = el.getBoundingClientRect()
      return {
        kind: pt ? 'point' : 'card',
        top: Math.round(r.top),
        // Fully inside the viewport, not clipped off the top edge.
        onScreen: r.top >= 0 && r.top < window.innerHeight,
        open: el instanceof HTMLDetailsElement ? el.open : null,
      }
    })
  }

  test4('a ?point deep-link lands ON the point, opened — not at the top of the page', async ({ page, app }) => {
    await app.boot({ viewport: PHONE, route: '/settings?tab=guide&card=liste&point=9', wait: '.hub' })
    const l = await landing(page)
    expect(l).not.toBeNull()
    expect(l!.kind).toBe('point')
    expect(l!.open).toBe(true)
    expect(l!.onScreen).toBe(true)
  })

  test4('a card-only deep-link lands on the card, with air above it', async ({ page, app }) => {
    await app.boot({ viewport: PHONE, route: '/settings?tab=guide&card=habits', wait: '.hub' })
    const l = await landing(page)
    expect(l!.kind).toBe('card')
    expect(l!.onScreen).toBe(true)
    // scroll-margin keeps the accent ring off the very edge — `block: 'start'` alone
    // parked the border box at 0 and clipped it.
    expect(l!.top).toBeGreaterThan(0)
  })

  test4('a RETIRED card id still lands on its host point (GUIDE_CARD_ALIAS)', async ({ page, app }) => {
    // `drawings` was merged into `mots`; the alias carries a point offset, so a
    // bookmarked link must land on the sub-point, not merely the host card.
    await app.boot({ viewport: PHONE, route: '/settings?tab=guide&card=drawings', wait: '.hub' })
    const l = await landing(page)
    expect(l!.kind).toBe('point')
    expect(l!.onScreen).toBe(true)
  })

  test4('reduced motion still lands (no animation, same destination)', async ({ page, app }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await app.boot({ viewport: PHONE, route: '/settings?tab=guide&card=liste&point=9', wait: '.hub' })
    const l = await landing(page)
    expect(l!.kind).toBe('point')
    expect(l!.onScreen).toBe(true)
  })

  test4('the real flow: a "?" bubble on La liste carries the reader to the right line', async ({ page, app }) => {
    await app.boot({ viewport: PHONE, route: '/liste', wait: '.hub' })
    // Arm help mode, then tap the ⚙ — the SIMPLE ↔ AVANCÉ chip.
    const toggle = page.locator('.help-toggle').first()
    await expect(toggle).toBeVisible()
    await toggle.click()
    await page.locator('.mode-toggle').click()
    const bubble = page.locator('.help-bubble').first()
    await expect(bubble).toBeVisible()
    // « Voir le guide » opens the card over the screen (review #20); its foot link deep-links as before.
    await bubble.locator('.help-bubble__guide').click()
    await page.locator('.guide-sheet .guide-sheet__more').click()

    const l = await landing(page)
    expect(l!.kind).toBe('point')
    expect(l!.onScreen).toBe(true)
    // …and it's the point the ⚙ actually named, not just any highlighted line.
    await expect(page.locator('.guide__point.is-target')).toContainText(/Simple ou avanc/i)
  })
})


// ── folded from journey-navigation.spec.ts ──────────────────────────────────────────────
test5.describe('door-landing', () => {
  // A DOOR LANDS ON ITS TARGET.
  //
  // Reported from the phone about « Note du jour » in the calendar's ⋯ menu: it opened
  // the day scene and stopped. The note composer was right there, closed — so asking for
  // the note cost a second tap to go find it. « Quand on fait une action, ça devrait
  // popup non seulement l'écran, mais aussi focus sur la bonne chose. »
  //
  // The rule, and what this spec pins: a door that names a THING opens onto that thing
  // ready to act, not merely onto the page that contains it. The URL grammar is already
  // there and this only had to be USED — see DISCOVERY.md:
  //
  //   ?focus=<thing>  open this composer on the day scene (DayPlanPage; the same
  //                   one-shot, consumed-on-arrival shape as Réglages' own ?focus=)
  //   ?plus=<mode>    open the ＋ sheet on that tile (HubLayout)
  //   ?add=1          open the notes editor (pages/Notes)
  //
  // A door that names a PAGE (« Planifier aujourd'hui » → the day's plan) is not in
  // scope: the page IS the target there.

  const DAY = Math.floor(BASE / 86400) * 86400

  test5.describe('the day scene opens the composer you asked for', () => {
    test5('?focus=note opens the day note, seeded and ready', async ({ page, app }) => {
      await app.boot({ viewport: { width: 390, height: 844 } })
      await page.goto(`/kitchen/day/${DAY}?focus=note`)
      await expect(page.locator('.day-plan__note .edit-field')).toBeVisible({ timeout: 8000 })
      // One-shot: consumed on arrival, so a refresh or a back-nav doesn't reopen it.
      await expect(page).not.toHaveURL(/focus=/)
    })

    test5('?focus=meal opens the hero slot on the Repas face', async ({ page, app }) => {
      await app.boot({ viewport: { width: 390, height: 844 } })
      await page.goto(`/kitchen/day/${DAY}?vue=repas&focus=meal`)
      await expect(page.locator('.day-mng__sec .edit-field input.input').first()).toBeVisible({ timeout: 8000 })
      await expect(page).not.toHaveURL(/focus=/)
    })

    test5('an unknown ?focus= is ignored, not a crash or a stuck param', async ({ page, app }) => {
      await app.boot({ viewport: { width: 390, height: 844 } })
      await page.goto(`/kitchen/day/${DAY}?focus=zzz`)
      await expect(page.locator('.scene').first()).toBeVisible({ timeout: 8000 })
      await expect(page).not.toHaveURL(/focus=/)
    })
  })

  test5('« Note du jour » in the calendar ⋯ lands IN the note, not just on the page', async ({ page }) => {
    // The reported path, end to end.
    await page.setViewportSize({ width: 390, height: 844 })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await mockApi(page)
    // The Mois view is a stored board view, not a query param.
    await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', calm: true, surface: 'mobile', boardView: 'month' })
    await page.goto('/board')
    await page.locator('.monthv').waitFor({ state: 'visible', timeout: 15_000 })
    await page.getByRole('button', { name: 'Actions de la journée' }).click()
    await page.getByRole('menuitem', { name: 'Note du jour' }).click()
    await expect(page.locator('.day-plan__note .edit-field')).toBeVisible({ timeout: 8000 })
  })

  // An EMPTY card says « rien pour l'instant » — which is an invitation to add one, so
  // tapping it must open the add rather than dropping you on a page to hunt for it.
  // (lib/boardCards `emptyTo`.)
  const emptyDoors: [string, string, string][] = [
    ['les notes', '/notes?add=1', '.note-editor'],
    ['les routines', '/maison?plus=routine', '.sheet.show, .scene'],
    ['« Restants »', '/kitchen?plus=leftovers', '.sheet.show, .scene'],
    ['les mots du frigo', '/board?plus=note', '.sheet.show'],
  ]
  for (const [what, url, sel] of emptyDoors) {
    test5(`an empty ${what} card taps straight into its add (${url})`, async ({ page, app }) => {
      await app.boot({ viewport: { width: 390, height: 844 } })
      await page.goto(url)
      await expect(page.locator(sel).first()).toBeVisible({ timeout: 8000 })
    })
  }

  // ── A meal with no recipe can still be prepared ─────────────────────────────────
  // Reported from the phone: "in Aujourd'hui, meals without recipes don't pop off to
  // prepare." A free-text meal has no cook mode, so the card's row reads « Choisir une
  // recette » — and that door used to land on the KITCHEN'S FRONT PAGE, leaving you to
  // find the meal again. It lands on that meal's own composer now.
  // (The peek's matching door is unit-tested in components/detail/adapters.test.ts.)
  test5('?focus=meal:<slot> opens THAT slot’s composer, not the headline one', async ({ page, app }) => {
    await app.boot({ viewport: { width: 390, height: 844 } })
    await page.goto(`/kitchen/day/${DAY}?vue=repas&focus=meal:snack`)
    await page.locator('.day-mng__sec').first().waitFor({ state: 'visible', timeout: 15_000 })
    const open = await page.locator('.day-mng__sec').evaluateAll((els) =>
      els
        .filter((e) => e.querySelector('.edit-field input.input'))
        .map((e) => (e as HTMLElement).dataset.dndZone),
    )
    expect(open, 'only the named slot opens').toEqual(['snack'])
    await expect(page).not.toHaveURL(/focus=/)
  })

  test5('a recipe-less meal on the board lands on its own composer, not the kitchen', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 1200 })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.clock.setFixedTime(new Date((MMID + 9 * 3600) * 1000))
    await mockApi(page, {
      overrides: {
        meals: {
          weekStart: MMID,
          windowDays: 10,
          recent: [],
          days: [{ id: 'x1', date: MMID, slot: 'snack', title: 'Muffins maison', cook_member_id: null, position: 0 }],
        },
      },
    })
    await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', calm: true, surface: 'mobile' })
    await page.goto('/board')
    await page.locator('.hub').waitFor({ state: 'visible' })

    const prep = page.locator('.wg-slot[data-card="today"] .act', { hasText: 'Choisir une recette' })
    await expect(prep, 'a free-text meal still offers to prepare it').toHaveCount(1)
    await expect(prep).toContainText('Muffins maison')
    await prep.click()
    await page.waitForURL(/\/kitchen\/day\/\d+/)
    // …with the collation's own field open (the focus param is consumed on arrival).
    await expect(page.locator('.day-mng__sec[data-dnd-zone="snack"] .edit-field input.input')).toBeVisible({ timeout: 8000 })
  })
})


// ── folded from journey-navigation.spec.ts ──────────────────────────────────────────────
test.describe('door-sweep', () => {
  // THE DOOR SWEEP — what a TAP (or a HOLD) does, per surface.
  //
  // The state matrix photographs 140-odd states and could not see either of the two
  // bugs a phone found on 2026-09-10: a meal tap on the day scene that renamed instead
  // of opening the recipe, and a snack that would not drag. Both were gestures. A
  // screenshot shows neither. This spec walks the doors PARITY.md lists as « ✅ tap »
  // / « ✅ hold » on the surfaces a household uses most, performs the gesture, and
  // asserts that SOMETHING observable happened — the URL moved, a sheet or scene
  // opened, a field took focus, a state flipped. Not the door's content (the feature
  // specs own that): only that the door still opens. A row whose tap does nothing is
  // exactly the regression that reads as "fine" in every screenshot.
  //
  // Adding a door: one row in DOORS — route, the gesture, the proof. Keep the proof
  // the cheapest observable fact; the feature spec goes deeper.

  const HOLD_MS = 900 // > the long-press arm time (lib/useLongPress), same idea as board-edit.spec

  interface Door {
    name: string
    route: string
    /** Freeze the clock at BASE (fixtures dated around MMID). */
    clock?: boolean
    ready: string // a selector that means "the surface rendered"
    /** Extra route stubs, registered AFTER mockApi so they win (a surface whose
     *  default fixture is empty needs one row to have a door). */
    fixture?: (page: Page) => Promise<void>
    act: (page: Page) => Promise<void>
    proof: (page: Page) => Promise<void>
  }

  // The shared mock serves no family notes; the notes door needs one row.
  const NOTE = {
    id: 'dn1',
    member_id: null,
    author_member_id: null,
    title: 'Couture',
    text: 'Ourlet du pantalon de Léa',
    media_kind: null,
    media_key: null,
    scene_key: null,
    position: 0,
    created_at: 1_700_000_000,
    updated_at: 1_700_000_000,
  }

  const hold = async (page: Page, sel: ReturnType<Page['locator']>) => {
    const b = await boxOf(sel) // never a bare boundingBox() (CLAUDE.md: it throws on a re-resolved node)
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2)
    await page.mouse.down()
    // The hold IS the gesture: a press lasts a duration, and no signal stands in for one.
    await page.waitForTimeout(HOLD_MS)
    await page.mouse.up()
  }

  const DOORS: Door[] = [
    {
      name: 'board · an event row → its peek',
      route: '/board',
      ready: '.board-grid .wg-slot',
      act: (p) => p.locator('.act', { hasText: 'Rendez-vous dentiste' }).first().click(),
      proof: (p) => expect(p.locator('.detail-sheet')).toBeVisible(),
    },
    {
      // Since the one task form (phase 4), a to-do opens its peek like every other task; « Modifier »
      // there opens /todo/:id. The inline rename is gone.
      name: 'board · a todo name → its peek',
      route: '/board',
      ready: '.board-grid .wg-slot',
      act: async (p) => {
        const todos = p.locator('.wg-slot[data-card="todos"]')
        await todos.scrollIntoViewIfNeeded()
        await todos.locator('.act', { hasText: 'Clés + téléphone + portefeuille' }).locator('.act__hit').click()
      },
      proof: (p) => expect(p.locator('.detail-sheet')).toBeVisible(),
    },
    {
      name: 'cuisine · the week grid meal → its recipe',
      route: '/kitchen',
      clock: true,
      ready: '.kitchen__day',
      act: (p) => p.locator('.kitchen__day.is-today').locator('.kitchen__day-meal', { hasText: 'Spaghetti maison' }).click(),
      proof: (p) => expect(p).toHaveURL(/\/kitchen\/recipe\/rc1$/),
    },
    {
      name: 'cuisine · the day scene meal → its recipe (the 2026-09-10 phone bug)',
      route: `/kitchen/day/${MMID}?vue=repas`,
      clock: true,
      ready: '.kitchen__meal-row',
      act: (p) => p.locator('.kitchen__meal-row', { hasText: 'Spaghetti maison' }).locator('.kitchen__meal-main').click(),
      proof: (p) => expect(p).toHaveURL(/\/kitchen\/recipe\/rc1$/),
    },
    {
      name: 'liste · a plain row picture → the item scene',
      route: '/liste',
      ready: '.list-row',
      act: (p) => p.locator('.list-row', { hasText: 'Pain' }).locator('button.list-row__img').click(),
      proof: (p) => expect(p.locator('.scene .li-edit')).toBeVisible(),
    },
    {
      name: 'liste · the row centre → checked (a toggle, in place)',
      route: '/liste',
      ready: '.list-row',
      act: (p) => p.locator('.list-row', { hasText: 'Lait' }).first().locator('.list-row__name').click(),
      proof: (p) => expect(p.locator('.list-row', { hasText: 'Lait' }).first().locator('.list-row__name')).toHaveAttribute('aria-pressed', 'true'),
    },
    {
      name: 'liste · HOLD a row → its peek',
      route: '/liste',
      ready: '.list-row',
      act: (p) => hold(p, p.locator('.list-row', { hasText: 'Pommes' }).first().locator('.list-row__name')),
      proof: (p) => expect(p.locator('.detail-sheet')).toBeVisible(),
    },
    {
      name: 'notes · a note row → the editor',
      route: '/notes',
      ready: '.cnote-list .cnote',
      fixture: async (p) => {
        await p.route('**/api/family-notes**', async (route) => {
          if (route.request().method() !== 'GET') return route.fallback()
          await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ notes: [NOTE] }) })
        })
      },
      act: (p) => p.locator('.cnote-list .cnote', { hasText: 'Couture' }).locator('.cnote__main').click(),
      proof: (p) => expect(p.locator('.note-editor')).toBeVisible(),
    },
    {
      name: 'caisse · a tile → the proof card',
      route: '/liste/cashier',
      ready: '.cashier__tile',
      act: (p) => p.locator('.cashier__tile').first().click(),
      proof: (p) => expect(p.locator('.bigcard')).toBeVisible(),
    },
  ]

  for (const door of DOORS) {
    test(door.name, async ({ page }) => {
      if (door.clock) await page.clock.setFixedTime(new Date(BASE * 1000))
      await page.emulateMedia({ reducedMotion: 'reduce' })
      await page.setViewportSize({ width: 390, height: 844 })
      await mockApi(page)
      if (door.fixture) await door.fixture(page)
      await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile' })
      await page.goto(door.route)
      await page.locator(door.ready).first().waitFor({ state: 'visible', timeout: 15_000 })
      await page.evaluate(() => (document as unknown as { fonts?: { ready?: Promise<unknown> } }).fonts?.ready).catch(() => {})
      await door.act(page)
      await door.proof(page)
    })
  }
})


// ── folded from journey-navigation.spec.ts ──────────────────────────────────────────────
test.describe('embedded-door', () => {
  // The public door as a portfolio shows it: framed (marcportal.com/projects embeds it
  // scaled down, ~1280×800) and read cold by a stranger. Three promises, each one a defect
  // found on production 2026-10-15:
  //   1. the door SHOWS the product (a real board frame), in the reader's language;
  //   2. a framed page knows it is framed (<html data-embedded>, set before first paint);
  //   3. a demo sandbox opens on the BOARD — no spotlight tour stacked over the welcome card
  //      over the board, and the welcome card is a strip, not a screen.
  // (The frame-ancestors header itself is pinned in securityHeaders.test.ts / headers.d1.)

  const WIDE = { width: 1280, height: 800 }

  test('the door shows the product, in the language it is read in', async ({ page }) => {
    await page.setViewportSize(WIDE)
    await mockApi(page)
    await page.route('**/api/auth/me', (route) => route.fulfill({ status: 401, contentType: 'application/json', body: '{}' }))
    await seedState(page, { theme: 'day', lang: 'fr', calm: true })
    await page.goto('/')
    const shot = page.locator('.home__shot img')
    await expect(shot).toBeVisible({ timeout: 15_000 })
    await expect(shot).toHaveAttribute('src', '/showcase/board-wide-fr.webp')
    await expect(shot).toHaveAttribute('alt', /babillard/i)
    // The picture sits beside the words on a wide screen: the CTA and the picture share the
    // first screen (that is the whole point of a 1280×800 preview).
    const cta = await page.getByRole('link', { name: 'Créer ma maisonnée' }).boundingBox()
    const img = await shot.boundingBox()
    expect(cta && img && cta.y + cta.height < WIDE.height && img.y < WIDE.height / 2).toBe(true)
  })

  test('the picture follows the language (EN door → EN board)', async ({ page }) => {
    await page.setViewportSize(WIDE)
    await mockApi(page)
    await page.route('**/api/auth/me', (route) => route.fulfill({ status: 401, contentType: 'application/json', body: '{}' }))
    await seedState(page, { theme: 'day', lang: 'en', calm: true })
    await page.goto('/')
    await expect(page.locator('.home__shot img')).toHaveAttribute('src', '/showcase/board-wide-en.webp', { timeout: 15_000 })
  })

  test('a framed door knows it is framed; a top-level one does not', async ({ page }) => {
    await page.setViewportSize(WIDE)
    await mockApi(page)
    await page.route('**/api/auth/me', (route) => route.fulfill({ status: 401, contentType: 'application/json', body: '{}' }))
    await seedState(page, { theme: 'day', lang: 'fr', calm: true })
    await page.goto('/')
    await expect(page.locator('.home')).toBeVisible({ timeout: 15_000 })
    await expect(page.locator('html')).not.toHaveAttribute('data-embedded', /.*/)

    // Same origin, so the mocks and the seeded state reach the frame; `window.self !==
    // window.top` is what the app tests, and that holds for any frame.
    await page.evaluate(() => {
      const f = document.createElement('iframe')
      f.id = 'portfolio'
      f.src = '/'
      f.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;border:0;background:#fff'
      document.body.append(f)
    })
    const framed = page.frameLocator('#portfolio')
    await expect(framed.locator('.home')).toBeVisible({ timeout: 15_000 })
    await expect(framed.locator('html')).toHaveAttribute('data-embedded', '')
  })

  test('a sandbox opens on the board: no tour, and the welcome card is a strip', async ({ page }) => {
    await page.setViewportSize(WIDE)
    await mockApi(page, { sandbox: true })
    // `tour: true` leaves the tour UNSEEN — the state a brand-new browser is in.
    await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'kiosk', tour: true })
    await page.goto('/board')
    const card = page.locator('.welcome-card')
    await expect(card).toBeVisible({ timeout: 15_000 })
    await page.waitForTimeout(1500) // the auto-launch would have fired by now
    await expect(page.locator('.tour')).toHaveCount(0)

    // A strip: the try-this chips are links, the claim offer is still there once, and the
    // whole card stays under half of a 800px-tall first screen (it was ~560px with the five rows + the feature map).
    await expect(card.getByRole('link', { name: 'Ouvre une recette, pars le mode cuisson' })).toBeVisible()
    await expect(card.getByRole('link', { name: /garder ma maisonnée/i })).toHaveCount(1)
    await expect(card.locator('.feature-map')).toHaveCount(0)
    const box = await card.boundingBox()
    expect(box!.height).toBeLessThan(WIDE.height * 0.5)
    // …and the tour is still one tap away.
    await card.getByRole('button', { name: /visite guidée/i }).click()
    await expect(page.locator('.tour')).toBeVisible()
  })
})


// ── folded from journey-navigation.spec.ts ──────────────────────────────────────────────
test.describe('stale-link', () => {
  // A deep link that no longer points at anything (bmad/12 #26).
  //
  // These scenes always redirected when the thing was gone — silently. From the
  // user's side that reads as a broken tap: you follow a link a family member
  // texted and land on La cuisine with no explanation. Now the toast bar says the
  // ordinary cause.
  test.describe('stale deep links', () => {
    test.beforeEach(async ({ page }) => {
      await page.emulateMedia({ reducedMotion: 'reduce' })
      await mockApi(page)
      await seedState(page, { surface: 'mobile' })
    })

    for (const [name, path] of [
      ['a recipe view', '/kitchen/recipe/nope-does-not-exist'],
      ['cook mode', '/kitchen/recipe/nope-does-not-exist/cook'],
    ] as const) {
      test(`${name} for a deleted recipe lands on La cuisine AND says why`, async ({ page }) => {
        await page.goto(path)
        await expect(page).toHaveURL(/\/kitchen$/)
        await expect(page.locator('.undo-toast')).toContainText(/n’existe plus|is gone/)
      })
    }

    test('the notice has nothing to undo', async ({ page }) => {
      // It's the 'notice' kind: the same bar, but no « Annuler » — there is no
      // action to take back, only an explanation.
      await page.goto('/kitchen/recipe/nope-does-not-exist')
      await expect(page.locator('.undo-toast')).toBeVisible()
      await expect(page.locator('.undo-toast__btn')).toHaveCount(0)
    })
  })
})


// ── folded from journey-navigation.spec.ts ──────────────────────────────────────────────
test.describe('search', () => {
  // #30 — global search (/search). The pure fold() matcher is unit-tested elsewhere; this
  // proves the SCENE end-to-end: a typed query surfaces rows across sections, the newly
  // indexed sections (care-log / home-pins / drawings — §808) appear, and a business /
  // family-note hit DEEP-LINKS to the item, not just the section list (§892).
  test.use({ hasTouch: true })

  // A home carnet + one service-history entry + one « en cas de pépin » pin + one business
  // + one family note, injected as route overrides so the global mock baselines (which keep
  // these empty on purpose, for calm board/screenshot defaults) stay untouched.
  const CARNET = { id: 'k1', parentId: null, kind: 'home', name: 'Maison', mediaKey: null, color: '#88a36f', facts: null, installedAt: null, lifespanMonths: null, linkId: null, notes: null, sort: 0 }
  const CARE = { id: 'cl1', carnetId: 'k1', at: BASE, kind: 'install', title: 'Chauffe-eau installé', note: 'Facture Plomberie Untel', costCents: 120000, businessId: null, mediaKeys: [] }
  const PIN = { id: 'hp1', carnetId: 'k1', kind: 'where', label: 'Valve d’eau principale', detail: 'sous l’évier de la cuisine', mediaKey: null, sort: 0 }
  const BIZ = { id: 'b1', name: 'Clinique Vétérinaire du Coin', category: 'Vétérinaire', phone: '450-555-0100', email: null, address: null, website: null, notes: null, photoKey: null, colour: '#5891AC' }
  const NOTE = { id: 'n1', member_id: null, author_member_id: 'm1', title: 'Recette de tourtière', text: 'Pâte brisée, porc haché, épices du Lac', media_kind: null, media_key: null, scene_key: null, created_at: BASE, updated_at: BASE }

  async function overrideJson(page: import('@playwright/test').Page, path: string, body: unknown) {
    await page.route(`**/api/${path}**`, async (route) => {
      if (route.request().method() !== 'GET') return route.fallback()
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
    })
  }

  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 800, height: 1280 })
    await mockApi(page)
    await overrideJson(page, 'carnets', { carnets: [CARNET], soon: [] })
    await overrideJson(page, 'care-log', { entries: [CARE] })
    await overrideJson(page, 'home-pins', { pins: [PIN] })
    await overrideJson(page, 'businesses', { businesses: [BIZ] })
    await overrideJson(page, 'family-notes', { notes: [NOTE] })
    await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile' })
  })

  test('a query surfaces rows across sections, including the drawings gallery', async ({ page }) => {
    await page.goto('/search')
    await page.locator('.search__input .searchfield__input').fill('Léa')

    // An event (« Fête de Léa », from the board fixture) AND a drawing (dg1, drawn by Léa —
    // matched on its AUTHOR since a drawing carries no text) both surface.
    await expect(page.getByRole('heading', { name: 'Rendez-vous' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Mes dessins' })).toBeVisible()
    // The drawing hit links to the gallery.
    await expect(page.locator('.search__row[href^="/drawings"]').first()).toBeVisible()
  })

  test('the newly indexed carnet sections (care-log + home-pins) surface and link to the carnet', async ({ page }) => {
    await page.goto('/search')

    // « En cas de pépin » pin — matched on its label, links to the carnet's « Le carnet » tab.
    await page.locator('.search__input .searchfield__input').fill('valve')
    await expect(page.getByRole('heading', { name: 'Repères de la maison' })).toBeVisible()
    await expect(page.locator('.search__row[href="/cercle/carnet/k1?seg=carnet"]').first()).toBeVisible()

    // Service-history entry — matched on its free-text note.
    await page.locator('.search__input .searchfield__input').fill('plomberie')
    await expect(page.getByRole('heading', { name: 'Historique d’entretien' })).toBeVisible()
    await expect(page.getByText('Chauffe-eau installé')).toBeVisible()
  })

  test('a business hit deep-links to the item (opens its peek), not just the section', async ({ page }) => {
    await page.goto('/search')
    await page.locator('.search__input .searchfield__input').fill('vété')

    const hit = page.locator('.search__row[href="/maison?section=business&item=b1"]')
    await expect(hit).toBeVisible()
    await hit.click()

    // Landed on the Business tab with the item consumed (?item stripped from the URL) …
    await expect(page).toHaveURL(/section=business/)
    await expect(page).not.toHaveURL(/item=/)
    // … and the business is surfaced (its peek/row), with the one-time focus highlight.
    await expect(page.getByText('Clinique Vétérinaire du Coin').first()).toBeVisible()
    await expect(page.locator('.cercle-row.is-focus')).toBeVisible()
  })

  // Wave S (PARITY) — six kinds that were dark to Recherche now have a SEARCH_INDEX
  // entry + a section. Four (habit / free-text meal / free-text idea / group) match
  // baseline fixtures; mots + trips are empty by default, so seed one of each.
  const MOT = { id: 'mo1', member_id: null, author_member_id: 'm1', text: 'Réunion de famille dimanche', media_kind: null, media_key: null, scene_key: null, created_at: BASE, updated_at: BASE, opened_at: null, saved_at: null, surface_at: null, reply_to: null }
  const TRIP = { id: 'tr1', title: 'Voyage en Gaspésie', destination: 'Percé', notes: 'Apporter les bottes', start_at: BASE, end_at: BASE, members: [], colour: '#2a8f85', media_kind: null, media_key: null, position: 0, created_at: BASE, updated_at: BASE }

  test('Wave S — the six newly-indexed kinds each surface a section (habit/mot/meal/idea/group/trip)', async ({ page }) => {
    await overrideJson(page, 'notes', notesFromMots([MOT])) // mots are fridge notes (0142)
    await overrideJson(page, 'trips', { trips: [TRIP] })
    await page.goto('/search')

    // A habit — matched on its title, links to the daily check-in scene.
    await page.locator('.search__input .searchfield__input').fill('Marcher dehors')
    await expect(page.getByRole('heading', { name: 'Mes habitudes' })).toBeVisible()
    await expect(page.locator('.search__row[href^="/board/habitudes"]').first()).toBeVisible()

    // A « mot » — no name, matched on its body text (secondary), links to the board.
    await page.locator('.search__input .searchfield__input').fill('Réunion de famille')
    await expect(page.getByRole('heading', { name: 'Les mots' })).toBeVisible()

    // A FREE-TEXT supper — « Salade César » (no recipe_id). The recipe-linked
    // « Spaghetti maison » deliberately does NOT show here (it's a recipe hit).
    await page.locator('.search__input .searchfield__input').fill('Salade César')
    await expect(page.getByRole('heading', { name: 'Plan des repas' })).toBeVisible()

    // A free-text meal idea.
    await page.locator('.search__input .searchfield__input').fill('Soupe poulet')
    await expect(page.getByRole('heading', { name: 'Idées de repas' })).toBeVisible()

    // A named group — « Le hockey » (friends kind → Maison's social list).
    await page.locator('.search__input .searchfield__input').fill('hockey')
    await expect(page.getByRole('heading', { name: 'Les groupes' })).toBeVisible()
    await expect(page.locator('.search__row[href="/maison?section=social"]').first()).toBeVisible()

    // A trip — matched on its title, links to the trip notebook /voyage/:id.
    await page.locator('.search__input .searchfield__input').fill('Gaspésie')
    await expect(page.getByRole('heading', { name: 'Voyages' })).toBeVisible()
    await expect(page.locator('.search__row[href="/voyage/tr1"]').first()).toBeVisible()
  })

  test('a family-note hit deep-links to the note and pulses its row', async ({ page }) => {
    // « Les notes » is its own hub tab now (split out of Le cercle) — the hit links
    // straight to /notes?item=<id>.
    await page.goto('/search')
    await page.locator('.search__input .searchfield__input').fill('tourtière')

    const hit = page.locator('.search__row[href="/notes?item=n1"]')
    await expect(hit).toBeVisible()
    await hit.click()

    await expect(page).toHaveURL(/\/notes/)
    await expect(page).not.toHaveURL(/item=/)
    // Highlighted on arrival, scrolled into view — but NOT auto-opened: the row
    // doesn't expand in place any more (2026-09-04, `openOnTap`), and a search hit
    // landing you straight in the full-screen editor unasked would be a surprise.
    await expect(page.locator('.cnote.is-focus')).toBeVisible()
    await expect(page.locator('.cnote.cnote--expanded')).toHaveCount(0)
    await expect(page.locator('.note-editor')).toHaveCount(0)
    await expect(page.getByText('Recette de tourtière')).toBeVisible()
  })
})


// ── folded from journey-navigation.spec.ts ──────────────────────────────────────────────
test10.describe('search-landing', () => {
  // ?item=<id> lands ON the row (solidify 4.2): the container scrolls it into view, marks
  // it for a moment, and strips the param so a reload does not replay it. Before this,
  // only Maison and Notes read ?item; a hit on a habit or a drawing opened the page and
  // left you to find the thing.
  test10('a habit hit lands on its row and the param is consumed', async ({ page, app }) => {
    await app.boot({ route: '/board/habitudes?item=hb1', clock: 'BASE', wait: '.habitudes__item' })
    await expect(page.locator('[data-item="hb1"]')).toHaveClass(/is-item-target/)
    await expect(page).not.toHaveURL(/item=/)
  })

  test10('a drawing hit lands on its tile', async ({ page, app }) => {
    await app.boot({ route: '/drawings', wait: '.drawgallery__item' })
    const id = await page.locator('.drawgallery__item').first().getAttribute('data-item')
    await page.goto(`/drawings?item=${id}`)
    await expect(page.locator(`[data-item="${id}"]`)).toHaveClass(/is-item-target/)
    await expect(page).not.toHaveURL(/item=/)
  })

  test10('an id that no longer exists just lands on the page, and the param still goes', async ({ page, app }) => {
    await app.boot({ route: '/board/habitudes?item=gone', clock: 'BASE', wait: '.habitudes__item' })
    await expect(page).not.toHaveURL(/item=/, { timeout: 8_000 })
    await expect(page.locator('.is-item-target')).toHaveCount(0)
  })

  test10('a search result carries the row id through to the page', async ({ page, app }) => {
    await app.boot({ route: '/search?q=Marcher', clock: 'BASE', wait: '.search__row' })
    await page.locator('.search__row[href="/board/habitudes?item=hb1"]').click()
    await expect(page.locator('[data-item="hb1"]')).toHaveClass(/is-item-target/)
  })

  test10('a task is findable, and lands on the Tâches view when it is not on today’s board', async ({ page, app }) => {
    // Search reads every task from /api/tasks (one list, 2026-11-08), whatever its table.
    const subjects = { carnets: [], contacts: [], pets: [], projects: [], trips: [] }
    await app.boot({
      route: '/search?q=Vaisselle',
      api: { overrides: { tasks: { tasks: [somedayTask({ source: 'task', id: 'ch1', title: 'Vaisselle' })], subjects, history: [] } } },
      wait: '.search__row',
    })
    await page.locator('.search__row', { hasText: 'Vaisselle' }).click()
    await expect(page).toHaveURL(/view=taches/)
  })
})


// ── folded from journey-navigation.spec.ts ──────────────────────────────────────────────
test11.describe('back-closes-overlay', () => {
  // THE BACK BUTTON CLOSES THE OVERLAY — not the page under it.
  //
  // Until 2026-11-05 (wave 0.5 of plans/2026-11-05-SOLIDIFY.md) no sheet, peek, ⋯ menu or
  // dialog held a history entry: on a phone, Android's back (hardware or gesture) and the
  // iOS edge swipe in the installed PWA left the whole tab while a sheet was open — the
  // one gesture every phone user reaches for first, and it threw away what they were
  // looking at. useModal's `history` option holds one same-URL entry per open overlay;
  // `page.goBack()` is that gesture.
  //
  // Each case: open → back → the overlay is gone, the URL did not move, the page is
  // still mounted. The last case stacks a confirm over the peek: back closes the
  // CONFIRM and leaves the peek open (one entry each).

  test11('the ＋ sheet', async ({ page, app }) => {
    await app.boot({ route: '/board', wait: '.hub' })
    await page.locator('.add-fab').click()
    const sheet = page.locator('.sheet.show')
    await expect(sheet).toBeVisible()
    await page.goBack()
    await expect(sheet).toHaveCount(0)
    await expect(page).toHaveURL(/\/board(\?|$)/)
    await expect(page.locator('.hub')).toBeVisible()
  })

  test11('the detail peek', async ({ page, app }) => {
    await app.boot({ route: '/board', wait: '.hub' })
    await page.locator('.act', { hasText: 'Rendez-vous dentiste' }).first().click()
    const peek = page.locator('.detail-sheet.show')
    await expect(peek).toBeVisible()
    await page.goBack()
    await expect(peek).toHaveCount(0)
    await expect(page).toHaveURL(/\/board(\?|$)/)
    await expect(page.locator('.hub')).toBeVisible()
  })

  test11('the ⋯ menu inside the peek — back closes the MENU, the peek stays', async ({ page, app }) => {
    await app.boot({ route: '/board', wait: '.hub' })
    await page.locator('.act', { hasText: 'Rendez-vous dentiste' }).first().click()
    const peek = page.locator('.detail-sheet.show')
    await expect(peek).toBeVisible()
    await peek.locator('.action-menu__btn').click()
    const menu = page.locator('.action-menu__panel')
    await expect(menu).toBeVisible()
    await page.goBack()
    await expect(menu).toHaveCount(0)
    await expect(peek).toBeVisible()
    await page.goBack()
    await expect(peek).toHaveCount(0)
    await expect(page).toHaveURL(/\/board(\?|$)/)
  })

  test11('a centred dialog (« Demander »)', async ({ page, app }) => {
    await app.boot({ route: '/kitchen', wait: '.hub' })
    await page.locator('.app-head__ask').click()
    const dialog = page.locator('.kit-modal')
    await expect(dialog).toBeVisible()
    await page.goBack()
    await expect(dialog).toHaveCount(0)
    await expect(page).toHaveURL(/\/kitchen(\?|$)/)
    await expect(page.locator('.hub')).toBeVisible()
  })

  test11('a confirm raised from the peek — back answers « non », nothing else moves', async ({ page, app }) => {
    // A peek ACTION closes the peek first, then runs (lib/detail.ts) — so by the time the
    // confirm is up the peek's entry is already gone and the confirm's took its place.
    // The sequencing in useModal is what makes that hand-over clean (the confirm's push
    // waits for the peek's pop to settle); a stacked pair is the ⋯ case above.
    await app.boot({ route: '/board', wait: '.hub' })
    await page.locator('.act', { hasText: 'Rendez-vous dentiste' }).first().click()
    const peek = page.locator('.detail-sheet.show')
    await expect(peek).toBeVisible()
    await peek.getByRole('button', { name: /Supprimer/ }).first().click()
    const confirm = page.locator('.confirm')
    await expect(confirm).toBeVisible()
    await expect(peek).toHaveCount(0)
    await page.goBack()
    await expect(confirm).toHaveCount(0)
    await expect(page).toHaveURL(/\/board(\?|$)/)
    await expect(page.locator('.hub')).toBeVisible()
    // « non » means no DELETE: the row is still there.
    await expect(page.locator('.act', { hasText: 'Rendez-vous dentiste' }).first()).toBeVisible()
  })

  test11('closing by ✕ leaves no dead entry: one back then goes where it always did', async ({ page, app }) => {
    await app.boot({ route: '/board', wait: '.hub' })
    await page.goto('/kitchen')
    await page.locator('.hub').waitFor({ state: 'visible' })
    await page.locator('.add-fab').click()
    const sheet = page.locator('.sheet.show')
    await expect(sheet).toBeVisible()
    await sheet.locator('.sheet__close').click()
    await expect(sheet).toHaveCount(0)
    await page.goBack()
    await expect(page).toHaveURL(/\/board(\?|$)/)
  })
})
