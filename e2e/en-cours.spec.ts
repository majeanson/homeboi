import { test, expect } from '@playwright/test'
import { mockApi, seedState, BOARD, BASE } from './mocks'
import { boxOf } from './measure'

// The board lifecycle's two softenings (PLAN-mots B2 + B3, accepted 2026-09-25):
//
//   B2 « En cours » — a rendez-vous with a « Jusqu'à » (end_at) used to be binary on the
//   flat « Aujourd'hui » list: full strength, then STRUCK the moment it started (the Fil
//   already waited for its end). Now it carries a static accent while its window spans
//   now, and strikes only once it has ended.
//
//   B3 the « maintenant » line — the Fil had a quiet now-divider between past and
//   future rows; the plain list did not. It now sits above the struck rows, so both
//   surfaces read « past below, next above » the same way — and only when something is
//   behind us.
//
// The clock is frozen (page.clock) so "now" is a fact of the fixture, not of the hour
// the suite happens to run.

const HOUR = 3600
// 13:00 local on BASE's day (BASE is 04:00 local): breakfast's slot is behind us, so the
// fixture's « Crêpes » is a struck row; supper is the hero and never strikes.
const ONE_PM = BASE + 9 * HOUR

function board(today: object[]) {
  return JSON.stringify({ ...BOARD, today })
}

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await mockApi(page)
  await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile' })
})

test('a rendez-vous whose window spans now reads « en cours », not struck — and the now-line sits above the past rows', async ({ page }) => {
  // ONE timed event keeps the card on the plain list (the Fil takes over at two).
  // Started 45 min ago, ends in 30 min: live. Not « Prochainement » either: that selector
  // keeps a start up to 30 min behind us (BOARD_NEXTUP's grace, a 'just started' still
  // reads as next), so a window past that grace is a list row.
  await page.route('**/api/board', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: board([{ id: 'live', title: 'Réunion de parents', start_at: ONE_PM - 45 * 60, end_at: ONE_PM + HOUR / 2, all_day: 0, member_id: null }]),
    }),
  )
  await page.clock.setFixedTime(ONE_PM * 1000)
  await page.goto('/board')
  const card = page.locator('.wg-slot[data-card="today"]')
  await card.waitFor({ state: 'visible', timeout: 15_000 })

  const live = card.locator('.act--live')
  await expect(live).toHaveCount(1)
  await expect(live).toContainText('Réunion de parents')
  // Red against striking at start_at (the old rule): the same row would carry act--past.
  await expect(card.locator('.act--past', { hasText: 'Réunion de parents' })).toHaveCount(0)

  // The breakfast is behind us → struck; the now-line divides live from past.
  const past = card.locator('.act--past', { hasText: 'Crêpes' })
  await expect(past).toHaveCount(1)
  const line = card.locator('.fil__now')
  await expect(line).toHaveCount(1)
  await expect(line).toContainText('13')
  const [l, n, p] = await Promise.all([boxOf(live), boxOf(line), boxOf(past)])
  expect(n.y, 'the now-line sits below the live row').toBeGreaterThan(l.y + l.height - 1)
  expect(p.y, 'and above the struck row').toBeGreaterThan(n.y + n.height - 1)
})

test('with nothing behind us there is no line to draw', async ({ page }) => {
  await page.route('**/api/board', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: board([{ id: 'later', title: 'Soccer', start_at: BASE + 5 * HOUR, all_day: 0, member_id: null }]),
    }),
  )
  // 04:00 local: nothing has happened yet, no meal slot has closed.
  await page.clock.setFixedTime(BASE * 1000)
  await page.goto('/board')
  const card = page.locator('.wg-slot[data-card="today"]')
  await card.waitFor({ state: 'visible', timeout: 15_000 })
  await expect(card.locator('.act--past')).toHaveCount(0)
  await expect(card.locator('.fil__now')).toHaveCount(0)
})

test('on the Fil, a started-but-unfinished window is neither dimmed nor struck; an ended one is both', async ({ page }) => {
  // Three timed events → the ribbon. The ribbon's own `until` already knew the end; the
  // row inside it now agrees (act--live), and an ENDED window dims + strikes together.
  await page.route('**/api/board', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: board([
        { id: 'ended', title: 'Dentiste', start_at: ONE_PM - 3 * HOUR, end_at: ONE_PM - 2 * HOUR, all_day: 0, member_id: null },
        { id: 'live', title: 'Réunion de parents', start_at: ONE_PM - HOUR / 2, end_at: ONE_PM + HOUR / 2, all_day: 0, member_id: null },
        { id: 'later', title: 'Soccer', start_at: ONE_PM + 4 * HOUR, all_day: 0, member_id: null },
      ]),
    }),
  )
  await page.clock.setFixedTime(ONE_PM * 1000)
  await page.goto('/board')
  const fil = page.locator('.wg-slot[data-card="today"] .fil')
  await fil.waitFor({ state: 'visible', timeout: 15_000 })

  const liveRow = fil.locator('.fil__row', { hasText: 'Réunion de parents' })
  await expect(liveRow).not.toHaveClass(/fil__row--past/)
  await expect(liveRow.locator('.act--live')).toHaveCount(1)
  await expect(liveRow.locator('.act--past')).toHaveCount(0)

  const endedRow = fil.locator('.fil__row', { hasText: 'Dentiste' })
  await expect(endedRow).toHaveClass(/fil__row--past/)
  await expect(endedRow.locator('.act--past')).toHaveCount(1)
  await expect(endedRow.locator('.act--live')).toHaveCount(0)
})
