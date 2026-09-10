import { test, expect, type Page, type Request } from '@playwright/test'
import { mockApi, seedState, BASE, MMID } from './mocks'
import { addLocalDays } from '../src/lib/localDay'

// A SIDE MEAL DRAGS TO ANOTHER DAY ON THE WEEK GRID — as itself.
//
// Marc, from the phone, 2026-09-10: « drag n dropping a snack no longer works ». It
// never had: side meals were rendered `draggable: false` by the very commit that made
// them look exactly like the supper row (9a1c48f, "side meals render as full
// tap-to-recipe rows"). Rows that look identical where only one moves is a promise
// the layout makes and the gesture breaks — so a side meal now drags too, keyed as
// ONE meal (`meal:date:slot:id`), and lands in the target day in its own slot. The
// supper headline keeps its older meaning: dragging it moves the day's WHOLE supper
// plan (keyed by DATE).
//
// Both are read from the WRITE, not the screen: the mock echoes nothing, so a drop
// that fired the wrong body — or none — is only visible at the request.
//
// Fixture: day MMID holds « Crêpes » (meal4, breakfast) beside two suppers (meal1
// « Spaghetti maison », meal5 « Salade César »); the next day holds « Tacos ».

// > DND_HOLD_MS (400, src/lib/dnd.tsx). Hardcoded because the e2e tsconfig cannot
// import a .tsx module (no --jsx) — the same shape board-edit.spec.ts uses for its
// LONG_PRESS hold. If the arm time ever rises past this, the drag below never starts
// and both cases go red together, which is the right way to learn it.
const HOLD = 700

const isReschedule = (r: Request) =>
  r.method() === 'POST' && new URL(r.url()).pathname === '/api/meals' && /"action":"reschedule"/.test(r.postData() ?? '')

async function openGrid(page: Page) {
  await page.clock.setFixedTime(new Date(BASE * 1000))
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.setViewportSize({ width: 390, height: 844 })
  await mockApi(page)
  await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile' })
  await page.goto('/kitchen')
  await expect(page.locator('.kitchen__day').first()).toBeVisible({ timeout: 15_000 })
}

/** Press-and-hold a row past DND_HOLD_MS, carry it onto a day zone, release. */
async function holdDrag(page: Page, from: ReturnType<Page['locator']>, toZoneDate: number) {
  const target = page.locator(`.kitchen__day[data-dnd-zone="${toZoneDate}"]`)
  await target.scrollIntoViewIfNeeded()
  const a = await from.boundingBox()
  const b = await target.boundingBox()
  if (!a || !b) throw new Error('drag endpoints not measurable')
  const sx = a.x + a.width / 2
  const sy = a.y + a.height / 2
  await page.mouse.move(sx, sy)
  await page.mouse.down()
  // The hold: rest past the arm time WITHOUT moving (a move before it aborts as a scroll).
  await page.waitForTimeout(HOLD)
  await page.mouse.move(sx + 2, sy + 2)
  await page.mouse.move(b.x + b.width / 2, b.y + 20, { steps: 12 })
  await page.waitForTimeout(100)
  await page.mouse.up()
}

test('a side meal (breakfast) drags to the next day as ONE meal, in its own slot', async ({ page }) => {
  await openGrid(page)
  const nextDay = addLocalDays(MMID, 1)
  const crepes = page.locator('.kitchen__day').first().locator('.kitchen__day-meal', { hasText: 'Crêpes' })
  await expect(crepes).toBeVisible()
  const [req] = await Promise.all([page.waitForRequest(isReschedule, { timeout: 20_000 }), holdDrag(page, crepes, nextDay)])
  const body = JSON.parse(req.postData() ?? '{}') as { action: string; id: string; toDate: number; slot?: string }
  expect(body).toMatchObject({ action: 'reschedule', id: 'meal4', toDate: nextDay, slot: 'breakfast' })
})

test('the supper headline still moves the day\'s WHOLE supper plan', async ({ page }) => {
  await openGrid(page)
  const nextDay = addLocalDays(MMID, 1)
  const supper = page.locator('.kitchen__day').first().locator('.kitchen__day-meal', { hasText: 'Spaghetti maison' })
  const seen: string[] = []
  page.on('request', (r) => {
    if (isReschedule(r)) seen.push((JSON.parse(r.postData() ?? '{}') as { id: string }).id)
  })
  await holdDrag(page, supper, nextDay)
  await expect.poll(() => seen.slice().sort(), { timeout: 10_000 }).toEqual(['meal1', 'meal5'])
})
