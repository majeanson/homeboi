import { test as base, expect, type Page } from '@playwright/test'
import { mockApi, seedState, type Surface } from './mocks'

// Screenshot-review loop, iteration 5: LONG-TEXT stress. Every text field carries
// a long phrase + an unbreakable long word (mockApi({ longText: true })). Catches
// truncation/overflow/word-break bugs the tidy fixtures hide. The hard assertion
// is "no horizontal overflow" (doc + the hub scroller); screenshots (lt-*.png)
// are for eyeballing vertical/wrap issues. Crash-smoke guarded.
const test = base.extend({
  page: async ({ page }, use) => {
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(e.message))
    await use(page)
    expect(errors, 'pageerror under long text').toEqual([])
  },
})

const FORMATS = [
  { name: 'phone', w: 390, h: 844, surface: 'mobile' as Surface },
  { name: 'wall', w: 1280, h: 800, surface: 'kiosk' as Surface },
]

async function noHOverflow(page: Page): Promise<string> {
  return page.evaluate(() => {
    // On failure, NAME the widest offender: an overflow here has twice been
    // CI-only (Linux system-font metrics — ui-monospace runs wider than on
    // Windows/macOS), so the log must be actionable without reproducing locally.
    const brief = (el: Element) => {
      const cls = (el as HTMLElement).className
      const c = typeof cls === 'string' && cls.trim() ? '.' + cls.trim().split(/\s+/).slice(0, 3).join('.') : ''
      return el.tagName.toLowerCase() + c
    }
    const widest = (root: Element): string => {
      const limit = root.getBoundingClientRect().right
      let worst: Element | null = null
      let over = 1
      for (const el of Array.from(root.querySelectorAll('*'))) {
        const d = el.getBoundingClientRect().right - limit
        if (d > over) {
          over = d
          worst = el
        }
      }
      return worst ? ` (${brief(worst)} +${Math.round(over)}px)` : ''
    }
    const doc = document.documentElement
    const body = document.querySelector('.hub__body')
    if (doc.scrollWidth > doc.clientWidth + 1) return 'doc-overflow' + widest(doc)
    if (body && body.scrollWidth > body.clientWidth + 1) return 'body-overflow' + widest(body)
    return 'ok'
  })
}

// All SIX hub tabs. « Le cercle » used to be one of them; the nav restructure
// merged it into Maison (Routines · Famille · Social · Business · Carnets) and
// split its notes board out into its own « Les notes » tab — both covered here.
// Famille (?section=family) is the one with the long member/group names + graph
// labels that are a prime overflow risk (the exemption below moves with it — bare
// /maison lands on Routines by default, which never carried that risk).
const SURFACES = [
  { name: 'board', path: '/board' },
  { name: 'kitchen', path: '/kitchen' },
  { name: 'maison', path: '/maison' },
  { name: 'maison-family', path: '/maison?section=family' },
  { name: 'notes', path: '/notes' },
  { name: 'liste', path: '/liste' },
  { name: 'settings', path: '/settings' },
]
// The surface exempt from the no-horizontal-overflow rule (pan/zoom trees +
// graphics legitimately scroll sideways there — a product decision, inherited
// from the old « Le cercle » tab's Famille/Social section). Screenshot +
// crash-smoke still run for it; every other surface stays guarded.
const OVERFLOW_EXEMPT = '/maison?section=family'
// The audience-aware tabs also render a TODDLER lens off the same (now long) data —
// big tiles + faces wrap differently and must not overflow either. Settings is
// parent-only.
const TODDLER_SURFACES = [
  { name: 'board', path: '/board' },
  { name: 'kitchen', path: '/kitchen' },
  { name: 'maison', path: '/maison' },
  { name: 'maison-family', path: '/maison?section=family' },
  { name: 'notes', path: '/notes' },
  { name: 'liste', path: '/liste' },
]

for (const f of FORMATS) {
  for (const { name, path } of SURFACES) {
    test(`lt ${f.name}: ${name}`, async ({ page }) => {
      await page.setViewportSize({ width: f.w, height: f.h })
      await mockApi(page, { longText: true })
      await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', calm: true, surface: f.surface })
      await page.goto(path)
      await page.locator('.hub__body').waitFor({ state: 'visible', timeout: 15_000 })
      await page.waitForTimeout(700)
      await page.screenshot({ path: `e2e/screenshots/lt-${f.name}-${name}.png`, fullPage: false })
      if (path !== OVERFLOW_EXEMPT)
        await expect.poll(() => noHOverflow(page), { timeout: 6000, intervals: [200, 400, 800] }).toBe('ok')
    })
  }

  for (const { name, path } of TODDLER_SURFACES) {
    test(`lt ${f.name}: ${name} (toddler)`, async ({ page }) => {
      await page.setViewportSize({ width: f.w, height: f.h })
      await mockApi(page, { longText: true })
      await seedState(page, { theme: 'day', audience: 'toddler', lang: 'fr', calm: true, surface: f.surface })
      await page.goto(path)
      await page.locator('.hub__body').waitFor({ state: 'visible', timeout: 15_000 })
      await page.waitForTimeout(700)
      await page.screenshot({ path: `e2e/screenshots/lt-${f.name}-${name}-toddler.png`, fullPage: false })
      if (path !== OVERFLOW_EXEMPT)
        await expect.poll(() => noHOverflow(page), { timeout: 6000, intervals: [200, 400, 800] }).toBe('ok')
    })
  }
}

// ── "In use" under long text: the full-screen overlays/scenes ────────────────
// These take over the viewport, so a long unbreakable string overflows the DOCUMENT
// (not a .hub__body scroller). Assert no horizontal overflow at the document level
// AND inside the overlay's own root, so a stranded wide child is caught even if the
// page lets it scroll. Screenshots remain for eyeballing wrap/spacing.
async function docOverflow(page: Page, root: string): Promise<string> {
  return page.evaluate((sel) => {
    const doc = document.documentElement
    if (doc.scrollWidth > doc.clientWidth + 1) return 'doc-overflow'
    const el = document.querySelector(sel) as HTMLElement | null
    if (el && el.scrollWidth > el.clientWidth + 1) return 'root-overflow'
    return 'ok'
  }, root)
}

// Each overlay is checked at BOTH phone widths — 360 (narrow Android) is where a
// long unbreakable word first pushes a scene root past the viewport. The 360 shot is
// suffixed so both frames survive for review.
for (const w of [360, 390]) {
  const sfx = w === 390 ? '' : `-${w}`

  test(`lt phone${sfx}: recipe sheet long title`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: 844 })
    await mockApi(page, { longText: true })
    await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', calm: true, surface: 'mobile' })
    await page.goto('/kitchen')
    await page.locator('.hub__body').waitFor({ state: 'visible', timeout: 15_000 })
    await page.getByRole('tab', { name: /Recettes/ }).click().catch(() => {})
    await page.waitForTimeout(400)
    await page.locator('.recipe-card').first().click() // → recipe view directly (peek removed)
    await page.locator('.recipe-modal').waitFor({ state: 'visible' })
    await page.waitForTimeout(400)
    await page.screenshot({ path: `e2e/screenshots/lt-recipe-sheet${sfx}.png`, fullPage: false })
    await expect.poll(() => docOverflow(page, '.recipe-modal'), { timeout: 6000, intervals: [200, 400, 800] }).toBe('ok')
  })

  test(`lt phone${sfx}: cashier grid long names`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: 844 })
    await mockApi(page, { longText: true })
    await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', calm: true, surface: 'mobile' })
    await page.goto('/liste')
    await page.locator('.hub__body').waitFor({ state: 'visible', timeout: 15_000 })
    await page.getByRole('button', { name: /Montrer/ }).first().click()
    await page.locator('.cashier__tile').first().waitFor({ state: 'visible', timeout: 15_000 })
    await page.waitForTimeout(400)
    await page.screenshot({ path: `e2e/screenshots/lt-cashier-grid${sfx}.png`, fullPage: false })
    // Long deal names must ellipsize inside the tile, not blow out the grid.
    await expect.poll(() => docOverflow(page, '.cashier'), { timeout: 6000, intervals: [200, 400, 800] }).toBe('ok')
  })

  test(`lt phone${sfx}: cook mode (full) long steps`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: 844 })
    await mockApi(page, { longText: true })
    await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', calm: true, surface: 'mobile' })
    // Straight to cook mode for rc1 (long ingredients/steps under longText).
    await page.goto('/kitchen/recipe/rc1/cook')
    await page.locator('.cook').waitFor({ state: 'visible', timeout: 15_000 })
    await page.waitForTimeout(400)
    await page.screenshot({ path: `e2e/screenshots/lt-cook-full${sfx}.png`, fullPage: false })
    await expect.poll(() => docOverflow(page, '.cook'), { timeout: 6000, intervals: [200, 400, 800] }).toBe('ok')
  })

  test(`lt phone${sfx}: day editor long meal titles`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: 844 })
    await mockApi(page, { longText: true })
    await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', calm: true, surface: 'mobile' })
    await page.goto('/kitchen')
    await page.locator('.hub__body').waitFor({ state: 'visible', timeout: 15_000 })
    await page.locator('.kitchen__day').first().getByRole('button', { name: /Gérer/ }).click()
    await page.locator('.scene .day-mng__sec').first().waitFor({ state: 'visible', timeout: 15_000 })
    await page.waitForTimeout(400)
    await page.screenshot({ path: `e2e/screenshots/lt-day-editor${sfx}.png`, fullPage: false })
    await expect.poll(() => docOverflow(page, '.scene'), { timeout: 6000, intervals: [200, 400, 800] }).toBe('ok')
  })

  // « Le cercle » full-screen overview map under long member/group names.
  test(`lt phone${sfx}: cercle « Notre monde » long names`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: 844 })
    await mockApi(page, { longText: true })
    await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', calm: true, surface: 'mobile' })
    await page.goto('/cercle/monde')
    await page.locator('.scene').first().waitFor({ state: 'visible', timeout: 15_000 })
    await page.waitForTimeout(500)
    await page.screenshot({ path: `e2e/screenshots/lt-cercle-monde${sfx}.png`, fullPage: false })
    await expect.poll(() => docOverflow(page, '.scene'), { timeout: 6000, intervals: [200, 400, 800] }).toBe('ok')
  })
}
