import { test, expect, type Page } from '@playwright/test'
import { mockApi, seedState } from './mocks'

// « No write fails silently » (commit 6d9e18a) — pins the error surfacing on the
// three representative write paths that used to eat a server rejection:
//
//   • AddSheet: an in-sheet submit against a 4xx/5xx keeps the sheet OPEN, keeps
//     the typed text, and shows the shared `.status-msg--error` saveFailed line
//     (the sheet used to just sit there, silent).
//   • ListEditPage: save/delete against a 5xx keep the scene open + say so
//     (they used to `.catch(() => {})` then close() as if it worked).
//   • RecipeForm: a rejected POST keeps the modal open with the error in the
//     footer (it used to close via onSaved() and DROP the recipe), and the new
//     dirty-guard turns a stray backdrop/Esc close into a confirm instead of a
//     discard. NB: `.recipe-modal__scrim` is `display:none` in recipes.css (the
//     form is a full-screen route — the card IS the screen), so the guard is
//     driven through Esc here: useModal wires BOTH the scrim click and the Esc
//     key to the same requestClose, so this pins the shared path.
//
// Offline is deliberately NOT an error anywhere here: a transport failure (no
// response at all) queues through useWrite's outbox and the calm close still
// happens — the last test pins that distinction so a regression can't start
// treating a dead connection as a server "no".

const SAVE_FAILED = 'Pas enregistré — réessaie.'

async function boot(page: Page, path: string, ready: string) {
  await page.setViewportSize({ width: 420, height: 860 })
  await mockApi(page)
  await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile' })
  await page.goto(path)
  await expect(page.locator(ready)).toBeVisible({ timeout: 15_000 })
}

// Registered AFTER mockApi, so it intercepts first; everything it doesn't fail
// falls back to the shared mock. Toggleable so a test can re-run the same submit
// against a healthy server and prove the recovery path (the sheet closes).
async function failWrites(page: Page, apiPath: string, methods: string[]) {
  const state = { on: true }
  await page.route(`**/api/${apiPath}`, (route) => {
    if (state.on && methods.includes(route.request().method())) {
      return route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'Erreur serveur' }) })
    }
    return route.fallback()
  })
  return state
}

// ─────────────────────────── AddSheet (board ＋) ───────────────────────────

test('AddSheet: a rejected quick todo add keeps the sheet open, the text, and says so', async ({ page }) => {
  await boot(page, '/board', '.board-wall')
  const fail = await failWrites(page, 'todos', ['POST'])

  await page.locator('.add-fab').click()
  const sheet = page.locator('.sheet.show')
  await expect(sheet).toBeVisible()
  await sheet.locator('.cat-pick[data-mode="todo"]').click()

  const input = sheet.locator('.addsheet__todo .edit-field__input')
  await input.fill('Appeler le vétérinaire')
  await sheet.locator('.addsheet__todo').getByRole('button', { name: 'Ajouter' }).click()

  // The server said no: the sheet stays open, the typed line is NOT lost, and
  // the one shared saveFailed line is visible (it used to show nothing at all).
  const errLine = sheet.locator('.status-msg--error')
  await expect(errLine).toBeVisible()
  await expect(errLine).toContainText(SAVE_FAILED)
  await expect(sheet).toBeVisible()
  await expect(input).toHaveValue('Appeler le vétérinaire')

  // Server recovers → the SAME resubmit goes through and the sheet closes calmly.
  fail.on = false
  await sheet.locator('.addsheet__todo').getByRole('button', { name: 'Ajouter' }).click()
  await expect(page.locator('.sheet.show')).toBeHidden()
})

// ─────────────────────── ListEditPage (/liste/item/:id) ───────────────────────

test('ListEditPage: a rejected save keeps the scene open with the error line', async ({ page }) => {
  await boot(page, '/liste/item/l2', '.li-edit') // « Pain », from the board fixture
  await failWrites(page, 'list', ['PATCH'])

  await page.locator('.li-edit__actions .btn--primary').click() // Enregistrer

  const errLine = page.locator('.li-edit .status-msg--error')
  await expect(errLine).toBeVisible()
  await expect(errLine).toContainText(SAVE_FAILED)
  // Still ON the scene — it used to close() as if the save had landed.
  await expect(page).toHaveURL(/\/liste\/item\/l2/)
})

test('ListEditPage: a rejected delete (through the confirm) keeps the scene open with the error line', async ({ page }) => {
  await boot(page, '/liste/item/l2', '.li-edit')
  await failWrites(page, 'list', ['DELETE'])

  await page.getByRole('button', { name: 'Supprimer de la liste' }).click()
  const dialog = page.locator('.confirm')
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: 'Supprimer', exact: true }).click()

  const errLine = page.locator('.li-edit .status-msg--error')
  await expect(errLine).toBeVisible()
  await expect(errLine).toContainText(SAVE_FAILED)
  await expect(page).toHaveURL(/\/liste\/item\/l2/)
})

// ─────────────────────── RecipeForm (/kitchen/recipe/new) ───────────────────────

async function bootRecipe(page: Page) {
  await page.setViewportSize({ width: 1280, height: 900 })
  await mockApi(page)
  await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile' })
  await page.goto('/kitchen/recipe/new')
  await expect(page.locator('.recipe-modal')).toBeVisible({ timeout: 15_000 })
}

test('RecipeForm: a rejected save keeps the modal open with the error in the footer', async ({ page }) => {
  await bootRecipe(page)
  await failWrites(page, 'recipes', ['POST'])

  await page.locator('.recipe-title-input').fill('Soupe aux légumes')
  await page.locator('.recipe-modal__foot button[type="submit"]').click()

  const errLine = page.locator('.recipe-modal__foot .status-msg--error')
  await expect(errLine).toBeVisible()
  await expect(errLine).toContainText(SAVE_FAILED)
  // The modal stays: closing here (the old onSaved() path) would have discarded
  // the recipe as if it saved.
  await expect(page.locator('.recipe-modal')).toBeVisible()
  await expect(page.locator('.recipe-title-input')).toHaveValue('Soupe aux légumes')
})

test('RecipeForm: a backdrop/Esc close on a DIRTY form asks before discarding; cancel keeps the work', async ({ page }) => {
  await bootRecipe(page)
  await page.locator('.recipe-title-input').fill('Ragoût du dimanche')

  // A stray backdrop/Esc close mid-edit — the dirty guard must intercept it.
  // (The scrim is display:none on the full-screen route, so Esc drives the same
  // shared requestClose the scrim's onClick is wired to.)
  await page.keyboard.press('Escape')
  const dialog = page.locator('.confirm')
  await expect(dialog).toBeVisible()
  await expect(dialog).toContainText('Fermer sans enregistrer ?')

  // Cancel the discard → modal still open, title intact.
  await dialog.getByRole('button', { name: 'Annuler' }).click()
  await expect(dialog).toBeHidden()
  await expect(page.locator('.recipe-modal')).toBeVisible()
  await expect(page.locator('.recipe-title-input')).toHaveValue('Ragoût du dimanche')
})

test('RecipeForm: a backdrop/Esc close on a PRISTINE form closes immediately (no confirm)', async ({ page }) => {
  await bootRecipe(page)

  await page.keyboard.press('Escape')
  // Nothing typed → nothing to guard: no dialog, straight back to the kitchen.
  await expect(page.locator('.recipe-modal')).toBeHidden()
  await expect(page.locator('.confirm')).toBeHidden()
  await expect(page).toHaveURL(/\/kitchen/)
})

// ─────────────────────── offline is NOT an error ───────────────────────

// The distinction the whole wave rests on: a TRANSPORT failure (the request never
// got an answer — here route.abort()) is the offline path. useWrite queues it to
// the outbox and resolves, so the sheet closes calmly with NO error line — only a
// server that answered 4xx/5xx (the tests above) keeps the form open and says so.
test('AddSheet: a network-level failure queues calmly — the sheet closes, no error line', async ({ page }) => {
  await boot(page, '/board', '.board-wall')
  await page.route('**/api/todos', (route) =>
    route.request().method() === 'POST' ? route.abort('failed') : route.fallback(),
  )

  await page.locator('.add-fab').click()
  const sheet = page.locator('.sheet.show')
  await expect(sheet).toBeVisible()
  await sheet.locator('.cat-pick[data-mode="todo"]').click()
  await sheet.locator('.addsheet__todo .edit-field__input').fill('Sortir le compost')
  await sheet.locator('.addsheet__todo').getByRole('button', { name: 'Ajouter' }).click()

  await expect(page.locator('.sheet.show')).toBeHidden()
  await expect(page.locator('.status-msg--error')).toBeHidden()
})
