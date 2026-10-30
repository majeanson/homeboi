import { test, expect } from '@playwright/test'
import { mockApi, seedState } from './mocks'

// A recipe with an ALTERNATIVE — « pour une version bol » (2026-10-30, Marc's pick: one
// recipe, a version switch). The stored lists are flat; a version is a matched pair of
// « ## » sections (lib/recipeSections). The sheet shows « Recette | Bol »: the base by
// default (no bowl line anywhere), and « Bol » = the base's ingredients plus the bowl's,
// with the bowl's steps INSTEAD of the oven's. Cook mode carries the same switch.
const VERSIONED = {
  recipes: [
    {
      id: 'rcv',
      title: 'Saumon à l’asiatique',
      ingredients: [
        '4 pavés de saumon',
        '## Pour la marinade',
        '60 ml (¼ de tasse) de sauce soya',
        '## pour une version bol — Garnitures (au choix et au goût)',
        'Chou rouge émincé',
        '## pour une version bol — Pour la sauce',
        '80 ml (1/3 de tasse) de mayonnaise',
      ],
      steps: ['Mariner le saumon 30 minutes.', 'Cuire au four de 15 à 18 minutes.', '## pour une version bol', 'Dans un bol, mélanger les ingrédients de la sauce.', 'Garnir et servir.'],
      servings: 4,
      prepMin: 20,
      cookMin: 20,
      totalMin: null,
      notes: null,
      source: null,
      image: null,
      tags: [],
      updatedAt: 1_700_000_000,
    },
  ],
}

async function openSheet(page: import('@playwright/test').Page) {
  await page.setViewportSize({ width: 390, height: 844 })
  await mockApi(page, { overrides: { recipes: VERSIONED } })
  await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile' })
  // The sheet is a route (RecipeViewPage) — open it straight, like a shared link would.
  await page.goto('/kitchen/recipe/rcv')
  await expect(page.locator('.recipe-modal__card')).toBeVisible()
}

test('the sheet opens on the base recipe — no bowl line anywhere — and « Bol » swaps the method in', async ({ page }) => {
  await openSheet(page)
  const card = page.locator('.recipe-modal__card')
  const row = card.locator('.recipe-versions')
  await expect(row.getByRole('button', { name: 'Recette' })).toHaveAttribute('aria-pressed', 'true')
  await expect(row.getByRole('button', { name: 'Bol' })).toHaveAttribute('aria-pressed', 'false')

  // The base: the oven method, the marinade — and nothing of the bowl.
  await expect(card).toContainText('Cuire au four de 15 à 18 minutes.')
  await expect(card).toContainText('sauce soya')
  await expect(card).not.toContainText('mayonnaise')
  await expect(card).not.toContainText('mélanger les ingrédients de la sauce')
  await expect(card).not.toContainText('version bol')

  await row.getByRole('button', { name: 'Bol' }).click()
  // The version: the base's ingredients PLUS the bowl's parts under their own names,
  // and the bowl's steps instead of the oven's.
  await expect(card).toContainText('sauce soya')
  await expect(card).toContainText('mayonnaise')
  await expect(card).toContainText('Pour la sauce')
  await expect(card).toContainText('Dans un bol, mélanger les ingrédients de la sauce.')
  await expect(card).not.toContainText('Cuire au four de 15 à 18 minutes.')
  // The composed heading never shows raw.
  await expect(card).not.toContainText('version bol —')
})

test('cook mode carries the switch, and the toddler lens does not', async ({ page }) => {
  await openSheet(page)
  await page.getByRole('button', { name: 'Cuisiner' }).click()
  const row = page.locator('.cook__stage .recipe-versions')
  await expect(row.getByRole('button', { name: 'Bol' })).toBeVisible()
  await row.getByRole('button', { name: 'Bol' }).click()
  await expect(page.locator('.cook__stage')).toContainText('mélanger les ingrédients de la sauce')
  await expect(page.locator('.cook__stage')).not.toContainText('Cuire au four')
})
