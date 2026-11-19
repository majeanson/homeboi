import { test, expect, type App } from './fixtures'
import { type Page, test as test2 } from '@playwright/test'
import { mockApi, seedState } from './mocks'
import { SETTINGS_TREE, visibleSections, visibleSubs, type SettingsTabId } from '../src/lib/settingsNav'

// JOURNEY — THE WALL TABLET (review #43; was kiosk-doors.spec.ts + kiosk-settings.spec.ts + idle-ambient.spec.ts).
//
// A PAIRED KIOSK NEVER SEES A DOOR THE SERVER WILL 403.
//
// Thirty-six handlers are `authed(…, 'operator')` (transfers, trips, habits DELETE,
// members admin, guest links…). The client gated most of its doors on `isGuest()`
// alone, which is half the truth — a wall tablet holds a device token (scope 'kiosk')
// and is refused exactly like a guest. Until 2026-11-05 it saw « Modifier » /
// « Supprimer » / « Ajouter » on the virements, a « Supprimer » on a habit, a whole
// voyage scene, and read « Pas enregistré » behind each. `lib/device.ts`
// `needsOperator()` is the whole truth; `functions/_lib/operator-doors.test.ts` pairs
// every operator-only (path, method) with its client sites; this spec is the browser
// half, with an OPERATOR control per door so a selector that matches nothing cannot
// pass by accident.

test.describe('kiosk-doors', () => {
  const kiosk = (app: App) => app.boot({ api: { signedIn: false }, state: { paired: true, surface: 'kiosk' } })
  const operator = (app: App) => app.boot()

  test('a kiosk opening the voyage scene lands back on the board', async ({ page, app }) => {
    await kiosk(app)
    await page.goto('/voyage')
    await expect(page).toHaveURL(/\/board(\?|$)/)
  })

  test('a kiosk opening the transfer form lands on the virements section', async ({ page, app }) => {
    await kiosk(app)
    await page.goto('/virement/new')
    await expect(page).toHaveURL(/\/notes\?section=virements/)
    await page.goto('/virement/plan/new')
    await expect(page).toHaveURL(/\/notes\?section=virements/)
  })

  test('a kiosk opening the family import lands on the family section', async ({ page, app }) => {
    await kiosk(app)
    await page.goto('/cercle/import?intake=x')
    await expect(page).toHaveURL(/\/maison\?section=family/)
  })

  test('the virements section shows no add / edit / delete door to a kiosk (the operator sees them)', async ({ page, app }) => {
    // The doors: row furniture (edit / delete) and the section's own « Ajouter … » CTAs.
    // Not the section pill (« Les virements » is a tab, not a door).
    // By ACCESSIBLE NAME, not text: the row furniture is icon-only buttons whose word
    // lives in aria-label (RowActions), and so is the section's ＋. `hasText` saw none of
    // them, so the operator control counted zero and this test was red from the day it
    // shipped (CI runs 42079625356 / 42081025487, 2026-11-05).
    const doors = () => page.locator('.hub').getByRole('button', { name: /^(Ajouter|Modifier|Supprimer)/ })
    await operator(app)
    await page.goto('/notes?section=virements')
    await page.locator('.hub').waitFor({ state: 'visible', timeout: 15_000 })
    await expect.poll(() => doors().count(), { message: 'control: the operator has at least one door' }).toBeGreaterThan(0)

    await kiosk(app)
    await page.goto('/notes?section=virements')
    await page.locator('.hub').waitFor({ state: 'visible', timeout: 15_000 })
    // Proving no door appeared: nothing marks an absence, so give it the time it would have taken.
    await page.waitForTimeout(400)
    await expect(doors()).toHaveCount(0)
  })

  test('a habit\'s form: the operator gets « Supprimer »; a kiosk never reaches the form', async ({ page, app }) => {
    await operator(app)
    await page.goto('/habitude/hb1/edit')
    await expect(page.getByRole('button', { name: 'Supprimer' })).toBeVisible({ timeout: 15_000 })

    // The habits DELETE is operator-only. A paired kiosk is bounced off the FormScene
    // (no operator session) before any footer renders — the door is not reachable at
    // all, which is one layer above HabitForm's own `!needsOperator()` on the button.
    await kiosk(app)
    await page.goto('/habitude/hb1/edit')
    await expect(page).not.toHaveURL(/\/habitude\//, { timeout: 15_000 })
    await expect(page.getByRole('button', { name: 'Supprimer' })).toHaveCount(0)
  })
})

// ── folded from journey-wall-tablet.spec.ts ──────────────────────────────────────────────
test2.describe('kiosk-settings', () => {
  // A parent-mode kiosk (paired wall tablet, NOT locked into toddler) may open
  // Réglages to read the guide and edit most settings — but member/group admin,
  // device pairing, guest links and the household export stay operator-only. The
  // server still rejects their writes; this is the UI half of that gate.
  //
  // Gating is PER SECTION CARD (2026-09-08, the 28 → 14 merge): every card in
  // lib/settingsNav's SETTINGS_TREE carries an `access`, and a viewer's pill row and
  // stacks DERIVE from it — a pill shows when at least one of its cards does, and only
  // those cards render inside it. So on a kiosk, Maison ▸ « La maisonnée » (members +
  // cercle groups, both operator) drops as a whole pill, while Système ▸ « Appareils &
  // accès » STAYS — its pairing/guest/export cards vanish but a wall tablet's own
  // diagnostics (mic test, keyboard debug, health) remain reachable, which is where
  // the old per-pill gate used to strand a kiosk.
  //
  // Data-driven on purpose: the expectations below are computed from the tree with
  // the same `visibleSubs`/`visibleSections` Operator uses, so the next pill reshuffle
  // changes nothing here. What this proves is that the PAGE agrees with the data.

  const PHONE = { width: 390, height: 844 }
  const KIOSK = { guest: false, operator: false }
  const OPERATOR = { guest: false, operator: true }
  const TABS = Object.keys(SETTINGS_TREE) as SettingsTabId[]

  async function bootSettings(page: Page, path: string, opts: { operator: boolean }) {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.setViewportSize(PHONE)
    // operator: signedIn cookie session (full access). kiosk: signedIn false but a
    // device token present (seedState paired) — the parent-mode wall tablet.
    await mockApi(page, { signedIn: opts.operator })
    await seedState(page, {
      theme: 'day',
      audience: 'parent',
      lang: 'fr',
      surface: opts.operator ? 'mobile' : 'kiosk',
      paired: !opts.operator,
    })
    await page.goto(path)
    await page.locator('.operator__tabs').waitFor({ state: 'visible', timeout: 15_000 })
  }

  test2('parent-mode kiosk reaches Réglages, with the kiosk notice', async ({ page }) => {
    await bootSettings(page, '/settings?tab=guide', { operator: false })
    // It got IN — not bounced to /login — and the shell rendered.
    await expect(page).toHaveURL(/\/settings/)
    await expect(page.locator('.operator')).toBeVisible()
    // The "you're on a kiosk, some settings need the operator account" notice shows.
    await expect(page.locator('.operator__kiosk-note')).toBeVisible()
    // Every themed tab stays visible on a kiosk (gating is per card, never per tab).
    for (const tab of TABS) await expect(page.locator(`#op-tab-${tab}`)).toBeVisible()
  })

  for (const tab of TABS) {
    const kioskSubs = visibleSubs(tab, KIOSK)
    const allSubs = visibleSubs(tab, OPERATOR)
    const dropped = allSubs.filter((s) => !kioskSubs.includes(s))

    test2(`kiosk ▸ ${tab}: exactly the tree's kiosk pills (${kioskSubs.length} of ${allSubs.length}), operator cards absent inside each`, async ({ page }) => {
      await bootSettings(page, `/settings?tab=${tab}&lens=regler`, { operator: false })
      const pills = page.locator('.operator__subs [role="tab"]')
      if (kioskSubs.length === 0) {
        // No card for a kiosk on this tab → no Régler side at all.
        await expect(page.locator('.operator__lens')).toHaveCount(0)
        return
      }
      await expect(pills).toHaveCount(kioskSubs.length)
      for (const sub of kioskSubs) {
        await page.goto(`/settings?tab=${tab}&lens=regler&sub=${sub}`)
        await page.locator('.operator__subs').waitFor({ state: 'visible', timeout: 15_000 })
        const all = visibleSections(tab, sub, OPERATOR)
        const shown = new Set(visibleSections(tab, sub, KIOSK).map((s) => s.key))
        for (const s of all) {
          await expect(page.locator(`#op-${s.key}`), `${tab}/${sub}: ${s.key} (${s.access}) on a kiosk`).toHaveCount(shown.has(s.key) ? 1 : 0)
        }
      }
      // A dropped pill is also out of the valid ?sub set: a deep link folds to the
      // tab's first kiosk pill instead of bypassing the gate.
      for (const sub of dropped) {
        await page.goto(`/settings?tab=${tab}&lens=regler&sub=${sub}`)
        await page.locator('.operator__subs').waitFor({ state: 'visible', timeout: 15_000 })
        for (const s of visibleSections(tab, sub, OPERATOR)) await expect(page.locator(`#op-${s.key}`)).toHaveCount(0)
      }
    })
  }

  test2('kiosk: the legacy ?tab=devices deep link lands on Système without the pairing form', async ({ page }) => {
    // ?tab=devices folds to Système ▸ « Appareils & accès » — a pill a kiosk keeps
    // (its diagnostics live there), whose pairing / guest / export cards are gone.
    await bootSettings(page, '/settings?tab=devices', { operator: false })
    await expect(page.locator('#op-tab-settings')).toHaveAttribute('aria-selected', 'true')
    await expect(page.locator('.operator__claim')).toHaveCount(0)
    await expect(page.locator('#op-claimTablet')).toHaveCount(0)
    await expect(page.locator('#op-devices')).toHaveCount(0)
    await expect(page.locator('#op-guestLinks')).toHaveCount(0)
    await expect(page.locator('#op-takeout')).toHaveCount(0)
    // Its own mic test is still here (the keyboard diagnostic moved to « Avancé », #18).
    await expect(page.locator('#op-micTest')).toBeVisible()
  })

  test2('signed-in operator sees every pill and card, and no kiosk notice', async ({ page }) => {
    await bootSettings(page, '/settings?tab=maison&lens=regler&sub=members', { operator: true })
    await expect(page.locator('.operator__kiosk-note')).toHaveCount(0)
    await expect(page.locator('.operator__subs [role="tab"]')).toHaveCount(visibleSubs('maison', OPERATOR).length)
    await expect(page.locator('#op-members')).toBeVisible()
    await expect(page.locator('#op-cercleGroups')).toBeVisible()
    await page.goto('/settings?tab=settings&lens=regler&sub=tablets')
    await expect(page.locator('#op-claimTablet')).toBeVisible()
    await expect(page.locator('#op-devices')).toBeVisible()
  })
})


// ── folded from journey-wall-tablet.spec.ts ──────────────────────────────────────────────
test.describe('idle-ambient', () => {
  // The kiosk idle screensaver (AmbientScreen), part of the §931 offline/ambient layer.
  // The real trigger is a 3-minute idle timer, but Réglages ▸ Debug can force it now via
  // a `bb:idle-debug` CustomEvent that HubLayout's idle effect listens to (lib/idleDebug
  // forceIdle). We fire that event directly — the same path the Debug button uses — so
  // the test needs no fake timers, then assert the screensaver shows and a tap wakes it.

  const forceScreensaver = (page: Page) =>
    page.evaluate(() => window.dispatchEvent(new CustomEvent('bb:idle-debug', { detail: 'screensaver' })))

  test('forcing the idle timer shows the ambient screensaver', async ({ page, app }) => {
    await app.boot({ route: '/board', state: { surface: 'kiosk' }, wait: '.hub' })
    await expect(page.locator('.ambient')).toHaveCount(0) // not up at rest
    await forceScreensaver(page)
    const saver = page.locator('.ambient')
    await expect(saver).toBeVisible()
    // The full-screen clock is the calm centrepiece.
    await expect(saver.locator('.ambient__clock')).toBeVisible()
    // C-13 (bmad/10): the "next up" line (tonight's supper, via useAmbientScene /
    // lib/ambientScene) — the mocked board always has a `tonight` meal, so this
    // is the ONE ambient engine seam actually reaching the screensaver's render.
    await expect(saver.locator('.ambient__next').first()).toBeVisible()
  })

  test('tapping the screensaver wakes back to the board', async ({ page, app }) => {
    await app.boot({ route: '/board', state: { surface: 'kiosk' }, wait: '.hub' })
    await forceScreensaver(page)
    const saver = page.locator('.ambient')
    await expect(saver).toBeVisible()
    // A tap anywhere wakes it (onPointerDown → onWake) and the board is back underneath.
    await saver.click({ position: { x: 10, y: 10 } })
    await expect(saver).toHaveCount(0)
    await expect(page.locator('.hub')).toBeVisible()
  })
})
