import { test, expect, type Page } from '@playwright/test'
import { mockApi, seedState } from './mocks'

// A parent-mode kiosk (paired wall tablet, NOT locked into toddler) may open
// Réglages to read the guide and edit most settings — but member/group admin,
// device pairing and guest links stay operator-only. Gating is PER-SUB now: every
// themed tab stays visible, and the operator-only sub-sections (Le cercle ▸ La
// maisonnée / Groupes, Système ▸ Tablettes / Invités) drop from the pill row AND
// the valid ?sub set (no deep-link bypass); the server still rejects their
// writes. A signed-in operator sees the full set and no kiosk notice.
// (Frontend-only harness; auth/me drives signedIn.)

const PHONE = { width: 390, height: 844 }

// French labels: the themed tabs (t.nav.* / t.operator.sec*) + the gated
// sub-section pills (each sub reuses its section's own title key).
const CERCLE_TAB = 'Le cercle'
const SYSTEM_TAB = 'Système'
const ROUTINES_TAB = 'Routines'
const MEMBERS_SUB = 'La maisonnée'
const TABLETS_SUB = 'Tablettes jumelées'

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

test('parent-mode kiosk reaches Réglages with member admin + pairing hidden per-sub', async ({ page }) => {
  await bootSettings(page, 'guide', { operator: false })

  // It got IN — not bounced to /login — and the shell rendered.
  await expect(page).toHaveURL(/\/settings/)
  await expect(page.locator('.operator')).toBeVisible()

  // The "you're on a kiosk, some settings need the operator account" notice shows.
  await expect(page.locator('.operator__kiosk-note')).toBeVisible()

  // Every themed tab stays visible on a kiosk (gating is per-sub now)…
  const mainTabs = page.locator('.operator__tabs')
  await expect(mainTabs.getByRole('tab', { name: CERCLE_TAB, exact: true })).toBeVisible()
  await expect(mainTabs.getByRole('tab', { name: SYSTEM_TAB, exact: true })).toBeVisible()
  await expect(mainTabs.getByRole('tab', { name: ROUTINES_TAB, exact: true })).toBeVisible()

  // …but Le cercle offers no « La maisonnée » (members) pill — the everyday subs
  // (autos, horaires) remain.
  await mainTabs.getByRole('tab', { name: CERCLE_TAB, exact: true }).click()
  await expect(page.locator('.subtabs').getByRole('tab', { name: MEMBERS_SUB, exact: true })).toHaveCount(0)
})

test('kiosk deep-link to a gated sub folds to the first visible sub', async ({ page }) => {
  // ?tab=devices folds to Système; its tablets/guest subs are out of the valid
  // ?sub set on a kiosk, so the pairing panel can't render (ClaimTablet stays
  // unreachable) — the deep link lands on the first visible sub instead.
  await bootSettings(page, 'devices', { operator: false })
  await expect(page.locator('.operator')).toBeVisible()
  await expect(page.locator('.subtabs').getByRole('tab', { name: TABLETS_SUB, exact: true })).toHaveCount(0)
  // The Tablettes panel's claim form must not be on screen.
  await expect(page.locator('.operator__claim')).toHaveCount(0)
})

test('signed-in operator sees members + pairing and no kiosk notice', async ({ page }) => {
  await bootSettings(page, 'guide', { operator: true })

  await expect(page.locator('.operator')).toBeVisible()
  await expect(page.locator('.operator__kiosk-note')).toHaveCount(0)

  const mainTabs = page.locator('.operator__tabs')
  await mainTabs.getByRole('tab', { name: CERCLE_TAB, exact: true }).click()
  await expect(page.locator('.subtabs').getByRole('tab', { name: MEMBERS_SUB, exact: true })).toBeVisible()
  await mainTabs.getByRole('tab', { name: SYSTEM_TAB, exact: true }).click()
  await expect(page.locator('.subtabs').getByRole('tab', { name: TABLETS_SUB, exact: true })).toBeVisible()
})
