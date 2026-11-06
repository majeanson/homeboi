import type { Page } from '@playwright/test'
import { test, expect } from './fixtures'
import { settled } from './measure'
import type { Theme } from './mocks'

// The degraded / transient states the happy-path sweeps skip, via the new mockApi
// levers (delay → loading, error → 500/network):
//   • LOADING — the <Loading/> frame while the first fetch is in flight.
//   • ERROR   — the app must SURVIVE a 500 or a dropped connection on every surface
//               (crash-smoke beyond the 401 recovery path) and degrade, not white-screen.
//   • TOAST   — the undo toast after an undoable action (clear-checked on the list).
// Mock-based + Chromium, so it runs in CI.

const PHONE = { width: 390, height: 844 }
const shot = (page: Page, name: string) => page.screenshot({ path: `e2e/screenshots/deg-${name}.png`, fullPage: false })

// ── 1. LOADING ───────────────────────────────────────────────────────────────
// /liste renders <Loading/> until the board fetch lands; hold it ~2s so the frame
// is capturable.
for (const theme of ['day', 'night'] as Theme[]) {
  const sfx = theme === 'night' ? '-night' : ''
  test(`deg loading${sfx}`, async ({ page, app }) => {
    await app.boot({ viewport: PHONE, route: '/liste', state: { theme: theme, calm: true }, api: { delay: 2000 } })
    await page.locator('.loading').waitFor({ state: 'visible', timeout: 10_000 })
    await expect(page.locator('.loading')).toBeVisible()
    await shot(page, `loading-liste-phone${sfx}`)
  })
}

// ── 2. ERROR (crash-smoke) ───────────────────────────────────────────────────
// Every surface under a 500 AND a dropped connection: it must throw no pageerror
// and paint *something* (a degraded shell), never a white screen. This is the
// value beyond the existing 401 tests — a non-auth failure is a different path.
const ERROR_SURFACES = ['/board', '/kitchen', '/liste', '/maison', '/notes', '/settings']
for (const kind of ['500', 'network'] as const) {
  for (const path of ERROR_SURFACES) {
    test(`deg error-${kind}: ${path.slice(1)}`, async ({ page, app }) => {
      const errors: string[] = []
      page.on('pageerror', (e) => errors.push(e.message))
      await app.boot({ viewport: PHONE, route: path, state: { theme: 'day', calm: true }, api: { error: kind } })
      // SOMETHING must render (shell, loading, or an error/empty state) — not a blank doc.
      await page.locator('.hub, .page, main, .loading').first().waitFor({ state: 'visible', timeout: 15_000 }).catch(() => {})
      await settled(page)
      const painted = await page.evaluate(() => (document.body.innerText || '').trim().length)
      expect(painted, `${path} painted something under ${kind}`).toBeGreaterThan(0)
      await shot(page, `error-${kind}-${path.slice(1)}`)
      expect(errors, `pageerror under ${kind} on ${path}`).toEqual([])
    })
  }
}

// ── 3. TOAST ─────────────────────────────────────────────────────────────────
// The undo toast (lib/toast) after a deferred removal: check a list row, then
// « Vider les cochés » holds the delete behind the toast.
for (const theme of ['day', 'night'] as Theme[]) {
  const sfx = theme === 'night' ? '-night' : ''
  test(`deg undo-toast${sfx}`, async ({ page, app }) => {
    await app.boot({ viewport: PHONE, route: '/liste', state: { theme: theme, calm: true }, api: {} })
    await page.locator('.hub__body').waitFor({ state: 'visible', timeout: 15_000 })
    await page.locator('.list-row__toggle').first().click()
    await page.getByRole('button', { name: /Vider les cochés/ }).click()
    await page.locator('.undo-toast').waitFor({ state: 'visible', timeout: 10_000 })
    await settled(page)
    await expect(page.locator('.undo-toast')).toBeVisible()
    await shot(page, `undo-toast-phone${sfx}`)
  })
}
