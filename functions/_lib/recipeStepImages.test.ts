import { describe, expect, it } from 'vitest'
import { normalizeStepImages, stepImageKeys } from './recipeStepImages'
import { buildRecipeSnapshot } from './shareSnapshots'

// The step-image side array must stay in lockstep with the steps it annotates. This
// pins the rule itself, and then pins that the SHARE snapshot obeys the same one —
// the two had grown independent spellings, which is how a positional array drifts.

const key = (n: number) => `rsi_${n}`

describe('recipe step images stay in lockstep with the steps', () => {
  it('pads a short array so every step has a slot', () => {
    expect(normalizeStepImages(JSON.stringify([key(1)]), 3)).toEqual([key(1), '', ''])
  })

  it('trims a long one — a photo past the last step is not a photo of anything', () => {
    // How this happens for real: steps are deleted and the side array is written by a
    // path that forgot to re-align. The read must not hand back an orphan key.
    expect(normalizeStepImages(JSON.stringify([key(1), key(2), key(3)]), 1)).toEqual([key(1)])
  })

  it('empties a slot whose entry is not an R2 key — including a remote URL', () => {
    const raw = JSON.stringify([key(1), 'https://exemple.ca/photo.jpg', 42, null])
    expect(normalizeStepImages(raw, 4)).toEqual([key(1), '', '', ''])
  })

  it('reads a missing or malformed column as all-empty, never as a hole', () => {
    expect(normalizeStepImages(null, 2)).toEqual(['', ''])
    expect(normalizeStepImages('pas du JSON', 2)).toEqual(['', ''])
    expect(normalizeStepImages(undefined, 0)).toEqual([])
  })

  it('lists the keys actually present, for blob cleanup on delete', () => {
    expect(stepImageKeys(JSON.stringify(['', key(2), '', key(4)]))).toEqual([key(2), key(4)])
    expect(stepImageKeys(null)).toEqual([])
  })

  it('a share snapshot obeys the SAME rule as /api/recipes for the same row', () => {
    // Both sides used to align by hand, one with `steps.map(...)` and one with this
    // helper. If they ever disagree, a shared recipe shows a step photo the household's
    // own kitchen doesn't (or copies an orphan blob into the share's R2).
    const stored = JSON.stringify([key(1), key(2), key(3)])
    const steps = ['Mélanger.', 'Cuire.']
    const snapshot = buildRecipeSnapshot({
      title: 'Gâteau',
      ingredients: ['farine'],
      steps,
      servings: null,
      servingsUnit: null,
      prepMin: null,
      cookMin: null,
      totalMin: null,
      notes: null,
      source: null,
      image: null,
      stepImages: JSON.parse(stored),
      tags: [],
      lang: 'fr',
    })
    expect(snapshot.stepImages).toEqual(normalizeStepImages(stored, steps.length))
    expect(snapshot.stepImages, 'the third key belonged to a step that is gone').toEqual([key(1), key(2)])
  })
})
