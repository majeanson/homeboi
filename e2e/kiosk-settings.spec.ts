import { test, expect, type Page } from '@playwright/test'
import { mockApi, seedState } from './mocks'
import { SETTINGS_TREE, visibleSections, visibleSubs, type SettingsTabId } from '../src/lib/settingsNav'

// A parent-mode kiosk (paired wall tablet, NOT locked into toddler) may open
// Réglages to read the guide and edit most settings — but member/group admin,
// device pairing, guest links and the household export stay operator-only. The
// server still rejects their writes; this is the UI half of that gate.
//
// Gating is PER SECTION CARD (2026-09-08, the 28 → 14 merge): every card in
// lib/settingsNav's SETTINGS_TREE carries an `access`, and a viewer's pill row and
// stacks DERIVE from it — a pill shows when at least one of its cards does, and only
// those cards render inside it. So on a kiosk, Maison ▸ « La maisonnée » (members +
// cercle groups, both operator) drops as a whole pill, while Système ▸ « Appareils &
// accès » STAYS — its pairing/guest/export cards vanish but a wall tablet's own
// diagnostics (mic test, keyboard debug, health) remain reachable, which is where
// the old per-pill gate used to strand a kiosk.
//
// Data-driven on purpose: the expectations below are computed from the tree with
// the same `visibleSubs`/`visibleSections` Operator uses, so the next pill reshuffle
// changes nothing here. What this proves is that the PAGE agrees with the data.

const PHONE = { width: 390, height: 844 }
const KIOSK = { guest: false, operator: false }
const OPERATOR = { guest: false, operator: true }
const TABS = Object.keys(SETTINGS_TREE) as SettingsTabId[]

async function bootSettings(page: Page, path: string, opts: { operator: boolean }) {
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
  await page.goto(path)
  await page.locator('.operator__tabs').waitFor({ state: 'visible', timeout: 15_000 })
}

test('parent-mode kiosk reaches Réglages, with the kiosk notice', async ({ page }) => {
  await bootSettings(page, '/settings?tab=guide', { operator: false })
  // It got IN — not bounced to /login — and the shell rendered.
  await expect(page).toHaveURL(/\/settings/)
  await expect(page.locator('.operator')).toBeVisible()
  // The "you're on a kiosk, some settings need the operator account" notice shows.
  await expect(page.locator('.operator__kiosk-note')).toBeVisible()
  // Every themed tab stays visible on a kiosk (gating is per card, never per tab).
  for (const tab of TABS) await expect(page.locator(`#op-tab-${tab}`)).toBeVisible()
})

for (const tab of TABS) {
  const kioskSubs = visibleSubs(tab, KIOSK)
  const allSubs = visibleSubs(tab, OPERATOR)
  const dropped = allSubs.filter((s) => !kioskSubs.includes(s))

  test(`kiosk ▸ ${tab}: exactly the tree's kiosk pills (${kioskSubs.length} of ${allSubs.length}), operator cards absent inside each`, async ({ page }) => {
    await bootSettings(page, `/settings?tab=${tab}&lens=regler`, { operator: false })
    const pills = page.locator('.operator__subs [role="tab"]')
    if (kioskSubs.length === 0) {
      // No card for a kiosk on this tab → no Régler side at all.
      await expect(page.locator('.operator__lens')).toHaveCount(0)
      return
    }
    await expect(pills).toHaveCount(kioskSubs.length)
    for (const sub of kioskSubs) {
      await page.goto(`/settings?tab=${tab}&lens=regler&sub=${sub}`)
      await page.locator('.operator__subs').waitFor({ state: 'visible', timeout: 15_000 })
      const all = visibleSections(tab, sub, OPERATOR)
      const shown = new Set(visibleSections(tab, sub, KIOSK).map((s) => s.key))
      for (const s of all) {
        await expect(page.locator(`#op-${s.key}`), `${tab}/${sub}: ${s.key} (${s.access}) on a kiosk`).toHaveCount(shown.has(s.key) ? 1 : 0)
      }
    }
    // A dropped pill is also out of the valid ?sub set: a deep link folds to the
    // tab's first kiosk pill instead of bypassing the gate.
    for (const sub of dropped) {
      await page.goto(`/settings?tab=${tab}&lens=regler&sub=${sub}`)
      await page.locator('.operator__subs').waitFor({ state: 'visible', timeout: 15_000 })
      for (const s of visibleSections(tab, sub, OPERATOR)) await expect(page.locator(`#op-${s.key}`)).toHaveCount(0)
    }
  })
}

test('kiosk: the legacy ?tab=devices deep link lands on Système without the pairing form', async ({ page }) => {
  // ?tab=devices folds to Système ▸ « Appareils & accès » — a pill a kiosk keeps
  // (its diagnostics live there), whose pairing / guest / export cards are gone.
  await bootSettings(page, '/settings?tab=devices', { operator: false })
  await expect(page.locator('#op-tab-settings')).toHaveAttribute('aria-selected', 'true')
  await expect(page.locator('.operator__claim')).toHaveCount(0)
  await expect(page.locator('#op-claimTablet')).toHaveCount(0)
  await expect(page.locator('#op-devices')).toHaveCount(0)
  await expect(page.locator('#op-guestLinks')).toHaveCount(0)
  await expect(page.locator('#op-takeout')).toHaveCount(0)
  await expect(page.locator('#op-kbDebug')).toBeVisible()
})

test('signed-in operator sees every pill and card, and no kiosk notice', async ({ page }) => {
  await bootSettings(page, '/settings?tab=maison&lens=regler&sub=members', { operator: true })
  await expect(page.locator('.operator__kiosk-note')).toHaveCount(0)
  await expect(page.locator('.operator__subs [role="tab"]')).toHaveCount(visibleSubs('maison', OPERATOR).length)
  await expect(page.locator('#op-members')).toBeVisible()
  await expect(page.locator('#op-cercleGroups')).toBeVisible()
  await page.goto('/settings?tab=settings&lens=regler&sub=tablets')
  await expect(page.locator('#op-claimTablet')).toBeVisible()
  await expect(page.locator('#op-devices')).toBeVisible()
})
