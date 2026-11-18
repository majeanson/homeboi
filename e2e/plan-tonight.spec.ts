import { test, expect } from './fixtures'
import { MMID } from './mocks'
import { isApi } from './interact'

// Review #29 (2026-11-17), Geneviève: « Choisir un souper » led to a list of ideas with no
// way to put one on tonight except « pick a slot, then a day ». The picker now leads with
// « Ce soir »: one tap, today, the household's hero slot (souper by default).

test.use({ timezoneId: 'America/Toronto' })

test('an idea goes on tonight in one tap', async ({ app, page }) => {
  await app.boot({ route: '/kitchen/idees', wait: '.scene.ideas-drawer', clock: 'BASE', viewport: { width: 390, height: 844 } })
  await page.locator('.kitchen__idea-name').first().click()
  const tonight = page.locator('.meal-plan-pick__tonight').first()
  await expect(tonight).toHaveText('Ce soir')
  const [req] = await Promise.all([page.waitForRequest(isApi('POST', 'meals'), { timeout: 20_000 }), tonight.click()])
  const body = JSON.parse(req.postData() || '{}') as { date?: number; slot?: string }
  expect(body.date).toBe(MMID)
  expect(body.slot).toBe('supper')
})

test('« Ce soir » means the souper even when another slot was picked first', async ({ app, page }) => {
  await app.boot({ route: '/kitchen/idees', wait: '.scene.ideas-drawer', clock: 'BASE', viewport: { width: 390, height: 844 } })
  await page.locator('.kitchen__idea-name').first().click()
  const pick = page.locator('.meal-plan-pick').first()
  await pick.getByRole('radio', { name: 'Dîner' }).or(pick.getByRole('button', { name: 'Dîner' })).first().click()
  const [req] = await Promise.all([page.waitForRequest(isApi('POST', 'meals'), { timeout: 20_000 }), pick.locator('.meal-plan-pick__tonight').click()])
  expect((JSON.parse(req.postData() || '{}') as { slot?: string }).slot).toBe('supper')
})
