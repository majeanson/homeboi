import { describe, it, expect } from 'vitest'
import { findMeasures, measuresDisagree, qtyKey, spokenMeasure, spokenIngredient } from './measure'

const keys = (line: string) => findMeasures(line).map((m) => m.key)
const one = (line: string) => {
  const ms = findMeasures(line)
  expect(ms).toHaveLength(1)
  return ms[0]
}

describe('findMeasures — units', () => {
  it('reads the common FR spoon/cup spellings', () => {
    expect(one('1 c. à thé de vanille').key).toBe('1|tsp')
    expect(one('1 cuillère à thé de vanille').key).toBe('1|tsp')
    expect(one('1 c. à soupe de beurre').key).toBe('1|tbsp')
    expect(one('1 cuillère à soupe de beurre').key).toBe('1|tbsp')
    expect(one('2 tasses de farine').key).toBe('2|cup')
  })

  it('reads compact abbreviations (càc / càs) and FR café = teaspoon', () => {
    expect(one('1 càc de sel').unit).toBe('tsp')
    expect(one('1 càs de sel').unit).toBe('tbsp')
    expect(one('1 c. à café de sel').unit).toBe('tsp')
    expect(one('1 c. à s. de sel').unit).toBe('tbsp')
    expect(one('1 c. à t. de sel').unit).toBe('tsp')
  })

  it('reads the EN spellings', () => {
    expect(one('1 tsp vanilla').key).toBe('1|tsp')
    expect(one('1 teaspoon vanilla').key).toBe('1|tsp')
    expect(one('2 tbsp butter').key).toBe('2|tbsp')
    expect(one('2 tablespoons butter').key).toBe('2|tbsp')
    expect(one('1 cup flour').key).toBe('1|cup')
  })

  it('does not confuse "c. à table" (tablespoon) with "c. à t." (teaspoon)', () => {
    expect(one('1 c. à table de sucre').unit).toBe('tbsp')
  })
})

describe('findMeasures — quantities', () => {
  it('normalizes ascii, unicode and decimal fractions to one key', () => {
    expect(one('1/4 c. à thé de sel').key).toBe('1/4|tsp')
    expect(one('¼ c. à thé de sel').key).toBe('1/4|tsp')
    expect(one('0.25 c. à thé de sel').key).toBe('1/4|tsp')
    expect(one('⅛ c. à thé de sel').key).toBe('1/8|tsp')
  })

  it('reads mixed amounts whole', () => {
    expect(one('1 1/2 tasse de lait').key).toBe('1 1/2|cup')
    expect(one('1½ tasse de lait').key).toBe('1 1/2|cup')
  })
})

describe('findMeasures — restraint', () => {
  it('pills the parenthetical spoon but not the ml primary', () => {
    expect(keys('15 ml (1 c. à thé) de beurre non salé')).toEqual(['1|tsp'])
  })

  it('ignores weight/volume units that have no measuring tool', () => {
    expect(findMeasures('400 g de farine')).toHaveLength(0)
    expect(findMeasures('250 ml de lait')).toHaveLength(0)
  })

  it('does not match a unit at the head of a longer word', () => {
    expect(findMeasures('2 cupcakes')).toHaveLength(0)
  })

  it('passes a line with no measurement through as empty', () => {
    expect(findMeasures('Sel et poivre au goût')).toHaveLength(0)
  })

  it('finds every measurement in a multi-spoon line', () => {
    expect(keys('1 c. à thé de sel et 2 c. à soupe d’huile')).toEqual(['1|tsp', '2|tbsp'])
  })
})

describe('qtyKey', () => {
  it('keys whole numbers and tidy fractions deterministically', () => {
    expect(qtyKey(1)).toBe('1')
    expect(qtyKey(0.25)).toBe('1/4')
    expect(qtyKey(1 / 3)).toBe('1/3')
    expect(qtyKey(1.5)).toBe('1 1/2')
  })
})

describe('measuresDisagree — conversion cross-check', () => {
  it('flags a dropped decimal comma (1,25 ml read as 125 ml)', () => {
    expect(measuresDisagree('125 ml (1/4 c. à thé) de vanille')).toBe(true) // ¼ tsp ≈ 1.25 ml, 125 is 100×
    expect(measuresDisagree('5 ml (3/4 tasse) de farine')).toBe(true) // ¾ cup ≈ 187 ml, not 5
  })
  it('accepts matching dual units within kitchen-rounding tolerance', () => {
    expect(measuresDisagree('1,25 ml (1/4 c. à thé) de vanille')).toBe(false)
    expect(measuresDisagree('180 ml (3/4 tasse) de farine')).toBe(false) // exact 187.5
    expect(measuresDisagree('15 ml (1 c. à soupe) d’huile')).toBe(false)
    expect(measuresDisagree('60 ml (1/4 tasse) de sucre')).toBe(false) // 62.5 exact, 60 within band
  })
  it('returns false when a line has no ml or no scoopable unit', () => {
    expect(measuresDisagree('1/4 c. à thé de sel')).toBe(false)
    expect(measuresDisagree('250 ml de lait')).toBe(false)
    expect(measuresDisagree('2 œufs')).toBe(false)
  })
})

describe('spokenMeasure', () => {
  it('expands abbreviations into a natural phrase (FR)', () => {
    expect(spokenMeasure(one('1 c. à thé de vanille'), 'fr')).toBe('une cuillère à thé')
    expect(spokenMeasure(one('1/4 c. à thé de sel'), 'fr')).toBe('un quart de cuillère à thé')
    expect(spokenMeasure(one('2 tasses de farine'), 'fr')).toBe('deux tasses')
    expect(spokenMeasure(one('1/2 tasse de lait'), 'fr')).toBe('une demi tasse')
  })

  it('expands abbreviations into a natural phrase (EN)', () => {
    expect(spokenMeasure(one('1 tsp vanilla'), 'en')).toBe('one teaspoon')
    expect(spokenMeasure(one('1/4 tsp salt'), 'en')).toBe('a quarter teaspoon')
    expect(spokenMeasure(one('1/2 cup milk'), 'en')).toBe('half a cup')
  })

  it('reads a mixed amount', () => {
    expect(spokenMeasure(one('1 1/2 tasse de lait'), 'fr')).toBe('une et demi tasse')
    expect(spokenMeasure(one('1 1/2 cup milk'), 'en')).toBe('one and a half cups')
  })
})

describe('spokenIngredient', () => {
  it('expands each measurement in place, keeping the rest of the line', () => {
    expect(spokenIngredient('1/4 c. à thé de vanille', 'fr')).toBe('un quart de cuillère à thé de vanille')
    expect(spokenIngredient('1 tsp vanilla', 'en')).toBe('one teaspoon vanilla')
  })
  it('reads a line with no measurement verbatim', () => {
    expect(spokenIngredient('Sel et poivre au goût', 'fr')).toBe('Sel et poivre au goût')
    expect(spokenIngredient('400 g de farine', 'fr')).toBe('400 g de farine')
  })
})
