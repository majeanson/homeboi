import { test, expect, type Page } from '@playwright/test'
import { mockApi, seedState } from './mocks'

// Regression net for the themed-Réglages restructure: EVERY pre-restructure
// deep-link — the 9 old task tabs, the 12 previously-retired ids, the ?sub=
// splits, ?card=/&point= guide links and ?theme= jump-grid links — must still
// land on the right themed tab (LEGACY_TAB / cardHomeTab / THEME_ALIAS in
// pages/Operator). If someone bookmarked a settings URL any time in the app's
// life, it keeps working. Landing is asserted on the SELECTED TAB (the URL keeps
// the raw legacy params — folding is in-memory, by design).

const PHONE = { width: 390, height: 844 }

async function boot(page: Page, path: string) {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.setViewportSize(PHONE)
  await mockApi(page)
  await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', calm: true, surface: 'mobile' })
  await page.goto(path)
  await page.locator('.operator__tabs').waitFor({ state: 'visible', timeout: 15_000 })
}

const expectTab = (page: Page, id: string) =>
  expect(page.locator(`#op-tab-${id}`)).toHaveAttribute('aria-selected', 'true')

// Every legacy ?tab= id → the themed tab that hosts it now.
const TAB_CASES: [string, string][] = [
  // the 9 old task-oriented tabs
  ['guide', 'decouvrir'],
  ['household', 'cercle'],
  ['devices', 'settings'],
  ['agenda', 'board'],
  ['chores', 'routines'],
  ['recipes', 'kitchen'],
  ['shopping', 'liste'],
  ['display', 'settings'],
  ['ai', 'settings'],
  // the 12 previously-retired ids (cercle + routines graduated to real tabs)
  ['guest', 'settings'],
  ['auto', 'cercle'],
  ['todos', 'routines'],
  ['meals', 'kitchen'],
  ['reserve', 'kitchen'],
  ['ghost', 'liste'],
  ['calm', 'settings'],
  ['photos', 'settings'],
  ['week', 'board'],
  ['ai-log', 'settings'],
  ['cercle', 'cercle'],
  ['routines', 'routines'],
]

for (const [old, target] of TAB_CASES) {
  test(`?tab=${old} lands on the ${target} tab`, async ({ page }) => {
    await boot(page, `/settings?tab=${old}`)
    await expectTab(page, target)
  })
}

// The three old tabs whose subs SPLIT across themes: the raw ?sub picks the host.
test('?tab=agenda&sub=cars lands on Le cercle with the vehicles sub', async ({ page }) => {
  await boot(page, '/settings?tab=agenda&sub=cars')
  await expectTab(page, 'cercle')
  await expect(page.locator('.subtabs').getByRole('tab', { name: 'Tes véhicules' })).toHaveAttribute('aria-selected', 'true')
})

test('?tab=display&sub=layout lands on Le babillard with the layout sub', async ({ page }) => {
  await boot(page, '/settings?tab=display&sub=layout')
  await expectTab(page, 'board')
  await expect(page.locator('.subtabs').getByRole('tab', { name: 'Disposition du babillard' })).toHaveAttribute('aria-selected', 'true')
})

test('?tab=ai&sub=thisweek lands on Le babillard with La semaine', async ({ page }) => {
  await boot(page, '/settings?tab=ai&sub=thisweek')
  await expectTab(page, 'board')
  await expect(page.locator('.subtabs').getByRole('tab', { name: 'La semaine' })).toHaveAttribute('aria-selected', 'true')
})

// A ?sub that stays within its old tab's theme passes straight through.
test('?tab=ai&sub=calm lands on Système with the calm sub', async ({ page }) => {
  await boot(page, '/settings?tab=ai&sub=calm')
  await expectTab(page, 'settings')
  await expect(page.locator('.subtabs').getByRole('tab', { name: 'Mode calme' })).toHaveAttribute('aria-selected', 'true')
})

// ?card= guide links home onto the card's themed tab, Comprendre lens, and the
// card opens highlighted (the param is consumed, pinning tab+lens in the URL).
test('?tab=guide&card=kitchen homes onto La cuisine in Comprendre', async ({ page }) => {
  await boot(page, '/settings?tab=guide&card=kitchen')
  await expect(page).toHaveURL(/tab=kitchen&lens=comprendre/)
  await expectTab(page, 'kitchen')
  await expect(page.locator('.guide__card.is-target')).toBeVisible()
})

test('a retired settings card id (+point) still lands on the exact card', async ({ page }) => {
  // set-photos was folded into set-display (SETTINGS_CARD_ALIAS), whose home is
  // Système now — the alias chain must survive the restructure end-to-end.
  await boot(page, '/settings?tab=guide&card=set-photos&point=0')
  await expect(page).toHaveURL(/tab=settings&lens=comprendre/)
  await expectTab(page, 'settings')
  await expect(page.locator('.guide__card.is-target')).toBeVisible()
})

test('a concept card homes onto its bucket (ghost → La liste)', async ({ page }) => {
  await boot(page, '/settings?tab=guide&card=ghost')
  await expect(page).toHaveURL(/tab=liste&lens=comprendre/)
  await expectTab(page, 'liste')
  await expect(page.locator('.guide__card.is-target')).toBeVisible()
})

// Old jump-grid ?theme= links resolve through THEME_ALIAS.
test('?theme=kitchen-shop opens La cuisine in Comprendre', async ({ page }) => {
  await boot(page, '/settings?tab=guide&theme=kitchen-shop')
  await expect(page).toHaveURL(/tab=kitchen&lens=comprendre/)
  await expectTab(page, 'kitchen')
})
