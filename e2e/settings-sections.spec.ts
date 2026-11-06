import { test, expect } from './fixtures'
import { fontsReady, settled } from './measure'

// Capture each Settings section (the CRUD strips behind the section nav) — they
// only render one at a time, so the static sweep only ever shoots the first.
// Phone format. Writes PNGs to e2e/screenshots for review.

const PHONE = { width: 390, height: 844 }
const SECTIONS = [
  // The themed tabs (one per hub section, canonical order) + Découvrir. « Le
  // cercle » and Routines merged into ONE Maison tab (the nav restructure); « Les
  // notes » split out into its own Comprendre-only tab.
  'decouvrir', 'board', 'kitchen', 'liste', 'notes', 'maison', 'settings',
  // Legacy ids, kept as alias regressions: each must still render a panel
  // (LEGACY_TAB folds them onto the themed tabs — see settings-aliases.spec).
  // 'cercle' and 'routines' themselves are now retired tab ids too, folding onto
  // 'maison'.
  'household', 'agenda', 'chores', 'shopping', 'cercle', 'routines',
  'recipes', 'ghost', 'devices', 'photos', 'week', 'display', 'calm', 'ai',
]

// Deep-link straight to each section via ?tab=<id> (these ids match the section
// ids in Operator.tsx). Robust against tab insertion/reorder — clicking by index
// silently captured the wrong panel once Guide became the first tab.

SECTIONS.forEach((id) => {
  test(`settings-${id}`, async ({ page, app }) => {
    await app.boot({ viewport: PHONE, state: { calm: true }, route: `/settings?tab=${id}`, wait: '.operator__tabs' })
    await fontsReady(page)
    await settled(page)
    // fullPage so the whole section shows — several run taller than the phone
    // viewport (shopping = postal + store filter, ghost = manage + candidates +
    // add-staple, household = member list + form) and were being cut off.
    await page.screenshot({ path: `e2e/screenshots/settings-${id}-phone.png`, fullPage: true })
  })
})

// C-15 — La cuisine's pill row is exactly THREE now (Apparence stacks the three
// old colour subs under one pill); the pre-fold names must be gone. Scoped to
// `.subtabs:not(.subtabs--mini)` since the Comprendre/Régler lens toggle is
// ALSO a `.subtabs` (the `mini` variant) sitting right above the sub-section row.
test('kitchen pill row is Apparence · meal colours · reserve (three, not five)', async ({ page, app }) => {
  await app.boot({ viewport: PHONE, state: { calm: true }, route: `/settings?tab=${'kitchen'}`, wait: '.operator__tabs' })
  await fontsReady(page)
  const pills = page.locator('.subtabs:not(.subtabs--mini)').getByRole('tab')
  await expect(pills).toHaveCount(3)
  await expect(pills.nth(0)).toHaveText('Apparence')
  await expect(page.locator('.subtabs').getByRole('tab', { name: 'Étiquettes de recettes' })).toHaveCount(0)
  await expect(page.locator('.subtabs').getByRole('tab', { name: 'Pastilles de recettes' })).toHaveCount(0)
  await expect(page.locator('.subtabs').getByRole('tab', { name: 'Couleurs des mesures' })).toHaveCount(0)
})
