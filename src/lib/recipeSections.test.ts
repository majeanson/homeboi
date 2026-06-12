// @vitest-environment node
import { describe, it, expect } from 'vitest'
import {
  isSectionHeading,
  sectionTitle,
  makeSectionHeading,
  withoutHeadings,
  dropDanglingHeadings,
  groupSections,
} from './recipeSections'

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
