// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { diffExpected, expectedOf, loadCorpus } from '../test/recipeCorpus'
import { htmlToText, parsePastedRecipe, parseRecipeMicrodata, pageMeta, tidyIngredientLine } from './recipeImport'
import { fullerSteps, halfRead, importFromHtml, notesWithoutSteps, pageListFillsIngredients, readPage, regroupSteps, sourceFromCapture, sourceFromHtml, stepHeadedMethod } from './recipeImportPage'

const real = (l: string[]) => l.filter((x) => !x.startsWith('## '))

// The page seam (_lib/recipeImportPage) and the parser fixes the corpus forced
// (2026-10-27). The corpus test scores whole pages; these pin each rule on its own.

describe('a page the cook’s browser captured reads like the page we fetched', () => {
  // The bookmarklet sends the JSON-LD blocks' raw text and the page's text, never the
  // HTML. For every corpus page with JSON-LD, that capture must read EXACTLY as the
  // fetched HTML does — same parsers, same result.
  const blocksOf = (html: string) =>
    [...html.matchAll(/<script\b[^>]*type=["']application\/(ld\+)?json["'][^>]*>([\s\S]*?)<\/script>/gi)]
      .filter((m) => m[1] || m[2].includes('"Recipe"')) // the bookmark's own filter
      .map((m) => m[2])
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

describe('stepHeadedMethod — only ever adds', () => {
  const ingredients = ['2 cups milk', '1/2 cup chia seeds', '1/4 cup peanut butter']
  const page = [
    'Ingredients',
    '2 cups milk',
    '',
    'Step 1: Combine Milk and Chia',
    'Whisk the milk and chia seeds in a bowl.',
    'Let the seeds absorb the liquid.',
    '',
    'Step 2: Finish',
    'Stir in the peanut butter until smooth.',
    'Serve it nice and cold.',
    '',
    'Disclaimer: parts of this article were written by a machine.',
    'Leave a Comment',
  ]
  const text = page.join('\n')
  const read = (t: string, ing = ingredients) => stepHeadedMethod(t, ing)

  it('every step, every line, word for word, the footer out', () => {
    expect(read(text)).toEqual([
      '## Step 1: Combine Milk and Chia',
      'Whisk the milk and chia seeds in a bowl.',
      'Let the seeds absorb the liquid.',
      '## Step 2: Finish',
      'Stir in the peanut butter until smooth.',
      'Serve it nice and cold.',
    ])
  })
  it('a page with nothing after the last step reads to its end', () => {
    expect(read(page.slice(0, 11).join('\n'))?.at(-1)).toBe('Serve it nice and cold.')
  })
  // Each of these is a page where the rule would be guessing — it must step aside.
  const steppingAside: [string, string][] = [
    ['a table of contents restarts the numbers', 'Step 1: Combine\nStep 2: Finish\n\n' + text],
    ['a number is missing', text.replace('Step 2:', 'Step 3:')],
    ['a single step is not a method', text.replace('Step 2: Finish', 'Finish')],
    ['a title that is really the sentence', text.replace('Step 2: Finish', 'Step 2: Finish the milk and chia.')],
    ['a line that is no sentence (a caption, an ad)', text.replace('Let the seeds absorb the liquid.', 'Sponsored photo')],
    ['paragraphs: a blank line inside a step', text.replace('Whisk the milk and chia seeds in a bowl.\n', 'Whisk the milk and chia seeds in a bowl.\n\n')],
    ['the last step may run on past its blank line', text.replace('Disclaimer: parts of this article were written by a machine.', 'Then chill the milk for a day before you eat it.')],
    ['a heading with nothing under it', text.replace('Whisk the milk and chia seeds in a bowl.\nLet the seeds absorb the liquid.\n', '')],
  ]
  for (const [why, t] of steppingAside) it(`null: ${why}`, () => expect(read(t)).toBeNull())
  it('null: a numbered list that does not cook this recipe', () => {
    expect(read(text, ['1 kg de boeuf', '2 carottes', '1 oignon'])).toBeNull()
  })
  it('never touches a page that has a method', () => {
    const r = readPage(
      sourceFromCapture({
        url: 'https://x.test/r',
        jsonld: [JSON.stringify({ '@type': 'Recipe', name: 'P', recipeIngredient: ingredients, recipeInstructions: ['Tout mélanger.'] })],
        text,
      }),
    )
    expect(r.draft?.steps).toEqual(['Tout mélanger.'])
    expect(r.askModel).toBe(false)
  })
  it('found alone, it is the no-model read — and the model still gets a look', () => {
    const r = readPage(
      sourceFromCapture({
        url: 'https://x.test/r',
        jsonld: [JSON.stringify({ '@type': 'Recipe', name: 'P', recipeIngredient: ingredients, recipeYield: '4', prepTime: 'PT15M' })],
        text: `P\nMenu\n${text}`,
      }),
    )
    expect(real(r.draft!.steps)).toHaveLength(4)
    expect(r.askModel).toBe(true)
    expect(r.known).toMatchObject({ servings: 4, times: { prep: 15 } })
  })
  it('no corpus page with a method of its own is touched', () => {
    for (const e of loadCorpus()) {
      const r = readPage(sourceFromHtml(e.html(), e.meta.url))
      if (e.meta.stepHeaded) expect(r.askModel, e.id).toBe(true)
      else expect(r.askModel, e.id).toBe(false)
    }
  })
})

describe('fullerSteps — the page’s lines replace a model’s only to add', () => {
  const page = ['## Step 1', 'Mix it.', 'Rest it.', 'Serve it.']
  it('the model lost a line → the page’s, whole', () => expect(fullerSteps(['Mix it.', 'Rest it.'], page)).toEqual(page))
  it('the same lines, spelled alike → the page’s', () => expect(fullerSteps(['MIX IT', 'Rest it.', 'Serve it.'], page)).toEqual(page))
  it('a line the page does not hold → the model’s stands', () => {
    expect(fullerSteps(['Mix it.', 'Bake it.'], page)).toEqual(['Mix it.', 'Bake it.'])
  })
  it('nothing to compare → the model’s stands', () => {
    expect(fullerSteps(['Mix it.'], undefined)).toEqual(['Mix it.'])
    expect(fullerSteps(['Mix it.'], [])).toEqual(['Mix it.'])
    expect(fullerSteps([], page)).toEqual([])
  })
})

describe('notesWithoutSteps — a note that is a step goes, nothing else', () => {
  const steps = ['## Service', 'Serve it cold.']
  it('the repeated line goes; a real note stays', () => {
    expect(notesWithoutSteps('Keeps three days.\nServe it cold!', steps)).toBe('Keeps three days.')
  })
  it('a heading is not a step: a note that repeats it stays', () => {
    expect(notesWithoutSteps('Service', steps)).toBe('Service')
  })
  it('nothing left → null, never an empty note', () => {
    expect(notesWithoutSteps('Serve it cold.', steps)).toBeNull()
    expect(notesWithoutSteps(null, steps)).toBeNull()
  })
})

describe('a read never stops at half a recipe', () => {
  const printed = 'Pouding\nIngrédients\n500 ml de cassonade\n500 ml d’eau\nPréparation\nMélanger le tout.\nCuire 40 minutes.'
  const html = (head: string, body: string) => `<html><head><title>Pouding</title>${head}</head><body>${body}</body></html>`
  const lines = printed.split('\n').map((l) => `<p>${l}</p>`).join('')
  const url = 'https://www.example.test/r'
  const ld = (type: string, node: object) => `<script type="${type}">${JSON.stringify(node)}</script>`
  const node = { '@context': 'https://schema.org', '@type': 'Recipe', name: 'Pouding', recipeIngredient: ['500 ml de cassonade'], recipeInstructions: ['Tout cuire.'] }

  it('microdata with the ingredients only → the printed steps fill the method (instantpot.com)', () => {
    const tagged = '<p itemprop="recipeIngredient">500 ml de cassonade</p><p itemprop="recipeIngredient">500 ml d’eau</p>'
    expect(importFromHtml(html('', tagged + lines), url)).toMatchObject({
      steps: ['Mélanger le tout.', 'Cuire 40 minutes.'],
      structuring: 'microdata',
    })
  })
  it('JSON-LD with no steps → the printed steps too', () => {
    const { recipeInstructions: _, ...noSteps } = node
    expect(importFromHtml(html(ld('application/ld+json', noSteps), lines), url).steps).toEqual(['Mélanger le tout.', 'Cuire 40 minutes.'])
  })
  it('a site’s own steps are never swapped for the printed ones', () => {
    expect(importFromHtml(html(ld('application/ld+json', node), lines), url).steps).toEqual(['Tout cuire.'])
  })
  it('a Recipe in a plain application/json block reads like JSON-LD, its notes field included', () => {
    const d = importFromHtml(html(ld('application/json', { ...node, notes: 'Meilleur tiède.' }), lines), url)
    expect(d).toMatchObject({ steps: ['Tout cuire.'], notes: 'Meilleur tiède.', structuring: 'jsonld' })
  })
  it('a plain JSON block that is not a Recipe is not even parsed', () => {
    const blob = '<script type="application/json">{"recipes":["Recipe"]</script>'
    expect(importFromHtml(html(blob, lines), url).structuring).toBe('headings')
  })
  it('halfRead: a missing half, section headings not counting as content', () => {
    expect(halfRead({ ingredients: ['1 œuf'], steps: ['Cuire.'] })).toBe(false)
    expect(halfRead({ ingredients: ['1 œuf'], steps: [] })).toBe(true)
    expect(halfRead({ ingredients: ['1 œuf'], steps: ['## Sauce'] })).toBe(true)
    expect(halfRead({ ingredients: [], steps: ['Cuire.'] })).toBe(true)
  })
  it('the share bar ends the notes; a bare « Partager » button does not end the recipe', () => {
    const r = parsePastedRecipe(
      'Pouding\nIngrédients\n500 ml de cassonade\n500 ml d’eau\nPartager\nPréparation\nMélanger le tout.\nCuire 40 minutes.\nNotes\nMeilleur tiède.\nPartager:\nPartager sur Instagram\nBOUTIQUE\nTout acheter',
    )
    expect(r.steps).toEqual(['Mélanger le tout.', 'Cuire 40 minutes.'])
    expect(r.notes).toBe('Meilleur tiède.')
  })
  it('a share bar with no « Partager : » line above it ends the notes too', () => {
    const r = parsePastedRecipe('Pouding\nIngrédients\n500 ml de cassonade\n500 ml d’eau\nPréparation\nMélanger le tout.\nNotes\nMeilleur tiède.\nPartager sur Facebook\nBOUTIQUE')
    expect(r.notes).toBe('Meilleur tiède.')
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
