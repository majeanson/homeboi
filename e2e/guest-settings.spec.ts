import { test, expect, type Page } from '@playwright/test'
import { mockApi, seedState } from './mocks'

// A read-only LINK guest — which is exactly what the public demo is (functions/api/demo.ts
// mints a `showcase` guest token) — reaches Réglages, and Réglages narrows itself for them.
//
// Réglages used to be barred outright for a link guest. That also took the in-app guide,
// the language switch, the audience lens and « Disposition du babillard » with it — none of
// which touch the household, and all of which are the reason to look at the app at all. The
// rule now: `isGuest()` guards HOUSEHOLD WRITES; device-local prefs (localStorage) are
// free. This spec pins both halves — what opened up, and what must stay shut.
//
// See GUEST_SUBS in pages/Operator.tsx and the note on isGuest() in lib/device.

const PHONE = { width: 390, height: 844 }

// FR labels (t.operator.*): the themed tabs, then the sub pills.
const DISCOVER_TAB = 'Découvrir'
const BOARD_TAB = 'Le babillard'
// « Le cercle » and « Routines » merged into ONE « Maison » themed tab (the nav
// restructure) — GUEST_SUBS has no 'maison' entry, so a guest still sees no
// Régler pills there at all, same as the old cercle tab.
const MAISON_TAB = 'Maison'
const SYSTEM_TAB = 'Système'

const LAYOUT_SUB = 'Disposition du babillard'
const DISPLAY_SUB = 'Affichage'
const CALM_SUB = 'Mode calme'
const EVENTS_SUB = 'Rendez-vous'
const TABLETS_SUB = 'Tablettes jumelées'
const AI_SUB = 'Intelligence artificielle'
const SYSTEM_SUB = 'Version & diagnostics'

async function bootGuestSettings(page: Page, tab = 'decouvrir') {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.setViewportSize(PHONE)
  await mockApi(page, { signedIn: false })
  // The link guest's whole identity. `whoami` resolves the share-mode; `showcase` is the
  // one kind that stays in the hub (sitter/welcome/family bounce to their own scenes).
  await page.route('**/api/guest/whoami**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ kind: 'showcase' }) }),
  )
  await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile' })
  await page.addInitScript(() => localStorage.setItem('babillard-guest-token', 'e2e-guest-token'))
  await page.goto(`/settings?tab=${tab}`)
  await page.locator('.operator__tabs').waitFor({ state: 'visible', timeout: 15_000 })
}

test('a demo guest reaches Réglages instead of being bounced to the board', async ({ page }) => {
  await bootGuestSettings(page)

  await expect(page).toHaveURL(/\/settings/)
  await expect(page.locator('.operator')).toBeVisible()
  // Découvrir renders the guide, which is the point of letting them in at all.
  await expect(page.locator('.guide__card').first()).toBeVisible()
  // …but not the seed controls: loading/clearing sample data is operator-scoped.
  await expect(page.locator('.guide__sample')).toHaveCount(0)
  // The guest note replaces the kiosk one — a guest has no operator account to escalate to.
  await expect(page.locator('.operator__kiosk-note')).toBeVisible()
  await expect(page.getByRole('button', { name: /Se connecter comme opérateur/ })).toHaveCount(0)
})

test('the Réglages nav tab is offered to a guest', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.setViewportSize(PHONE)
  await mockApi(page, { signedIn: false })
  await page.route('**/api/guest/whoami**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ kind: 'showcase' }) }),
  )
  await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile' })
  await page.addInitScript(() => localStorage.setItem('babillard-guest-token', 'e2e-guest-token'))
  await page.goto('/board')
  await page.locator('.hubnav').waitFor({ state: 'visible', timeout: 15_000 })
  await expect(page.locator('.hubnav a[href="/settings"]')).toBeVisible()
})

test('a guest gets « Disposition » on the board tab, and nothing that writes the household', async ({ page }) => {
  await bootGuestSettings(page, 'board')

  const subs = page.locator('.subtabs')
  // Layout is device-local (lib/boardCards) — theirs to change.
  await expect(subs.getByRole('tab', { name: LAYOUT_SUB, exact: true })).toBeVisible()
  // Agenda + « La semaine » write/read the household — gone.
  await expect(subs.getByRole('tab', { name: EVENTS_SUB, exact: true })).toHaveCount(0)

  // And the panel is really usable, not a read-only listing: every row carries a drag
  // grip, and the drop-here tail target renders (the only way back into an emptied zone).
  await expect(page.locator('.board-layout__row .dnd-grip').first()).toBeVisible()
  await expect(page.locator('.board-layout__end').first()).toBeVisible()
})

test('a guest gets the device-local subs under Système and none of the machinery', async ({ page }) => {
  await bootGuestSettings(page, 'settings')

  const subs = page.locator('.subtabs')
  await expect(subs.getByRole('tab', { name: DISPLAY_SUB, exact: true })).toBeVisible()
  await expect(subs.getByRole('tab', { name: CALM_SUB, exact: true })).toBeVisible()

  // Pairing, IA, and « Version & diagnostics » (which carries the household export)
  // must never appear for a read-only viewer.
  await expect(subs.getByRole('tab', { name: TABLETS_SUB, exact: true })).toHaveCount(0)
  await expect(subs.getByRole('tab', { name: AI_SUB, exact: true })).toHaveCount(0)
  await expect(subs.getByRole('tab', { name: SYSTEM_SUB, exact: true })).toHaveCount(0)
})

test('a guest can flip this device to English and to the toddler lens', async ({ page }) => {
  await bootGuestSettings(page, 'settings')
  await expect(page.locator('.subtabs').getByRole('tab', { name: DISPLAY_SUB, exact: true })).toBeVisible()

  // The language switch is device-local: it re-labels the app, it doesn't touch the household.
  await page.getByRole('button', { name: 'Français', exact: true }).click()
  await expect(page.getByRole('button', { name: 'English', exact: true })).toBeVisible()

  // The audience lens likewise — a demo that can't show the toddler view shows half the app.
  await expect(page.locator('.audience-switch__opt').first()).toBeVisible()
})

test('a tab with no device-local sub drops the lens toggle and stands on the guide', async ({ page }) => {
  // Maison configures only household things (routines, chores, members, groups, cars,
  // hours), so a guest gets no Régler side at all — show Comprendre alone rather than
  // an empty pill row.
  await bootGuestSettings(page, 'maison')

  await expect(page.locator('.operator__lens')).toHaveCount(0)
  await expect(page.locator('.guide__card').first()).toBeVisible()
})

test('the operator still sees every sub (the guest narrowing is not a global regression)', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.setViewportSize(PHONE)
  await mockApi(page, { signedIn: true })
  await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile' })
  await page.goto('/settings?tab=settings')
  await page.locator('.operator__tabs').waitFor({ state: 'visible', timeout: 15_000 })

  const subs = page.locator('.subtabs')
  await expect(subs.getByRole('tab', { name: TABLETS_SUB, exact: true })).toBeVisible()
  await expect(subs.getByRole('tab', { name: SYSTEM_SUB, exact: true })).toBeVisible()
  // And the lens toggle is back, because Régler has something to show.
  await expect(page.locator('.operator__lens')).toBeVisible()

  const mainTabs = page.locator('.operator__tabs')
  await expect(mainTabs.getByRole('tab', { name: DISCOVER_TAB, exact: true })).toBeVisible()
  await expect(mainTabs.getByRole('tab', { name: BOARD_TAB, exact: true })).toBeVisible()
  await expect(mainTabs.getByRole('tab', { name: MAISON_TAB, exact: true })).toBeVisible()
  await expect(mainTabs.getByRole('tab', { name: SYSTEM_TAB, exact: true })).toBeVisible()
})
