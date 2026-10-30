// What a MODEL SELECTION keeps from the text read, and what it does not (2026-10-30,
// the photo corpus). The model only picks line numbers; the text read (recipeDraft
// readText) reads the same lines by shape. Where the two disagree, these are the rules —
// each one written from a page in functions/test/fixtures/recipes/photos that got it
// wrong, and run red against the previous rule first.
import { describe, expect, it } from 'vitest'
import type { LineSelection } from './ai'
import { draft, draftFromSelection } from './recipeDraft'

const lines = [
  'plaques-bols',
  'Muffins au citron',
  'Préparation 20 minutes · Quantité 12 muffins',
  '250 ml (1 tasse) de farine',
  '2 œufs',
  'Mélanger.',
  'Se conserve de 1 à 2 jours à température ambiante dans un contenant hermétique.',
  'SE CONGÈLE',
]
// The text read's own view of that page — a kicker for a title, a badge for notes.
const known = { title: 'plaques-bols', servings: 12, servingsUnit: 'muffins', times: { prep: 20, cook: null, total: null }, notes: 'SE CONGÈLE' }
const sel = (over: Partial<LineSelection>): LineSelection => ({
  title: 1,
  servings: 2,
  prep: 2,
  cook: null,
  ingredients: [3, 4],
  steps: [5, 6],
  notes: [],
  ingredientSections: [],
  stepSections: [],
  ...over,
})

describe('a model selection vs the text read', () => {
  it('the TITLE is the model’s pick; the text read’s first line only when the model picked none', () => {
    expect(draftFromSelection(lines, sel({}), known)!.title).toBe('Muffins au citron')
    expect(draftFromSelection(lines, sel({ title: null }), known)!.title).toBe('plaques-bols')
  })
  it('yield and times stay the TEXT read’s (the model points at a whole strip)', () => {
    const d = draftFromSelection(lines, sel({}), known)!
    expect(d.servings).toBe(12)
    expect(d.servingsUnit).toBe('muffins')
    expect(d.times).toEqual({ prep: 20, cook: null, total: null })
  })
  it('the NOTES are the model’s only — a « SE CONGÈLE » badge the shape read took for a note is not one', () => {
    expect(draftFromSelection(lines, sel({}), known)!.notes).toBeNull()
    expect(draftFromSelection(lines, sel({ notes: [7] }), known)!.notes).toBe('SE CONGÈLE')
  })
  it('a numbered « Se conserve… » the model picked as a step STAYS a step; the footer rule is for the shape read', () => {
    const built = draftFromSelection(lines, sel({}), known)!
    const ai = draft({ ...built, structuring: 'ai' })
    expect(ai.steps).toEqual(['Mélanger.', 'Se conserve de 1 à 2 jours à température ambiante dans un contenant hermétique.'])
    expect(ai.notes).toBeNull()
    const shape = draft({ ...built, structuring: 'heuristic' })
    expect(shape.steps).toEqual(['Mélanger.'])
    expect(shape.notes).toContain('Se conserve de 1 à 2 jours')
  })
})
