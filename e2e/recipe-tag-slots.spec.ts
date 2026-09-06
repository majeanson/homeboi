import { test, expect, type Page } from '@playwright/test'
import { mockApi, seedState } from './mocks'

// « Pour ces repas » on a recipe LABEL (Réglages ▸ Recettes ▸ Étiquettes).
//
// A custom PILL could already carry meal slots — but that asks the household to model
// a FILTER (a label, a colour, a rule set) in order to state a fact about a word. The
// étiquette is where people put the meaning ("this one is a supper"), so it is where
// the preference belongs. This spec pins both halves: setting it, and the picker
// actually honouring it.

async function openTags(page: Page) {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await mockApi(page)
  await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile' })
  await page.goto('/settings?tab=kitchen&sub=recipeTags')
  await page.locator('.tag-admin__list').waitFor({ state: 'visible', timeout: 15_000 })
}

const rowFor = (page: Page, tag: string) => page.locator('.tag-admin__row-wrap', { hasText: tag }).first()

test('a tag can be told which meals it is for, and says so on its own row', async ({ page }) => {
  await openTags(page)
  const patches: unknown[] = []
  await page.route('**/api/recipe-tags**', async (route) => {
    if (route.request().method() !== 'PATCH') return route.fallback()
    const body = JSON.parse(route.request().postData() || '{}')
    patches.push(body)
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ tagSlots: { collation: ['snack'] } }) })
  })

  const row = rowFor(page, 'Collation')
  await row.getByRole('button', { name: /Repas de/ }).click()
  const pick = row.locator('.tag-admin__slotpick')
  await expect(pick).toBeVisible()
  await pick.getByText('Collation', { exact: true }).click()

  await expect.poll(() => patches).toContainEqual({ setTagSlots: { tag: 'Collation', slots: ['snack'] } })
})

test('the two drawers on a row are one at a time', async ({ page }) => {
  // Colour and meals both drop a pane under the row; opening one closes the other
  // rather than stacking two panes under a single tag.
  await openTags(page)
  const row = rowFor(page, 'rapide')
  await row.getByRole('button', { name: /Repas de/ }).click()
  await expect(row.locator('.tag-admin__slotpick')).toBeVisible()
  await row.getByRole('button', { name: /Couleur de/ }).click()
  await expect(row.locator('.tag-admin__coloredit')).toBeVisible()
  await expect(row.locator('.tag-admin__slotpick')).toHaveCount(0)
})

test('a read-only guest sees the tags but can set no meal preference', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await mockApi(page, { signedIn: false })
  await page.route('**/api/guest/whoami**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ kind: 'showcase' }) }),
  )
  await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile' })
  await page.addInitScript(() => localStorage.setItem('babillard-guest-token', 'e2e-guest-token'))
  await page.goto('/settings?tab=kitchen&sub=recipeTags')
  // The whole sub is operator-only for a guest (GUEST_SUBS), so either it isn't there
  // at all or it carries no meal control — both are "cannot set it".
  await expect(page.getByRole('button', { name: /Repas de/ })).toHaveCount(0)
})

// ── the half that matters: the picker honours it ────────────────────────────────
// Setting a preference nothing reads is a settings screen, not a feature.
test('a tag mapped to a slot lifts its recipes in that slot’s picker, and says why', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await mockApi(page, {
    overrides: {
      // « dessert » is for the snack slot. Only « Biscuits glacés » (rc4) carries it,
      // so it must lead the snack picker over the recipes that do not.
      'recipe-tags': {
        presets: [],
        used: [{ tag: 'rapide', count: 2 }, { tag: 'dessert', count: 1 }],
        colors: {},
        tagSlots: { dessert: ['snack'] },
      },
    },
  })
  await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile' })
  await page.goto('/kitchen/day/' + Math.floor(Date.now() / 1000 / 86400) * 86400 + '?vue=repas')
  await page.locator('.day-mng__sec').first().waitFor({ state: 'visible', timeout: 15_000 })

  // Open the Collation slot's composer and read the recipe list.
  const snack = page.locator('.day-mng__sec[data-dnd-zone="snack"]')
  await snack.locator('.sec-label__actbtn').click()
  const field = snack.locator('.edit-field input.input')
  await expect(field).toBeVisible()
  await field.click()
  const menu = page.locator('.combobox__menu')
  await expect(menu).toBeVisible()
  const rows = menu.locator('.combobox__row')
  await expect(rows.first()).toBeVisible()

  // The lifted recipe leads, and the row SAYS which label lifted it — a silent
  // reorder is the thing the hint exists to prevent.
  const first = rows.first()
  await expect(first).toContainText('Biscuits')
  await expect(first.locator('.combobox__row-hint')).toContainText('dessert')
})
