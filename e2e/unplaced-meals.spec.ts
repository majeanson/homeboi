import { test, expect, type Page, type Locator, type Request } from '@playwright/test'
import { mockApi, seedState, BASE, MMID, MEALS } from './mocks'
import { addLocalDays } from '../src/lib/localDay'
import { boxOf } from './measure'

// « À PLACER » — THE WEEK GRID'S FIRST CARD: this week's meals with no day yet
// (mig 0155; Marc, 2026-11-14: « plan the week without assigning a day yet, say have 5
// meals in there, and drag and drop easily »).
//
// Read from the WRITE, like grid-side-meal-drag.spec.ts: the mock echoes nothing, so a
// drop that fired the wrong body — or none — is only visible at the request. Four doors:
// a bin row dragged onto a day, a planned meal dragged into the bin, the tap-a-row day
// picker (the gesture's mirror for a mouse/keyboard), and an idea sent to the bin.

// > DND_HOLD_MS (400) — see grid-side-meal-drag.spec.ts for why it is hardcoded. A ceiling
// for the wait on the ghost, not a sleep.
const HOLD = 700

const UNPLACED = [
  { id: 'u1', title: 'Lasagne', recipe_id: null, slot: null, is_leftover: 0, position: 0 },
  { id: 'u2', title: 'Poké bols', recipe_id: null, slot: null, is_leftover: 0, position: 1 },
]

const mealsPost = (action: string) => (r: Request) =>
  r.method() === 'POST' && new URL(r.url()).pathname === '/api/meals' && new RegExp(`"action":"${action}"`).test(r.postData() ?? '')

type Row = Record<string, unknown> & { id: string }

/**
 * /api/meals as a tiny STATEFUL server: a write moves the row, and the refetch every
 * write triggers reads it back. A stateless echo (the first version of this spec) let
 * that refetch put the old row straight back over the optimistic move — green locally,
 * red on CI's single worker, where the refetch landed before the assertion.
 */
async function statefulMeals(page: Page) {
  const st = { days: [...MEALS.days] as unknown as Row[], unplaced: [...UNPLACED] as Row[] }
  await page.route('**/api/meals**', (route) => {
    const req = route.request()
    const url = new URL(req.url())
    if (url.pathname !== '/api/meals') return route.fallback()
    if (req.method() === 'GET') {
      if (url.searchParams.has('date')) return route.fallback()
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ...MEALS, ...st }) })
    }
    const b = (req.postDataJSON() ?? {}) as Record<string, unknown>
    if (b.action === 'place') {
      const u = st.unplaced.find((x) => x.id === b.id)
      st.unplaced = st.unplaced.filter((x) => x.id !== b.id)
      if (u) st.days.push({ ...u, date: b.toDate, slot: b.slot, cook_member_id: null })
    } else if (b.action === 'unplace') {
      const m = st.days.find((x) => x.id === b.id)
      st.days = st.days.filter((x) => x.id !== b.id)
      if (m) st.unplaced.push({ id: m.id, title: m.title, recipe_id: m.recipe_id ?? null, slot: m.slot, is_leftover: 0, position: 99 })
    }
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, id: 'u-new' }) })
  })
}

async function openGrid(page: Page) {
  await page.clock.setFixedTime(new Date(BASE * 1000))
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.setViewportSize({ width: 390, height: 844 })
  await mockApi(page)
  await statefulMeals(page)
  await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile' })
  await page.goto('/kitchen')
  await expect(page.locator('.kitchen__day').first()).toBeVisible({ timeout: 15_000 })
}

/** Press-and-hold a row past DND_HOLD_MS, carry it onto a zone, release. */
async function holdDrag(page: Page, from: Locator, target: Locator) {
  const a = await boxOf(from)
  const sx = a.x + a.width / 2
  const sy = a.y + a.height / 2
  await page.mouse.move(sx, sy)
  await page.mouse.down()
  // The hold arms the drag on its own (no move): the ghost label appearing IS that moment.
  await expect(page.locator('.dnd-ghost')).toBeVisible({ timeout: HOLD * 4 })
  await page.mouse.move(sx + 2, sy + 2)
  const b = await boxOf(target)
  await page.mouse.move(b.x + b.width / 2, b.y + 20, { steps: 12 })
  await expect(target).toHaveClass(/is-droptarget/)
  await page.mouse.up()
}

test('« À placer » is the FIRST card of the week, before today, holding its meals', async ({ page }) => {
  await openGrid(page)
  const first = page.locator('.kitchen__week > li').first()
  await expect(first).toHaveClass(/kitchen__day--unplaced/)
  await expect(first).toContainText('À placer')
  await expect(first.locator('.kitchen__unplaced-row')).toHaveText([/Lasagne/, /Poké bols/])
  await expect(page.locator('.kitchen__week > li').nth(1)).toHaveClass(/is-today/)
})

test('a meal from « À placer » drags onto a day — placed, in the hero slot', async ({ page }) => {
  await openGrid(page)
  const tomorrow = addLocalDays(MMID, 1)
  const row = page.locator('.kitchen__unplaced-row', { hasText: 'Lasagne' })
  const target = page.locator(`.kitchen__day[data-dnd-zone="${tomorrow}"]`)
  const [req] = await Promise.all([page.waitForRequest(mealsPost('place'), { timeout: 20_000 }), holdDrag(page, row, target)])
  expect(req.postDataJSON()).toMatchObject({ action: 'place', id: 'u1', toDate: tomorrow, slot: 'supper' })
  // Optimistic: the row leaves the bin at once and lands on the day.
  await expect(page.locator('.kitchen__unplaced-row', { hasText: 'Lasagne' })).toHaveCount(0)
  await expect(target).toContainText('Lasagne')
})

test('a planned side meal drags off its day INTO « À placer »', async ({ page }) => {
  await openGrid(page)
  const crepes = page.locator('.kitchen__day.is-today .kitchen__day-meal', { hasText: 'Crêpes' })
  const bin = page.locator('.kitchen__day--unplaced')
  const [req] = await Promise.all([page.waitForRequest(mealsPost('unplace'), { timeout: 20_000 }), holdDrag(page, crepes, bin)])
  expect(req.postDataJSON()).toMatchObject({ action: 'unplace', id: 'meal4' })
  await expect(bin.locator('.kitchen__unplaced-row', { hasText: 'Crêpes' })).toBeVisible()
})

test('without a drag: tap a row, pick a day (the mouse / keyboard mirror)', async ({ page }) => {
  await openGrid(page)
  await page.getByRole('button', { name: /Poké bols/ }).click()
  const picker = page.locator('.kitchen__day--unplaced .meal-plan-pick')
  await expect(picker).toBeVisible()
  const [req] = await Promise.all([page.waitForRequest(mealsPost('place')), picker.locator('.meal-plan-pick__days button').nth(2).click()])
  expect(req.postDataJSON()).toMatchObject({ action: 'place', id: 'u2', toDate: addLocalDays(MMID, 2) })
})

test('an idea goes to « À placer » from its day picker — the first chip', async ({ page }) => {
  await openGrid(page)
  const idea = page.locator('.kitchen__ideas .kitchen__idea', { hasText: 'Soupe poulet-nouilles' })
  await idea.scrollIntoViewIfNeeded()
  await idea.getByRole('button', { name: /Soupe poulet-nouilles/ }).click()
  const first = idea.locator('.meal-plan-pick__days button').first()
  await expect(first).toHaveText('À placer')
  const [req] = await Promise.all([page.waitForRequest(mealsPost('park')), first.click()])
  expect(req.postDataJSON()).toMatchObject({ action: 'park', title: 'Soupe poulet-nouilles' })
})

// « make sure we can plan for this "day" too … instead of a real day, from recipes and
// such » (Marc, 2026-11-14): every planning picker offers « À placer » first.
test('a recipe plans straight into « À placer » from its « Planifier »', async ({ page }) => {
  await openGrid(page)
  await page.goto('/kitchen/recipe/rc1')
  await page.locator('.recipe-modal').waitFor({ state: 'visible', timeout: 15_000 })
  await page.getByRole('button', { name: /^Planifier$/ }).click()
  const chip = page.locator('.meal-plan-pick__unplaced')
  await expect(chip).toHaveText('À placer')
  const [req] = await Promise.all([page.waitForRequest(mealsPost('park')), chip.click()])
  expect(req.postDataJSON()).toMatchObject({ action: 'park', recipeId: 'rc1', slot: 'supper' })
  await expect(page.getByRole('button', { name: /Planifié/ })).toBeDisabled()
})

test('a planned meal goes back to « À placer » from « Déplacer… » — no drag, and « Annuler » puts it back', async ({ page }) => {
  await openGrid(page)
  await page.goto(`/kitchen/day/${MMID}?vue=repas`)
  const row = page.locator('.day-mng__sec', { hasText: 'Souper' }).locator('.kitchen__meal-row', { hasText: 'Spaghetti maison' })
  await expect(row).toBeVisible({ timeout: 15_000 })
  await row.locator('.action-menu__btn').click()
  await page.getByRole('menuitem', { name: 'Déplacer…' }).click()
  const sheet = page.locator('.sheet.show')
  const [req] = await Promise.all([page.waitForRequest(mealsPost('unplace')), sheet.locator('.meal-plan-pick__unplaced').click()])
  expect(req.postDataJSON()).toMatchObject({ action: 'unplace', id: 'meal1' })
  await expect(row).toHaveCount(0)
  const [back] = await Promise.all([
    page.waitForRequest(mealsPost('place')),
    page.getByRole('button', { name: 'Annuler' }).click(),
  ])
  expect(back.postDataJSON()).toMatchObject({ action: 'place', id: 'meal1', toDate: MMID, slot: 'supper' })
})
