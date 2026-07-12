import { test, expect, type Page } from '@playwright/test'
import { mockApi, seedState } from './mocks'

// « Je prends une pic vite, je la mets sur le babillard — et je la garde. »
//
// Three guarantees, one flow:
//   1. A photo is ONE tap. The 📎's « Photo » chip attaches the file directly; it must
//      NOT open the DrawPad (it used to — "draw over a photo" was the only door to
//      "add a photo", which put a whole pad between you and a quick pic).
//   2. « Garder dans les photos » copies it into the household frame (POST /api/photos)
//      — its own independent blob, so clearing the note can't take it.
//   3. « Enregistrer sur l'appareil » hands the shot back to the phone. Chromium has no
//      file-share, so this exercises the download fallback — the half of the feature
//      that desktop and older Android depend on.

// A 1×1 PNG — real bytes, so the resize/upload path runs for real.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

async function openNoteAttach(page: Page) {
  await page.goto('/board')
  await page.locator('.add-fab').click()
  await expect(page.locator('.sheet.show')).toBeVisible({ timeout: 15_000 })
  await page.locator('.addsheet__lead .memo-attach__btn').click()
  await expect(page.locator('.memo-attach__picks')).toBeVisible()
}

test('« Photo » attaches the pic straight — no pad in the way — and offers both keeps', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await mockApi(page)
  await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile' })
  await openNoteAttach(page)

  const posts: string[] = []
  page.on('request', (r) => {
    if (r.method() === 'POST' && r.url().includes('/api/')) posts.push(new URL(r.url()).pathname)
  })

  // One tap: the file lands on the note. The pad must stay shut.
  await page.locator('.memo-attach input[type="file"]').setInputFiles({ name: 'pic.png', mimeType: 'image/png', buffer: PNG })
  await expect(page.locator('.memo-attach__chip')).toBeVisible()
  await expect(page.locator('.memo-attach__thumb')).toBeVisible()
  await expect(page.locator('.drawpad')).toHaveCount(0)
  expect(posts).toContain('/api/note-media')

  // The photo is attached; now the two optional keeps sit under it.
  const keep = page.getByRole('button', { name: 'Garder dans les photos' })
  await expect(keep).toBeVisible()
  await expect(page.getByRole('button', { name: 'Enregistrer sur l’appareil' })).toBeVisible()

  // Keep → the household frame gets its own copy, and the chip says so.
  await keep.click()
  await expect(page.getByRole('button', { name: 'Gardée dans les photos' })).toBeVisible()
  await expect.poll(() => posts.filter((p) => p === '/api/photos').length).toBe(1)
  // …undoably: the calm toast offers to take it straight back out.
  await expect(page.locator('.undo-toast')).toContainText('Gardée dans les photos')
})

test('« Enregistrer sur l’appareil » falls back to a download where files can’t be shared', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await mockApi(page)
  await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile' })
  await openNoteAttach(page)

  await page.locator('.memo-attach input[type="file"]').setInputFiles({ name: 'pic.png', mimeType: 'image/png', buffer: PNG })
  await expect(page.locator('.memo-attach__chip')).toBeVisible()

  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Enregistrer sur l’appareil' }).click()
  expect((await download).suggestedFilename()).toMatch(/^babillard-\d+\.(png|jpg)$/)
  await expect(page.getByRole('button', { name: 'Enregistrée' })).toBeVisible()
})
