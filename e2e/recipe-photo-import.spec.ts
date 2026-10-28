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
  steps: ['Préchauffer le four à 180 °C.', 'Ajouter 125 ml de lait et cuire 12 minutes.'],
  servings: 24,
  servingsUnit: 'biscuits',
  times: { prep: 15, cook: 12, total: null },
  lang: 'fr',
  // The shape recipe-import reports: the model that CHOSE the lines, and what the
  // audit found — the method's « 125 ml de lait », in no ingredient. The verify panel
  // must flag that step « à vérifier ».
  structuring: 'ai',
  model: '@cf/meta/llama-3.3-70b-instruct-fp8-fast · sélection',
  audit: [{ kind: 'missing-ingredient', line: '125 ml de lait' }],
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
  await page.route('**/api/recipe-ocr', (r) => r.fulfill(json({ text: OCR_TEXT, model: 'mistral-ocr-latest' })))
  await page.route('**/api/recipe-import', (r) => r.fulfill(json(DRAFT)))
  await page.route('**/api/recipe-vision**', (r) => r.fulfill(json({ reader: 'vision', readerModel: 'x', transcript: OCR_TEXT })))

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
  // step the audit named (report.audit from recipe-import) is flagged for a second
  // look. The clean "3/4 tasse" line is calm — risky-only flagging.
  const modal = page.locator('.read-review')
  await expect(modal).toBeVisible({ timeout: 15_000 })
  await expect(modal.locator('.read-review__line.is-flagged')).toHaveCount(1)

  // The « Rapport » tab exposes the real pipeline: the cloud reader (with its
  // model name), the line selection, and what the audit found.
  await modal.getByRole('tab', { name: 'Rapport' }).click()
  const report = modal.locator('.read-review__report')
  await expect(report).toBeVisible()
  await expect(report).toContainText('mistral-ocr-latest')
  await expect(report).toContainText('llama-3.3-70b')
  await expect(report).toContainText('125 ml de lait')
  await modal.getByRole('tab', { name: 'Vérifier' }).click()

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

test('« Auto » with no usable cloud key: the vision reader goes first, the device engine never loads', async ({ page }) => {
  // Marc's phone, 2026-10-27: the free Mistral key has no OCR (429), the device engine
  // timed out — the in-network vision reader (Gemma 4) was the one that read the card.
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.setViewportSize({ width: 430, height: 1200 })
  await mockApi(page)
  // No engine chosen (auto), AI on, no cloud key → 'vision'.
  await page.addInitScript(() => localStorage.removeItem('babillard-ocr-engine'))
  await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile' })
  await page.route('**/api/health', (r) => r.fulfill(json({ ai: true, aiAvailable: true, cloudOcr: false })))
  let ocrCalls = 0
  let visionCalls = 0
  await page.route('**/api/recipe-ocr', (r) => {
    ocrCalls++
    return r.fulfill(json({ text: '', model: 'mistral-ocr-latest' }))
  })
  await page.route('**/api/recipe-vision**', (r) => {
    visionCalls++
    // One page → its transcript; the client stitches pages and structures once.
    return r.fulfill(json({ reader: 'vision', readerModel: '@cf/google/gemma-4-26b-a4b-it', transcript: OCR_TEXT }))
  })
  await page.route('**/api/recipe-import', (r) => r.fulfill(json({ ...DRAFT, structuring: 'headings', audit: [] })))
  // Tesseract must NOT be reached for: block its CDN (a hit would fail the test loudly).
  let cdnHits = 0
  await page.route('**/cdn.jsdelivr.net/**', (r) => {
    cdnHits++
    return r.abort()
  })
  const healthDone = page.waitForResponse((r) => r.url().includes('/api/health') && r.request().method() === 'GET', { timeout: 10_000 }).catch(() => null)
  await page.goto('/kitchen/recipe/new')
  await expect(page.locator('.recipe-title-input')).toBeVisible({ timeout: 15_000 })
  await healthDone
  await page.waitForTimeout(150)
  await page.getByRole('button', { name: 'Remplir vite' }).click()
  await page.locator('.recipe-helpers input[type=file]').setInputFiles({ name: 'carte.png', mimeType: 'image/png', buffer: PNG_1x1 })

  const modal = page.locator('.read-review')
  await expect(modal).toBeVisible({ timeout: 15_000 })
  await modal.getByRole('tab', { name: 'Rapport' }).click()
  await expect(modal.locator('.read-review__report')).toContainText('gemma-4')
  expect(visionCalls).toBe(1)
  expect(ocrCalls).toBe(0)
  expect(cdnHits, 'the device engine was never downloaded').toBe(0)
  expect(errors).toEqual([])
})
