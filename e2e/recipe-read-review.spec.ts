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
// RISKY lines get flagged (a conversion mismatch, an unparseable amount, a shaky
// word, an AI-changed number) while clean measures stay calm, the « Rapport » tab
// names the pipeline (reader, models, repairs), the confirm/retake feet are
// reachable, and it throws no pageerror.
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

    // The flag logic actually fired — risky-only now, one specimen line per
    // reason: the conversion mismatch ("80 ml (1/2 tasse)"), the unparseable
    // amount ("A de c. à thé"), the shaky word ("cannelle"), the AI-changed
    // number ("1/3 tasse", seeded via report.suspect). The clean "3/4 tasse de
    // farine" and the consistent "225 g (1/2 lb)" ramens line stay CALM — the
    // old flag-every-fraction behaviour trained the eye to skim past warnings.
    await expect(modal.locator('.read-review__line.is-flagged')).toHaveCount(4)
    const flagged = await modal
      .locator('.read-review__line.is-flagged .read-review__memo')
      .evaluateAll((els) => els.map((e) => (e as HTMLTextAreaElement).value))
    expect(flagged.some((v) => v.includes('3/4 tasse de farine'))).toBe(false)

    // The « Rapport » tab: the pipeline honesty report names the reader, the
    // structuring model, the auto-repair and the AI-changed line.
    await modal.getByRole('tab', { name: 'Rapport' }).click()
    const reportPane = modal.locator('.read-review__report')
    await expect(reportPane).toBeVisible()
    await expect(reportPane).toContainText('Tesseract')
    await expect(reportPane).toContainText('llama-3.3-70b')
    await expect(reportPane).toContainText('1/3 tasse de cassonade')
    await expect(reportPane).toContainText('60 ml (1/4 de tasse)')
    await modal.getByRole('tab', { name: 'Vérifier' }).click()

    // The rows are MEMO boxes: the deliberately-long ramens ingredient must be
    // fully visible — wrapped, never clipped. A one-line <input> fails this on
    // scrollWidth (the "text that truncates" bug); a non-grown textarea fails on
    // scrollHeight.
    const clipped = await modal.locator('.read-review__fields').evaluate((root) => {
      const memos = [...root.querySelectorAll<HTMLTextAreaElement>('.read-review__memo')]
      const el = memos.find((m) => m.value.includes('ramens'))
      if (!el) return 'long line missing from the specimen'
      return el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1
    })
    expect(clipped, 'the long ingredient line is fully shown, not truncated').toBe(false)
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
