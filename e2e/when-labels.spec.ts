import { test, expect } from './fixtures'
import { CAR, MMID } from './mocks'

// Review #12 (2026-11-17), Mélanie: three small lies about WHEN.
//   · « Quel jour ? » listed « mardi … lundi mardi mercredi jeudi », no dates;
//   · an all-day rendez-vous taking the car read « 0 h 00–0 h 00 » on /voiture;
//   · a shared `/board?view=week` landed on the grid without a word.

const DAY = 86_400

test('?view=week opens « La semaine »', async ({ app, page }) => {
  await app.boot({ route: '/board?view=week', wait: '.hub' })
  await expect(page.locator('.weekv')).toBeVisible()
})

test('the meal day picker dates every chip past tomorrow; no two alike', async ({ app, page }) => {
  // The mock's meal window starts on its fixed anchor day: the clock stands there too.
  await app.boot({ route: '/kitchen?plus=meal', wait: '.hub', clock: 'BASE' })
  const chips = page.locator('.addsheet__days button')
  await expect(chips.first()).toHaveText('Aujourd’hui')
  await expect(chips.nth(1)).toHaveText('Demain')
  await expect(chips.nth(2)).toHaveText(/^\p{Lu}\p{L}+ \d{1,2}$/u)
  const labels = await chips.allTextContents()
  expect(labels.length).toBeGreaterThan(7)
  expect(new Set(labels).size).toBe(labels.length)
})

test('an all-day rendez-vous that takes the car reads « Toute la journée »', async ({ app, page }) => {
  const d = MMID + 2 * DAY
  const car = {
    ...CAR,
    days: CAR.days.map((day) =>
      day.day === d
        ? {
            ...day,
            carSpans: [{ start: d, end: d + DAY, label: 'École de la vue', holderId: 'm1' }],
            rides: day.rides.map((r) => ({ ...r, title: 'École de la vue', at: d, allDay: 1 })),
          }
        : day,
    ),
  }
  await app.boot({ route: '/voiture', api: { overrides: { car } } })
  const row = page.locator('.voiture__day').filter({ hasText: 'École de la vue' })
  await expect(row.locator('.voiture__day-window')).toHaveText('Toute la journée')
  await expect(row).not.toContainText('0 h 00–0 h 00')
})
