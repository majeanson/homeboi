import { test, expect, type Page } from '@playwright/test'
import { mockApi, seedState } from './mocks'

// « Le son » — the app's own silent switch (src/lib/sound.ts).
//
// Why it exists: a phone's ring/silent switch does NOT mute a web page. On iOS it
// never touched Web Speech or a script-started <audio>, and Android is
// inconsistent. So a parent on a quiet bus opened the app and it read a routine
// card aloud anyway, with no way to stop it short of leaving.
//
// The load-bearing claim is that muting actually reaches `speechSynthesis` — not
// that a button changes colour. Headless Chromium has no voices, so we install a
// counting stub before the app boots and assert on CALLS.
async function boot(page: Page, route: string) {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  // The speech counter lives in mocks.ts (window.__spoke): its init script runs
  // AFTER any a test adds, so a local stub here would be silently overwritten and
  // the counter would never move — which reads exactly like « muting works ».
  await mockApi(page)
  await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile' })
  await page.goto(route)
}

const spoke = (page: Page) => page.evaluate(() => (window as unknown as { __spoke: number }).__spoke)

test('cook mode: muting stops the app from speaking, and it comes back', async ({ page }) => {
  await boot(page, '/kitchen/recipe/rc1/cook')
  await expect(page.locator('.cook')).toBeVisible()

  const mute = page.locator('.cook__bar-tools .sound-toggle')
  await expect(mute).toBeVisible()
  await expect(mute).toHaveAttribute('aria-pressed', 'false') // sound ON by default

  // A tap-to-hear speaks while sound is on. The STEP text is the target rather than
  // an ingredient line: an ingredient renders colour-coded measure pills that own
  // their own tap (« hear this amount »), so a click at its centre may land on a
  // pill instead — a step is one plain read-aloud button.
  const step = page.locator('.cook__step-read').first()
  await step.click()
  await expect.poll(() => spoke(page)).toBeGreaterThan(0)

  // Mute, then tap again — nothing more is spoken.
  await mute.click()
  await expect(mute).toHaveAttribute('aria-pressed', 'true')
  await expect(mute).toHaveClass(/is-muted/)
  const before = await spoke(page)
  await step.click()
  await page.waitForTimeout(300)
  expect(await spoke(page)).toBe(before)

  // Unmute and it speaks again — a switch, not a one-way door.
  await mute.click()
  await step.click()
  await expect.poll(() => spoke(page)).toBeGreaterThan(before)
})

test('the choice is per-device and survives a reload', async ({ page }) => {
  await boot(page, '/kitchen/recipe/rc1/cook')
  await page.locator('.cook__bar-tools .sound-toggle').click()

  await page.reload()
  await expect(page.locator('.cook')).toBeVisible()
  // Silence has to outlive the tab: a parent who muted on the bus does not want it
  // back the moment the app reloads.
  await expect(page.locator('.cook__bar-tools .sound-toggle')).toHaveClass(/is-muted/)
  const before = await spoke(page)
  await page.locator('.cook__step-read').first().click()
  await page.waitForTimeout(300)
  expect(await spoke(page)).toBe(before)
})

test('Réglages ▸ Voix mirrors the same switch', async ({ page }) => {
  // The bar toggles are where you REACH for it; this is the calm door, and both
  // must be the same flag — two switches that disagree would be worse than one.
  await boot(page, '/settings?tab=settings&sub=voice')
  const inSettings = page.locator('.operator__section .sound-toggle')
  await expect(inSettings).toBeVisible()
  await inSettings.click()
  await expect(inSettings).toHaveClass(/is-muted/)

  await page.goto('/kitchen/recipe/rc1/cook')
  await expect(page.locator('.cook__bar-tools .sound-toggle')).toHaveClass(/is-muted/)
})
