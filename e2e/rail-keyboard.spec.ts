import { test, expect } from '@playwright/test'
import { MMID, mockApi, seedState } from './mocks'

// A SIDEWAYS ROW THAT OVERFLOWS MUST BE REACHABLE WITHOUT A THUMB.
//
// Every `Rail` here hides its scrollbar for calm, so on a desktop there is no bar to
// drag and no swipe. `useHScroll` already fixed the MOUSE half — it maps a vertical
// wheel onto the horizontal scroll. The KEYBOARD half was missing: a scroll container
// that is not focusable cannot be scrolled by arrow keys at all, so whatever sits past
// the right edge was unreachable for anyone not using a pointer.
//
// Found 2026-09-15 by the axe pass in `npm run e2e:matrix`
// (`scrollable-region-focusable`, serious) on `virements-day` → `.rail`: the plan
// card's row of upcoming due dates, which overflows at phone width.
//
// The fix is deliberately CONDITIONAL — a rail is a tab stop only while it actually
// overflows. Making every rail focusable would hand a keyboard user a pile of stops
// that scroll nothing, which is its own accessibility problem, and `useHScroll` already
// measures exactly this.

const DAY = 86_400
const PLAN = {
  id: 'p1',
  title: 'Hypothèque',
  amountCents: 81282,
  recur: { freq: 'weekly', interval: 2 },
  anchorAt: MMID - 14 * DAY,
  shares: { m1: 25641, m2: 55641 },
  catchup: null,
  colour: null,
  position: 0,
  note: null,
  due: [MMID, MMID + 14 * DAY, MMID + 28 * DAY, MMID + 42 * DAY],
  projection: null,
}

// The card shows the next four due dates, so the DATA decides whether the row
// overflows — not the viewport (the plan card is width-capped, so a wall tablet
// overflows exactly as a phone does). Four dates overrun the card; two fit.
async function openVirements(page: import('@playwright/test').Page, due: number[]) {
  await page.setViewportSize({ width: 390, height: 844 })
  await mockApi(page)
  await page.route('**/api/transfer**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ today: MMID, plans: [{ ...PLAN, due }], transfers: [] }),
    }),
  )
  await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile' })
  await page.goto('/notes?section=virements')
  await expect(page.locator('.virements__plan')).toBeVisible()
}

test('an overflowing rail is a tab stop, and arrow keys scroll it', async ({ page }) => {
  await openVirements(page, PLAN.due)
  const rail = page.locator('.virements__dates')
  await expect(rail).toBeVisible()

  // Guard against a false pass: if the fixture stopped overflowing, everything below
  // would be vacuously true.
  const overflows = await rail.evaluate((el) => el.scrollWidth - el.clientWidth > 1)
  expect(overflows, 'the fixture actually produced an overflowing rail to test').toBe(true)

  await expect(rail).toHaveAttribute('tabindex', '0')

  // Focus it the way a keyboard user would reach it, then drive it with the arrows —
  // which is precisely what a non-focusable scroll container cannot do.
  await rail.focus()
  await expect(rail).toBeFocused()
  const before = await rail.evaluate((el) => el.scrollLeft)
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowRight')
  await expect
    .poll(() => rail.evaluate((el) => el.scrollLeft), { message: 'arrow keys move a focused rail' })
    .toBeGreaterThan(before)

  // …and it is named, so landing on it says what it is rather than "group".
  await expect(rail).toHaveAttribute('aria-label', /date/i)
})

test('a rail that fits is NOT a tab stop — no stop that scrolls nothing', async ({ page }) => {
  await openVirements(page, [MMID])
  const rail = page.locator('.virements__dates')
  await expect(rail).toBeVisible()

  const overflows = await rail.evaluate((el) => el.scrollWidth - el.clientWidth > 1)
  expect(overflows, 'a single date fits the card, so there is nothing to scroll to').toBe(false)
  await expect(rail).not.toHaveAttribute('tabindex', '0')
})
