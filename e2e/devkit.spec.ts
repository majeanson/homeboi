import { test, expect } from '@playwright/test'
import { mockApi, seedState } from './mocks'

// The gallery itself, smoke-tested.
//
// `/dev/kit` renders ~120 live specimens, and each one is only ever exercised when a
// human happens to expand it. A specimen that throws — a prop renamed out from under
// it, a fixture shape that drifted — therefore sits broken indefinitely, and the next
// session reads the blank card as "this primitive is broken" rather than "the demo is".
// `src/lib/devkitParity.test.ts` proves each entry POINTS at something real; only this
// proves each entry RENDERS.
//
// It also covers the « Données : Exemple » switch added 2026-09-09, whose whole job is
// to let the ~20 self-fetching cards (the departure card, « À régler », the month grid)
// be looked at at all. Under this harness every /api/* is already stubbed at the network
// layer, so the switch cannot be proven to change the DATA here — what IS proven is that
// flipping it neither crashes the gallery nor leaves the page empty, which is the
// regression that would make it useless.

test('every gallery specimen renders without throwing', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))

  await page.setViewportSize({ width: 1280, height: 900 })
  await mockApi(page)
  await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile' })
  await page.goto('/dev/kit')

  const entries = page.locator('.kit-entry')
  await expect(entries.first()).toBeVisible({ timeout: 15_000 })
  const total = await entries.count()
  // A floor, not an equality: entries land often, and a spec that has to be edited for
  // every new one gets edited without being read. But a parser/route change that renders
  // NOTHING has to fail here rather than pass with an empty page.
  expect(total, 'the gallery should carry its whole catalogue').toBeGreaterThan(100)

  // Expand everything at once: <details> open is cheap, and the point is to force every
  // `render()` closure to run.
  await page.evaluate(() => {
    document.querySelectorAll('details.kit-entry').forEach((d) => d.setAttribute('open', ''))
  })
  await page.waitForTimeout(1500)

  expect(errors, 'a specimen threw while rendering').toEqual([])
  // The page is still a gallery, not a white screen behind an error boundary.
  await expect(page.locator('.devkit__cat-title').first()).toBeVisible()
})

test('the « Données : Exemple » switch flips both ways without emptying the gallery', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))

  await page.setViewportSize({ width: 1280, height: 900 })
  await mockApi(page)
  await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile' })
  await page.goto('/dev/kit')
  await expect(page.locator('.kit-entry').first()).toBeVisible({ timeout: 15_000 })

  const onBtn = page.getByRole('button', { name: 'Exemple', exact: true })
  const offBtn = page.getByRole('button', { name: 'Réelles', exact: true })
  await expect(onBtn).toBeVisible()

  await onBtn.click()
  // The banner is the honest part of the switch: it says the household is untouched.
  await expect(page.locator('.devkit__warn').filter({ hasText: 'Fixtures e2e' })).toBeVisible()
  await expect(page.locator('.kit-entry').first()).toBeVisible()

  await offBtn.click()
  await expect(page.locator('.devkit__warn').filter({ hasText: 'Fixtures e2e' })).toHaveCount(0)
  await expect(page.locator('.kit-entry').first()).toBeVisible()

  expect(errors, 'flipping the data source threw').toEqual([])
})
