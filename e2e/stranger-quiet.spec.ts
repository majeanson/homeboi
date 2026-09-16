import { test, expect, type Page } from '@playwright/test'
import { mockApi, seedState } from './mocks'

// WHAT A STRANGER MUST NOT SEE (STATE.md §4-K wave 1 — the demo walk, 2026-09-16).
//
// Two things the walk found on production that no fixture-driven spec had ever asked:
//
//   1. The marketing page opened the household realtime socket with NO credential. The
//      server 401'd the handshake, the client's backoff retried every 2→30 s forever,
//      and the error sat in the visitor's console. The socket now follows the SESSION
//      (lib/auth connects on a confirmed sign-in; main.tsx only for a paired tablet).
//   2. Réglages ▸ Découvrir greeted a brand-new device with « Quoi de neuf » about a
//      RENAME — something that is only news to someone who knew the old name. A device
//      with no history starts with every current line marked seen.

const socketsOpened = (page: Page) => {
  let n = 0
  // Only OUR socket: the harness is Vite, whose HMR channel is a websocket too.
  page.on('websocket', (ws) => {
    if (ws.url().includes('/api/live')) n++
  })
  return () => n
}

test('the marketing page, signed out, never opens the realtime socket', async ({ page }) => {
  const count = socketsOpened(page)
  // No seedState on purpose: a stored surface alone sends `/` to /board (router Entry).
  await mockApi(page, { signedIn: false })
  await page.goto('/')
  await expect(page.locator('.home__cta-demo')).toBeVisible()
  // Long enough for the boot path AND the first reconnect tick (2 s) to have fired.
  await page.waitForTimeout(2600)
  expect(count(), 'a visitor with no session must not knock on /api/live').toBe(0)
})

test('control: a confirmed operator session opens the socket', async ({ page }) => {
  const count = socketsOpened(page)
  await mockApi(page)
  await seedState(page, { theme: 'day', lang: 'fr' })
  await page.goto('/board')
  await expect(page.locator('.wg-slot').first()).toBeVisible()
  await expect.poll(count, { timeout: 5000 }).toBeGreaterThan(0)
})

test('a brand-new device sees no « Quoi de neuf » — it has nothing to compare with', async ({ page }) => {
  await mockApi(page)
  await seedState(page, { theme: 'day', lang: 'fr' })
  await page.goto('/settings')
  await expect(page.locator('.operator__section, .operator__tabs').first()).toBeVisible()
  await expect(page.getByText('Quoi de neuf')).toHaveCount(0)
})

test('control: a device that dismissed an OLDER line still meets the newer one', async ({ page }) => {
  await mockApi(page)
  await seedState(page, { theme: 'day', lang: 'fr' })
  // A seen list that names a line which is NOT the newest: this device has a before.
  await page.addInitScript(() => {
    localStorage.setItem('babillard-whatsnew-seen', JSON.stringify(['some-older-line-this-device-dismissed']))
  })
  await page.goto('/settings')
  await expect(page.getByText('Quoi de neuf')).toBeVisible()
})
