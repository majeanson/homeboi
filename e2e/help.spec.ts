import { test, expect } from '@playwright/test'
import { mockApi, seedState } from './mocks'

// Contextual help: the section identity disc (SectionAvatar, class `.avatar--help`
// with a corner "?" pip — HelpDot folded into the icon) deep-links into the Guide
// at the matching card; an Expert switch in Réglages ▸ Affichage hides the help
// affordance. Both run frontend-only against mocked APIs.

async function boot(page: import('@playwright/test').Page, path: string) {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await mockApi(page)
  await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile' })
  // Keep the first-login guided tour from auto-navigating to /board mid-test (it
  // races a /settings navigation and yanks the page off it — see lib/tour.tsx).
  await page.addInitScript(() => {
    try {
      localStorage.setItem('babillard-tours-seen', JSON.stringify(['essentials']))
    } catch {
      /* noop */
    }
  })
  await page.goto(path)
  await page.locator('.hub, .operator').first().waitFor({ state: 'visible', timeout: 15_000 })
}

test('the contextual ? deep-links into the matching Guide card', async ({ page }) => {
  await boot(page, '/kitchen')
  const dot = page.locator('.avatar--help').first()
  await expect(dot).toBeVisible()
  await dot.click()
  // The ?card= deep-link homes onto the card's THEMED Réglages tab (Comprendre
  // lens); the card param is consumed (replaced), pinning tab+lens in the URL.
  await expect(page).toHaveURL(/\/settings\?tab=kitchen&lens=comprendre$/)
  // The Kitchen card is the one opened + highlighted, scrolled into view.
  const target = page.locator('.guide__card.is-target')
  await expect(target).toBeVisible()
  await expect(target).toHaveAttribute('open', '')
  await expect(target).toContainText('cuisine')
})

// Wave H (F5×D7): the « Mots » board card now carries an in-place « ? » help entry —
// arm the board's help mode, tap the card title, get a bubble that deep-links to the
// mots guide card. (Mots is a Section/div card, so the armed title explains in place
// rather than navigating.)
test('board ? explains « Mots » in place and links to its guide', async ({ page }) => {
  // Same setup as boot(), but slot in a per-test « Mots » override AFTER mockApi's
  // catch-all (Playwright tries the last-registered route first) so one waiting
  // family-wide mot makes the card render at rest — every OTHER board spec's snapshots
  // stay untouched (the default /api/mots still returns empty there).
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await mockApi(page)
  await page.route('**/api/mots**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        mots: [
          {
            id: 'mo1', member_id: null, author_member_id: 'm2', text: 'Bonne journée !',
            media_kind: null, media_key: null, scene_key: null, created_at: 1_749_369_600,
            updated_at: null, opened_at: null, saved_at: null, surface_at: null, reply_to: null,
          },
        ],
      }),
    }),
  )
  await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile' })
  await page.addInitScript(() => {
    try {
      localStorage.setItem('babillard-tours-seen', JSON.stringify(['essentials']))
    } catch {
      /* noop */
    }
  })
  await page.goto('/board')
  await page.locator('.hub').first().waitFor({ state: 'visible', timeout: 15_000 })
  // Arm the board's help mode (the round "?" toggle in the header).
  const toggle = page.locator('.help-toggle').first()
  await expect(toggle).toBeVisible()
  await toggle.click()
  // The « Mots » card title is now a help target; tapping it explains the card in place.
  const title = page.locator('.help-title', { hasText: 'Mots' })
  await expect(title).toBeVisible()
  await title.click()
  // The armed title renders the bubble both beside the card and at board level — take the first.
  const bubble = page.locator('.help-bubble').first()
  await expect(bubble).toBeVisible()
  // « Voir le guide » deep-links to the mots guide card (no navigation off the board first).
  await bubble.locator('.help-bubble__guide').click()
  await expect(page).toHaveURL(/card=mots/)
})

test('tutorial vs expert mode shows / hides the ? dots', async ({ page }) => {
  // Tutorial is the default: the dot shows.
  await boot(page, '/liste')
  await expect(page.locator('.avatar--help')).toHaveCount(1)

  // Flip to expert in Réglages ▸ Affichage.
  await page.goto('/settings?tab=display')
  await page.locator('.operator__tabs').waitFor({ state: 'visible' })
  await page.getByRole('button', { name: /Expert/ }).click()

  // Back on a hub page, every dot is gone.
  await page.goto('/liste')
  await page.locator('.hub').first().waitFor({ state: 'visible' })
  await expect(page.locator('.avatar--help')).toHaveCount(0)
})
