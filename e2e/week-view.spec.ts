import { test, expect } from '@playwright/test'
import { mockApi, seedState } from './mocks'

// « La semaine » — the third calendar face (src/components/board/WeekView.tsx).
//
// The app could show a day, a month and a year; the unit a household actually plans
// in had no glance. What makes this view worth existing is that it has room for the
// WORDS a month cell cannot afford — so the assertions here are mostly about words
// being present and legible, not about the grid being correct (the month's own specs
// already cover the payload, and both views read it through the same `linesFor`).

const DAY = 86_400
// The board fixture's clock is pinned by the app, so anchor the week on the browser's
// own local midnight — the same thing WeekView does.
const monthWindow = (day0: number) => ({
  events: [
    { id: 'e1', title: 'Rendez-vous dentiste', at: day0 + 9 * 3600, all_day: 0, member_id: 'm3', day: day0 },
    { id: 'e2', title: 'Souper chez Mamie', at: day0 + 2 * DAY, all_day: 1, member_id: null, day: day0 + 2 * DAY },
  ],
  meals: [{ id: 'm1', slot: 'supper', title: 'Spaghetti maison', cook_member_id: 'm1', day: day0 }],
  chores: [],
  dayNotes: [],
  todos: [],
  homeProjects: [],
  trips: [],
  tripPlans: [],
  habits: [],
  transfers: [],
})

test('the week spells its days out, and each row is a link into that day', async ({ page }) => {
  const day0 = await page.evaluate(() => {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    return Math.floor(d.getTime() / 1000)
  })
  await mockApi(page, { overrides: { month: monthWindow(day0) } })
  await seedState(page, { theme: 'day', lang: 'fr', surface: 'mobile', boardView: 'semaine' })
  await page.goto('/board')

  const rows = page.locator('.weekv__day')
  // Seven days, always — a week is a fixed window, not "the days that have something".
  // Collapsing the empty ones is how a glance stops being able to say « jeudi is free ».
  await expect(rows).toHaveCount(7)

  // The WORDS. A title that only rendered as a dot would mean this view had become a
  // narrow month, which is the one thing it must not be.
  await expect(rows.first()).toContainText('Rendez-vous dentiste')
  await expect(rows.first()).toContainText('Spaghetti maison')
  // …and the clock face on a timed thing, absent on an all-day one.
  await expect(rows.first().locator('.weekv__time')).toHaveCount(1)
  await expect(rows.nth(2).locator('.weekv__time')).toHaveCount(0)
  await expect(rows.nth(2)).toContainText('Souper chez Mamie')

  // A free day says so, once and quietly.
  await expect(rows.nth(1).locator('.weekv__free')).toBeVisible()

  // Every row is a real LINK to the ONE day door — not a div with an onClick. It has
  // to survive a middle-click and a keyboard, and be announced as a link (ACTIONS.md).
  const href = await rows.first().locator('a').getAttribute('href')
  expect(href).toBe(`/kitchen/day/${day0}`)
  await expect(rows.nth(3).locator('a')).toHaveAttribute('href', `/kitchen/day/${day0 + 3 * DAY}`)
})

test('stepping a week moves the window and names where you landed', async ({ page }) => {
  await mockApi(page)
  await seedState(page, { theme: 'day', lang: 'fr', surface: 'mobile', boardView: 'semaine' })
  await page.goto('/board')

  const title = page.locator('.weekv .monthv__title')
  const first = await title.textContent()
  // « Cette semaine » is not offered while you are on it — it holds its slot instead
  // (visibility), so the arrows never move under a finger mid-tap.
  await expect(page.locator('.weekv .monthv__today.is-hidden')).toHaveCount(1)

  await page.locator('.weekv .monthv__nav').last().click()
  await expect(title).not.toHaveText(first ?? '')
  // …and now the way back is offered.
  await expect(page.locator('.weekv .monthv__today')).not.toHaveClass(/is-hidden/)

  await page.locator('.weekv .monthv__today').click()
  await expect(title).toHaveText(first ?? '')
})

test('the view survives a reload — it is this device’s chosen glance', async ({ page }) => {
  await mockApi(page)
  await seedState(page, { theme: 'day', lang: 'fr', surface: 'mobile' })
  await page.goto('/board')

  // Pick it from the toggle rather than seeding it, so this covers the SAVE too.
  await page.locator('.boardview__opt', { hasText: 'La semaine' }).click()
  await expect(page.locator('.weekv')).toBeVisible()

  await page.reload()
  await expect(page.locator('.weekv')).toBeVisible()
})
