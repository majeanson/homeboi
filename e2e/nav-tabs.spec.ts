import { test, expect, type Page } from '@playwright/test'
import { mockApi, seedState } from './mocks'

// Tab navigation must actually swap the routed screen — and must never trip an
// infinite render loop. This is a regression guard for the bug where leaving
// La cuisine flipped the shell's kitchen-action flags true→false→true every
// render (HubLayout ↔ Kitchen ping-pong), exceeding React's update depth and
// freezing the tree: the nav bar changed, the screen didn't. See Kitchen.tsx's
// registerKitchen effect (idempotent, clears only on unmount) + HubLayout's
// value-bailing registrar.

const TABS = [
  { href: '/board', marker: '.board-wall' },
  { href: '/kitchen', marker: '.kitchen' },
  // /maison (Routines is its default section — /cercle was deliberately absent
  // from this list before the nav restructure; the merged tab now covers both).
  { href: '/maison', marker: '.routines-grid' },
  { href: '/notes', marker: '.cercle-notes' },
  { href: '/liste', marker: '.hub__body' },
  { href: '/settings', marker: '.operator' },
] as const

// Fail the test if React ever logs the update-depth warning during navigation.
function watchForLoop(page: Page): { assertNone: () => void } {
  const hits: string[] = []
  page.on('console', (m) => {
    if (m.type() === 'error' && m.text().includes('Maximum update depth')) hits.push(m.text())
  })
  return {
    assertNone: () => expect(hits, 'React hit an infinite render loop during navigation').toEqual([]),
  }
}

async function boot(page: Page) {
  await page.setViewportSize({ width: 390, height: 844 })
  // Keep the first-run tour from auto-navigating mid-test.
  await page.addInitScript(() => {
    try {
      localStorage.setItem('babillard-tours-seen', JSON.stringify(['essentials']))
    } catch {
      /* noop */
    }
  })
  await mockApi(page)
  await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile' })
}

async function goTab(page: Page, href: string, marker: string) {
  await page.locator(`.hubnav a[href="${href}"]`).click()
  await expect(page).toHaveURL(new RegExp(`${href.replace('/', '\\/')}$`))
  await expect(page.locator(marker).first()).toBeVisible({ timeout: 10_000 })
}

// Leaving La cuisine for every other tab must paint that tab (the original bug
// only manifested on the way OUT of Kitchen).
for (const dest of TABS.filter((t) => t.href !== '/kitchen')) {
  test(`kitchen -> ${dest.href} swaps the screen`, async ({ page }) => {
    const loop = watchForLoop(page)
    await boot(page)
    await page.goto('/kitchen')
    await expect(page.locator('.kitchen')).toBeVisible({ timeout: 15_000 })
    await goTab(page, dest.href, dest.marker)
    await expect(page.locator('.kitchen')).toHaveCount(0) // Kitchen actually unmounted
    loop.assertNone()
  })
}

// A full round-trip through every tab — content swaps each hop, no loop anywhere.
test('round-trip through all tabs swaps content with no render loop', async ({ page }) => {
  const loop = watchForLoop(page)
  await boot(page)
  await page.goto('/board')
  await expect(page.locator('.board-wall')).toBeVisible({ timeout: 15_000 })
  for (const tab of [...TABS.slice(1), TABS[0]]) {
    await goTab(page, tab.href, tab.marker)
  }
  loop.assertNone()
})

// The in-page SubTabs (La cuisine's Repas · Garde-manger · Recettes · Historique,
// Le cercle's section switch, etc.) are a WAI-ARIA tablist: ONE tab stop (roving tabindex) and
// ←/→/Home/End move + select. Locks the a11y keyboard nav added to the shared control.
test('SubTabs are keyboard-navigable (roving tabindex + arrow keys)', async ({ page }) => {
  await boot(page)
  await page.goto('/kitchen')
  const tablist = page.locator('[data-tour="kitchen-tabs"]')
  await expect(tablist).toBeVisible({ timeout: 15_000 })
  // Roving tabindex: exactly one tab is in the tab order (the selected one).
  await expect(tablist.locator('.subtabs__opt[tabindex="0"]')).toHaveCount(1)
  await expect(tablist.locator('.subtabs__opt[aria-selected="true"]')).toHaveText(/Repas/)
  // ArrowRight moves + selects the next tab; End jumps to the last.
  await tablist.locator('.subtabs__opt[aria-selected="true"]').focus()
  await page.keyboard.press('ArrowRight')
  await expect(tablist.locator('.subtabs__opt[aria-selected="true"]')).toHaveText(/Garde-manger/)
  await page.keyboard.press('End')
  await expect(tablist.locator('.subtabs__opt[aria-selected="true"]')).toHaveText(/Historique/)
  await expect(tablist.locator('.subtabs__opt[tabindex="0"]')).toHaveCount(1)
})
