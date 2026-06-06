// @vitest-environment node
import { describe, it, expect } from 'vitest'
import {
  parseRecipeJsonLd,
  extractJsonLdBlocks,
  findRecipeNode,
  normalizeInstructions,
  normalizeImage,
  htmlToText,
} from './recipeImport'

const wrap = (json: unknown) =>
  `<html><head><script type="application/ld+json">${JSON.stringify(json)}</script></head><body>x</body></html>`

describe('extractJsonLdBlocks', () => {
  it('pulls each ld+json block (tolerates attribute order/spacing)', () => {
    const html = `<script type='application/ld+json' data-x>${JSON.stringify({ a: 1 })}</script>
      <script  type="application/ld+json">${JSON.stringify([{ b: 2 }])}</script>`
    const blocks = extractJsonLdBlocks(html)
    expect(blocks).toHaveLength(2)
  })

  it('skips an unparseable block without throwing', () => {
    const html = `<script type="application/ld+json">{ not json }</script>`
    expect(extractJsonLdBlocks(html)).toEqual([])
  })
})

describe('findRecipeNode', () => {
  it('finds a Recipe inside @graph and string-or-array @type', () => {
    const graph = { '@graph': [{ '@type': 'WebPage' }, { '@type': ['Thing', 'Recipe'], name: 'X' }] }
    expect(findRecipeNode(graph)).toMatchObject({ name: 'X' })
  })
  it('returns null when there is no Recipe', () => {
    expect(findRecipeNode({ '@type': 'Article' })).toBeNull()
  })
})

describe('normalizeInstructions', () => {
  it('flattens HowToStep objects', () => {
    expect(normalizeInstructions([{ '@type': 'HowToStep', text: 'Boil.' }, { text: 'Stir.' }])).toEqual([
      'Boil.',
      'Stir.',
    ])
  })
  it('flattens HowToSection > itemListElement', () => {
    const v = [{ '@type': 'HowToSection', itemListElement: [{ text: 'A' }, { text: 'B' }] }]
    expect(normalizeInstructions(v)).toEqual(['A', 'B'])
  })
  it('splits a single newline-separated string into steps', () => {
    expect(normalizeInstructions('Step one\n\nStep two')).toEqual(['Step one', 'Step two'])
  })
})

describe('normalizeImage', () => {
  it('takes a string, upgrades http→https', () => {
    expect(normalizeImage('http://x.com/a.jpg')).toBe('https://x.com/a.jpg')
  })
  it('takes the first of an array and ImageObject.url', () => {
    expect(normalizeImage([{ url: 'https://x.com/1.jpg' }, 'https://x.com/2.jpg'])).toBe('https://x.com/1.jpg')
  })
  it('rejects non-https junk', () => {
    expect(normalizeImage('ftp://x')).toBeNull()
    expect(normalizeImage(null)).toBeNull()
  })
})

describe('parseRecipeJsonLd', () => {
  it('parses a typical schema.org Recipe', () => {
    const html = wrap({
      '@context': 'https://schema.org',
      '@type': 'Recipe',
      name: 'Spaghetti maison',
      recipeIngredient: ['400 g de pâtes', '1 pot de sauce', '500 g de bœuf haché'],
      recipeInstructions: [{ '@type': 'HowToStep', text: 'Faire bouillir les pâtes.' }, { text: 'Mijoter la sauce.' }],
      image: 'https://x.com/spag.jpg',
    })
    const r = parseRecipeJsonLd(html)
    expect(r).not.toBeNull()
    expect(r!.title).toBe('Spaghetti maison')
    expect(r!.ingredients).toHaveLength(3)
    expect(r!.steps).toEqual(['Faire bouillir les pâtes.', 'Mijoter la sauce.'])
    expect(r!.image).toBe('https://x.com/spag.jpg')
  })

  it('returns null for a page with no Recipe JSON-LD', () => {
    expect(parseRecipeJsonLd(wrap({ '@type': 'Article', name: 'x' }))).toBeNull()
  })

  it('handles instructions given as one plain string', () => {
    const html = wrap({ '@type': 'Recipe', name: 'X', recipeIngredient: ['a'], recipeInstructions: 'Do A.\nDo B.' })
    expect(parseRecipeJsonLd(html)!.steps).toEqual(['Do A.', 'Do B.'])
  })

  it('strips inline HTML (links, bold) from steps and ingredients', () => {
    const html = wrap({
      '@type': 'Recipe',
      name: 'X',
      recipeIngredient: ['<strong>400 g</strong> de p&acirc;tes'.replace('&acirc;', 'â')],
      recipeInstructions: [
        { '@type': 'HowToStep', text: 'Chauffer une <a href="https://shop.example.com/poele?utm=x">poêle</a> à feu moyen.' },
      ],
    })
    const r = parseRecipeJsonLd(html)!
    expect(r.steps).toEqual(['Chauffer une poêle à feu moyen.'])
    expect(r.ingredients).toEqual(['400 g de pâtes'])
  })
})

describe('htmlToText', () => {
  it('strips scripts/styles/tags and collapses whitespace', () => {
    const html = '<style>.a{}</style><h1>Hi</h1><script>x()</script><p>there\n  friend</p>'
    expect(htmlToText(html)).toBe('Hi there friend')
  })
})
