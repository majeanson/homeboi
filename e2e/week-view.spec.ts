import { test, expect } from '@playwright/test'
import { mockApi, seedState } from './mocks'

// « La semaine » — the third calendar face (src/components/board/WeekView.tsx).
//
// The app could show a day, a month and a year; the unit a household actually plans
// in had no glance. What makes this view worth existing is that it has room for the
// WORDS a month cell cannot afford — so the assertions here are mostly about words
// being present and legible, not about the grid being correct (the month's own specs
// already cover the payload, and both views read it through the same `linesFor`).

// The board fixture's clock is pinned by the app, so anchor the week on the browser's
// own local midnights — the same thing WeekView does. SEVEN of them, each computed by
// the calendar (`setDate`), never `day0 + i * 86_400`: a DST day is 23 or 25 h long,
// so a fixed day off a local midnight lands at 23:00 the night before — which is how
// this spec went red on the 2026-10-30 run (the week that holds Nov 1) while the app
// was right. The documented trap in CLAUDE.md (« Day arithmetic on a local midnight »).
const monthWindow = (days: number[]) => ({
  events: [
    { id: 'e1', title: 'Rendez-vous dentiste', at: days[0] + 9 * 3600, all_day: 0, member_id: 'm3', day: days[0] },
    { id: 'e2', title: 'Souper chez Mamie', at: days[2], all_day: 1, member_id: null, day: days[2] },
  ],
  meals: [{ id: 'm1', slot: 'supper', title: 'Spaghetti maison', cook_member_id: 'm1', day: days[0] }],
  chores: [],
  dayNotes: [],
  todos: [],
  homeProjects: [],
  trips: [],
  tripPlans: [],
  // A daily habit on EVERY day of the window. It must not appear on any row: a habit is
  // not a marker (dayLines `markersFor`) — the week shipped listing it seven times.
  habits: Array.from({ length: 7 }, (_, i) => ({
    id: `hb${i}`,
    habit_id: 'h1',
    title: 'Boire assez d’eau',
    icon: '💧',
    colour: null,
    kind: 'do',
    member_id: null,
    day: days[i],
    done: i % 2 === 0,
  })),
  transfers: [],
})

test('the week spells its days out, and each row is a link into that day', async ({ page }) => {
  const days = await page.evaluate(() => {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    return Array.from({ length: 7 }, (_, i) => {
      const x = new Date(d)
      x.setDate(d.getDate() + i)
      return Math.floor(x.getTime() / 1000)
    })
  })
  await mockApi(page, { overrides: { month: monthWindow(days) } })
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

  // A free day says so, once and quietly — and it IS free, even though the fixture puts
  // a daily habit on it: habits are not markers on a glance surface. The bug this pins
  // (2026-09-16) listed « Boire assez d’eau » on all seven rows.
  await expect(rows.nth(1).locator('.weekv__free')).toBeVisible()
  await expect(page.locator('.weekv__day')).not.toContainText(['Boire assez d’eau'])
  await expect(page.locator('.weekv__line', { hasText: 'Boire assez d’eau' })).toHaveCount(0)

  // Every row is a real LINK to the ONE day door — not a div with an onClick. It has
  // to survive a middle-click and a keyboard, and be announced as a link (ACTIONS.md).
  const href = await rows.first().locator('a').getAttribute('href')
  expect(href).toBe(`/kitchen/day/${days[0]}`)
  await expect(rows.nth(3).locator('a')).toHaveAttribute('href', `/kitchen/day/${days[3]}`)
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
