import { test, expect } from './fixtures'
import { MMID } from './mocks'

// A DRAG IS NEVER THE ONLY DOOR (solidify 1.8, 2026-11-05). Two surfaces had a
// press-and-hold as their one way to move a thing, while ACTIONS.md's matrix called
// them ✅ non-touch: a meal could only change DAYS by dragging it on the week grid, and
// a face could only reach a generation band in the family builder by being dragged
// there. Both now have a menu door a mouse, a keyboard and a screen reader can drive —
// and `src/lib/dnd-mirror.test.ts` keeps every usePointerDnd host paired with its
// mirror. These two cases drive the new doors end to end, mouse only, no drag.

test('a meal moves to another day and slot from its row ⋯ « Déplacer… » — and « Annuler » moves it back', async ({ page, app }) => {
  // The day scene on the fixture's first day (clock BASE: that day is today, so its
  // meals read as live). Souper holds « Spaghetti maison » (meal1, recipe-linked).
  await app.boot({ route: `/kitchen/day/${MMID}?vue=repas`, clock: 'BASE', wait: '.scene' })
  const posts: Record<string, unknown>[] = []
  await page.route('**/api/meals', (route) => {
    if (route.request().method() === 'POST') posts.push(JSON.parse(route.request().postData() || '{}'))
    return route.fallback()
  })

  const row = page.locator('.day-mng__sec', { hasText: 'Souper' }).locator('.kitchen__meal-row', { hasText: 'Spaghetti maison' })
  await expect(row).toBeVisible()
  await row.locator('.action-menu__btn').click()
  await page.getByRole('menuitem', { name: 'Déplacer…' }).click()

  // The shared day + slot picker, in a sheet named after the meal.
  const sheet = page.locator('.sheet.show')
  await expect(sheet).toBeVisible()
  await expect(sheet).toContainText('Déplacer « Spaghetti maison »')
  // Pick « Dîner », then the third day of the window (two days on).
  await sheet.locator('.slot-picker .chip', { hasText: 'Dîner' }).click()
  await sheet.locator('.meal-plan-pick__days .chip').nth(2).click()

  // ONE reschedule through the owner (mealMutations.reschedule): id, the picked day,
  // the picked slot — the same body the drag sends.
  await expect.poll(() => posts.length).toBe(1)
  expect(posts[0]).toMatchObject({ action: 'reschedule', id: 'meal1', toDate: MMID + 2 * 86_400, slot: 'lunch' })
  await expect(page.locator('.sheet.show')).toBeHidden()

  // The undo is the INVERSE move — nothing is deleted or recreated.
  await page.getByRole('button', { name: 'Annuler' }).click()
  await expect.poll(() => posts.length).toBe(2)
  expect(posts[1]).toMatchObject({ action: 'reschedule', id: 'meal1', toDate: MMID, slot: 'supper' })
})

test('a face reaches a generation band from its chip ⋯ « Placer » — no drag', async ({ page, app }) => {
  // Editing the fixture's « Famille Tremblay » opens the builder with its three contacts
  // in the tray (nothing placed yet).
  await app.boot({ route: '/cercle/family/g1', wait: '.cercle-fam__bands' })
  const tray = page.locator('[data-dnd-zone="tray"]')
  const parents = page.locator('[data-dnd-zone="parents"]')
  const trayBefore = await tray.locator('.cercle-fam__chip').count()
  expect(trayBefore).toBeGreaterThan(0)
  await expect(parents.locator('.cercle-fam__chip')).toHaveCount(0)

  const chip = tray.locator('.cercle-fam__chip').first()
  const name = await chip.locator('.cercle-fam__chip-name').innerText()
  await chip.locator('.action-menu__btn').click()
  await page.getByRole('menuitem', { name: 'Parents', exact: true }).click() // not « Grands-parents »

  // The chip now sits in the Parents band — the same state a drop would leave.
  await expect(parents.locator('.cercle-fam__chip', { hasText: name })).toHaveCount(1)
  await expect(tray.locator('.cercle-fam__chip')).toHaveCount(trayBefore - 1)

  // …and the way back: a placed face's ⋯ offers the tray.
  await parents.locator('.cercle-fam__chip', { hasText: name }).locator('.action-menu__btn').click()
  await page.getByRole('menuitem', { name: 'À placer' }).click()
  await expect(parents.locator('.cercle-fam__chip')).toHaveCount(0)
  await expect(tray.locator('.cercle-fam__chip')).toHaveCount(trayBefore)
})
