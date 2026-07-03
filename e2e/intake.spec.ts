import { test, expect, type Page, type Request } from '@playwright/test'
import { mockApi, seedState, BASE } from './mocks'

// The « intake » (family-info) flow end-to-end (REVIEW-PASS §559), both sides:
//   1. GUEST SUBMIT — a relative opens the /intake form and sends their card
//      (POST guest/intake-submit → the thank-you screen).
//   2. OPERATOR REVIEW → ACCEPT — the quarantined submission shows in Réglages ▸
//      Partage (IntakeReview); reviewing + accepting it merges the person into Le
//      cercle (POST cercle …) and marks the submission merged (PATCH intake).
// The shared mock returns {ok:true} for writes, so we assert the request fired.

const isApi = (method: string, path: string) => (r: Request) =>
  r.method() === method && new URL(r.url()).pathname === `/api/${path}`

async function expectApi(page: Page, method: string, path: string, action: () => Promise<void>) {
  await Promise.all([page.waitForRequest(isApi(method, path), { timeout: 20_000 }), action()])
}

// One quarantined submission (self-only) for the operator side.
const PENDING = {
  id: 'sub1',
  targetKey: null,
  createdAt: BASE,
  self: { firstName: 'Mamie', lastName: 'Rose', nickname: '', birthday: null, gender: 'f', email: '', phone: '', address: null, notes: '', photoKey: null },
  household: [],
  links: [],
  pets: [],
}

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await mockApi(page)
  await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile' })
})

test('a relative fills the intake form and submits it', async ({ page }) => {
  // guest/window returns {} (base mock) → the form defaults to all sections + renders.
  await page.goto('/intake')
  const name = page.getByLabel('Prénom')
  await expect(name).toBeVisible()
  await name.fill('Mamie')
  await expectApi(page, 'POST', 'guest/intake-submit', () =>
    page.getByRole('button', { name: 'Envoyer' }).click(),
  )
  // Success flips the form to the thank-you screen.
  await expect(page.getByText('Merci !')).toBeVisible()
})

test('the operator reviews a pending intake and accepts it into the cercle', async ({ page }) => {
  await page.route('**/api/intake**', async (route) => {
    if (route.request().method() === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ submissions: [PENDING] }) })
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) })
  })
  // Merge creates the person via POST cercle — hand back an id so the flow completes;
  // GET cercle falls through to the base fixture (used to suggest dedupe matches).
  await page.route('**/api/cercle**', async (route) => {
    if (route.request().method() === 'POST') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: 'c99' }) })
    }
    return route.fallback()
  })

  await page.goto('/settings?tab=devices')
  // IntakeReview surfaces the quarantined submission by the sender's name.
  await expect(page.getByText(/Mamie/).first()).toBeVisible()
  await page.getByRole('button', { name: 'Réviser' }).click()

  // The review checklist opens (all items preselected); "Ajouter (1)" applies the
  // merge → POST cercle then PATCH intake (status: merged). Assert the completion.
  const dialog = page.locator('.kit-modal')
  await expect(dialog).toBeVisible()
  await expectApi(page, 'PATCH', 'intake', () =>
    dialog.getByRole('button', { name: 'Ajouter (1)' }).click(),
  )
})
