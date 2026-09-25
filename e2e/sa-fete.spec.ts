import { test, expect, type Page, type Locator } from '@playwright/test'
import { mockApi, seedState, BASE } from './mocks'
import { boxOf } from './measure'

// « Sa fête » (PLAN-mots A8, accepted 2026-09-25): in the mot composer's « Plus tard », a
// fourth preset that appears only once the picked recipient has a birthday in the cercle,
// and sets the mot to surface that morning at 08:00. Scheduling and the derived birthday
// engine both existed; this is the one-tap join. Still no push — the mot lands on the
// board like any scheduled one.
//
// The clock is frozen at BASE (2025-06-08, 04:00 local) so "next birthday" is a fact of
// the fixture: Léa's June 15 is a week away, Papa has none.

const MEMBERS = [
  { id: 'm1', display_name: 'Maman', colour: '#B06A93', is_child: 0, birthday: null },
  { id: 'm2', display_name: 'Papa', colour: '#5891AC', is_child: 0, birthday: null },
  { id: 'm3', display_name: 'Léa', colour: '#88A36F', is_child: 1, birthday: '2019-06-15' },
]

// The phone composer's recipient is a chip that opens the face sheet (FaceSelect →
// FaceSheet); the kiosk's is a row of faces. This spec runs the phone shape.
async function pickFace(page: Page, composer: Locator, name: string) {
  await composer.locator('.profile-chip').click()
  const face = page.locator('.sheet.show .profile-face', { hasText: name })
  await expect(face).toBeVisible()
  await face.click()
  await expect(composer.locator('.profile-chip')).toContainText(name)
}

async function openComposer(page: Page, width = 390) {
  await page.setViewportSize({ width, height: 844 })
  await page.addInitScript(() => {
    try {
      localStorage.setItem('babillard-tours-seen', JSON.stringify(['essentials']))
    } catch {
      /* noop */
    }
  })
  await mockApi(page)
  // Registered AFTER mockApi so it wins: the same faces, one of them with a birthday.
  await page.route('**/api/members**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ members: MEMBERS }) }),
  )
  await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile' })
  await page.clock.setFixedTime(BASE * 1000)
  await page.goto('/board')
  await expect(page.locator('.board-wall')).toBeVisible({ timeout: 15_000 })
  await page.locator('.add-fab').click()
  await expect(page.locator('.sheet.show')).toBeVisible()
  await page.locator('.cat-pick[data-mode="mot"]').click()
  const composer = page.locator('.mot-composer')
  await expect(composer).toBeVisible()
  return composer
}

test('« Sa fête » shows only for a recipient with a birthday, and sets that morning at 08:00', async ({ page }) => {
  const composer = await openComposer(page)
  await composer.locator('.mot-composer__sched > .btn').click()
  await expect(composer.locator('.mot-composer__presets')).toBeVisible()
  const fete = composer.getByRole('button', { name: 'Sa fête' })

  // Toute la Maisonnée (the default) has no birthday; neither has Papa.
  await expect(fete).toHaveCount(0)
  await pickFace(page, composer, 'Papa')
  await expect(fete).toHaveCount(0)

  // Léa does: the preset appears, and one tap lands on her next birthday morning.
  await pickFace(page, composer, 'Léa')
  await expect(fete).toBeVisible()
  await fete.click()
  await expect(composer.locator('input[type="date"]')).toHaveValue('2025-06-15')
  await expect(composer.locator('input[type="time"]')).toHaveValue('08:00')

  // Switching back to a face without one hides it again — no stale chip.
  await pickFace(page, composer, 'Maman')
  await expect(fete).toHaveCount(0)
})

test('the preset row still fits the sheet at 360px with « Sa fête » in it', async ({ page }) => {
  // The overflow rule (CLAUDE.md): a row of chips wraps, it never bleeds past the sheet's
  // right edge — and the container clips, so this has to be measured per child.
  const composer = await openComposer(page, 360)
  await pickFace(page, composer, 'Léa')
  await composer.locator('.mot-composer__sched > .btn').click()
  await expect(composer.getByRole('button', { name: 'Sa fête' })).toBeVisible()
  const sheet = await boxOf(page.locator('.sheet.show'))
  const chips = composer.locator('.mot-composer__presets > *')
  // Three presets + « Sa fête » (« Me le rappeler » needs a picked profile, and this spec
  // runs as the Maisonnée) — four is the full row here.
  const n = await chips.count()
  expect(n).toBeGreaterThanOrEqual(4)
  for (let i = 0; i < n; i++) {
    const b = await boxOf(chips.nth(i))
    expect(b.x + b.width, `chip ${i} stays inside the sheet`).toBeLessThanOrEqual(sheet.x + sheet.width + 0.5)
  }
})
