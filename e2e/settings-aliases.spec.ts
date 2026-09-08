import { test, expect, type Page } from '@playwright/test'
import { mockApi, seedState } from './mocks'
import { LEGACY_SUB, LEGACY_TAB, SETTINGS_TREE } from '../src/lib/settingsNav'

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
  ['household', 'maison'],
  ['devices', 'settings'],
  ['agenda', 'board'],
  ['chores', 'maison'],
  ['recipes', 'kitchen'],
  ['shopping', 'liste'],
  ['display', 'settings'],
  ['ai', 'settings'],
  // the 12 previously-retired ids
  ['guest', 'settings'],
  ['auto', 'maison'],
  ['todos', 'maison'],
  ['meals', 'kitchen'],
  ['reserve', 'kitchen'],
  ['ghost', 'liste'],
  ['calm', 'settings'],
  ['photos', 'settings'],
  ['week', 'board'],
  ['ai-log', 'settings'],
  // 'cercle' and 'routines' briefly graduated to real themed tabs, then were
  // DEMOTED back to aliases by the nav restructure (merged into ONE Maison tab).
  ['cercle', 'maison'],
  ['routines', 'maison'],
]

for (const [old, target] of TAB_CASES) {
  test(`?tab=${old} lands on the ${target} tab`, async ({ page }) => {
    await boot(page, `/settings?tab=${old}`)
    await expectTab(page, target)
  })
}

// A landed sub is asserted by ANCHOR — the first section card of the target sub is
// on screen (`id="op-<key>"`, from SETTINGS_TREE) — never by pill label, so the
// next rename or reshuffle changes this file's data, not its assertions.
const firstAnchor = (tab: keyof typeof SETTINGS_TREE, sub: string) =>
  `#op-${(SETTINGS_TREE[tab] as Record<string, readonly { key: string }[]>)[sub][0].key}`
const expectSub = (page: Page, tab: keyof typeof SETTINGS_TREE, sub: string) =>
  expect(page.locator(firstAnchor(tab, sub))).toBeVisible()

// The three old tabs whose subs SPLIT across themes: the raw ?sub picks the host
// (LEGACY_TAB.bySub) — walked from the data, so a re-pointed target updates this.
for (const [oldTab, entry] of Object.entries(LEGACY_TAB)) {
  for (const [oldSub, target] of Object.entries(entry.bySub ?? {})) {
    test(`?tab=${oldTab}&sub=${oldSub} lands on ${target.tab} ▸ ${target.sub}`, async ({ page }) => {
      await boot(page, `/settings?tab=${oldTab}&sub=${oldSub}`)
      await expectTab(page, target.tab)
      await expectSub(page, target.tab, target.sub)
    })
  }
}

// A retired ?sub reached through a retired TAB: the tab folds first (LEGACY_TAB),
// then the sub (LEGACY_SUB) — ?tab=ai&sub=calm must end on Système ▸ Affichage & veille.
test('?tab=ai&sub=calm folds tab, then sub, onto Système ▸ « Affichage & veille »', async ({ page }) => {
  await boot(page, '/settings?tab=ai&sub=calm')
  await expectTab(page, 'settings')
  await expectSub(page, 'settings', 'display')
  await expect(page.locator('#op-calm')).toBeVisible()
})

// EVERY retired within-tab sub id (LEGACY_SUB — kitchen's 2026-07 colour subs and
// the 2026-09 28 → 14 agglomeration) folds onto its host, walked from the data so
// the next merge adds a line there and a case here for free. Nothing 404s.
for (const [tab, folds] of Object.entries(LEGACY_SUB)) {
  for (const [oldSub, host] of Object.entries(folds ?? {})) {
    test(`?tab=${tab}&sub=${oldSub} folds onto ${tab} ▸ ${host}`, async ({ page }) => {
      await boot(page, `/settings?tab=${tab}&sub=${oldSub}`)
      await expectTab(page, tab)
      await expectSub(page, tab as keyof typeof SETTINGS_TREE, host)
    })
  }
}

test('?tab=recipes (legacy) lands on La cuisine ▸ Apparence', async ({ page }) => {
  await boot(page, '/settings?tab=recipes')
  await expectTab(page, 'kitchen')
  await expectSub(page, 'kitchen', 'apparence')
})

// ?focus= ALONE resolves the sub (subOfFocus): a link may name just the section and
// survive the next pill reshuffle — the day a card moves, its old ?sub would have
// pointed at the wrong pill while the section itself is still exactly findable.
test('?focus= without ?sub lands on the section, sub derived', async ({ page }) => {
  await boot(page, '/settings?tab=settings&focus=calm')
  await expectTab(page, 'settings')
  await expectSub(page, 'settings', 'display')
  await expect(page.locator('#op-calm')).toBeInViewport()
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

// `ghost` became a GUIDE_CARD_ALIAS onto the liste card (guide merge 2026-08-27)
// — the assertion is unchanged on purpose: the old bookmark must still land on
// the liste tab with its host card highlighted.
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

// The 55→32 agglomeration: a card retired INTO another (cookmode → recipes,
// GUIDE_CARD_ALIAS base 7) keeps its old deep-link working — ?card=cookmode&point=1
// must land on the recipes card with alias-shifted point 8 opened + highlighted.
test('a merged concept card id (+point) still lands on its host card', async ({ page }) => {
  await boot(page, '/settings?tab=guide&card=cookmode&point=1')
  await expect(page).toHaveURL(/tab=kitchen&lens=comprendre/)
  await expectTab(page, 'kitchen')
  await expect(page.locator('.guide__card.is-target')).toBeVisible()
  await expect(page.locator('.guide__point.is-target')).toBeVisible()
})

// ?focus= — a guide « Régler » link names ONE section card inside a stacked sub
// (kitchen ▸ Apparence stacks tags + pastilles + mesures): the anchored card is
// on screen and the param is consumed (one replace write, no re-trigger on back).
test('?focus=measureColors lands inside kitchen ▸ Apparence on the exact card', async ({ page }) => {
  await boot(page, '/settings?tab=kitchen&sub=apparence&focus=measureColors')
  await expectTab(page, 'kitchen')
  await expectSub(page, 'kitchen', 'apparence')
  await expect(page.locator('#op-measureColors')).toBeVisible()
  await expect(page).not.toHaveURL(/focus=/)
})
