import { test, expect, type Page, type Route } from '@playwright/test'
import { mockApi, seedState, BASE, MMID } from './mocks'
import { boxOf, settled } from './measure'
import { openKitEntry } from './kit'

// JOURNEY — RECIPES (review #43; was recipe-url-import.spec.ts + recipe-ingredient-pick.spec.ts + recipe-leftovers.spec.ts + recipe-original-lazy.spec.ts + recipe-photo-import.spec.ts + recipe-read-review.spec.ts + recipe-tag-slots.spec.ts + recipe-versions.spec.ts + recipes-lean-header.spec.ts).
//
// Real-flow coverage for « Importer un lien » (RecipeForm.runImport) — the path Marc
// reported on 2026-10-27: « les étapes arrêtent avant la fin et parfois ça rajoute des
// étapes pour chaque phrase ». The server's fidelity is pinned by unit tests + real-site
// fixtures (functions/_lib/recipeImport.fixtures.test.ts); THIS spec pins the client:
//   1. a site-data read (structuring 'jsonld') lands EVERY step — 34 + a heading — and
//      says how it was read, with no AI in the loop;
//   2. an AI-organised read (structuring 'ai') opens the verify panel beside the page
//      text, and « Guider l'IA » re-runs it with the cook's hint;
//   3. at 390 px the hint field and its buttons fit (no horizontal overflow).

test.describe('recipe-url-import', () => {
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
    // The page's own « Notes » block, word for word (2026-10-27: it used to be dropped).
    notes: 'Meilleure le lendemain.',
  }

  // The source as the selection model saw it: NUMBERED (the panel shows it beside the lines).
  const TRANSCRIPT =
    '0: Pouding chômeur\n1: Ingrédients\n2: 500 ml de cassonade\n3: 500 ml d’eau\n4: Préparation\n5: Préchauffer le four à 180 °C.\n6: Cuire 40 minutes.'
  // The model CHOSE the lines (it writes none): here it left the last step out, and the
  // audit says the page has more — the panel must say so. Every line is the source's.
  const AI_DRAFT = {
    title: 'Pouding chômeur',
    ingredients: ['500 ml de cassonade', '500 ml d’eau'],
    steps: ['Préchauffer le four à 180 °C.'],
    servings: null,
    servingsUnit: null,
    times: { prep: null, cook: null, total: null },
    image: null,
    source: 'https://www.example.test/pouding',
    lang: 'fr',
    structuring: 'ai',
    model: '@cf/meta/llama-3.3-70b-instruct-fp8-fast · sélection',
    audit: [{ kind: 'step-count', line: '1/2' }],
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
    await expect(page.locator('textarea[placeholder]').last()).toHaveValue('Meilleure le lendemain.')
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
      // The retry, guided by the hint, comes back with every step the page printed.
      const retry = typeof body.hint === 'string' && body.hint.length > 0
      await r.fulfill(json(retry ? { ...AI_DRAFT, steps: ['Préchauffer le four à 180 °C.', 'Cuire 40 minutes.'], audit: [] } : AI_DRAFT))
    })

    await page.getByRole('button', { name: 'Importer', exact: true }).click()

    const modal = page.locator('.read-review')
    await expect(modal).toBeVisible({ timeout: 15_000 })
    // The source is the page text, numbered as the model saw it, not a photo — and the
    // audit says the read is short of the page.
    await expect(modal.locator('.read-review__source')).toContainText('6: Cuire 40 minutes.')
    await expect(modal.locator('.read-review__photo img')).toHaveCount(0)
    await expect(modal.getByTestId('read-review-audit')).toContainText('La page compte plus d’étapes (1/2).')

    // « Guider l'IA » → a hint → « Réessayer »: the request carries it, the panel refreshes.
    await modal.getByRole('button', { name: 'Guider l’IA (facultatif)' }).click()
    const hintField = modal.locator('.read-review__guide input')
    await hintField.fill('garde les étapes telles quelles')
    await modal.getByRole('button', { name: 'Réessayer' }).click()
    await expect.poll(() => bodies.length).toBe(2)
    expect(bodies[1]?.hint).toBe('garde les étapes telles quelles')
    expect(bodies[1]?.url).toBe('https://www.example.test/recette')
    await expect(modal.getByTestId('read-review-audit')).toHaveCount(0)

    // Confirm → the checked read lands, and the form says how it was read.
    await modal.locator('.read-review__foot .btn--primary').click()
    await expect(modal).toBeHidden()
    await expect(page.locator('.recipe-title-input')).toHaveValue('Pouding chômeur')
    await expect(page.locator('.recipe-steps .recipe-step')).toHaveCount(2)
    await expect(page.locator('.recipe-steps .recipe-step').last()).toContainText('Cuire 40 minutes.')
    await expect(page.getByTestId('import-via')).toHaveText('Organisé par l’IA — vérifié.')
    expect(errors, 'pageerror during AI link import').toEqual([])
  })

  test('a site-data read the audit flagged waits in the verify panel; confirmed, it says « site »', async ({ page }) => {
    await openImport(page, 430)
    await page.route('**/api/recipe-import', (r) =>
      r.fulfill(
        json({
          ...SITE_DRAFT,
          steps: ['Napper de 125 ml de crème et servir.'],
          audit: [{ kind: 'missing-ingredient', line: '125 ml de crème' }],
          transcript: 'Lasagne du dimanche\nIngrédients\n500 g de pâtes\nPréparation\nNapper de 125 ml de crème et servir.',
        }),
      ),
    )
    await page.getByRole('button', { name: 'Importer', exact: true }).click()
    const modal = page.locator('.read-review')
    await expect(modal).toBeVisible({ timeout: 15_000 })
    await expect(modal.getByTestId('read-review-audit')).toContainText('« 125 ml de crème » est dans les étapes, pas dans les ingrédients.')
    await expect(modal.locator('.read-review__line.is-flagged')).toHaveCount(1)
    await modal.locator('.read-review__foot .btn--primary').click()
    await expect(modal).toBeHidden()
    await expect(page.getByTestId('import-via')).toHaveText('Lu dans les données du site — sans IA.')
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

  // ---- The doors (2026-10-27): a link shared to Babillard, the bookmark's captured page,
  // a blocked site, a page already in the book. The server's side is unit-tested
  // (recipeImportPage.test.ts, recipeBookmarklet.test.ts); this pins what the cook sees.

  // The import mock is registered AFTER mockApi (the later route wins) and BEFORE the
  // scene opens (it imports on mount).
  async function openScene(page: Page, path: string, handler: (r: Route) => unknown) {
    await page.setViewportSize({ width: 430, height: 1000 })
    await mockApi(page)
    await page.route('**/api/recipe-import', handler)
    await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile' })
    await page.goto(path)
    await expect(page.locator('.recipe-title-input')).toBeVisible({ timeout: 15_000 })
  }

  test('?import=<url> runs the link import on open, then leaves the address clean', async ({ page }) => {
    const bodies: unknown[] = []
    await openScene(page, `/kitchen/recipe/new?import=${encodeURIComponent('https://www.example.test/lasagne')}`, (r) => {
      bodies.push(r.request().postDataJSON())
      return r.fulfill(json({ ...SITE_DRAFT, fetched: 'direct' }))
    })
    await expect(page.locator('.recipe-title-input')).toHaveValue('Lasagne du dimanche')
    expect(bodies).toEqual([{ url: 'https://www.example.test/lasagne' }])
    await expect.poll(() => new URL(page.url()).search).toBe('')
  })

  test('#import=<page> (the bookmark) posts the captured page, says so, and the steps land', async ({ page }) => {
    const captured = {
      v: 1,
      url: 'https://www.recettes.qc.ca/recettes/recette/chili-con-carne-167900',
      title: 'Chili con carne',
      image: '',
      jsonld: ['{"@type":"Recipe","name":"Chili con carne"}'],
      text: 'Chili con carne',
    }
    const hash = Buffer.from(JSON.stringify(captured), 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    const bodies: { page?: unknown }[] = []
    await openScene(page, `/kitchen/recipe/new#import=${hash}`, (r) => {
      bodies.push(r.request().postDataJSON())
      return r.fulfill(json({ ...SITE_DRAFT, title: 'Chili con carne', source: captured.url, fetched: 'bookmarklet' }))
    })
    await expect(page.locator('.recipe-title-input')).toHaveValue('Chili con carne')
    expect(bodies[0]?.page).toEqual(captured)
    await expect(page.getByTestId('import-via')).toHaveText('Lu dans les données du site — sans IA. Page envoyée par ton signet.')
    await expect(page.locator('.recipe-steps .recipe-step')).toHaveCount(34)
    await expect.poll(() => new URL(page.url()).hash).toBe('')
  })

  test('a blocked site points at the bookmark’s setup', async ({ page }) => {
    await openScene(page, `/kitchen/recipe/new?import=${encodeURIComponent('https://www.zeste.ca/recettes/boulettes-italiennes')}`, (r) =>
      r.fulfill(json({ ...SITE_DRAFT, title: null, ingredients: [], steps: [], empty: true, reason: 'blocked' })),
    )
    const msg = page.getByTestId('import-msg')
    await expect(msg).toContainText('Ce site bloque l’importation.')
    await expect(msg.getByRole('link', { name: 'Ou installe le signet « Envoyer à Babillard ».' })).toHaveAttribute(
      'href',
      '/settings?focus=recipeBookmarklet',
    )
    // The way round the wall, right here: the bookmark's how-to (open by default) with
    // its copy button and the read-only address — no trip to Réglages needed.
    const howto = page.getByTestId('bookmarklet-howto')
    await expect(howto).toBeVisible()
    await expect(howto.getByRole('button', { name: 'Copier le signet' })).toBeVisible()
    await expect(howto.getByLabel('Adresse du signet')).toHaveValue(/^javascript:/)
    await expect(howto.getByRole('listitem')).toHaveCount(3) // desktop wording: copy + 2 steps
  })

  test('a page already in the book: one calm line with « Ouvrir », the import still lands', async ({ page }) => {
    await openImport(page, 430)
    await page.route('**/api/recipe-import', (r) => r.fulfill(json({ ...SITE_DRAFT, source: 'https://www.exemple.ca/tacos/?utm_source=x' })))
    await page.getByRole('button', { name: 'Importer', exact: true }).click()
    await expect(page.locator('.recipe-title-input')).toHaveValue('Lasagne du dimanche')
    const dup = page.getByTestId('import-duplicate')
    await expect(dup).toContainText('Déjà dans le livre : Tacos au poulet')
    await expect(dup.getByRole('link', { name: 'Ouvrir' })).toHaveAttribute('href', '/kitchen/recipe/rc2')
  })

  // ---- C3 + C4 (2026-10-27): the site's step photos land on their steps (and a cancelled
  // form frees them); a page with several recipes offers them as chips.

  test('the site’s step photos land with the steps; cancelling frees them', async ({ page }) => {
    await openImport(page, 430)
    await page.route('**/api/recipe-import', (r) =>
      r.fulfill(json({ ...SITE_DRAFT, steps: ['Mélanger.', 'Cuire.'], stepImages: ['rsi_aaaaaaaa', ''] })),
    )
    await page.getByRole('button', { name: 'Importer', exact: true }).click()
    await expect(page.locator('.recipe-steps .recipe-step')).toHaveCount(2)
    await expect(page.locator('.recipe-steps img[src*="rsi_aaaaaaaa"]')).toHaveCount(1)
    const freed: unknown[] = []
    await page.route('**/api/recipe-step-image', (r) => {
      if (r.request().method() === 'DELETE') freed.push(r.request().postDataJSON())
      return r.fulfill(json({ freed: 1 }))
    })
    await page.locator('.recipe-modal__foot .btn--ghost').first().click()
    await expect.poll(() => freed).toEqual([{ keys: ['rsi_aaaaaaaa'] }])
  })

  test('a page with several recipes: chips name them, a tap reads the other one', async ({ page }) => {
    await openImport(page, 430)
    const picks: unknown[] = []
    await page.route('**/api/recipe-import', (r) => {
      const body = r.request().postDataJSON() as { pick?: number }
      picks.push(body.pick ?? 0)
      const candidates = [{ i: 0, title: 'Pâte à crêpes' }, { i: 1, title: 'Sauce au caramel' }]
      return r.fulfill(json({ ...SITE_DRAFT, title: body.pick === 1 ? 'Sauce au caramel' : 'Pâte à crêpes', candidates }))
    })
    await page.getByRole('button', { name: 'Importer', exact: true }).click()
    await expect(page.locator('.recipe-title-input')).toHaveValue('Pâte à crêpes')
    await expect(page.getByText('Cette page a 2 recettes :')).toBeVisible()
    await page.getByRole('button', { name: 'Sauce au caramel' }).click()
    await expect(page.locator('.recipe-title-input')).toHaveValue('Sauce au caramel')
    expect(picks).toEqual([0, 1])
  })

  test('the bookmark lands in a browser with no session (iPhone: Safari ≠ the home-screen app): sign in once, the capture follows', async ({ page }) => {
    // Prod, 2026-10-27: signed in on the home-screen app, the bookmark ran in Safari, whose
    // cookie jar had never signed in — a 403 (no CSRF cookie) read as « Rien trouvé ».
    const captured = { v: 1, url: 'https://www.recettes.qc.ca/recettes/recette/chili-con-carne-167900', title: 'Chili con carne', image: '', jsonld: [], text: 'Ingrédients\n1 kg viande hachée\nPréparation\nCuire.' }
    const hash = Buffer.from(JSON.stringify(captured), 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    await page.setViewportSize({ width: 430, height: 1000 })
    await mockApi(page)
    let calls = 0
    await page.route('**/api/recipe-import', (r) => {
      calls++
      // No session in THIS browser: the Worker's CSRF gate answers first.
      if (calls === 1) return r.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ error: 'Bad or missing CSRF token.' }) })
      return r.fulfill(json({ ...SITE_DRAFT, title: 'Chili con carne', source: captured.url, fetched: 'bookmarklet' }))
    })
    await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile' })
    await page.goto(`/kitchen/recipe/new#import=${hash}`)

    // Parked, and sent to sign in — with the reason on the login page, nothing lost.
    await expect(page).toHaveURL(/\/login\?next=%2Fkitchen%2Frecipe%2Fnew$/, { timeout: 15_000 })
    await expect(page.locator('.auth__hint').first()).toContainText('signet')
    expect(await page.evaluate(() => sessionStorage.getItem('babillard-pending-import'))).not.toBeNull()

    await page.locator('input[type="email"]').fill('marc@example.test')
    await page.locator('input[type="password"]').fill('x')
    await page.getByRole('button', { name: 'Entrer' }).click()

    // Back on the form: the parked capture runs by itself and lands.
    await expect(page.locator('.recipe-title-input')).toHaveValue('Chili con carne', { timeout: 15_000 })
    await expect(page.getByTestId('import-via')).toContainText('Page envoyée par ton signet.')
    expect(calls).toBe(2)
    expect(await page.evaluate(() => sessionStorage.getItem('babillard-pending-import'))).toBeNull()
  })

  test('saving a NEW recipe already in the book asks: « Remplacer » overwrites in place, « Garder les deux » creates the copy', async ({ page }) => {
    // Marc, 2026-10-27: the same chili landed twice. By link OR by name.
    await openImport(page, 430)
    await page.route('**/api/recipe-import', (r) => r.fulfill(json({ ...SITE_DRAFT, source: 'https://www.exemple.ca/tacos/?utm_source=x' })))
    const writes: { method: string; body: Record<string, unknown> }[] = []
    await page.route('**/api/recipes', (r) => {
      if (r.request().method() === 'GET') return r.fallback()
      writes.push({ method: r.request().method(), body: r.request().postDataJSON() as Record<string, unknown> })
      return r.fulfill(json({ ok: true, id: 'rc2' }))
    })
    await page.getByRole('button', { name: 'Importer', exact: true }).click()
    await expect(page.locator('.recipe-title-input')).toHaveValue('Lasagne du dimanche')

    // Same LINK as « Tacos au poulet » (rc2) → the question, then « Remplacer » = a PATCH on rc2.
    await page.getByRole('button', { name: 'Enregistrer la recette' }).click()
    const dialog = page.locator('.confirm')
    await expect(dialog).toContainText('Remplacer « Tacos au poulet », déjà dans le livre ?')
    await dialog.getByRole('button', { name: 'Remplacer' }).click()
    await expect.poll(() => writes.length).toBe(1)
    expect(writes[0]?.method).toBe('PATCH')
    expect(writes[0]?.body.id).toBe('rc2')
    expect(writes[0]?.body.title).toBe('Lasagne du dimanche')

    // Same NAME, no link: « Garder les deux » = a POST, a deliberate copy.
    await page.goto('/kitchen/recipe/new')
    await expect(page.locator('.recipe-title-input')).toBeVisible({ timeout: 15_000 })
    await page.locator('.recipe-title-input').fill('tacos au POULET')
    await page.getByRole('button', { name: 'Enregistrer la recette' }).click()
    await expect(page.locator('.confirm')).toContainText('Remplacer « Tacos au poulet »')
    await page.locator('.confirm').getByRole('button', { name: 'Garder les deux' }).click()
    await expect.poll(() => writes.length).toBe(2)
    expect(writes[1]?.method).toBe('POST')
    expect(writes[1]!.body.id).toBeUndefined()
  })

  // ---- Progress you can SEE (Marc, 2026-10-27: « so the user doesn't feel like it's
  // stuck »). The import is ONE request that can run 45 s; the button used to say
  // « Importation… » and nothing else moved. Every import in flight now shows the same
  // strip as the photo read and ONE stage line, named after what is happening now.
  const held = () => {
    let release!: () => void
    const gate = new Promise<void>((r) => (release = r))
    return { gate, release }
  }

  test('a link import in flight: the strip, and a stage line that moves on with the time spent', async ({ page }) => {
    await openImport(page, 390)
    const h = held()
    await page.route('**/api/recipe-import', async (r) => {
      await h.gate
      await r.fulfill(json(SITE_DRAFT))
    })
    await page.getByRole('button', { name: 'Importer', exact: true }).click()
    const progress = page.getByTestId('import-progress')
    await expect(progress).toBeInViewport()
    await expect(progress.locator('.recipe-read-bar--sweep')).toBeVisible()
    await expect(progress).toHaveText('Je vais chercher la page…')
    // 4 s in, the page has (honestly) been fetched or is being read.
    await expect(progress).toHaveText('Je lis la recette…', { timeout: 8_000 })
    h.release()
    await expect(page.getByTestId('import-via')).toBeVisible()
    await expect(progress).toHaveCount(0)
  })

  test('a paste in flight says it is organising the text', async ({ page }) => {
    await openImport(page, 390)
    await page.locator('input[inputmode="url"]').fill('')
    await page.locator('.recipe-import__paste').fill('Pouding chômeur\n500 ml de cassonade\nCuire 40 minutes.')
    const h = held()
    await page.route('**/api/recipe-import', async (r) => {
      await h.gate
      await r.fulfill(json(SITE_DRAFT))
    })
    await page.getByRole('button', { name: 'Importer', exact: true }).click()
    await expect(page.getByTestId('import-progress')).toHaveText('J’organise le texte…')
    h.release()
    await expect(page.getByTestId('import-progress')).toHaveCount(0)
  })

  test('the bookmark’s page: the strip is there the moment the scene opens', async ({ page }) => {
    const captured = { v: 1, url: 'https://www.recettes.qc.ca/recettes/recette/chili', title: 'Chili', image: '', jsonld: [], text: 'Chili' }
    const hash = Buffer.from(JSON.stringify(captured), 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    const h = held()
    await openScene(page, `/kitchen/recipe/new#import=${hash}`, async (r) => {
      await h.gate
      await r.fulfill(json({ ...SITE_DRAFT, title: 'Chili', fetched: 'bookmarklet' }))
    })
    const progress = page.getByTestId('import-progress')
    await expect(progress).toBeInViewport()
    await expect(progress).toHaveText('Je lis la page envoyée par ton signet…')
    h.release()
    await expect(page.locator('.recipe-title-input')).toHaveValue('Chili')
    await expect(progress).toHaveCount(0)
  })
})

// ── folded from recipe-ingredient-pick.spec.ts ──────────────────────────────────────────────
test.describe('recipe-ingredient-pick', () => {
  // The shared « quels ingrédients ? » checklist body (`RecipeIngredientPick`), driven
  // off its /dev/kit specimen — the same drill journey-recipes.spec.ts uses to reach
  // a component the product only mounts behind a flow.
  //
  // What it pins is the body's contract, which two callers used to spell separately:
  // section markers are dropped, names dedupe, it opens ALL-UNTICKED (so it reads "pick
  // the few I'm missing", not "untick the many I have"), the CTA is dead until
  // something is ticked, and select-all/none is a real toggle.
  //
  // The commit deliberately is NOT in here: `onConfirm` hands the picked names back and
  // the HOST does the write, because whether an undo is reachable is a property of the
  // surface. `RecipeScene`'s live path (immediate POST + label flip, since the sheet
  // stays painted over the undo toast) is covered by journey-meals.spec.ts › recipes.

  const SPECIMEN = ['500 g de bœuf haché', '1 oignon', '## Sauce', '2 gousses d’ail', '800 ml de tomates', 'Parmesan']
  const NAMES = SPECIMEN.length - 1 // the `## Sauce` heading is not an ingredient

  async function openSpecimen(page: import('@playwright/test').Page) {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await mockApi(page)
    await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'kiosk' })
    await page.goto('/dev/kit')
    const entry = await openKitEntry(page, 'RecipeIngredientPick')
    const pick = entry.locator('.recipe-list-pick')
    await pick.waitFor({ state: 'visible', timeout: 15_000 })
    return pick
  }

  test('it opens all-unticked, with the CTA dead until something is picked', async ({ page }) => {
    const pick = await openSpecimen(page)
    await expect(pick.locator('.recipe-list-pick__items .chip')).toHaveCount(NAMES)
    await expect(pick.locator('.recipe-list-pick__items .chip.is-on')).toHaveCount(0)
    await expect(pick.locator('.recipe-list-pick__actions .btn--primary')).toBeDisabled()

    await pick.locator('.recipe-list-pick__items .chip').first().click()
    await expect(pick.locator('.recipe-list-pick__items .chip.is-on')).toHaveCount(1)
    await expect(pick.locator('.recipe-list-pick__actions .btn--primary')).toBeEnabled()
  })

  test('a `## Titre` section marker is not offered as an ingredient', async ({ page }) => {
    // Every iterator over the flat ingredients array must skip headings (the recipe
    // -sections convention). Offering « Sauce » as a grocery item is the failure.
    const pick = await openSpecimen(page)
    await expect(pick.locator('.recipe-list-pick__items')).not.toContainText('Sauce')
    await expect(pick.locator('.recipe-list-pick__items')).toContainText('Parmesan')
  })

  test('select-all is a toggle, not a one-way tick', async ({ page }) => {
    const pick = await openSpecimen(page)
    const all = pick.locator('.recipe-list-pick__all')
    await all.click()
    await expect(pick.locator('.recipe-list-pick__items .chip.is-on')).toHaveCount(NAMES)
    await all.click()
    await expect(pick.locator('.recipe-list-pick__items .chip.is-on')).toHaveCount(0)
    await expect(pick.locator('.recipe-list-pick__actions .btn--primary')).toBeDisabled()
  })
})


// ── folded from recipe-leftovers.spec.ts ──────────────────────────────────────────────
test.describe('recipe-leftovers', () => {
  // bmad/11 tier-2 #10: leftovers were unpostable from a recipe-backed meal. Tapping a
  // planned dish ROUTES to /kitchen/recipe/:id, and that scene was the one surface with
  // no door onto the Restants pool — you finished supper, tapped the dish, and had to
  // walk back out to La cuisine to say there were leftovers.
  //
  // The door is « Il en reste ? » in the scene's ⋯ overflow (the same action the day
  // editor and the board peek already offer, through the same shared hook).
  test('a recipe posts its leftovers without leaving the scene', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    const posted: Record<string, unknown>[] = []
    await mockApi(page)
    await page.route('**/api/meal-leftovers**', async (route) => {
      if (route.request().method() === 'POST') {
        posted.push(route.request().postDataJSON())
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, id: 'lo-new' }) })
      }
      return route.fallback()
    })
    await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile' })
    await page.goto('/kitchen')
    await expect(page.locator('.kitchen')).toBeVisible({ timeout: 15_000 })

    await page.locator('.subtabs__opt').nth(2).click() // Recettes
    await page.locator('.recipe-card').first().click()
    await expect(page.locator('.recipe-modal')).toBeVisible()

    const overflow = page.locator('.recipe-modal .action-menu__btn')
    await overflow.click()
    const announce = page.getByRole('menuitem', { name: 'Il en reste ?' })
    await expect(announce).toBeVisible()
    await announce.click()

    // It carries the recipe link, so the pool row can open the recipe it came from.
    await expect.poll(() => posted.length).toBe(1)
    expect(posted[0]?.title).toBeTruthy()
    expect(posted[0]?.recipeId).toBeTruthy()
    // No meal behind a recipe opened straight from the book.
    expect(posted[0]!.sourceMealId).toBeNull()

    // NO undo toast from here, and that is deliberate, not an omission: .recipe-modal
    // is z-index 80 and .undo-toast is 40, so an « Annuler » offered from inside this
    // scene is painted UNDERNEATH it — the exact bug cook mode shipped and fixed on
    // 2026-08-27. If a later change re-adds one, this assertion is the alarm.
    await expect(page.locator('.undo-toast')).toBeHidden()

    // The label flip is the confirmation instead, and a second tap can't double-post.
    await overflow.click()
    await expect(page.getByRole('menuitem', { name: 'Dans les restants' })).toBeVisible()
    await expect(page.getByRole('menuitem', { name: 'Dans les restants' })).toBeDisabled()
    expect(posted).toHaveLength(1)
  })

  // Audit 2026-11-15 (« Restants »). The board's meal peek offers « Créer des restants »
  // through the same shared hook — but its four doors handed it `{ id, title }` alone, so
  // the pool row lost the recipe the peek itself had just resolved (« Spaghetti maison »
  // → rc1, by title, in the fixture): no 📖 on the row, a bare title once planned.
  test('the board peek’s « Créer des restants » keeps the recipe the peek resolved', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    const posted: Record<string, unknown>[] = []
    await mockApi(page)
    await page.route('**/api/meal-leftovers**', async (route) => {
      if (route.request().method() === 'POST') {
        posted.push(route.request().postDataJSON())
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, id: 'lo-new' }) })
      }
      return route.fallback()
    })
    await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile' })
    await page.goto('/board')
    await expect(page.locator('.board-wall')).toBeVisible({ timeout: 15_000 })

    await page.locator('.now-card__meal').filter({ hasText: 'Spaghetti maison' }).first().click()
    const sheet = page.locator('.detail-sheet')
    await sheet.waitFor({ state: 'visible', timeout: 10_000 })
    // A recipe-linked peek folds the plan tail into its ⋯ (the menu portals to <body>).
    await sheet.locator('.action-menu__btn').click()
    await page.getByRole('menuitem', { name: 'Créer des restants' }).click()

    await expect.poll(() => posted.length).toBe(1)
    expect(posted[0]).toMatchObject({ title: 'Spaghetti maison', recipeId: 'rc1', sourceMealId: 'meal1' })
  })

  // Same audit: planning a pool leftover the server REFUSES still offered « Annuler », and
  // that undo re-POSTs the pool row — so one tap put the (never-consumed) leftover in
  // Restants twice. A refused plan says « Pas enregistré » and offers nothing to undo.
  // (Worse: that undo toast took the bar over the failure notice, so the screen said
  // « planifié » about a plan that never happened.)
  test('a refused leftover plan offers no « Annuler » (it would duplicate the row)', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await mockApi(page)
    const posts: Record<string, unknown>[] = []
    await page.route('**/api/meal-leftovers**', async (route) => {
      const req = route.request()
      if (req.method() === 'POST') {
        posts.push(req.postDataJSON())
        return route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'Erreur serveur' }) })
      }
      if (req.method() === 'GET')
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ leftovers: [{ id: 'lo1', title: 'Pâté chinois', recipe_id: null, source_meal_id: null, created_at: 0 }] }),
        })
      return route.fallback()
    })
    await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile' })
    await page.goto('/kitchen')
    await expect(page.locator('.kitchen__day').first()).toBeVisible({ timeout: 15_000 })

    const row = page.locator('.kitchen__ideas .kitchen__idea', { hasText: 'Pâté chinois' })
    await row.scrollIntoViewIfNeeded()
    await row.getByRole('button', { name: /Pâté chinois/ }).click()
    // Leftovers have no « À placer » chip (no onPark), so the first chip is a real day.
    await row.locator('.meal-plan-pick__days button').first().click()

    await expect(page.getByText('Pas enregistré — réessaie.')).toBeVisible()
    expect(posts).toHaveLength(1)
    expect(posts[0]).toMatchObject({ action: 'plan', id: 'lo1' })
    // The notice rides the same bar as an undo; what must be absent is the undo itself.
    await expect(page.getByText(/« Pâté chinois » planifié/)).toHaveCount(0)
    await expect(page.locator('.undo-toast__btn')).toHaveCount(0)
  })

  // Audit follow-up (2026-11-15): a leftover planned OFFLINE is only queued, so the
  // client never heard the new meal's id — its « Annuler » re-added the leftover and
  // left the meal planned (the same dish twice: once in Restants, once on the day). The
  // client mints the meal id now, so the queued undo deletes exactly the meal the queued
  // plan creates, and the outbox replays them in that order.
  test('« Annuler » on a leftover planned offline removes the meal it planned', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await mockApi(page)
    const sent: { method: string; path: string; body: Record<string, unknown> }[] = []
    await page.route('**/api/meal-leftovers**', async (route) => {
      const req = route.request()
      if (req.method() === 'GET')
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ leftovers: [{ id: 'lo1', title: 'Pâté chinois', recipe_id: null, source_meal_id: null, created_at: 0 }] }),
        })
      const body = req.postDataJSON() as Record<string, unknown>
      sent.push({ method: req.method(), path: 'meal-leftovers', body })
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(body.action === 'plan' ? { ok: true, planned: true, mealId: body.mealId, title: 'Pâté chinois' } : { ok: true, id: 'lo2' }),
      })
    })
    await page.route('**/api/meals', async (route) => {
      const req = route.request()
      if (req.method() !== 'DELETE') return route.fallback()
      sent.push({ method: 'DELETE', path: 'meals', body: req.postDataJSON() as Record<string, unknown> })
      return route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' })
    })
    await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile' })
    await page.goto('/kitchen')
    await expect(page.locator('.kitchen__day').first()).toBeVisible({ timeout: 15_000 })

    const row = page.locator('.kitchen__ideas .kitchen__idea', { hasText: 'Pâté chinois' })
    await row.scrollIntoViewIfNeeded()
    await page.context().setOffline(true)
    await expect(page.locator('.offline-bar')).toBeVisible()
    await row.getByRole('button', { name: /Pâté chinois/ }).click()
    await row.locator('.meal-plan-pick__days button').first().click()
    await page.locator('.undo-toast__btn').click()
    expect(sent, 'offline: nothing went over the wire yet').toEqual([])

    await page.context().setOffline(false)
    await expect.poll(() => sent.length, { timeout: 20_000 }).toBe(3)
    const [planned, undone, readded] = sent
    expect(planned).toMatchObject({ path: 'meal-leftovers', body: { action: 'plan', id: 'lo1' } })
    expect(typeof planned!.body.mealId).toBe('string')
    expect(undone, 'the undo deletes the very meal the plan made').toEqual({ method: 'DELETE', path: 'meals', body: { id: planned!.body.mealId } })
    expect(readded).toMatchObject({ path: 'meal-leftovers', body: { title: 'Pâté chinois' } })
  })
})


// ── folded from recipe-original-lazy.spec.ts ──────────────────────────────────────────────
test.describe('recipe-original-lazy', () => {
  // THE LIST PAYLOAD DOES NOT CARRY THE AS-IMPORTED SNAPSHOT (2026-09-15).
  //
  // `/api/recipes` is the app's most shared read: nine `useRecipes()` call sites, it
  // rides `...live` (a re-poll every ~10 s while a kitchen surface is open), it is
  // restored from IndexedDB before first paint, and it replays offline. For most of the
  // app's life it also shipped `original` — whose `ingredients` + `steps` are a full
  // SECOND COPY of the recipe's text — to every one of those surfaces, to serve one
  // toggle in the sheet that most cooks never open. Invisible with three fixture
  // recipes; the cold-boot budget at two hundred.
  //
  // So the snapshot moved to `/api/recipe-original?id=`, fetched on the tap. The
  // server-side half (payload shape + the truncated-step heal that still reads the
  // column) is pinned by functions/_lib/recipeWire.test.ts. This is the other half: the
  // request is not made until asked, it IS made then, and what comes back is the
  // snapshot — not the live card wearing its label.
  test('the « Original » view is fetched on the tap, and never before', async ({ page }) => {
    const asked: string[] = []
    await page.setViewportSize({ width: 390, height: 844 })
    await mockApi(page)
    // Count AFTER mockApi so the fixture's own handler still answers; page.route
    // stacks, and an observer that fulfils nothing must fall through.
    await page.route('**/api/recipe-original**', async (route) => {
      asked.push(new URL(route.request().url()).search)
      await route.fallback()
    })
    await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile' })

    await page.goto('/kitchen?tab=recipes')
    const card = page.locator('.recipe-card, .listrow, a[href*="/kitchen/recipe/"]').first()
    await card.click()
    await expect(page.locator('.recipe-modal__card')).toBeVisible()

    // The whole point: opening a recipe costs nothing extra. The board, the search,
    // cook mode and the day plan all read the same list and none of them pay either.
    expect(asked, 'the snapshot is not fetched just because a recipe was opened').toHaveLength(0)

    await page.getByRole('button', { name: 'Voir la recette originale' }).click()

    // …and now it is, for THIS recipe.
    await expect.poll(() => asked.length).toBeGreaterThan(0)
    expect(asked[0]).toContain('id=')

    // What renders is the SNAPSHOT (the fixture's title differs from the live card on
    // purpose), under the « Tel qu'importé » label. Before the lazy fetch landed, the
    // fallback painted the EDITED text under that same label — a wrong claim, which is
    // why the loading state exists.
    const body = page.locator('.recipe-original')
    await expect(body).toContainText('Tel qu’importé')
    await expect(body).toContainText('carte de grand-maman')
    await expect(body).toContainText('2 tasses de farine')
  })
})


// ── folded from recipe-photo-import.spec.ts ──────────────────────────────────────────────
test.describe('recipe-photo-import', () => {
  // Real-flow coverage for the recipe photo-import path (RecipeForm). The companion
  // recipe-read-review spec drives the dialog in isolation via /dev/kit; THIS one
  // exercises the wiring that synthetic specimen can't: pick a photo → OCR read →
  // structure → the verify dialog opens with that draft → confirm → applyDraft lands
  // it in the form behind the dialog.
  //
  // Determinism: we force the CLOUD OCR reader (a per-device localStorage pref) so the
  // flow never touches on-device Tesseract (heavy WASM, can't read a synthetic image).
  // With cloud on, readPhoto POSTs the page to /api/recipe-ocr (→ text) then structures
  // it via /api/recipe-import (→ the draft). /api/recipe-vision is mocked too as a
  // belt-and-suspenders for the device-fallback path, so a health-timing race can't
  // flake the test — either route yields the same draft.

  // A valid 1×1 PNG — decodes through resizeImage()/the OCR resize before upload.
  const PNG_1x1 = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64',
  )

  const OCR_TEXT = 'Biscuits à l’avoine\n3/4 tasse de farine\n2 œufs\nCuire 12 minutes au four.'
  const DRAFT = {
    title: 'Biscuits à l’avoine',
    ingredients: ['3/4 tasse de farine', '2 œufs'],
    steps: ['Préchauffer le four à 180 °C.', 'Ajouter 125 ml de lait et cuire 12 minutes.'],
    servings: 24,
    servingsUnit: 'biscuits',
    times: { prep: 15, cook: 12, total: null },
    lang: 'fr',
    // The shape recipe-import reports: the model that CHOSE the lines, and what the
    // audit found — the method's « 125 ml de lait », in no ingredient. The verify panel
    // must flag that step « à vérifier ».
    structuring: 'ai',
    model: '@cf/meta/llama-3.3-70b-instruct-fp8-fast · sélection',
    audit: [{ kind: 'missing-ingredient', line: '125 ml de lait' }],
    empty: false,
  }
  const json = (body: unknown) => ({ contentType: 'application/json', body: JSON.stringify(body) })

  test('photo import: read → verify dialog → apply draft to the form', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(e.message))

    await page.setViewportSize({ width: 430, height: 1200 })
    await mockApi(page)
    // Force the cloud reader BEFORE the app boots (per-device localStorage pref).
    await page.addInitScript(() => localStorage.setItem('babillard-ocr-engine', 'cloud'))
    await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile' })

    // Registered after mockApi → these take precedence (Playwright runs newest first).
    // cloudOcr makes the cloud reader eligible; the two read endpoints return our draft.
    await page.route('**/api/health', (r) => r.fulfill(json({ ai: true, aiAvailable: true, cloudOcr: true })))
    await page.route('**/api/recipe-ocr', (r) => r.fulfill(json({ text: OCR_TEXT, model: 'mistral-ocr-latest' })))
    await page.route('**/api/recipe-import', (r) => r.fulfill(json(DRAFT)))
    await page.route('**/api/recipe-vision**', (r) => r.fulfill(json({ reader: 'vision', readerModel: 'x', transcript: OCR_TEXT })))

    // Wait for the health GET to resolve so cloudOcrAvailable flips true BEFORE we
    // trigger the read — otherwise readPhoto could fall to the (slow) device reader.
    const healthDone = page
      .waitForResponse((r) => r.url().includes('/api/health') && r.request().method() === 'GET', { timeout: 10_000 })
      .catch(() => null)
    await page.goto('/kitchen/recipe/new')
    await expect(page.locator('.recipe-title-input')).toBeVisible({ timeout: 15_000 })
    await healthDone
    await settled(page) // React has applied cloudOcrAvailable=true

    // Trigger the read by handing the hidden OCR file input a photo.
    // Scanner/Importer live inside the « Remplir vite » Disclosure now — two buttons and
    // a three-line explainer no longer stand between the recipe's name and its first
    // ingredient. Open it, then hand the file to the scanner.
    await page.getByRole('button', { name: 'Remplir vite' }).click()
    await page.locator('.recipe-helpers input[type=file]').setInputFiles({
      name: 'carte.png',
      mimeType: 'image/png',
      buffer: PNG_1x1,
    })

    // The verify-against-the-photo dialog opens with the structured read, and the
    // step the audit named (report.audit from recipe-import) is flagged for a second
    // look. The clean "3/4 tasse" line is calm — risky-only flagging.
    const modal = page.locator('.read-review')
    await expect(modal).toBeVisible({ timeout: 15_000 })
    await expect(modal.locator('.read-review__line.is-flagged')).toHaveCount(1)

    // The « Rapport » tab exposes the real pipeline: the cloud reader (with its
    // model name), the line selection, and what the audit found.
    await modal.getByRole('button', { name: 'Rapport' }).click()
    const report = modal.locator('.read-review__report')
    await expect(report).toBeVisible()
    await expect(report).toContainText('mistral-ocr-latest')
    await expect(report).toContainText('llama-3.3-70b')
    await expect(report).toContainText('125 ml de lait')
    await modal.getByRole('button', { name: 'Rapport' }).click() // the chip toggles back to the lines

    // Confirm → the draft lands in the form behind the dialog (applyDraft).
    await modal.locator('.read-review__foot .btn--primary').click()
    await expect(modal).toBeHidden()
    await expect(page.locator('.recipe-title-input')).toHaveValue(DRAFT.title)
    // An ingredient row from the read is now in the form too (a live input value —
    // React sets the value property, not the attribute, so read it off the DOM).
    const hasIngredient = await page
      .locator('input')
      .evaluateAll((els, v) => els.some((e) => (e as HTMLInputElement).value === v), '3/4 tasse de farine')
    expect(hasIngredient, 'the read ingredient landed in a form field').toBe(true)

    expect(errors, 'pageerror during photo import').toEqual([])
  })

  test('« Auto » with no usable cloud key: the vision reader goes first, the device engine never loads', async ({ page }) => {
    // Marc's phone, 2026-10-27: the free Mistral key has no OCR (429), the device engine
    // timed out — the in-network vision reader (Gemma 4) was the one that read the card.
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(e.message))
    await page.setViewportSize({ width: 430, height: 1200 })
    await mockApi(page)
    // No engine chosen (auto), AI on, no cloud key → 'vision'.
    await page.addInitScript(() => localStorage.removeItem('babillard-ocr-engine'))
    await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile' })
    await page.route('**/api/health', (r) => r.fulfill(json({ ai: true, aiAvailable: true, cloudOcr: false })))
    let ocrCalls = 0
    let visionCalls = 0
    await page.route('**/api/recipe-ocr', (r) => {
      ocrCalls++
      return r.fulfill(json({ text: '', model: 'mistral-ocr-latest' }))
    })
    await page.route('**/api/recipe-vision**', (r) => {
      visionCalls++
      // One page → its transcript; the client stitches pages and structures once.
      return r.fulfill(json({ reader: 'vision', readerModel: '@cf/google/gemma-4-26b-a4b-it', transcript: OCR_TEXT }))
    })
    await page.route('**/api/recipe-import', (r) => r.fulfill(json({ ...DRAFT, structuring: 'headings', audit: [] })))
    // Tesseract must NOT be reached for: block its CDN (a hit would fail the test loudly).
    let cdnHits = 0
    await page.route('**/cdn.jsdelivr.net/**', (r) => {
      cdnHits++
      return r.abort()
    })
    const healthDone = page.waitForResponse((r) => r.url().includes('/api/health') && r.request().method() === 'GET', { timeout: 10_000 }).catch(() => null)
    await page.goto('/kitchen/recipe/new')
    await expect(page.locator('.recipe-title-input')).toBeVisible({ timeout: 15_000 })
    await healthDone
    await settled(page)
    await page.getByRole('button', { name: 'Remplir vite' }).click()
    await page.locator('.recipe-helpers input[type=file]').setInputFiles({ name: 'carte.png', mimeType: 'image/png', buffer: PNG_1x1 })

    const modal = page.locator('.read-review')
    await expect(modal).toBeVisible({ timeout: 15_000 })
    await modal.getByRole('button', { name: 'Rapport' }).click()
    await expect(modal.locator('.read-review__report')).toContainText('gemma-4')
    expect(visionCalls).toBe(1)
    expect(ocrCalls).toBe(0)
    expect(cdnHits, 'the device engine was never downloaded').toBe(0)
    expect(errors).toEqual([])
  })
})


// ── folded from recipe-read-review.spec.ts ──────────────────────────────────────────────
test.describe('recipe-read-review', () => {
  // Durable coverage for RecipeReadReview — the verify-against-the-photo OCR gate.
  // In the real app it only mounts after a photo upload + an AI read, so the visual
  // screenshot sweep never reaches it (and the FE-2 refactor that moved it onto the
  // shared <Modal> was the one change with no e2e eyes on it). The /dev/kit gallery
  // renders it deterministically from fixed props, so we drive the specimen: no AI,
  // no R2, no upload — just the component + its real Modal mount + the flag logic.
  //
  // What this guards: the dialog opens, the Modal chrome renders (.read-review), the
  // RISKY lines get flagged (a conversion mismatch, an unparseable amount, a shaky
  // word, an AI-changed number) while clean measures stay calm, the « Rapport » tab
  // names the pipeline (reader, models, repairs), the confirm/retake feet are
  // reachable, and it throws no pageerror.
  // Run at phone width too — the "mobile-friendly always" rule applies to overlays.

  for (const format of [
    { name: 'phone', width: 390, height: 844 },
    { name: 'wall', width: 1280, height: 800 },
  ] as const) {
    test(`recipe read-review dialog renders + flags risky lines @${format.name}`, async ({ page }) => {
      const errors: string[] = []
      page.on('pageerror', (e) => errors.push(e.message))

      await page.setViewportSize({ width: format.width, height: format.height })
      await mockApi(page)
      await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'kiosk' })
      await page.goto('/dev/kit')

      // Expand the specimen's <details> (no search filter: a filtered DevKit memoizes
      // `shown` on deps that omit the per-specimen open-state, so an interactive
      // specimen won't re-open while filtered — the no-query path rebuilds each render).
      const entry = page.locator('details.kit-entry').filter({ hasText: 'Ouvrir la vérification' })
      await entry.locator('summary').click()
      const open = entry.getByRole('button', { name: 'Ouvrir la vérification' })
      await open.waitFor({ state: 'visible', timeout: 15_000 })
      await open.click()

      // The shared Modal mount the FE-2 refactor introduced: className="read-review".
      const modal = page.locator('.read-review')
      await expect(modal).toBeVisible()

      // The flag logic actually fired — risky-only now, one specimen line per
      // reason: the conversion mismatch ("80 ml (1/2 tasse)"), the unparseable
      // amount ("A de c. à thé"), the shaky word ("cannelle"), the step the audit
      // named ("125 ml de lait", seeded via report.audit). The clean "3/4 tasse de
      // farine" and the consistent "225 g (1/2 lb)" ramens line stay CALM — the
      // old flag-every-fraction behaviour trained the eye to skim past warnings.
      await expect(modal.locator('.read-review__line.is-flagged')).toHaveCount(4)
      const flagged = await modal
        .locator('.read-review__line.is-flagged .read-review__memo')
        .evaluateAll((els) => els.map((e) => (e as HTMLTextAreaElement).value))
      expect(flagged.some((v) => v.includes('3/4 tasse de farine'))).toBe(false)

      // The « Rapport » tab: the pipeline honesty report names the reader, the
      // structuring model, the auto-repair and the AI-changed line.
      await modal.getByRole('button', { name: 'Rapport' }).click()
      const reportPane = modal.locator('.read-review__report')
      await expect(reportPane).toBeVisible()
      await expect(reportPane).toContainText('Tesseract')
      await expect(reportPane).toContainText('llama-3.3-70b')
      await expect(reportPane).toContainText('« 125 ml de lait » est dans les étapes')
      await expect(reportPane).toContainText('60 ml (1/4 de tasse)')
      await modal.getByRole('button', { name: 'Rapport' }).click() // the chip toggles back to the lines

      // The rows are MEMO boxes: the deliberately-long ramens ingredient must be
      // fully visible — wrapped, never clipped. A one-line <input> fails this on
      // scrollWidth (the "text that truncates" bug); a non-grown textarea fails on
      // scrollHeight.
      const clipped = await modal.locator('.read-review__fields').evaluate((root) => {
        const memos = [...root.querySelectorAll<HTMLTextAreaElement>('.read-review__memo')]
        const el = memos.find((m) => m.value.includes('ramens'))
        if (!el) return 'long line missing from the specimen'
        return el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1
      })
      expect(clipped, 'the long ingredient line is fully shown, not truncated').toBe(false)
      // Both feet are reachable: the ghost « Annuler » and the primary confirm
      // (« C'est bon ») — targeted structurally so the assertion is locale-proof.
      await expect(modal.locator('.read-review__foot .btn--ghost')).toBeVisible()
      await expect(modal.locator('.read-review__foot .btn--primary')).toBeEnabled()

      // Overlay must not overflow the viewport horizontally on a phone.
      const overflow = await page.evaluate(() => {
        const doc = document.documentElement
        return doc.scrollWidth > doc.clientWidth + 1
      })
      expect(overflow, 'no horizontal overflow with the dialog open').toBeFalsy()

      await page.screenshot({ path: `e2e/screenshots/recipe-read-review-${format.name}.png`, fullPage: true })
      expect(errors, 'pageerror with the read-review dialog open').toEqual([])
    })
  }

  test('« à vérifier » is a tap: looked at the photo, it is right → « vérifié », and back', async ({ page }) => {
    // Marc, 2026-10-27: a flag you have checked by eye should be clearable in place.
    await page.setViewportSize({ width: 430, height: 1000 })
    await mockApi(page)
    await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'kiosk' })
    await page.goto('/dev/kit')
    const entry = page.locator('details.kit-entry').filter({ hasText: 'Ouvrir la vérification' })
    await entry.locator('summary').click()
    await entry.getByRole('button', { name: 'Ouvrir la vérification' }).click()
    const modal = page.locator('.read-review')
    await expect(modal).toBeVisible()
    const flagged = modal.locator('.read-review__line.is-flagged')
    const n = await flagged.count()
    expect(n).toBeGreaterThan(0)
    const chip = flagged.first().locator('.read-review__chiptag')
    await expect(chip).toHaveText('à vérifier')
    await chip.click()
    await expect(flagged).toHaveCount(n - 1)
    // The chip stays, quiet, and undoes on a second tap.
    const checked = modal.locator('.read-review__chiptag', { hasText: 'vérifié' }).first()
    await expect(checked).toBeVisible()
    await checked.click()
    await expect(flagged).toHaveCount(n)
  })

  // The last-resort read (2026-11-16): the AI quota is spent — every Workers AI model shares
  // it, so no smaller model can step in — and the phone's engine read the card with low
  // confidence. It is kept instead of « colle le texte », and the panel says so FIRST, in
  // the error tone, before any line is trusted. A normal read never says it.
  test('a last-resort read (no AI, shaky) says so before any line is trusted', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await mockApi(page)
    await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile' })
    await page.goto('/dev/kit')
    const entry = page.locator('details.kit-entry').filter({ hasText: 'Ouvrir la vérification' })
    await entry.locator('summary').click()
    const warning = /Lecture de secours sans IA/

    await entry.getByRole('button', { name: 'Ouvrir la vérification' }).click()
    const modal = page.locator('.read-review')
    await expect(modal).toBeVisible()
    await expect(modal.getByText(warning)).toHaveCount(0)
    await modal.getByRole('button', { name: /Annuler|Fermer/ }).first().click()
    await expect(modal).toHaveCount(0)

    await entry.getByRole('button', { name: 'Lecture de secours' }).click()
    await expect(modal).toBeVisible()
    const line = modal.locator('.status-msg--error', { hasText: warning })
    await expect(line).toBeVisible()
    // Said before the hints and the lines, not buried under them.
    const [warnTop, firstLineTop] = await Promise.all([
      line.evaluate((e) => e.getBoundingClientRect().top),
      modal.locator('.read-review__line').first().evaluate((e) => e.getBoundingClientRect().top),
    ])
    expect(warnTop).toBeLessThan(firstLineTop)
    await expect(modal).toContainText('quota IA gratuit du jour épuisé')
  })
})


// ── folded from recipe-tag-slots.spec.ts ──────────────────────────────────────────────
test.describe('recipe-tag-slots', () => {
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
})


// ── folded from recipe-versions.spec.ts ──────────────────────────────────────────────
test.describe('recipe-versions', () => {
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
})


// ── folded from recipes-lean-header.spec.ts ──────────────────────────────────────────────
test.describe('recipes-lean-header', () => {
  // The recipe book's header, leaned to ONE line: no « Recettes » heading (the sub-tab
  // above already says the word), a COLLAPSED magnifier that becomes the search field
  // on tap, a « Filtrer » button that pops the pills + tag chips (shut by default), an
  // ICON-ONLY Collections segment, and no third "livre de cuisine" segment (that book
  // is the toddler lens's door — ToddlerKitchen's « Mon livre » tile — plus the kitchen ＋
  // ▸ « Faire un livre » and its guide card). Locks the things a later "let's make room
  // for X" edit would quietly undo: the loupe still opens AND lands the caret, a live
  // query still keeps the field on screen, the filters still hide until asked for and
  // still announce themselves when they're narrowing the grid, the icon-only tab still
  // has an accessible name, and the popped rows still fit a 390px phone.
  const openBook = async (page: Page) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.setViewportSize({ width: 390, height: 844 })
    await mockApi(page)
    await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', calm: true })
    await page.goto('/kitchen')
    await page.locator('.hub').first().waitFor({ state: 'visible', timeout: 15_000 })
    await page.locator('.subtabs__opt', { hasText: 'Recettes' }).click()
    await page.locator('.recipe-card').first().waitFor({ state: 'visible', timeout: 15_000 })
  }

  test('the search loupe expands, filters, and collapses back', async ({ page }) => {
    await openBook(page)
    const open = page.locator('.searchfield__open')
    await expect(open).toBeVisible() // collapsed by default — no field eating a line

    // One tap opens AND focuses: an expand that costs a second tap for the caret is
    // worse than the always-open field it replaced.
    await open.click()
    const input = page.locator('.searchfield__input')
    await expect(input).toBeFocused()
    await input.fill('bisc')
    await expect(page.locator('.recipe-card')).toHaveCount(1)

    // A live query pins the field open even without focus — it's the reason the grid
    // below is narrowed, so it must never collapse out from under the result.
    await input.blur()
    await expect(input).toBeVisible()

    // ✕ clears and closes in one go.
    await page.locator('.searchfield__clear').click()
    await expect(open).toBeVisible()
    await expect(page.locator('.recipe-card')).toHaveCount(4)
  })

  test('no « Recettes » heading — the sub-tab above already says it', async ({ page }) => {
    await openBook(page)
    await expect(page.locator('.kitchen__head')).toHaveCount(0)
    // The word survives exactly once on the page: on the sub-tab.
    await expect(page.getByRole('tab', { name: 'Recettes' })).toBeVisible()
  })

  test('« Filtrer » pops the pills, counts what is on, and clears them', async ({ page }) => {
    await openBook(page)

    // Shut by default — a book you just opened shows recipes, not the machinery.
    await expect(page.locator('.recipe-filters')).toHaveCount(0)
    await expect(page.locator('.kitchen__recipe-tools')).toHaveCount(0)
    await expect(page.locator('.kitchen__tag-filter')).toHaveCount(0)

    const btn = page.locator('.recipe-filter')
    await expect(btn).toBeVisible()
    await expect(btn).toHaveAttribute('aria-expanded', 'false')
    await expect(btn.locator('.recipe-filter__n')).toHaveCount(0) // nothing on → no badge

    await btn.click()
    await expect(btn).toHaveAttribute('aria-expanded', 'true')
    const panel = page.locator('.recipe-filters')
    await expect(panel).toBeVisible()
    await expect(panel.locator('.kitchen__recipe-tools')).toBeVisible()
    await expect(panel.locator('.kitchen__tag-filter')).toBeVisible()

    // Two filters on → the badge says 2…
    await panel.getByRole('button', { name: '30 min ou moins' }).click()
    await panel.locator('.kitchen__tag-filter .chip', { hasText: 'rapide' }).click()
    await expect(btn.locator('.recipe-filter__n')).toHaveText('2')

    // …and it keeps saying it with the panel SHUT: a narrowed grid is never
    // unexplained just because the machinery folded away.
    await btn.click()
    await expect(page.locator('.recipe-filters')).toHaveCount(0)
    await expect(btn.locator('.recipe-filter__n')).toHaveText('2')

    // The panel's own way out puts every recipe back.
    await btn.click()
    await page.locator('.recipe-filters__clear').click()
    await expect(btn.locator('.recipe-filter__n')).toHaveCount(0)
    await expect(page.locator('.recipe-card')).toHaveCount(4)
  })

  test('the view toggle is Aa + an icon-only, still-named Collections — and no book segment', async ({ page }) => {
    await openBook(page)
    await expect(page.locator('.recipe-view-toggle__book')).toHaveCount(0)

    const collections = page.getByRole('tab', { name: 'Collections' })
    await expect(collections).toBeVisible()
    await expect(collections).toHaveText('') // the glyph carries it; aria-label names it
    await collections.click()

    // Grouped sections speak for themselves — the old "Touche des étiquettes…" hint
    // line is gone and must not creep back.
    await expect(page.locator('.recipe-collections-hint')).toHaveCount(0)
    await expect(page.locator('.recipe-group__head').first()).toBeVisible()
  })

  test('the popped filter panel keeps every control inside a 390px phone', async ({ page }) => {
    await openBook(page)
    await page.locator('.recipe-filter').click()
    await expect(page.locator('.recipe-filters')).toBeVisible()
    // Per-child bounds check (scrollWidth reads 0 through the shell's overflow-x
    // clip). Descendants of a deliberate side-scroller are exempt: the tag row still
    // scrolls sideways by design (the pills WRAP inside the panel).
    const bleeding = await page.evaluate(() => {
      const root = document.querySelector('.hub__body') as HTMLElement
      const edge = root.getBoundingClientRect().right
      const inScroller = (el: Element | null) => {
        for (let n = el; n && n !== root; n = n.parentElement)
          if (getComputedStyle(n).overflowX !== 'visible') return true
        return false
      }
      return [...root.querySelectorAll<HTMLElement>('*')]
        .filter((el) => {
          const b = el.getBoundingClientRect()
          return b.width > 0 && b.right > edge + 1 && !inScroller(el)
        })
        .map((el) => String(el.className))
        .slice(0, 10)
    })
    expect(bleeding, 'nothing bleeds past the right edge').toEqual([])
  })

  // A filter whose chip has GONE must stop filtering. « Favoris » shows only while some
  // recipe is loved; un-hearting the last one hid the chip but the filter stayed on —
  // an empty book, a « Filtrer 1 » badge, and no chip left to untap (2026-11-14 audit).
  test('un-hearting the last favourite with « Favoris » on gives the book back — no stranded filter', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('babillard-profile', 'm1'))
    let loves = [{ recipe_id: 'rc1', member_id: 'm1' }]
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.setViewportSize({ width: 390, height: 844 })
    await mockApi(page)
    await page.route('**/api/recipe-loves', (route) => {
      if (route.request().method() === 'DELETE') loves = []
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify(route.request().method() === 'GET' ? { loves } : { ok: true }) })
    })
    await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', calm: true })
    await page.goto('/kitchen')
    await page.locator('.subtabs__opt', { hasText: 'Recettes' }).click()
    await expect(page.locator('.recipe-card')).toHaveCount(4, { timeout: 15_000 })

    const btn = page.locator('.recipe-filter')
    await btn.click()
    await page.locator('.recipe-filters').getByRole('button', { name: 'Favoris' }).click()
    await expect(page.locator('.recipe-card')).toHaveCount(1)
    await expect(btn.locator('.recipe-filter__n')).toHaveText('1')

    await page.locator('.recipe-card-wrap').first().locator('.hearts__btn').click()
    await expect(page.locator('.recipe-filters').getByRole('button', { name: 'Favoris' })).toHaveCount(0)
    await expect(page.locator('.recipe-card'), 'the whole book, not « aucune recette »').toHaveCount(4)
    await expect(btn.locator('.recipe-filter__n'), 'nothing counted that cannot be seen').toHaveCount(0)
  })

  // « Oubliées » read when each recipe was last served from /api/meals' 3-day tail, so
  // a dish from three weeks ago said « jamais encore » and sorted with the never-cooked
  // ones. It reads the whole history now (/api/meal-history?lastServed=1).
  test('« Oubliées » knows a dish from three weeks ago — not « jamais encore »', async ({ page }) => {
    await page.clock.setFixedTime(new Date(BASE * 1000))
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.setViewportSize({ width: 390, height: 844 })
    await mockApi(page, { overrides: { 'meal-history': { served: [{ recipe_id: 'rc1', last_at: MMID - 21 * 86400 }] } } })
    await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', calm: true })
    await page.goto('/kitchen')
    await page.locator('.subtabs__opt', { hasText: 'Recettes' }).click()
    await expect(page.locator('.recipe-card')).toHaveCount(4, { timeout: 15_000 })
    await page.locator('.recipe-filter').click()
    await page.locator('.recipe-filters').getByRole('button', { name: 'Oubliées' }).click()

    const spaghetti = page.locator('.recipe-card', { hasText: 'Spaghetti maison' })
    await expect(spaghetti.locator('.recipe-card__seen')).toHaveText(/vu il y a 21 jours/)
    // Never-served recipes lead; the one served three weeks ago comes after them.
    await expect(page.locator('.recipe-card').last()).toContainText('Spaghetti maison')
    await expect(page.locator('.recipe-card').first().locator('.recipe-card__seen')).toHaveText(/jamais encore/)
  })
})
