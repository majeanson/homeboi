import { test as base, expect, type Page } from '@playwright/test'
import { mockApi, seedState, type Audience, type Lang, type Surface } from './mocks'

// "All platforms" layout guard. screenshots.spec.ts already hard-asserts no
// horizontal overflow on the PHONE (390px) for every tab; footer-clearance.spec
// does the fixed-bottom-nav occlusion check on the phone. The dimension neither
// covers is the BIGGER surfaces a Babillard actually runs on:
//   • a wall tablet in PORTRAIT (a cheap always-on tablet is often portrait), and
//   • a wall display / landscape tablet (kiosk).
// Both render the KIOSK surface (glance dashboard, left-column nav) whose column
// counts and grids differ from the phone — a place layouts silently overflow or
// split content onto an extra line. This sweep walks ALL SIX hub tabs (incl.
// Famille — the old « Le cercle » tab's people graphs, absent from every other
// hard layout assertion) across those two
// formats, in parent + toddler, FR + EN on the wrap-prone tabs, and:
//   1. asserts the surface actually painted content (not a blank/crashed frame),
//   2. asserts NO horizontal overflow (document + the .hub__body scroller),
//   3. asserts no interactive control is hidden behind a fixed bottom nav
//      (a no-op on kiosk, where the nav is a left column — the probe self-adapts),
//   4. writes lo-*.png for human/agent review of wrap/spacing the assertions miss
//      ("information split onto multiple lines" isn't an overflow, only eyeballable).
// Crash-smoke guarded: any pageerror fails the case.
const test = base.extend({
  page: async ({ page }, use) => {
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(e.message))
    await use(page)
    expect(errors, 'pageerror during the layout sweep').toEqual([])
  },
})

// The two kiosk formats the phone sweep never exercises. 834px (iPad Air portrait)
// sits in the 720→900 breakpoint gap, a genuinely distinct layout from both the
// 390 phone and the 1280 wall.
const FORMATS = [
  { name: 'tablet', width: 834, height: 1112, surface: 'kiosk' as Surface },
  { name: 'wall', width: 1280, height: 800, surface: 'kiosk' as Surface },
]

type Tab = { name: string; path: string; audiences: Audience[]; en: boolean }
// `en: true` adds an English pass (FR→EN length changes break kiosk grids most on
// the text-dense tabs). Settings is parent-only (operator hub).
const TABS: Tab[] = [
  { name: 'board', path: '/board', audiences: ['parent', 'toddler'], en: true },
  { name: 'kitchen', path: '/kitchen', audiences: ['parent', 'toddler'], en: true },
  // « Le cercle » + Routines merged into Maison (Routines is its default section —
  // a bare /maison covers the old /routines case); Famille (?section=family, the
  // old cercle tab's own default) still carries the member/group graphs, so it
  // gets its own pass. « Les notes » split out of cercle into its own hub tab.
  { name: 'maison', path: '/maison', audiences: ['parent', 'toddler'], en: false },
  { name: 'maison-family', path: '/maison?section=family', audiences: ['parent', 'toddler'], en: true },
  { name: 'notes', path: '/notes', audiences: ['parent', 'toddler'], en: true },
  { name: 'liste', path: '/liste', audiences: ['parent', 'toddler'], en: false },
  { name: 'settings', path: '/settings', audiences: ['parent'], en: true },
  // The Système themed tab carries the widest pill rows in Réglages (a 9-sub
  // SubTabs row + the lens toggle) — the likeliest place a settings row overflows.
  { name: 'settings-systeme', path: '/settings?tab=settings', audiences: ['parent'], en: true },
]

async function settle(page: Page) {
  await page.locator('.hub__body').first().waitFor({ state: 'visible', timeout: 15_000 }).catch(() => {})
  await page.evaluate(() => (document as any).fonts?.ready).catch(() => {})
  await page.waitForTimeout(500)
}

// doc OR the inner hub scroller wider than its client box = a real horizontal
// overflow. The .hubnav row is intentionally horizontal-scroll and lives outside
// .hub__body, so it's (correctly) excluded.
async function hOverflow(page: Page): Promise<string> {
  return page.evaluate(() => {
    const doc = document.documentElement
    const body = document.querySelector('.hub__body')
    if (doc.scrollWidth > doc.clientWidth + 1) return 'doc-overflow'
    if (body && body.scrollWidth > body.clientWidth + 1) return 'body-overflow'
    return 'ok'
  })
}

// Controls whose visible centre is painted over by a FIXED bottom nav. Returns []
// when the nav isn't a pinned bottom bar (kiosk left column), so it's a safe no-op
// on the wall while still catching a regression if a format ever pins the nav.
async function occluded(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const nav = document.querySelector('.hubnav') as HTMLElement | null
    if (!nav) return []
    const navBox = nav.getBoundingClientRect()
    if (!(getComputedStyle(nav).position === 'fixed' && navBox.top > window.innerHeight / 2)) return []
    const scope = document.querySelector('.hub__body')
    if (!scope) return []
    const out: string[] = []
    scope.querySelectorAll('button, a, input, textarea, select, [role="button"]').forEach((el) => {
      const r = el.getBoundingClientRect()
      if (r.width === 0 || r.height === 0) return
      const cy = r.top + r.height / 2
      const cx = r.left + r.width / 2
      if (!(cy > navBox.top && cy < window.innerHeight)) return
      const hit = document.elementFromPoint(cx, cy)
      if (hit && (nav === hit || nav.contains(hit))) {
        out.push((el.textContent || (el as HTMLInputElement).placeholder || el.getAttribute('aria-label') || el.className || el.tagName).trim().slice(0, 50))
      }
    })
    return [...new Set(out)]
  })
}

async function scrollToBottom(page: Page) {
  await page.evaluate(() => {
    const body = document.querySelector('.hub__body') as HTMLElement | null
    if (body) body.scrollTop = body.scrollHeight
  })
  await page.waitForTimeout(300)
}

for (const format of FORMATS) {
  for (const tab of TABS) {
    for (const audience of tab.audiences) {
      const langs: Lang[] = tab.en ? ['fr', 'en'] : ['fr']
      for (const lang of langs) {
        const label = `lo-${format.name}-${tab.name}-${audience}${lang === 'en' ? '-en' : ''}`
        test(label, async ({ page }) => {
          await page.setViewportSize({ width: format.width, height: format.height })
          await mockApi(page)
          await seedState(page, { theme: 'day', audience, lang, calm: true, surface: format.surface })
          await page.goto(tab.path)
          await settle(page)

          // 1. Painted content (not a blank/crashed kiosk frame).
          await expect
            .poll(async () => (await page.locator('.hub__body').innerText()).trim().length, { timeout: 8000 })
            .toBeGreaterThan(10)

          // 2. No horizontal overflow (settles after the web-font swap).
          await expect
            .poll(() => hOverflow(page), { timeout: 6000, intervals: [200, 400, 800] })
            .toBe('ok')

          // 4. Review frame BEFORE scrolling (the glance state).
          await page.screenshot({ path: `e2e/screenshots/${label}.png`, fullPage: true })

          // 3. Scroll to the end and confirm nothing strands under a fixed nav.
          await scrollToBottom(page)
          expect(await occluded(page), `controls hidden behind the bottom nav on ${tab.path} [${audience}/${lang}/${format.name}]`).toEqual([])
        })
      }
    }
  }
}

// ─────────────────── the widths between and beyond the formats ───────────────
//
// AUJOURDHUI §7: "untested intermediate widths — 520–680px (tablet transition) +
// 1500px+ ultra-wide have no e2e frame", plus the 320px landscape/very-narrow
// phone. The board is where width actually changes behaviour — `colsFor`
// (lib/widgetGrid) counts the columns in JS so a card's size can be CLAMPED
// against the count, which is precisely the code that misbehaves at a boundary:
// too many columns and the glance goes diffuse, too few and a size-3 card
// overflows the viewport instead of shrinking.
//
// Deliberately narrow: the board only, parent only, FR only — four extra cases,
// not another full matrix. The full FORMATS×TABS sweep above already owns the
// tab-by-tab coverage; what's missing is purely the width axis.
const WIDTHS = [
  // 320px: the narrowest phone still in the wild, and the width the old
  // `columns: 300px` masonry could not fit (a card wider than the screen). The
  // grid is JS-counted now, so this must resolve to a single column.
  { name: 'w320', width: 320, height: 640, surface: 'mobile' as Surface, cols: { min: 1, max: 1 } },
  // 568px: a phone in LANDSCAPE. Two columns fit comfortably here.
  { name: 'w568', width: 568, height: 320, surface: 'mobile' as Surface, cols: { min: 2, max: 2 } },
  // 667px: the top of the "tablet transition" gap the sweep jumps over (390 → 834).
  { name: 'w667', width: 667, height: 900, surface: 'mobile' as Surface, cols: { min: 2, max: 2 } },
  // 1600px and 2560px: ultra-wide walls. The count is NOT pinned exactly here — it
  // depends on the kiosk nav's width and on `colMin` being 340 rather than 300 on a
  // kiosk (cards are read from across the room) — so what's asserted is the property
  // that matters: it never exceeds `maxCols`. Without that cap a 4K wall would keep
  // adding columns until the glance went diffuse, which is the AUJOURDHUI §7 worry.
  // 2560 is the one that proves the cap: uncapped it would ask for ~6 columns.
  { name: 'w1600', width: 1600, height: 900, surface: 'kiosk' as Surface, cols: { min: 3, max: 4 } },
  { name: 'w2560', width: 2560, height: 1080, surface: 'kiosk' as Surface, cols: { min: 4, max: 4 } },
]

for (const w of WIDTHS) {
  test(`lo-board-${w.name}`, async ({ page }) => {
    await page.setViewportSize({ width: w.width, height: w.height })
    await mockApi(page)
    await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', calm: true, surface: w.surface })
    await page.goto('/board')
    await settle(page)

    await expect
      .poll(async () => (await page.locator('.hub__body').innerText()).trim().length, { timeout: 8000 })
      .toBeGreaterThan(10)
    await expect
      .poll(() => hOverflow(page), { timeout: 6000, intervals: [200, 400, 800] })
      .toBe('ok')

    // The column count the width should resolve to. `--wg-cols` is what the grid
    // actually laid out with, so this pins the boundary behaviour rather than just
    // "nothing overflowed" — including the ultra-wide cap.
    const cols = await page
      .locator('.wg[data-zone="grid"]')
      .first()
      .evaluate((el) => Number(getComputedStyle(el).getPropertyValue('--wg-cols')))
    expect(cols, `column count at ${w.width}px`).toBeGreaterThanOrEqual(w.cols.min)
    expect(cols, `column count at ${w.width}px`).toBeLessThanOrEqual(w.cols.max)

    // No card may render wider than the grid that holds it — the clamp `colsFor`
    // exists for. Measured, because a too-wide card is CLIPPED by the container's
    // overflow-x:hidden and so is invisible to a scrollWidth check.
    const spill = await page.evaluate(() => {
      const grid = document.querySelector('.wg[data-zone="grid"]')
      if (!grid) return []
      const box = grid.getBoundingClientRect()
      return [...grid.querySelectorAll('.wg-slot')]
        .filter((el) => !el.hasAttribute('hidden'))
        .filter((el) => el.getBoundingClientRect().right > box.right + 1)
        .map((el) => el.getAttribute('data-card') || '?')
    })
    expect(spill, 'cards wider than the board grid').toEqual([])

    // Every visible card is a NAMED region. `grid-auto-flow: dense` can pull a later
    // card up into an earlier hole, so on a wide board the visual order departs from
    // the DOM (tab) order — which is exactly when a keyboard/AT user needs to jump to
    // a card by name instead of tabbing the whole wall. A bare <section> has no
    // accessible name and is therefore not a landmark at all, so this is the
    // assertion that keeps the board navigable (AUJOURDHUI §7 focus order).
    const unnamed = await page.evaluate(() =>
      [...document.querySelectorAll('.wg-slot')]
        .filter((el) => !el.hasAttribute('hidden'))
        .filter((el) => !(el.getAttribute('aria-label') || '').trim())
        .map((el) => el.getAttribute('data-card') || '?'),
    )
    expect(unnamed, 'board cards with no accessible name (not exposed as regions)').toEqual([])

    await page.screenshot({ path: `e2e/screenshots/lo-board-${w.name}.png`, fullPage: true })
  })
}
