import { test, expect, type App } from './fixtures'

// A PAIRED KIOSK NEVER SEES A DOOR THE SERVER WILL 403.
//
// Thirty-six handlers are `authed(…, 'operator')` (transfers, trips, habits DELETE,
// members admin, guest links…). The client gated most of its doors on `isGuest()`
// alone, which is half the truth — a wall tablet holds a device token (scope 'kiosk')
// and is refused exactly like a guest. Until 2026-11-05 it saw « Modifier » /
// « Supprimer » / « Ajouter » on the virements, a « Supprimer » on a habit, a whole
// voyage scene, and read « Pas enregistré » behind each. `lib/device.ts`
// `needsOperator()` is the whole truth; `functions/_lib/operator-doors.test.ts` pairs
// every operator-only (path, method) with its client sites; this spec is the browser
// half, with an OPERATOR control per door so a selector that matches nothing cannot
// pass by accident.

const kiosk = (app: App) => app.boot({ api: { signedIn: false }, state: { paired: true, surface: 'kiosk' } })
const operator = (app: App) => app.boot()

test('a kiosk opening the voyage scene lands back on the board', async ({ page, app }) => {
  await kiosk(app)
  await page.goto('/voyage')
  await expect(page).toHaveURL(/\/board(\?|$)/)
})

test('a kiosk opening the transfer form lands on the virements section', async ({ page, app }) => {
  await kiosk(app)
  await page.goto('/virement/new')
  await expect(page).toHaveURL(/\/notes\?section=virements/)
  await page.goto('/virement/plan/new')
  await expect(page).toHaveURL(/\/notes\?section=virements/)
})

test('a kiosk opening the family import lands on the family section', async ({ page, app }) => {
  await kiosk(app)
  await page.goto('/cercle/import?intake=x')
  await expect(page).toHaveURL(/\/maison\?section=family/)
})

test('the virements section shows no add / edit / delete door to a kiosk (the operator sees them)', async ({ page, app }) => {
  // The doors: row furniture (edit / delete) and the section's own « Ajouter … » CTAs.
  // Not the section pill (« Les virements » is a tab, not a door).
  const doors = () => page.locator('.hub .row-actions__btn, .hub button').filter({ hasText: /^(Ajouter|Modifier|Supprimer)/ })
  await operator(app)
  await page.goto('/notes?section=virements')
  await page.locator('.hub').waitFor({ state: 'visible', timeout: 15_000 })
  await expect.poll(() => doors().count(), { message: 'control: the operator has at least one door' }).toBeGreaterThan(0)

  await kiosk(app)
  await page.goto('/notes?section=virements')
  await page.locator('.hub').waitFor({ state: 'visible', timeout: 15_000 })
  await page.waitForTimeout(400)
  await expect(doors()).toHaveCount(0)
})

test('a habit\'s form: the operator gets « Supprimer »; a kiosk never reaches the form', async ({ page, app }) => {
  await operator(app)
  await page.goto('/habitude/hb1/edit')
  await expect(page.getByRole('button', { name: 'Supprimer' })).toBeVisible({ timeout: 15_000 })

  // The habits DELETE is operator-only. A paired kiosk is bounced off the FormScene
  // (no operator session) before any footer renders — the door is not reachable at
  // all, which is one layer above HabitForm's own `!needsOperator()` on the button.
  await kiosk(app)
  await page.goto('/habitude/hb1/edit')
  await expect(page).not.toHaveURL(/\/habitude\//, { timeout: 15_000 })
  await expect(page.getByRole('button', { name: 'Supprimer' })).toHaveCount(0)
})
