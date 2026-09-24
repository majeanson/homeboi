import { describe, it, expect } from 'vitest'
import {
  ingredientsAreMethod,
  ingredientsFromMethod,
  jsonFragmentsToText,
  looksLikeMethodLine,
  metaLine,
  repairRecipeRead,
  salvageFieldLines,
  unquoteLine,
  unquoteTitle,
} from './recipeRepair'

// Marc's card, 2026-09-24 — « Brocoli sauté au miel et au sésame », a paragraph recipe
// with no ingredient list. Every shape below is a REAL read of it: the vision model,
// asked for JSON, structured it six different wrong ways in one afternoon.
const STEPS = [
  'Défaire 1 brocoli en fleurons. Peler le pied du brocoli et couper en bâtonnets.',
  'Dans un grand poêlon antiadhésif, chauffer 15 ml (1 c. à soupe) d’huile d’olive à feu moyen-vif.',
  'Ajouter 2 gousses d’ail hachées finement, 15 ml (1 c. soupe) de graines de sésame et une pincée de flocons de piment fort.',
  'Cuire 2 minutes.',
  'Ajouter les fleurons et les bâtonnets de brocoli et cuire 5 minutes ou jusqu’à ce que le brocoli soit cuit, mais encore croquant.',
  'Verser 15 ml (1 c. à soupe) de miel et 7,5 ml (1/2 c. à soupe) de sauce soya réduite en sodium. Poursuivre la cuisson 30 secondes en mélangeant pour enrober le brocoli.',
  'Servir.',
]
const LIFTED = [
  '1 brocoli',
  '15 ml (1 c. à soupe) d’huile d’olive',
  '2 gousses d’ail hachées finement',
  '15 ml (1 c. soupe) de graines de sésame',
  'une pincée de flocons de piment fort',
  '15 ml (1 c. à soupe) de miel',
  '7,5 ml (1/2 c. à soupe) de sauce soya réduite en sodium',
]
const FOOTER = ['Donne 4 portions.', 'Cette recette se conserve 4 jours au réfrigérateur ou 3 mois au congélateur.']
const NO_TIMES = { prep: null, cook: null, total: null }
const read = (ingredients: string[], steps: string[], extra: Partial<{ title: string | null; servings: number | null }> = {}) => ({
  title: 'Brocoli sauté au miel et au sésame',
  ingredients,
  steps,
  servings: null as number | null,
  times: NO_TIMES,
  ...extra,
})

describe('0 · leaked JSON', () => {
  it('un-quotes a line the model emitted as a JSON item, and only at the ends', () => {
    expect(unquoteLine('"Cuire 2 minutes.",')).toBe('Cuire 2 minutes.')
    expect(unquoteLine('"Servir."')).toBe('Servir.')
    expect(unquoteLine('"Ajouter les fleurons et cuire 5 minu')).toBe('Ajouter les fleurons et cuire 5 minu')
    expect(unquoteLine('1 tasse de "sucre"')).toBe('1 tasse de "sucre"')
    expect(unquoteLine('2 oeufs')).toBe('2 oeufs')
  })
  it('a title that is a whole JSON line becomes the title', () => {
    expect(unquoteTitle('{"title": "Brocoli sauté au miel et au sésame",')).toBe('Brocoli sauté au miel et au sésame')
    expect(unquoteTitle('"Crêpes"')).toBe('Crêpes')
    expect(unquoteTitle('Crêpes')).toBe('Crêpes')
  })
  it('turns the broken remains of a JSON reply into text the paste parser reads', () => {
    const t = jsonFragmentsToText(`{"title": "Crêpes",\n"servings": 4,\n"prepMin": null,\n"ingredients": [\n"2 oeufs",\n"250 ml de lait"\n],\n"steps": [\n"Mélanger.",\n"Cuire 2 minu`)
    expect(t).toBe('Crêpes\n4 portions\nIngrédients\n2 oeufs\n250 ml de lait\nPréparation\nMélanger.\nCuire 2 minu')
  })
  it('leaves an ordinary transcript alone', () => {
    const plain = 'Crêpes\n\nIngrédients\n2 oeufs\n\nPréparation\nMélanger.'
    expect(jsonFragmentsToText(plain)).toBe(plain)
  })
})

describe('1 · field names as lines', () => {
  it('drops leaked field names and bare numbers, keeping the values', () => {
    const s = salvageFieldLines(['2 oeufs', 'Servings', '4', 'PrepMin', '5', 'CookMin', '10', '42'])
    expect(s).toEqual({ lines: ['2 oeufs'], servings: 4, prep: 5, cook: 10 })
  })
  it('leaves a real line that merely contains a number alone', () => {
    expect(salvageFieldLines(['4 tasses de farine']).lines).toEqual(['4 tasses de farine'])
  })
})

describe('2 · the footer', () => {
  it('a yield line is meta, and carries the servings', () => {
    expect(metaLine('Donne 4 portions.')).toEqual({ meta: true, servings: 4 })
    expect(metaLine('Pour 6 personnes')).toEqual({ meta: true, servings: 6 })
    expect(metaLine('Serves 4')).toEqual({ meta: true, servings: 4 })
    expect(metaLine('Rendement : 12 portions')).toEqual({ meta: true, servings: 12 })
  })
  it('a keeping note is meta', () => {
    expect(metaLine('Cette recette se conserve 4 jours au réfrigérateur ou 3 mois au congélateur.').meta).toBe(true)
    expect(metaLine('Se conserve 1 semaine au frigo.').meta).toBe(true)
    expect(metaLine('Keeps for 3 days in the fridge.').meta).toBe(true)
  })
  it('a real step that mentions portions or the fridge is NOT meta', () => {
    expect(metaLine('Diviser en 4 portions et servir.').meta).toBe(false)
    expect(metaLine('Laisser reposer 30 minutes au réfrigérateur avant de rouler.').meta).toBe(false)
    expect(metaLine('Cuire 2 minutes.').meta).toBe(false)
  })
})

describe('3 · method vs list', () => {
  it('sees the method copied into the ingredients', () => {
    expect(ingredientsAreMethod(STEPS.slice(0, 6), STEPS)).toBe(true)
  })
  it('a real ingredient list is not the method', () => {
    expect(ingredientsAreMethod(['250 ml de farine', '2 oeufs'], STEPS)).toBe(false)
  })
  it('a sentence of five words or more reads as an instruction; a short line does not, alone', () => {
    expect(looksLikeMethodLine('Peler le pied du brocoli et couper en bâtonnets.')).toBe(true)
    expect(looksLikeMethodLine('Cuire 2 minutes.')).toBe(false)
    expect(looksLikeMethodLine('250 ml de farine')).toBe(false)
  })
  it('lifts every measured phrase out of the method, word for word, and nothing else', () => {
    expect(ingredientsFromMethod(STEPS)).toEqual(LIFTED)
  })
  it('a duration, a yield or a keeping time is not an ingredient', () => {
    expect(ingredientsFromMethod(['Cuire 2 minutes.', 'Donne 4 portions.', 'Se conserve 3 mois au congélateur.', 'Cuire 30 secondes.'])).toEqual([])
  })
  it('works in English too', () => {
    expect(ingredientsFromMethod(['Heat 2 tbsp olive oil in a pan, add 3 cloves garlic and cook 2 minutes.'])).toEqual(['2 tbsp olive oil', '3 cloves garlic'])
  })
})

describe('repairRecipeRead — the six real reads of one card', () => {
  it('A · the method as ingredients, six leaked field lines, steps right (Marc’s phone)', () => {
    const r = repairRecipeRead(read([...STEPS.slice(0, 6), 'Servings', '4', 'PrepMin', '5', 'CookMin', '10'], STEPS))
    expect(r.ingredients).toEqual(LIFTED)
    expect(r.steps).toEqual(STEPS)
    expect(r.servings).toBe(4)
    expect(r.times).toEqual({ prep: 5, cook: 10, total: null })
  })
  it('B · the method as ingredients, the FOOTER as steps', () => {
    const r = repairRecipeRead(read(STEPS.slice(0, 6), FOOTER, { servings: 4 }))
    expect(r.steps).toEqual(STEPS.slice(0, 6))
    expect(r.steps.join('\n')).toContain('Cuire 2 minutes.')
    expect(r.ingredients).toEqual(LIFTED)
    expect(r.servings).toBe(4)
  })
  it('C · the method and the footer as ingredients, NO steps at all', () => {
    const r = repairRecipeRead(read([...STEPS.slice(1, 6), ...FOOTER], []))
    expect(r.steps).toEqual(STEPS.slice(1, 6))
    expect(r.ingredients).toEqual(LIFTED.slice(1))
    expect(r.servings).toBe(4)
  })
  it('D · the method split in sentences plus « Servir. » and the footer, no steps', () => {
    const split = ['1 brocoli en fleurons.', 'Peler le pied du brocoli et couper en bâtonnets.', ...STEPS.slice(1, 6), 'Servir.', ...FOOTER]
    const r = repairRecipeRead(read(split, []))
    expect(r.steps).toEqual(split.slice(0, -2))
    expect(r.ingredients).toEqual(LIFTED)
    expect(r.servings).toBe(4)
  })
  it('E · every line quoted, the title a JSON line (the truncated reply)', () => {
    const q = (l: string) => `"${l}",`
    const r = repairRecipeRead(read(LIFTED.map(q), STEPS.map(q), { title: '{"title": "Brocoli sauté au miel et au sésame",' }))
    expect(r.title).toBe('Brocoli sauté au miel et au sésame')
    expect(r.ingredients).toEqual(LIFTED)
    expect(r.steps).toEqual(STEPS)
  })
  it('F · an honest read is left exactly as it was', () => {
    const ok = { title: 'Crêpes', ingredients: ['250 ml de farine', '2 oeufs'], steps: ['Mélanger.', 'Cuire 2 minutes.'], servings: 2, times: NO_TIMES }
    expect(repairRecipeRead(ok)).toEqual(ok)
  })
})
