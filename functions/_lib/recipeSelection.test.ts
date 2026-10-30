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
  // The saumon's bowl version (photo corpus, live, every run): the selector filed the
  // four « › » garnish lines and their label NOWHERE — « au choix » read as « not an
  // ingredient ». A bulleted printed line is a list item; unfiled, it is restored at its
  // place, under the label above it. Nothing is written: the words are the page's.
  it('a bulleted line the model filed nowhere is restored as an ingredient, under the label printed above it', () => {
    const page = [
      'Saumon',
      '4 pavés de saumon',
      'Pour la marinade :',
      '60 ml (¼ de tasse) de sauce soya',
      'Garnitures (au choix et au goût) :',
      '› Chou rouge émincé',
      '› Avocat coupé en fins quartiers',
      'Pour la sauce :',
      '80 ml (1/3 de tasse) de mayonnaise',
      '1 Dans un bol, mélanger les ingrédients de la sauce.',
    ]
    const s: LineSelection = {
      title: 0,
      servings: null,
      prep: null,
      cook: null,
      ingredients: [1, 3, 8],
      steps: [9],
      notes: [],
      ingredientSections: [
        { line: 2, before: 3 },
        { line: 7, before: 8 },
      ],
      stepSections: [],
    }
    const d = draftFromSelection(page, s, { title: null, servings: null, servingsUnit: null, times: { prep: null, cook: null, total: null } })!
    expect(d.ingredients).toEqual([
      '4 pavés de saumon',
      '## Pour la marinade',
      '60 ml (¼ de tasse) de sauce soya',
      '## Garnitures (au choix et au goût)',
      'Chou rouge émincé',
      'Avocat coupé en fins quartiers',
      '## Pour la sauce',
      '80 ml (1/3 de tasse) de mayonnaise',
    ])
    // A bulleted line the model DID file (as a note) is not restored twice.
    const noted = draftFromSelection(page, { ...s, notes: [5, 6] }, { title: null, servings: null, servingsUnit: null, times: { prep: null, cook: null, total: null } })!
    expect(noted.ingredients).not.toContain('Chou rouge émincé')
    expect(noted.notes).toContain('Chou rouge émincé')
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
  // Marc, live, 2026-10-30: « it's easy for a user to remove extra text than find missing
  // one ». A line the model filed NOWHERE — not a bullet, not the title, not meta — is
  // still a line of the page, and it is kept where the page puts it: between two steps it
  // is a step, inside the list it is an ingredient, after the method it is a note. Only
  // the page's furniture stays out: the header above the title, the time/yield strip, a
  // label heading nothing, a badge (« SE CONGÈLE »), a page number.
  it('a line the model filed nowhere is kept where the page puts it — never dropped', () => {
    const page = [
      'plaques-bols',
      'Saumon',
      'Préparation 20 minutes · Quantité 4 portions',
      '4 pavés de saumon',
      '750 ml (3 tasses) d’eau',
      'Pour la marinade :',
      '1 Mélanger la marinade.',
      'Laisser mariner 30 minutes au frais.',
      '2 Préchauffer le four à 205 °C (400 °F).',
      '3 Servir.',
      'Se conserve 2 jours au réfrigérateur.',
      'SE CONGÈLE',
      '103 · À congeler',
    ]
    const s: LineSelection = { title: 1, servings: 2, prep: 2, cook: null, ingredients: [3], steps: [6, 8, 9], notes: [], ingredientSections: [], stepSections: [] }
    const d = draftFromSelection(page, s, { title: 'Saumon', servings: 4, servingsUnit: 'portions', times: { prep: 20, cook: null, total: null } })!
    expect(d.ingredients).toEqual(['4 pavés de saumon', '750 ml (3 tasses) d’eau'])
    expect(d.steps).toEqual(['Mélanger la marinade.', 'Laisser mariner 30 minutes au frais.', 'Préchauffer le four à 205 °C (400 °F).', 'Servir.'])
    expect(d.notes).toBe('Se conserve 2 jours au réfrigérateur.')
  })
})
