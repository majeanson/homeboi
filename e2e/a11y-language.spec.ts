import { test, expect } from './fixtures'
import { RECIPES } from './mocks'

// Review #35 (2026-11-18; Sam, screen reader), each change approved by Marc:
//   · the page said lang="fr" (a France voice) and never marked an English recipe;
//   · repeated buttons said the same thing (« J'aime » on every heart, three « Écouter :
//     1/2 tasse »), and who added a list item was a colour.

test('the page is fr-CA, or en-CA from the first load of an English household', async ({ app, page }) => {
  await app.boot({ route: '/board', wait: '.board-band', clock: 'BASE' })
  await expect(page.locator('html')).toHaveAttribute('lang', 'fr-CA')
  await app.boot({ route: '/board', wait: '.board-band', clock: 'BASE', state: { lang: 'en' } })
  await expect(page.locator('html')).toHaveAttribute('lang', 'en-CA')
})

test('an English recipe in a French app carries lang="en"; its pills name the ingredient', async ({ app, page }) => {
  const recipes = { ...RECIPES, recipes: RECIPES.recipes.map((r) => (r.id === 'rc1' ? { ...r, lang: 'en' as const } : r)) }
  await app.boot({ route: '/kitchen/recipe/rc1', wait: '.recipe-modal', clock: 'BASE', api: { overrides: { recipes } } })
  await expect(page.locator('.recipe-modal')).toHaveAttribute('lang', 'en')
  await expect(page.getByRole('button', { name: /^Écouter : 1 c\. à thé — sel$/ })).toBeVisible()
})

test('a heart names its recipe, and a list row names who added it', async ({ app, page }) => {
  // The heart is a toggle only once a face is picked (as Maisonnée, hearts are read-only).
  await page.addInitScript(() => localStorage.setItem('babillard-profile', 'm1'))
  await app.boot({ route: '/kitchen?tab=recipes', wait: '.recipe-card', clock: 'BASE' })
  await expect(page.getByRole('button', { name: /— Spaghetti maison$/ }).first()).toHaveAttribute('aria-pressed', /true|false/)

  await page.goto('/liste')
  await expect(page.locator('.list-row', { hasText: 'Lait' }).first().locator('.sr-only', { hasText: 'ajouté par' })).toHaveText(', ajouté par Maman')
})
