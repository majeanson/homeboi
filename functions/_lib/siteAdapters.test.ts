// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { loadCorpus } from '../test/recipeCorpus'
import { adaptPage, applyGroups, ricardoGroups } from './siteAdapters'
import { normalizeInstructionsWithImages, parseRecipeJsonLdBlocks } from './recipeImport'
import { importStepImages } from './stepImageImport'
import { readPage, sourceFromCapture } from './recipeImportPage'
import type { Env } from './env'

// C2 (the site's own groups), C3 (its step photos), C4 (several recipes on one page).

describe('site adapters — the parts a site knows and its JSON-LD flattens', () => {
  const tarte = loadCorpus().find((e) => e.id.startsWith('ricardocuisine.com__4530'))!

  it('Ricardo: the cooking-mode props carry both groups, line for line', () => {
    const a = adaptPage(tarte.html())!
    expect(a.exact).toBe(true)
    expect(a.ingredientGroups!.map((g) => [g.name, g.lines.length])).toEqual([
      ['Pâte brisée', 6],
      ['Garniture', 6],
    ])
    expect(a.stepGroups!.map((g) => g.name)).toEqual(['Pâtes brisée', 'Garniture'])
  })

  it('a FLAT structured list is cut by the groups — only when every line is the same', () => {
    const groups = [
      { name: 'Pâte', lines: ['1 tasse de farine', '1 œuf'] },
      { name: 'Garniture', lines: ['1 tasse de cassonade'] },
    ]
    expect(applyGroups(['1 tasse de farine', '1 œuf', '1 tasse de cassonade'], groups, true)).toEqual([
      '## Pâte',
      '1 tasse de farine',
      '1 œuf',
      '## Garniture',
      '1 tasse de cassonade',
    ])
    expect(applyGroups(['1 tasse de farine', '2 œufs', '1 tasse de cassonade'], groups, true)).toBeNull()
    expect(applyGroups(['a', 'b'], groups, true)).toBeNull()
  })

  it('a captured page (the bookmark) brings Ricardo’s props: the groups come back with no page text to match', () => {
    const props = JSON.stringify({
      ingredientGroups: [
        { description: 'Biscuits', ingredients: [{ description: '1 tasse de farine' }, { description: '1 œuf' }] },
        { description: 'Glaçage', ingredients: [{ description: '1 tasse de sucre à glacer' }] },
      ],
    })
    expect(ricardoGroups(props)?.ingredientGroups?.length).toBe(2)
    const r = readPage(
      sourceFromCapture({
        url: 'https://www.ricardocuisine.com/recettes/1-x',
        jsonld: [JSON.stringify({ '@type': 'Recipe', name: 'Biscuits glacés', recipeIngredient: ['1 tasse de farine', '1 œuf', '1 tasse de sucre à glacer'], recipeInstructions: ['Mélanger.', 'Cuire.'] })],
        text: '',
        extras: { ricardo: props },
      }),
    )
    expect(r.draft?.ingredients).toEqual(['## Biscuits', '1 tasse de farine', '1 œuf', '## Glaçage', '1 tasse de sucre à glacer'])
  })

  it('WPRM: groups by their row count (the rows render amounts differently from the JSON-LD)', () => {
    const html =
      '<div class="wprm-recipe-ingredient-group"><h4 class="wprm-recipe-group-name">Beef:</h4><ul><li class="wprm-recipe-ingredient">600 g steak</li><li class="wprm-recipe-ingredient">salt</li></ul></div>' +
      '<div class="wprm-recipe-ingredient-group"><h4 class="wprm-recipe-group-name">Sauce</h4><ul><li class="wprm-recipe-ingredient">1 cup cream</li></ul></div>'
    const a = adaptPage(html)!
    expect(a.exact).toBe(false)
    expect(applyGroups(['600g / 1.2 lb steak', 'Salt', '1 cup sour cream'], a.ingredientGroups, a.exact)).toEqual([
      '## Beef',
      '600g / 1.2 lb steak',
      'Salt',
      '## Sauce',
      '1 cup sour cream',
    ])
  })
})

describe('C4 — several recipes on one page', () => {
  const two = [
    { '@context': 'https://schema.org', '@graph': [
      { '@type': 'Recipe', name: 'Pâte à crêpes', recipeIngredient: ['1 tasse de farine'], recipeInstructions: ['Mélanger.'] },
      { '@type': 'Recipe', name: 'Sauce au caramel', recipeIngredient: ['1 tasse de sucre'], recipeInstructions: ['Fondre.'] },
      { '@type': 'Recipe', name: 'Pâte à crêpes', recipeIngredient: ['1 tasse de farine'], recipeInstructions: ['Mélanger.'] },
    ] },
  ]
  it('the first is read; every DISTINCT one is offered by title; `pick` reads another', () => {
    expect(parseRecipeJsonLdBlocks(two)).toMatchObject({ title: 'Pâte à crêpes', candidates: [{ i: 0, title: 'Pâte à crêpes' }, { i: 1, title: 'Sauce au caramel' }] })
    expect(parseRecipeJsonLdBlocks(two, 1)).toMatchObject({ title: 'Sauce au caramel', ingredients: ['1 tasse de sucre'] })
    expect(parseRecipeJsonLdBlocks(two, 9)?.title).toBe('Sauce au caramel')
  })
  it('one recipe repeated is not a choice', () => {
    expect(parseRecipeJsonLdBlocks([two[0]['@graph'][0], two[0]['@graph'][2]])?.candidates).toBeUndefined()
  })
})

describe('C3 — the site’s step photos', () => {
  it('each HowToStep’s image, aligned to the steps (headings and split halves get none)', () => {
    const r = normalizeInstructionsWithImages([
      { '@type': 'HowToSection', name: 'Pâte', itemListElement: [{ '@type': 'HowToStep', text: 'Mélanger.', image: 'https://img.test/1.jpg' }] },
      { '@type': 'HowToSection', name: 'Sauce', itemListElement: [{ '@type': 'HowToStep', text: 'Fondre.', image: { url: 'https://img.test/2.jpg' } }, { '@type': 'HowToStep', text: 'Servir.' }] },
    ])
    expect(r.steps).toEqual(['## Pâte', 'Mélanger.', '## Sauce', 'Fondre.', 'Servir.'])
    expect(r.images).toEqual([null, 'https://img.test/1.jpg', null, 'https://img.test/2.jpg', null])
  })

  it('the recipe’s hero picture repeated on a step is not a step photo', () => {
    const p = parseRecipeJsonLdBlocks([{ '@type': 'Recipe', name: 'X', image: 'https://img.test/hero.jpg', recipeInstructions: [{ '@type': 'HowToStep', text: 'A.', image: 'https://img.test/hero.jpg' }, { '@type': 'HowToStep', text: 'B.' }] }])
    expect(p?.stepImageUrls).toBeUndefined()
  })

  it('importStepImages: https image ≤ 3 MB stored and charged; the rest skipped; R2 unbound → nothing', async () => {
    const put = vi.fn(async () => undefined)
    const env = { DB: {}, PHOTOS: { put } } as unknown as Env
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (u) => {
      const url = String(u)
      if (url.endsWith('big.jpg')) return new Response(new Uint8Array(10), { headers: { 'content-type': 'image/jpeg', 'content-length': String(4 * 1024 * 1024) } })
      if (url.endsWith('page.html')) return new Response('<html>', { headers: { 'content-type': 'text/html' } })
      return new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'image/jpeg' } })
    })
    const keys = await importStepImages(env, [null, 'https://img.test/a.jpg', 'http://img.test/b.jpg', 'https://img.test/big.jpg', 'https://img.test/page.html'])
    expect(keys[0]).toBe('')
    expect(keys[1]).toMatch(/^rsi_/)
    expect(keys.slice(2)).toEqual(['', '', ''])
    expect(put).toHaveBeenCalledTimes(1)
    expect(await importStepImages({ DB: {} } as unknown as Env, ['https://img.test/a.jpg'])).toEqual([''])
    fetchMock.mockRestore()
  })
})
