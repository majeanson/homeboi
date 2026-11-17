import type { Locator } from '@playwright/test'
import { test, expect } from './fixtures'
import { isApi } from './interact'

// Review #11 (2026-11-17), Mélanie, a rotating-shift nurse, in Réglages ▸ L'auto & horaires:
//   · a 23 h – 7 h 30 night shift was refused (« end must be after start »);
//   · the time fields read « 08:00 AM / 05:00 PM » in a French app (the browser's clock);
//   · « Aucun horaire » showed while the list was still loading, inviting a second entry.

const SCHEDULE = '/settings?tab=maison&focus=schedule'

async function setTime(form: Locator, label: string, h: number, m: number) {
  const group = form.getByRole('group', { name: label, exact: true })
  await group.getByRole('combobox', { name: 'Heure' }).selectOption(String(h))
  await group.getByRole('combobox', { name: 'Minutes' }).selectOption(String(m))
}

test('a night shift is accepted: it says it ends the next day, and posts end < start', async ({ app, page }) => {
  await app.boot({ route: SCHEDULE })
  await page.locator('#op-schedule').getByRole('button', { name: 'Ajouter un horaire' }).click()
  const form = page.locator('.operator__inline-form').last()
  await form.getByRole('button', { name: 'Papa', exact: true }).click()

  // 24-hour, whatever the browser's locale: the hour list reads « 23 h », never « PM ».
  await expect(form.getByRole('group', { name: 'De', exact: true }).getByRole('combobox', { name: 'Heure' })).toContainText('23 h')
  await expect(form).not.toContainText(/AM|PM/)

  await setTime(form, 'De', 23, 0)
  await setTime(form, 'à', 7, 30)
  await expect(form).toContainText('Finit le lendemain')

  const [req] = await Promise.all([
    page.waitForRequest(isApi('POST', 'schedule'), { timeout: 20_000 }),
    form.getByRole('button', { name: 'Ajouter', exact: true }).click(),
  ])
  const body = JSON.parse(req.postData() || '{}') as { startMin?: number; endMin?: number }
  expect([body.startMin, body.endMin]).toEqual([23 * 60, 7 * 60 + 30])
})

test('while the schedule loads, the list never says « Aucun horaire »', async ({ app, page }) => {
  await app.boot()
  // Hold /api/schedule until the test has looked at the waiting state.
  let release: () => void = () => {}
  const held = new Promise<void>((r) => (release = r))
  await page.route('**/api/schedule', async (route) => {
    await held
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ blocks: [] }) })
  })
  await page.goto(SCHEDULE)
  const section = page.locator('#op-schedule')
  await expect(section.locator('.skeleton').first()).toBeVisible()
  await expect(section).not.toContainText('Aucun horaire')

  release()
  await expect(section).toContainText('Aucun horaire')
})
