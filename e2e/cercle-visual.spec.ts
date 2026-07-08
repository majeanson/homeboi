import { test, expect, type Page } from '@playwright/test'
import { mockApi, seedState, type Theme } from './mocks'

// Visual sweep for « Le cercle » — NOT covered by screenshots.spec.ts (which has no
// /cercle stub). Shoots the populated people graph so the new family COLOURS + the
// generational grouping are actually visible: the Liste directory, the Liens (ego)
// graph, and the Arbre (tree). Famille (Maisonnée + Famille Tremblay) and Social
// (Amis / Collègues / Autres), day + night, phone + wall. Writes PNGs to
// e2e/screenshots/cercle-*.png for human/agent review.

const THEMES: Theme[] = ['day', 'night']
const FORMATS = [
  { name: 'phone', width: 390, height: 844, surface: 'mobile' as const },
  { name: 'wall', width: 1280, height: 800, surface: 'kiosk' as const },
]

// section × view states worth a frame. Tree/links carry the new colour+grouping work.
const STATES = [
  { name: 'family-list', q: 'section=family&view=list', ready: '.cercle-group' },
  { name: 'family-tree', q: 'section=family&view=tree', ready: '.cercle-tree__svg' },
  { name: 'family-links', q: 'section=family&view=links', ready: '.cercle-ego__svg' },
  { name: 'social-list', q: 'section=social&view=list', ready: '.cercle-group' },
  // Social Liens/Arbre render the whole social WEB (CercleWeb): clusters of friends
  // (Liens) and the loose blob (Arbre), both inside the PanZoom (.cercle-tree__svg).
  { name: 'social-links', q: 'section=social&view=links', ready: '.cercle-web .cercle-tree__svg' },
  { name: 'social-tree', q: 'section=social&view=tree', ready: '.cercle-web .cercle-tree__svg' },
]

async function settle(page: Page, ready: string) {
  await page.locator(ready).first().waitFor({ state: 'visible', timeout: 15_000 }).catch(() => {})
  await page.evaluate(() => (document as any).fonts?.ready).catch(() => {})
  await page.waitForTimeout(500)
}

// NOTE: « Le cercle » is deliberately EXEMPT from the app-wide no-horizontal-overflow
// rule — its pan/zoom trees + graphics (Liens/Arbre/Web) and wide member/group rows are
// allowed to scroll sideways here (a product decision). So these specs only capture
// screenshots for review; the overflow guard stays enforced on every OTHER surface
// (screenshots.spec.ts OVERFLOW_CASES, longtext.spec.ts).

for (const state of STATES) {
  for (const theme of THEMES) {
    for (const format of FORMATS) {
      const label = `cercle-${state.name}-${theme}-${format.name}`
      test(label, async ({ page }) => {
        await page.setViewportSize({ width: format.width, height: format.height })
        await mockApi(page)
        await seedState(page, { theme, audience: 'parent', lang: 'fr', calm: true, surface: format.surface })
        await page.goto(`/cercle?${state.q}`)
        await settle(page, state.ready)
        await page.screenshot({ path: `e2e/screenshots/${label}.png`, fullPage: true })
      })
    }
  }
}

// « Joindre » (A-6) — the quick-dial rail: present on mobile (the seeded mock has
// several members/contacts with a phone — well above the ≥2 eligible floor), with
// real tel: hrefs on its tiles; absent on the kiosk wall (a shared surface never
// dials out on its own).
test('joindre rail — present on mobile with tel: hrefs', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await mockApi(page)
  await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', calm: true, surface: 'mobile' })
  await page.goto('/cercle')
  await settle(page, '.joindre')
  const items = page.locator('.joindre a.joindre__item')
  await expect(items.first()).toBeVisible()
  expect(await items.count()).toBeGreaterThanOrEqual(2)
  const hrefs = await items.evaluateAll((els) => els.map((el) => el.getAttribute('href')))
  expect(hrefs.every((h) => h?.startsWith('tel:') || h?.startsWith('mailto:'))).toBe(true)
  expect(hrefs.some((h) => h?.startsWith('tel:'))).toBe(true)
})

test('joindre rail — absent on the kiosk wall', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await mockApi(page)
  await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', calm: true, surface: 'kiosk' })
  await page.goto('/cercle')
  await settle(page, '.cercle-group')
  await expect(page.locator('.joindre')).toHaveCount(0)
})

// Regression guard: the rail is a Rail (its own inner strip scrolls sideways on
// overflow, per CLAUDE.md Horizontal overflow) but its OUTER wrapper must still sit
// fully inside the viewport at the tightest phone widths — it must never be the
// thing that forces the whole page to pan. Checked at both 360 and 390 (Le cercle
// itself stays exempt from the app-wide guard for its pan/zoom trees; the rail is
// not one of those, so it gets its own hard assertion here).
for (const width of [360, 390]) {
  test(`joindre rail never bleeds off the right edge @phone-${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 })
    await mockApi(page)
    await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', calm: true, surface: 'mobile' })
    await page.goto('/cercle')
    await settle(page, '.joindre')
    await expect(page.locator('.joindre')).toBeVisible()
    const bleed = await page.evaluate(() => {
      const rail = document.querySelector('.joindre') as HTMLElement
      return rail.getBoundingClientRect().right - document.documentElement.clientWidth
    })
    expect(bleed, 'joindre rail bleeds off the right edge').toBeLessThanOrEqual(1)
  })
}

// Toddler « Qui est-ce ? » faces grid — its own audience/layout, day + night phone.
for (const theme of THEMES) {
  const label = `cercle-toddler-${theme}-phone`
  test(label, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await mockApi(page)
    await seedState(page, { theme, audience: 'toddler', lang: 'fr', calm: true, surface: 'mobile' })
    await page.goto('/cercle')
    await settle(page, '.cercle-kid__grid')
    await page.screenshot({ path: `e2e/screenshots/${label}.png`, fullPage: true })
  })
}
