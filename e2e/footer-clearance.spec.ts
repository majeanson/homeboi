import { test, expect, type Page } from '@playwright/test'
import { mockApi, seedState, type Audience } from './mocks'

// Mid-session footer-clearance sweep. The earlier screenshots.spec shoots each
// surface fullPage at FIRST PAINT — which never reveals the real bug: on a phone
// the section nav is a FIXED bottom bar, so any interactive element that ends up
// under it (the "Montrer à la caisse" action row, a settings save button…) is
// occluded once you scroll to the bottom. Here we scroll .hub__body to its end,
// take a VIEWPORT-CLIPPED shot (fullPage would hide the overlap), and assert that
// no button/link/input is hidden behind the fixed bar.

type Case = { name: string; path: string; audience: Audience }

const CASES: Case[] = [
  { name: 'board', path: '/board', audience: 'parent' },
  { name: 'kitchen', path: '/kitchen', audience: 'parent' },
  { name: 'routines', path: '/routines', audience: 'parent' },
  { name: 'cercle', path: '/cercle', audience: 'parent' },
  { name: 'liste', path: '/liste', audience: 'parent' },
  { name: 'settings', path: '/settings', audience: 'parent' },
  { name: 'board', path: '/board', audience: 'toddler' },
  { name: 'kitchen', path: '/kitchen', audience: 'toddler' },
  { name: 'routines', path: '/routines', audience: 'toddler' },
  { name: 'cercle', path: '/cercle', audience: 'toddler' },
  { name: 'liste', path: '/liste', audience: 'toddler' },
]

// The mobile surface pins the nav to the bottom at EVERY width (hub.css
// [data-surface='mobile'] .hubnav), so a portrait wall tablet (834px) can strand a
// control under the bar just like the phone — a distinct layout worth its own pass.
const FORMATS = [
  { name: 'phone', width: 390, height: 844 },
  { name: 'tablet', width: 834, height: 1112 },
]

async function settle(page: Page) {
  await page.locator('.hub').first().waitFor({ state: 'visible', timeout: 15_000 }).catch(() => {})
  await page.evaluate(() => (document as any).fonts?.ready).catch(() => {})
  await page.waitForTimeout(400)
}

// Scroll the hub body (the inner scroller) all the way down and let it settle.
async function scrollToBottom(page: Page) {
  await page.evaluate(() => {
    const body = document.querySelector('.hub__body') as HTMLElement | null
    if (body) body.scrollTop = body.scrollHeight
    // The page may itself be the scroller in some layouts — nudge #root too.
    const root = document.getElementById('root')
    if (root) root.scrollTop = root.scrollHeight
  })
  await page.waitForTimeout(300)
}

// Returns the list of interactive elements whose tappable area is occluded by the
// fixed bottom nav (their visible center sits inside the nav's rectangle), after
// scrolling to the bottom. An empty array = every control clears the footer.
async function occludedControls(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const nav = document.querySelector('.hubnav') as HTMLElement | null
    if (!nav) return []
    const navBox = nav.getBoundingClientRect()
    // Only a FIXED bottom bar can occlude page content. If the nav isn't pinned to
    // the bottom (kiosk left column / narrow-width top row), there's nothing to test.
    const fixed = getComputedStyle(nav).position === 'fixed' && navBox.top > window.innerHeight / 2
    if (!fixed) return []
    const body = document.querySelector('.hub__body')
    if (!body) return []
    const controls = body.querySelectorAll('button, a, input, textarea, select, [role="button"]')
    const hidden: string[] = []
    controls.forEach((el) => {
      const r = el.getBoundingClientRect()
      if (r.width === 0 || r.height === 0) return // not rendered
      const cy = r.top + r.height / 2
      const cx = r.left + r.width / 2
      // Center sits within the nav band AND inside the viewport → visually under it.
      const underBar = cy > navBox.top && cy < window.innerHeight
      if (!underBar) return
      // Confirm the nav actually paints over this point (elementFromPoint is the nav
      // or a descendant of it) — a control merely *near* the bar isn't a bug.
      const hit = document.elementFromPoint(cx, cy)
      if (hit && (nav === hit || nav.contains(hit))) {
        const label = (el.textContent || (el as HTMLInputElement).placeholder || el.getAttribute('aria-label') || el.className || el.tagName).trim().slice(0, 60)
        hidden.push(label)
      }
    })
    return [...new Set(hidden)]
  })
}

for (const f of FORMATS) {
  for (const c of CASES) {
    test(`footer-clearance ${f.name} ${c.name}-${c.audience}`, async ({ page }) => {
      await page.setViewportSize({ width: f.width, height: f.height })
      await mockApi(page)
      await seedState(page, { theme: 'day', audience: c.audience, lang: 'fr', calm: true, surface: 'mobile' })
      await page.goto(c.path)
      await settle(page)
      await scrollToBottom(page)
      await page.screenshot({ path: `e2e/screenshots/footer-${f.name}-${c.name}-${c.audience}-bottom.png`, fullPage: false })
      const occluded = await occludedControls(page)
      expect(occluded, `controls hidden behind the fixed bottom nav on ${c.path} [${c.audience}/${f.name}]`).toEqual([])
    })
  }
}
