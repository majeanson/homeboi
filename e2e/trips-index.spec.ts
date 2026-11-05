import { test, expect } from './fixtures'

// « Tous les voyages » (solidify 4.4): the board card shows three rows, so a trip that is
// over or a fourth idea had no list at all. Coming trips lead, what is over folds away.
const DAY = 86_400
const now = Math.floor(Date.now() / 1000)
const trip = (id: string, title: string, start: number | null, end: number | null) => ({
  id, title, destination: null, start_at: start, end_at: end, media_key: null, created_at: 1_700_000_000,
})
const trips = {
  trips: [
    trip('soon', 'Gaspésie', now + 10 * DAY, now + 14 * DAY),
    trip('over', 'Floride', now - 60 * DAY, now - 50 * DAY),
    trip('idea', 'Japon un jour', null, null),
  ],
}

test('coming trips and ideas lead, a past trip folds away, a row opens its trip', async ({ page, app }) => {
  await app.boot({ route: '/voyage', api: { overrides: { trips } }, wait: '.listrow' })
  await expect(page.locator('.listrow')).toHaveCount(2)
  await expect(page.locator('.scene__body')).not.toContainText('Floride')
  await page.getByRole('button', { name: 'Voyages passés' }).click()
  await expect(page.locator('.scene__body')).toContainText('Floride')
  await page.locator('.listrow', { hasText: 'Gaspésie' }).click()
  await expect(page).toHaveURL(/\/voyage\/soon/)
})

test('no trip at all says so and offers the door', async ({ page, app }) => {
  await app.boot({ route: '/voyage', api: { overrides: { trips: { trips: [] } } }, wait: '.scene__body' })
  await expect(page.locator('.scene__body')).toContainText('Aucun voyage')
  await expect(page.locator('.scene__body a[href="/voyage/new"]')).toBeVisible()
})
