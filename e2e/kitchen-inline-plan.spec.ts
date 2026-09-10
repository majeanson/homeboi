import { test, expect } from '@playwright/test'
import { mockApi, seedState } from './mocks'
import { boxOf } from './measure'

// Plan seam #8: filling a week cost seven full-screen day scenes. An EMPTY day cell
// in the week grid is now the field itself — tap it, type, done. The day scene still
// owns the rest (sides, note, recipe, who cooks), and the pencil still opens it.
test('an empty day cell plans the supper in place', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const posted: Record<string, unknown>[] = []
  await mockApi(page)
  await page.route('**/api/meals**', async (route) => {
    if (route.request().method() === 'POST') {
      posted.push(route.request().postDataJSON())
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, id: 'new' }) })
    }
    return route.fallback()
  })
  await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile' })
  await page.goto('/kitchen')
  await expect(page.locator('.kitchen')).toBeVisible({ timeout: 15_000 })

  // An empty day announces itself as plannable via the header's ＋ switch…
  const emptyCell = page.locator('.kitchen__day-addbtn').first()
  await expect(emptyCell).toBeVisible()
  await emptyCell.click()

  // …and becomes the field in place — no navigation to a day scene.
  const field = page.locator('.kitchen__day-add')
  await expect(field).toBeVisible()
  expect(page.url()).toContain('/kitchen')
  expect(page.url()).not.toContain('/kitchen/day/')

  await field.locator('input, textarea').first().fill('Spaghetti')
  await page.keyboard.press('Enter')

  await expect.poll(() => posted.length, { message: 'the meal was planned' }).toBeGreaterThan(0)
  const body = posted[0] as { title?: string; date?: number; slot?: string }
  expect(body.title).toBe('Spaghetti')
  expect(body.slot).toBeTruthy()
  expect(typeof body.date).toBe('number')
  // The field closes once the write lands; the grid is a calm glance again.
  await expect(page.locator('.kitchen__day-add')).toHaveCount(0)
})

// Reported from the device (2026-09-10): « quand je clique pour ajouter et planifier
// un repas (date vide), le focus ne va pas au bon endroit ».
//
// The day it opened on was right and the input WAS focused — what was wrong is that
// nothing brought the thing you just opened onto the screen. Tap the ＋ on a day far
// down the week and the field mounts below the fold with its dropdown (Restants +
// Recettes, easily half a screen tall) hanging off the bottom: focused, rendered,
// and invisible. You had to scroll to find what your own tap had opened.
//
// The fix lives in the PRIMITIVES (EntityCombobox + EditField, via lib/motion's
// `revealOnOpen`), so it holds for every inline composer in every section, not just
// this one. This spec pins the reported surface; `block: 'nearest'` is what keeps it
// from yanking a composer that was already comfortably in view.
test('planning a day low in the week brings the field AND its options on screen', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await mockApi(page)
  await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile' })
  await page.goto('/kitchen')
  await expect(page.locator('.kitchen')).toBeVisible({ timeout: 15_000 })

  const addButtons = page.locator('.kitchen__day-addbtn')
  expect(await addButtons.count(), 'the grid should offer empty days to plan').toBeGreaterThan(1)

  // Put an empty day's ＋ NEAR THE BOTTOM EDGE, the way it sits when you are reading
  // down the week — then tap it IN PAGE.
  //
  // Both halves are load-bearing, and the first version of this test had neither, so
  // it passed with the fix reverted. Playwright's own .click() scrolls the target into
  // view first (nearest edge), which quietly undoes the exact condition being tested;
  // an in-page click reproduces a real thumb. The menu is in FLOW (fields.css), so it
  // grows the day card downward — off the bottom of the screen when the card starts
  // there, which is precisely what was reported.
  const idx = await page.evaluate(() => {
    const btns = [...document.querySelectorAll<HTMLElement>('.kitchen__day-addbtn')]
    const scroller = document.querySelector('.hub__body')
    if (!btns.length || !scroller) return -1
    const target = btns[btns.length - 1]
    // Scroll so the target's row sits ~120px above the fold: visible, tappable, with
    // no room beneath it for a dropdown.
    const row = target.closest('.kitchen__day') as HTMLElement
    scroller.scrollTop += row.getBoundingClientRect().top - (window.innerHeight - 120)
    return btns.length - 1
  })
  expect(idx, 'found an empty day to drive').toBeGreaterThanOrEqual(0)
  await page.waitForTimeout(200)

  // A real tap, with no test-runner scrolling in front of it.
  await page.evaluate((i) => {
    const btns = [...document.querySelectorAll<HTMLElement>('.kitchen__day-addbtn')]
    btns[i]?.click()
  }, idx)

  const field = page.locator('.kitchen__day-add')
  await expect(field).toBeVisible()
  const menu = field.locator('.combobox__menu')
  await expect(menu).toBeVisible()
  await page.waitForTimeout(400) // let the reveal's smooth scroll land

  const view = page.viewportSize()!
  // The INPUT row, not the combobox root — the root contains the dropdown, and a long
  // list is allowed to run past the fold (it scrolls). What may never be off screen is
  // the box you type in and the first thing you can pick.
  const inputBox = await boxOf(field.locator('input').first())
  expect(inputBox.y, 'the input must be on screen').toBeGreaterThanOrEqual(0)
  expect(inputBox.y + inputBox.height, 'the input must not sit below the fold').toBeLessThanOrEqual(view.height)

  // The options are the point of opening it: the first row has to be reachable without
  // scrolling, or the tap looks like it did nothing.
  const firstRow = field.locator('.combobox__row').first()
  await expect(firstRow).toBeVisible()
  const rowBox = await boxOf(firstRow)
  expect(rowBox.y, 'the first option must be inside the viewport').toBeGreaterThanOrEqual(0)
  expect(rowBox.y + rowBox.height, 'the first option must not hang below the fold').toBeLessThanOrEqual(view.height)
})

// The other half of the same contract, and the reason `revealOnOpen` uses
// `block: 'nearest'` rather than 'center'/'start'/'end'.
//
// A shared primitive scrolls on EVERY inline composer in the app, so the common case —
// a field you opened that was already perfectly visible — must be a no-op. A composer
// that jumps the page under your thumb each time you tap it is a worse bug than the one
// being fixed, and it would be reported as "it moves when I tap".
test('opening a composer that is already in view does not move the page', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await mockApi(page)
  await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile' })
  await page.goto('/kitchen')
  await expect(page.locator('.kitchen')).toBeVisible({ timeout: 15_000 })

  const scrollTop = () => page.evaluate(() => document.querySelector('.hub__body')?.scrollTop ?? 0)

  // Park an empty day in the MIDDLE of the viewport — comfortably visible, with room
  // both above and below it. The middle is what makes this test discriminate: a reveal
  // that aligned to 'start' or 'end' would drag this composer to an edge and the page
  // would jump, while 'nearest' has nothing to do. (Driven off the FIRST empty day, at
  // the top of the grid, the two are indistinguishable — the first version of this test
  // sat there and passed with 'end' planted, proving nothing.)
  await page.evaluate(() => {
    const btn = document.querySelector<HTMLElement>('.kitchen__day-addbtn')
    const scroller = document.querySelector('.hub__body')
    if (!btn || !scroller) return
    const row = btn.closest('.kitchen__day') as HTMLElement
    scroller.scrollTop += row.getBoundingClientRect().top - window.innerHeight / 2
  })
  await page.waitForTimeout(200)
  const before = await scrollTop()

  await page.evaluate(() => document.querySelector<HTMLElement>('.kitchen__day-addbtn')?.click())
  await expect(page.locator('.kitchen__day-add')).toBeVisible()
  await page.waitForTimeout(500) // any scroll would have landed by now

  expect(await scrollTop(), 'a composer already in view must not scroll the page').toBe(before)
})
