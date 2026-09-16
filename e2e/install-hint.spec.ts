import { test, expect, devices, type Page } from '@playwright/test'
import { mockApi, seedState } from './mocks'

// « Sur l'écran d'accueil » (lib/install + InstallHint, STATE.md §4-K wave 2).
//
// The app has been a PWA for months and nothing ever said so. The rule (Marc,
// 2026-09-16): ONE quiet line, once, on a device that can install — in Réglages ▸
// Affichage, and on the board right after an account is created on that device.
// Two platforms, two shapes: Chromium hands us a `beforeinstallprompt` event and our
// button calls its prompt(); iOS Safari fires nothing, so the hint is the words for
// the share sheet. Already standalone → nothing to offer.

/** Chromium's install offer, faked: the event our listener keeps. */
const fireInstallPrompt = (page: Page, outcome: 'accepted' | 'dismissed' = 'accepted') =>
  page.evaluate((outcome) => {
    const ev = new Event('beforeinstallprompt', { cancelable: true }) as Event & {
      prompt: () => Promise<void>
      userChoice: Promise<{ outcome: string }>
      prompted?: boolean
    }
    ev.prompt = async () => {
      ev.prompted = true
      ;(window as unknown as { __prompted: boolean }).__prompted = true
    }
    ev.userChoice = Promise.resolve({ outcome })
    window.dispatchEvent(ev)
  }, outcome)

// Only when the key is ABSENT: an init script runs on every navigation, and re-seeding
// « pending » on the reload would undo the very dismissal the spec is checking.
const nudgePending = (page: Page) =>
  page.addInitScript(() => {
    if (!localStorage.getItem('babillard-install')) localStorage.setItem('babillard-install', JSON.stringify({ nudge: 'pending' }))
  })

test('after an account is created, the board offers the home screen ONCE — and the button calls the browser’s prompt', async ({ page }) => {
  await mockApi(page)
  await seedState(page, { theme: 'day', lang: 'fr' })
  await nudgePending(page)
  await page.goto('/board')
  await expect(page.locator('.wg-slot').first()).toBeVisible()
  // No prompt event yet, not iOS: nothing to offer, so nothing shows.
  await expect(page.locator('.install-hint')).toHaveCount(0)
  await fireInstallPrompt(page)
  const hint = page.locator('.install-hint')
  await expect(hint).toBeVisible()
  await hint.getByRole('button', { name: 'Installer' }).click()
  await expect.poll(() => page.evaluate(() => (window as unknown as { __prompted?: boolean }).__prompted)).toBe(true)
  // Accepted → the nudge is spent, and it does not come back on the next load.
  await expect(hint).toHaveCount(0)
  await page.reload()
  await expect(page.locator('.wg-slot').first()).toBeVisible()
  await fireInstallPrompt(page)
  await expect(page.locator('.install-hint')).toHaveCount(0)
})

test('« Plus tard » is forever: dismissed once, never again on this device', async ({ page }) => {
  await mockApi(page)
  await seedState(page, { theme: 'day', lang: 'fr' })
  await nudgePending(page)
  await page.goto('/board')
  await expect(page.locator('.wg-slot').first()).toBeVisible()
  await fireInstallPrompt(page)
  await page.locator('.install-hint').getByRole('button', { name: 'Plus tard' }).click()
  await expect(page.locator('.install-hint')).toHaveCount(0)
  await page.reload()
  await expect(page.locator('.wg-slot').first()).toBeVisible()
  await fireInstallPrompt(page)
  await expect(page.locator('.install-hint')).toHaveCount(0)
})

test('a device with no nudge pending never sees the board card, even when it could install', async ({ page }) => {
  await mockApi(page)
  await seedState(page, { theme: 'day', lang: 'fr' })
  await page.goto('/board')
  await expect(page.locator('.wg-slot').first()).toBeVisible()
  await fireInstallPrompt(page)
  await page.waitForTimeout(300)
  await expect(page.locator('.install-hint')).toHaveCount(0)
})

test('Réglages ▸ Affichage is the standing door: words on Chromium with a prompt, nothing without one', async ({ page }) => {
  await mockApi(page)
  await seedState(page, { theme: 'day', lang: 'fr' })
  await page.goto('/settings?tab=settings&lens=regler&focus=display')
  await expect(page.locator('.operator__section').first()).toBeVisible()
  await expect(page.locator('.install-hint')).toHaveCount(0)
  await fireInstallPrompt(page)
  await expect(page.locator('.install-hint')).toBeVisible()
  await expect(page.locator('.install-hint').getByRole('button', { name: 'Installer' })).toBeVisible()
})

test.describe('iPhone Safari', () => {
  // Only the UA: the full descriptor carries a browser type, which a describe block
  // cannot set. The hint reads the UA, nothing else about the device.
  test.use({ userAgent: devices['iPhone 13'].userAgent, viewport: devices['iPhone 13'].viewport })
  test('the hint is the share-sheet words, with no button — Safari has no prompt to call', async ({ page }) => {
    await mockApi(page)
    await seedState(page, { theme: 'day', lang: 'fr' })
    await nudgePending(page)
    await page.goto('/board')
    await expect(page.locator('.wg-slot').first()).toBeVisible()
    const hint = page.locator('.install-hint')
    await expect(hint).toBeVisible()
    await expect(hint).toContainText('Partager')
    await expect(hint.getByRole('button', { name: 'Installer' })).toHaveCount(0)
  })
})
