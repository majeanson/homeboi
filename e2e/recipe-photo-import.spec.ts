import { test, expect } from '@playwright/test'
import { mockApi, seedState } from './mocks'

// Real-flow coverage for the recipe photo-import path (RecipeForm). The companion
// recipe-read-review spec drives the dialog in isolation via /dev/kit; THIS one
// exercises the wiring that synthetic specimen can't: pick a photo → OCR read →
// structure → the verify dialog opens with that draft → confirm → applyDraft lands
// it in the form behind the dialog.
//
// Determinism: we force the CLOUD OCR reader (a per-device localStorage pref) so the
// flow never touches on-device Tesseract (heavy WASM, can't read a synthetic image).
// With cloud on, readPhoto POSTs the page to /api/recipe-ocr (→ text) then structures
// it via /api/recipe-import (→ the draft). /api/recipe-vision is mocked too as a
// belt-and-suspenders for the device-fallback path, so a health-timing race can't
// flake the test — either route yields the same draft.

// A valid 1×1 PNG — decodes through resizeImage()/the OCR resize before upload.
const PNG_1x1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

const OCR_TEXT = 'Biscuits à l’avoine\n3/4 tasse de farine\n2 œufs\nCuire 12 minutes au four.'
const DRAFT = {
  title: 'Biscuits à l’avoine',
  ingredients: ['3/4 tasse de farine', '2 œufs'],
  steps: ['Préchauffer le four à 180 °C.', 'Cuire 12 minutes.'],
  servings: 24,
  servingsUnit: 'biscuits',
  times: { prep: 15, cook: 12, total: null },
  lang: 'fr',
  empty: false,
}
const json = (body: unknown) => ({ contentType: 'application/json', body: JSON.stringify(body) })

test('photo import: read → verify dialog → apply draft to the form', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))

  await page.setViewportSize({ width: 430, height: 1200 })
  await mockApi(page)
  // Force the cloud reader BEFORE the app boots (per-device localStorage pref).
  await page.addInitScript(() => localStorage.setItem('babillard-ocr-engine', 'cloud'))
  await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile' })

  // Registered after mockApi → these take precedence (Playwright runs newest first).
  // cloudOcr makes the cloud reader eligible; the two read endpoints return our draft.
  await page.route('**/api/health', (r) => r.fulfill(json({ ai: true, aiAvailable: true, cloudOcr: true })))
  await page.route('**/api/recipe-ocr', (r) => r.fulfill(json({ text: OCR_TEXT })))
  await page.route('**/api/recipe-import', (r) => r.fulfill(json(DRAFT)))
  await page.route('**/api/recipe-vision', (r) => r.fulfill(json(DRAFT)))

  // Wait for the health GET to resolve so cloudOcrAvailable flips true BEFORE we
  // trigger the read — otherwise readPhoto could fall to the (slow) device reader.
  const healthDone = page
    .waitForResponse((r) => r.url().includes('/api/health') && r.request().method() === 'GET', { timeout: 10_000 })
    .catch(() => null)
  await page.goto('/kitchen/recipe/new')
  await expect(page.locator('.recipe-title-input')).toBeVisible({ timeout: 15_000 })
  await healthDone
  await page.waitForTimeout(150) // let React apply cloudOcrAvailable=true

  // Trigger the read by handing the hidden OCR file input a photo.
  // Scanner/Importer live inside the « Remplir vite » Disclosure now — two buttons and
  // a three-line explainer no longer stand between the recipe's name and its first
  // ingredient. Open it, then hand the file to the scanner.
  await page.getByRole('button', { name: 'Remplir vite' }).click()
  await page.locator('.recipe-helpers input[type=file]').setInputFiles({
    name: 'carte.png',
    mimeType: 'image/png',
    buffer: PNG_1x1,
  })

  // The verify-against-the-photo dialog opens with the structured read, and the
  // bare-fraction line ("3/4 tasse") is flagged for a second look.
  const modal = page.locator('.read-review')
  await expect(modal).toBeVisible({ timeout: 15_000 })
  await expect(modal.locator('.read-review__line.is-flagged').first()).toBeVisible()

  // Confirm → the draft lands in the form behind the dialog (applyDraft).
  await modal.locator('.read-review__foot .btn--primary').click()
  await expect(modal).toBeHidden()
  await expect(page.locator('.recipe-title-input')).toHaveValue(DRAFT.title)
  // An ingredient row from the read is now in the form too (a live input value —
  // React sets the value property, not the attribute, so read it off the DOM).
  const hasIngredient = await page
    .locator('input')
    .evaluateAll((els, v) => els.some((e) => (e as HTMLInputElement).value === v), '3/4 tasse de farine')
  expect(hasIngredient, 'the read ingredient landed in a form field').toBe(true)

  expect(errors, 'pageerror during photo import').toEqual([])
})
