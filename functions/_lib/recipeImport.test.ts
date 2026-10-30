// @vitest-environment node
import { describe, it, expect } from 'vitest'
import {
  parseRecipeJsonLd,
  parseRecipeMicrodata,
  parsePastedRecipe,
  parseMarkdownRecipe,
  parseRecipeText,
  looksLikeMarkdown,
  stripAiCommentary,
  extractJsonLdBlocks,
  findRecipeNode,
  normalizeInstructions,
  normalizeImage,
  htmlToText,
  recipeTextWindow,
  refineSteps,
  healTruncatedSteps,
  MAX_STEP_LEN,
  MAX_STEPS,
  pageMeta,
  pageIngredientsPlausible,
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
  it('keeps a repeated step — a multi-part recipe prints « Mélanger. » under each part; the audit flags a true double', () => {
    expect(refineSteps(['Brasser.', 'brasser.'])).toEqual(['Brasser.', 'brasser.'])
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

describe('healTruncatedSteps', () => {
  // The real regression: a step chopped at exactly 200 chars (the old save cap),
  // its full text preserved in the original snapshot. Mirrors the "Crêpes minces".
  const full =
    'Pour chaque crêpe, verser environ 45 ml (3 c. à soupe) de pâte au centre de la poêle. En faisant pivoter la poêle, tenter de répandre la pâte également pour recouvrir tout le fond. Lorsque le rebord se décolle facilement et commence à dorer, c’est le temps de retourner la crêpe. Poursuivre la cuisson 10 secondes puis retirer de la poêle.'
  const chopped = full.slice(0, 200)

  it('restores a 200-char truncated step from the original snapshot', () => {
    expect(healTruncatedSteps([chopped], [full])).toEqual([full])
  })
  it('heals only the truncated step, leaving complete ones untouched', () => {
    const other = 'Chauffer une poêle antiadhésive à feu moyen.'
    expect(healTruncatedSteps([other, chopped], [other, full])).toEqual([other, full])
  })
  it('is idempotent — a second pass changes nothing', () => {
    const once = healTruncatedSteps([chopped], [full])
    expect(healTruncatedSteps(once, [full])).toEqual(once)
  })
  it('never touches a step the cook shortened by hand (not a prefix of the original)', () => {
    const edited = 'Répandre la pâte pour couvrir tout le fond de la poêle, puis dorer les deux côtés à feu moyen sans jamais brûler le beurre, en surveillant de très près la coloration et en ajustant le feu au besoin'
    expect(edited.length).toBeGreaterThan(180)
    expect(healTruncatedSteps([edited], [full])).toEqual([edited])
  })
  it('leaves a complete short step alone even if it prefixes an original', () => {
    expect(healTruncatedSteps(['Mélanger.'], ['Mélanger. Ajouter le sel.'])).toEqual(['Mélanger.'])
  })
  it('consumes originals left-to-right so shared-prefix steps each heal to their own', () => {
    const shared =
      'Battre les oeufs avec le sucre jusqu’à ce que le mélange blanchisse et double de volume, environ trois minutes au batteur électrique en raclant bien les parois du bol à mi-parcours pour une texture parfaitement uniforme '
    const a = shared + 'puis réserver au frais.'
    const b = shared + 'puis incorporer la farine tamisée.'
    const prefix = shared.slice(0, 195) // within the shared lead, chopped mid-word → prefixes BOTH
    expect(healTruncatedSteps([prefix, prefix], [a, b])).toEqual([a, b])
  })
  it('no-ops when there is no original to heal from', () => {
    expect(healTruncatedSteps([chopped], undefined)).toEqual([chopped])
    expect(healTruncatedSteps([chopped], [])).toEqual([chopped])
  })
  it('MAX_STEP_LEN is 1000 and does not chop a long real step', () => {
    expect(MAX_STEP_LEN).toBe(1000)
    const long = 'A'.repeat(700) + '.'
    expect(refineSteps([long])[0].length).toBe(701)
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

  it('a recettes.qc.ca page pasted whole: the date, byline and tail chrome are not recipe (Marc, 2026-10-27)', () => {
    // Pasted as-is from the site. The first line is a DATE, then a byline and a
    // description, then the meta block; after the method come « Catégories » and
    // « Mots-clés » blocks. Before: the title was « 28 janv. 2026 » and four tail
    // lines (« Catégories », « Pâtes alimentaires », « Mots-clés », « pates
    // alimentaires ») became steps 7–10 — Marc trimmed the paste by hand and re-ran.
    const page = `28 janv. 2026
Macaroni à la viande de grand-mère
Par charclau
Recette de macaroni à la viande de grand-mère

  Photographe : Adobe Stock

Partage

    Préparation 15 minutes
    Cuisson 10 minutes
    Total 25 minutes
    Portion(s) 4 portions

Ingrédients

    1 lb boeuf haché maigre
    1 oignon émincé
    2 gousses d'ail
    2 boîtes soupe aux tomates
    3 tasses macaronis non cuits
    6 tranches fromages

Préparation
Étape 1

Faire cuire les macaronis selon le temps de cuisson recommandé et égoutter.
Étape 2

Faire revenir l'oignon et l'ail dans une poêle. Ajouter la viande et faire cuire jusqu'à ce que le steak hâché soit entièrement cuit.
Étape 3

Ajouter les deux boîtes de soupe aux tomates et continuer la cuisson pendant 5 minutes ou jusqu'à ce que la préparation soit chaude.
Étape 4

Dans un plat allant au four, mélanger la préparation de viande avec les macaronis.
Étape 5

Recouvrir de tranches de fromage et faire cuire à 350 F. sans couvrir jusqu'à ce que le fromage soit fondu.
Étape 6

Faire griller à "broil" pendant quelques minutes pour rendre le fromage croustillant.
Catégories

    Pâtes alimentaires

Mots-clés

    pates alimentaires
`
    const r = parsePastedRecipe(page)
    expect(r.confident).toBe(true)
    expect(r.title).toBe('Macaroni à la viande de grand-mère')
    expect(r.servings).toBe(4)
    expect(r.times).toEqual({ prep: 15, cook: 10, total: 25 })
    expect(r.ingredients).toHaveLength(6)
    expect(r.ingredients[0]).toBe('1 lb boeuf haché maigre')
    expect(r.steps).toHaveLength(6)
    expect(r.steps[0]).toMatch(/^Faire cuire les macaronis/)
    expect(r.steps[5]).toMatch(/^Faire griller à "broil"/)
    expect(r.steps.join('\n')).not.toMatch(/Catégories|Mots-clés|alimentaires|Photographe|Partage/)
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
  // A cookbook's notes box is headed « Notes » — the heading the parsers find the notes
  // by. It was eaten as a leaked label (Marc's « Saumon à l'asiatique », 2026-10-30).
  it('keeps a printed « Notes » heading', () => {
    expect(stripAiCommentary(['Servir.', 'Notes', 'Ne gaspillez plus de gingembre!'])).toEqual(['Servir.', 'Notes', 'Ne gaspillez plus de gingembre!'])
  })
})

// A cookbook card as a second reader lists it (Sonnet 5.5 on the photo corpus,
// 2026-10-30): the time/yield badges down the page's edge come out label on one line,
// value on the next, and the keeping note is numbered as the last step.
describe('parseRecipeText — a numbered card with its badges split over two lines', () => {
  const card = [
    'Muffins à la pêche Melba',
    '• 250 ml (1 tasse) de farine tout usage',
    '• 2 œufs',
    '1 Préchauffer le four à 205 °C (400 °F).',
    '2 Dans un bol, mélanger la farine et les œufs.',
    '3 Se conserve de 1 à 2 jours à température ambiante dans un contenant hermétique.',
    'PRÉPARATION',
    '20 MINUTES',
    'CUISSON',
    '20 MINUTES',
    'QUANTITÉ',
    '12 MUFFINS',
    'SE CONGÈLE',
    'À congeler',
  ].join('\n')
  it('a label alone is not the method heading: the body above it is kept, the badge is read', () => {
    const r = parseRecipeText(card)
    expect(r.title).toBe('Muffins à la pêche Melba')
    expect(r.ingredients).toEqual(['250 ml (1 tasse) de farine tout usage', '2 œufs'])
    expect(r.steps).toEqual([
      'Préchauffer le four à 205 °C (400 °F).',
      'Dans un bol, mélanger la farine et les œufs.',
      'Se conserve de 1 à 2 jours à température ambiante dans un contenant hermétique.',
    ])
    expect(r.times).toEqual({ prep: 20, cook: 20, total: null })
  })
  it('« Se conserve de 1 à 2 jours » is a keeping note, never a yield of « 1 jours »; the yield is the badge’s', () => {
    const r = parseRecipeText(card)
    expect(r.servings).toBe(12)
    expect(r.servingsUnit).toBe('muffins')
  })
  it('a badge under the method (« SE CONGÈLE », « À congeler ») is not a note', () => {
    expect(parseRecipeText(card).notes).toBeNull()
  })
})

describe('htmlToText', () => {
  it('strips scripts/styles/tags, keeps block boundaries as newlines', () => {
    const html = '<style>.a{}</style><h1>Hi</h1><script>x()</script><p>there\n  friend</p>'
    expect(htmlToText(html)).toBe('Hi\nthere friend')
  })
})

describe('recipeTextWindow', () => {
  const NAV = 'Accueil Recettes Conversions Lexique Substitutions S’abonner Créer une recette '.repeat(90)
  const RECIPE = 'Ingrédients\n2 tasses de farine\n1 c. à thé de sel\n\nPréparation\nÉtape 1\nMélanger.'

  it('leaves short text alone', () => {
    expect(recipeTextWindow('Ingrédients\nsel', 6000)).toBe('Ingrédients\nsel')
  })

  it('windows onto the recipe when nav chrome would eat the budget', () => {
    const page = NAV + '\n' + RECIPE
    // The regression: "Ingrédients" sits past the model's cap, so a head slice misses it.
    expect(page.indexOf('Ingrédients')).toBeGreaterThan(6000)
    const win = recipeTextWindow(page, 6000)
    expect(win).toContain('Ingrédients')
    expect(win).toContain('2 tasses de farine')
    expect(win).toContain('Étape 1')
    expect(win.length).toBeLessThanOrEqual(6000)
  })

  it('falls back to the preparation heading when there is no ingredients one', () => {
    const win = recipeTextWindow(NAV + '\nPréparation\nÉtape 1\nMélanger.', 6000)
    expect(win).toContain('Préparation')
    expect(win).toContain('Mélanger.')
  })

  it('head-slices when no anchor is found at all', () => {
    const plain = 'x'.repeat(9000)
    expect(recipeTextWindow(plain, 6000)).toBe('x'.repeat(6000))
  })
})

describe('parseRecipeText — markdown-shaped transcripts take the no-AI path', () => {
  it('a cloud-OCR markdown read (headings + table) parses CONFIDENT, no AI needed', () => {
    const md = [
      '# Biscuits à l’avoine',
      '',
      '## Ingrédients',
      '| 225 g | de farine |',
      '| --- | --- |',
      '| 2 | œufs |',
      '',
      '## Préparation',
      '1. Mélanger le tout.',
    ].join('\n')
    expect(looksLikeMarkdown(md)).toBe(true)
    const r = parseRecipeText(md)
    expect(r.confident).toBe(true)
    expect(r.ingredients).toEqual(['225 g de farine', '2 œufs'])
    expect(r.steps).toEqual(['Mélanger le tout.'])
  })

  it('plain text goes straight through parsePastedRecipe', () => {
    const plain = 'Tarte\nIngrédients\n2 pommes\n1 pâte\nPréparation\nCuire 40 minutes.'
    expect(looksLikeMarkdown(plain)).toBe(false)
    expect(parseRecipeText(plain).confident).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Import fidelity (Marc, 2026-10-27): « les étapes arrêtent avant la fin et parfois
// ça rajoute des étapes pour chaque phrase ». The SOURCE's own step boundaries win on
// every path; nothing is dropped past an arbitrary cap.
// ---------------------------------------------------------------------------
describe('import fidelity — the source delimits the steps', () => {
  const longStep =
    'Dans une grande casserole, chauffer l’huile à feu moyen et y faire revenir l’oignon, le céleri et la carotte environ 8 minutes en remuant souvent, jusqu’à ce que les légumes soient tendres et légèrement dorés sur les bords. ' +
    'Ajouter l’ail, le thym et la feuille de laurier, puis poursuivre la cuisson une minute de plus en remuant sans arrêt pour ne pas brûler l’ail. ' +
    'Déglacer avec le vin blanc et laisser réduire de moitié avant d’ajouter le bouillon.'

  it('a 450-char three-sentence step among others stays ONE step (no per-sentence split)', () => {
    expect(longStep.length).toBeGreaterThan(400)
    const steps = refineSteps(['Préchauffer le four.', longStep, 'Ajouter les pâtes.', 'Cuire 10 minutes.', 'Servir.'])
    expect(steps).toHaveLength(5)
    expect(steps[1]).toBe(longStep)
  })

  it('35 short steps all survive (no cap at 30)', () => {
    const raw = Array.from({ length: 35 }, (_, i) => `Faire la chose numéro ${i + 1}.`)
    expect(refineSteps(raw)).toEqual(raw)
  })

  it('3 headings + 58 steps → every step survives; headings do not count toward the cap', () => {
    const raw: string[] = []
    for (let s = 0; s < 3; s++) {
      raw.push(`## Partie ${s + 1}`)
      for (let i = 0; i < (s < 2 ? 20 : 18); i++) raw.push(`Faire la chose ${s + 1}-${i + 1}.`)
    }
    const out = refineSteps(raw)
    expect(out.filter((l) => !l.startsWith('## '))).toHaveLength(58)
    expect(out.filter((l) => l.startsWith('## '))).toHaveLength(3)
    expect(MAX_STEPS).toBeGreaterThanOrEqual(58)
  })

  it('ONE 850-char paragraph (the only entry) is read one sentence per step', () => {
    const blob = Array.from(
      { length: 8 },
      (_, i) => `Mélanger doucement la farine numéro ${i} avec le beurre fondu et le sucre pendant deux minutes complètes.`,
    ).join(' ')
    expect(refineSteps([blob])).toHaveLength(8)
  })

  it('a 1300-char single piece in a multi-step set is chunked, never truncated', () => {
    const huge = Array.from({ length: 12 }, (_, i) => `Incorporer délicatement la préparation numéro ${i + 1} aux blancs montés en neige ferme, en trois additions, sans trop travailler.`).join(' ')
    expect(huge.length).toBeGreaterThan(1300)
    const out = refineSteps(['Préchauffer le four.', huge, 'Servir.'])
    const middle = out.slice(1, -1)
    expect(middle.length).toBe(2)
    for (const s of middle) {
      expect(s.length).toBeLessThanOrEqual(MAX_STEP_LEN)
      expect(/[.!?]$/.test(s)).toBe(true)
    }
    expect(middle.join(' ')).toBe(huge)
  })

  it('normalizeInstructions walks an itemListElement given as a single OBJECT', () => {
    const v = [
      { '@type': 'HowToSection', name: 'Sauce', itemListElement: { '@type': 'HowToStep', text: 'Mélanger la sauce.' } },
      { '@type': 'HowToSection', name: 'Pâtes', itemListElement: [{ text: 'Cuire les pâtes.' }] },
    ]
    expect(normalizeInstructions(v)).toEqual(['## Sauce', 'Mélanger la sauce.', '## Pâtes', 'Cuire les pâtes.'])
  })

  it('normalizeInstructions splits ONE string of HTML paragraphs on its blocks', () => {
    expect(normalizeInstructions('<p>Do A.</p><p>Do B.</p><br>Do C.')).toEqual(['Do A.', 'Do B.', 'Do C.'])
  })

  it('normalizeInstructions keeps 2 sections × 20 steps whole: 40 steps + 2 headings', () => {
    const sec = (name: string) => ({
      '@type': 'HowToSection',
      name,
      itemListElement: Array.from({ length: 20 }, (_, i) => ({ '@type': 'HowToStep', text: `${name} : geste ${i + 1}.` })),
    })
    const out = normalizeInstructions([sec('Pâte'), sec('Garniture')])
    expect(out).toHaveLength(42)
    expect(out[0]).toBe('## Pâte')
    expect(out[21]).toBe('## Garniture')
    expect(out[41]).toBe('Garniture : geste 20.')
  })

  it('recipeTextWindow: the default budget reaches the last step and stops at the site’s chrome', () => {
    const nav = 'Accueil Recettes Menu Recherche Connexion '.repeat(170).slice(0, 7000)
    const steps = Array.from({ length: 40 }, (_, i) => `Étape ${i + 1}. Faire une chose assez longue pour remplir la page ${i + 1}.`).join('\n')
    const body = `\nIngrédients\n2 tasses de farine\n1 c. à thé de sel\n\nPréparation\n${steps}\nDernière étape : servir chaud.\n`
    const gap = 12_000 - nav.length - body.length
    const filler = 'Une note du chef sur la cuisson. '.repeat(Math.ceil(gap / 33)).slice(0, gap)
    const page = nav + body + filler + '\nVous aimerez aussi\n' + 'Tarte au sucre\n'.repeat(600)
    expect(page.indexOf('Ingrédients')).toBeGreaterThanOrEqual(7000)
    expect(page.length).toBeGreaterThan(16_000)
    const win = recipeTextWindow(page)
    expect(win).toContain('2 tasses de farine')
    expect(win).toContain('Dernière étape : servir chaud.')
    expect(win).not.toContain('Vous aimerez aussi')
    expect(win).not.toContain('Tarte au sucre')
  })

  it('parsePastedRecipe: an ad line between two steps is skipped, not the end of the method', () => {
    const r = parsePastedRecipe(
      'Crêpes\n\nIngrédients\n250 ml de farine\n2 oeufs\n\nPréparation\nMélanger la farine et les oeufs.\nAjouter le lait.\nPublicité\nCuire 2 minutes de chaque côté.',
    )
    expect(r.steps).toEqual(['Mélanger la farine et les oeufs.', 'Ajouter le lait.', 'Cuire 2 minutes de chaque côté.'])
  })

  it('pageMeta reads og:title / og:image, and falls back to <title> without the site suffix', () => {
    expect(
      pageMeta(
        '<head><meta property="og:title" content="Tourtière du Lac"><meta content="http://x.test/t.jpg" property="og:image"><title>Autre | Site</title></head>',
      ),
    ).toEqual({ title: 'Tourtière du Lac', image: 'https://x.test/t.jpg' })
    expect(pageMeta('<head><title>Soupe aux pois | Recettes du Québec</title></head>')).toEqual({ title: 'Soupe aux pois', image: null })
    expect(pageMeta('<head><title>Pouding chômeur - Zeste</title></head>').title).toBe('Pouding chômeur')
    expect(pageMeta('<p>rien</p>')).toEqual({ title: null, image: null })
  })
})

describe('pageIngredientsPlausible — a page list, or its table cells?', () => {
  it('trusts a real list', () => {
    expect(pageIngredientsPlausible(['250 ml de farine', '2 oeufs', '## Sauce', '500 ml de lait'])).toBe(true)
  })
  it('refuses amounts orphaned from their words (« <div>250 ml</div><div>de farine</div> »)', () => {
    expect(pageIngredientsPlausible(['250 ml', 'de farine', '2', 'oeufs', '500 ml', 'de lait'])).toBe(false)
  })
})
