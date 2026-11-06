import { test, type App } from './fixtures'
import { settled } from './measure'
import { type Theme } from './mocks'

// One-off capture of the welcome/marketing front door (the brand-new-visitor
// Home). NOT seeding a surface keeps `chosen` false so Entry renders <Home>
// instead of redirecting to /board. Writes e2e/screenshots/home-*.png.

const PHONE = { width: 390, height: 844 }
const WIDE = { width: 1000, height: 900 }

// Brand-new visitor: signed-out (Entry shows <Home> only when not signed in), and no
// surface in the seed, so the device has not "chosen" yet.
async function arrive(app: App, theme: Theme, format: { width: number; height: number }) {
  const { page } = app
  await app.boot({ viewport: format, state: { theme, calm: true, audience: undefined, surface: undefined } })
  await page.route('**/api/auth/me', (route) => route.fulfill({ status: 401, contentType: 'application/json', body: '{}' }))
  await page.goto('/')
  await page.locator('.home').waitFor({ state: 'visible', timeout: 15_000 })
  await settled(page)
}

// « Essayer sans compte » — the demo door mints a per-visitor SANDBOX (POST
// /api/demo → { sandbox: true } + session cookies) and lands on /board with no
// ?guest= (the visitor is a real operator of a throwaway household). The legacy
// read-only fallback ({ guestToken }) keeps the old ?guest= boot — asserted too.
test('demo button: sandbox lands on /board, fallback keeps ?guest=', async ({ page, app }) => {
  await arrive(app, 'day', PHONE)
  await page.route('**/api/demo', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ sandbox: true, expiresAt: 9999999999 }) }),
  )
  await page.getByRole('button', { name: 'Essayer sans compte' }).click()
  await page.waitForURL('**/board')

  // Fallback shape: past the sandbox cap the endpoint returns a guest token.
  await arrive(app, 'day', PHONE)
  await page.route('**/api/demo', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ guestToken: 'tok_demo', expiresAt: 9999999999 }) }),
  )
  await page.getByRole('button', { name: 'Essayer sans compte' }).click()
  await page.waitForURL('**/board?guest=tok_demo')
})

for (const theme of ['day', 'night'] as Theme[]) {
  const sfx = theme === 'night' ? '-night' : ''
  test(`home-phone${sfx}`, async ({ page, app }) => {
    await arrive(app, theme, PHONE)
    await page.screenshot({ path: `e2e/screenshots/home-phone${sfx}.png`, fullPage: true })
  })
  test(`home-wide${sfx}`, async ({ page, app }) => {
    await arrive(app, theme, WIDE)
    await page.screenshot({ path: `e2e/screenshots/home-wide${sfx}.png`, fullPage: true })
  })
  test(`setup${sfx}`, async ({ page, app }) => {
    await arrive(app, theme, PHONE)
    await page.goto('/setup')
    await page.locator('.setup__choices').waitFor({ state: 'visible', timeout: 15_000 })
    await settled(page)
    await page.screenshot({ path: `e2e/screenshots/setup${sfx}.png`, fullPage: true })
  })
}
