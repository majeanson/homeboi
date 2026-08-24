import { test, expect, type Page } from '@playwright/test'
import { mockApi, seedState, type Theme } from './mocks'

// Visual sweep for « Le cercle » — now Maison's Famille/Social sections (the nav
// restructure merged the old standalone Le cercle tab into /maison) — NOT covered
// by screenshots.spec.ts (which only visits /maison and /notes bare). Shoots the
// populated people graph so the new family COLOURS + the generational grouping are
// actually visible: the Liste directory, the Liens (ego) graph, and the Arbre
// (tree). Famille (Maisonnée + Famille Tremblay) and Social (Amis / Collègues /
// Autres), day + night, phone + wall. Writes PNGs to e2e/screenshots/cercle-*.png
// for human/agent review.

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
  // Social shows the whole web at once. Liens = your circles as named islands
  // (CercleWeb); Arbre = each friend's family as its own framed tree, side by side,
  // joined by dashed friendships (CercleTree social). Both live in a PanZoom.
  { name: 'social-links', q: 'section=social&view=links', ready: '.cercle-web .cercle-tree__svg' },
  { name: 'social-tree', q: 'section=social&view=tree', ready: '.tree-frame__box' },
]

async function settle(page: Page, ready: string) {
  await page.locator(ready).first().waitFor({ state: 'visible', timeout: 15_000 }).catch(() => {})
  await page.evaluate(() => (document as any).fonts?.ready).catch(() => {})
  await page.waitForTimeout(500)
}

// NOTE: Maison's Famille/Social sections (ex-« Le cercle ») are deliberately EXEMPT
// from the app-wide no-horizontal-overflow rule — its pan/zoom trees + graphics
// (Liens/Arbre/Web) and wide member/group rows are allowed to scroll sideways here
// (a product decision). So these specs only capture screenshots for review; the
// overflow guard stays enforced on every OTHER surface (screenshots.spec.ts
// OVERFLOW_CASES, longtext.spec.ts).

for (const state of STATES) {
  for (const theme of THEMES) {
    for (const format of FORMATS) {
      const label = `cercle-${state.name}-${theme}-${format.name}`
      test(label, async ({ page }) => {
        await page.setViewportSize({ width: format.width, height: format.height })
        await mockApi(page)
        await seedState(page, { theme, audience: 'parent', lang: 'fr', calm: true, surface: format.surface })
        await page.goto(`/maison?${state.q}`)
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
  await page.goto('/maison?section=family')
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
  await page.goto('/maison?section=family')
  await settle(page, '.cercle-group')
  await expect(page.locator('.joindre')).toHaveCount(0)
})

// Regression guard: the rail is a Rail (its own inner strip scrolls sideways on
// overflow, per CLAUDE.md Horizontal overflow) but its OUTER wrapper must still sit
// fully inside the viewport at the tightest phone widths — it must never be the
// thing that forces the whole page to pan. Checked at both 360 and 390 (Maison's
// Famille/Social sections themselves stay exempt from the app-wide guard for their
// pan/zoom trees; the rail is not one of those, so it gets its own hard assertion
// here).
for (const width of [360, 390]) {
  test(`joindre rail never bleeds off the right edge @phone-${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 })
    await mockApi(page)
    await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', calm: true, surface: 'mobile' })
    await page.goto('/maison?section=family')
    await settle(page, '.joindre')
    await expect(page.locator('.joindre')).toBeVisible()
    const bleed = await page.evaluate(() => {
      const rail = document.querySelector('.joindre') as HTMLElement
      return rail.getBoundingClientRect().right - document.documentElement.clientWidth
    })
    expect(bleed, 'joindre rail bleeds off the right edge').toBeLessThanOrEqual(1)
  })
}

// ── Social ▸ Liens: the circles are legible ──────────────────────────────────
// The regression this guards: Liens used to group people by connected component, and
// because a « friends »-kind group makes its members a clique, the whole social web
// collapsed into ONE ring — whose radius was capped by a constant, so eighteen faces
// were dealt onto a circle with room for nine and the avatars sat on top of each other.
// Now each named group / detected family is its own island, sized from its count.
//
// Measured on the DISCS (`.avatar`), because that is what visibly overlapped. Two faces
// may have neighbouring label boxes; two faces must never have touching discs.
for (const width of [390, 1280]) {
  test(`social links — no two faces overlap @${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await mockApi(page)
    await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', calm: true, surface: width < 700 ? 'mobile' : 'kiosk' })
    await page.goto('/maison?section=social&view=links')
    await settle(page, '.cercle-web .cercle-tree__svg')

    const worst = await page.evaluate(() => {
      const discs = [...document.querySelectorAll('.cercle-web .ego-node .avatar')] as HTMLElement[]
      const circles = discs.map((d) => {
        const r = d.getBoundingClientRect()
        return { x: r.left + r.width / 2, y: r.top + r.height / 2, d: r.width }
      })
      let ratio = Infinity // (centre distance) / (disc diameter); < 1 means overlap
      for (let i = 0; i < circles.length; i++)
        for (let j = i + 1; j < circles.length; j++) {
          const a = circles[i]
          const b = circles[j]
          ratio = Math.min(ratio, Math.hypot(a.x - b.x, a.y - b.y) / Math.max(a.d, b.d))
        }
      return { count: circles.length, ratio }
    })
    expect(worst.count, 'no faces drawn in Social Liens').toBeGreaterThan(6)
    expect(worst.ratio, 'two faces overlap in Social Liens').toBeGreaterThanOrEqual(0.99)
  })
}

test('social links — each circle is its own named island, not one blob', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await mockApi(page)
  await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', calm: true, surface: 'kiosk' })
  await page.goto('/maison?section=social&view=links')
  await settle(page, '.cercle-web .cercle-tree__svg')

  // Famille Gagnon + Famille Roy (auto-detected) + Le hockey + Collègues + Autres.
  expect(await page.locator('.cercle-web .world-island').count()).toBeGreaterThanOrEqual(4)
  const labels = await page.locator('.cercle-web .world-island__label').allTextContents()
  expect(labels).toContain('Le hockey')
  expect(labels.some((l) => l.includes('Gagnon'))).toBe(true)
  expect(labels.some((l) => l.includes('Roy'))).toBe(true)
  // A person who ties two circles draws a bridge between them.
  expect(await page.locator('.cercle-web .world-bridge').count()).toBeGreaterThan(0)
})

// ── Social ▸ Arbre: each friend's family, joined by their friendships ────────
test('social tree — families are framed, and friendships connect them', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await mockApi(page)
  await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', calm: true, surface: 'kiosk' })
  await page.goto('/maison?section=social&view=tree')
  await settle(page, '.tree-frame__box')

  // Sophie's family and Thomas's family each get their own named frame…
  const frames = await page.locator('.tree-frame__label').allTextContents()
  expect(frames.some((f) => f.includes('Gagnon'))).toBe(true)
  expect(frames.some((f) => f.includes('Roy'))).toBe(true)
  // …the friendships between them are drawn (dashed), and blood ties still are too.
  expect(await page.locator('.tree-edge--social').count()).toBeGreaterThan(0)
  expect(await page.locator('.tree-edge:not(.tree-edge--social)').count()).toBeGreaterThan(0)

  // Sophie ↔ Thomas are friends and both parents, so the alignment puts them level:
  // the friendship reads as a horizontal line rather than a diagonal across the forest.
  const y = async (name: string) => {
    const box = await page.locator(`.cercle-tree .ego-node[aria-label*="${name}"] .avatar`).first().boundingBox()
    return box!.y + box!.height / 2
  }
  expect(Math.abs((await y('Sophie')) - (await y('Thomas')))).toBeLessThan(2)
  expect(await y('Zoé')).toBeGreaterThan(await y('Sophie')) // children below their parents
  // A friend with no family of their own is still drawn (a tree of one), not dropped.
  // (Luc Bélanger's display name is his nickname — fullName() prefers it.)
  await expect(page.locator('.cercle-tree .ego-node[aria-label="Voisin"]')).toHaveCount(1)
})

// Toddler « Qui est-ce ? » faces grid — its own audience/layout, day + night phone.
for (const theme of THEMES) {
  const label = `cercle-toddler-${theme}-phone`
  test(label, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await mockApi(page)
    await seedState(page, { theme, audience: 'toddler', lang: 'fr', calm: true, surface: 'mobile' })
    // A bare toddler /maison renders KidView (Routines' picture-story run, the
    // default section) — ?section=family is what shows the circle faces grid.
    await page.goto('/maison?section=family')
    await settle(page, '.cercle-kid__grid')
    await page.screenshot({ path: `e2e/screenshots/${label}.png`, fullPage: true })
  })
}
