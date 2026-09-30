import { test, expect } from '@playwright/test'
import { mockApi, seedState, BOARD, BASE, MMID } from './mocks'

// A BIRTHDAY WITH A GIFT IDEA WEARS THE GIFT (2026-09-30). « À régler » already nags about
// a fête two weeks out with NO idea; the other half — « there is one » — only showed after
// a tap. The row's picture says it now: the gift instead of the cake, nothing added to the
// row's words. Checked on « À venir », where a birthday sits for the days before it.
const DAY = 86_400

test('a birthday with a gift idea wears the gift; one without keeps the cake', async ({ page }) => {
  await page.clock.setFixedTime(new Date((MMID + 12 * 3600) * 1000))
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await mockApi(page, {
    overrides: {
      board: {
        ...BOARD,
        upcoming: [
          { id: 'bd1', title: 'Fête de Léa', start_at: BASE + 4 * DAY, all_day: 1, member_id: 'm3', birthday: true, gift_ideas: 'Vélo, casque' },
          { id: 'bd2', title: 'Fête de Noah', start_at: BASE + 6 * DAY, all_day: 1, member_id: 'm4', birthday: true, gift_ideas: null },
        ],
      },
    },
  })
  await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', calm: true })
  await page.goto('/board')
  const card = page.locator('.wg-slot[data-card="upcoming"]')
  const row = (title: string) => card.locator('.act', { hasText: title }).locator('.tile')
  await expect(row('Fête de Léa')).toHaveAttribute('data-icon', 'gift-bold', { timeout: 15_000 })
  await expect(row('Fête de Noah')).toHaveAttribute('data-icon', 'cake-bold')
})
