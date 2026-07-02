import { test, expect, type Page } from '@playwright/test'
import { mockApi, seedState, BASE } from './mocks'

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
    await page.goto('/settings')
    await page.locator('.operator__tabs').waitFor({ state: 'visible', timeout: 15_000 })
    await page.getByRole('tab', { name: 'Le babillard' }).click()
    // Two lists now (the fixed band + the reorderable grid) — wait for the first.
    await page.locator('.board-layout').first().waitFor({ state: 'visible' })
  }

  test('hiding a card in Réglages removes it from the Grille; reset brings it back', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await mockApi(page)
    await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', calm: true })
    await openLayout(page)
    // Toggle « À venir » off. The row's toggle button reads "Affiché" while shown.
    const row = page.locator('.board-layout__row', { hasText: 'À venir' })
    const toggle = row.locator('.board-layout__toggle')
    await expect(toggle).toHaveAttribute('aria-pressed', 'true')
    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-pressed', 'false')

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

  test('a fixed top-band card (Moments) is hide-able too — the settings are exhaustive', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await mockApi(page)
    await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', calm: true })
    // The Moments hero is in the top band by default.
    await page.goto('/board')
    await page.locator('.hub').waitFor({ state: 'visible' })
    await expect(page.locator('.now-card--moment')).toBeVisible()
    // Hide it from the band group (show/hide only — no drag grip on these rows).
    await openLayout(page)
    // The band group lists every fixed card: Notes, Ce soir + météo, Mots, À régler,
    // Moments (Mots — « Laisse un mot » — joined the band after this spec was written).
    await expect(page.locator('.board-layout__row--fixed')).toHaveCount(5)
    const row = page.locator('.board-layout__row--fixed', { hasText: 'Moments' })
    await expect(row.locator('.dnd-grip')).toHaveCount(0) // band rows don't drag
    await row.locator('.board-layout__toggle').click()
    // Gone from the board; « À régler »/heroes are unaffected (independent toggles).
    await page.goto('/board')
    await page.locator('.hub').waitFor({ state: 'visible' })
    await expect(page.locator('.now-card--moment')).toHaveCount(0)
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
