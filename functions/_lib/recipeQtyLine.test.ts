// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { htmlToText, pageIngredientsPlausible, parsePastedRecipe } from './recipeImport'

// F (2026-10-27): a site that lays an ingredient out as two cells — the amount, then the
// words — reaches the paste parser as a bare « 250 ml » line and an orphan « de farine »
// one. It is ONE ingredient, and reads as one.
describe('a quantity on its own line joins the words under it', () => {
  it('« <div>250 ml</div><div>de farine</div> » → « 250 ml de farine »', () => {
    const html =
      '<h2>Ingrédients</h2><div>250 ml</div><div>de farine</div><div>2</div><div>oeufs</div><div>1 c. à soupe</div><div>de sucre</div>' +
      '<h2>Préparation</h2><p>Mélanger.</p><p>Cuire 20 minutes.</p>'
    const r = parsePastedRecipe(htmlToText(html))
    expect(r.ingredients).toEqual(['250 ml de farine', '2 oeufs', '1 c. à soupe de sucre'])
    expect(pageIngredientsPlausible(r.ingredients)).toBe(true)
  })

  it('an amount followed by another amount is not joined; a real line is left alone', () => {
    const r = parsePastedRecipe('Ingrédients\n250 ml\n500 ml de lait\n1 tasse de farine\nPréparation\nMélanger.')
    expect(r.ingredients).toEqual(['250 ml', '500 ml de lait', '1 tasse de farine'])
  })

  it('works without headings too (the shape fallback)', () => {
    const r = parsePastedRecipe('Crêpes\n250 ml\nde farine\n2\noeufs\nMélanger la farine et les oeufs dans un bol.\nCuire à feu moyen.')
    expect(r.ingredients).toEqual(['250 ml de farine', '2 oeufs'])
  })

  it('a table row stays one line', () => {
    expect(htmlToText('<table><tr><td>250 ml</td><td>de farine</td></tr></table>')).toBe('250 ml de farine')
  })
})
