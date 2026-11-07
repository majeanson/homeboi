import { test, expect } from '@playwright/test'
import { APP, settle, isApi, expectApi } from './interact'

// Interaction coverage, Réglages: its sub-tabs and the settings forms. The harness and its discipline are at the top of interact.ts:
// a form asserts the request it fires, an optimistic flow asserts what the user sees.

// ─────────────────────────── settings tabs ─────────────────────────────

test.describe('settings tabs', () => {
  test('every sub-tab selects and shows its panel', async ({ page }) => {
    await APP('/settings')(page)
    await settle(page, '.operator__tabs')
    // Scope to the settings tab strip: each tab's panel now carries its own SubTabs
    // (role=tab) row, so an unscoped getByRole('tab') would also count the sub-tabs.
    const tabs = page.locator('.operator__tabs').getByRole('tab')
    const n = await tabs.count()
    // Découvrir (first/default) + the six themed tabs, one per hub section in the
    // canonical order: Le babillard, La cuisine, La liste, Les notes, Maison,
    // Système (Le cercle + Routines merged into one Maison tab — still seven
    // tabs total). Each themed tab stacks its sections as sub-sections behind its
    // « Régler » lens (so every section is still reachable).
    expect(n).toBe(7)
    for (let i = 0; i < n; i++) {
      await tabs.nth(i).click()
      await expect(tabs.nth(i)).toHaveAttribute('aria-selected', 'true')
      await expect(page.locator('.operator__panel h2').first()).toBeVisible()
    }
  })
})

// ─────────────────────────── settings forms ────────────────────────────

test.describe('settings forms', () => {
  test.beforeEach(async ({ page }) => {
    // Land on the default tab (Guide). It has no <button>/<form>, so each case
    // below can click its own tab and the panel locators wait for the target
    // panel to render — starting on a form-heavy tab would race the switch.
    await APP('/settings')(page)
    await settle(page, '.operator__tabs')
  })

  test('add a household member', async ({ page }) => {
    // Members live under Maison now (the merged Le cercle + Routines tab), on
    // its « La maisonnée » sub — Routines (the tab's default section) shows first.
    await page.locator('.operator__tabs').getByRole('tab', { name: 'Maison', exact: true }).click()
    await page.locator('.operator__subs').getByRole('tab', { name: 'La maisonnée', exact: true }).click()
    // The member-add box is the shared EditField (form.edit-field) inside the
    // members CARD — scoped by its #op-members anchor, since the pill stacks the
    // cercle groups (and their own EditField) under the same row.
    const form = page.locator('#op-members form.edit-field')
    await form.locator('input.input').first().fill('Mamie')
    await expectApi(page, 'POST', 'members', () => form.locator('button[type="submit"]').click())
  })

  test('add an event', async ({ page }) => {
    // Events live under Le babillard now (its first sub — the board IS the agenda).
    await page.locator('.operator__tabs').getByRole('tab', { name: 'Le babillard' }).click()
    // Adding now opens the full-screen event scene (the panel's inline form is
    // EDIT-only): "Ajouter un rendez-vous" navigates to /event/new with the same
    // EventForm — a scene, not a sheet, so its fields ride above the keyboard.
    // .first(): the agenda tab now stacks events + car + schedule, each with its own
    // .operator__add — the event one is first.
    await page.locator('.operator__add').first().click()
    await page.waitForURL(/\/event\/new/)
    const form = page.locator('.scene form.operator__inline-form')
    await form.locator('input.input').first().fill('Réunion parents')
    await form.locator('input[type="date"]').fill('2026-07-01')
    await expectApi(page, 'POST', 'events', () => form.locator('button[type="submit"]').click())
  })

  test('add a chore', async ({ page }) => {
    // Chores stack under Maison ▸ « Routines & listes » (routines · tâches ·
    // à compléter, 2026-09-08) — the chores card is addressed by its #op-chores
    // anchor, since the routines card above it has an .operator__add of its own.
    await page.locator('.operator__tabs').getByRole('tab', { name: 'Maison', exact: true }).click()
    await page.locator('.operator__subs').getByRole('tab', { name: 'Routines & listes', exact: true }).click()
    // Adding a chore opens the full-screen /chore/new scene (Réglages rows are
    // edit/remove only).
    await page.locator('#op-chores .operator__add').first().click()
    await page.waitForURL(/\/chore\/new/)
    const form = page.locator('.scene .operator__chore-form')
    await form.locator('input.input').first().fill('Balayer la cuisine')
    await expectApi(page, 'POST', 'chores', () => form.locator('button[type="submit"]').click())
  })

  test('add a kid routine', async ({ page }) => {
    // Routines is Maison's own sub-section (and its default section) now —
    // deep-link to it (?tab=maison&sub=routines) so the routines panel renders.
    await APP('/settings?tab=maison&sub=routines')(page)
    await settle(page, '.operator__tabs')
    await page.locator('.operator__section', { hasText: 'Routines (mode enfant)' }).locator('.operator__add').click()
    await page.waitForURL(/\/routine\/new/)
    const form = page.locator('.scene .operator__routine-form')
    await form.locator('.mswitch__opt').first().click() // pick a child (for-who MemberPicker)
    await form.locator('input.input').first().fill('Routine du soir')
    await expectApi(page, 'POST', 'routines', () => form.locator('button[type="submit"]').click())
  })

  test('save the shopping postal code', async ({ page }) => {
    // Shopping config lives under La liste now (its first sub, « Magasinage »).
    await page.locator('.operator__tabs').getByRole('tab', { name: 'La liste', exact: true }).click()
    // The postal form is the shared EditField (form.edit-field) now.
    const form = page.locator('.operator__panel form.edit-field')
    await form.locator('input.input').first().fill('H2X 1Y4')
    await expectApi(page, 'PATCH', 'household', () => form.locator('button[type="submit"]').click())
  })

  test('add a ghost-list staple', async ({ page }) => {
    // Ghost tracking stacks under La liste ▸ « Historique & suivi »; ?focus= names its card.
    await APP('/settings?tab=liste&sub=history&focus=ghost')(page)
    await settle(page, '.operator__tabs')
    const form = page.locator('.operator__section', { hasText: 'Liste fantôme' }).locator('form.operator__inline-form')
    await form.locator('input.input').first().fill('Savon à vaisselle')
    await expectApi(page, 'PATCH', 'ghost', () => form.locator('button[type="submit"]').click())
  })

  test('a frequent buy is offered for tracking — one deliberate tap tracks it', async ({ page }) => {
    await APP('/settings?tab=liste&sub=history&focus=ghost')(page)
    await settle(page, '.operator__tabs')
    // Tracking is conscious: candidates sit apart from the tracked rows, and
    // nothing enters the set until this tap.
    const chip = page.locator('.ghost-admin__candidate-chips .chip').first()
    await expect(chip).toBeVisible()
    await expectApi(page, 'PATCH', 'ghost', () => chip.click())
  })

  test('rename a bought-item history entry to a generic name (merge)', async ({ page }) => {
    // The grocery-history list leads La liste ▸ « Historique & suivi ».
    await APP('/settings?tab=liste&sub=history&focus=history')(page)
    await settle(page, '.operator__tabs')
    // "Yogourt grec" is in the grocery history → rename it to the generic "Yogourt"
    // so quick-add folds it in and suggests the generic item.
    await page.locator('.ghost-admin__row', { hasText: 'Yogourt grec' }).getByRole('button', { name: 'Renommer' }).click()
    // The inline rename editor is now the shared EditField (form.edit-field).
    const form = page.locator('.ghost-admin__row form.edit-field')
    await form.locator('input.input').fill('Yogourt')
    const [req] = await Promise.all([
      page.waitForRequest(isApi('PATCH', 'list')),
      form.getByRole('button', { name: 'Enregistrer' }).click(),
    ])
    expect(JSON.parse(req.postData() || '{}')).toMatchObject({ historyKey: 'yogourt grec', renameTo: 'Yogourt' })
  })

  test('remove a bought-item history entry so quick-add stops suggesting it', async ({ page }) => {
    await APP('/settings?tab=liste&sub=history&focus=history')(page)
    await settle(page, '.operator__tabs')
    const [req] = await Promise.all([
      // « Retirer » holds the DELETE behind the undo toast now (deferred removal),
      // so it fires on commit after the 15 s hold (toast.tsx DEFAULT_UNDO_MS) — the
      // wait must sit ABOVE that, like the expectApi helper above.
      page.waitForRequest(isApi('DELETE', 'list'), { timeout: 20_000 }),
      page.locator('.ghost-admin__row', { hasText: 'Bananes' }).getByRole('button', { name: 'Retirer' }).click(),
    ])
    expect(JSON.parse(req.postData() || '{}')).toMatchObject({ historyKey: 'bananes' })
  })

  test('claim a tablet with a 6-digit code', async ({ page }) => {
    // Pairing lives under Système now (its first sub, « Tablettes jumelées »).
    await page.locator('.operator__tabs').getByRole('tab', { name: 'Système' }).click()
    const form = page.locator('.operator__claim form')
    await form.locator('input.input').first().fill('123456')
    await expectApi(page, 'POST', 'pair/claim', () => form.locator('button[type="submit"]').click())
  })

  test('generate the weekly recap', async ({ page }) => {
    // The AI recap sits with the week glance under Le babillard ▸ « Agenda & semaine ».
    await APP('/settings?tab=board&sub=events&focus=thisWeek')(page)
    await settle(page, '.operator__tabs')
    await expectApi(page, 'GET', 'recap', () => page.getByRole('button', { name: 'Générer le bilan' }).click())
    await expect(page.locator('.operator__panel')).toContainText('Belle semaine')
  })
})
