import { test, expect } from '@playwright/test'
import { mockApi, seedState } from './mocks'

// Keyboard reachability of the shared ⋯ overflow menu (components/ActionMenu.tsx).
//
// The menu is the standing answer to "this surface has too many buttons" — a
// recipe footer, a contact peek, a meal row, a deal card all fold their long tail
// into it. That makes it a keyboard chokepoint: if the ⋯ is the ONLY door to
// « Supprimer », then a menu a keyboard can open but not walk has hidden those
// actions from every non-touch user (the desktop-reachability rule in CLAUDE.md).
//
// The panel is portaled to <body> — the LAST node in the document — so Tab from
// the trigger does NOT land in it. Focus has to be pulled in deliberately, and it
// is: useModal's focus trap. But the panel spends its first layout pass
// `visibility:hidden` while it's measured for placement, and a visibility:hidden
// element cannot take focus — so the pull has to survive that pass.
//
// Guards: opening puts focus on the first item, ↑/↓ walk (and wrap), Escape closes
// and hands focus back to the ⋯. Driven off the /dev/kit specimen so the assertions
// are about the primitive itself, not any one caller's item list.

const ITEMS = ['Ajouter à la liste', 'Partager', 'Modifier', 'Supprimer']

test('the ⋯ overflow menu opens, walks and closes on the keyboard', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))

  await page.setViewportSize({ width: 1024, height: 800 })
  await mockApi(page)
  await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile' })
  await page.goto('/dev/kit')

  const entry = page.locator('details.kit-entry').filter({ hasText: 'ActionMenu' }).first()
  await entry.locator('summary').click()
  const trigger = entry.locator('.action-menu__btn')
  await trigger.waitFor({ state: 'visible', timeout: 15_000 })

  // Open with the keyboard, the way a keyboard user would.
  await trigger.focus()
  await page.keyboard.press('Enter')
  const panel = page.locator('.action-menu__panel')
  await expect(panel).toBeVisible()

  // Focus lands INSIDE the panel, on its first item — not left behind on the ⋯
  // (from where Tab would walk the page, never the menu).
  const active = () => page.evaluate(() => document.activeElement?.textContent?.trim() ?? '')
  await expect.poll(active).toBe(ITEMS[0])

  // ↓ walks down and wraps past the last row; ↑ walks back up.
  await page.keyboard.press('ArrowDown')
  expect(await active()).toBe(ITEMS[1])
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('ArrowDown')
  expect(await active()).toBe(ITEMS[3])
  await page.keyboard.press('ArrowDown')
  expect(await active()).toBe(ITEMS[0])
  await page.keyboard.press('ArrowUp')
  expect(await active()).toBe(ITEMS[3])

  // Escape closes the MENU and hands focus back to its opener.
  await page.keyboard.press('Escape')
  await expect(panel).toHaveCount(0)
  await expect(trigger).toBeFocused()

  expect(errors).toEqual([])
})
