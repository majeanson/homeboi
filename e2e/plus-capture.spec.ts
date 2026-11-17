import type { Page } from '@playwright/test'
import { test, expect } from './fixtures'
import { expectApi } from './interact'

// Review #10 (2026-11-17): the landing promises that « dentiste pour Léa mardi 15h » « se
// range au bon jour, au bon nom ». A stranger typed it into the obvious place, the board's
// ＋ field, and it became a fridge note; through « Classer » it did land, but the line said
// « Ajouté : dentiste · Léa », with no kind and no day, so nobody could check it.
//
// Guarded here: the ＋ field files through /api/capture, the sheet closes, and the undo
// toast names the KIND and the DAY the server filed on. With the household's AI off, the
// field is a plain note again (nothing to classify).

test.use({ timezoneId: 'America/Toronto' })

// Tue 24 Nov 2026, 15:00 in Toronto: next Tuesday, which the week on screen cannot show.
const AT = 1795550400

// Registered AFTER boot's mockApi: the later route wins in Playwright.
async function stubCapture(page: Page) {
  await page.route('**/api/capture', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        type: 'event',
        degraded: false,
        routed: { kind: 'event', label: 'dentiste · Léa', cleanup: [{ table: 'events', id: 'e_e2e' }], when: { at: AT, allDay: false } },
      }),
    }),
  )
}

async function openPlus(page: Page) {
  await page.goto('/board')
  await page.locator('.hub').first().waitFor({ state: 'visible', timeout: 15_000 })
  await page.locator('.add-fab').click()
  await expect(page.locator('.sheet.show')).toBeVisible()
}

test('the ＋ field files the line and the toast says what and when', async ({ app, page }) => {
  await app.boot()
  await stubCapture(page)
  await openPlus(page)
  await page.locator('.addsheet__lead input.edit-field__input').fill('dentiste pour Léa mardi 15h')
  await expectApi(page, 'POST', 'capture', () => page.locator('.addsheet__lead .edit-field__submit').click())

  await expect(page.locator('.sheet.show')).toHaveCount(0)
  await expect(page.locator('.undo-toast')).toContainText('Ajouté : Rendez-vous · dentiste · Léa · mar. 24 nov., 15 h 00')
})

test('with the AI off, the ＋ field is a plain fridge note', async ({ app, page }) => {
  await app.boot({ api: { overrides: { health: { ok: true, ai: false, photos: false, realtime: false, mail: false } } } })
  await openPlus(page)
  await page.locator('.addsheet__lead input.edit-field__input').fill('Acheter du lait')
  await expectApi(page, 'POST', 'notes', () => page.locator('.addsheet__lead .edit-field__submit').click())
})
