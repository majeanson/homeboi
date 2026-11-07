import { test, expect } from '@playwright/test'
import { isApi, panelsReady } from './interact'

// Réglages config panels, Maison (templates, routines, members, chores, schedule, groups). Each test asserts the write fires AND carries the right
// field: why a settings panel needs that is written out above `panelsReady` in interact.ts.

test.beforeEach(async ({ page }) => panelsReady(page))

// ─────────────────────────────────────────────────────────────────────────────
// Réglages ▸ Maison — « Listes à compléter » (the todo templates) and the routine
// moment-of-day chip. The templates panel is the heaviest uncovered writer in
// Réglages: create / rename / delete / reorder / duplicate all POST or PATCH
// /api/todo-templates, and every one of them is fire-and-forget (`void write(...)`
// with a swallowed .catch), so nothing on screen changes if the write is lost.
//
// The panel is now a ROW PER LIST (name + item count + ✏/🗑); everything that edits
// one list lives on its own scene, /liste-modele/:id — so the create test stays here
// and the rename test goes there.

test('adding a todo template posts it', async ({ page }) => {
  await page.goto('/settings?tab=maison&focus=todoTemplates')
  const section = page.locator('#operator-panel')
  const add = section.getByLabel('Nom de la liste').last()
  await expect(add).toBeVisible()
  await add.fill('Sac de piscine')
  const [req] = await Promise.all([
    page.waitForRequest(isApi('POST', 'todo-templates'), { timeout: 20_000 }),
    add.press('Enter'),
  ])
  const body = JSON.parse(req.postData() || '{}') as { title?: string; items?: unknown[] }
  expect(body.title).toBe('Sac de piscine')
  // A new template starts empty — items is sent, not left undefined, so the server
  // never has to guess (the JSON column is NOT NULL, defaulted '[]').
  expect(body.items).toEqual([])
})

test('a list row opens its editor scene', async ({ page }) => {
  await page.goto('/settings?tab=maison&focus=todoTemplates')
  const section = page.locator('#operator-panel')
  // The row says what the list IS without opening anything: its name, and the count
  // it actually lands (tpl1 is 2 plain items + a ref to tpl2's 2 = 4).
  const row = section.getByRole('button', { name: 'Avant de partir', exact: true })
  await expect(row).toBeVisible()
  await expect(section.getByText('4 éléments')).toBeVisible()
  // The ✏ is the door (the name is its mouse-convenience twin) — same scene.
  await section.getByRole('button', { name: 'Modifier — Avant de partir' }).click()
  await expect(page).toHaveURL(/\/liste-modele\/tpl1/)
  // The scene is a LAZY route: 15 s is the first-visit budget (meal-order, kitchen-meal-plan).
  await expect(page.getByLabel('Ajouter un élément')).toBeVisible({ timeout: 15_000 })
  // …and it STAYS. This test's reds were read as a cold compile until 2026-11-05: Réglages
  // stays mounted while the chunk loads, and the ?focus= timer navigated back to it.
  await page.waitForTimeout(400)
  await expect(page).toHaveURL(/\/liste-modele\/tpl1/)
})

test('deleting a list template is HELD behind « Annuler » — the row hides at once, the DELETE waits, undo is the same row', async ({ page }) => {
  // It used to DELETE at once and re-POST a copy on undo — a NEW id, so every other
  // list that included this one was left with a dangling ref (2026-11-05, solidify
  // 1.7). Now useDeferredRemoval: nothing is written until the toast commits.
  const deletes: string[] = []
  await page.route('**/api/todo-templates', (route) => {
    if (route.request().method() === 'DELETE') deletes.push(JSON.parse(route.request().postData() || '{}').id)
    return route.fallback()
  })
  await page.goto('/settings?tab=maison&focus=todoTemplates')
  const section = page.locator('#operator-panel')
  const row = section.getByRole('button', { name: 'Avant de partir', exact: true })
  await expect(row).toBeVisible()
  await section.getByRole('button', { name: 'Supprimer — Avant de partir' }).click()
  await expect(row).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Annuler' })).toBeVisible()
  expect(deletes).toEqual([])

  await page.getByRole('button', { name: 'Annuler' }).click()
  await expect(section.getByRole('button', { name: 'Avant de partir', exact: true })).toBeVisible()
  // Proving nothing happened: nothing marks an absence, so give it the time it would have taken.
  await page.waitForTimeout(400)
  expect(deletes).toEqual([])
})

test('renaming a todo template patches it by id', async ({ page }) => {
  await page.goto('/liste-modele/tpl1')
  const section = page.locator('.scene')
  // tpl1 is « Avant de partir » in the fixture; the scene's title is an inline
  // editable field. The id must ride along or the rename lands on the wrong list.
  const name = section.getByLabel('Nom de la liste').first()
  await expect(name).toHaveValue('Avant de partir')
  await name.fill('Avant de sortir')
  const [req] = await Promise.all([
    page.waitForRequest(isApi('PATCH', 'todo-templates'), { timeout: 20_000 }),
    name.blur(),
  ])
  const body = JSON.parse(req.postData() || '{}') as { id?: string; title?: string }
  expect(body.id).toBe('tpl1')
  expect(body.title).toBe('Avant de sortir')
})

test('the routine moment chip patches that routine’s timeOfDay', async ({ page }) => {
  await page.goto('/settings?tab=maison&sub=routines&focus=routines')
  const section = page.locator('#operator-panel')
  // « Matin » (r1) starts timeOfDay 'morning'; the chip cycles
  // anytime → matin → après-midi → soir → anytime, one write per tap. The routineId
  // must ride along — the cue is per-routine, and the panel lists several.
  const chip = section.getByRole('button', { name: /^Moment :/ }).first()
  await expect(chip).toBeVisible()
  const [req] = await Promise.all([
    page.waitForRequest(isApi('PATCH', 'routines'), { timeout: 20_000 }),
    chip.click(),
  ])
  const body = JSON.parse(req.postData() || '{}') as { routineId?: string; timeOfDay?: string | null }
  expect(body.routineId).toBe('r1')
  // 'morning' is index 0 of ROUTINE_TODS, so one tap advances to the next cue —
  // whatever it is named, it must not stay 'morning' and must not be omitted.
  expect(body).toHaveProperty('timeOfDay')
  expect(body.timeOfDay).not.toBe('morning')
})

// ─────────────────────────────────────────────────────────────────────────────
// Réglages ▸ Maison ▸ « La maisonnée » and Réglages ▸ Système ▸ « Tablettes ».
// Member admin is the most consequential panel in Réglages (it is operator-only
// and kiosk-gated for that reason) and had no write test at all; the household
// name and the tablet label are both blur-committed fields, the shape most prone
// to saving nothing while looking saved.

test('adding a member posts name, child flag and colour', async ({ page }) => {
  await page.goto('/settings?tab=maison&sub=members')
  const section = page.locator('#operator-panel')
  const add = section.getByLabel('Nom', { exact: true }).last()
  await expect(add).toBeVisible()
  await add.fill('Mathis')
  const [req] = await Promise.all([
    page.waitForRequest(isApi('POST', 'members'), { timeout: 20_000 }),
    add.press('Enter'),
  ])
  const body = JSON.parse(req.postData() || '{}') as { name?: string; isChild?: boolean; color?: string }
  expect(body.name).toBe('Mathis')
  // A member is created with a colour already chosen — the avatar disc and every
  // face tint downstream read it, so leaving it to the server would flash a
  // default. isChild is sent explicitly rather than inferred.
  expect(typeof body.isChild).toBe('boolean')
  expect(body.color).toBeTruthy()
})

test('renaming the maisonnée patches household on blur', async ({ page }) => {
  await page.goto('/settings?tab=maison&sub=members')
  const field = page.locator('#operator-panel').getByLabel('Nom de la maisonnée')
  await expect(field).toHaveValue('Maison Tremblay')
  await field.fill('Famille Tremblay-Roy')
  const [req] = await Promise.all([
    page.waitForRequest(isApi('PATCH', 'household'), { timeout: 20_000 }),
    field.blur(),
  ])
  const body = JSON.parse(req.postData() || '{}') as { name?: string }
  expect(body.name).toBe('Famille Tremblay-Roy')
})

// THE SECOND SWEEP, Maison half: see interact.ts. Navigates by SECTION (?tab=&focus=) and
// scopes to the card's #op-<key> anchor, never to a pill label.

test('renaming a member patches it by id, keeping colour and child flag', async ({ page }) => {
  await page.goto('/settings?tab=maison&focus=members')
  const card = page.locator('#op-members')
  await card.getByRole('button', { name: 'Modifier la personne' }).first().click()
  const field = card.locator('.member-card--editing').getByLabel('Nom', { exact: true })
  await expect(field).toHaveValue('Maman')
  await field.fill('Maman R.')
  const [req] = await Promise.all([
    page.waitForRequest(isApi('PATCH', 'members'), { timeout: 20_000 }),
    field.press('Enter'),
  ])
  const body = JSON.parse(req.postData() || '{}') as { id?: string; name?: string; colour?: string; isChild?: boolean }
  expect(body.id).toBe('m1')
  expect(body.name).toBe('Maman R.')
  // A rename must not silently reset the face: colour + child flag ride along.
  expect(body.colour).toBeTruthy()
  expect(typeof body.isChild).toBe('boolean')
})

test('a season seed posts a dated upkeep with its cadence and lead time', async ({ page }) => {
  await page.goto('/settings?tab=maison&focus=chores')
  // ChoresTabPanel's own inner row (tâches · projets · entretien) sits ABOVE the
  // #op-chores card and swaps it for Entretien's — so go through the panel, and
  // scope the seed to the Entretien card by its title.
  const panel = page.locator('#operator-panel')
  await expect(page.locator('#op-chores')).toBeVisible()
  await panel.getByRole('tab', { name: 'Entretien' }).click()
  const card = panel.locator('.operator__section', { hasText: 'Idées de saison' })
  const [req] = await Promise.all([
    page.waitForRequest(isApi('POST', 'home-projects'), { timeout: 20_000 }),
    card.getByRole('button', { name: /Poser les pneus/ }).click(),
  ])
  const body = JSON.parse(req.postData() || '{}') as { kind?: string; title?: string; at?: number; recur?: unknown; leadSeconds?: number }
  expect(body.kind).toBe('upkeep')
  expect(body.title).toBe('Poser les pneus d’hiver / d’été')
  expect(typeof body.at).toBe('number')
  expect(body.recur).toEqual({ freq: 'monthly', interval: 6 })
  // A-6: an annual ritual gets a week-scale « Bientôt » — three weeks for the tires.
  expect(body.leadSeconds).toBe(3 * 7 * 86_400)
})

test('a new work-hours block posts the member, the minutes and holdsCar', async ({ page }) => {
  await page.goto('/settings?tab=maison&focus=schedule')
  await page.locator('#op-schedule').getByRole('button', { name: 'Ajouter un horaire' }).click()
  const form = page.locator('.operator__inline-form').last()
  await form.getByRole('button', { name: 'Papa', exact: true }).click()
  const times = form.locator('input[type="time"]')
  await times.nth(0).fill('08:00')
  await times.nth(1).fill('16:30')
  const [req] = await Promise.all([
    page.waitForRequest(isApi('POST', 'schedule'), { timeout: 20_000 }),
    form.getByRole('button', { name: 'Ajouter', exact: true }).click(),
  ])
  const body = JSON.parse(req.postData() || '{}') as { memberId?: string; startMin?: number; endMin?: number; weekdays?: number[]; holdsCar?: boolean }
  expect(body.memberId).toBe('m2')
  // Minutes since midnight, not "HH:MM" — the car planner does arithmetic on these.
  expect(body.startMin).toBe(8 * 60)
  expect(body.endMin).toBe(16 * 60 + 30)
  expect(Array.isArray(body.weekdays)).toBe(true)
  expect(typeof body.holdsCar).toBe('boolean')
})

test('deleting a cercle group confirms first, then deletes it by id', async ({ page }) => {
  await page.route('**/api/cercle**', (route) =>
    route.request().method() === 'GET' && new URL(route.request().url()).pathname === '/api/cercle'
      ? route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            contacts: [],
            links: [],
            members: [],
            groups: [{ id: 'g1', name: 'Les cousins', kind: 'family', colour: null, memberKeys: [] }],
          }),
        })
      : route.fallback(),
  )
  await page.goto('/settings?tab=maison&focus=cercleGroups')
  const card = page.locator('#op-cercleGroups')
  await card.getByRole('button', { name: 'Supprimer le groupe — Les cousins' }).click()
  // A heavy delete: the confirm dialog, not the undo toast.
  const dialog = page.locator('.confirm')
  await expect(dialog).toBeVisible()
  const [req] = await Promise.all([
    page.waitForRequest(isApi('DELETE', 'cercle-groups'), { timeout: 20_000 }),
    dialog.getByRole('button', { name: /^(Supprimer|Confirmer)$/ }).click(),
  ])
  expect(JSON.parse(req.postData() || '{}')).toMatchObject({ id: 'g1' })
})

// ─────────────────────────────────────────────────────────────────────────────
// THE LAST TWO, closed 2026-09-09 (REVIEW-PASS.md's final open box).
//
// Both had stood as "needs a richer harness than a body assertion". Neither did — and
// the note explaining why was itself wrong about the mechanism: the photo upload was
// filed as "a multipart POST the mock can't shape without a real file", but
// `uploadMedia` POSTs a RAW BLOB (lib/uploadMedia.ts), and Playwright synthesises a
// file from a Buffer. The blocker was a description, not a limitation. Grep the claim.

test('deleting a member asks first, says what is lost, and only then DELETEs by id', async ({ page }) => {
  let deletes = 0
  await page.route('**/api/members**', async (route) => {
    if (route.request().method() !== 'DELETE') return route.fallback()
    deletes += 1
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' })
  })
  await page.goto('/settings?tab=maison&focus=members')
  const card = page.locator('#op-members')
  await card.getByRole('button', { name: 'Supprimer la personne' }).first().click()

  // This is a CASCADE (their routines go; rendez-vous and tâches detach), so it is
  // confirm-gated rather than undo-gated. Two halves, and the first is the one that
  // actually protects someone: backing out must send nothing at all.
  const dialog = page.locator('.confirm')
  await expect(dialog).toBeVisible()
  // …and the dialog must NAME the loss — `confirmCopy.test.ts` owns that rule for the
  // string; this proves the string is what reaches the screen.
  await expect(dialog.locator('.confirm__msg')).toContainText('routines')
  await dialog.getByRole('button', { name: 'Annuler' }).click()
  await expect(dialog).toHaveCount(0)
  expect(deletes, 'cancelling a cascade must not send the DELETE').toBe(0)

  await card.getByRole('button', { name: 'Supprimer la personne' }).first().click()
  const [req] = await Promise.all([
    page.waitForRequest(isApi('DELETE', 'members'), { timeout: 20_000 }),
    page.locator('.confirm').getByRole('button', { name: 'Supprimer la personne' }).click(),
  ])
  expect(JSON.parse(req.postData() || '{}')).toMatchObject({ id: 'm1' })
})
