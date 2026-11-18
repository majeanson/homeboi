import { test, expect } from './fixtures'
import { openKitEntry } from './kit'

// Review #32 (2026-11-18; Sam, screen reader + keyboard):
//   · Réglages toggles were named by their STATE alone (« Activée, bouton bascule ») —
//     never WHAT is on. SettingsRow now names its row and Toggle borrows that name.
//   · The search-and-pick field broke the combobox pattern: Tab walked every option,
//     tabbing past the field opened it, Esc on an option did nothing, headings named no
//     group, and a link sat inside the listbox.

test('a Réglages toggle says WHAT it turns on, and its row is a named group', async ({ app, page }) => {
  await app.boot({ route: '/settings?focus=ambient', wait: '.operator' })
  const row = page.getByRole('group', { name: 'Ambiance du jour' })
  await expect(row).toBeVisible()
  const toggle = row.getByRole('button', { name: /^Ambiance du jour / })
  await expect(toggle).toHaveAttribute('aria-pressed', /true|false/)
})

test('the picker: Tab passes it by, ↓ opens it, options are not tab stops, Esc closes, headings name groups', async ({ app, page }) => {
  await app.boot({ viewport: { width: 1024, height: 800 } })
  await page.goto('/dev/kit')
  const entry = await openKitEntry(page, 'EntityCombobox')
  const input = entry.getByRole('combobox').first()
  await input.waitFor({ state: 'visible', timeout: 15_000 })

  // Reached by Tab: stays closed (it opened on any focus before).
  await input.focus()
  await page.keyboard.press('Escape')
  await page.keyboard.press('Shift+Tab')
  await page.keyboard.press('Tab')
  await expect(input).toBeFocused()
  await expect(input).toHaveAttribute('aria-expanded', 'false')

  // ↓ opens; the options are reached by the arrows, never by Tab.
  await page.keyboard.press('ArrowDown')
  await expect(input).toHaveAttribute('aria-expanded', 'true')
  const list = page.getByRole('listbox')
  await expect(list.getByRole('option')).toHaveCount(4)
  await expect(list.locator('[role="option"]:not([tabindex="-1"])')).toHaveCount(0)
  await expect(list.getByRole('group', { name: 'Recettes' }).getByRole('option')).toHaveCount(2)
  await expect(list.locator('a')).toHaveAttribute('aria-hidden', 'true')
  await expect(list.locator('a')).toHaveAttribute('tabindex', '-1')

  // Esc closes and keeps the caret in the field.
  await page.keyboard.press('Escape')
  await expect(input).toHaveAttribute('aria-expanded', 'false')
  await expect(input).toBeFocused()

  // A tap still opens it — the phone flow is unchanged.
  await input.click()
  await expect(input).toHaveAttribute('aria-expanded', 'true')
})
