// @vitest-environment node
// Real-site JSON-LD, read through the whole no-AI URL path (parseRecipeJsonLd → draft).
// Each fixture is ONE schema.org/Recipe node; its `_note` says whether it was captured
// from the live page or hand-written in the shape a site ships. Grow this corpus when a
// site imports wrong: capture its node, assert the site's own step count.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { MAX_STEP_LEN, parseRecipeJsonLd } from './recipeImport'
import { draft } from './recipeDraft'

const DIR = join(import.meta.dirname, '..', 'test', 'fixtures', 'recipes')
const node = (name: string): Record<string, unknown> => JSON.parse(readFileSync(join(DIR, name), 'utf8'))
const page = (n: unknown) =>
  `<html><head><script type="application/ld+json">${JSON.stringify(n)}</script></head><body></body></html>`
const read = (n: unknown) => {
  const p = parseRecipeJsonLd(page(n))
  if (!p) throw new Error('no recipe')
  return draft({ ...p, structuring: 'jsonld' })
}
const real = (steps: string[]) => steps.filter((s) => !s.startsWith('## '))

describe('recipe fixtures — the site’s steps, all of them, as written', () => {
  it('Ricardo, one HowToSection (boulettes): 4 steps, no heading, multi-sentence steps kept whole', () => {
    const d = read(node('ricardo-boulettes-courge.json'))
    expect(d.steps).toHaveLength(4)
    expect(d.steps[0]).toBe('Placer la grille dans le bas du four. Préchauffer le four à 220 °C (425 °F).')
    expect(d.steps[3]).toBe(
      'Répartir les boulettes sur la courge. Verser le mélange de bouillon sur les boulettes et les légumes chauds. Poursuivre la cuisson au four 10 minutes ou jusqu’à ce que la sauce épaississe. Rectifier l’assaisonnement. Parsemer du persil et du parmesan.',
    )
    for (const s of d.steps) expect(s.length).toBeLessThanOrEqual(MAX_STEP_LEN)
  })

  it('Ricardo, two HowToSections (tarte au sucre): 5 steps under 2 headings; the 406-char step stays one', () => {
    const d = read(node('ricardo-tarte-au-sucre.json'))
    expect(d.steps.filter((s) => s.startsWith('## '))).toEqual(['## Pâtes brisée', '## Garniture'])
    expect(real(d.steps)).toHaveLength(5)
    expect(d.steps[0]).toBe('## Pâtes brisée')
    expect(d.steps[2]).toMatch(/^Sur un plan de travail fariné, .* Réfrigérer 30 minutes\.$/)
    expect(d.steps[d.steps.length - 1]).toBe('Cuire au four 45 minutes. Laisser refroidir complètement sur une grille.')
    for (const s of d.steps) expect(s.length).toBeLessThanOrEqual(MAX_STEP_LEN)
  })

  it('a final keeping step (« Se conserve… au réfrigérateur ») survives the JSON-LD path', () => {
    const n = node('ricardo-tarte-au-sucre.json') as { recipeInstructions: { itemListElement: unknown[] }[] }
    n.recipeInstructions[1].itemListElement.push({ '@type': 'HowToStep', text: 'Se conserve 3 jours au réfrigérateur.' })
    const d = read(n)
    expect(d.steps[d.steps.length - 1]).toBe('Se conserve 3 jours au réfrigérateur.')
  })

  it('WPRM blog (RecipeTin Eats): 10 HowToSteps with name + text + entities → 10 steps', () => {
    const d = read(node('wprm-blog.json'))
    expect(d.steps).toHaveLength(10)
    expect(d.steps[0]).toMatch(/^Pound and slice - Use your fist .* 1\/3" thick\. Slice into 5mm/)
    expect(d.steps[2]).toContain("Don't worry about pink bits")
    expect(d.steps[9]).toBe('Serve over pasta or egg noodles, sprinkled with chives if desired.')
    for (const s of d.steps) expect(s.length).toBeLessThanOrEqual(MAX_STEP_LEN)
  })

  it('one HTML string of paragraphs (hand-written shape): 5 steps, the keeping line kept', () => {
    const d = read(node('single-string-html.json'))
    expect(d.steps).toEqual([
      'Rincer les pois et les laisser tremper toute une nuit dans l’eau froide. Égoutter.',
      'Dans une grande casserole, déposer les pois, l’oignon, les carottes et le jarret. Couvrir d’eau et porter à ébullition en écumant la surface.',
      'Laisser mijoter à feu doux 2 h 30, en remuant de temps en temps, jusqu’à ce que les pois soient défaits.',
      'Retirer le jarret, l’effilocher et remettre la viande dans la soupe. Rectifier l’assaisonnement.',
      'Se conserve 4 jours au réfrigérateur.',
    ])
  })

  it('38 HowToSteps in two sections (hand-written shape): all 38, both headings, the last « Réfrigérer… » kept', () => {
    const d = read(node('many-steps.json'))
    expect(real(d.steps)).toHaveLength(38)
    expect(d.steps.filter((s) => s.startsWith('## '))).toEqual(['## Haricots', '## Montage'])
    expect(d.steps[1]).toBe('Étape de test numéro 1 : mélanger les ingrédients prévus et poursuivre la cuisson 1 minutes.')
    expect(d.steps[d.steps.length - 1]).toBe('Réfrigérer 4 heures avant de réchauffer et servir.')
  })
})
