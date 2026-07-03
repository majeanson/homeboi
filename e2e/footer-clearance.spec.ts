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
  { name: 'phone-360', width: 360, height: 800 },
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

// Returns the list of interactive elements a phone user can't reach after scrolling
// to the bottom, in two flavours (each label is prefixed so the failure says which):
//   • "under-nav: …"  — the control's visible centre is painted over by the fixed
//                        bottom nav.
//   • "off-right: …"  — the control extends past the right viewport edge, so its tap
//                        target is (partly) off-screen and the layout has overflowed.
// An empty array = every control clears the footer AND sits within the width.
async function occludedControls(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    // A control legitimately sitting inside a horizontal scroller (subtabs, chip/tag
    // rows, timer rail) is MEANT to run past the edge — you scroll to it. Only flag
    // "off-right" when no ancestor is an actually-scrollable horizontal container.
    const inHScroller = (el: Element): boolean => {
      let p = el.parentElement
      while (p && p !== document.body) {
        const ox = getComputedStyle(p).overflowX
        if ((ox === 'auto' || ox === 'scroll') && p.scrollWidth > p.clientWidth + 1) return true
        p = p.parentElement
      }
      return false
    }
    const labelOf = (el: Element) =>
      (el.textContent || (el as HTMLInputElement).placeholder || el.getAttribute('aria-label') || el.className || el.tagName).trim().slice(0, 60)

    const body = document.querySelector('.hub__body')
    if (!body) return []
    const controls = body.querySelectorAll('button, a, input, textarea, select, [role="button"]')
    const hidden: string[] = []

    const nav = document.querySelector('.hubnav') as HTMLElement | null
    const navBox = nav?.getBoundingClientRect()
    // Only a FIXED bottom bar can occlude page content. If the nav isn't pinned to
    // the bottom (kiosk left column / narrow-width top row), the under-nav check is off.
    const barFixed = !!nav && !!navBox && getComputedStyle(nav).position === 'fixed' && navBox.top > window.innerHeight / 2

    controls.forEach((el) => {
      const r = el.getBoundingClientRect()
      if (r.width === 0 || r.height === 0) return // not rendered

      // Off-right: any part of the control is past the right edge and it isn't inside
      // a sideways scroller → its tap target is stranded off-screen (width overflow).
      if (r.right > window.innerWidth + 1 && !inHScroller(el)) {
        hidden.push(`off-right: ${labelOf(el)}`)
      }

      // Under-nav: centre sits within the fixed bar's band, and the nav actually
      // paints over that point (elementFromPoint is the nav / a descendant) — a
      // control merely *near* the bar isn't a bug.
      if (barFixed && navBox) {
        const cy = r.top + r.height / 2
        const cx = r.left + r.width / 2
        if (cy > navBox.top && cy < window.innerHeight) {
          const hit = document.elementFromPoint(cx, cy)
          if (hit && (nav === hit || nav.contains(hit))) hidden.push(`under-nav: ${labelOf(el)}`)
        }
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
