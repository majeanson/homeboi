import { test, expect } from './fixtures'

// Review #30 (2026-11-17), Marco as a stranger:
//   · a device that once tapped « tablette au mur » never saw the landing again;
//   · « J'ai déjà un compte » went to /setup, which reads « create your household »;
//   · the page title stayed French under an English UI on /signup, /login, /conditions;
//   · the privacy page's real selling points sat in the footer.

test('a device that chose a surface but has no account still gets the landing', async ({ app, page }) => {
  await app.boot({ api: { signedIn: false }, state: { surface: 'kiosk' } })
  await page.goto('/')
  await expect(page.locator('.home__hero')).toBeVisible({ timeout: 15_000 })
  // « J'ai déjà un compte » goes to the login.
  await expect(page.locator('.home__cta-link')).toHaveAttribute('href', '/login')
  // The privacy points are on the door, beside the promise.
  await expect(page.locator('.home__promises')).toContainText('Une copie de sauvegarde chaque nuit')
})

test('the signed-out board offers the way back to the pitch', async ({ app, page }) => {
  await app.boot({ api: { signedIn: false, unauthorized: true }, state: { surface: 'kiosk' }, route: '/board' })
  await expect(page.locator('.pairprompt__home')).toHaveAttribute('href', '/')
})

test('a standalone page is titled in the reader’s language', async ({ app, page }) => {
  await app.boot({ api: { signedIn: false }, state: { lang: 'en' }, route: '/login' })
  await expect(page).toHaveTitle('Babillard · The whole household, at a glance')
})
