import { test, expect } from '@playwright/test'
import { mockApi, seedState } from './mocks'
import { installVvStub, openKeyboard } from './kb'

// « Perte du footer » (Marc, 2026-08-28), caught on-device with ?kbdebug reading
// `inner=894 vvH=576 kbInset=318 open=true … ae=BODY`: a 318-pixel "keyboard" while
// NOTHING was focused. The bottom chrome (tab bar + ＋ FAB) is hidden by `.kb-open`,
// so the household lost its navigation with no field on screen to explain it.
//
// iOS collapses the visual viewport for things that are not keyboards — the
// screenshot preview/markup editor, the app switcher, Control Centre, a share sheet.
// `document.hidden` catches only some of those (it stays FALSE for a screenshot
// preview), so the shrink read exactly like a keyboard and `.kb-open` latched with no
// event coming to heal it: every healer needs a tap, a navigation or a focus change,
// and the 1 s watchdog only ever RE-READS — the re-read still said "shrunk".
//
// The missing invariant: a keyboard cannot be up if nothing that could summon one
// holds focus.

const PHONE = { width: 390, height: 844 }

async function boot(page: import('@playwright/test').Page) {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.setViewportSize(PHONE)
  await installVvStub(page)
  await mockApi(page)
  await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile' })
  await page.goto('/board')
  await page.locator('.hub').waitFor({ state: 'visible', timeout: 15_000 })
}

test('a viewport shrink with NOTHING focused never hides the tab bar', async ({ page }) => {
  await boot(page)
  const tabbar = page.locator('.hubnav')
  await expect(tabbar).toBeVisible()

  // Exactly the reported shape: a keyboard-sized shrink, no focused field. This is
  // what a screenshot preview or the app switcher does to the visual viewport.
  await page.locator('body').click({ position: { x: 5, y: 5 } })
  await openKeyboard(page, 318)

  await expect(page.locator('html')).not.toHaveClass(/kb-open/)
  await expect(tabbar, 'the household must not lose its navigation to a phantom keyboard').toBeVisible()
})

test('a real keyboard — a focused field — still hides the chrome and fits', async ({ page }) => {
  // The other side, so "never hide it" can't quietly become the fix.
  await boot(page)
  await page.locator('.add-fab').click()
  const field = page.locator('.sheet.show input:visible, .sheet.show textarea:visible, .sheet.show [contenteditable]:visible').first()
  await field.click()
  await openKeyboard(page, 318)

  await expect(page.locator('html')).toHaveClass(/kb-open/)
})

test('the latch clears once the focused field goes away', async ({ page }) => {
  // The falling edge the watchdog was written for, now reached without needing an
  // event: blur the field while the viewport is still shrunk (iOS can hide the
  // keyboard with no `resize` and no `focusout` when the node is removed).
  await boot(page)
  await page.locator('.add-fab').click()
  const field = page.locator('.sheet.show input:visible, .sheet.show textarea:visible, .sheet.show [contenteditable]:visible').first()
  await field.click()
  await openKeyboard(page, 318)
  await expect(page.locator('html')).toHaveClass(/kb-open/)

  // Focus leaves; the viewport stays shrunk (the exact stale-latch condition).
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
  await expect(page.locator('html')).not.toHaveClass(/kb-open/, { timeout: 5_000 })
})

// ---- The other half of the same phone screenshot ----------------------------
//
// The Mois grid, offline, showed THREE statements of one fact: the board's calm
// « Hors ligne — voici la dernière version reçue » line at the top, then two
// identical red « Le réseau n'a pas répondu · Réessayer » blocks (MonthView renders
// LoadError above the grid AND in the day panel, both on `!data && isError`). One of
// those retry buttons could not possibly work — there was no network to retry with.
//
// A failed fetch with no signal is not a surprise, it is the weather. So offline
// LoadError drops the alarm tone and the dead button, and a screen gets ONE retry
// door when it is genuinely online.

test('offline, LoadError states the fact — no alarm tone, no dead retry', async ({ page }) => {
  // Driven off the /dev/kit specimen rather than a real failed query, and that is a
  // finding in itself: going offline in the harness makes TanStack PAUSE the query,
  // so it never reaches `isError` and the photographed state (offline AND errored —
  // what you get when connectivity drops on an in-flight request) is unreachable
  // synthetically. The component's contract is the thing worth pinning anyway.
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.setViewportSize(PHONE)
  await mockApi(page)
  await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile' })
  await page.goto('/dev/kit')
  const entry = page.locator('details.kit-entry').filter({ hasText: 'LoadError' })
  await entry.locator('summary').click()
  const err = entry.locator('.load-error')
  await err.waitFor({ state: 'visible', timeout: 15_000 })

  // Online: the alarm and the hand back.
  await expect(err.locator('.status-msg')).toHaveCount(1)
  await expect(err.locator('button')).toHaveCount(1)

  // Offline: no signal is not a surprise worth an alarm colour, and « Réessayer »
  // has nothing to retry with.
  await page.evaluate(() => window.dispatchEvent(new Event('offline')))
  await expect(err.locator('.load-error__offline')).toHaveCount(1)
  await expect(err.locator('.status-msg'), 'no alarm tone while offline').toHaveCount(0)
  await expect(err.locator('button'), 'no retry button that cannot reach the network').toHaveCount(0)

  // …and it comes back when the signal does.
  await page.evaluate(() => window.dispatchEvent(new Event('online')))
  await expect(err.locator('button')).toHaveCount(1)
})

test('one failed query paints ONE retry door, not one per region reporting it', async ({ page }) => {
  // MonthView renders LoadError twice on the same `!data && isError` — above the grid
  // AND in the day panel — which is why the phone showed two identical red blocks.
  // Both regions still speak (each explains its own blank area); only one offers the
  // button.
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.setViewportSize(PHONE)
  await mockApi(page)
  await page.route('**/api/month**', (route) => route.fulfill({ status: 500, body: 'nope' }))
  await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile', boardView: 'month' })
  await page.goto('/board')
  await page.locator('.hub').waitFor({ state: 'visible', timeout: 15_000 })

  await expect(page.locator('.load-error').first()).toBeVisible({ timeout: 15_000 })
  expect(await page.locator('.load-error').count(), 'both blank regions say why').toBeGreaterThan(1)
  await expect(page.locator('.load-error button'), 'one retry door per screen').toHaveCount(1)
})
