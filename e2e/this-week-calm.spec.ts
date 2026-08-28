import { test, expect } from '@playwright/test'
import { mockApi, seedState } from './mocks'

// « Cette semaine ensemble » widens the chore-ledger pattern to the whole household, and
// inherits its one hard rule: it says WHO, never HOW MANY. No tally, no ranking, no
// streak, no score (NFR-CALM-1) — the file says so at the top, and until now nothing
// held it there. The section rendered in the screenshot sweep, but nothing ever
// ASSERTED faces-not-counts (REVIEW-PASS « e2e gaps »), so a well-meaning "3 corvées
// cette semaine" could have landed without a single test objecting.
//
// The fixture deliberately gives one chore THREE helpers and repeats a face across
// rows: that is exactly the shape that tempts a summary number.

const face = (id: string, name: string, colour: string) => ({
  memberId: id, name, avatarKind: 'color', avatarRef: colour, colour,
})

const WEEK = {
  ahead: { meals: [], events: [], birthdays: [], work: [], projects: [] },
  behind: {
    chores: [
      { date: 0, choreTitle: 'Vaisselle', choreColor: '#88a36f', helpers: [face('m1', 'Léa', '#88a36f'), face('m2', 'Bo', '#c2563a'), face('m3', 'Cy', '#2a8f85')] },
      { date: 0, choreTitle: 'Recyclage', choreColor: '#c2563a', helpers: [face('m1', 'Léa', '#88a36f')] },
    ],
    routines: [{ name: 'Matin', who: 'm2', face: face('m2', 'Bo', '#c2563a') }],
    projects: [],
  },
}

test('« Cette semaine » shows WHICH faces helped — and never a count', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.setViewportSize({ width: 390, height: 844 })
  await mockApi(page)
  await page.route('**/api/this-week**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(WEEK) }),
  )
  await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile' })
  await page.goto('/settings?tab=board&lens=regler&sub=thisweek')
  await page.locator('.operator').waitFor({ state: 'visible', timeout: 15_000 })

  const week = page.locator('.tweek')
  await expect(week).toBeVisible({ timeout: 15_000 })

  // The faces are the content: three helpers on the first chore, named, not tallied.
  const firstChore = week.locator('.tweek__row--faces', { hasText: 'Vaisselle' })
  await expect(firstChore.locator('.ledger__helper')).toHaveCount(3)
  await expect(firstChore).toContainText('Léa')
  await expect(firstChore).toContainText('Bo')
  await expect(firstChore).toContainText('Cy')

  // A face repeating across rows must NOT become a per-person total anywhere.
  await expect(week.locator('.tweek__row--faces', { hasText: 'Recyclage' }).locator('.ledger__helper')).toHaveCount(1)

  // THE CALM ASSERTION: no bare number anywhere in the week block. Dates carry digits,
  // so this section is checked with none in the fixture — every digit here would be a
  // tally, a rank or a score, which is exactly what this surface may never grow.
  const text = (await week.innerText()).replace(/\s+/g, ' ')
  expect(text, `no count/tally/rank may appear: "${text}"`).not.toMatch(/\d/)
})
