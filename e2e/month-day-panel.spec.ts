import { test, expect, type Page } from '@playwright/test'
import { mockApi, seedState } from './mocks'

// The Mois (calendar) day panel — the surface behind two reported frictions:
//
//  1. It carried TWO near-identical doors, « Voir la journée » (the editable day page)
//     and « Voir ce moment » (the same day, read-only, in the retired « Moments »
//     scene). One door now.
//  2. The six-week grid plus a six-item legend pushed the whole panel below the fold,
//     so tapping a date changed something you couldn't see. The grid is now capped
//     against the viewport and picking a day scrolls the panel into view.
//
// Frontend-only harness (Vite + stubbed /api/**), same as the other board specs.

// The reported viewport: a tall phone/small tablet in the 520–900px band, which had no
// cell-height cap at all before this pass.
const REPORTED = { width: 660, height: 1176 }
const PHONE = { width: 390, height: 844 }
// Past the 900px breakpoint, where the calendar and the day sit side by side.
const WIDE = { width: 1280, height: 900 }

// The cell to hang the fixture on. Deliberately mid-grid and therefore IN-month: tapping
// an out-of-month cell moves the calendar to that month, which re-requests /api/month
// with a new `from` — and since this stub is relative to `from`, the seeded things would
// land somewhere else entirely and the assertions would chase a moving target.
const SEED_IDX = 20
// Answer /api/month with two named things on that cell, whatever window the
// calendar asks for. The shared fixture's month rows sit on a frozen date that no longer
// falls inside the live window, so it renders an empty grid — fine for the layout tests
// above, useless for anything about what a cell SAYS. Registered after mockApi so it wins
// (Playwright tries routes newest-first).
const EVENT_TITLE = 'Dentiste'
const MEAL_TITLE = 'Pâté chinois'
async function seedMonthOnCell(page: Page) {
  const DAY = 86400
  await page.route('**/api/month**', async (route) => {
    const from = Number(new URL(route.request().url()).searchParams.get('from'))
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        events: [
          { id: 'ev1', title: EVENT_TITLE, at: from + SEED_IDX * DAY + 14 * 3600, all_day: 0, member_id: null, day: from + SEED_IDX * DAY },
        ],
        meals: [{ id: 'ml1', slot: 'souper', title: MEAL_TITLE, cook_member_id: null, day: from + SEED_IDX * DAY }],
        chores: [],
        dayNotes: [],
        todos: [],
        homeProjects: [],
        trips: [],
        tripPlans: [],
        habits: [],
      }),
    })
  })
}

async function mois(page: Page, viewport = REPORTED) {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.setViewportSize(viewport)
  await mockApi(page)
  await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', calm: true, boardView: 'month' })
  await page.goto('/board')
  await page.locator('.monthv').waitFor({ state: 'visible', timeout: 15_000 })
}

test.describe('Mois — the day panel', () => {
  test('offers ONE door into the day, and it opens the day page', async ({ page }) => {
    await mois(page)
    const panel = page.locator('.monthv__day')
    // « Voir ce moment » is gone with « Moments »; « Voir la journée » is the one way in.
    await expect(panel.getByRole('button', { name: /Voir ce moment/ })).toHaveCount(0)
    const door = panel.locator('.monthv__open-day')
    await expect(door).toHaveCount(1)

    await door.click()
    // /kitchen/day/<local-midnight secs> — the editable day, not a read-only recap.
    await page.waitForURL(/\/kitchen\/day\/\d+/)
    await expect(page.locator('.scene')).toBeVisible()
  })

  test('picking a date brings the panel into view instead of leaving it below the fold', async ({ page }) => {
    await mois(page)
    const panel = page.locator('.monthv__day')

    // Tap a date in the last week row — the furthest point down the grid, i.e. the
    // worst case for the panel sitting off screen.
    const cells = page.locator('.monthv__cell')
    await cells.nth((await cells.count()) - 3).click()

    // The panel's header must now be inside the viewport: this is the regression guard.
    // `toPass` absorbs the smooth-scroll settling (reduced motion makes it instant, but
    // the assertion shouldn't depend on that).
    await expect(async () => {
      const box = await panel.locator('.monthv__day-h').boundingBox()
      expect(box).not.toBeNull()
      expect(box!.y).toBeGreaterThanOrEqual(0)
      expect(box!.y + box!.height).toBeLessThanOrEqual(REPORTED.height)
    }).toPass({ timeout: 5_000 })
  })

  // The cell cap is a `max-height` budgeted off the viewport. It only ever SHRINKS, so
  // most sizes are untouched — what it exists for is the WIDE-BUT-SHORT window in the
  // 520–900px band, where seven square columns grew tall enough that the six-week grid
  // alone was taller than the screen. Measured on this harness before the cap:
  //   390×844 → 37% of the viewport      660×1176 → 46%      820×1180 → 57%
  //   860×820 → 86%                      880×700  → 103%  ← the grid outgrew the page
  // and after it, 880×700 and 860×820 both come down to 60% while the rest don't move.
  // (Note 660×1176 — the reported case — was never the cells: there the day panel was
  // pushed down by the STACK above it, which is what the scroll-into-view test covers.)
  test('the six-week grid never outgrows the screen, phone through kiosk', async ({ page }) => {
    for (const viewport of [
      { width: 390, height: 844 },
      REPORTED,
      { width: 820, height: 1180 },
      { width: 860, height: 820 },
      { width: 880, height: 700 },
      { width: 1280, height: 900 },
    ]) {
      await mois(page, viewport)
      const grid = await page.locator('.monthv__grid').boundingBox()
      expect(grid, `grid missing at ${viewport.width}px`).not.toBeNull()
      expect(
        grid!.height / viewport.height,
        `the grid claims too much of a ${viewport.width}×${viewport.height} screen`,
      ).toBeLessThan(0.75)
      // …and a cell stays a real tap target at every width.
      const cell = await page.locator('.monthv__cell').first().boundingBox()
      expect(cell!.height, `cells too small at ${viewport.width}px`).toBeGreaterThanOrEqual(38)
    }
  })

  // ── The pinned drawer ───────────────────────────────────────────────────────────
  // Stronger than the scroll-into-view guard above: below 900px the panel is sticky to
  // the bottom of the scrollport, so the picked day is on screen with NO scrolling at
  // all — including right after tapping the furthest cell down the grid.
  test('on a phone the day stays pinned on screen, with no scrolling', async ({ page }) => {
    await mois(page, PHONE)
    const cells = page.locator('.monthv__cell')
    await cells.nth((await cells.count()) - 3).click()
    const head = await page.locator('.monthv__day-h').boundingBox()
    expect(head).not.toBeNull()
    expect(head!.y).toBeGreaterThanOrEqual(0)
    expect(head!.y + head!.height).toBeLessThanOrEqual(PHONE.height)
    // …and the fold caret really folds the body away, without hiding the header.
    const body = page.locator('.monthv__day-body')
    await expect(body).toBeVisible()
    const fold = page.locator('.monthv__day-fold')
    await expect(fold).toHaveAttribute('aria-expanded', 'true')
    await fold.click()
    await expect(body).toBeHidden()
    await expect(fold).toHaveAttribute('aria-expanded', 'false')
    await expect(page.locator('.monthv__day-h')).toBeVisible()
  })

  // ── Two columns on a wide screen ────────────────────────────────────────────────
  test('on a wide screen the day sits BESIDE the calendar, not under it', async ({ page }) => {
    await mois(page, WIDE)
    const grid = await page.locator('.monthv__grid').boundingBox()
    const day = await page.locator('.monthv__day').boundingBox()
    expect(grid).not.toBeNull()
    expect(day).not.toBeNull()
    // Beside: the panel starts after the grid ends horizontally, and overlaps it vertically.
    expect(day!.x, 'the day panel should be to the right of the grid').toBeGreaterThanOrEqual(grid!.x + grid!.width - 1)
    expect(day!.y, 'the day panel should start level with the calendar').toBeLessThan(grid!.y + grid!.height)
    // In view without scrolling — the whole point of the column.
    expect(day!.y).toBeGreaterThanOrEqual(0)
    expect(day!.y).toBeLessThan(WIDE.height)
    // Folding is a narrow-screen affordance; there is nothing to reclaim in a column.
    await expect(page.locator('.monthv__day-fold')).toBeHidden()
  })

  // ── The tapped day names its things ─────────────────────────────────────────────
  // There is no view toggle any more: the grid is always a calm dotted glance, and the
  // ONE day you tap opens in place and spells out what is in it. (A whole-grid
  // « cases détaillées » mode put words in all 42 squares, which on a phone is 42
  // columns of three clipped characters — and it needed a control in the header to
  // explain itself.) The words must never widen the seven columns past the board —
  // the recurring horizontal-overflow bug this repo keeps re-fighting.
  test('the tapped day names its things in its own cell; the others stay dotted', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.setViewportSize(REPORTED)
    await mockApi(page)
    await seedMonthOnCell(page)
    await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', calm: true, boardView: 'month' })
    await page.goto('/board')
    await page.locator('.monthv').waitFor({ state: 'visible', timeout: 15_000 })

    // The control is gone for good — the grid explains itself by being tapped.
    await expect(page.locator('.monthv__density')).toHaveCount(0)

    const seeded = page.locator('.monthv__cell').nth(SEED_IDX)
    // Untapped: shapes only, no words.
    await expect(seeded.locator('.monthv__dots')).toBeVisible()
    await expect(seeded.locator('.monthv__lines')).toHaveCount(0)

    await seeded.click()
    // Tapped: the same two things, NAMED — and the dots step aside rather than doubling up.
    await expect(seeded.locator('.monthv__lines')).toBeVisible()
    await expect(seeded.locator('.monthv__dots')).toHaveCount(0)
    await expect(seeded.getByText(EVENT_TITLE)).toBeVisible()
    await expect(seeded.getByText(MEAL_TITLE)).toBeVisible()

    // Only that one opened: every other cell keeps its dots.
    const others = page.locator('.monthv__cell:not(.is-on) .monthv__lines')
    await expect(others).toHaveCount(0)

    // No cell may push the grid wider than the board (per-child bounds, not scrollWidth:
    // the hub body clips overflow-x, so scrollWidth reads 0 — see CLAUDE.md).
    const gridBox = (await page.locator('.monthv__grid').boundingBox())!
    for (const cell of await page.locator('.monthv__cell').all()) {
      const b = await cell.boundingBox()
      if (b) expect(b.x + b.width, 'a cell bleeds past the grid').toBeLessThanOrEqual(gridBox.x + gridBox.width + 1)
    }
  })

  // ── Where you are lives in the URL ──────────────────────────────────────────────
  test('the picked day and month ride in ?date=, and survive a reload', async ({ page }) => {
    await mois(page)
    // Today is the default, so it is stored as NO param.
    expect(new URL(page.url()).searchParams.get('date')).toBeNull()

    const header = page.locator('.monthv__day-h > b')
    const todayTitle = await header.innerText()
    const cells = page.locator('.monthv__cell')
    await cells.nth(20).click()
    // The URL updates a tick before the panel re-renders — wait for the panel, or the
    // snapshot below captures today's title and the reload check compares nothing.
    await expect(header).not.toHaveText(todayTitle)
    const picked = new URL(page.url()).searchParams.get('date')
    expect(picked, 'picking a day should write ?date=').toMatch(/^\d+$/)

    const dayTitle = await header.innerText()
    await page.reload()
    await page.locator('.monthv').waitFor({ state: 'visible', timeout: 15_000 })
    expect(new URL(page.url()).searchParams.get('date')).toBe(picked)
    await expect(page.locator('.monthv__day-h > b')).toHaveText(dayTitle)

    // « Aujourd'hui » clears it again rather than writing today's date.
    await page.locator('.monthv__today').click()
    await expect.poll(() => new URL(page.url()).searchParams.get('date')).toBeNull()
  })

  // ── One ⋯ for everything you can add to the day ─────────────────────────────────
  test('the day menu seeds the event form with the picked date', async ({ page }) => {
    await mois(page)
    const cells = page.locator('.monthv__cell')
    await cells.nth(20).click()
    const picked = new URL(page.url()).searchParams.get('date')!

    await page.locator('.monthv__day-tools button[aria-haspopup]').click()
    await page.getByRole('menuitem', { name: /rendez-vous/i }).click()
    // /event/new?date=<the same local-midnight secs the calendar had selected>
    await page.waitForURL(/\/event\/new/)
    expect(new URL(page.url()).searchParams.get('date')).toBe(picked)
  })

  // A read-only guest gets no ⋯ (every entry is a write) but still READS the calendar
  // fully: tapping a date still opens that day's cell and its panel. Reading is never
  // gated on isGuest() — over-applying that guard is the mistake that hid board
  // reordering and the whole in-app guide from the public demo.
  test('a read-only guest loses the add menu but still opens a day', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.setViewportSize(REPORTED)
    await mockApi(page, { signedIn: false })
    await page.route('**/api/guest/whoami**', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ kind: 'showcase' }) }),
    )
    await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', calm: true, boardView: 'month' })
    await page.addInitScript(() => localStorage.setItem('babillard-guest-token', 'e2e-guest-token'))
    await page.goto('/board')
    await page.locator('.monthv').waitFor({ state: 'visible', timeout: 15_000 })

    await expect(page.locator('.monthv__day-tools button[aria-haspopup]')).toHaveCount(0)
    // Reading is untouched: a tapped date still opens in place.
    const cell = page.locator('.monthv__cell').nth(20)
    await cell.click()
    await expect(cell).toHaveClass(/is-on/)
    await expect(page.locator('.monthv__day-h')).toBeVisible()
  })
})
