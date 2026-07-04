import { describe, it, expect } from 'vitest'
import { formatQty, scaleLine, scaleIngredients } from './scale'

describe('formatQty', () => {
  it('renders whole numbers plainly', () => {
    expect(formatQty(2)).toBe('2')
    expect(formatQty(4)).toBe('4')
  })
  it('snaps tidy fractions to unicode glyphs', () => {
    expect(formatQty(0.5)).toBe('½')
    expect(formatQty(0.25)).toBe('¼')
    expect(formatQty(0.75)).toBe('¾')
    expect(formatQty(1 / 3)).toBe('⅓')
  })
  it('renders mixed numbers as whole + fraction', () => {
    expect(formatQty(1.5)).toBe('1 ½')
    expect(formatQty(2.25)).toBe('2 ¼')
  })
  it('rounds a fraction that lands on the next whole', () => {
    // 0.99 is within tolerance of 1 → rolls up to a clean whole
    expect(formatQty(0.99)).toBe('1')
  })
  it('snaps a near-eighth like 2.1 to a tidy fraction', () => {
    expect(formatQty(2.1)).toBe('2 ⅛')
  })
  it('falls back to a trimmed decimal when no nice fraction fits', () => {
    // 0.19 sits in the gap between ⅛ and ¼ — too far from either to snap
    expect(formatQty(0.19)).toBe('0.19')
    expect(formatQty(2.19)).toBe('2.19')
  })
  it('guards against zero / non-finite', () => {
    expect(formatQty(0)).toBe('0')
    expect(formatQty(NaN)).toBe('0')
    expect(formatQty(-1)).toBe('0')
  })
})

describe('scaleLine', () => {
  it('doubles a plain integer quantity', () => {
    expect(scaleLine('2 cups flour', 2)).toBe('4 cups flour')
  })
  it('halves to a fraction', () => {
    expect(scaleLine('1 cup sugar', 0.5)).toBe('½ cup sugar')
    expect(scaleLine('3 eggs', 0.5)).toBe('1 ½ eggs')
  })
  it('scales a decimal and keeps the rest of the line', () => {
    expect(scaleLine('1.5 kg chicken thighs', 2)).toBe('3 kg chicken thighs')
  })
  it('reads a comma decimal (fr) and a unicode fraction', () => {
    expect(scaleLine('1,5 tasse lait', 2)).toBe('3 tasse lait')
    expect(scaleLine('½ tasse beurre', 2)).toBe('1 tasse beurre')
  })
  it('reads a mixed number', () => {
    expect(scaleLine('1 1/2 cups oats', 2)).toBe('3 cups oats')
    expect(scaleLine('1½ cups oats', 2)).toBe('3 cups oats')
  })
  it('reads an ascii fraction', () => {
    expect(scaleLine('1/4 tsp salt', 2)).toBe('½ tsp salt')
  })
  it('scales both ends of a range', () => {
    expect(scaleLine('2-3 cloves garlic', 2)).toBe('4–6 cloves garlic')
    expect(scaleLine('2–3 cloves garlic', 2)).toBe('4–6 cloves garlic')
  })
  it('leaves a line with no leading quantity untouched', () => {
    expect(scaleLine('salt to taste', 2)).toBe('salt to taste')
    expect(scaleLine('a handful of basil', 3)).toBe('a handful of basil')
  })
  it('does not treat a trailing/inner number as the quantity', () => {
    expect(scaleLine('pasta no. 5', 2)).toBe('pasta no. 5')
  })
  it('is a no-op at factor 1 or a bad factor', () => {
    expect(scaleLine('2 cups flour', 1)).toBe('2 cups flour')
    expect(scaleLine('2 cups flour', 0)).toBe('2 cups flour')
    expect(scaleLine('2 cups flour', NaN)).toBe('2 cups flour')
  })

  // The headline fix: scale the spoon/cup too, not just the leading ml/g.
  it('scales a parenthetical alternate measure alongside the leading one', () => {
    expect(scaleLine('15 ml (1 c. à soupe) de beurre', 2)).toBe('30 ml (2 c. à soupe) de beurre')
    expect(scaleLine('250 ml (1 tasse) de lait', 2)).toBe('500 ml (2 tasse) de lait')
  })
  it('scales a standalone c. à soupe / c. à thé / tasse line', () => {
    expect(scaleLine('1 c. à soupe d’huile', 3)).toBe('3 c. à soupe d’huile')
    expect(scaleLine('1 c. à thé de sel', 2)).toBe('2 c. à thé de sel')
    expect(scaleLine('1 tasse de farine', 2)).toBe('2 tasse de farine')
  })
  it('keeps a measurable fraction (1 ½ c. à soupe), not a times-form', () => {
    expect(scaleLine('1 c. à soupe de miel', 1.5)).toBe('1 ½ c. à soupe de miel')
  })
  // QC recipes write "¼ DE tasse" (a quarter OF a cup). The connector form must
  // scale exactly like the bare form — and EVERY one on the line, not just the
  // leading one (the colour pills read all of them, so all must agree).
  it('scales a "de tasse" connector form, leading and non-leading', () => {
    expect(scaleLine('1/4 de tasse de sucre', 2)).toBe('½ de tasse de sucre')
    expect(scaleLine('Sucre, 1/4 de tasse', 2)).toBe('Sucre, ½ de tasse')
    expect(scaleLine('2 tasses de farine + 1/4 de tasse de sucre', 2)).toBe('4 tasses de farine + ½ de tasse de sucre')
    expect(scaleLine('60 ml (1/4 de tasse) de beurre', 2)).toBe('120 ml (½ de tasse) de beurre')
  })
  it('falls back to a "times" form when the scaled scoop is not measurable', () => {
    // ⅓ tasse × 2.5 = 0.833 — no tidy fraction to scoop → "2 ½× ⅓ tasse".
    expect(scaleLine('⅓ tasse de sucre', 2.5)).toBe('2 ½× ⅓ tasse de sucre')
  })

  // A heavy scaled amount promotes to a bigger tool nobody-scoops-8-tablespoons.
  it('promotes doubled tablespoons to a clean cup fraction', () => {
    expect(scaleLine('4 c. à soupe de beurre', 2)).toBe('½ tasse de beurre') // 8 tbsp = ½ cup
    expect(scaleLine('2 c. à soupe de sucre', 2)).toBe('¼ tasse de sucre') // 4 tbsp = ¼ cup
    expect(scaleLine('8 tbsp butter', 2)).toBe('1 cup butter') // 16 tbsp = 1 cup
  })
  it('promotes teaspoons to a tablespoon when they land clean', () => {
    expect(scaleLine('1 c. à thé de sel', 3)).toBe('1 c. à soupe de sel') // 3 tsp = 1 tbsp
  })
  it('leaves an amount with no clean bigger tool alone', () => {
    expect(scaleLine('1 c. à thé de sel', 2)).toBe('2 c. à thé de sel') // 2 tsp — no clean promote
    expect(scaleLine('3 c. à soupe de cacao', 2)).toBe('6 c. à soupe de cacao') // 6 tbsp = ⅜ cup, no tool
  })
  it('never promotes a metric unit (no bigger measuring tool)', () => {
    expect(scaleLine('250 ml de lait', 2)).toBe('500 ml de lait')
    expect(scaleLine('200 g de farine', 2)).toBe('400 g de farine')
  })
})

describe('scaleIngredients', () => {
  it('maps every line and returns the same array at factor 1', () => {
    const lines = ['2 cups flour', 'salt to taste']
    expect(scaleIngredients(lines, 1)).toBe(lines)
    expect(scaleIngredients(lines, 2)).toEqual(['4 cups flour', 'salt to taste'])
  })
})
