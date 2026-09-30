import { describe, expect, it } from 'vitest'
import { itemNameFromFlyer } from './flyerName'
import { matchListItem, type ListItem } from './picks'
import { lineMatches } from '../../functions/_lib/listMatch'
import { normalizeItem } from '../../functions/_lib/normalize'

// The real titles: nine lines on Marc's list on 2026-09-30, plus the bilingual Flipp
// name the Flipp send path documents. The expected names are the point of the feature;
// the property below is the point of the SAFETY — lose it and a flyer deal stops finding
// its line again next week and spawns a twin.
const REAL: [string, string][] = [
  ['GROS ŒUFS BLANCS SANS NOM, 12 UN.', 'Gros œufs blancs'],
  ['CUISSES DE POULET AVEC DEUX FORMATS CLUB', 'Cuisses de poulet'],
  ['FRAISES, 1 L', 'Fraises'],
  ['CAROTTES OU OIGNONS JAUNES DÉLICES DU MARCHÉ, SAC DE 3 LB,', 'Carottes ou oignons jaunes délices du marché'],
  ['CHOU VERT OU ROUGE', 'Chou vert ou rouge'],
  ['POMMES CORTLAND OU MCINTOSH', 'Pommes cortland ou mcintosh'],
  ['TOMATES DES CHAMPS, OU COURGETTES VERTES', 'Tomates des champs'],
  ['PÂTÉ OU QUICHE ST-HUBERT, 550-800 G', 'Pâté ou quiche st-hubert'],
  ['MIEL BILLY BEE | BILLY BEE HONEY 500 g', 'Miel billy bee'],
  ["MELON D'EAU ENTIER SANS PÉPINS, ENVIRON 9 LB", "Melon d'eau entier sans pépins"],
]

describe('itemNameFromFlyer', () => {
  it.each(REAL)('%s → %s', (title, name) => {
    expect(itemNameFromFlyer(title)).toBe(name)
  })

  it('cuts a size or a filler marker that comes without a comma', () => {
    expect(itemNameFromFlyer('POITRINES DE POULET 2 KG')).toBe('Poitrines de poulet')
    expect(itemNameFromFlyer('Pommes Gala 3 lb')).toBe('Pommes Gala')
    expect(itemNameFromFlyer('CAFÉ MOULU SAC DE 900 G')).toBe('Café moulu')
  })

  it('leaves a person’s own words alone', () => {
    // DealsBrowser's item search passes the word that was TYPED; it must come back as is.
    for (const typed of ['oeufs', 'Lait 2%', 'Pain tranché', 'Pommes Gala']) expect(itemNameFromFlyer(typed)).toBe(typed)
  })

  it('never goes below one word, and never returns empty for a real title', () => {
    expect(itemNameFromFlyer('SAC DE 3 LB')).toBe('Sac')
    expect(itemNameFromFlyer('  ')).toBe('')
  })

  // THE SAFETY PROPERTY. The line named by this function must be found again by the SAME
  // title — through the client's matcher (a Flipp clipping coming back, a second tap in
  // the flyer) and through the server's backstop (a cold cache, an offline replay).
  it.each(REAL)('the same title finds its line again: %s', (title) => {
    const line: ListItem = { id: 'x', text: itemNameFromFlyer(title) }
    expect(matchListItem([line], title)?.id).toBe('x')
    expect(lineMatches(normalizeItem(title), { text: line.text, search_terms: null })).toBe(true)
  })
})
