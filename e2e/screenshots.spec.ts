import { test, expect, type Page } from '@playwright/test'
import { mockApi, seedState, type Audience, type Lang, type Theme } from './mocks'

// Visual sweep: every surface × theme × format (and a language spot-check).
// These are NOT pixel-regression snapshots — they write PNGs to e2e/screenshots
// for human/agent review of style issues across all themes and formats. Run:
//   npx playwright test
// then look at e2e/screenshots/*.png.

type Surface = {
  name: string
  path: string
  audiences: Audience[]
  // A selector that must be visible before we shoot (avoids blank/loading frames).
  ready: string
}

const SURFACES: Surface[] = [
  { name: 'home', path: '/', audiences: ['parent'], ready: '.home__title' },
  { name: 'board', path: '/board', audiences: ['parent', 'toddler'], ready: '.hub' },
  { name: 'kitchen', path: '/kitchen', audiences: ['parent', 'toddler'], ready: '.hub' },
  { name: 'routines', path: '/routines', audiences: ['parent', 'toddler'], ready: '.hub' },
  { name: 'liste', path: '/liste', audiences: ['parent', 'toddler'], ready: '.hub' },
  { name: 'settings', path: '/settings', audiences: ['parent'], ready: '.hub' },
  { name: 'login', path: '/login', audiences: ['parent'], ready: 'form, .page' },
  { name: 'pair', path: '/pair', audiences: ['parent'], ready: '.page' },
]

const THEMES: Theme[] = ['day', 'night']
const FORMATS = [
  { name: 'phone', width: 390, height: 844 },
  { name: 'wall', width: 1280, height: 800 },
]

// NOTE: deliberately NOT using waitForLoadState('networkidle') — the Board polls
// on an interval and React Query refetches, so the network never goes idle and
// the wait would burn the whole test timeout. Instead: wait for the page's ready
// selector, then for webfonts, then a short fixed beat for the entrance fade.
async function settle(page: Page, ready: string) {
  await page.locator(ready).first().waitFor({ state: 'visible', timeout: 15_000 }).catch(() => {})
  await page.evaluate(() => (document as any).fonts?.ready).catch(() => {})
  await page.waitForTimeout(500)
}

for (const surface of SURFACES) {
  for (const audience of surface.audiences) {
    for (const theme of THEMES) {
      for (const format of FORMATS) {
        const label = `${surface.name}-${audience}-${theme}-${format.name}`
        test(label, async ({ page }) => {
          await page.setViewportSize({ width: format.width, height: format.height })
          await mockApi(page)
          await seedState(page, { theme, audience, lang: 'fr', calm: true })
          await page.goto(surface.path)
          await settle(page, surface.ready)
          await page.screenshot({ path: `e2e/screenshots/${label}.png`, fullPage: true })
        })
      }
    }
  }
}

// Language spot-check: English on the busiest surfaces, where FR→EN length
// changes most often break a layout. Day + both formats.
const EN_SURFACES = SURFACES.filter((s) => ['home', 'board', 'kitchen', 'settings'].includes(s.name))
for (const surface of EN_SURFACES) {
  for (const format of FORMATS) {
    const lang: Lang = 'en'
    const label = `${surface.name}-parent-day-${format.name}-en`
    test(label, async ({ page }) => {
      await page.setViewportSize({ width: format.width, height: format.height })
      await mockApi(page)
      await seedState(page, { theme: 'day', audience: 'parent', lang, calm: true })
      await page.goto(surface.path)
      await settle(page, surface.ready)
      await page.screenshot({ path: `e2e/screenshots/${label}.png`, fullPage: true })
    })
  }
}

// A couple of functional smoke assertions so the suite fails loudly if a surface
// stops rendering (not just silently shoots a blank page).
test('board renders household data', async ({ page }) => {
  await mockApi(page)
  await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr' })
  await page.goto('/board')
  await expect(page.locator('.hub')).toBeVisible()
  await expect(page.getByText('Spaghetti maison')).toBeVisible()
})

test('toddler routines reaches the picture-card story', async ({ page }) => {
  await mockApi(page)
  await seedState(page, { theme: 'day', audience: 'toddler', lang: 'fr' })
  await page.goto('/routines')
  await expect(page.locator('.hub')).toBeVisible()
})

// Regression guard: no surface may overflow the viewport horizontally on a phone
// (the standing "mobile-friendly always" rule). Runs FR + EN, parent + toddler.
const OVERFLOW_CASES: { path: string; audience: Audience; ready: string }[] = [
  { path: '/', audience: 'parent', ready: '.home__title' },
  { path: '/board', audience: 'parent', ready: '.hub' },
  { path: '/board', audience: 'toddler', ready: '.hub' },
  { path: '/kitchen', audience: 'parent', ready: '.hub' },
  { path: '/kitchen', audience: 'toddler', ready: '.hub' },
  { path: '/routines', audience: 'parent', ready: '.hub' },
  { path: '/liste', audience: 'parent', ready: '.hub' },
  { path: '/liste', audience: 'toddler', ready: '.hub' },
  { path: '/settings', audience: 'parent', ready: '.hub' },
  { path: '/login', audience: 'parent', ready: '.page' },
  { path: '/pair', audience: 'parent', ready: '.page' },
]

for (const lang of ['fr', 'en'] as Lang[]) {
  for (const c of OVERFLOW_CASES) {
    test(`no horizontal overflow: ${c.path}#${c.audience} [${lang}] @phone`, async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 })
      await mockApi(page)
      await seedState(page, { theme: 'day', audience: c.audience, lang })
      await page.goto(c.path)
      await settle(page, c.ready)
      // Poll until the layout is stable. A REAL horizontal overflow persists and
      // fails after the timeout; a transient one from the `display=swap` web-font
      // swap (fallback glyphs are momentarily wider) clears within a few frames.
      // The hub body scrolls internally, so check both it and the document. The
      // .hubnav row is intentionally horizontal-scroll, so its children are
      // (correctly) excluded — they live outside .hub__body and the doc flow.
      await expect
        .poll(
          async () =>
            page.evaluate(() => {
              const doc = document.documentElement
              const body = document.querySelector('.hub__body')
              const docOver = doc.scrollWidth > doc.clientWidth + 1
              const bodyOver = !!body && body.scrollWidth > body.clientWidth + 1
              return docOver ? 'doc-overflow' : bodyOver ? 'body-overflow' : 'ok'
            }),
          { timeout: 6000, intervals: [150, 300, 500, 800] },
        )
        .toBe('ok')
    })
  }
}
