import { test, expect, type Page } from '@playwright/test'
import { mockApi, seedState, BASE, BOARD, MMID } from './mocks'

// Board customization + lens coverage — the §6 e2e gaps from AUJOURDHUI.md that the
// static screenshot frames never exercise: the « Disposition du babillard » toggle UI
// (only its rendered RESULT was covered), the Moments window chips → /moment scene, and
// the board re-rendering under a picked face (the face lens, beyond the greeting).
// Same frontend-only harness as interactions.spec.ts: Vite + stubbed /api/**.

async function board(page: Page, freezeClock = false) {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  // Only the face-lens test freezes the clock (to the mock epoch) so the timed
  // Garderie event stays live and visible — the board lifecycle folds "past" items
  // into a collapsed disclosure vs the real clock. Kept OFF for the Moments-chip
  // tests, whose "lead window (Ce soir by day)" IS time-of-day dependent.
  if (freezeClock) await page.clock.setFixedTime(new Date(BASE * 1000))
  await mockApi(page)
  await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', calm: true })
  await page.goto('/board')
  await page.locator('.hub').waitFor({ state: 'visible', timeout: 15_000 })
}

// ─────────────────────── Moments window chips ──────────────────────────

test.describe('Moments chips', () => {
  test('a board Moments chip deep-links straight to that scope in the scene', async ({ page }) => {
    await board(page)
    // The MomentPeek hero lists its four windows as direct tap targets. Tapping
    // « Cette semaine » must land on /moment?scope=week (not the default tomorrow).
    const chip = page.locator('.moment-chip', { hasText: 'Cette semaine' })
    await expect(chip).toBeVisible()
    await Promise.all([page.waitForURL(/\/moment\?scope=week/), chip.click()])
    // The scene's scope selector reflects the deep-linked window (urlSync).
    await expect(page.locator('.moments .subtabs__opt[aria-selected="true"]')).toContainText('Cette semaine')
  })

  test('the lead window (Ce soir by day) opens its own scope', async ({ page }) => {
    await board(page)
    const chip = page.locator('.moment-chip', { hasText: 'Ce soir' })
    await Promise.all([page.waitForURL(/\/moment\?scope=tonight/), chip.click()])
    await expect(page.locator('.moments')).toBeVisible()
  })
})

// ───────────────── « Disposition du babillard » toggle UI ───────────────

test.describe('board layout customization', () => {
  // Navigate to Réglages ▸ Affichage where the BoardLayoutSection lives. Seeding is
  // done once in the test (addInitScript persists across page.goto), so this only
  // navigates + opens the tab — re-seeding would stack duplicate route handlers.
  async function openLayout(page: Page) {
    // « Disposition du babillard » is its own sub-section under « Le babillard » —
    // deep-link to it (?tab=display&sub=layout) so the layout panel renders.
    await page.goto('/settings?tab=display&sub=layout')
    await page.locator('.operator__tabs').waitFor({ state: 'visible', timeout: 15_000 })
    // Two zone lists (the band + the masonry) — wait for the first.
    await page.locator('.board-layout').first().waitFor({ state: 'visible' })
  }

  const rowFor = (page: Page, name: string) => page.locator('.board-layout__row', { hasText: name })
  /** Click the tri-state until the card reads « Jamais » (always → auto → never). */
  async function setNever(page: Page, name: string) {
    const btn = rowFor(page, name).locator('.board-layout__toggle')
    for (let i = 0; i < 3; i++) {
      if ((await btn.textContent())?.includes('Jamais')) return
      await btn.click()
    }
    await expect(btn).toContainText('Jamais')
  }

  test('hiding a card in Réglages removes it from the Grille; reset brings it back', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await mockApi(page)
    await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', calm: true })
    await openLayout(page)
    // « À venir » defaults to « Si non vide » — one more click reaches « Jamais ».
    await setNever(page, 'À venir')

    // The per-device pref is localStorage-backed, so a fresh board load honours it:
    // the « À venir » bento is gone (the fixture has upcoming items, so it WOULD show).
    await page.goto('/board')
    await page.locator('.hub').waitFor({ state: 'visible' })
    await expect(page.locator('.bento .sec-label b', { hasText: /^À venir$/ })).toHaveCount(0)

    // Reset from the panel restores the default layout → the card comes back.
    await openLayout(page)
    await page.getByRole('button', { name: 'Réinitialiser' }).click()
    await page.goto('/board')
    await page.locator('.hub').waitFor({ state: 'visible' })
    await expect(page.locator('.bento .sec-label b', { hasText: /^À venir$/ })).toHaveCount(1)
  })

  test('a band card (Moments) hides too — and now drags, like every other card', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await mockApi(page)
    await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', calm: true })
    await page.goto('/board')
    await page.locator('.hub').waitFor({ state: 'visible' })
    await expect(page.locator('.now-card--moment')).toBeVisible()

    await openLayout(page)
    // The band lists its five cards, and every one of them carries a drag grip: band
    // cards used to be show/hide-only, pinned in place. That asymmetry is gone.
    const band = page.locator('.board-layout').first()
    await expect(band.locator('.board-layout__row')).toHaveCount(5)
    await expect(band.locator('.board-layout__row .dnd-grip')).toHaveCount(5)
    // Each zone ends in a drop target, so a card can be moved into an emptied group.
    await expect(page.locator('.board-layout__end')).toHaveCount(2)

    // « Moments » is a static launcher — it defaults to « Toujours », so reaching
    // « Jamais » takes two clicks, not one.
    await setNever(page, 'Moments')
    await page.goto('/board')
    await page.locator('.hub').waitFor({ state: 'visible' })
    await expect(page.locator('.now-card--moment')).toHaveCount(0)
  })

  test('the width control resizes the card on the board', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await mockApi(page)
    await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', calm: true })
    await openLayout(page)
    // « À venir » starts one column wide; one click takes it to two.
    const size = rowFor(page, 'À venir').locator('.board-layout__size')
    await expect(size).toContainText('1')
    await size.click()
    await expect(size).toContainText('2')

    await page.setViewportSize({ width: 1280, height: 900 })
    await page.goto('/board')
    await page.waitForSelector('.board-grid .wg-slot')
    await expect(page.locator('.wg-slot[data-card="upcoming"]')).toHaveAttribute('style', /--wg-span-cols: ?2/)
  })

  // Every already-shipped wall tablet carries the v1 `{order, hidden}` shape under the
  // SAME localStorage key. If `reconcile` ever stops reading it, a household silently
  // loses its layout on upgrade — the failure no test would otherwise notice.
  test('a device carrying the OLD v1 layout keeps it after the upgrade', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await mockApi(page)
    await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', calm: true })
    await page.addInitScript(() =>
      localStorage.setItem(
        'babillard-card-prefs',
        JSON.stringify({ order: ['upcoming', 'today'], hidden: ['todos', 'moments'] }),
      ),
    )

    await page.goto('/board')
    await page.waitForSelector('.board-grid .wg-slot')
    // v1 `hidden` → v2 `never`: neither card is mounted at all.
    await expect(page.locator('.wg-slot[data-card="todos"]')).toHaveCount(0)
    await expect(page.locator('.wg-slot[data-card="moments"]')).toHaveCount(0)
    // …and its chosen order survived (« À venir » was pulled ahead of « Aujourd'hui »).
    const order = await page.locator('.board-grid > .wg-slot').evaluateAll((els) =>
      els.map((e) => (e as HTMLElement).dataset.card),
    )
    expect(order.indexOf('upcoming')).toBeLessThan(order.indexOf('today'))
    // The band it never stored is reconstructed, canonically.
    await expect(page.locator('.board-band > .wg-slot[data-card="heroes"]')).toHaveCount(1)

    // The panel reads the migrated value, not the raw one.
    await openLayout(page)
    await expect(rowFor(page, 'Moments').locator('.board-layout__toggle')).toContainText('Jamais')
  })

  test('« Voir dans l’app » on the layout sub opens the board’s own editor', async ({ page }) => {
    // The old per-section « Réorganiser sur le babillard » button became the
    // shared « Voir dans l'app » backlink (SUB_GOTO in lib/settingsNav) — same
    // destination, one pattern for every sub.
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await mockApi(page)
    await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', calm: true })
    await openLayout(page)
    await page.locator('.operator__goto').click()
    await expect(page).toHaveURL(/\/board\?edit=1/)
    await expect(page.locator('.board-edit')).toBeVisible()
  })
})

// ────────────────────── « À régler » kiosk visibility ───────────────────
// A-4 of bmad/10: the card used to be gated `surface === 'mobile'`, hiding it on the
// one always-glanced surface a household shares. It's now `audience === 'parent' &&
// !ro` — visible on a kiosk under the parent lens, still hidden for toddler/guest.

const A_REGLER_SIGNAL = [{ kind: 'birthday', key: 'b1', label: 'Léa', at: BASE + 86400, href: '/cercle' }]

async function stubARegler(page: Page) {
  // Registered AFTER mockApi so this wins over the default empty-signals fixture.
  await page.route('**/api/a-regler**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ signals: A_REGLER_SIGNAL }) }),
  )
}

test.describe('« À régler » kiosk visibility', () => {
  test('the card renders on a kiosk under the parent lens (no longer mobile-only)', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await mockApi(page)
    await stubARegler(page)
    await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', calm: true, surface: 'kiosk' })
    await page.goto('/board')
    await page.locator('.hub').waitFor({ state: 'visible', timeout: 15_000 })
    await expect(page.locator('.now-card--regler')).toBeVisible()
  })

  test('hidden under the toddler lens, even on a kiosk with frictions pending', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await mockApi(page)
    await stubARegler(page)
    await seedState(page, { theme: 'day', audience: 'toddler', lang: 'fr', calm: true, surface: 'kiosk' })
    await page.goto('/board')
    await page.locator('.hub').waitFor({ state: 'visible', timeout: 15_000 })
    await expect(page.locator('.now-card--regler')).toHaveCount(0)
  })

  test('hidden for a read-only guest, even on a kiosk with frictions pending', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await mockApi(page)
    await stubARegler(page)
    await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', calm: true, surface: 'kiosk' })
    await page.addInitScript(() => localStorage.setItem('babillard-guest-preview', '1'))
    await page.goto('/board')
    await page.locator('.hub').waitFor({ state: 'visible', timeout: 15_000 })
    await expect(page.locator('.now-card--regler')).toHaveCount(0)
  })
})

// ───────────────────────────── face lens ───────────────────────────────

test('picking a face re-renders the board, hiding another member’s items', async ({ page }) => {
  await board(page, true) // freeze clock so the timed Garderie event stays live under the lens
  // Maisonnée (everyone): Garderie (Léa, m3) shows in Aujourd'hui.
  await expect(page.locator('.act', { hasText: 'Garderie' })).toBeVisible()
  // Pick Papa (m2) via the mobile profile chip → face picker sheet.
  await page.locator('.profile-chip').click()
  await expect(page.locator('.sheet.show')).toBeVisible()
  await page.locator('.profile-face', { hasText: 'Papa' }).click()
  await expect(page.locator('.greet')).toContainText('Papa')
  // The board re-renders under the lens: an event that's neither Papa's nor shared
  // (Garderie = Léa's) drops out, while a shared, unassigned row stays. (Match by
  // text, not `.act`: under Papa only the one shared timed event remains, so « Le fil
  // du jour » collapses and it surfaces as the Prochainement headline — still visible,
  // just not a plain Act row.)
  await expect(page.locator('.act', { hasText: 'Garderie' })).toHaveCount(0)
  await expect(page.getByText('Rappel: facture')).toBeVisible()
})

// ─────────── D-21 « Sortir le bac » — evening-before chore announce ─────────
// The 86400-day-scale "evening before" line (src/lib/boardModel.ts + migration
// 0109): a chore flagged `announce_evening` due TOMORROW shows a « Ce soir »
// board line tonight. Needs an EVENING frozen clock (MMID + 19h local, distinct
// from the other tests' 04:00-local BASE) since the model gates on timeOfDay.

const DAY = 86400
const EVENING = MMID + 19 * 3600 // 19:00 local — well inside the 'evening' window
const FLAGGED_TITLE = 'Sortir le bac bleu'

// choresUpcoming ChoreInstance whose next occurrence lands exactly on tomorrow's
// local midnight — the model's own match condition.
const flaggedChore = { id: 'bac1', title: FLAGGED_TITLE, color: '#88A36F', at: MMID + DAY, who: null, who_id: null, announce_evening: true }

async function boardWithChoresUpcoming(page: Page, choresUpcoming: unknown[]) {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.clock.setFixedTime(new Date(EVENING * 1000))
  await mockApi(page)
  // Registered AFTER mockApi so this wins over the default BOARD fixture.
  await page.route('**/api/board**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ...BOARD, choresUpcoming }) }),
  )
  await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', calm: true })
  await page.goto('/board')
  await page.locator('.hub').waitFor({ state: 'visible', timeout: 15_000 })
}

test.describe('« Sortir le bac » evening-before announce (D-21)', () => {
  // The SAME chore also legitimately renders as an ordinary « À venir » nav row
  // (a `<button class="act act--nav">`, tappable to its detail) — announce_evening
  // doesn't remove it from there, it only ADDS the evening line. So scope every
  // assertion to `div.act` (a static, non-interactive card — the announce/fête
  // shape, see Act.tsx) rather than the bare `.act` class, which would also match
  // that other, unrelated row.
  const announceRow = (page: Page) => page.locator('div.act', { hasText: FLAGGED_TITLE })

  test('a flagged chore due tomorrow announces itself tonight as « Ce soir »', async ({ page }) => {
    await boardWithChoresUpcoming(page, [flaggedChore])
    const row = announceRow(page)
    await expect(row).toBeVisible()
    await expect(row.locator('.when')).toHaveText('Ce soir')
  })

  test('an UNFLAGGED chore due tomorrow stays silent tonight', async ({ page }) => {
    await boardWithChoresUpcoming(page, [{ ...flaggedChore, announce_evening: false }])
    await expect(announceRow(page)).toHaveCount(0)
  })

  test('a flagged chore due tomorrow stays silent when this device opted out', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.clock.setFixedTime(new Date(EVENING * 1000))
    await mockApi(page)
    await page.route('**/api/board**', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ...BOARD, choresUpcoming: [flaggedChore] }) }),
    )
    // Per-device opt-out (lib/choreAnnounce), same persisted-before-load pattern
    // as the theme/audience seeds below.
    await page.addInitScript(() => localStorage.setItem('babillard-bac', '0'))
    await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', calm: true })
    await page.goto('/board')
    await page.locator('.hub').waitFor({ state: 'visible', timeout: 15_000 })
    await expect(announceRow(page)).toHaveCount(0)
  })

  test('a flagged chore due further out (not tomorrow) stays silent tonight', async ({ page }) => {
    // e.g. the OTHER week of a biweekly rotation — its next occurrence isn't
    // tomorrow, so it must not announce even though the flag is on.
    await boardWithChoresUpcoming(page, [{ ...flaggedChore, at: MMID + 8 * DAY }])
    await expect(announceRow(page)).toHaveCount(0)
  })
})
