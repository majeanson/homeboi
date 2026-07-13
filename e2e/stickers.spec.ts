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

// r1 arrives ALREADY complete (every card done), so the finish screen renders at
// once — no fragile step-by-step run against static mock data.
async function finishedRoutine(page: Parameters<typeof mockApi>[0]) {
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
}

test('finishing a routine (calm off) places a sticker → POST', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await mockApi(page)
  await finishedRoutine(page)
  await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile', calm: false })
  await page.goto('/routine/r1/run')
  // ONE finish screen: the recap renders whatever calm says…
  await expect(page.locator('.tdl-recap')).toBeVisible()
  // …and the sticker picker rides ON it, only when calm is OFF (the opt-in reward).
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

// Calm's ONE meaning: no reward. The finish screen itself is unconditional — the
// same recap + « Recommencer » a calm-off household sees, minus the sticker offer.
test('finishing a routine (calm on) shows the same recap, reward-free', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await mockApi(page)
  await finishedRoutine(page)
  await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile', calm: true })
  await page.goto('/routine/r1/run')
  // The one finish screen: the picture recap + the deliberate « Recommencer ».
  await expect(page.locator('.tdl-recap')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Recommencer' })).toBeVisible()
  // No sticker anywhere — not the picker, not the wall entry on the Routines tab.
  await expect(page.locator('.tdl-sticker')).toHaveCount(0)
  await page.goto('/routines')
  await expect(page.locator('.routines-sticker-link')).toHaveCount(0)
})

test('the sticker wall removes one behind the undo toast, and undo restores it', async ({ page }) => {
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
  // A light, frequent delete on a live-polled list goes through useDeferredRemoval: the
  // DELETE is HELD behind the undo toast, so tapping ✕ must NOT fire a write, and undo
  // must restore the cell (Wave U). Guard: capture any DELETE that leaks out early.
  let deleted = false
  page.on('request', (r) => {
    if (r.method() === 'DELETE' && new URL(r.url()).pathname.endsWith('/api/routine-stickers')) deleted = true
  })
  await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile', calm: false })
  await page.goto('/routine/stickers')
  const glyphs = page.locator('.sticker-wall__glyph')
  // Léa's ⭐ + the Maisonnée 🌈 — two placed stickers, grouped by who.
  await expect(glyphs).toHaveCount(2)
  // The ✕ per cell only appears in edit mode (the header « Modifier » toggle).
  await page.getByRole('button', { name: 'Modifier' }).click()
  // Remove one → it hides at once (deferred), the undo toast surfaces, no write yet.
  await page.locator('.sticker-wall__remove').first().click()
  await expect(glyphs).toHaveCount(1)
  await expect(page.locator('.undo-toast__msg')).toContainText('Autocollant retiré')
  expect(deleted).toBe(false)
  // Undo restores the cell — and the DELETE never fires (the write was only held).
  await page.locator('.undo-toast__btn').first().click()
  await expect(glyphs).toHaveCount(2)
  expect(deleted).toBe(false)
})
