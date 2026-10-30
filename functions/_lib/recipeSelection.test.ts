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
  // Marc, 2026-10-30: « for alternatives to recipes it's still confusing — sometimes it
  // adds the ingredients in the ingredient list, not as a full "this is another way if
  // you want" thing ». A page's version label (« pour une version bol ») opens a second
  // way of making the dish: everything printed AFTER it belongs to that version — its
  // parts become « ## <version> — <part> » ingredient sections, its method a « ## <version> »
  // step section — a matched pair the sheet shows behind a switch. The label itself is
  // structure, never a stray note.
  it('a version label makes everything after it a matched pair of sections (ingredients and steps)', () => {
    const page = [
      'Saumon',
      '4 pavés de saumon',
      '1 Cuire le saumon au four 15 minutes.',
      'pour une version bol',
      'Garnitures (au choix et au goût) :',
      '› Chou rouge émincé',
      'pour la sauce :',
      '80 ml (1/3 de tasse) de mayonnaise',
      '1 Dans un bol, mélanger les ingrédients de la sauce.',
      '2 Garnir.',
    ]
    const s: LineSelection = {
      title: 0,
      servings: null,
      prep: null,
      cook: null,
      ingredients: [1, 5, 7],
      steps: [2, 8, 9],
      notes: [],
      ingredientSections: [
        { line: 4, before: 5 },
        { line: 6, before: 7 },
      ],
      stepSections: [],
    }
    const d = draftFromSelection(page, s, { title: null, servings: null, servingsUnit: null, times: { prep: null, cook: null, total: null } })!
    expect(d.ingredients).toEqual([
      '4 pavés de saumon',
      '## pour une version bol — Garnitures (au choix et au goût)',
      'Chou rouge émincé',
      '## pour une version bol — pour la sauce',
      '80 ml (1/3 de tasse) de mayonnaise',
    ])
    expect(d.steps).toEqual(['Cuire le saumon au four 15 minutes.', '## pour une version bol', 'Dans un bol, mélanger les ingrédients de la sauce.', 'Garnir.'])
    expect(d.notes).toBeNull()
    // A version with no part label of its own: its ingredients go under the version itself.
    const bare = draftFromSelection(['Saumon', '4 pavés de saumon', '1 Cuire.', 'Variante', '2 oignons', '1 Frire.'], { ...s, ingredients: [1, 4], steps: [2, 5], ingredientSections: [] }, { title: null, servings: null, servingsUnit: null, times: { prep: null, cook: null, total: null } })!
    expect(bare.ingredients).toEqual(['4 pavés de saumon', '## Variante', '2 oignons'])
    expect(bare.steps).toEqual(['Cuire.', '## Variante', 'Frire.'])
  })
  // A page that says nothing but RESTARTS its numbering at 1 for the second way (a
  // « 1 2 3 » then « 1 2 ») is a version too (Marc, 2026-10-30, « do all »): the base
  // ends at its last step, everything printed after — the second list and the restarted
  // method — is « Version 2 » (a figure, never an invented word; a page that names its
  // version keeps its own label). A single run never restarts; a run that merely
  // continues (« 4 5 ») is not a version.
  it('a method whose numbering restarts at 1 opens an unnamed version — « Version 2 »', () => {
    const page = ['Saumon', '4 pavés de saumon', '1 Cuire au four.', '2 Servir.', '80 ml de mayonnaise', '1 Mélanger la sauce.', '2 Garnir.']
    const s: LineSelection = { title: 0, servings: null, prep: null, cook: null, ingredients: [1, 4], steps: [2, 3, 5, 6], notes: [], ingredientSections: [], stepSections: [] }
    const d = draftFromSelection(page, s, { title: null, servings: null, servingsUnit: null, times: { prep: null, cook: null, total: null } })!
    expect(d.ingredients).toEqual(['4 pavés de saumon', '## Version 2', '80 ml de mayonnaise'])
    expect(d.steps).toEqual(['Cuire au four.', 'Servir.', '## Version 2', 'Mélanger la sauce.', 'Garnir.'])
    // The page names its version: no figure, the page's own label.
    const named = draftFromSelection(['Saumon', '1 Cuire.', 'pour une version bol', '1 Mélanger.'], { ...s, ingredients: [], steps: [1, 3] }, { title: null, servings: null, servingsUnit: null, times: { prep: null, cook: null, total: null } })!
    expect(named.steps).toEqual(['Cuire.', '## pour une version bol', 'Mélanger.'])
    // Numbers that continue are one method.
    const one = draftFromSelection(['Saumon', '1 Cuire.', '2 Servir.', '3 Ranger.'], { ...s, ingredients: [], steps: [1, 2, 3] }, { title: null, servings: null, servingsUnit: null, times: { prep: null, cook: null, total: null } })!
    expect(one.steps).toEqual(['Cuire.', 'Servir.', 'Ranger.'])
  })
  // Marc, 2026-10-30: « "Pour la sauce :" is not clear at all » — the selector had filed
  // the page's part label as an INGREDIENT, so it sat in the list with its colon, heading
  // nothing. A picked line that is a bare label (a colon, no figure, a few words) is a
  // part heading at its place — in the list and in the method alike.
  it('a part label the model filed as a line becomes the heading of the lines under it', () => {
    const page = ['Saumon', '4 pavés de saumon', 'pour la sauce :', '80 ml de mayonnaise', 'Pour la cuisson :', '1 Cuire 10 minutes.']
    const s: LineSelection = { title: 0, servings: null, prep: null, cook: null, ingredients: [1, 2, 3], steps: [4, 5], notes: [], ingredientSections: [], stepSections: [] }
    const d = draftFromSelection(page, s, { title: null, servings: null, servingsUnit: null, times: { prep: null, cook: null, total: null } })!
    expect(d.ingredients).toEqual(['4 pavés de saumon', '## pour la sauce', '80 ml de mayonnaise'])
    expect(d.steps).toEqual(['## Pour la cuisson', 'Cuire 10 minutes.'])
  })
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
