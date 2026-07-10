import { test, expect } from '@playwright/test'
import { mockApi, seedState } from './mocks'

// F29 « Mur d'autocollants » — the first-ever e2e for the opt-in sticker wall
// (PARITY Wave E, entry 4). Two happy paths: PLACING a sticker on finishing a
// routine (POST), and REMOVING one from the wall (DELETE). Both need « Mode calme »
// OFF — the wall doesn't exist otherwise (StickerWallPage bounces to /routines).
// Frontend-only harness (mocked /api/**), like the other specs.

// A per-test route override registered AFTER mockApi's catch-all wins (Playwright
// tries the last-registered route first). ROUTINE_CARDS mirror the mock's four.
const CARDS = [
  { icon: '👕', label: 'Habille-toi' },
  { icon: '🥞', label: 'Déjeuner' },
  { icon: '🪥', label: 'Brosse tes dents' },
  { icon: '🎒', label: 'Sac à dos' },
]

test('finishing a routine (calm off) places a sticker → POST', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await mockApi(page)
  // r1 arrives ALREADY complete (every card done), so the completion sticker picker
  // renders at once — no fragile step-by-step run against static mock data.
  await page.route('**/api/routines**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        routines: [
          {
            id: 'r1', name: 'Matin', memberName: 'Léa', color: '#88A36F', avatarPhoto: null,
            timeOfDay: 'morning', cards: CARDS, doneIdx: [0, 1, 2, 3],
          },
        ],
      }),
    }),
  )
  await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile', calm: false })
  await page.goto('/routine/r1/run')
  // The picker only exists on completion + calm OFF (the opt-in reward).
  const opt = page.locator('.tdl-sticker__opt').first()
  await expect(opt).toBeVisible()
  const [req] = await Promise.all([
    page.waitForRequest(
      (r) => r.method() === 'POST' && new URL(r.url()).pathname.endsWith('/api/routine-stickers'),
    ),
    opt.click(),
  ])
  const body = req.postDataJSON()
  expect(body.routineId).toBe('r1')
  expect(typeof body.sticker).toBe('string')
  // The placed sticker confirms in place (with a link to the wall).
  await expect(page.locator('.tdl-sticker__done')).toBeVisible()
})

test('the sticker wall shows stickers and removes one → DELETE', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await mockApi(page)
  await page.route('**/api/routine-stickers**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        stickers: [
          { id: 'st1', memberId: 'm3', sticker: '⭐', routineId: 'r1', createdAt: 1_749_369_600 },
          { id: 'st2', memberId: null, sticker: '🌈', routineId: null, createdAt: 1_749_369_600 },
        ],
      }),
    }),
  )
  await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile', calm: false })
  await page.goto('/routine/stickers')
  // Léa's ⭐ + the Maisonnée 🌈 — two placed stickers, grouped by who.
  await expect(page.locator('.sticker-wall__glyph')).toHaveCount(2)
  // The ✕ per cell only appears in edit mode (the header « Modifier » toggle).
  await page.getByRole('button', { name: 'Modifier' }).click()
  const [req] = await Promise.all([
    page.waitForRequest(
      (r) => r.method() === 'DELETE' && new URL(r.url()).pathname.endsWith('/api/routine-stickers'),
    ),
    page.locator('.sticker-wall__remove').first().click(),
  ])
  expect(req.postDataJSON().id).toMatch(/^st[12]$/)
})
