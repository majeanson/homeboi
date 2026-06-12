import { test, expect, type Page, type Locator } from '@playwright/test'
import { mockApi, seedState } from './mocks'

// Form action buttons must stay visible when the on-screen keyboard is up.
// iOS overlays the keyboard without resizing the layout viewport; the app
// compensates by tracking window.visualViewport into CSS vars (--vvh/--vvt/--kb,
// src/lib/viewportVars.ts) that pin modals and lift bottom sheets.
//
// Playwright can't summon a real keyboard, so we install a CONTROLLABLE
// visualViewport stub before the app boots, shrink it mid-test (like iOS does
// when the keyboard slides in), and assert the primary buttons still sit
// inside the visible area. This exercises the exact code path a phone uses.

const PHONE = { width: 390, height: 844 }
const KEYBOARD = 336 // a typical iPhone FR keyboard height

async function boot(page: Page, path: string) {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.setViewportSize(PHONE)
  await page.addInitScript(() => {
    // A stand-in visualViewport the test can shrink on demand.
    const stub = new EventTarget() as EventTarget & { height: number; offsetTop: number }
    stub.height = window.innerHeight
    stub.offsetTop = 0
    Object.defineProperty(window, 'visualViewport', { value: stub, configurable: true })
    ;(window as unknown as { __vvStub: typeof stub }).__vvStub = stub
  })
  await mockApi(page)
  await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', calm: true, surface: 'mobile' })
  await page.goto(path)
  await page.locator('.hub, .page').first().waitFor({ state: 'visible', timeout: 15_000 }).catch(() => {})
}

// Slide the fake keyboard in: the visual viewport loses KEYBOARD px of height.
async function openKeyboard(page: Page) {
  await page.evaluate((kb) => {
    const stub = (window as unknown as { __vvStub: { height: number; dispatchEvent: (e: Event) => boolean } }).__vvStub
    stub.height = window.innerHeight - kb
    stub.dispatchEvent(new Event('resize'))
  }, KEYBOARD)
}

// After a viewport resize, bring the stub back in line (a real visualViewport
// follows the window on its own).
async function syncStub(page: Page) {
  await page.evaluate(() => {
    const stub = (window as unknown as { __vvStub: { height: number; dispatchEvent: (e: Event) => boolean } }).__vvStub
    stub.height = window.innerHeight
    stub.dispatchEvent(new Event('resize'))
  })
}

// The button must sit fully inside the visible (above-keyboard) area AND be
// clickable there.
async function expectVisibleAboveKeyboard(locator: Locator, visibleHeight: number) {
  await expect(locator).toBeVisible()
  const box = await locator.boundingBox()
  expect(box, 'button has a bounding box').not.toBeNull()
  expect(box!.y, 'button top inside the visible area').toBeGreaterThanOrEqual(0)
  expect(box!.y + box!.height, 'button bottom above the keyboard').toBeLessThanOrEqual(visibleHeight + 1)
}

const VISIBLE = PHONE.height - KEYBOARD

test('recipe form: save + close stay visible with the keyboard up', async ({ page }) => {
  await boot(page, '/kitchen')
  // The contextual ＋ owns recipe creation now: FAB → recipe tile.
  await page.locator('.add-fab').click()
  await page.locator('.cat-pick').first().click()
  await page.locator('.recipe-modal').waitFor({ state: 'visible' })

  await page.locator('.recipe-title-input').click() // focus = what summons the keyboard
  await openKeyboard(page)

  await expectVisibleAboveKeyboard(page.locator('.recipe-modal__foot .btn--primary'), VISIBLE) // Enregistrer
  await expectVisibleAboveKeyboard(page.locator('.recipe-modal__bar button').last(), VISIBLE) // ✕
})

test('recipe sheet: actions stay visible with the keyboard up', async ({ page }) => {
  await boot(page, '/kitchen')
  await page.locator('.subtabs__opt', { hasText: 'Recettes' }).click()
  await page.locator('.recipe-card').first().click()
  await page.locator('.recipe-modal').waitFor({ state: 'visible' })

  await openKeyboard(page)
  await expectVisibleAboveKeyboard(page.locator('.recipe-actions .btn--primary'), VISIBLE) // Cuisiner
})

test('add sheet: submit stays visible with the keyboard up', async ({ page }) => {
  await boot(page, '/board')
  await page.locator('.add-fab').click()
  await page.locator('.sheet__field input').waitFor({ state: 'visible' })

  await openKeyboard(page)
  await expectVisibleAboveKeyboard(page.locator('.sheet button[type="submit"]'), VISIBLE)
})

// No keyboard at all — just a short phone (or split-screen): the modal must
// still fit and keep its footer reachable. Catches plain max-height regressions.
test('recipe form fits a short viewport', async ({ page }) => {
  await boot(page, '/kitchen')
  await page.setViewportSize({ width: 390, height: 480 })
  await syncStub(page)
  await page.locator('.add-fab').click()
  await page.locator('.cat-pick').first().click()
  await page.locator('.recipe-modal').waitFor({ state: 'visible' })

  await expectVisibleAboveKeyboard(page.locator('.recipe-modal__foot .btn--primary'), 480)
  await expectVisibleAboveKeyboard(page.locator('.recipe-modal__bar button').last(), 480)
})
