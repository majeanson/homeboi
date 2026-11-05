import { test, expect } from './fixtures'

// A value picker is ONE tab stop and arrows move + select (solidify 3.3): the eight
// hand-rolled copies were rows of independent pressed buttons, and no radiogroup existed
// in the app. The board's view switch is the one every household touches.
test('the board view switch is a radiogroup: one tab stop, arrows select', async ({ page, app }) => {
  await app.boot({ route: '/board', wait: '.hub' })
  const group = page.getByRole('radiogroup', { name: /vue|view/i }).first()
  await expect(group.getByRole('radio')).toHaveCount(4)
  await expect(group.locator('[tabindex="0"]')).toHaveCount(1)

  await group.getByRole('radio', { checked: true }).focus()
  await page.keyboard.press('ArrowRight')
  await expect(group.getByRole('radio', { name: 'La semaine' })).toBeChecked()
  await expect(group.getByRole('radio', { name: 'La semaine' })).toBeFocused()
  await expect(group.locator('[tabindex="0"]')).toHaveCount(1)
})

// The phone's BACK inside a drilled ＋ sheet closes the SHEET (the same as its ✕), and the
// page stays. The ← in the sheet's head is the way back to the tiles. Pinned on purpose:
// wave 1.3 asked about these nested pickers and no spec had driven one.
test('back from a drilled ＋ sheet closes the sheet and stays on the page', async ({ page, app }) => {
  await app.boot({ route: '/board', wait: '.hub' })
  await page.locator('.add-fab').click()
  const sheet = page.locator('.sheet.show')
  await expect(sheet).toBeVisible()
  await sheet.locator('.cat-pick[data-mode="todo"]').click()
  await expect(sheet.locator('.sheet__back')).toBeVisible()

  await page.goBack()
  await expect(page.locator('.sheet.show')).toHaveCount(0)
  await expect(page).toHaveURL(/\/board/)
  await expect(page.locator('.hub')).toBeVisible()
})
