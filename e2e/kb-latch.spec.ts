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

test('a real keyboard survives losing its field — the fit is not dropped on a blur', async ({ page }) => {
  // The OTHER half of the invariant, and the one that keeps the guard honest. iOS keeps
  // the keyboard up when the focused field goes away — a sheet closing, a form
  // unmounting on save, or an in-app NAVIGATION taking the field with it. There is no
  // focused summoner then, but the keyboard is really still there, so the fit must hold.
  //
  // This is why the guard is on the RISING edge only. A first draft gated both edges;
  // it read better and was wrong, and CI said so by failing keyboard.spec.ts's « a
  // keyboard that is genuinely still up keeps its fit across a navigation ». The
  // falling edge belongs to the geometry (the shrink going away) and to the healers.
  await boot(page)
  await page.locator('.add-fab').click()
  const field = page.locator('.sheet.show input:visible, .sheet.show textarea:visible, .sheet.show [contenteditable]:visible').first()
  await field.click()
  await openKeyboard(page, 318)
  await expect(page.locator('html')).toHaveClass(/kb-open/)

  // Focus leaves while the viewport stays shrunk: the keyboard is still up.
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
  await page.waitForTimeout(1500) // past the 1 s watchdog tick
  await expect(page.locator('html'), 'a live keyboard must not be un-fitted by a blur').toHaveClass(/kb-open/)
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

  // Offline: no signal is not a surprise worth an alarm COLOUR…
  await page.evaluate(() => window.dispatchEvent(new Event('offline')))
  await expect(err.locator('.load-error__offline')).toHaveCount(1)
  await expect(err.locator('.status-msg'), 'no alarm tone while offline').toHaveCount(0)

  // …but the retry STAYS. A first version dropped it too, reasoning that it "cannot
  // work offline" — which ignores that the person taps it when they think the signal
  // is back, and that on a surface with no poll it is the only door there is. A month
  // whose one fetch failed never retries itself (MONTH_KEY has no `live`, and the
  // client sets refetchOnWindowFocus: false), so removing the button turned a visible
  // failure into a blank calendar with no way out.
  await expect(err.locator('button'), 'the only manual door must survive going offline').toHaveCount(1)

  // …and the tone comes back when the signal does.
  await page.evaluate(() => window.dispatchEvent(new Event('online')))
  await expect(err.locator('.status-msg')).toHaveCount(1)
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
