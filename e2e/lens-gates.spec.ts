import { test, expect } from './fixtures'
import type { Audience } from '../src/lib/audience'

// THE LENS TABLE (lib/audience.ts `useLens()`, decided by Marc 2026-11-05):
//
//                 teaches   acts   interrupts
//   parent          ✓        ✓        ✓
//   simple          ✓        ✓        ✗      ← the calm lens: reads, acts, is never prompted
//   toddler         ✗        ✗        ✗
//
// Before useLens() the `simple` column was per-file luck — three sites showed it the
// help layer, six hid the edit doors from it. This spec holds the table so the next
// inline `audience === …` (which lens-rule.test.ts already refuses) cannot bring that
// back. One observable door per column:
//   teaches    → the kitchen's SectionIntro card (seeded fresh with `intros: true`)
//   acts       → the hub head's loupe (`data-tour="search"`; HubHead gates it on `acts`)
//   interrupts → the first-run tour auto-offer on the board (`tour: true` = not seen)
// /kitchen rather than /board for the first two: the simple board is SimpleBoard, which
// has no hub head by design (four giant tiles), while the kitchen keeps the parent shell.

const ROWS: { audience: Audience; teaches: boolean; acts: boolean; interrupts: boolean }[] = [
  { audience: 'parent', teaches: true, acts: true, interrupts: true },
  { audience: 'simple', teaches: true, acts: true, interrupts: false },
  { audience: 'toddler', teaches: false, acts: false, interrupts: false },
]

for (const row of ROWS) {
  test(`${row.audience}: teaches=${row.teaches} acts=${row.acts} interrupts=${row.interrupts}`, async ({ page, app }) => {
    await app.boot({ clock: 'BASE', state: { audience: row.audience, tour: true, intros: true } })

    await page.goto('/kitchen')
    await page.locator('.hub').waitFor({ state: 'visible', timeout: 15_000 })
    // A tour that auto-offers here (parent) sits over the page; it changes nothing below.
    await expect(page.locator('[data-tour="search"]'), 'acts — the hub-head loupe').toHaveCount(row.acts ? 1 : 0)
    await expect(page.locator('.section-intro'), 'teaches — the section intro card').toHaveCount(row.teaches ? 1 : 0)

    await page.goto('/board')
    await page.locator('.hub').waitFor({ state: 'visible', timeout: 15_000 })
    if (row.interrupts) {
      await expect(page.locator('.tour'), 'interrupts — the first-run tour offers itself').toBeVisible({ timeout: 15_000 })
    } else {
      // Proving the tour did NOT come: nothing marks an absence, so give the offer every
      // chance it would have had (it waits for the shell + session).
      await page.waitForTimeout(1500)
      await expect(page.locator('.tour'), 'interrupts — nothing may arrive uninvited').toHaveCount(0)
      await expect(page).toHaveURL(/\/board(\?|$)/)
    }
  })
}
