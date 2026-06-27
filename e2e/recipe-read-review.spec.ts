import { test, expect } from '@playwright/test'
import { mockApi, seedState } from './mocks'

// Durable coverage for RecipeReadReview — the verify-against-the-photo OCR gate.
// In the real app it only mounts after a photo upload + an AI read, so the visual
// screenshot sweep never reaches it (and the FE-2 refactor that moved it onto the
// shared <Modal> was the one change with no e2e eyes on it). The /dev/kit gallery
// renders it deterministically from fixed props, so we drive the specimen: no AI,
// no R2, no upload — just the component + its real Modal mount + the flag logic.
//
// What this guards: the dialog opens, the Modal chrome renders (.read-review), the
// risky lines get flagged (a bare fraction "3/4 tasse" + a low-confidence word
// "cannelle"), the confirm/retake feet are reachable, and it throws no pageerror.
// Run at phone width too — the "mobile-friendly always" rule applies to overlays.

for (const format of [
  { name: 'phone', width: 390, height: 844 },
  { name: 'wall', width: 1280, height: 800 },
] as const) {
  test(`recipe read-review dialog renders + flags risky lines @${format.name}`, async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(e.message))

    await page.setViewportSize({ width: format.width, height: format.height })
    await mockApi(page)
    await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'kiosk' })
    await page.goto('/dev/kit')

    // Expand the specimen's <details> (no search filter: a filtered DevKit memoizes
    // `shown` on deps that omit the per-specimen open-state, so an interactive
    // specimen won't re-open while filtered — the no-query path rebuilds each render).
    const entry = page.locator('details.kit-entry').filter({ hasText: 'Ouvrir la vérification' })
    await entry.locator('summary').click()
    const open = entry.getByRole('button', { name: 'Ouvrir la vérification' })
    await open.waitFor({ state: 'visible', timeout: 15_000 })
    await open.click()

    // The shared Modal mount the FE-2 refactor introduced: className="read-review".
    const modal = page.locator('.read-review')
    await expect(modal).toBeVisible()

    // The flag logic actually fired: "3/4 tasse" (bare fraction) and "cannelle"
    // (seeded low-confidence word) are both worth a second look.
    await expect(modal.locator('.read-review__line.is-flagged')).toHaveCount(2)
    // Both feet are reachable: the ghost « Annuler » and the primary confirm
    // (« C'est bon ») — targeted structurally so the assertion is locale-proof.
    await expect(modal.locator('.read-review__foot .btn--ghost')).toBeVisible()
    await expect(modal.locator('.read-review__foot .btn--primary')).toBeEnabled()

    // Overlay must not overflow the viewport horizontally on a phone.
    const overflow = await page.evaluate(() => {
      const doc = document.documentElement
      return doc.scrollWidth > doc.clientWidth + 1
    })
    expect(overflow, 'no horizontal overflow with the dialog open').toBeFalsy()

    await page.screenshot({ path: `e2e/screenshots/recipe-read-review-${format.name}.png`, fullPage: true })
    expect(errors, 'pageerror with the read-review dialog open').toEqual([])
  })
}
