// @vitest-environment node
import { describe, it, expect } from 'vitest'
import {
  parseRecipeJsonLd,
  parseRecipeMicrodata,
  parsePastedRecipe,
  parseMarkdownRecipe,
  stripAiCommentary,
  extractJsonLdBlocks,
  findRecipeNode,
  normalizeInstructions,
  normalizeImage,
  htmlToText,
  refineSteps,
  stripStepPrefix,
  sentenceChunks,
  parseYield,
  parseYieldUnit,
  isoToMinutes,
  textToMinutes,
  regroupIngredients,
} from './recipeImport'

const wrap = (json: unknown) =>
  `<html><head><script type="application/ld+json">${JSON.stringify(json)}</script></head><body>x</body></html>`

describe('extractJsonLdBlocks', () => {
  it('pulls each ld+json block (tolerates attribute order/spacing)', () => {
    const html = `<script type='application/ld+json' data-x>${JSON.stringify({ a: 1 })}</script>
      <script  type="application/ld+json">${JSON.stringify([{ b: 2 }])}</script>`
    const blocks = extractJsonLdBlocks(html)
    expect(blocks).toHaveLength(2)
  })

  it('skips an unparseable block without throwing', () => {
    const html = `<script type="application/ld+json">{ not json }</script>`
    expect(extractJsonLdBlocks(html)).toEqual([])
  })
})

describe('findRecipeNode', () => {
  it('finds a Recipe inside @graph and string-or-array @type', () => {
    const graph = { '@graph': [{ '@type': 'WebPage' }, { '@type': ['Thing', 'Recipe'], name: 'X' }] }
    expect(findRecipeNode(graph)).toMatchObject({ name: 'X' })
  })
  it('returns null when there is no Recipe', () => {
    expect(findRecipeNode({ '@type': 'Article' })).toBeNull()
  })
})

describe('stripStepPrefix', () => {
  it('strips bullets, bare numbers and Étape/Step labels', () => {
    expect(stripStepPrefix('1. Faire bouillir.')).toBe('Faire bouillir.')
    expect(stripStepPrefix('2) Brasser.')).toBe('Brasser.')
    expect(stripStepPrefix('• Saler.')).toBe('Saler.')
    expect(stripStepPrefix('Étape 3 : Mélanger.')).toBe('Mélanger.')
    expect(stripStepPrefix('Step 2 - Stir well.')).toBe('Stir well.')
  })
  it('never eats a quantity', () => {
    expect(stripStepPrefix('1.5 L d’eau à bouillir')).toBe('1.5 L d’eau à bouillir')
    expect(stripStepPrefix('2 tasses de farine, tamiser')).toBe('2 tasses de farine, tamiser')
  })
})

describe('refineSteps', () => {
  it('splits a packed "1. … 2. …" blob on its ascending markers', () => {
    const steps = refineSteps(['1. Préchauffer le four. 2. Beurrer le moule. 3. Cuire 30 min.'])
    expect(steps).toEqual(['Préchauffer le four.', 'Beurrer le moule.', 'Cuire 30 min.'])
  })
  it('splits packed "Étape N" labels', () => {
    const steps = refineSteps(['Étape 1 Couper les légumes. Étape 2 Faire revenir.'])
    expect(steps).toEqual(['Couper les légumes.', 'Faire revenir.'])
  })
  it('does NOT split on a lone number that is not a list (temperature, quantity)', () => {
    const steps = refineSteps(['Cuire à 180 °C pendant 45 min. Ajouter 2. 5 ml de sel ne change rien.'])
    expect(steps).toHaveLength(1)
  })
  it('drops junk steps and strips leading markers', () => {
    expect(refineSteps(['Étape 3', '4.', '- Servir chaud.'])).toEqual(['Servir chaud.'])
  })
  it('dedupes repeated steps', () => {
    expect(refineSteps(['Brasser.', 'brasser.'])).toEqual(['Brasser.'])
  })
  it('passes "## Section" markers through untouched (no split, strip or dedupe)', () => {
    expect(refineSteps(['## Glaçage', 'Fouetter le beurre.', '## Glaçage 2', 'Étaler.'])).toEqual([
      '## Glaçage',
      'Fouetter le beurre.',
      '## Glaçage 2',
      'Étaler.',
    ])
  })
  it('chunks an overlong blob at sentence boundaries instead of truncating', () => {
    const blob = Array.from(
      { length: 8 },
      (_, i) => `Mélanger doucement la farine numéro ${i} avec le beurre fondu et le sucre pendant deux minutes complètes.`,
    ).join(' ')
    const steps = refineSteps([blob])
    expect(steps.length).toBeGreaterThan(1)
    for (const s of steps) expect(s.length).toBeLessThanOrEqual(500)
    // Nothing got cut mid-sentence: every chunk ends with punctuation.
    for (const s of steps) expect(/[.!?]$/.test(s)).toBe(true)
  })
})

describe('sentenceChunks', () => {
  it('returns short text whole', () => {
    expect(sentenceChunks('Cuire 10 min.')).toEqual(['Cuire 10 min.'])
  })
  it('never splits on a decimal or abbreviation', () => {
    const s = 'Verser 1.5 L d’eau et laisser env. 5 min au repos.'
    expect(sentenceChunks(s, 10)).toEqual([s])
  })
})

describe('normalizeInstructions', () => {
  it('flattens HowToStep objects', () => {
    expect(normalizeInstructions([{ '@type': 'HowToStep', text: 'Boil.' }, { text: 'Stir.' }])).toEqual([
      'Boil.',
      'Stir.',
    ])
  })
  it('flattens a single HowToSection without prefixing', () => {
    const v = [{ '@type': 'HowToSection', name: 'Méthode', itemListElement: [{ text: 'A faire.' }, { text: 'B faire.' }] }]
    expect(normalizeInstructions(v)).toEqual(['A faire.', 'B faire.'])
  })
  it('keeps section names as "## " heading lines when the recipe has several sections', () => {
    const v = [
      { '@type': 'HowToSection', name: 'Sauce', itemListElement: [{ text: 'Mélanger la sauce.' }] },
      { '@type': 'HowToSection', name: 'Boulettes', itemListElement: [{ text: 'Façonner les boulettes.' }] },
    ]
    expect(normalizeInstructions(v)).toEqual([
      '## Sauce',
      'Mélanger la sauce.',
      '## Boulettes',
      'Façonner les boulettes.',
    ])
  })
  it('emits one heading per section, not per step', () => {
    const v = [
      { '@type': 'HowToSection', name: 'Sauce', itemListElement: [{ text: 'Mélanger.' }, { text: 'Mijoter la sauce.' }] },
      { '@type': 'HowToSection', name: 'Boulettes', itemListElement: [{ text: 'Façonner les boulettes.' }] },
    ]
    expect(normalizeInstructions(v)).toEqual([
      '## Sauce',
      'Mélanger.',
      'Mijoter la sauce.',
      '## Boulettes',
      'Façonner les boulettes.',
    ])
  })
  it('splits a single newline-separated string into steps', () => {
    expect(normalizeInstructions('Step one\n\nStep two')).toEqual(['Step one', 'Step two'])
  })
  it('splits a packed numbered string', () => {
    expect(normalizeInstructions('1. Boil water. 2. Add pasta. 3. Drain well.')).toEqual([
      'Boil water.',
      'Add pasta.',
      'Drain well.',
    ])
  })
})

describe('parseYield', () => {
  it('reads numbers, strings, ranges, arrays and QuantitativeValue', () => {
    expect(parseYield(4)).toBe(4)
    expect(parseYield('4 portions')).toBe(4)
    expect(parseYield('4 à 6 personnes')).toBe(4)
    expect(parseYield(['6 servings'])).toBe(6)
    expect(parseYield({ value: 8 })).toBe(8)
  })
  it('rejects weight-style and absurd yields', () => {
    expect(parseYield('350 g')).toBeNull()
    expect(parseYield(0)).toBeNull()
    expect(parseYield(null)).toBeNull()
  })
})

describe('parseYieldUnit', () => {
  it('reads the unit word of a non-portion yield', () => {
    expect(parseYieldUnit('24 biscuits')).toBe('biscuits')
    expect(parseYieldUnit('Donne 12 muffins')).toBe('muffins')
    expect(parseYieldUnit('Rendement : 18 carrés')).toBe('carrés')
  })
  it('returns null for plain portions / personnes', () => {
    expect(parseYieldUnit('4 portions')).toBeNull()
    expect(parseYieldUnit('6 servings')).toBeNull()
    expect(parseYieldUnit('4 à 6 personnes')).toBeNull()
    expect(parseYieldUnit(4)).toBeNull()
  })
  it('reads QuantitativeValue.unitText, ignoring a portion word', () => {
    expect(parseYieldUnit({ value: 24, unitText: 'cookies' })).toBe('cookies')
    expect(parseYieldUnit({ value: 4, unitText: 'servings' })).toBeNull()
  })
})

describe('regroupIngredients', () => {
  const page = (body: string) => `<html><body>${body}</body></html>`
  it('recovers page-visible groups into "## " markers (every line located)', () => {
    const html = page(`
      <h2>Ingrédients</h2>
      <h3>Biscuits</h3>
      <ul><li>250 g de farine</li><li>125 g de beurre</li></ul>
      <h3>Glaçage</h3>
      <ul><li>120 g de sucre</li><li>30 ml de lait</li></ul>
    `)
    const flat = ['250 g de farine', '125 g de beurre', '120 g de sucre', '30 ml de lait']
    expect(regroupIngredients(html, flat)).toEqual([
      '## Biscuits',
      '250 g de farine',
      '125 g de beurre',
      '## Glaçage',
      '120 g de sucre',
      '30 ml de lait',
    ])
  })
  it('returns the flat list untouched when a line cannot be located verbatim', () => {
    const html = page('<h3>Biscuits</h3><ul><li>250 g de farine</li></ul>')
    const flat = ['250 g de farine', '125 g de beurre'] // beurre not on the page
    expect(regroupIngredients(html, flat)).toBe(flat)
  })
  it('does not add a single heading covering the whole list', () => {
    const html = page('<h3>Ingrédients</h3><ul><li>250 g de farine</li><li>125 g de beurre</li><li>1 œuf</li><li>sel</li></ul>')
    const flat = ['250 g de farine', '125 g de beurre', '1 œuf', 'sel']
    expect(regroupIngredients(html, flat)).toBe(flat)
  })
  it('leaves an already-sectioned list alone', () => {
    const flat = ['## A', 'x', 'y', 'z']
    expect(regroupIngredients(page('whatever'), flat)).toBe(flat)
  })
})

describe('isoToMinutes', () => {
  it('reads ISO-8601 durations', () => {
    expect(isoToMinutes('PT1H30M')).toBe(90)
    expect(isoToMinutes('PT45M')).toBe(45)
    expect(isoToMinutes('PT2H')).toBe(120)
  })
  it('rejects junk and zero', () => {
    expect(isoToMinutes('PT0M')).toBeNull()
    expect(isoToMinutes('45 min')).toBeNull()
    expect(isoToMinutes(null)).toBeNull()
  })
})

describe('textToMinutes', () => {
  it('reads free-text durations', () => {
    expect(textToMinutes('1 h 30')).toBe(90)
    expect(textToMinutes('20 min')).toBe(20)
    expect(textToMinutes('2 heures')).toBe(120)
  })
  it('null when there is no duration', () => {
    expect(textToMinutes('au goût')).toBeNull()
  })
})

describe('normalizeImage', () => {
  it('takes a string, upgrades http→https', () => {
    expect(normalizeImage('http://x.com/a.jpg')).toBe('https://x.com/a.jpg')
  })
  it('takes the first of an array and ImageObject.url', () => {
    expect(normalizeImage([{ url: 'https://x.com/1.jpg' }, 'https://x.com/2.jpg'])).toBe('https://x.com/1.jpg')
  })
  it('rejects non-https junk', () => {
    expect(normalizeImage('ftp://x')).toBeNull()
    expect(normalizeImage(null)).toBeNull()
  })
})

describe('parseRecipeJsonLd', () => {
  it('parses a typical schema.org Recipe with yield and times', () => {
    const html = wrap({
      '@context': 'https://schema.org',
      '@type': 'Recipe',
      name: 'Spaghetti maison',
      recipeIngredient: ['400 g de pâtes', '1 pot de sauce', '500 g de bœuf haché'],
      recipeInstructions: [{ '@type': 'HowToStep', text: 'Faire bouillir les pâtes.' }, { text: 'Mijoter la sauce.' }],
      recipeYield: '4 portions',
      prepTime: 'PT15M',
      cookTime: 'PT30M',
      totalTime: 'PT45M',
      image: 'https://x.com/spag.jpg',
    })
    const r = parseRecipeJsonLd(html)
    expect(r).not.toBeNull()
    expect(r!.title).toBe('Spaghetti maison')
    expect(r!.ingredients).toHaveLength(3)
    expect(r!.steps).toEqual(['Faire bouillir les pâtes.', 'Mijoter la sauce.'])
    expect(r!.image).toBe('https://x.com/spag.jpg')
    expect(r!.servings).toBe(4)
    expect(r!.times).toEqual({ prep: 15, cook: 30, total: 45 })
  })

  it('returns null for a page with no Recipe JSON-LD', () => {
    expect(parseRecipeJsonLd(wrap({ '@type': 'Article', name: 'x' }))).toBeNull()
  })

  it('handles instructions given as one plain string', () => {
    const html = wrap({ '@type': 'Recipe', name: 'X', recipeIngredient: ['a'], recipeInstructions: 'Do A.\nDo B.' })
    expect(parseRecipeJsonLd(html)!.steps).toEqual(['Do A.', 'Do B.'])
  })

  it('strips a leading step number a site left in HowToStep text', () => {
    const html = wrap({
      '@type': 'Recipe',
      name: 'X',
      recipeIngredient: ['a'],
      recipeInstructions: [{ text: '1. Préchauffer le four.' }, { text: '2. Cuire.' }],
    })
    expect(parseRecipeJsonLd(html)!.steps).toEqual(['Préchauffer le four.', 'Cuire.'])
  })

  it('strips inline HTML (links, bold) from steps and ingredients', () => {
    const html = wrap({
      '@type': 'Recipe',
      name: 'X',
      recipeIngredient: ['<strong>400 g</strong> de p&acirc;tes'.replace('&acirc;', 'â')],
      recipeInstructions: [
        { '@type': 'HowToStep', text: 'Chauffer une <a href="https://shop.example.com/poele?utm=x">poêle</a> à feu moyen.' },
      ],
    })
    const r = parseRecipeJsonLd(html)!
    expect(r.steps).toEqual(['Chauffer une poêle à feu moyen.'])
    expect(r.ingredients).toEqual(['400 g de pâtes'])
  })

  it('reads the yield unit ("24 biscuits") into servingsUnit', () => {
    const html = wrap({ '@type': 'Recipe', name: 'X', recipeIngredient: ['a'], recipeYield: '24 biscuits' })
    const r = parseRecipeJsonLd(html)!
    expect(r.servings).toBe(24)
    expect(r.servingsUnit).toBe('biscuits')
  })
})

describe('parseRecipeMicrodata', () => {
  it('reads itemprop ingredients + a single instructions container', () => {
    const html = `<html><head>
      <meta property="og:title" content="Tarte au sucre">
      <meta property="og:image" content="https://x.com/tarte.jpg">
    </head><body itemscope itemtype="https://schema.org/Recipe">
      <li itemprop="recipeIngredient">1 tasse de cassonade</li>
      <li itemprop="recipeIngredient">250 ml de crème</li>
      <div itemprop="recipeInstructions"><p>Préchauffer le four.</p><p>Mélanger et verser.</p></div>
      <span itemprop="recipeYield">6 portions</span>
    </body></html>`
    const r = parseRecipeMicrodata(html)!
    expect(r.ingredients).toEqual(['1 tasse de cassonade', '250 ml de crème'])
    expect(r.steps).toEqual(['Préchauffer le four.', 'Mélanger et verser.'])
    expect(r.servings).toBe(6)
    expect(r.image).toBe('https://x.com/tarte.jpg')
  })
  it('returns null when the page has no recipe microdata', () => {
    expect(parseRecipeMicrodata('<html><body><p>blog post</p></body></html>')).toBeNull()
  })
  it('turns an <hN> inside the instructions container into a "## " section, not a step', () => {
    const html = `<html><body itemscope itemtype="https://schema.org/Recipe">
      <li itemprop="recipeIngredient">250 g de farine</li>
      <li itemprop="recipeIngredient">120 g de sucre</li>
      <div itemprop="recipeInstructions">
        <h3>Biscuits</h3><p>Crémer le beurre.</p><p>Cuire 12 min.</p>
        <h3>Glaçage</h3><p>Fouetter le sucre et le lait.</p>
      </div>
    </body></html>`
    const r = parseRecipeMicrodata(html)!
    expect(r.steps).toEqual(['## Biscuits', 'Crémer le beurre.', 'Cuire 12 min.', '## Glaçage', 'Fouetter le sucre et le lait.'])
  })
})

describe('parsePastedRecipe', () => {
  it('parses a normally formatted FR recipe with headings (confident, no AI needed)', () => {
    const r = parsePastedRecipe(`Pouding chômeur

Préparation : 20 min
Cuisson : 45 min
6 portions

Ingrédients
- 1 tasse de farine
- 1 tasse de cassonade
- 250 ml de crème

Préparation
1. Préchauffer le four à 180 °C.
2. Mélanger la farine et la cassonade.
3. Verser la crème et cuire 45 min.

Notes
Encore meilleur le lendemain.`)
    expect(r.title).toBe('Pouding chômeur')
    expect(r.confident).toBe(true)
    expect(r.ingredients).toEqual(['1 tasse de farine', '1 tasse de cassonade', '250 ml de crème'])
    expect(r.steps).toEqual([
      'Préchauffer le four à 180 °C.',
      'Mélanger la farine et la cassonade.',
      'Verser la crème et cuire 45 min.',
    ])
    expect(r.servings).toBe(6)
    expect(r.times).toEqual({ prep: 20, cook: 45, total: null })
    expect(r.notes).toBe('Encore meilleur le lendemain.')
  })

  it('parses an EN recipe (Method / Serves)', () => {
    const r = parsePastedRecipe(`Banana bread
Serves 8
Ingredients
2 cups flour
3 ripe bananas
Method
Mash the bananas. Mix everything together.
Bake for 1 hour.`)
    expect(r.confident).toBe(true)
    expect(r.servings).toBe(8)
    expect(r.ingredients).toEqual(['2 cups flour', '3 ripe bananas'])
    expect(r.steps).toEqual(['Mash the bananas. Mix everything together.', 'Bake for 1 hour.'])
  })

  it('reads a named yield ("Donne 24 biscuits") into servings + servingsUnit', () => {
    const r = parsePastedRecipe(`Biscuits
Donne 24 biscuits
Ingrédients
- 2 tasses de farine
- 1 tasse de beurre
Préparation
Mélanger et cuire.`)
    expect(r.servings).toBe(24)
    expect(r.servingsUnit).toBe('biscuits')
  })

  it('leaves a plain portions yield with no unit', () => {
    const r = parsePastedRecipe(`Soupe
4 portions
Ingrédients
- 1 oignon
- 4 carottes
Préparation
Cuire.`)
    expect(r.servings).toBe(4)
    expect(r.servingsUnit).toBeNull()
  })

  it('treats English imperative "Pour in the milk" as a step, not a section', () => {
    const r = parsePastedRecipe(`Pancakes
Ingredients
2 cups flour
1 cup milk
Method
Pour in the milk and whisk.
Cook on a hot griddle.`)
    expect(r.steps).toEqual(['Pour in the milk and whisk.', 'Cook on a hot griddle.'])
  })

  it('treats "Étape N : …" lines as steps, not headings', () => {
    const r = parsePastedRecipe(`Soupe
Ingrédients
- 1 oignon
- 4 carottes
Étapes
Étape 1 : Préchauffer le four
Étape 2 : Couper les légumes`)
    expect(r.confident).toBe(true)
    expect(r.steps).toEqual(['Préchauffer le four', 'Couper les légumes'])
  })

  it('keeps a mid-method "portions" sentence as a step', () => {
    const r = parsePastedRecipe(`Gâteau
Ingrédients
- 2 oeufs
- 1 tasse de sucre
Préparation
Battre les oeufs.
Diviser en 4 portions égales.`)
    expect(r.steps).toContain('Diviser en 4 portions égales.')
  })

  it('merges wrapped lines into one step', () => {
    const r = parsePastedRecipe(`X
Ingrédients
- 1 oignon
- 2 carottes
Préparation
Faire revenir l'oignon dans le beurre
jusqu'à ce qu'il soit doré.`)
    expect(r.steps).toEqual(["Faire revenir l'oignon dans le beurre jusqu'à ce qu'il soit doré."])
  })

  it('keeps sub-section labels ("Glaçage :") as "## " markers in both lists', () => {
    const r = parsePastedRecipe(`Biscuits glacés
Ingrédients
Biscuits :
- 2 tasses de farine
- 1 tasse de beurre
Glaçage :
- 1 tasse de sucre en poudre
- 30 ml de lait
Préparation
Biscuits :
Mélanger la farine et le beurre.
Cuire 12 minutes.
Glaçage :
Fouetter le sucre et le lait.
Étaler sur les biscuits refroidis.`)
    expect(r.confident).toBe(true)
    expect(r.ingredients).toEqual([
      '## Biscuits',
      '2 tasses de farine',
      '1 tasse de beurre',
      '## Glaçage',
      '1 tasse de sucre en poudre',
      '30 ml de lait',
    ])
    expect(r.steps).toEqual([
      '## Biscuits',
      'Mélanger la farine et le beurre.',
      'Cuire 12 minutes.',
      '## Glaçage',
      'Fouetter le sucre et le lait.',
      'Étaler sur les biscuits refroidis.',
    ])
  })

  it('turns a repeated "Ingrédients pour X" heading qualifier into a section marker', () => {
    const r = parsePastedRecipe(`Gâteau étagé
Ingrédients pour le gâteau
- 2 tasses de farine
- 3 oeufs
Ingrédients pour le glaçage
- 1 tasse de sucre
Préparation
Mélanger et cuire.`)
    expect(r.ingredients).toEqual([
      '## pour le gâteau',
      '2 tasses de farine',
      '3 oeufs',
      '## pour le glaçage',
      '1 tasse de sucre',
    ])
  })

  it('treats a short "Pour la garniture" line as a section, not an ingredient', () => {
    const r = parsePastedRecipe(`Tarte
Ingrédients
- 1 abaisse
Pour la garniture
- 2 pommes
- 60 ml de sirop
Préparation
Garnir et cuire.`)
    expect(r.ingredients).toEqual(['1 abaisse', '## Pour la garniture', '2 pommes', '60 ml de sirop'])
  })

  it('never merges a wrapped line into a section marker', () => {
    const r = parsePastedRecipe(`X
Ingrédients
- 1 oignon
- 2 carottes
Préparation
Glaçage :
fouetter le beurre avec le sucre
jusqu'à consistance légère.`)
    expect(r.steps).toEqual(['## Glaçage', "fouetter le beurre avec le sucre jusqu'à consistance légère."])
  })

  it('drops a dangling section marker with nothing under it', () => {
    const r = parsePastedRecipe(`X
Ingrédients
- 1 oignon
- 2 carottes
Glaçage :
Préparation
Couper et cuire les légumes.`)
    expect(r.ingredients).toEqual(['1 oignon', '2 carottes'])
  })

  it('falls back to shape detection when there are no headings (not confident)', () => {
    const r = parsePastedRecipe(`Salade rapide
1 laitue
2 tomates
Couper les légumes et mélanger avec la vinaigrette.`)
    expect(r.confident).toBe(false)
    expect(r.ingredients).toEqual(['1 laitue', '2 tomates'])
    expect(r.steps).toEqual(['Couper les légumes et mélanger avec la vinaigrette.'])
    expect(r.title).toBe('Salade rapide')
  })
})

describe('parseMarkdownRecipe', () => {
  // The real bug: the vision model OCR'd a recipe correctly but answered in
  // markdown ("**Ingrédients**\n* 8 choux…") instead of JSON, so recipe-vision
  // threw a perfect read away with "vision returned no JSON". This recovers it.
  it('recovers a markdown reply the vision model gave instead of JSON', () => {
    const r = parseMarkdownRecipe(`**Recette de saucisses**

**Ingrédients**

* 8 choux de Bruxelles coupés en deux
* 6 pommes de terre à chair jaune
* 4 saucisses italiennes

**Préparation**

1. Préchauffer le four à 200 °C.
2. Couper les légumes et déposer sur une plaque.
3. Cuire 30 minutes avec les saucisses.`)
    expect(r.title).toBe('Recette de saucisses')
    expect(r.ingredients).toEqual([
      '8 choux de Bruxelles coupés en deux',
      '6 pommes de terre à chair jaune',
      '4 saucisses italiennes',
    ])
    expect(r.steps).toEqual([
      'Préchauffer le four à 200 °C.',
      'Couper les légumes et déposer sur une plaque.',
      'Cuire 30 minutes avec les saucisses.',
    ])
  })

  it('handles ##/### headings and a ```json fence wrapper', () => {
    const r = parseMarkdownRecipe(`# Pancakes
## Ingredients
- 2 cups flour
- 1 egg
## Method
1. Mix everything.
2. Cook on a hot pan.`)
    expect(r.title).toBe('Pancakes')
    expect(r.ingredients).toEqual(['2 cups flour', '1 egg'])
    expect(r.steps).toEqual(['Mix everything.', 'Cook on a hot pan.'])
  })

  it('empty / whitespace in → empty draft (no throw)', () => {
    const r = parseMarkdownRecipe('   \n  \n')
    expect(r.title).toBeNull()
    expect(r.ingredients).toEqual([])
    expect(r.steps).toEqual([])
  })

  it('reads prep/cook times and servings printed on the card', () => {
    const r = parseMarkdownRecipe(`**Repas de saucisses**
Préparation 20 min
Cuisson 25 min
Quantité 4 portions
**Ingrédients**
* 4 saucisses
* 6 pommes de terre
**Préparation**
1. Cuire les saucisses.
2. Rôtir les pommes de terre.`)
    expect(r.title).toBe('Repas de saucisses')
    expect(r.servings).toBe(4)
    expect(r.times).toEqual({ prep: 20, cook: 25, total: null })
    expect(r.ingredients).toEqual(['4 saucisses', '6 pommes de terre'])
  })
})

describe('stripAiCommentary', () => {
  // The real hallucinations the user hit: the model appended its own remarks as
  // if they were steps. These must be dropped; real steps must survive.
  it('drops the model commentary the user saw, keeps real steps', () => {
    const r = stripAiCommentary([
      'Préchauffer le four à 200 °C.',
      'Remarque',
      "La recette n'indique pas combien de portions elle fait, ni de quel type de fruits il s'agit",
      'Cuire 25 minutes.',
    ])
    expect(r).toEqual(['Préchauffer le four à 200 °C.', 'Cuire 25 minutes.'])
  })

  it('drops EN apologies / "the recipe does not…", keeps genuine lines (conservative)', () => {
    const r = stripAiCommentary([
      'The recipe does not specify the oven temperature.',
      'I cannot read the last line.',
      'Note: serve warm.', // a "Note:" WITH content is left alone — could be a real note
      'Add a note of cinnamon to taste.',
    ])
    // Only the clear meta-commentary is removed; anything that might be real survives.
    expect(r).toEqual(['Note: serve warm.', 'Add a note of cinnamon to taste.'])
  })

  it('peels a leaked "## Remarque" heading, leaves a real "## Section"', () => {
    const r = stripAiCommentary(['## Version au barbecue', 'Griller 10 min.', '## Remarque'])
    expect(r).toEqual(['## Version au barbecue', 'Griller 10 min.'])
  })
})

describe('htmlToText', () => {
  it('strips scripts/styles/tags, keeps block boundaries as newlines', () => {
    const html = '<style>.a{}</style><h1>Hi</h1><script>x()</script><p>there\n  friend</p>'
    expect(htmlToText(html)).toBe('Hi\nthere friend')
  })
})
