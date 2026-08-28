import { test, expect, type Page } from '@playwright/test'
import { mockApi, seedState } from './mocks'

// Desktop reachability of the side-scrolling rows.
//
// Every horizontal row in the app (`.subtabs`, `.rail`, `.operator__tabs`, the
// birthday strip, the DrawPad bars) hides its scrollbar for calm. On a touch screen
// you swipe them. On a DESKTOP that used to hide content outright: no scrollbar to
// drag, no swipe, and a mouse wheel only emits deltaY — which no browser maps onto a
// horizontal scroller. Réglages ▸ Régler ▸ Système has nine subs (« Tablettes
// jumelées » … « Diagnostics »); the ones past the right edge were unclickable.
//
// The fix is lib/hscroll.ts (`useHScroll`): it maps the wheel and drives the ‹ ›
// chevrons SubTabs renders while the row overflows. Guard both paths here.
//
// A desktop viewport ≥60rem is deliberate: that's where the Réglages nav becomes a
// sidebar, so the panel (and its sub row) is narrower than the window — the exact
// geometry that made the row overflow on a big screen.
const DESKTOP = { width: 1024, height: 800 }

// The subs row, not the « Comprendre / Régler » lens toggle above it (`.operator__lens`).
const SUBS = '.operator__panel .subtabs:not(.operator__lens)'

async function boot(page: Page) {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.setViewportSize(DESKTOP)
  await mockApi(page)
  await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', calm: true, surface: 'mobile' })
  await page.goto('/settings?tab=settings&lens=regler')
  await page.locator(SUBS).waitFor({ state: 'visible', timeout: 15_000 })
  await page.evaluate(() => (document as any).fonts?.ready).catch(() => {})
}

const metrics = (page: Page) =>
  page.locator(SUBS).evaluate((el) => ({
    scrollLeft: el.scrollLeft,
    scrollWidth: el.scrollWidth,
    clientWidth: el.clientWidth,
  }))

test.describe('side-scrolling rows stay reachable with a mouse', () => {
  test('the Système sub row really does overflow on a desktop', async ({ page }) => {
    await boot(page)
    const m = await metrics(page)
    // The precondition of the whole bug. If this ever stops being true the row got
    // narrower/shorter and the rest of this file is testing nothing — fail loudly.
    expect(m.scrollWidth, 'nine subs must outgrow the settings panel').toBeGreaterThan(m.clientWidth + 1)
  })

  test('a vertical mouse wheel scrolls the row sideways', async ({ page }) => {
    await boot(page)
    const row = page.locator(SUBS)
    const box = (await row.boundingBox())!
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.wheel(0, 240) // deltaY only — what a mouse (not a trackpad) emits
    await expect.poll(async () => (await metrics(page)).scrollLeft).toBeGreaterThan(0)
  })

  test('the wheel is handed back to the page at the end of the row (no wheel trap)', async ({ page }) => {
    await boot(page)
    const row = page.locator(SUBS)
    const box = (await row.boundingBox())!
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    // Overscroll hard: once pinned at the right edge the row must stop swallowing the
    // wheel, otherwise hovering it would freeze the page's own scrolling.
    for (let i = 0; i < 12; i++) await page.mouse.wheel(0, 300)
    const m = await metrics(page)
    expect(m.scrollLeft).toBeGreaterThanOrEqual(m.scrollWidth - m.clientWidth - 2)
  })

  test('the ‹ › chevrons page the row and reach the last sub', async ({ page }) => {
    await boot(page)
    const next = page.getByRole('button', { name: 'Onglets suivants' })
    const prev = page.getByRole('button', { name: 'Onglets précédents' })
    // Rendered only while the row overflows; hidden on coarse pointers by CSS.
    await expect(next).toBeVisible()
    // At rest the row sits at the start, so "previous" has nothing to do.
    await expect(prev).toBeDisabled()

    const tabs = page.locator(`${SUBS} [role="tab"]`)
    const last = tabs.last()
    await expect(last).not.toBeInViewport()

    // Page along until the chevron disables itself at the far end. The click is
    // tolerant: the chevron disables the moment the row hits its right edge, which can
    // land between our isDisabled() read and Playwright's own enabled-check.
    for (let i = 0; i < 8; i++) {
      if (await next.isDisabled()) break
      await next.click({ timeout: 1500 }).catch(() => {})
    }
    await expect(next).toBeDisabled()

    await expect(last).toBeInViewport()
    await expect(prev).toBeEnabled()
    // The whole point: the last sub is now clickable, and selecting it works.
    await last.click()
    await expect(last).toHaveAttribute('aria-selected', 'true')
  })

  test('a deep-linked sub is scrolled into view instead of hiding off-edge', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.setViewportSize(DESKTOP)
    await mockApi(page)
    await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', calm: true, surface: 'mobile' })
    // 'system' is the LAST of the nine subs — off the right edge on first paint.
    await page.goto('/settings?tab=settings&lens=regler&sub=system')
    await page.locator(SUBS).waitFor({ state: 'visible', timeout: 15_000 })
    const active = page.locator(`${SUBS} [role="tab"][aria-selected="true"]`)
    await expect(active).toBeInViewport()
  })
})

// The THEMED TAB row had the same defect the sub row above already fixed, and it went
// unnoticed because the finding that named it also named a component that no longer
// exists (a second wrapping `OperatorJump` row — deleted). What survived re-checking:
// under 60rem the tab nav is a ONE-LINE scroll row with a hidden scrollbar, and a
// deep-linked tab beyond its right edge was lit but invisible, with no way to know the
// page had responded at all. `SubTabs` solved this internally with `hs.toView`; the
// tab row is hand-rolled in Operator.tsx and had no equivalent.
test('a deep-linked THEMED TAB is scrolled into view, not left off-edge', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  // Narrow: above 60rem the nav is a vertical sidebar and nothing overflows sideways.
  await page.setViewportSize({ width: 390, height: 844 })
  await mockApi(page)
  await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile' })
  // « Système » is the LAST themed tab — off the right edge on first paint at 390px.
  await page.goto('/settings?tab=settings')
  const tabs = page.locator('.operator__tabs')
  await tabs.waitFor({ state: 'visible', timeout: 15_000 })
  const active = tabs.locator('[role="tab"][aria-selected="true"]')
  await expect(active).toBeInViewport()
})
