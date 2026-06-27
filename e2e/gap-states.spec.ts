import { test as base, expect, type Page } from '@playwright/test'
import { mockApi, seedState, type Theme } from './mocks'

// Screenshot-review loop — the OPENED states the mature suite still missed (audited
// against the full inventory): the destructive CONFIRM dialog, the generic DETAIL
// PEEK sheet, the in-app GUIDE, and the kiosk AMBIENT screensaver — each in DAY and
// NIGHT (night is where token/contrast bugs hide and most opened states were day-
// only). Mock-based + Chromium, so it runs in CI without creds. Also a crash-smoke
// suite: any pageerror fails.
const test = base.extend({
  page: async ({ page }, use) => {
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(e.message))
    await use(page)
    expect(errors, 'pageerror in an opened gap-state').toEqual([])
  },
})

const PHONE = { width: 390, height: 844 }
const WALL = { width: 1280, height: 800 }
const shot = (page: Page, name: string) =>
  page.screenshot({ path: `e2e/screenshots/gap-${name}.png`, fullPage: false })

async function boot(page: Page, path: string, theme: Theme, surface: 'mobile' | 'kiosk', fmt: { width: number; height: number }) {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.setViewportSize(fmt)
  await mockApi(page)
  await seedState(page, { theme, audience: 'parent', lang: 'fr', calm: true, surface })
  await page.goto(path)
  await page.locator('.hub, .page, main').first().waitFor({ state: 'visible', timeout: 15_000 }).catch(() => {})
  await page.evaluate(() => (document as any).fonts?.ready).catch(() => {})
}

// ── 1. The destructive CONFIRM dialog (useConfirm) — never screenshotted before.
// Deleting a household member is a HEAVY delete, so it asks via the in-app confirm
// (not the undo toast). We open the dialog and shoot it; we do NOT confirm.
for (const theme of ['day', 'night'] as Theme[]) {
  const sfx = theme === 'night' ? '-night' : ''
  test(`gap confirm-dialog${sfx}`, async ({ page }) => {
    await boot(page, '/settings?tab=household', theme, 'mobile', PHONE)
    await page.getByRole('button', { name: 'Supprimer la personne' }).first().click()
    await page.locator('.confirm').waitFor({ state: 'visible', timeout: 10_000 })
    // The danger-toned dialog: message + the yes/no actions.
    await expect(page.locator('.confirm__actions')).toBeVisible()
    await page.waitForTimeout(250)
    await shot(page, `confirm-dialog-phone${sfx}`)
  })
}

// ── 2. The generic DETAIL PEEK (useEntityDetail → .detail-sheet). Tap any board
// activity row (.act__hit) → its detail sheet. The recipe peek was covered; this
// is the shared sheet for events/chores/meals.
for (const theme of ['day', 'night'] as Theme[]) {
  const sfx = theme === 'night' ? '-night' : ''
  test(`gap detail-peek${sfx}`, async ({ page }) => {
    await boot(page, '/board', theme, 'mobile', PHONE)
    await page.locator('.act__hit').first().click()
    await page.locator('.detail-sheet').waitFor({ state: 'visible', timeout: 10_000 })
    await page.waitForTimeout(250)
    await shot(page, `detail-peek-phone${sfx}`)
  })
}

// ── 3. The in-app GUIDE (the user manual, Réglages ▸ Guide) — a whole surface never
// captured. Day + night, phone + wall (it reads as one column on phone, wider grid
// on a wall tablet).
for (const theme of ['day', 'night'] as Theme[]) {
  const sfx = theme === 'night' ? '-night' : ''
  for (const fmt of [{ name: 'phone', vp: PHONE, surface: 'mobile' as const }, { name: 'wall', vp: WALL, surface: 'kiosk' as const }]) {
    // Wall night is redundant with phone for the Guide's flat content; keep phone
    // both themes + wall day to bound the matrix.
    if (fmt.name === 'wall' && theme === 'night') continue
    test(`gap guide-${fmt.name}${sfx}`, async ({ page }) => {
      await boot(page, '/settings?tab=guide', theme, fmt.surface, fmt.vp)
      await page.locator('.guide').first().waitFor({ state: 'visible', timeout: 15_000 })
      await page.waitForTimeout(300)
      await shot(page, `guide-${fmt.name}${sfx}`)
    })
  }
}

// ── 4. The kiosk AMBIENT screensaver (AmbientScreen) — the at-rest full-screen
// clock/photo-frame, never captured. forceIdle('screensaver') dispatches the
// bb:idle-debug CustomEvent HubLayout listens for, so we trigger it directly (no
// waiting on the real idle timer). Kiosk surface — it's a wall-tablet behaviour.
for (const theme of ['day', 'night'] as Theme[]) {
  const sfx = theme === 'night' ? '-night' : ''
  test(`gap ambient-screensaver${sfx}`, async ({ page }) => {
    await boot(page, '/board', theme, 'kiosk', WALL)
    await page.locator('.hub').first().waitFor({ state: 'visible', timeout: 15_000 })
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('bb:idle-debug', { detail: 'screensaver' })))
    await page.locator('.ambient').waitFor({ state: 'visible', timeout: 10_000 })
    await page.waitForTimeout(400)
    await shot(page, `ambient-screensaver-wall${sfx}`)
  })
}
