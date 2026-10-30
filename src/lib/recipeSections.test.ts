// @vitest-environment node
import { describe, it, expect } from 'vitest'
import {
  isSectionHeading,
  sectionTitle,
  makeSectionHeading,
  withoutHeadings,
  dropDanglingHeadings,
  groupSections,
  recipeVersions,
  applyVersion,
  versionLabel,
} from './recipeSections'

// A page's ALTERNATIVE (« pour une version bol », Marc, 2026-10-30): a matched pair of
// sections — a step section titled T, and the ingredient sections titled T or « T — part ».
// The sheet shows it behind a switch: base + the version's ingredients, the version's
// steps INSTEAD of the base's. An ingredient-only section (« Pour la sauce ») is a part,
// never a version; a step-only section (« Cuisson ») is a part too.
describe('recipeVersions / applyVersion', () => {
  const ingredients = [
    '4 pavés de saumon',
    '## Pour la marinade',
    '60 ml de sauce soya',
    '## pour une version bol — Garnitures (au choix)',
    'Chou rouge émincé',
    '## pour une version bol — Pour la sauce',
    '80 ml de mayonnaise',
  ]
  const steps = ['Mariner.', 'Cuire au four.', '## pour une version bol', 'Mélanger la sauce.', 'Garnir.']
  it('finds the matched pair and leaves the parts alone', () => {
    const v = recipeVersions(ingredients, steps)
    expect(v.map((x) => x.title)).toEqual(['pour une version bol'])
    expect(v[0].ingredients).toEqual(['## Garnitures (au choix)', 'Chou rouge émincé', '## Pour la sauce', '80 ml de mayonnaise'])
    expect(v[0].steps).toEqual(['Mélanger la sauce.', 'Garnir.'])
    expect(recipeVersions(['## Pour la sauce', 'x'], ['Cuire.'])).toEqual([])
    expect(recipeVersions(['x'], ['## Cuisson', 'Cuire.'])).toEqual([])
  })
  it('the base is everything outside the versions; a picked version adds its ingredients and REPLACES the steps', () => {
    expect(applyVersion(ingredients, steps, null)).toEqual({
      ingredients: ['4 pavés de saumon', '## Pour la marinade', '60 ml de sauce soya'],
      steps: ['Mariner.', 'Cuire au four.'],
    })
    expect(applyVersion(ingredients, steps, 'pour une version bol')).toEqual({
      ingredients: ['4 pavés de saumon', '## Pour la marinade', '60 ml de sauce soya', '## Garnitures (au choix)', 'Chou rouge émincé', '## Pour la sauce', '80 ml de mayonnaise'],
      steps: ['Mélanger la sauce.', 'Garnir.'],
    })
    // No versions at all: the lists come back untouched.
    expect(applyVersion(['a'], ['b'], null)).toEqual({ ingredients: ['a'], steps: ['b'] })
  })
  it('a chip label is the page’s word for the version, without its « pour une version » preamble', () => {
    expect(versionLabel('pour une version bol')).toBe('Bol')
    expect(versionLabel('Version au barbecue')).toBe('Au barbecue')
    expect(versionLabel('Variante')).toBe('Variante')
    expect(versionLabel('Bowl version')).toBe('Bowl')
  })
})

describe('isSectionHeading / sectionTitle / makeSectionHeading', () => {
  it('recognizes the "## " marker, requires a non-empty title', () => {
    expect(isSectionHeading('## Glaçage')).toBe(true)
    expect(isSectionHeading('  ## Glaçage  ')).toBe(true)
    expect(isSectionHeading('## ')).toBe(false)
    expect(isSectionHeading('##')).toBe(false)
    expect(isSectionHeading('400 g de farine')).toBe(false)
  })
  it('round-trips a title', () => {
    expect(sectionTitle(makeSectionHeading('Glaçage'))).toBe('Glaçage')
    expect(sectionTitle('pas un titre')).toBe('pas un titre')
  })
})

describe('withoutHeadings', () => {
  it('keeps only content lines', () => {
    expect(withoutHeadings(['## A', 'x', '## B', 'y'])).toEqual(['x', 'y'])
  })
})

describe('dropDanglingHeadings', () => {
  it('drops a heading followed by another heading or by nothing', () => {
    expect(dropDanglingHeadings(['## A', 'x', '## B'])).toEqual(['## A', 'x'])
    expect(dropDanglingHeadings(['## A', '## B', 'x'])).toEqual(['## B', 'x'])
    expect(dropDanglingHeadings(['x', 'y'])).toEqual(['x', 'y'])
  })
})

describe('groupSections', () => {
  it('returns one untitled group for a recipe with no markers', () => {
    expect(groupSections(['a', 'b'])).toEqual([{ title: null, items: [{ text: 'a', idx: 0 }, { text: 'b', idx: 1 }] }])
  })
  it('groups under headings, keeping original indices, with an untitled lead group', () => {
    expect(groupSections(['lead', '## Biscuits', 'a', '## Glaçage', 'b', 'c'])).toEqual([
      { title: null, items: [{ text: 'lead', idx: 0 }] },
      { title: 'Biscuits', items: [{ text: 'a', idx: 2 }] },
      { title: 'Glaçage', items: [{ text: 'b', idx: 4 }, { text: 'c', idx: 5 }] },
    ])
  })
  it('returns nothing for an empty list', () => {
    expect(groupSections([])).toEqual([])
  })
})
