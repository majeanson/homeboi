import { test, expect, type Page } from '@playwright/test'
import { mockApi, seedState } from './mocks'
import { SETTINGS_TREE, SUB_LABEL_KEY } from '../src/lib/settingsNav'

// THE RÉGLAGES TREE, walked in the browser. lib/settingsNav.ts is the one map of
// what Réglages holds where (settingsNav.test.ts holds its shape); this proves the
// map is TRUE of the page: for the operator, every pill in the tree renders, and
// every section it lists mints its `id="op-<key>"` card — which is the anchor a
// guide « Régler » link, a "?" hint or a spec lands on. A section added to the
// tree with no node in Operator's map (or a node whose OperatorSection forgot its
// helpKey/anchor) fails here, naming the key, instead of being a link that scrolls
// to nothing. Data-driven on purpose: the next reshuffle edits the tree and this
// file needs no change at all.

const PHONE = { width: 390, height: 844 }

async function boot(page: Page, path: string) {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.setViewportSize(PHONE)
  await mockApi(page, { signedIn: true })
  await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', calm: true, surface: 'mobile' })
  await page.goto(path)
  await page.locator('.operator__tabs').waitFor({ state: 'visible', timeout: 15_000 })
}

type Tab = keyof typeof SETTINGS_TREE

for (const tab of Object.keys(SETTINGS_TREE) as Tab[]) {
  const subs = SETTINGS_TREE[tab] as Record<string, readonly { key: string }[]>

  test(`${tab}: the pill row is exactly the tree's pills, in order`, async ({ page }) => {
    await boot(page, `/settings?tab=${tab}&lens=regler`)
    const pills = page.locator('.operator__subs [role="tab"]')
    await expect(pills).toHaveCount(Object.keys(subs).length)
    // Every pill has a label (SUB_LABEL_KEY resolved through i18n) — never a bare id
    // or an empty button. The exact words live in i18n and are not asserted here.
    for (let i = 0; i < Object.keys(subs).length; i++) {
      const text = (await pills.nth(i).innerText()).trim()
      expect(text, `pill ${i} of ${tab} (${Object.keys(subs)[i]}, label key ${(SUB_LABEL_KEY[tab] as Record<string, string>)[Object.keys(subs)[i]]})`).not.toBe('')
      expect(Object.keys(subs), `pill ${i} of ${tab} shows its id instead of a label`).not.toContain(text)
    }
  })

  for (const [sub, sections] of Object.entries(subs)) {
    test(`${tab} ▸ ${sub}: every section in the tree renders its #op-<key> card`, async ({ page }) => {
      await boot(page, `/settings?tab=${tab}&lens=regler&sub=${sub}`)
      // The pill is selected…
      await expect(page.locator('.operator__subs [role="tab"][aria-selected="true"]')).toHaveCount(1)
      // …and its stack is the tree's, in the tree's order (DOM order of the anchors).
      const keys = sections.map((s) => s.key)
      for (const key of keys) {
        await expect(page.locator(`#op-${key}`), `${tab}/${sub} lists "${key}" but no card mints id="op-${key}"`).toHaveCount(1)
      }
      const order = await page.locator('[id^="op-"]').evaluateAll((els) => els.map((e) => e.id.slice(3)))
      expect(order.filter((k) => keys.includes(k)), `${tab}/${sub}: stack order differs from the tree`).toEqual(keys)
    })
  }
}

// ?focus= alone must reach a card in EVERY pill — the whole point of naming the
// section: one representative per pill, the last one (the hardest to reach).
for (const tab of Object.keys(SETTINGS_TREE) as Tab[]) {
  for (const [sub, sections] of Object.entries(SETTINGS_TREE[tab] as Record<string, readonly { key: string }[]>)) {
    const last = sections[sections.length - 1].key
    test(`?tab=${tab}&focus=${last} lands on that card with no ?sub spelled (derives ${sub})`, async ({ page }) => {
      await boot(page, `/settings?tab=${tab}&focus=${last}`)
      await expect(page.locator(`#op-${last}`)).toBeInViewport()
      // The one-shot param is consumed (one replace write; back-nav doesn't re-scroll).
      await expect(page).not.toHaveURL(/focus=/)
    })
  }
}
