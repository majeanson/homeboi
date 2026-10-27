import { test, expect, type Page, type Route } from '@playwright/test'
import { mockApi, seedState } from './mocks'
import { boxOf } from './measure'

// Real-flow coverage for « Importer un lien » (RecipeForm.runImport) — the path Marc
// reported on 2026-10-27: « les étapes arrêtent avant la fin et parfois ça rajoute des
// étapes pour chaque phrase ». The server's fidelity is pinned by unit tests + real-site
// fixtures (functions/_lib/recipeImport.fixtures.test.ts); THIS spec pins the client:
//   1. a site-data read (structuring 'jsonld') lands EVERY step — 34 + a heading — and
//      says how it was read, with no AI in the loop;
//   2. an AI-organised read (structuring 'ai') opens the verify panel beside the page
//      text, and « Guider l'IA » re-runs it with the cook's hint;
//   3. at 390 px the hint field and its buttons fit (no horizontal overflow).

const json = (body: unknown) => ({ contentType: 'application/json', body: JSON.stringify(body) })

const SITE_STEPS = [
  ...Array.from({ length: 20 }, (_, i) => `Geste de la pâte numéro ${i + 1}, fait avec soin.`),
  '## Sauce',
  ...Array.from({ length: 13 }, (_, i) => `Geste de la sauce numéro ${i + 1}, fait avec soin.`),
  'Conserver au réfrigérateur 3 jours.',
]
const SITE_DRAFT = {
  title: 'Lasagne du dimanche',
  ingredients: ['500 g de pâtes', '700 ml de sauce tomate'],
  steps: SITE_STEPS,
  servings: 8,
  servingsUnit: null,
  times: { prep: 30, cook: 60, total: null },
  image: null,
  source: 'https://www.example.test/lasagne',
  lang: 'fr',
  structuring: 'jsonld',
}

const TRANSCRIPT =
  'Pouding chômeur\n\nIngrédients\n500 ml de cassonade\n500 ml d’eau\n\nPréparation\nPréchauffer le four à 180 °C.\nCuire 40 minutes.'
const AI_DRAFT = {
  title: 'Pouding chômeur',
  ingredients: ['500 ml de cassonade', '500 ml d’eau'],
  steps: ['Préchauffer le four à 180 °C.', 'Cuire 45 minutes.'],
  servings: null,
  servingsUnit: null,
  times: { prep: null, cook: null, total: null },
  image: null,
  source: 'https://www.example.test/pouding',
  lang: 'fr',
  structuring: 'ai',
  model: '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
  // « 45 » is not in the page text — the panel must flag it.
  suspect: ['Cuire 45 minutes.'],
  transcript: TRANSCRIPT,
}

async function openImport(page: Page, width: number) {
  await page.setViewportSize({ width, height: 1000 })
  await mockApi(page)
  await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile' })
  await page.goto('/kitchen/recipe/new')
  await expect(page.locator('.recipe-title-input')).toBeVisible({ timeout: 15_000 })
  await page.getByRole('button', { name: 'Remplir vite' }).click()
  await page.getByRole('button', { name: 'Importer un lien' }).click()
  await page.locator('input[inputmode="url"]').fill('https://www.example.test/recette')
}

test('link import, site data: every step lands — the heading and the last fridge step too', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await openImport(page, 430)
  // Registered after mockApi → takes precedence.
  await page.route('**/api/recipe-import', (r) => r.fulfill(json(SITE_DRAFT)))

  await page.getByRole('button', { name: 'Importer', exact: true }).click()

  await expect(page.getByTestId('import-via')).toHaveText('Lu dans les données du site — sans IA.')
  const steps = page.locator('.recipe-steps')
  await expect(steps.locator('.recipe-step')).toHaveCount(34)
  await expect(steps.locator('.recipe-line--sec')).toHaveCount(1)
  await expect(steps.locator('.recipe-step').last()).toContainText('Conserver au réfrigérateur 3 jours.')
  // No verify panel: the site delimited the steps itself, nothing was organised by a model.
  await expect(page.locator('.read-review')).toHaveCount(0)
  expect(errors, 'pageerror during link import').toEqual([])
})

test('re-running « Remplir vite » replaces its own previous result, never a line the cook edited', async ({ page }) => {
  // Marc, 2026-10-27: a first import landed junk tail steps; he trimmed the paste and
  // re-ran — nothing changed, because applyDraft only ever filled BLANK rows.
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await openImport(page, 430)
  let run = 0
  await page.route('**/api/recipe-import', (r) => {
    run++
    const second = { ...SITE_DRAFT, title: 'Lasagne du lundi', steps: ['Cuire les pâtes.', 'Assembler.', 'Gratiner 20 minutes.'], servings: 6 }
    return r.fulfill(json(run === 1 ? SITE_DRAFT : second))
  })

  await page.getByRole('button', { name: 'Importer', exact: true }).click()
  await expect(page.locator('.recipe-steps .recipe-step')).toHaveCount(34)
  await expect(page.locator('.recipe-title-input')).toHaveValue('Lasagne du dimanche')

  // The cook edits the title by hand, then re-runs the import.
  await page.locator('.recipe-title-input').fill('Lasagne de maman')
  await page.getByRole('button', { name: 'Importer un lien' }).click()
  await page.getByRole('button', { name: 'Importer', exact: true }).click()

  // Steps + servings (untouched since the first import) follow the new read; the
  // edited title stays the cook's.
  await expect(page.locator('.recipe-steps .recipe-step')).toHaveCount(3)
  await expect(page.locator('.recipe-steps .recipe-step').last()).toContainText('Gratiner 20 minutes.')
  await expect(page.locator('.recipe-title-input')).toHaveValue('Lasagne de maman')
  expect(errors, 'pageerror during re-import').toEqual([])
})

test('link import, AI-organised: verify beside the page text, guide the AI, confirm', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await openImport(page, 430)
  const bodies: Record<string, unknown>[] = []
  await page.route('**/api/recipe-import', async (r: Route) => {
    const body = (r.request().postDataJSON() ?? {}) as Record<string, unknown>
    bodies.push(body)
    // The retry, guided by the hint, comes back with the number the page printed.
    const retry = typeof body.hint === 'string' && body.hint.length > 0
    await r.fulfill(json(retry ? { ...AI_DRAFT, steps: ['Préchauffer le four à 180 °C.', 'Cuire 40 minutes.'], suspect: [] } : AI_DRAFT))
  })

  await page.getByRole('button', { name: 'Importer', exact: true }).click()

  const modal = page.locator('.read-review')
  await expect(modal).toBeVisible({ timeout: 15_000 })
  // The source is the page text, not a photo — and the changed number is flagged.
  await expect(modal.locator('.read-review__source')).toContainText('Cuire 40 minutes.')
  await expect(modal.locator('.read-review__photo img')).toHaveCount(0)
  await expect(modal.locator('.read-review__line.is-flagged')).toHaveCount(1)

  // « Guider l'IA » → a hint → « Réessayer »: the request carries it, the panel refreshes.
  await modal.getByRole('button', { name: 'Guider l’IA (facultatif)' }).click()
  const hintField = modal.locator('.read-review__guide input')
  await hintField.fill('garde les étapes telles quelles')
  await modal.getByRole('button', { name: 'Réessayer' }).click()
  await expect.poll(() => bodies.length).toBe(2)
  expect(bodies[1].hint).toBe('garde les étapes telles quelles')
  expect(bodies[1].url).toBe('https://www.example.test/recette')
  await expect(modal.locator('.read-review__line.is-flagged')).toHaveCount(0)

  // Confirm → the checked read lands, and the form says how it was read.
  await modal.locator('.read-review__foot .btn--primary').click()
  await expect(modal).toBeHidden()
  await expect(page.locator('.recipe-title-input')).toHaveValue('Pouding chômeur')
  await expect(page.locator('.recipe-steps .recipe-step')).toHaveCount(2)
  await expect(page.locator('.recipe-steps .recipe-step').last()).toContainText('Cuire 40 minutes.')
  await expect(page.getByTestId('import-via')).toHaveText('Organisé par l’IA — vérifié.')
  expect(errors, 'pageerror during AI link import').toEqual([])
})

test('390 px: the hint field and its buttons fit, in the import panel and in the verify panel', async ({ page }) => {
  await openImport(page, 390)
  await page.route('**/api/recipe-import', (r) => r.fulfill(json(AI_DRAFT)))

  const panel = page.locator('.recipe-import')
  await panel.getByRole('button', { name: 'Guider l’IA (facultatif)' }).click()
  const hint = panel.locator('.recipe-import__hint input')
  await expect(hint).toBeVisible()
  for (const l of [hint, panel.getByRole('button', { name: 'Importer', exact: true })]) {
    const b = await boxOf(l)
    expect(b.x).toBeGreaterThanOrEqual(0)
    expect(b.x + b.width).toBeLessThanOrEqual(390)
  }

  await panel.getByRole('button', { name: 'Importer', exact: true }).click()
  const modal = page.locator('.read-review')
  await expect(modal).toBeVisible({ timeout: 15_000 })
  await modal.getByRole('button', { name: 'Guider l’IA (facultatif)' }).click()
  for (const l of [modal.locator('.read-review__guide input'), modal.getByRole('button', { name: 'Réessayer' })]) {
    const b = await boxOf(l)
    expect(b.x).toBeGreaterThanOrEqual(0)
    expect(b.x + b.width).toBeLessThanOrEqual(390)
  }
})
