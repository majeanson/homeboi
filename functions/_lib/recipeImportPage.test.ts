// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { diffExpected, expectedOf, loadCorpus } from '../test/recipeCorpus'
import { htmlToText, parsePastedRecipe, parseRecipeMicrodata, pageMeta, tidyIngredientLine } from './recipeImport'
import { importFromHtml, pageListFillsIngredients, readPage, regroupSteps, sourceFromCapture } from './recipeImportPage'

// The page seam (_lib/recipeImportPage) and the parser fixes the corpus forced
// (2026-10-27). The corpus test scores whole pages; these pin each rule on its own.

describe('a page the cook’s browser captured reads like the page we fetched', () => {
  // The bookmarklet sends the JSON-LD blocks' raw text and the page's text, never the
  // HTML. For every corpus page with JSON-LD, that capture must read EXACTLY as the
  // fetched HTML does — same parsers, same result.
  const blocksOf = (html: string) =>
    [...html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1])
  const withLd = loadCorpus().filter((e) => e.expected?.structuring === 'jsonld')

  it('there are JSON-LD pages to compare', () => expect(withLd.length).toBeGreaterThanOrEqual(6))

  for (const e of withLd) {
    it(e.id, () => {
      const html = e.html()
      const meta = pageMeta(html)
      const r = readPage(
        sourceFromCapture({ url: e.meta.url, title: meta.title, image: meta.image, jsonld: blocksOf(html), text: htmlToText(html, 200_000) }),
      )
      expect(r.draft).not.toBeNull()
      expect(diffExpected(expectedOf(importFromHtml(html, e.meta.url)), expectedOf(r.draft!))).toEqual([])
    })
  }

  it('a captured tab title loses its « | Site » tail (prod, 2026-10-27: the audit flagged it as junk)', () => {
    const r = readPage(sourceFromCapture({ url: 'https://www.recettes.qc.ca/r', title: 'Chili con carne | Recettes du Québec', jsonld: [], text: 'Ingrédients\n1 kg viande hachée\n2 oignons\nPréparation\nCuire.' }))
    expect(r.draft?.title).toBe('Chili con carne')
  })

  it('a captured DOM walk is tidied like a fetched page: indentation runs collapse, a decomposed « É » heading is the heading', () => {
    // The bookmark's text nodes keep the source's indentation; and a site may ship a
    // decomposed É (E + U+0301) — un-normalized, « INGRÉDIENTS » missed ING_HEADING and
    // came home as a « ## INGRÉDIENTS » section (Marc's save, 2026-10-27).
    const E = 'É'
    const r = readPage(
      sourceFromCapture({
        url: 'https://www.recettes.qc.ca/r',
        title: 'Chili',
        jsonld: [],
        text: `\n\n   INGR${E}DIENTS   \n\n      1 kg        viande hachée      maigre   \n   2 oignons\n\n\n\n   PR${E}PARATION\n   Couper le bacon.\n   Cuire.\n`,
      }),
    )
    expect(r.draft?.ingredients).toEqual(['1 kg viande hachée maigre', '2 oignons'])
    expect(r.draft?.steps).toEqual(['Couper le bacon.', 'Cuire.'])
  })

  it('a captured page with no recipe block falls to its printed headings', () => {
    const r = readPage(
      sourceFromCapture({
        url: 'https://www.example.test/r',
        title: 'Pouding',
        jsonld: ['{"@type":"WebSite","name":"x"}', 'not json'],
        text: 'Menu\nPouding\nIngrédients\n500 ml de cassonade\n500 ml d’eau\nPréparation\nMélanger.\nCuire 40 minutes.\nNotes\nMeilleur tiède.',
      }),
    )
    expect(r.draft).toMatchObject({
      title: 'Pouding',
      ingredients: ['500 ml de cassonade', '500 ml d’eau'],
      steps: ['Mélanger.', 'Cuire 40 minutes.'],
      notes: 'Meilleur tiède.',
      structuring: 'headings',
    })
  })
})

describe('the structured list is bare or missing — the printed one fills it', () => {
  const printed = ['## Boulettes', '900 g de bœuf haché', '60 g (1 tasse) de parmesan', '2 gros oignons espagnols']
  it('names without amounts, all found in order → the printed list', () => {
    expect(pageListFillsIngredients(['bœuf', 'parmesan', 'oignon espagnol'], printed)).toBe(true)
  })
  it('no structured list at all → the printed list', () => expect(pageListFillsIngredients([], printed)).toBe(true))
  it('a structured list WITH amounts stands', () => {
    expect(pageListFillsIngredients(['900 g de bœuf', '60 g de parmesan', '2 oignons'], printed)).toBe(false)
  })
  it('a name the page does not print → not the same list', () => {
    expect(pageListFillsIngredients(['bœuf', 'chapelure'], printed)).toBe(false)
  })
})

describe('regroupSteps — the page’s parts, over the site’s own steps', () => {
  const site = ['Préchauffer.', 'Mélanger.', 'Servir chaud.']
  it('same steps, a printed part → the part is kept', () => {
    expect(regroupSteps(site, ['Préchauffer.', 'Mélanger.', '## Au service', 'Servir chaud.'])).toEqual([
      'Préchauffer.',
      'Mélanger.',
      '## Au service',
      'Servir chaud.',
    ])
  })
  it('any difference → the site’s steps, untouched', () => {
    expect(regroupSteps(site, ['Préchauffer.', '## Au service', 'Servir.'])).toBe(site)
  })
})

describe('parser fixes the corpus forced', () => {
  it('WPRM notes unwrap as printed', () => {
    expect(tidyIngredientLine('1 large onion ((or 2 small onions), sliced)')).toBe('1 large onion (or 2 small onions), sliced')
    expect(tidyIngredientLine('2 tbsp vegetable oil (, divided)')).toBe('2 tbsp vegetable oil, divided')
    expect(tidyIngredientLine('2 tbsp flour ((Note 2))')).toBe('2 tbsp flour (Note 2)')
    expect(tidyIngredientLine('1 oignon (jaune)')).toBe('1 oignon (jaune)')
  })

  it('htmlToText: an attribute holding « > » never leaks; a block opener breaks the line; a cell stays on its row', () => {
    const html =
      '<ul><li><label><span>Gingembre</span> 15 ml</label><input value="<span>Gingembre</span> 15 ml" type="checkbox"/></li></ul>' +
      '<a>Sélectionner tous</a> <div><button>Ajouter</button></div><table><tr><td>250 ml</td><td>de farine</td></tr></table>'
    expect(htmlToText(html).split('\n')).toEqual(['Gingembre 15 ml', 'Sélectionner tous', 'Ajouter', '250 ml de farine'])
  })

  it('htmlToText: capitals decode as capitals; a soft hyphen disappears; no space before a closing « . »', () => {
    expect(htmlToText('<p>&Eacute;tape &OElig;uf la &shy;cassonade <a>velveting</a>.</p>')).toBe('Étape Œuf la cassonade velveting.')
  })

  it('notes: a qualified heading, a « Bon à savoir ! » line, the page’s buttons skipped', () => {
    const r = parsePastedRecipe(
      [
        'Ingrédients',
        '1 tasse de farine',
        'Ajouter à ma liste d’épicerie',
        '2 œufs',
        'Bon à savoir ! Se congèle très bien, sans la garniture.',
        'Préparation',
        'Mélanger.',
        'Note de l’équipe Ricardo',
        'Cuire les pâtes plus longtemps.',
        'NOTE PERSONNELLE',
        'Créer une note',
      ].join('\n'),
    )
    expect(r.ingredients).toEqual(['1 tasse de farine', '2 œufs'])
    expect(r.notes).toBe('Se congèle très bien, sans la garniture.\nCuire les pâtes plus longtemps.')
  })

  it('« Note : bien mélanger » inside the method is a step, not a heading', () => {
    const r = parsePastedRecipe('Ingrédients\n1 tasse de farine\n2 œufs\nPréparation\nMélanger.\nNote : bien mélanger.')
    expect(r.steps).toEqual(['Mélanger.', 'Note : bien mélanger.'])
    expect(r.notes).toBeNull()
  })

  it('microdata: a nested container is read whole; times and yield from attributes; the author’s name is not the title', () => {
    const html = `<div itemscope itemtype="https://schema.org/Recipe">
      <div itemprop="author" itemscope><meta itemprop="name" content="Le site"></div>
      <h1 itemprop="name">Poulet au beurre</h1>
      <meta itemprop="prepTime" content="PT30M"><time itemprop="cookTime" datetime="PT45M">45 min</time>
      <span itemprop="recipeYield" content="6 à 8 portions">6</span>
      <div itemprop="recipeInstructions"><h2>Préparation</h2>
        <ol><li><div>Mélanger.</div></li><li><div>Cuire.</div></li></ol>
        <h5>Idée pour accompagner:</h5><p>Du riz.</p>
      </div></div>`
    expect(parseRecipeMicrodata(html)).toMatchObject({
      title: 'Poulet au beurre',
      steps: ['Mélanger.', 'Cuire.'],
      servings: 6,
      times: { prep: 30, cook: 45, total: null },
      notes: 'Du riz.',
    })
  })

  it('pageMeta: the one <h1> names the page; a share title loses its « | Site » tail', () => {
    expect(pageMeta('<meta property="og:title" content="Recette de carrés | Recettes du Québec"><h1>Carrés au sucre</h1>').title).toBe(
      'Carrés au sucre',
    )
    expect(pageMeta('<meta property="og:title" content="Chili con carne | Recettes du Québec">').title).toBe('Chili con carne')
  })
})
