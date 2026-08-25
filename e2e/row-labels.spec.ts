import { test, expect } from '@playwright/test'
import { mockApi, seedState } from './mocks'

// What a ROW is called to assistive tech.
//
// The compact-rows pass spends a row's whole width on its words: no spine, no
// avatar disc, no always-on pencil — "who" is the title's tint, and the actions
// hide behind the row's one door. That works on screen. It stops working the
// moment the row's controls carry an `aria-label`, because a label REPLACES the
// element's content instead of adding to it: every liste row announced itself as
// « Cocher » and every todo row as « Modifier », with the item's own text — and
// « pas pressé », the staged deal, the aisle — never reaching the a11y tree at all.
//
// So the contract here is about the COMPUTED accessible name, not the markup:
//   · a labelled control names the verb AND the object (« Cocher — Lait »),
//   · the big content button carries NO label, so its content is its name, and
//     says its state through aria-pressed instead.
// Both assertions fail on the pre-fix code, which is the point.

test('a liste row says WHICH item, not just the verb', async ({ page }) => {
  await mockApi(page)
  await seedState(page, {})
  await page.goto('/liste')
  const row = page.locator('.list-row', { hasText: 'Lait' }).first()
  await expect(row).toBeVisible()

  // The two labelled controls: verb — object.
  await expect(row.locator('.list-row__img')).toHaveAccessibleName(/Modifier.*Lait/)
  await expect(row.locator('.list-row__toggle')).toHaveAccessibleName(/Cocher.*Lait/)

  // The row centre IS the row: its name comes from its content, so the item and
  // the quiet second line (here the staged Super C deal on « Lait ») survive.
  const name = row.locator('.list-row__name')
  await expect(name).toHaveAccessibleName(/Lait/)
  await expect(name).toHaveAccessibleName(/Super C/)
  // A toggle, and it says so — that's what replaced the bare « Cocher » label.
  await expect(name).toHaveAttribute('aria-pressed', 'false')
  await name.click()
  await expect(name).toHaveAttribute('aria-pressed', 'true')
})

test('a todo row says WHICH todo, on both of its controls', async ({ page }) => {
  await mockApi(page)
  await seedState(page, {})
  await page.goto('/board')
  await page.waitForSelector('.board-grid .wg-slot')

  const todos = page.locator('.wg-slot[data-card="todos"]')
  await todos.scrollIntoViewIfNeeded()
  const row = todos.locator('.todo-row', { hasText: 'Clés + téléphone + portefeuille' })
  await expect(row).toBeVisible()

  await expect(row.locator('.todo-row__check')).toHaveAccessibleName(/Cocher.*Clés/)
  await expect(row.locator('.todo-row__name')).toHaveAccessibleName(/Modifier.*Clés/)
})
