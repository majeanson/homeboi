import { test, expect, type Page } from '@playwright/test'
import { mockApi, seedState } from './mocks'

// Removing a quick-add suggestion used to be swipe-left ONLY (useSwipeToDelete binds
// touch events), so on a desktop — mouse or keyboard — there was no way to remove one
// at all: the row's single button is the *add* action. The row now carries the shared
// <RowActions> delete, the same mirror La liste's edit sheet gives its swipe.
//
// Both widths: a phone (where the swipe still exists) and a desktop (where it never did).
const PHONE = { width: 390, height: 844 }
const DESKTOP = { width: 1280, height: 900 }

async function boot(page: Page, viewport: { width: number; height: number }) {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.setViewportSize(viewport)
  await mockApi(page)
  await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', calm: true, surface: 'mobile' })
  await page.goto('/liste/quick')
  await page.locator('.qa__row').first().waitFor({ state: 'visible', timeout: 15_000 })
}

test('a quick-add suggestion can be removed with a mouse (not just a swipe)', async ({ page }) => {
  await boot(page, DESKTOP)
  const rows = page.locator('.qa__row')
  const before = await rows.count()
  expect(before).toBeGreaterThan(0)

  // The delete is a real, labelled button — reachable by mouse AND by keyboard.
  const del = rows.first().getByRole('button', { name: /Retirer .* des suggestions/ })
  await expect(del).toBeVisible()
  await del.click()

  // Deferred removal: the row hides now, the write waits behind the undo toast.
  await expect(rows).toHaveCount(before - 1)
})

test('the quick-add delete is keyboard reachable', async ({ page }) => {
  await boot(page, DESKTOP)
  const del = page.locator('.qa__row').first().getByRole('button', { name: /Retirer .* des suggestions/ })
  await del.focus()
  await expect(del).toBeFocused()
})

// The swipe pane (`.list-row__del`) is absolutely positioned over the whole row and
// only opacity:0 at rest, so without `pointer-events:none` it silently swallows clicks
// on every sibling that isn't the z-index:1 `.list-row__main` — it used to eat both the
// aisle picker and the delete button above.
test('the invisible swipe pane does not swallow clicks on the rest of the row', async ({ page }) => {
  await boot(page, DESKTOP)
  const hits = await page.locator('.qa__row').first().evaluate((row) => {
    const at = (sel: string) => {
      const el = row.querySelector(sel) as HTMLElement
      const r = el.getBoundingClientRect()
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
      // The real target, or a glyph inside it — never the pane.
      return el.contains(hit) ? 'self' : (hit as HTMLElement)?.className
    }
    return { aisle: at('.qa__aisle'), del: at('.row-actions__btn') }
  })
  expect(hits).toEqual({ aisle: 'self', del: 'self' })
})

test('the quick-add row does not overflow a phone once it carries a delete', async ({ page }) => {
  await boot(page, PHONE)
  // Per-child bounds check, not scrollWidth: the ancestors set overflow-x:hidden, so a
  // too-wide row is CLIPPED rather than reported (see CLAUDE.md ▸ Horizontal overflow).
  const overflow = await page.locator('.qa__row').first().evaluate((row) => {
    const right = row.getBoundingClientRect().right
    return Array.from(row.querySelectorAll('*'))
      .filter((el) => (el as HTMLElement).offsetParent !== null)
      .map((el) => el.getBoundingClientRect().right - right)
      .filter((d) => d > 1)
  })
  expect(overflow, 'no child may bleed past the row’s right edge').toEqual([])
})
