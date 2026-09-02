import { test, expect } from '@playwright/test'
import { mockApi, seedState } from './mocks'

// « Je clique du calendrier annuel vers un mois, et rien ne charge » (Marc, 2026-08-28).
//
// The transition itself is sound: the mini-month writes `?date=<local-midnight secs>`
// and Mois derives its window from it. What makes it look broken is the FAILURE state,
// and this surface has a property that makes that unusually costly:
//
//   `MONTH_KEY` has no `live` (browsing is not a glance surface, so it never polls) and
//   the client sets `refetchOnWindowFocus: false`. After its retries are spent, NOTHING
//   retries a failed month fetch. The « Réessayer » button is the only door there is.
//
// So this pins both halves: the happy path actually renders the month you asked for,
// and the failed path always leaves a way out — including offline, which is when a
// person is most likely to be tapping around a calendar that will not load.

test('a mini-month opens THAT month, and asks the server for its window', async ({ page }) => {
  const windows: string[] = []
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.setViewportSize({ width: 390, height: 844 })
  await mockApi(page)
  page.on('request', (r) => {
    const u = new URL(r.url())
    if (u.pathname === '/api/month') windows.push(u.search)
  })
  await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile', boardView: 'annee' })
  await page.goto('/board')
  await page.locator('.yearv').waitFor({ state: 'visible', timeout: 15_000 })

  const before = windows.length
  await page.locator('.yearv__month').nth(3).click()

  // It left the year view for the calendar, and put the month in the URL so the view
  // survives a reload / a peek / a trip to the day page.
  await expect(page.locator('.monthv__grid')).toBeVisible({ timeout: 15_000 })
  await expect(page.locator('.yearv')).toHaveCount(0)
  await expect(page).toHaveURL(/[?&]date=\d+/)
  // …and it fetched a NEW window, not the one it was already showing.
  await expect.poll(() => windows.length, { timeout: 10_000 }).toBeGreaterThan(before)
})

test('a year whose fetch fails says so — never a lying « rien cette année »', async ({ page }) => {
  // The unfixed twin of the month bug (Marc, 2026-09-02: « my calendar doesn't
  // work and can't load until I do a hard refresh »): /api/year failed once,
  // YearView had no error state, so it painted twelve blank mini-months plus a
  // calm "nothing this year" — with no retry door and (no poll on this surface)
  // no automatic retry, ever. Now it wears the same LoadError face as Mois, and
  // « Réessayer » actually recovers once the server does.
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.setViewportSize({ width: 390, height: 844 })
  await mockApi(page)
  await page.route('**/api/year**', (route) => route.fulfill({ status: 500, body: 'nope' }))
  await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile', boardView: 'annee' })
  await page.goto('/board')
  await page.locator('.yearv').waitFor({ state: 'visible', timeout: 15_000 })

  await expect(page.locator('.yearv .load-error')).toBeVisible({ timeout: 20_000 })
  await expect(page.locator('.yearv .load-error button')).toHaveCount(1)
  // The failed read must not masquerade as an empty year.
  await expect(page.locator('.yearv .empty-state')).toHaveCount(0)

  // Server recovers → « Réessayer » brings the year back (mockApi's fixture).
  await page.unroute('**/api/year**')
  await page.locator('.yearv .load-error button').click()
  await expect(page.locator('.yearv .load-error')).toHaveCount(0, { timeout: 20_000 })
})

test('a month whose fetch fails still offers the way out — online', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.setViewportSize({ width: 390, height: 844 })
  await mockApi(page)
  await page.route('**/api/month**', (route) => route.fulfill({ status: 500, body: 'nope' }))
  await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile', boardView: 'annee' })
  await page.goto('/board')
  await page.locator('.yearv').waitFor({ state: 'visible', timeout: 15_000 })
  await page.locator('.yearv__month').nth(3).click()

  await expect(page.locator('.load-error').first()).toBeVisible({ timeout: 20_000 })
  await expect(page.locator('.load-error button'), 'the only door on a non-polling view').toHaveCount(1)
})

test('…and offline too — the surface never polls, so the button is the only recovery', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.setViewportSize({ width: 390, height: 844 })
  await mockApi(page)
  await page.route('**/api/month**', (route) => route.fulfill({ status: 500, body: 'nope' }))
  await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile', boardView: 'annee' })
  await page.goto('/board')
  await page.locator('.yearv').waitFor({ state: 'visible', timeout: 15_000 })
  await page.locator('.yearv__month').nth(3).click()
  await expect(page.locator('.load-error').first()).toBeVisible({ timeout: 20_000 })

  await page.evaluate(() => window.dispatchEvent(new Event('offline')))
  // Quiet, because no signal is weather rather than a surprise…
  await expect(page.locator('.load-error .status-msg')).toHaveCount(0)
  // …but never a dead end. This is the regression the report caught: dropping the
  // button offline left a blank calendar with two grey lines and nothing to tap.
  await expect(page.locator('.load-error button')).toHaveCount(1)
})
