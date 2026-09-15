import { describe, expect, it } from 'vitest'
import { recipeListItem, parseOriginal, type RecipeRow } from './recipeWire'

// THE LIST PAYLOAD IS A DECISION, and this is where it is held.
//
// `/api/recipes` is the most shared read in the app: nine `useRecipes()` call sites,
// `...live` (a re-poll every ~10 s while a kitchen surface is open), persisted to
// IndexedDB before first paint, replayed offline. For most of the app's life it also
// shipped `original` — the as-imported snapshot, whose `ingredients` + `steps` are a
// full SECOND COPY of the recipe's text — to every one of those surfaces, to serve a
// single toggle in the sheet. With the 3-recipe fixture that is invisible; at 200
// recipes it is the cold-boot budget.
//
// Two halves, and the second is the one that makes this worth a test: the snapshot
// still has to be READ server-side, because `healTruncatedSteps` restores steps
// chopped by the old 200-char save cap from it. Dropping the column from the SELECT
// would have shrunk the payload AND silently un-healed every legacy recipe.

const row = (over: Partial<RecipeRow> = {}): RecipeRow => ({
  id: 'r1',
  title: 'Tarte aux pommes',
  ingredients_json: JSON.stringify(['6 pommes', '1 abaisse']),
  steps_json: JSON.stringify(['Peler les pommes.', 'Cuire 40 minutes.']),
  servings: 8,
  servings_unit: null,
  prep_min: 20,
  cook_min: 40,
  total_min: 60,
  notes: null,
  source: null,
  image: null,
  tags_json: JSON.stringify(['dessert']),
  original_json: null,
  steps_images_json: null,
  lang: 'fr',
  updated_at: 1_700_000_000,
  ...over,
})

describe('the recipe list payload', () => {
  it('carries what every surface needs', () => {
    const r = recipeListItem(row())
    expect(r).toMatchObject({
      id: 'r1',
      title: 'Tarte aux pommes',
      ingredients: ['6 pommes', '1 abaisse'],
      steps: ['Peler les pommes.', 'Cuire 40 minutes.'],
      tags: ['dessert'],
      servings: 8,
      prepMin: 20,
      lang: 'fr',
    })
    // The per-step photo slots STAY — cook mode reads them off this list, and a key
    // is a short token, not a copy of the recipe.
    expect(r.stepImages).toHaveLength(2)
  })

  it('does NOT carry the as-imported snapshot, even when the row has a fat one', () => {
    const fat = {
      title: 'Tarte aux pommes',
      ingredients: ['6 pommes', '1 abaisse'],
      steps: ['Peler les pommes.', 'Cuire 40 minutes.'],
      importedAt: 1_699_000_000,
    }
    const r = recipeListItem(row({ original_json: JSON.stringify(fat) }))
    // The property is absent, not merely null: a null would still cost a key per
    // recipe and would read as « this recipe has no original », which is a
    // different and false claim. The sheet asks per recipe.
    expect('original' in r).toBe(false)
    // …and nothing else smuggled the text back in.
    expect(JSON.stringify(r)).not.toContain('importedAt')
  })

  it('still heals a step the old 200-char cap chopped — the snapshot is read, just not sent', () => {
    // A real victim: ~200 chars, cut mid-word, no terminal punctuation.
    const full =
      'Dans une grande casserole, faire fondre le beurre à feu moyen, ajouter les pommes pelées et tranchées, la cannelle, le sucre et une pincée de sel, puis laisser mijoter en remuant souvent pendant une quinzaine de minutes.'
    const chopped = full.slice(0, 200)
    expect(chopped.length).toBe(200)

    const r = recipeListItem(
      row({
        steps_json: JSON.stringify([chopped]),
        original_json: JSON.stringify({ title: null, ingredients: [], steps: [full] }),
      }),
    )
    expect(r.steps[0]).toBe(full)
    // The heal happened WITHOUT the snapshot riding along to the client.
    expect('original' in r).toBe(false)
  })

  it('a corrupt snapshot reads as no snapshot rather than throwing', () => {
    expect(parseOriginal('{ not json')).toBeNull()
    expect(parseOriginal(null)).toBeNull()
    expect(parseOriginal('[]')).toBeNull()
    expect(() => recipeListItem(row({ original_json: '{ not json' }))).not.toThrow()
  })
})
