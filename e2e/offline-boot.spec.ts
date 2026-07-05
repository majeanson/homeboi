import { test, expect } from '@playwright/test'
import { mockApi, seedState } from './mocks'

// Regression: the app MUST mount even when IndexedDB is broken (NFR-OFFLINE-1).
//
// Reported symptom: an installed iOS PWA, opened offline, showed an all-black
// screen — the shell HTML/theme loaded (so the service worker served it fine) but
// React never mounted, leaving an empty #root over the dark shell. Root cause: the
// boot in src/main.tsx `await`ed restorePersistedCache() (an IndexedDB read) BEFORE
// createRoot().render(), and on iOS a fresh-launch `indexedDB.open()` can hang with
// no success/error/blocked event ever firing — so render() never ran. The boot now
// caps that wait and mounts regardless; the IDB helpers also self-bound.
//
// These specs run on the default (dev-server) harness — no service worker needed,
// since this is about the boot ORDER, which is identical online and offline.

test('the app mounts when indexedDB.open() hangs forever (iOS cold-launch bug)', async ({ page }) => {
  // Make every open() return a request whose events NEVER fire — the exact WebKit
  // hang that wedged the old boot. If the boot still gated render on this, .hub
  // would never appear and the test would time out (the original ∞-hang).
  await page.addInitScript(() => {
    const inert = { onsuccess: null, onerror: null, onupgradeneeded: null, onblocked: null, result: null }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(window.indexedDB as any).open = () => inert
  })
  await mockApi(page)
  await seedState(page, { theme: 'night', audience: 'parent', lang: 'fr', surface: 'kiosk' })

  await page.goto('/board')

  // Mounts despite IDB never resolving — the boot cap fires and renders the shell.
  await expect(page.locator('.hub')).toBeVisible({ timeout: 10_000 })
})

test('the app mounts when indexedDB is unavailable (private mode / disabled storage)', async ({ page }) => {
  // Some iOS contexts expose no usable IndexedDB (private browsing, storage off):
  // open() throws. The helpers catch it and resolve null; the app must still boot.
  await page.addInitScript(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(window.indexedDB as any).open = () => {
      throw new Error('IndexedDB unavailable')
    }
  })
  await mockApi(page)
  await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'kiosk' })

  await page.goto('/board')

  await expect(page.locator('.hub')).toBeVisible({ timeout: 10_000 })
})
