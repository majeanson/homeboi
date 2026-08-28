import { test, expect, type Page } from '@playwright/test'
import { mockApi, seedState } from './mocks'

// Hold the ＋ and speak (bmad/12 #18).
//
// The hold must never cost the tap: the plain press still opens the section's
// blank chooser, exactly as before. And it must only bind where there is
// something to dictate INTO — Maison's adds are all structured entities, so a
// hold there keeps its ordinary meaning.
//
// The mic itself isn't exercised here: SpeechRecognition doesn't exist in
// headless Chromium, so `hasVoice` is false and the hook declines to start. What
// this guard actually protects is the ROUTING — which form the hold opens, and
// that the tap is unharmed. lib/useVoiceInput has its own unit coverage.
const PHONE = { width: 390, height: 780 }

async function hold(page: Page, ms = 700) {
  const fab = page.locator('.add-fab')
  const box = (await fab.boundingBox())!
  const x = box.x + box.width / 2
  const y = box.y + box.height / 2
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.waitForTimeout(ms)
  await page.mouse.up()
}

test.describe('hold the ＋ to speak', () => {
  test.use({ viewport: PHONE })

  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await mockApi(page)
    await seedState(page, { surface: 'mobile' })
  })

  test('a hold on the board opens the note composer directly', async ({ page }) => {
    await page.goto('/board')
    await hold(page)
    // Straight into « Note rapide » — no chooser grid in between.
    const sheet = page.locator('.sheet.show')
    await expect(sheet).toBeVisible()
    await expect(sheet.locator('.edit-field').first()).toBeVisible()
  })

  test('a plain tap still opens the chooser', async ({ page }) => {
    await page.goto('/board')
    await page.locator('.add-fab').click()
    const sheet = page.locator('.sheet.show')
    await expect(sheet).toBeVisible()
    // The tile grid is the chooser's signature — a hold-opened form has none.
    await expect(sheet.locator('> .cat-grid')).toBeVisible()
  })

  test('a hold on La liste opens the list composer, not the board note', async ({ page }) => {
    await page.goto('/liste')
    await hold(page)
    await expect(page.locator('.sheet.show')).toBeVisible()
    await expect(page.locator('.sheet.show > .cat-grid')).toHaveCount(0)
  })

  test('a hold on Maison keeps its ordinary meaning', async ({ page }) => {
    // Every Maison add is a structured entity a sentence of speech can't fill,
    // so there is no voice mode and the hold falls through to the plain chooser.
    await page.goto('/maison')
    await hold(page)
    await expect(page.locator('.sheet.show > .cat-grid')).toBeVisible()
  })
})
