import { test, expect } from '@playwright/test'
import { APP, settle, expectApi } from './interact'

// Interaction coverage, routines: the moment, the timer, going back, the toddler story. The harness and its discipline are at the top of interact.ts:
// a form asserts the request it fires, an optimistic flow asserts what the user sees.

test('routines surface the current moment first (morning vs evening)', async ({ page }) => {
  // Freeze the clock so timeOfDay() is deterministic. 12:00Z = 8 AM in the
  // config's America/Toronto (June, UTC-4) → morning.
  await page.clock.setFixedTime(new Date('2026-06-08T12:00:00Z'))
  await APP('/maison', 'toddler')(page)
  await settle(page, '.kid__faces')
  // Matin (Léa, timeOfDay: morning) leads in the morning…
  await expect(page.locator('.kid__face').first()).toContainText('Léa')
  // …and Dodo (Noah, evening) leads at 8 PM. Nothing hides — just the order.
  await page.clock.setFixedTime(new Date('2026-06-09T00:00:00Z'))
  await page.reload()
  await settle(page, '.kid__faces')
  await expect(page.locator('.kid__face').first()).toContainText('Noah')
  await expect(page.locator('.kid__face')).toHaveCount(2)
})

test('a routine runs start → next → next → stop on one timer', async ({ page }) => {
  await APP('/maison', 'toddler')(page)
  await settle(page, '.hub')
  await page.locator('.kid__face', { hasText: 'Noah' }).click() // Dodo: 3 steps, none done
  // ▶ start once, then advance through with the single → button, ✓ on the last.
  await page.locator('.tdl-start').click()
  await expect(page.locator('.tdl-finish')).toBeVisible()
  await page.locator('.tdl-finish').click() // → step 1
  await page.locator('.tdl-finish').click() // → step 2
  await page.locator('.tdl-finish').click() // ✓ last → stop
  // It ends on the picture recap (each step wearing its ✓), not a start button.
  await expect(page.locator('.tdl-recap')).toBeVisible()
  await expect(page.locator('.tdl-recap__step')).toHaveCount(3)
})

// Going BACK — Marc's ask: a three-year-old taps → too fast, and the story had no
// rewind. Two ways, both un-marking the step (the current one is DERIVED, so an
// un-done step IS the story rewinding to it): the big ← beside the →, and a
// hear-first two-tap on a done step in the filmstrip (BigTiles' arm pattern).
test('a routine can go back: the ← un-does the last step, and a done strip step rewinds on the second tap', async ({ page }) => {
  await APP('/maison', 'toddler')(page)
  await settle(page, '.hub')
  await page.locator('.kid__face', { hasText: 'Noah' }).click() // Dodo: 3 steps, none done
  // Nothing is done yet → nowhere to go back to.
  await expect(page.locator('.tdl-prev')).toHaveCount(0)
  await page.locator('.tdl-start').click()
  await page.locator('.tdl-finish').click() // → step 1 done, we're on step 2

  // ← un-marks the step we just finished (PATCH done:false) and the ✓ leaves the strip.
  const strip = page.locator('.tdl-step')
  await expect(strip.nth(0).locator('.tdl-step__check')).toBeVisible()
  const [back] = await Promise.all([
    page.waitForRequest((r) => r.method() === 'PATCH' && new URL(r.url()).pathname.endsWith('/api/routines')),
    page.locator('.tdl-prev').click(),
  ])
  expect(back.postDataJSON()).toMatchObject({ cardIdx: 0, done: false })
  await expect(strip.nth(0).locator('.tdl-step__check')).toHaveCount(0)
  await expect(page.locator('.tdl-prev')).toHaveCount(0) // back on step 1: nowhere behind

  // The filmstrip: a DONE step is hear-first — tap 1 arms + speaks, tap 2 rewinds.
  await page.locator('.tdl-finish').click() // step 1 done again
  let patched = false
  page.on('request', (r) => {
    if (r.method() === 'PATCH' && new URL(r.url()).pathname.endsWith('/api/routines')) patched = true
  })
  await strip.nth(0).click()
  await expect(strip.nth(0)).toHaveClass(/is-armed/)
  expect(patched).toBe(false) // the first tap only speaks — a wandering finger commits nothing
  await strip.nth(0).click()
  await expect(strip.nth(0)).not.toHaveClass(/is-armed/)
  await expect(strip.nth(0).locator('.tdl-step__check')).toHaveCount(0)
  expect(patched).toBe(true)

  // A FUTURE step never jumps the story — it only speaks itself.
  await strip.nth(2).click()
  await expect(strip.nth(2).locator('.tdl-step__check')).toHaveCount(0)
})

// Picking a routine back up mid-day: the ▶ says « Continuer », not « Commencer »
// (Léa's Matin arrives with step 1 already done in the mock).
test('a half-done routine resumes: the ▶ reads « Continuer »', async ({ page }) => {
  await APP('/maison', 'toddler')(page)
  await settle(page, '.hub')
  await page.locator('.kid__face', { hasText: 'Léa' }).click()
  await expect(page.getByRole('button', { name: 'Continuer' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Commencer' })).toHaveCount(0)
})

// ──────────────────────── toddler routine story ────────────────────────

test('toddler reads a step aloud, then starts + finishes it', async ({ page }) => {
  await APP('/maison', 'toddler')(page)
  await settle(page, '.kid')
  await page.locator('.kid__face').first().click()
  // Tapping the picture only reads it aloud — it must NOT mark the step done.
  const tap = page.locator('.tdl-illus--tap')
  await expect(tap).toBeVisible()
  await tap.click()
  // Doing it is the start → finish flow; finishing marks the step done (PATCH).
  await page.locator('.tdl-start').click()
  // The run row is up — but it carries no count-up clock on ANY surface any more
  // (the run stopwatch was dropped entirely 2026-09-03; see routine-timer.spec.ts).
  // The ✓/→ button is what matters and is deliberately NOT gated.
  await expect(page.locator('.tdl-timer')).toBeVisible()
  await expect(page.locator('.tdl-clock')).toHaveCount(0)
  await expectApi(page, 'PATCH', 'routines', () => page.locator('.tdl-finish').click())
})
