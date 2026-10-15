import { test, expect } from '@playwright/test'
import { mockApi, seedState } from './mocks'

// The public door as a portfolio shows it: framed (marcportal.com/projects embeds it
// scaled down, ~1280×800) and read cold by a stranger. Three promises, each one a defect
// found on production 2026-10-15:
//   1. the door SHOWS the product (a real board frame), in the reader's language;
//   2. a framed page knows it is framed (<html data-embedded>, set before first paint);
//   3. a demo sandbox opens on the BOARD — no spotlight tour stacked over the welcome card
//      over the board, and the welcome card is a strip, not a screen.
// (The frame-ancestors header itself is pinned in securityHeaders.test.ts / headers.d1.)

const WIDE = { width: 1280, height: 800 }

test('the door shows the product, in the language it is read in', async ({ page }) => {
  await page.setViewportSize(WIDE)
  await mockApi(page)
  await page.route('**/api/auth/me', (route) => route.fulfill({ status: 401, contentType: 'application/json', body: '{}' }))
  await seedState(page, { theme: 'day', lang: 'fr', calm: true })
  await page.goto('/')
  const shot = page.locator('.home__shot img')
  await expect(shot).toBeVisible({ timeout: 15_000 })
  await expect(shot).toHaveAttribute('src', '/showcase/board-wide-fr.webp')
  await expect(shot).toHaveAttribute('alt', /babillard/i)
  // The picture sits beside the words on a wide screen: the CTA and the picture share the
  // first screen (that is the whole point of a 1280×800 preview).
  const cta = await page.getByRole('link', { name: 'Créer ma maisonnée' }).boundingBox()
  const img = await shot.boundingBox()
  expect(cta && img && cta.y + cta.height < WIDE.height && img.y < WIDE.height / 2).toBe(true)
})

test('the picture follows the language (EN door → EN board)', async ({ page }) => {
  await page.setViewportSize(WIDE)
  await mockApi(page)
  await page.route('**/api/auth/me', (route) => route.fulfill({ status: 401, contentType: 'application/json', body: '{}' }))
  await seedState(page, { theme: 'day', lang: 'en', calm: true })
  await page.goto('/')
  await expect(page.locator('.home__shot img')).toHaveAttribute('src', '/showcase/board-wide-en.webp', { timeout: 15_000 })
})

test('a framed door knows it is framed; a top-level one does not', async ({ page }) => {
  await page.setViewportSize(WIDE)
  await mockApi(page)
  await page.route('**/api/auth/me', (route) => route.fulfill({ status: 401, contentType: 'application/json', body: '{}' }))
  await seedState(page, { theme: 'day', lang: 'fr', calm: true })
  await page.goto('/')
  await expect(page.locator('.home')).toBeVisible({ timeout: 15_000 })
  await expect(page.locator('html')).not.toHaveAttribute('data-embedded', /.*/)

  // Same origin, so the mocks and the seeded state reach the frame; `window.self !==
  // window.top` is what the app tests, and that holds for any frame.
  await page.evaluate(() => {
    const f = document.createElement('iframe')
    f.id = 'portfolio'
    f.src = '/'
    f.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;border:0;background:#fff'
    document.body.append(f)
  })
  const framed = page.frameLocator('#portfolio')
  await expect(framed.locator('.home')).toBeVisible({ timeout: 15_000 })
  await expect(framed.locator('html')).toHaveAttribute('data-embedded', '')
})

test('a sandbox opens on the board: no tour, and the welcome card is a strip', async ({ page }) => {
  await page.setViewportSize(WIDE)
  await mockApi(page, { sandbox: true })
  // `tour: true` leaves the tour UNSEEN — the state a brand-new browser is in.
  await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'kiosk', tour: true })
  await page.goto('/board')
  const card = page.locator('.welcome-card')
  await expect(card).toBeVisible({ timeout: 15_000 })
  await page.waitForTimeout(1500) // the auto-launch would have fired by now
  await expect(page.locator('.tour')).toHaveCount(0)

  // A strip: the try-this chips are links, the claim offer is still there once, and the
  // whole card stays under half of a 800px-tall first screen (it was ~560px with the five rows + the feature map).
  await expect(card.getByRole('link', { name: 'Ouvre une recette, pars le mode cuisson' })).toBeVisible()
  await expect(card.getByRole('link', { name: /garder ma maisonnée/i })).toHaveCount(1)
  await expect(card.locator('.feature-map')).toHaveCount(0)
  const box = await card.boundingBox()
  expect(box!.height).toBeLessThan(WIDE.height * 0.5)
  // …and the tour is still one tap away.
  await card.getByRole('button', { name: /visite guidée/i }).click()
  await expect(page.locator('.tour')).toBeVisible()
})
