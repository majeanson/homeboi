import { describe, it, expect, vi } from 'vitest'
import { draftFromText } from './recipeDraft'
import type { Env } from './env'

// The one text → draft path, with AI OFF (env.AI unset), which is the strongest promise
// it can make: what every import gets before any model has a say. Built from the real
// card that broke the photo read (Marc, 2026-09-24): a paragraph recipe, no ingredient
// list, the quantities inside the method, a yield and a keeping note as footer.

const noAi = { DB: {} } as unknown as Env

const CARD = `Brocoli sauté au miel
et au sésame

Défaire 1 brocoli en fleurons. Peler le pied du brocoli
et couper en bâtonnets. Dans un grand poêlon
antiadhésif, chauffer 15 ml (1 c. à soupe) d'huile
d'olive à feu moyen-vif. Ajouter 2 gousses d'ail
hachées finement, 15 ml (1 c. soupe) de graines
de sésame et une pincée de flocons de piment fort.
Cuire 2 minutes. Ajouter les fleurons et les bâtonnets
de brocoli et cuire 5 minutes ou jusqu'à ce que
le brocoli soit cuit, mais encore croquant. Verser
15 ml (1 c. à soupe) de miel et 7,5 ml (1/2 c. à
soupe) de sauce soya réduite en sodium. Poursuivre
la cuisson 30 secondes en mélangeant pour enrober
le brocoli. Servir.

Donne 4 portions.
Cette recette se conserve 4 jours au réfrigérateur
ou 3 mois au congélateur.`

const noQuotes = (lines: (string | null)[]) => lines.every((l) => !l || !/^"|"$|",$/.test(l))

describe('draftFromText — the card as plain text, AI off', () => {
  it('reads the paragraph card: title, lifted ingredients, every step, the yield', async () => {
    const d = await draftFromText(noAi, CARD, 'fr', false)
    expect(d.empty).toBeFalsy()
    expect(d.title).toBe('Brocoli sauté au miel et au sésame')
    expect(d.servings).toBe(4)
    // The wrapped title's second line is the title's, never a first step.
    expect(d.steps[0]).toMatch(/^Défaire 1 brocoli/)
    expect(d.steps).not.toContain('et au sésame')
    // The two short steps are the ones that used to vanish.
    expect(d.steps.join('\n')).toContain('Cuire 2 minutes.')
    expect(d.steps.join('\n')).toContain('Servir.')
    // The footer is not an instruction, and « 4 portions » is not an ingredient.
    expect(d.steps.join('\n')).not.toMatch(/Donne 4 portions|se conserve/)
    expect(d.ingredients).toEqual([
      '1 brocoli',
      "15 ml (1 c. à soupe) d'huile d'olive",
      "2 gousses d'ail hachées finement",
      '15 ml (1 c. soupe) de graines de sésame',
      'une pincée de flocons de piment fort',
      '15 ml (1 c. à soupe) de miel',
      '7,5 ml (1/2 c. à soupe) de sauce soya réduite en sodium',
    ])
    // Times come from explicit lines only — never from « cuire 5 minutes ».
    expect(d.times).toEqual({ prep: null, cook: null, total: null })
    expect(d.structuring).toBe('heuristic')
    expect(d.lang).toBe('fr')
  })

  it('a card’s meta strip on ONE line — times, yield and unit are read, whatever line it sits on', async () => {
    // The vision transcript keeps « Préparation : 10 min • Cuisson : 20 min • Donne 12
    // crêpes » on one line; unsplit, both times were lost and, when the model put that
    // strip first, it became the title (seen live, 2026-09-24).
    const body = `Ingrédients\n250 ml de farine\n2 oeufs\n\nPréparation\nMélanger.\nCuire 2 minutes de chaque côté.`
    const strip = 'Préparation : 10 min • Cuisson : 20 min • Donne 12 crêpes'
    for (const head of [`Crêpes de grand-maman\n${strip}`, `${strip}\nCrêpes de grand-maman`]) {
      const d = await draftFromText(noAi, `${head}\n\n${body}`, 'fr', false)
      expect(d.title).toBe('Crêpes de grand-maman')
      expect(d.times).toEqual({ prep: 10, cook: 20, total: null })
      expect(d.servings).toBe(12)
      expect(d.servingsUnit).toBe('crêpes')
      expect(d.steps).toEqual(['Mélanger.', 'Cuire 2 minutes de chaque côté.'])
    }
  })

  it('a recipe with real headings parses deterministically, with no repair needed', async () => {
    const d = await draftFromText(noAi, `Crêpes\n\nIngrédients\n250 ml de farine\n2 oeufs\n500 ml de lait\n\nPréparation\nMélanger la farine et les oeufs.\nAjouter le lait.\nCuire 2 minutes.`, 'fr', false)
    expect(d.structuring).toBe('headings')
    expect(d.ingredients).toEqual(['250 ml de farine', '2 oeufs', '500 ml de lait'])
    expect(d.steps).toEqual(['Mélanger la farine et les oeufs.', 'Ajouter le lait.', 'Cuire 2 minutes.'])
  })
})

describe('draftFromText — the model runs only when the plain read is not good enough', () => {
  // A fake AI binding that records whether the structuring model was asked at all.
  const aiEnv = () => {
    const run = vi.fn(async () => ({ response: '{"title":null,"ingredients":[],"steps":[]}' }))
    return { env: { DB: {}, AI: { run } } as unknown as Env, run }
  }

  it('the paragraph card, read well without a model, is returned as is — no second call', async () => {
    const { env, run } = aiEnv()
    const d = await draftFromText(env, CARD, 'fr', true)
    expect(run).not.toHaveBeenCalled()
    expect(d.structuring).toBe('heuristic')
    // One sentence per step, the printed words, nothing reordered.
    expect(d.steps).toEqual([
      'Défaire 1 brocoli en fleurons.',
      'Peler le pied du brocoli et couper en bâtonnets.',
      "Dans un grand poêlon antiadhésif, chauffer 15 ml (1 c. à soupe) d'huile d'olive à feu moyen-vif.",
      "Ajouter 2 gousses d'ail hachées finement, 15 ml (1 c. soupe) de graines de sésame et une pincée de flocons de piment fort.",
      'Cuire 2 minutes.',
      "Ajouter les fleurons et les bâtonnets de brocoli et cuire 5 minutes ou jusqu'à ce que le brocoli soit cuit, mais encore croquant.",
      'Verser 15 ml (1 c. à soupe) de miel et 7,5 ml (1/2 c. à soupe) de sauce soya réduite en sodium.',
      'Poursuivre la cuisson 30 secondes en mélangeant pour enrober le brocoli.',
      'Servir.',
    ])
    expect(d.ingredients).toHaveLength(7)
  })

  it('a label the model put before the text is not the title (seen live: « Transcription du texte de l’image »)', async () => {
    const { env, run } = aiEnv()
    const body = CARD.split('\n').slice(3).join('\n') // the card without its own title lines
    for (const preamble of ['Transcription du texte de l’image\n\nTexte\n\n', 'Here is the transcription of the text in the image:\n\n']) {
      const d = await draftFromText(env, `${preamble}Brocoli sauté au miel et au sésame\n\n${body}`, 'fr', true)
      expect(d.title).toBe('Brocoli sauté au miel et au sésame')
      expect(d.steps[0]).toBe('Défaire 1 brocoli en fleurons.')
      expect(d.steps).not.toContain('Texte')
      expect(run).not.toHaveBeenCalled()
    }
  })

  it('a transcript that lost its punctuation (weak OCR, handwriting) still goes to the model', async () => {
    const { env, run } = aiEnv()
    const garbled = 'gateau aux carottes 2 tasses farine 1 c a the soda 3 oeufs 1 tasse huile 2 tasses carottes rapees on melange tout et on cuit 45 min a 350'
    await draftFromText(env, garbled, 'fr', true)
    expect(run).toHaveBeenCalledTimes(1)
  })
})

// Transcript shapes from the eight-card corpus run against production (2026-09-24),
// each one a miss that day. All deterministic — AI off.
describe('draftFromText — the corpus', () => {
  it('a meta strip with a dash, no colons and « Bake » (the English card)', async () => {
    const d = await draftFromText(noAi, `Banana Bread\nServes 8 – Prep 15 min – Bake 60 min\n\nIngredients\n3 ripe bananas, mashed\n1/3 cup melted butter\n\nDirections\n1. Preheat the oven to 350 °F (175 °C).\n2. Bake for 60 minutes. Cool on a rack.`, 'en', false)
    expect(d.title).toBe('Banana Bread')
    expect(d.servings).toBe(8)
    expect(d.times).toEqual({ prep: 15, cook: 60, total: null })
    expect(d.steps).toEqual(['Preheat the oven to 350 °F (175 °C).', 'Bake for 60 minutes. Cool on a rack.'])
  })

  it('a website screenshot: nav bar, rating strip, « Portions : 4 », sidebar after the body', async () => {
    const t = `RECETTES.QC • Menu • Recherche • Connexion
Accueil › Plats principaux › Pâtes
Spaghetti sauce rosée aux crevettes
★★★★☆ 128 avis | Préparation : 10 min | Cuisson : 15 min | Portions : 4

Ingrédients
340 g de spaghetti
450 g de crevettes décortiquées
125 ml (1/2 tasse) de crème 15 %

Préparation
1. Cuire les pâtes selon les indications de l'emballage.
2. Mélanger avec les pâtes et servir.

Recettes populaires
Poulet général Tao
Pâté chinois
Publicité
Épicerie en ligne dès 4,99 $ de livraison`
    const d = await draftFromText(noAi, t, 'fr', false)
    expect(d.title).toBe('Spaghetti sauce rosée aux crevettes')
    expect(d.servings).toBe(4)
    expect(d.times).toEqual({ prep: 10, cook: 15, total: null })
    expect(d.ingredients).toEqual(['340 g de spaghetti', '450 g de crevettes décortiquées', '125 ml (1/2 tasse) de crème 15 %'])
    expect(d.steps).toEqual(["Cuire les pâtes selon les indications de l'emballage.", 'Mélanger avec les pâtes et servir.'])
  })

  it('a footer of two meta sentences after numbered steps is not a step', async () => {
    const d = await draftFromText(noAi, `SOUPE AUX LENTILLES\n\nINGRÉDIENTS\n250 ml (1 tasse) de lentilles vertes\n1 oignon haché\n\nPRÉPARATION\n1. Faire revenir l'oignon dans l'huile 5 minutes.\n2. Rectifier l'assaisonnement et servir.\n\nDonne 6 portions. Se congèle très bien.`, 'fr', false)
    expect(d.servings).toBe(6)
    expect(d.steps).toEqual(["Faire revenir l'oignon dans l'huile 5 minutes.", "Rectifier l'assaisonnement et servir."])
  })

  it('bare part labels become sections when the layout says so (blank line above, or a known part word)', async () => {
    const d = await draftFromText(noAi, `Tacos au poisson\n\nIngrédients\n\nPoisson\n450 g de filets de tilapia\n15 ml (1 c. à soupe) de paprika\nSauce\n125 ml (1/2 tasse) de yogourt grec\n1 lime (jus)\n\nGarniture\n8 petites tortillas\n\nPréparation\nSaupoudrer le poisson de paprika et le cuire 3 minutes de chaque côté.\nGarnir de poisson et de sauce.\n\nPour 4 personnes`, 'fr', false)
    expect(d.ingredients).toEqual(['## Poisson', '450 g de filets de tilapia', '15 ml (1 c. à soupe) de paprika', '## Sauce', '125 ml (1/2 tasse) de yogourt grec', '1 lime (jus)', '## Garniture', '8 petites tortillas'])
    expect(d.servings).toBe(4)
  })

  it('a « Titre » label above the name is not the title; « Titre : X » is X', async () => {
    const body = `\n\nIngrédients\n2 oeufs\n250 ml de lait\n\nPréparation\nMélanger.\nCuire 2 minutes.`
    for (const head of ['Titre\n\nCrêpes', 'Title:\nCrêpes', 'Titre : Crêpes']) {
      const d = await draftFromText(noAi, `${head}${body}`, 'fr', false)
      expect(d.title).toBe('Crêpes')
      expect(d.steps).toEqual(['Mélanger.', 'Cuire 2 minutes.'])
    }
    // …and on a paragraph card, where the fallback re-walks every line, the label is
    // not a step either.
    const p = await draftFromText(noAi, `Titre\nGarlic Butter Shrimp\n\nMelt 3 tbsp butter in a skillet. Add 1 lb shrimp and cook 2 minutes per side. Serve at once.\n\nServes 4.`, 'en', false)
    expect(p.title).toBe('Garlic Butter Shrimp')
    expect(p.steps[0]).toBe('Melt 3 tbsp butter in a skillet.')
    expect(p.steps).not.toContain('Titre')
  })

  it('a meta line transcribed without separators is still a strip', async () => {
    const d = await draftFromText(noAi, `Spaghetti\nPréparation : 10 min Cuisson : 15 min Portions : 4\n\nIngrédients\n340 g de spaghetti\n2 gousses d'ail\n\nPréparation\nCuire les pâtes.\nServir.`, 'fr', false)
    expect(d.times).toEqual({ prep: 10, cook: 15, total: null })
    expect(d.servings).toBe(4)
    expect(d.title).toBe('Spaghetti')
  })

  it('the first part label right after « Ingrédients » heads a part even without a blank line', async () => {
    const d = await draftFromText(noAi, `Tacos\n\nIngrédients\nPoisson\n450 g de tilapia\n15 ml de paprika\n\nSauce\n125 ml de yogourt\n\nPréparation\nCuire le poisson 3 minutes de chaque côté.\nServir.`, 'fr', false)
    expect(d.ingredients).toEqual(['## Poisson', '450 g de tilapia', '15 ml de paprika', '## Sauce', '125 ml de yogourt'])
  })

  it('« Sel » between two quantity lines stays an ingredient — never a section', async () => {
    const d = await draftFromText(noAi, `Omelette\n\nIngrédients\n3 oeufs\nSel\n15 ml de beurre\n\nPréparation\nBattre les oeufs avec le sel.\nCuire dans le beurre.`, 'fr', false)
    expect(d.ingredients).toEqual(['3 oeufs', 'Sel', '15 ml de beurre'])
  })
})

describe('draftFromText — a reply that is JSON, or its broken remains', () => {
  // What the vision model handed back when max_tokens cut its JSON mid-array: no
  // closing brace, so the old prose fallback read every line quotes and all.
  const TRUNCATED = `{"title": "Brocoli sauté au miel et au sésame",
"servings": 4,
"prepMin": null,
"cookMin": null,
"ingredients": [
"1 brocoli",
"15 ml (1 c. à soupe) d'huile d'olive",
"2 gousses d'ail hachées finement"
],
"steps": [
"Défaire 1 brocoli en fleurons. Peler le pied du brocoli et couper en bâtonnets.",
"Cuire 2 minutes.",
"Ajouter les fleurons et les bâtonnets de brocoli et cuire 5 minu`

  it('reads it as text: no quote survives, the title is clean, the short step is kept', async () => {
    const d = await draftFromText(noAi, TRUNCATED, 'fr', false)
    expect(d.title).toBe('Brocoli sauté au miel et au sésame')
    expect(d.servings).toBe(4)
    expect(noQuotes([d.title, ...d.ingredients, ...d.steps])).toBe(true)
    expect(d.ingredients).toEqual(['1 brocoli', "15 ml (1 c. à soupe) d'huile d'olive", "2 gousses d'ail hachées finement"])
    expect(d.steps).toContain('Cuire 2 minutes.')
    expect(d.steps[0]).toBe('Défaire 1 brocoli en fleurons. Peler le pied du brocoli et couper en bâtonnets.')
  })
})
