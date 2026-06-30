import { test, expect, type Page } from '@playwright/test'
import { mockApi, seedState } from './mocks'

// A parent-mode kiosk (paired wall tablet, NOT locked into toddler) may open
// Réglages to read the Guide and edit most settings — but member admin and device
// pairing stay operator-only: those two tabs are hidden, kept out of the valid tab
// set (no deep-link bypass), and the server still rejects their writes. A signed-in
// operator sees the full set and no kiosk notice. Regression guard for the
// broad-editable-kiosk change. (Frontend-only harness; auth/me drives signedIn.)

const PHONE = { width: 390, height: 844 }

// French tab labels (t.operator.*) for the two operator-only tabs + an everyday one.
// « La maisonnée » (members + cercle) and « Accès & appareils » (tablets + guest) are
// both operator-only and hidden on a kiosk.
const MEMBERS_TAB = 'La maisonnée'
const DEVICES_TAB = 'Accès & appareils'
const CHORES_TAB = 'Corvées & routines'

async function bootSettings(page: Page, tab: string, opts: { operator: boolean }) {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.setViewportSize(PHONE)
  // operator: signedIn cookie session (full access). kiosk: signedIn false but a
  // device token present (seedState paired) — the parent-mode wall tablet.
  await mockApi(page, { signedIn: opts.operator })
  await seedState(page, {
    theme: 'day',
    audience: 'parent',
    lang: 'fr',
    surface: opts.operator ? 'mobile' : 'kiosk',
    paired: !opts.operator,
  })
  await page.goto(`/settings?tab=${tab}`)
  await page.locator('.operator__tabs').waitFor({ state: 'visible', timeout: 15_000 })
}

test('parent-mode kiosk reaches Réglages with members + pairing hidden', async ({ page }) => {
  await bootSettings(page, 'guide', { operator: false })

  // It got IN — not bounced to /login — and the shell rendered.
  await expect(page).toHaveURL(/\/settings/)
  await expect(page.locator('.operator')).toBeVisible()

  // The "you're on a kiosk, some settings need the operator account" notice shows.
  await expect(page.locator('.operator__kiosk-note')).toBeVisible()

  // The two operator-only tabs are gone; an everyday tab (Corvées) is present.
  await expect(page.getByRole('tab', { name: MEMBERS_TAB, exact: true })).toHaveCount(0)
  await expect(page.getByRole('tab', { name: DEVICES_TAB, exact: true })).toHaveCount(0)
  await expect(page.getByRole('tab', { name: CHORES_TAB, exact: true })).toBeVisible()
})

test('kiosk deep-link to a hidden tab falls back instead of opening it', async ({ page }) => {
  // ?tab=devices is kept out of the valid set for a kiosk, so it can't render the
  // pairing panel — the tab strip never offers it (ClaimTablet stays unreachable).
  await bootSettings(page, 'devices', { operator: false })
  await expect(page.locator('.operator')).toBeVisible()
  await expect(page.getByRole('tab', { name: DEVICES_TAB, exact: true })).toHaveCount(0)
  // The Tablettes panel's claim form must not be on screen.
  await expect(page.locator('.operator__claim')).toHaveCount(0)
})

test('signed-in operator sees members + pairing and no kiosk notice', async ({ page }) => {
  await bootSettings(page, 'guide', { operator: true })

  await expect(page.locator('.operator')).toBeVisible()
  await expect(page.locator('.operator__kiosk-note')).toHaveCount(0)
  await expect(page.getByRole('tab', { name: MEMBERS_TAB, exact: true })).toBeVisible()
  await expect(page.getByRole('tab', { name: DEVICES_TAB, exact: true })).toBeVisible()
})
