import { test, expect } from '@playwright/test'
import { mockApi, seedState } from './mocks'

// Two surfaces that told the truth badly, both fixed 2026-08-28 (REVIEW-PASS).
//
// 1. MeasureColorsSection VANISHED for a guest where its siblings degrade to a
//    read-only legend. The finding read as a link-guest problem; grepping said
//    otherwise — `kitchen ▸ apparence` is not in GUEST_SUBS, so a LINK guest never
//    reaches that sub at all. The audience that actually saw the hole is an operator
//    in **guest preview**: `isGuest()` is true for them, `isGuestLocked()` (which
//    drives GUEST_SUBS) is not. So the gate's one real audience got a section that
//    silently disappeared, in the mode whose whole job is to show read-only.
// 2. HeartButton truncated the loved-by faces at four with NO cue, so a fifth
//    person's ❤ just vanished. The cue may not be a « +N » — a count is precisely
//    what the calm tenet forbids on hearts — so it is a muted « … » disc.

const PHONE = { width: 390, height: 844 }

test('guest preview shows the measure colours read-only instead of hiding them', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.setViewportSize(PHONE)
  await mockApi(page)
  await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile' })
  // Guest PREVIEW, not a link guest: a full operator underneath (so the kitchen tab
  // keeps its Régler side) who is being shown what read-only looks like.
  await page.addInitScript(() => localStorage.setItem('babillard-guest-preview', '1'))
  await page.goto('/settings?tab=kitchen&sub=apparence')

  const sec = page.locator('.measure-colors')
  await expect(sec, 'the section must still be there — it used to return null').toBeVisible()
  // The information stays: one swatch per measure family, plus the sample line that
  // shows the household's colour coding in situ.
  await expect(sec.locator('.measure-colors__swatch').first()).toBeVisible()
  await expect(page.locator('.measure-colors__preview-line')).toBeVisible()
  // The editing affordances go: no OS colour input, no « Réinitialiser ».
  await expect(sec.locator('input[type="color"]')).toHaveCount(0)
  await expect(page.getByRole('button', { name: /Réinitialiser/ })).toHaveCount(0)
})

test('an operator still gets the colour pickers and the reset', async ({ page }) => {
  // The other side of the same gate — so a too-eager read-only branch can't quietly
  // take the editor away from the person who owns it.
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.setViewportSize(PHONE)
  await mockApi(page)
  await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile' })
  await page.goto('/settings?tab=kitchen&sub=apparence')

  const sec = page.locator('.measure-colors')
  await expect(sec.locator('input[type="color"]').first()).toBeVisible()
  await expect(sec.locator('.measure-colors__swatch')).toHaveCount(0)
})

test('past four loved-by faces the row says « et d’autres », never a number', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.setViewportSize({ width: 1280, height: 900 })
  await mockApi(page)
  // Six members all loving the /dev/kit specimen's recipe id — two more than fit.
  const members = ['Ana', 'Bo', 'Cy', 'Dee', 'Eli', 'Fen'].map((n, i) => ({
    id: `m${i}`,
    display_name: n,
    colour: '#88a36f',
    avatar_kind: 'initial',
    avatar_ref: null,
  }))
  await page.route('**/api/members**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ members }) }),
  )
  await page.route('**/api/recipe-loves**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ loves: members.map((m) => ({ recipe_id: 'devkit-demo-recipe', member_id: m.id })) }),
    }),
  )
  await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'kiosk' })
  await page.goto('/dev/kit')

  const entry = page.locator('details.kit-entry').filter({ hasText: 'HeartButton' })
  await entry.locator('summary').click()
  const faces = entry.locator('.hearts__faces')
  await expect(faces).toBeVisible()

  // Four real faces + exactly one overflow cue.
  await expect(faces.locator('.hearts__face:not(.hearts__face--more)')).toHaveCount(4)
  const more = faces.locator('.hearts__face--more')
  await expect(more).toHaveCount(1)
  await expect(more).toHaveAttribute('title', 'et d’autres')
  // Calm: whatever the cue is, it must not be a count. No digit anywhere in the row.
  await expect(faces).not.toContainText(/\d/)
})

test('four or fewer loved-by faces show no overflow cue at all', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.setViewportSize({ width: 1280, height: 900 })
  await mockApi(page)
  const members = ['Ana', 'Bo', 'Cy'].map((n, i) => ({
    id: `m${i}`,
    display_name: n,
    colour: '#88a36f',
    avatar_kind: 'initial',
    avatar_ref: null,
  }))
  await page.route('**/api/members**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ members }) }),
  )
  await page.route('**/api/recipe-loves**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ loves: members.map((m) => ({ recipe_id: 'devkit-demo-recipe', member_id: m.id })) }),
    }),
  )
  await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'kiosk' })
  await page.goto('/dev/kit')

  const entry = page.locator('details.kit-entry').filter({ hasText: 'HeartButton' })
  await entry.locator('summary').click()
  const faces = entry.locator('.hearts__faces')
  await expect(faces.locator('.hearts__face')).toHaveCount(3)
  await expect(faces.locator('.hearts__face--more')).toHaveCount(0)
})
