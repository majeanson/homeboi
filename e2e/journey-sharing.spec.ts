import { test, expect, type Route, type Page } from '@playwright/test'
import { mockApi, seedState, BASE } from './mocks'
import { test as test4 } from './fixtures'
import { openKitEntry } from './kit'

// JOURNEY — SHARING & GUESTS (review #43; was share-links.spec.ts + guest-scenes.spec.ts + guest-settings.spec.ts + share-doors.spec.ts + share-routed.spec.ts + share-business.spec.ts + partage-public.spec.ts + readonly-states.spec.ts).
//
// « Partager » (wave 2) — the SENDER flow: from a recipe view, « Partager » mints a real
// /partage link (POST /api/share {kind:'recipe'}) and the sheet shows the copyable URL +
// a scannable QR. The harness has no backend; the write returns a stub url, so we assert
// the REQUEST fired (path + body) and the minted link renders — the interactions-*.spec
// discipline. The public /partage page it points at is covered in journey-sharing.spec.ts.

test.describe('share-links', () => {
  const SHARE_URL = 'https://babillard.test/partage/shX'
  const json = (body: unknown) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })

  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.routeWebSocket(/\/api\/live/, () => {})
    await mockApi(page)
    await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile' })
    // Stub the share rail. POST → a minted link; GET (ledger) → one live share. Registered
    // AFTER mockApi's catch-all so it wins for /api/share (and NOT /api/share-public — the
    // recipe sender never calls that; the glob **/api/share** would match it, but this spec
    // stays on /api/share only).
    await page.route('**/api/share', (route: Route) =>
      route.fulfill(
        route.request().method() === 'POST'
          ? json({ id: 'shX', url: SHARE_URL, expiresAt: 0 })
          : json({ shares: [{ id: 'shX', kind: 'recipe', label: 'Spaghetti maison', createdAt: 0, expiresAt: null }] }),
      ),
    )
  })

  test('a recipe view « Partager » mints a /partage link: POST {kind,recipeId} → URL input + copy + QR', async ({ page }) => {
    await page.goto('/kitchen/recipe/rc1')

    // « Partager » (operator + non-toddler) lives in the header's ⋯ overflow; it
    // opens the sheet, which auto-mints the link on open (POST /api/share) —
    // assert the request shape + the URL.
    await page.locator('.action-menu__btn').click()
    const [req] = await Promise.all([
      page.waitForRequest((r) => r.method() === 'POST' && new URL(r.url()).pathname === '/api/share', { timeout: 20_000 }),
      page.getByRole('menuitem', { name: 'Partager' }).click(),
    ])
    expect(req.postDataJSON()).toMatchObject({ kind: 'recipe', recipeId: 'rc1' })

    // The minted link shows: the read-only input, the copy button, and the scannable QR.
    await expect(page.getByRole('textbox', { name: 'Copier le lien' })).toHaveValue(SHARE_URL)
    await expect(page.getByRole('button', { name: 'Copier le lien' })).toBeVisible()
    await expect(page.locator('.qrcode img')).toBeVisible()
  })

  // D-18 (bmad/10) « Le pont » — the guest-link mint form (Réglages ▸ Système ▸
  // « Partager un accès ») grows a durable (standing) option for EVERY guest kind: pick
  // « Durable — jusqu'à révocation » in the SAME duration <select> instead of a TTL.
  test.describe('guest link mint — durable (standing) links', () => {
    test.beforeEach(async ({ page }) => {
      // No links yet by default — ActiveLinksList hides itself until minted/overridden.
      await page.route('**/api/guest-links', (route) =>
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ links: [] }) }),
      )
    })

    test('the durable option exists for every kind, and switching kind resets off it', async ({ page }) => {
      await page.goto('/settings?tab=settings&sub=tablets&focus=guestLinks')
      const ttlSelect = page.getByLabel('Durée')
      await expect(ttlSelect).toBeVisible()
      await expect(ttlSelect.locator('option', { hasText: 'Durable' })).toHaveCount(1)

      // Pick it, then switch kind — chooseKind resets the duration to that kind's
      // sensible default, so a stray standing pick can't silently ride to another kind.
      await ttlSelect.selectOption({ label: 'Durable — jusqu’à révocation' })
      await expect(page.getByLabel('Pour qui ?')).toBeVisible()
      await page.getByLabel('Type d’accès').selectOption('welcome')
      await expect(page.getByLabel('Pour qui ?')).toHaveCount(0)
      await expect(ttlSelect.locator('option', { hasText: 'Durable' })).toHaveCount(1)
    })

    test('picking « Durable » requires a name, then mints standing:true + label, marked « N’expire pas »', async ({ page }) => {
      let mintBody: Record<string, unknown> | null = null
      await page.route('**/api/guest/start', (route) => {
        try {
          mintBody = JSON.parse(route.request().postData() || '{}')
        } catch {
          /* no body */
        }
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            guestToken: 'tok_e2e',
            guestId: 'g_e2e',
            kind: 'sitter',
            standing: true,
            label: 'Mamie',
            lang: null,
            ttlSeconds: 315360000,
            expiresAt: 9_999_999_999,
            targetKey: null,
          }),
        })
      })

      await page.goto('/settings?tab=settings&sub=tablets&focus=guestLinks')
      await page.getByLabel('Durée').selectOption({ label: 'Durable — jusqu’à révocation' })

      // Required name — Generate refuses (client-side, no request fires) without one.
      await page.getByRole('button', { name: 'Générer le lien' }).click()
      await expect(page.getByText('Un nom est requis pour un lien durable.')).toBeVisible()
      expect(mintBody).toBeNull()

      await page.getByLabel('Pour qui ?').fill('Mamie')
      await page.getByRole('button', { name: 'Générer le lien' }).click()
      await expect(page.getByRole('textbox', { name: 'Partager un accès (lecture seule)' })).toBeVisible()

      expect(mintBody).toMatchObject({ standing: true, label: 'Mamie', kind: 'sitter' })
      await expect(page.getByText('N’expire pas')).toBeVisible()
    })

    test('an active standing link is marked « N’expire pas », and revoking it asks to confirm first', async ({ page }) => {
      let revokes = 0
      await page.route('**/api/guest-links', (route) => {
        if (route.request().method() === 'POST') {
          revokes++
          return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) })
        }
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            links: [{ id: 'g1', kind: 'sitter', target_key: null, standing: 1, label: 'Mamie', created_at: 0, expires_at: 9_999_999_999 }],
          }),
        })
      })

      await page.goto('/settings?tab=settings&sub=tablets&focus=guestLinks')
      const row = page.locator('.operator__guest-links').filter({ hasText: 'Mamie' })
      await expect(row).toBeVisible()
      await expect(row.getByText('N’expire pas')).toBeVisible()

      // Cancel — no revoke fires; the row stays.
      await row.getByRole('button', { name: 'Révoquer' }).first().click()
      const dialog = page.locator('.confirm')
      await expect(dialog).toBeVisible()
      await dialog.getByRole('button', { name: 'Annuler' }).click()
      await expect(dialog).toBeHidden()
      expect(revokes).toBe(0)

      // Confirm — the POST fires.
      await row.getByRole('button', { name: 'Révoquer' }).first().click()
      await page.locator('.confirm').getByRole('button', { name: 'Révoquer', exact: true }).click()
      await expect.poll(() => revokes).toBeGreaterThan(0)
    })
  })

  // D-19 (bmad/10) « La carte de la gardienne se complète » — the sitter card's own
  // gap-detector (src/lib/handoffGaps.ts) drives a quiet, non-blocking notice at mint
  // time, plus the opt-in « Joindre un parent » target.
  test.describe('guest link mint — sitter card gaps + reach-parent (D-19)', () => {
    test.beforeEach(async ({ page }) => {
      // No links yet by default — ActiveLinksList hides itself until minted/overridden.
      await page.route('**/api/guest-links', (route) =>
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ links: [] }) }),
      )
    })

    test('an incomplete sitter card shows « Il manque » with per-gap deep links, and still mints', async ({ page }) => {
      // Phone-width overflow guard (CLAUDE.md « Horizontal overflow ») for the new
      // Cluster of gap chips + the reach-parent checkbox/picker row — the densest new
      // UI this item adds.
      await page.setViewportSize({ width: 360, height: 900 })
      await page.route('**/api/guest/window**', (route) =>
        route.fulfill(
          json({
            kind: 'sitter',
            householdName: 'Maison Tremblay',
            wifi: { ssid: 'BellFibe-1234', password: null },
            houseRules: null,
            binDay: null,
            today: { events: [], meals: [] },
            bedtimeRoutines: [],
            toKnow: [],
            emergency: [],
            pins: [],
            reachParent: null,
          }),
        ),
      )
      let mintBody: Record<string, unknown> | null = null
      await page.route('**/api/guest/start', (route) => {
        try {
          mintBody = JSON.parse(route.request().postData() || '{}')
        } catch {
          /* no body */
        }
        return route.fulfill(
          json({
            guestToken: 'tok_e2e',
            guestId: 'g_e2e',
            kind: 'sitter',
            standing: false,
            label: null,
            lang: null,
            ttlSeconds: 43200,
            expiresAt: 9_999_999_999,
            targetKey: null,
          }),
        )
      })

      // 'sitter' is the default kind — the notice should already be visible.
      await page.goto('/settings?tab=settings&sub=tablets&focus=guestLinks')
      await expect(page.getByText('Il manque :')).toBeVisible()
      // wifi.ssid is set above, so that gap is absent; the other four are present.
      await expect(page.getByRole('button', { name: 'Contacts d’urgence — Compléter' })).toBeVisible()
      await expect(page.getByRole('button', { name: 'Allergies / à savoir — Compléter' })).toBeVisible()
      await expect(page.getByRole('button', { name: 'Routines du soir — Compléter' })).toBeVisible()
      await expect(page.getByRole('button', { name: 'En cas de pépin — Compléter' })).toBeVisible()
      await expect(page.getByRole('button', { name: 'Wi-Fi — Compléter' })).toHaveCount(0)

      // No horizontal overflow at 360px — the gap Cluster is the densest new row.
      const overflow = await page.evaluate(() => {
        const doc = document.documentElement
        const body = document.querySelector('.hub__body')
        if (doc.scrollWidth > doc.clientWidth + 1) return 'doc-overflow'
        if (body && body.scrollWidth > body.clientWidth + 1) return 'body-overflow'
        return 'ok'
      })
      expect(overflow).toBe('ok')

      // The notice never blocks the mint itself.
      await page.getByRole('button', { name: 'Générer le lien' }).click()
      await expect(page.getByRole('textbox', { name: 'Partager un accès (lecture seule)' })).toBeVisible()
      expect(mintBody).toMatchObject({ kind: 'sitter' })
    })

    test('a per-gap link navigates to complete that section', async ({ page }) => {
      await page.route('**/api/guest/window**', (route) => route.fulfill(json({ kind: 'sitter', wifi: {} })))
      await page.goto('/settings?tab=settings&sub=tablets&focus=guestLinks')
      await expect(page.getByRole('button', { name: 'Contacts d’urgence — Compléter' })).toBeVisible()
      await page.getByRole('button', { name: 'Contacts d’urgence — Compléter' }).click()
      // Emergency contacts live under Maison's Famille section now (the nav restructure).
      await expect(page).toHaveURL(/\/maison\?section=family/)
    })

    test('a complete sitter card shows no gaps notice', async ({ page }) => {
      await page.route('**/api/guest/window**', (route) =>
        route.fulfill(
          json({
            kind: 'sitter',
            wifi: { ssid: 'BellFibe-1234' },
            emergency: [{ name: 'Mamie', phone: '450-555-0201' }],
            toKnow: [{ name: 'Léa', isChild: true, notes: 'Allergie' }],
            bedtimeRoutines: [{ id: 'r1', name: 'Coucher', who: null, cards: [] }],
            pins: [{ kind: 'shutoff', label: 'Eau', detail: null, mediaKey: null, home: 'Maison' }],
            today: { events: [], meals: [] },
            reachParent: null,
          }),
        ),
      )
      await page.goto('/settings?tab=settings&sub=tablets&focus=guestLinks')
      await expect(page.getByText('Il manque :')).toHaveCount(0)
    })

    test('« Joindre un parent » is off by default; checking it and picking a member sends targetKey', async ({ page }) => {
      await page.route('**/api/guest/window**', (route) => route.fulfill(json({ kind: 'sitter', wifi: {} })))
      let mintBody: Record<string, unknown> | null = null
      await page.route('**/api/guest/start', (route) => {
        try {
          mintBody = JSON.parse(route.request().postData() || '{}')
        } catch {
          /* no body */
        }
        return route.fulfill(
          json({
            guestToken: 'tok_e2e',
            guestId: 'g_e2e',
            kind: 'sitter',
            standing: false,
            label: null,
            lang: null,
            ttlSeconds: 43200,
            expiresAt: 9_999_999_999,
            targetKey: 'member:m1',
          }),
        )
      })

      await page.goto('/settings?tab=settings&sub=tablets&focus=guestLinks')
      const checkbox = page.getByRole('checkbox', { name: 'Joindre un parent' })
      const picker = page.getByRole('combobox', { name: 'Joindre un parent' })
      await expect(picker).toHaveCount(0) // the select isn't shown until checked

      // Unchecked mint — no targetKey at all.
      await page.getByRole('button', { name: 'Générer le lien' }).click()
      await expect(page.getByRole('textbox', { name: 'Partager un accès (lecture seule)' })).toBeVisible()
      expect(mintBody).not.toBeNull()
      expect((mintBody as unknown as Record<string, unknown>).targetKey).toBeUndefined()

      // Check it — the picker appears, listing household members with a phone on file.
      await checkbox.check()
      await expect(picker).toBeVisible()
      await picker.selectOption({ label: 'Maman' })

      mintBody = null
      await page.getByRole('button', { name: 'Générer le lien' }).click()
      await expect.poll(() => mintBody).toMatchObject({ kind: 'sitter', targetKey: 'member:m1' })
    })
  })
})

// ── folded from guest-scenes.spec.ts ──────────────────────────────────────────────
test.describe('guest-scenes', () => {
  // The typed share-link landings (#34/#35/#36 — /handoff, /welcome, /family) must show a
  // DISTINCT "this link is no longer valid" state when the guest token is expired/revoked
  // (guest/window → 401), not a blank empty-household card. Locks the GuestExpired branch
  // (REVIEW-PASS §security: guest scenes only read {data,isLoading}, never isError).

  const SCENES = ['/handoff', '/welcome', '/family']

  async function stubWindow(page: import('@playwright/test').Page, status: number, body: unknown) {
    await page.route('**/api/guest/window**', (route) =>
      route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) }),
    )
  }

  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 800, height: 1000 })
  })

  for (const path of SCENES) {
    test(`${path}: an expired/revoked link shows the expired state`, async ({ page }) => {
      await mockApi(page)
      await stubWindow(page, 401, { error: 'expiré' })
      await seedState(page, { theme: 'day', lang: 'fr' })
      await page.goto(path)
      await expect(page.locator('.guest-expired')).toBeVisible()
      await expect(page.locator('.guest-expired__title')).toBeVisible()
    })
  }

  test('/welcome: a valid link shows content, never the expired state', async ({ page }) => {
    await mockApi(page)
    await stubWindow(page, 200, {
      householdName: 'Maison Tremblay',
      wifi: { ssid: 'BellFibe-1234', password: 'secret' },
      houseRules: null,
      binDay: 'Mardi',
    })
    await seedState(page, { theme: 'day', lang: 'fr' })
    await page.goto('/welcome')
    await expect(page.getByText('BellFibe-1234')).toBeVisible()
    await expect(page.locator('.guest-expired')).toHaveCount(0)
  })

  // D-19 (bmad/10) « La carte de la gardienne se complète » — the opt-in « Joindre un
  // parent » target renders ATOP the Urgence section as a tel: line, and is absent
  // when the operator never turned it on (reachParent: null).
  test('/handoff: « Joindre un parent » shows a tel: line atop Urgence when set', async ({ page }) => {
    await mockApi(page)
    await stubWindow(page, 200, {
      kind: 'sitter',
      householdName: 'Maison Tremblay',
      wifi: { ssid: null, password: null },
      houseRules: null,
      binDay: null,
      today: { events: [], meals: [] },
      bedtimeRoutines: [],
      toKnow: [],
      emergency: [{ name: 'Mamie', phone: '450-555-0201' }],
      pins: [],
      reachParent: { name: 'Papa', phone: '514-555-0102' },
    })
    await seedState(page, { theme: 'day', lang: 'fr' })
    await page.goto('/handoff')
    await expect(page.getByText('Joindre un parent')).toBeVisible()
    const call = page.getByRole('link', { name: /514-555-0102/ })
    await expect(call).toBeVisible()
    await expect(call).toHaveAttribute('href', 'tel:514-555-0102')
  })

  test('/handoff: no « Joindre un parent » line when the operator left it off', async ({ page }) => {
    await mockApi(page)
    await stubWindow(page, 200, {
      kind: 'sitter',
      householdName: 'Maison Tremblay',
      wifi: { ssid: null, password: null },
      houseRules: null,
      binDay: null,
      today: { events: [], meals: [] },
      bedtimeRoutines: [],
      toKnow: [],
      emergency: [{ name: 'Mamie', phone: '450-555-0201' }],
      pins: [],
      reachParent: null,
    })
    await seedState(page, { theme: 'day', lang: 'fr' })
    await page.goto('/handoff')
    await expect(page.getByText('Mamie')).toBeVisible() // the card did load
    await expect(page.getByText('Joindre un parent')).toHaveCount(0)
  })
})


// ── folded from guest-settings.spec.ts ──────────────────────────────────────────────
test.describe('guest-settings', () => {
  // A read-only LINK guest — which is exactly what the public demo is (functions/api/demo.ts
  // mints a `showcase` guest token) — reaches Réglages, and Réglages narrows itself for them.
  //
  // Réglages used to be barred outright for a link guest. That also took the in-app guide,
  // the language switch, the audience lens and « Disposition du babillard » with it — none of
  // which touch the household, and all of which are the reason to look at the app at all. The
  // rule now: `isGuest()` guards HOUSEHOLD WRITES; device-local prefs (localStorage) are
  // free. This spec pins both halves — what opened up, and what must stay shut.
  //
  // See GUEST_SUBS in pages/Operator.tsx and the note on isGuest() in lib/device.

  const PHONE = { width: 390, height: 844 }

  // FR labels (t.operator.*): the themed tabs, then the sub pills.
  const DISCOVER_TAB = 'Découvrir'
  const BOARD_TAB = 'Le babillard'
  // « Le cercle » and « Routines » merged into ONE « Maison » themed tab (the nav
  // restructure) — GUEST_SUBS has no 'maison' entry, so a guest still sees no
  // Régler pills there at all, same as the old cercle tab.
  const MAISON_TAB = 'Maison'
  const SYSTEM_TAB = 'Système'

  const LAYOUT_SUB = 'Disposition du babillard'
  // 28 → 14 (2026-09-08): the pills a guest sees are the MERGED ones. A pill shows
  // for a guest iff one of its stacked sections is device-local (lib/settingsNav
  // `access`), and only those sections render inside it — so « Affichage & veille »
  // appears (theme/lens/idle/calm are theirs) with « Photos de la maison » cut out,
  // and « Voix & IA » appears for its voice half with the household's AI switch gone.
  const DISPLAY_SUB = 'Affichage & veille'
  const VOICE_AI_SUB = 'Voix & IA'
  const EVENTS_SUB = 'Agenda & semaine'
  const TABLETS_SUB = 'Appareils & accès'

  async function bootGuestSettings(page: Page, tab = 'decouvrir') {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.setViewportSize(PHONE)
    await mockApi(page, { signedIn: false })
    // The link guest's whole identity. `whoami` resolves the share-mode; `showcase` is the
    // one kind that stays in the hub (sitter/welcome/family bounce to their own scenes).
    await page.route('**/api/guest/whoami**', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ kind: 'showcase' }) }),
    )
    await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile' })
    await page.addInitScript(() => localStorage.setItem('babillard-guest-token', 'e2e-guest-token'))
    await page.goto(`/settings?tab=${tab}`)
    await page.locator('.operator__tabs').waitFor({ state: 'visible', timeout: 15_000 })
  }

  test('a demo guest reaches Réglages instead of being bounced to the board', async ({ page }) => {
    await bootGuestSettings(page)

    await expect(page).toHaveURL(/\/settings/)
    await expect(page.locator('.operator')).toBeVisible()
    // Découvrir renders the guide, which is the point of letting them in at all.
    await expect(page.locator('.guide__card').first()).toBeVisible()
    // …but not the seed controls: loading/clearing sample data is operator-scoped.
    await expect(page.locator('.guide__sample')).toHaveCount(0)
    // The guest note replaces the kiosk one — a guest has no operator account to escalate to.
    await expect(page.locator('.operator__kiosk-note')).toBeVisible()
    await expect(page.getByRole('button', { name: /Se connecter avec le compte parent/ })).toHaveCount(0)
  })

  test('the Réglages nav tab is offered to a guest', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.setViewportSize(PHONE)
    await mockApi(page, { signedIn: false })
    await page.route('**/api/guest/whoami**', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ kind: 'showcase' }) }),
    )
    await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile' })
    await page.addInitScript(() => localStorage.setItem('babillard-guest-token', 'e2e-guest-token'))
    await page.goto('/board')
    await page.locator('.hubnav').waitFor({ state: 'visible', timeout: 15_000 })
    await expect(page.locator('.hubnav a[href="/settings"]')).toBeVisible()
  })

  test('a guest gets « Disposition » on the board tab, and nothing that writes the household', async ({ page }) => {
    await bootGuestSettings(page, 'board')

    const subs = page.locator('.subtabs')
    // Layout is device-local (lib/boardCards) — theirs to change.
    await expect(subs.getByRole('tab', { name: LAYOUT_SUB, exact: true })).toBeVisible()
    // Agenda + « La semaine » write/read the household — gone.
    await expect(subs.getByRole('tab', { name: EVENTS_SUB, exact: true })).toHaveCount(0)

    // And the panel is really usable, not a read-only listing: every row carries a drag
    // grip, and the drop-here tail target renders (the only way back into an emptied zone).
    await expect(page.locator('.board-layout__row .dnd-grip').first()).toBeVisible()
    await expect(page.locator('.board-layout__end').first()).toBeVisible()
  })

  test('a guest gets the device-local cards under Système and none of the machinery', async ({ page }) => {
    await bootGuestSettings(page, 'settings')

    const subs = page.locator('.subtabs')
    await expect(subs.getByRole('tab', { name: DISPLAY_SUB, exact: true })).toBeVisible()
    await expect(subs.getByRole('tab', { name: VOICE_AI_SUB, exact: true })).toBeVisible()
    // Pairing / guest links / the household export stack under ONE operator pill —
    // it must never appear for a read-only viewer.
    await expect(subs.getByRole('tab', { name: TABLETS_SUB, exact: true })).toHaveCount(0)

    // Inside « Affichage & veille »: the device cards, not the household's photos.
    await expect(page.locator('#op-display')).toBeVisible()
    await expect(page.locator('#op-calm')).toBeVisible()
    await expect(page.locator('#op-photos')).toHaveCount(0)
    // Inside « Voix & IA »: the voice, not the AI switch (a household PATCH).
    await subs.getByRole('tab', { name: VOICE_AI_SUB, exact: true }).click()
    await expect(page.locator('#op-voice')).toBeVisible()
    await expect(page.locator('#op-ai')).toHaveCount(0)
  })

  test('a guest can flip this device to English and to the toddler lens', async ({ page }) => {
    await bootGuestSettings(page, 'settings')
    await expect(page.locator('.subtabs').getByRole('tab', { name: DISPLAY_SUB, exact: true })).toBeVisible()

    // The language switch is device-local: it re-labels the app, it doesn't touch the household.
    await page.getByRole('button', { name: 'Français', exact: true }).click()
    await expect(page.getByRole('button', { name: 'English', exact: true })).toBeVisible()

    // The audience lens likewise — a demo that can't show the toddler view shows half the app.
    await expect(page.locator('.segmented__opt').first()).toBeVisible()
  })

  test('a tab with no device-local sub drops the lens toggle and stands on the guide', async ({ page }) => {
    // Maison configures only household things (routines, chores, members, groups, cars,
    // hours), so a guest gets no Régler side at all — show Comprendre alone rather than
    // an empty pill row.
    await bootGuestSettings(page, 'maison')

    await expect(page.locator('.operator__lens')).toHaveCount(0)
    await expect(page.locator('.guide__card').first()).toBeVisible()
  })

  test('the operator still sees every sub (the guest narrowing is not a global regression)', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.setViewportSize(PHONE)
    await mockApi(page, { signedIn: true })
    await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile' })
    await page.goto('/settings?tab=settings')
    await page.locator('.operator__tabs').waitFor({ state: 'visible', timeout: 15_000 })

    const subs = page.locator('.subtabs')
    await expect(subs.getByRole('tab', { name: TABLETS_SUB, exact: true })).toBeVisible()
    await expect(subs.getByRole('tab', { name: VOICE_AI_SUB, exact: true })).toBeVisible()
    // …and inside them, everything: the operator's AI switch beside the voice card.
    await subs.getByRole('tab', { name: VOICE_AI_SUB, exact: true }).click()
    await expect(page.locator('#op-ai')).toBeVisible()
    await expect(page.locator('#op-voice')).toBeVisible()
    // And the lens toggle is back, because Régler has something to show.
    await expect(page.locator('.operator__lens')).toBeVisible()

    const mainTabs = page.locator('.operator__tabs')
    await expect(mainTabs.getByRole('tab', { name: DISCOVER_TAB, exact: true })).toBeVisible()
    await expect(mainTabs.getByRole('tab', { name: BOARD_TAB, exact: true })).toBeVisible()
    await expect(mainTabs.getByRole('tab', { name: MAISON_TAB, exact: true })).toBeVisible()
    await expect(mainTabs.getByRole('tab', { name: SYSTEM_TAB, exact: true })).toBeVisible()
  })
})


// ── folded from share-doors.spec.ts ──────────────────────────────────────────────
test4.describe('share-doors', () => {
  // BUTTONS ON THE THINGS (C, 2026-09-29). The guest links that never landed — the box,
  // the details form, the sitter's link — could only be made from one form buried in
  // Réglages ▸ Système ▸ Appareils & accès, while every sharing door that IS used sits on
  // the thing it shares. So each got a door where Marc placed it, and every door opens the
  // ONE form with the choice already made (?kind=, and for the box aimed at a person,
  // ?target=). The management side became one list, « Ce que j'ai partagé ».

  // The form's kind picker — the one <select> offering the box.
  const kindPicker = (page: Page) => page.locator('select').filter({ has: page.locator('option[value="postbox"]') })

  // The board ＋ tile for this door left in review #16 (nine tiles was too many); the
  // door it opened stays: the form, preset to the sitter, from its Réglages link.
  test4('« Lien pour la gardienne » lands on the form set to the sitter', async ({ page, app }) => {
    await app.boot({ viewport: { width: 390, height: 844 }, clock: 'BASE', route: '/settings?tab=settings&focus=guestLinks&kind=sitter' })
    await expect(kindPicker(page)).toHaveValue('sitter', { timeout: 15_000 })
  })

  test4('the Mots card carries « Boîte aux lettres », and it lands on the form set to the box', async ({ page, app }) => {
    await app.boot({ viewport: { width: 390, height: 844 }, clock: 'BASE', route: '/board' })
    await expect(page.locator('.board-wall')).toBeVisible({ timeout: 15_000 })
    await page.locator('.notes').getByRole('link', { name: 'Boîte aux lettres' }).click()
    await expect(page).toHaveURL(/\/settings\?.*kind=postbox/)
    await expect(kindPicker(page)).toHaveValue('postbox')
  })

  test4('a contact’s peek asks them to fill in their fiche — the box, aimed at THEM', async ({ page, app }) => {
    await app.boot({ viewport: { width: 390, height: 844 }, clock: 'BASE', route: '/maison?section=family' })
    // Rose Tremblay, « Mamie » in the family card.
    const person = page.getByRole('button', { name: /^R Mamie/ }).first()
    await expect(person).toBeVisible({ timeout: 15_000 })
    await person.click()
    const sheet = page.locator('.detail-sheet, .sheet.show').first()
    await expect(sheet).toBeVisible()
    await sheet.getByRole('button', { name: 'Plus d’actions' }).click()
    // The ⋯ panel portals to <body> (ActionMenu) — scope to the page, not the sheet.
    await page.getByRole('menuitem', { name: 'Lui demander de compléter' }).click()
    await expect(page).toHaveURL(/\/settings\?.*kind=postbox.*target=/)
    await expect(kindPicker(page)).toHaveValue('postbox')
    // The person is named in the form once the circle has loaded (by the name the circle
    // uses for her — the nickname).
    await expect(page.getByRole('combobox', { name: /lien ouvert/ })).toHaveValue('Mamie')
  })

  test4('what was handed out reads as ONE list — links and shared copies together', async ({ page, app }) => {
    await app.boot({ viewport: { width: 390, height: 844 }, clock: 'BASE' })
    await page.route('**/api/guest-links**', (route) =>
      route.request().method() === 'GET'
        ? route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              links: [{ id: 'g1', kind: 'sitter', target_key: null, standing: 0, label: null, created_at: BASE, expires_at: BASE + 3600 }],
            }),
          })
        : route.fallback(),
    )
    await page.route('**/api/share**', (route) =>
      route.request().method() === 'GET'
        ? route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ shares: [{ id: 's1', kind: 'recipe', label: 'Pâté chinois', expiresAt: null }] }),
          })
        : route.fallback(),
    )
    await page.goto('/settings?tab=settings&focus=guestLinks')
    const list = page.locator('.operator__guest-links', { hasText: 'Ce que j’ai partagé' })
    await expect(list).toBeVisible({ timeout: 15_000 })
    await expect(list).toContainText('Pâté chinois')
    // One verb now: a link and a shared copy both say « Révoquer » (solidify 4.5).
    await expect(list.getByRole('button', { name: /Révoquer/ })).toHaveCount(2)
    // One list, not two stacked: the old headings are gone.
    await expect(page.getByText('Liens actifs')).toHaveCount(0)
    await expect(page.getByText('Mes partages')).toHaveCount(0)
  })
})


// ── folded from share-routed.spec.ts ──────────────────────────────────────────────
test.describe('share-routed', () => {
  // bmad/11 tier-1 seam #2, remaining half. /share re-implemented the capture spine
  // beside CaptureForm — the build-beside failure mode CLAUDE.md warns about — and the
  // cost was precisely the part it didn't copy: a shared link was filed by the AI and
  // the page said only « Ajouté ! » before bouncing to the board a second later. Which
  // list? Which day? If the AI guessed wrong, there was no « Corriger » and no undo.
  //
  // It now MOUNTS the real spine, seeded. This guards the two things that were missing:
  // the routed label, and a reachable correction — reachable meaning still on screen,
  // which is why the text branch no longer auto-returns.
  test('a shared link lands with its routed label and a reachable « Corriger »', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await mockApi(page)
    const posts: Record<string, unknown>[] = []
    await page.route('**/api/capture', async (route) => {
      const body = JSON.parse(route.request().postData() || '{}')
      posts.push(body)
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          type: body.forceType ?? 'event',
          degraded: false,
          routed: {
            kind: body.forceType ?? 'event',
            label: body.forceType ? 'Souper de tarte' : 'Rendez-vous : tarte',
            cleanup: [{ table: body.forceType ? 'meals' : 'events', id: 'x_e2e' }],
          },
        }),
      })
    })
    await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr' })

    await page.goto('/share?text=' + encodeURIComponent('https://example.com/recette-de-tarte'))
    await expect(page.locator('.share-page')).toBeVisible()

    // Seeded into the real spine — not a parallel textarea.
    const field = page.locator('.share-page .capture-form input.edit-field__input')
    await expect(field).toHaveValue('https://example.com/recette-de-tarte')
    await page.locator('.share-page .capture-form .edit-field__submit').click()

    // THE fix: the page says where it went.
    await expect(page.locator('.capture__routed')).toContainText('Ajouté :')
    await expect(page.locator('.capture__routed')).toContainText('Rendez-vous : tarte')

    // …and it STAYS on screen to be corrected. The old page bounced to /board on a
    // 1s timer, which is why this waits it out before asserting: a check taken
    // immediately passes against the very behaviour it is meant to forbid (verified by
    // planting the timed bounce back — without this wait the spec stayed green).
    await page.waitForTimeout(1600)
    expect(page.url()).toContain('/share')
    await expect(page.locator('.capture__routed')).toBeVisible()
    const correct = page.locator('.share-page .capture__correct')
    await expect(correct).toBeVisible()
    await correct.locator('.disclosure__summary').click()

    // A correction MOVES the capture: same text, a forced type, and the previous
    // routing's rows handed back for deletion (never a duplicate).
    await page.locator('.share-page .cat-pick', { hasText: 'Souper' }).first().click()
    await expect.poll(() => posts.length).toBe(2)
    expect(posts[1]?.forceType).toBe('meal')
    expect(posts[1]?.text).toBe('https://example.com/recette-de-tarte')
    expect(posts[1]?.undo).toEqual([{ table: 'events', id: 'x_e2e' }])

    // The way onward replaces « Annuler » once something has landed.
    await expect(page.locator('.share-page__actions .btn--ghost').first()).toContainText('babillard')
  })
})


// ── folded from share-business.spec.ts ──────────────────────────────────────────────
test.describe('share-business', () => {
  // Share a Google Maps place link → a pre-filled business card (Marc, Aug 2026:
  // "j'ai partagé un lien pour ajouter un business, ça ne marche pas"). Two halves:
  //   • /share (the PWA share-target) offers « Ajouter un business » when the shared
  //     text carries a Maps link — before, the only path was the capture spine, which
  //     has no business type (the link became a note with a naked URL).
  //   • the button lands on /maison (Le cercle's business world merged into the Maison
  //     tab) with the BusinessForm open and the import ALREADY run (?add=business&
  //     import=<url> → place-import → name + address filled).
  // The server-side /sorry block recovery is unit-tested in placeImport.test.ts.

  const MAPS_URL = 'https://maps.app.goo.gl/hCpMvxRRDUhwLCPi9?g_st=ic'
  const PLACE = {
    name: 'Clinique Vétérinaire Animalia',
    address: '273 Bd Sir-Wilfrid-Laurier, Mont-Saint-Hilaire, QC J3H 0J1',
    category: 'Vétérinaire',
    photoKey: null,
    lat: null,
    lng: null,
    mapUrl: MAPS_URL,
    empty: false,
  }

  test.beforeEach(async ({ page }) => {
    await mockApi(page)
    await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr' })
    await page.route('**/api/place-import**', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(PLACE) })
    })
  })

  test('sharing a Maps link offers « Ajouter un business » → the form opens pre-filled', async ({ page }) => {
    // The query-param fallback path (no service worker in the e2e harness).
    await page.goto(`/share?text=${encodeURIComponent(MAPS_URL)}`)
    const bizBtn = page.getByRole('button', { name: 'Ajouter un commerce' })
    await expect(bizBtn).toBeVisible()

    // The import runs on open — the POST carries the shared link.
    const [req] = await Promise.all([
      page.waitForRequest((r) => r.url().includes('/api/place-import') && r.method() === 'POST'),
      bizBtn.click(),
    ])
    expect(JSON.parse(req.postData() || '{}').url).toBe(MAPS_URL)

    // The BusinessForm modal is open with name + address filled for review.
    const form = page.locator('.kit-modal .operator__inline-form')
    await expect(form).toBeVisible()
    await expect(form.getByRole('textbox', { name: 'Nom' })).toHaveValue(PLACE.name)
    await expect(form.getByRole('textbox', { name: 'Adresse' })).toHaveValue(PLACE.address)
    // The ?add/?import params were stripped (a reload must not re-open the modal).
    await expect
      .poll(async () => new URL(page.url()).search, { message: 'params stripped' })
      .not.toContain('add=')
  })

  test('a shared non-Maps text gets no business button — capture stays the one path', async ({ page }) => {
    await page.goto(`/share?text=${encodeURIComponent('acheter du lait demain')}`)
    await expect(page.getByRole('button', { name: 'Ajouter' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Ajouter un commerce' })).toHaveCount(0)
  })

  // A shared web link that is not a Maps place may be a recipe (2026-10-27): a second door
  // into the recipe import, opened on that link; the capture stays the default.
  test('sharing a web link offers « Importer comme recette » → the recipe import opens on it', async ({ page }) => {
    const url = 'https://www.ricardocuisine.com/recettes/4530-tarte-au-sucre-2'
    await page.goto(`/share?text=${encodeURIComponent('Regarde ça ' + url)}`)
    await expect(page.getByRole('button', { name: 'Ajouter un commerce' })).toHaveCount(0)
    await page.getByRole('button', { name: 'Importer comme recette' }).click()
    await expect(page).toHaveURL(/\/kitchen\/recipe\/new/)
  })

  test('plain shared text offers no recipe import', async ({ page }) => {
    await page.goto(`/share?text=${encodeURIComponent('acheter du lait demain')}`)
    await expect(page.getByRole('button', { name: 'Ajouter' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Importer comme recette' })).toHaveCount(0)
  })
})


// ── folded from partage-public.spec.ts ──────────────────────────────────────────────
test.describe('partage-public', () => {
  // « Partager » (wave 2) — the PUBLIC /partage/<id> page. A signed-OUT visitor sees the
  // shared recipe + a « Rejoindre Babillard » CTA (the acquisition funnel); a signed-IN
  // visitor sees the same render + « Ajouter à mon livre » (POST /api/recipes). An expired
  // /dead link shows a calm "n'existe plus" + the join CTA. Reads hit only public endpoints
  // (share-public), so an anonymous session never trips onAuthLost.

  const RECIPE_SHARE = {
    kind: 'recipe',
    label: 'Spaghetti maison',
    sourceName: 'Maison Tremblay',
    expiresAt: null,
    payload: {
      title: 'Spaghetti maison',
      ingredients: ['400 g de pâtes', '1 pot de sauce tomate'],
      steps: ['Faire bouillir les pâtes.', 'Ajouter la sauce.'],
      servings: 4,
      servingsUnit: null,
      prepMin: 15,
      cookMin: 30,
      totalMin: null,
      notes: 'Parmesan au service.',
      source: null,
      image: null,
      stepImages: ['', ''],
      tags: ['rapide'],
      lang: 'fr',
    },
  }

  const EVENT_SHARE = {
    kind: 'event',
    label: 'BBQ chez nous',
    sourceName: 'Maison Tremblay',
    expiresAt: null,
    payload: { title: 'BBQ chez nous', startAt: 1_749_400_000, allDay: false, whoLabel: 'Les Tremblay' },
  }

  const ROUTINE_SHARE = {
    kind: 'routine',
    label: 'Dodo',
    sourceName: 'Maison Tremblay',
    expiresAt: null,
    payload: {
      name: 'Routine du dodo',
      timeOfDay: 'evening',
      cards: [
        { icon: '🦷', label: 'Brosse les dents', photoKey: '' },
        { icon: '📖', label: 'Une histoire', photoKey: '' },
      ],
    },
  }

  const json = (body: unknown) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
  const notFound = { status: 404, contentType: 'application/json', body: JSON.stringify({ error: 'Ce partage n’existe plus.' }) }

  test('signed-out: the shared recipe renders with a « Rejoindre Babillard » CTA', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await mockApi(page, { signedIn: false })
    await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile' })
    await page.route('**/api/share-public**', (route: Route) => route.fulfill(json(RECIPE_SHARE)))

    await page.goto('/partage/shX')

    // The recipe render (title + an ingredient + a step) and the sender attribution.
    await expect(page.locator('.shared-recipe__title')).toHaveText('Spaghetti maison')
    await expect(page.getByText('400 g de pâtes')).toBeVisible()
    await expect(page.getByText('Faire bouillir les pâtes.')).toBeVisible()
    await expect(page.getByText('Maison Tremblay')).toBeVisible()

    // The join funnel — a primary link to /signup, and the "already have an account" door.
    const cta = page.getByRole('link', { name: 'Découvrir Babillard' })
    await expect(cta).toBeVisible()
    await expect(cta).toHaveAttribute('href', '/signup')
    await expect(page.getByRole('link', { name: 'J’ai déjà un compte' })).toBeVisible()
    // No import button for a signed-out visitor.
    await expect(page.getByRole('button', { name: 'Ajouter à mon livre' })).toHaveCount(0)
  })

  test('a dead/expired link shows a calm "n’existe plus" + the join CTA', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await mockApi(page, { signedIn: false })
    await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile' })
    await page.route('**/api/share-public**', (route: Route) => route.fulfill(notFound))

    await page.goto('/partage/gone')
    await expect(page.getByText('Ce partage n’existe plus ou a expiré.')).toBeVisible()
    await expect(page.getByRole('link', { name: 'Découvrir Babillard' })).toBeVisible()
  })

  test('signed-in: « Ajouter à mon livre » copies the recipe (POST /api/recipes) then opens it', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.routeWebSocket(/\/api\/live/, () => {})
    await mockApi(page) // signedIn defaults true
    await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile' })
    await page.route('**/api/share-public**', (route: Route) => route.fulfill(json(RECIPE_SHARE)))
    // The import POSTs a new recipe; return a fresh id to navigate to.
    await page.route('**/api/recipes', (route: Route) =>
      route.fulfill(route.request().method() === 'POST' ? json({ id: 'newR' }) : json({ recipes: [] })),
    )

    await page.goto('/partage/shX')

    const [req] = await Promise.all([
      page.waitForRequest((r) => r.method() === 'POST' && new URL(r.url()).pathname === '/api/recipes', { timeout: 20_000 }),
      page.waitForURL(/\/kitchen\/recipe\/newR/),
      page.getByRole('button', { name: 'Ajouter à mon livre' }).click(),
    ])
    expect(req.postDataJSON()).toMatchObject({ title: 'Spaghetti maison', tags: ['rapide'] })
  })

  test('signed-out: a shared event renders its card + the join CTA', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await mockApi(page, { signedIn: false })
    await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile' })
    await page.route('**/api/share-public**', (route: Route) => route.fulfill(json(EVENT_SHARE)))

    await page.goto('/partage/ev1')
    await expect(page.locator('.partage__title')).toHaveText('BBQ chez nous')
    await expect(page.getByText('Les Tremblay')).toBeVisible()
    await expect(page.getByRole('link', { name: 'Découvrir Babillard' })).toBeVisible()
  })

  test('signed-in: a shared event « Ajouter à mon agenda » POSTs /api/events → /board', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.routeWebSocket(/\/api\/live/, () => {})
    await mockApi(page)
    await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile' })
    await page.route('**/api/share-public**', (route: Route) => route.fulfill(json(EVENT_SHARE)))
    await page.route('**/api/events', (route: Route) =>
      route.fulfill(route.request().method() === 'POST' ? json({ id: 'ev9', title: 'BBQ chez nous' }) : json({ events: [] })),
    )

    await page.goto('/partage/ev1')
    const [req] = await Promise.all([
      page.waitForRequest((r) => r.method() === 'POST' && new URL(r.url()).pathname === '/api/events', { timeout: 20_000 }),
      page.waitForURL(/\/board/),
      page.getByRole('button', { name: 'Ajouter à mon agenda' }).click(),
    ])
    expect(req.postDataJSON()).toMatchObject({ title: 'BBQ chez nous' })
  })

  test('signed-in: a shared routine renders its deck, then imports for a picked child (POST /api/routines)', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.routeWebSocket(/\/api\/live/, () => {})
    await mockApi(page)
    await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile' })
    await page.route('**/api/share-public**', (route: Route) => route.fulfill(json(ROUTINE_SHARE)))
    await page.route('**/api/routines', (route: Route) =>
      route.fulfill(route.request().method() === 'POST' ? json({ ids: ['r9'] }) : json({ routines: [] })),
    )

    await page.goto('/partage/rt1')
    // The deck renders (name + a card label).
    await expect(page.locator('.shared-routine__title')).toHaveText('Routine du dodo')
    await expect(page.getByText('Brosse les dents')).toBeVisible()

    // Pick a child, then import → POST /api/routines with that member, landing on
    // Maison (Routines is its default section now).
    await page.locator('.partage__foot select').selectOption('m3')
    const [req] = await Promise.all([
      page.waitForRequest((r) => r.method() === 'POST' && new URL(r.url()).pathname === '/api/routines', { timeout: 20_000 }),
      page.waitForURL(/\/maison/),
      page.getByRole('button', { name: 'Ajouter à mes routines' }).click(),
    ])
    expect(req.postDataJSON()).toMatchObject({ name: 'Routine du dodo', memberIds: ['m3'] })
  })
})


// ── folded from readonly-states.spec.ts ──────────────────────────────────────────────
test.describe('readonly-states', () => {
  // Two surfaces that told the truth badly, both fixed 2026-08-28 (REVIEW-PASS).
  //
  // 1. MeasureColorsSection VANISHED for a guest where its siblings degrade to a
  //    read-only legend. The finding read as a link-guest problem; grepping said
  //    otherwise — `kitchen ▸ apparence` is not in GUEST_SUBS, so a LINK guest never
  //    reaches that sub at all. The audience that actually saw the hole is an operator
  //    in **guest preview**: `isGuest()` is true for them, `isGuestLocked()` (which
  //    drives GUEST_SUBS) is not. So the gate's one real audience got a section that
  //    silently disappeared, in the mode whose whole job is to show read-only.
  // 2. HeartButton truncated the loved-by faces at four with NO cue, so a fifth
  //    person's ❤ just vanished. The cue may not be a « +N » — a count is precisely
  //    what the calm tenet forbids on hearts — so it is a muted « … » disc.

  const PHONE = { width: 390, height: 844 }

  test('guest preview shows the measure colours read-only instead of hiding them', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.setViewportSize(PHONE)
    await mockApi(page)
    await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile' })
    // Guest PREVIEW, not a link guest: a full operator underneath (so the kitchen tab
    // keeps its Régler side) who is being shown what read-only looks like.
    await page.addInitScript(() => localStorage.setItem('babillard-guest-preview', '1'))
    await page.goto('/settings?tab=kitchen&sub=apparence')

    const sec = page.locator('.measure-colors')
    await expect(sec, 'the section must still be there — it used to return null').toBeVisible()
    // The information stays: one swatch per measure family, plus the sample line that
    // shows the household's colour coding in situ.
    await expect(sec.locator('.measure-colors__swatch').first()).toBeVisible()
    await expect(page.locator('.measure-colors__preview-line')).toBeVisible()
    // The editing affordances go: no OS colour input, no « Réinitialiser ».
    await expect(sec.locator('input[type="color"]')).toHaveCount(0)
    await expect(page.getByRole('button', { name: /Réinitialiser/ })).toHaveCount(0)
  })

  test('an operator still gets the colour pickers and the reset', async ({ page }) => {
    // The other side of the same gate — so a too-eager read-only branch can't quietly
    // take the editor away from the person who owns it.
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.setViewportSize(PHONE)
    await mockApi(page)
    await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile' })
    await page.goto('/settings?tab=kitchen&sub=apparence')

    const sec = page.locator('.measure-colors')
    await expect(sec.locator('input[type="color"]').first()).toBeVisible()
    await expect(sec.locator('.measure-colors__swatch')).toHaveCount(0)
  })

  test('past four loved-by faces the row says « et d’autres », never a number', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.setViewportSize({ width: 1280, height: 900 })
    await mockApi(page)
    // Six members all loving the /dev/kit specimen's recipe id — two more than fit.
    const members = ['Ana', 'Bo', 'Cy', 'Dee', 'Eli', 'Fen'].map((n, i) => ({
      id: `m${i}`,
      display_name: n,
      colour: '#88a36f',
      avatar_kind: 'initial',
      avatar_ref: null,
    }))
    await page.route('**/api/members**', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ members }) }),
    )
    await page.route('**/api/recipe-loves**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ loves: members.map((m) => ({ recipe_id: 'devkit-demo-recipe', member_id: m.id })) }),
      }),
    )
    await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'kiosk' })
    await page.goto('/dev/kit')

    const entry = await openKitEntry(page, 'HeartButton')
    const faces = entry.locator('.hearts__faces')
    await expect(faces).toBeVisible()

    // Four real faces + exactly one overflow cue.
    await expect(faces.locator('.hearts__face:not(.hearts__face--more)')).toHaveCount(4)
    const more = faces.locator('.hearts__face--more')
    await expect(more).toHaveCount(1)
    await expect(more).toHaveAttribute('title', 'et d’autres')
    // Calm: whatever the cue is, it must not be a count. No digit anywhere in the row.
    await expect(faces).not.toContainText(/\d/)
  })

  test('four or fewer loved-by faces show no overflow cue at all', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.setViewportSize({ width: 1280, height: 900 })
    await mockApi(page)
    const members = ['Ana', 'Bo', 'Cy'].map((n, i) => ({
      id: `m${i}`,
      display_name: n,
      colour: '#88a36f',
      avatar_kind: 'initial',
      avatar_ref: null,
    }))
    await page.route('**/api/members**', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ members }) }),
    )
    await page.route('**/api/recipe-loves**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ loves: members.map((m) => ({ recipe_id: 'devkit-demo-recipe', member_id: m.id })) }),
      }),
    )
    await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'kiosk' })
    await page.goto('/dev/kit')

    const entry = await openKitEntry(page, 'HeartButton')
    const faces = entry.locator('.hearts__faces')
    await expect(faces.locator('.hearts__face')).toHaveCount(3)
    await expect(faces.locator('.hearts__face--more')).toHaveCount(0)
  })
})
