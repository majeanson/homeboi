import { test, expect } from '@playwright/test'
import { mockApi, seedState, BASE } from './mocks'

// THE FIRST DAY BELONGS TO THE WELCOME (lib/habitCheckin + lib/tour).
//
// Two shell-level automations both fire on a brand-new device: the essentials tour
// auto-launches for a first-time parent, and « Le point du jour » opens itself the
// first time the app is opened on a new local day when a habit is due. The seed puts
// habits on today, so the demo walk of 2026-09-16 found a stranger's FIRST screen was
// the habits scene with the welcome dialog drawn over it (STATE.md §4-K wave 1).
//
// The rule: on a device that has not met the tour, the check-in stamps the day and
// stands down. The control case pins that the morning open still works once the
// welcome has been seen — a guard that only proved the quiet half would pass by the
// feature being broken.

const fresh = async (page: Parameters<typeof seedState>[0], opts: { tourSeen: boolean }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.clock.setFixedTime(new Date(BASE * 1000))
  await mockApi(page)
  // Production's shape, not the mock's: the habits payload arrives from the NETWORK
  // after the tour has already started, so the check-in's navigation lands LAST and
  // wins. An instant stub answers before the tour mounts, the tour's own navigation
  // wins instead, and the old code passed this spec by accident. Registered after
  // mockApi so it runs first, waits, then falls through to the stub.
  await page.route('**/api/habits**', async (route) => {
    await new Promise((r) => setTimeout(r, 700))
    await route.fallback()
  })
  // `habitCheckin: true` leaves the store at its defaults (autoOpen on, day never
  // stamped) — the state a brand-new browser is in. `tour: true` leaves the tour unseen.
  await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', habitCheckin: true, tour: !opts.tourSeen })
}

test('a brand-new device lands on the board under the welcome — never on the habits scene', async ({ page }) => {
  await fresh(page, { tourSeen: false })
  await page.goto('/board')
  // The welcome is the first thing on screen…
  await expect(page.locator('.tour')).toBeVisible({ timeout: 15_000 })
  // …over the BOARD, not over « Le point du jour ».
  await expect(page).toHaveURL(/\/board(\?|$)/)
  await expect(page.locator('.habitudes')).toHaveCount(0)
  await expect(page.locator('.wg-slot').first()).toBeVisible()

  // Skipping the tour does not hand the day to the check-in either: it was stamped.
  // Scoped to the card: the board's own « Le point du jour » card offers a « Passer » too.
  await page.locator('.tour').getByRole('button', { name: 'Passer' }).click()
  await expect(page.locator('.tour')).toHaveCount(0)
  await page.waitForTimeout(400)
  await expect(page).toHaveURL(/\/board(\?|$)/)
  await page.reload()
  await expect(page.locator('.wg-slot').first()).toBeVisible({ timeout: 15_000 })
  await expect(page).toHaveURL(/\/board(\?|$)/)
})

test('control: on a device that is no longer new, the morning open still opens the scene', async ({ page }) => {
  // The half that proves the feature is not simply switched off. It needs a device that
  // is NOT on its first day — which is a change from the first version of this control,
  // and worth saying why: the quiet rule used to be « has this device met the tour? »,
  // so a fresh browser with the tour marked seen got the morning open on its very first
  // paint. That question could be answered differently depending on when a lazy chunk
  // arrived (see the last test), so the rule is now the device's FIRST DAY. The cost is
  // exactly this: day one is quiet even for someone who skipped the welcome — which is
  // what « the first day belongs to the welcome » said all along; the old mechanism just
  // never delivered it. From day two everything is as before, and that is what this pins.
  await fresh(page, { tourSeen: true })
  await page.addInitScript(() => {
    // Yesterday, in the same local-midnight unit lib/tour stamps.
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    localStorage.setItem('babillard-first-day', String(Math.floor(d.getTime() / 1000) - 86_400))
  })
  await page.goto('/board')
  await expect(page).toHaveURL(/\/board\/habitudes/, { timeout: 15_000 })
  await expect(page.locator('.habitudes')).toBeVisible()
})

test('…and the same holds when the SESSION is what arrives late — the sandbox shape', async ({ page }) => {
  // THE CASE THE FIRST FIX MISSED, found by the live stranger walk on 2026-09-22 and
  // reproduced here.
  //
  // The stand-down was placed « BEFORE the data gate » — but three guards still sat
  // above it, and one of them is `!signedIn && !isPaired()`. A demo sandbox is signed in
  // by the mint's own response, so on the first paints of the board `signedIn` is still
  // false and the effect returns BEFORE stamping the day. By the time the session lands,
  // a quick visitor has already skipped the welcome — so `hasTourSeen` is now true, the
  // stand-down branch is never taken, the day was never stamped, and the morning open
  // fires onto the stranger's first screen. Exactly the 2026-09-16 defect, through a
  // door the fix for it left open.
  //
  // The delay is what makes this a test rather than a decoration: with an instant
  // auth/me the old code passes.
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.clock.setFixedTime(new Date(BASE * 1000))
  await mockApi(page)
  await page.route('**/api/auth/me**', async (route) => {
    await new Promise((r) => setTimeout(r, 900))
    await route.fallback()
  })
  await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', habitCheckin: true, tour: true })

  await page.goto('/board')
  await expect(page.locator('.tour')).toBeVisible({ timeout: 15_000 })
  // Skip the welcome immediately — before the session has confirmed.
  await page.locator('.tour').getByRole('button', { name: 'Passer' }).click()
  await expect(page.locator('.tour')).toHaveCount(0)

  // Now let the session land. The board must still be under us.
  await page.waitForTimeout(1500)
  await expect(page).toHaveURL(/\/board(\?|$)/)
  await expect(page.locator('.habitudes')).toHaveCount(0)
})

test('…and when the BOARD CHUNK is what arrives late — the shape production actually has', async ({ page }) => {
  // THE CASE THE FIRST FIX MISSED, found by the live stranger walk on 2026-09-22 and
  // reproduced against production three times before being written down here.
  //
  // The stand-down asked « has this device met the tour? » from inside
  // `useHabitCheckinTrigger`, which lives in HubLayout — a LAZY chunk since the
  // door-weight pass. On a real connection the shell paints and the welcome starts while
  // the board is still « Chargement… ». A visitor who skips the welcome inside that
  // window flips the answer to true before the hook exists, so the stand-down is never
  // taken and the morning open throws them into « Le point du jour ».
  //
  // Delaying the hub module is what makes this a test: without the delay the hook is
  // always mounted first and the old code passes, which is exactly why it did.
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.clock.setFixedTime(new Date(BASE * 1000))
  await mockApi(page)
  await page.route('**/HubLayout*', async (route) => {
    await new Promise((r) => setTimeout(r, 2500))
    await route.fallback()
  })
  await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', habitCheckin: true, tour: true })

  await page.goto('/board')
  // The welcome is up while the board is still loading — the real first screen.
  await expect(page.locator('.tour')).toBeVisible({ timeout: 15_000 })
  await page.locator('.tour').getByRole('button', { name: 'Passer' }).click()
  await expect(page.locator('.tour')).toHaveCount(0)

  // Now let the hub arrive. The board must be what lands, not the habits scene.
  await expect(page.locator('.wg-slot').first()).toBeVisible({ timeout: 15_000 })
  await page.waitForTimeout(600)
  await expect(page).toHaveURL(/\/board(\?|$)/)
  await expect(page.locator('.habitudes')).toHaveCount(0)
})
