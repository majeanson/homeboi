import { test, expect, type Page } from '@playwright/test'
import { mockApi, seedState, type Audience, type Lang, type Surface, type Theme } from './mocks'

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
  { name: 'setup', path: '/setup', audiences: ['parent'], ready: '.setup__choices' },
  { name: 'board', path: '/board', audiences: ['parent', 'toddler'], ready: '.hub' },
  { name: 'kitchen', path: '/kitchen', audiences: ['parent', 'toddler'], ready: '.hub' },
  { name: 'routines', path: '/routines', audiences: ['parent', 'toddler'], ready: '.hub' },
  { name: 'cercle', path: '/cercle', audiences: ['parent', 'toddler'], ready: '.hub' },
  { name: 'liste', path: '/liste', audiences: ['parent', 'toddler'], ready: '.hub' },
  { name: 'settings', path: '/settings', audiences: ['parent'], ready: '.hub' },
  { name: 'login', path: '/login', audiences: ['parent'], ready: 'form, .page' },
  { name: 'signup', path: '/signup', audiences: ['parent'], ready: 'form, .page' },
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

// The device role maps to the format: a phone shoots the MOBILE surface (glance +
// bottom bar), a wall shoots the KIOSK surface (dashboard + left column). `/` is
// the marketing page — it must stay a first-time visitor (no role, signed out),
// else the smart entry would redirect it to /board.
const surfaceFor = (formatName: string): Surface => (formatName === 'phone' ? 'mobile' : 'kiosk')

for (const surface of SURFACES) {
  for (const audience of surface.audiences) {
    for (const theme of THEMES) {
      for (const format of FORMATS) {
        const label = `${surface.name}-${audience}-${theme}-${format.name}`
        const isHome = surface.name === 'home'
        test(label, async ({ page }) => {
          await page.setViewportSize({ width: format.width, height: format.height })
          await mockApi(page, isHome ? { signedIn: false } : {})
          await seedState(page, {
            theme,
            audience,
            lang: 'fr',
            calm: true,
            surface: isHome ? undefined : surfaceFor(format.name),
          })
          await page.goto(surface.path)
          await settle(page, surface.ready)
          await page.screenshot({ path: `e2e/screenshots/${label}.png`, fullPage: true })
        })
      }
    }
  }
}

// The alternate board layout (kiosk wall): « Mois », the calendar. (« Grille » is the
// default, covered by the main board frames; the per-person split is the face picker,
// and « Moments » is its own scene — no longer separate board layouts.)
for (const boardView of ['month'] as const) {
  test(`board-${boardView}-parent-day-wall`, async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await mockApi(page)
    await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', calm: true, surface: 'kiosk', boardView })
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(e.message))
    await page.goto('/board')
    await settle(page, '.hub')
    // Guard: the calendar reads dated board fields — assert it actually renders content
    // and doesn't throw, not just shoot a blank frame.
    await expect.poll(async () => (await page.locator('.hub__body').innerText()).trim().length, {
      timeout: 8000,
    }).toBeGreaterThan(20)
    expect(errors, `pageerror on board ${boardView}`).toEqual([])
    await page.screenshot({ path: `e2e/screenshots/board-${boardView}-parent-day-wall.png`, fullPage: true })
  })
}

// Per-device card layout (« Disposition du babillard »): a saved layout with a card
// hidden + reordered renders cleanly — no crash, no overflow, and the hidden card is
// gone from the board (lib/boardCards + Board.tsx registry).
test('board respects a custom card layout', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await mockApi(page)
  await seedState(page, {
    theme: 'day',
    audience: 'parent',
    lang: 'fr',
    calm: true,
    surface: 'kiosk',
    cardPrefs: { order: ['upcoming', 'today', 'autoCard', 'toFinish', 'drawings', 'photos'], hidden: ['todos'] },
  })
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto('/board')
  await settle(page, '.hub')
  await page.locator('.board-grid').first().waitFor({ timeout: 8000 })
  // « À compléter » (todos) is hidden → its global card is absent from the board.
  expect(await page.locator('.todo-sec.bento').count()).toBe(0)
  expect(errors, 'pageerror with custom layout').toEqual([])
  const overflow = await page.evaluate(() => {
    const b = document.querySelector('.hub__body')
    return !!b && b.scrollWidth > b.clientWidth + 1
  })
  expect(overflow, 'no horizontal overflow with custom layout').toBeFalsy()
})

// « Disposition du babillard » panel: toggling a card OFF in Réglages removes it from
// the board (the full store→board flow, not just a pre-seeded layout).
test('board layout panel toggle hides a card', async ({ page }) => {
  await page.setViewportSize({ width: 430, height: 1400 })
  await mockApi(page)
  await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile' })
  await page.goto('/settings?tab=display')
  await page.locator('.board-layout').first().waitFor({ timeout: 15000 })
  // Hide « À compléter » via its show/hide toggle.
  const row = page.locator('.board-layout__row', { hasText: 'À compléter' }).first()
  await row.locator('.board-layout__toggle').click()
  await page.waitForTimeout(150)
  await page.goto('/board')
  await page.locator('.board-grid').first().waitFor({ timeout: 8000 })
  expect(await page.locator('.todo-sec.bento').count()).toBe(0)
})

// The unified event form: ONE form with optional « Trajet » + « À apporter », and the
// inline bring-list builder accepts typed items (no bounce to Réglages).
test('event form: optional Trajet + À apporter with inline bring builder', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.setViewportSize({ width: 430, height: 1200 })
  await mockApi(page)
  await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile' })
  await page.goto('/event/new')
  await page.locator('form').first().waitFor({ timeout: 15000 })
  await expect(page.getByText('Trajet', { exact: true })).toBeVisible()
  await expect(page.getByText('À apporter', { exact: true })).toBeVisible()
  await page.getByText('À apporter', { exact: true }).click()
  const item = page.getByPlaceholder('Ajoute un article')
  await item.fill('souliers')
  await item.press('Enter')
  await expect(page.getByText('souliers')).toBeVisible()
  await expect(page.getByText('Créer la liste')).toBeVisible()
  expect(errors, 'pageerror on event form').toEqual([])
})

// Language spot-check: English on the busiest surfaces, where FR→EN length
// changes most often break a layout. Day + both formats.
const EN_SURFACES = SURFACES.filter((s) => ['home', 'board', 'kitchen', 'settings'].includes(s.name))
for (const surface of EN_SURFACES) {
  for (const format of FORMATS) {
    const lang: Lang = 'en'
    const label = `${surface.name}-parent-day-${format.name}-en`
    const isHome = surface.name === 'home'
    test(label, async ({ page }) => {
      await page.setViewportSize({ width: format.width, height: format.height })
      await mockApi(page, isHome ? { signedIn: false } : {})
      await seedState(page, {
        theme: 'day',
        audience: 'parent',
        lang,
        calm: true,
        surface: isHome ? undefined : surfaceFor(format.name),
      })
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
  // The next meal now shows BOTH in the « Ce soir » hero AND the « Préparer le repas »
  // quick-action under « Prochainement », so scope to the first match.
  await expect(page.getByText('Spaghetti maison').first()).toBeVisible()
})

test('toddler routines reaches the picture-card story', async ({ page }) => {
  await mockApi(page)
  await seedState(page, { theme: 'day', audience: 'toddler', lang: 'fr' })
  await page.goto('/routines')
  await expect(page.locator('.hub')).toBeVisible()
})

// Crash guard: a render error (e.g. `.find` on an undefined query field) silently
// blanks a surface — the screenshot tests still "pass" because they only shoot a
// frame. So assert every PARENT surface actually paints content and throws no
// pageerror. This is what would have caught the blank-Kitchen regression.
for (const path of ['/board', '/kitchen', '/routines', '/cercle', '/liste', '/settings']) {
  test(`no blank surface (no render crash): ${path}`, async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(e.message))
    await mockApi(page)
    await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile' })
    await page.goto(path)
    await page.locator('.hub__body').waitFor({ state: 'visible', timeout: 15_000 })
    // The shell paints instantly; give data-driven content a beat to mount.
    await expect.poll(async () => (await page.locator('.hub__body').innerText()).trim().length, {
      timeout: 8000,
    }).toBeGreaterThan(20)
    expect(errors, `pageerror on ${path}`).toEqual([])
  })
}

// Regression guard: no surface may overflow the viewport horizontally on a phone
// (the standing "mobile-friendly always" rule). Runs FR + EN, parent + toddler.
const OVERFLOW_CASES: { path: string; audience: Audience; ready: string }[] = [
  { path: '/', audience: 'parent', ready: '.home__title' },
  { path: '/setup', audience: 'parent', ready: '.setup__choices' },
  { path: '/board', audience: 'parent', ready: '.hub' },
  { path: '/board', audience: 'toddler', ready: '.hub' },
  { path: '/kitchen', audience: 'parent', ready: '.hub' },
  { path: '/kitchen', audience: 'toddler', ready: '.hub' },
  { path: '/routines', audience: 'parent', ready: '.hub' },
  { path: '/cercle', audience: 'parent', ready: '.hub' },
  { path: '/cercle', audience: 'toddler', ready: '.hub' },
  { path: '/liste', audience: 'parent', ready: '.hub' },
  { path: '/liste', audience: 'toddler', ready: '.hub' },
  { path: '/settings', audience: 'parent', ready: '.hub' },
  { path: '/login', audience: 'parent', ready: '.page' },
  { path: '/signup', audience: 'parent', ready: '.page' },
  { path: '/pair', audience: 'parent', ready: '.page' },
]

for (const lang of ['fr', 'en'] as Lang[]) {
  for (const c of OVERFLOW_CASES) {
    test(`no horizontal overflow: ${c.path}#${c.audience} [${lang}] @phone`, async ({ page }) => {
      const isHome = c.path === '/'
      await page.setViewportSize({ width: 390, height: 844 })
      await mockApi(page, isHome ? { signedIn: false } : {})
      await seedState(page, { theme: 'day', audience: c.audience, lang, surface: isHome ? undefined : 'mobile' })
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
