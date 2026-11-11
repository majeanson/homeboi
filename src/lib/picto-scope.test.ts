import { describe, expect, it } from 'vitest'
import { pictoFor, taskPictoFor } from './picto'

// TASK WORDS STAY OFF THE LIST (unified tasks, phase 3 review, 2026-11-08). pictoFor pictures
// every grocery line and sorts « Par allée », so a house-upkeep noun added for a task's icon
// re-pictured the list: « Savon à vaisselle » went 🧼 → 🍽️. Task words live in TASK_MAP, read
// only by taskPictoFor. Planted red with the TASK_MAP lines moved back into MAP.
describe('task words never reach the grocery list', () => {
  it('a list line keeps its picture', () => {
    expect(pictoFor('Savon à vaisselle', '·')).toBe('🧼')
    for (const line of ['Feuilles de laurier', 'Nourriture pour chat', 'Piles AA', 'Sacs à poubelle', 'Bac à sable']) {
      expect(pictoFor(line, '·'), line).toBe('·')
    }
  })
  it('a task still gets its suggestion, and the shared words still answer', () => {
    expect(taskPictoFor('Nettoyer les gouttières', '')).toBe('🍂')
    expect(taskPictoFor('Laver la vaisselle', '')).toBe('🍽️')
    expect(taskPictoFor('Bacon', '')).toBe(pictoFor('Bacon', ''))
  })
})

// More house words (the owner, 2026-11-10: « more emojis, for recyclage and house stuff »). The
// traps are pinned by name: Québec « vidanges » is the garbage but « vidange d'huile » is the
// car; the recycling and the compost each get their own picture, not the garbage can; and a
// specific object wins over the generic « nettoyer ».
describe('a house task gets its own picture', () => {
  const cases: [string, string][] = [
    ['Sortir le recyclage', '♻️'],
    ['♻️ Récupération', '♻️'],
    ['Sortir le bac bleu', '♻️'],
    ['🍂 Composte', '🍂'],
    ['Sortir les vidanges', '🗑️'],
    ['Vidange d’huile', '🛢️'],
    ["Changement d'huile de l'auto", '🛢️'],
    ['Laver la voiture', '🚗'],
    ['Nettoyer les gouttières', '🍂'],
    ['Nettoyer la salle de bain', '🚽'],
    ['Nettoyer le four', '🍳'],
    ['Dégivrer le congélateur', '🧊'],
    ['Laver les planchers', '🪣'],
    ['Passer l’aspirateur', '🧹'],
    ['Faire le ménage', '🧹'],
    ['Faire le lavage', '🧺'],
    ['Changer les draps', '🛏️'],
    ['Arroser les plantes', '🪴'],
    ['Désherber le potager', '🌱'],
    ['Refaire la clôture', '🪵'],
    ['Changer le filtre de la fournaise', '🔥'],
    ['Nettoyer le filtre de la thermopompe', '🌬️'],
    ['Tester les détecteurs de fumée', '🧯'],
    ['Ouvrir la piscine', '🏊'],
    ['Payer les taxes', '🧾'],
    ['Appeler la garderie', '📞'],
    ['Ongles à Juju', '💅'],
    ['Trier les photos', '📷'],
    ['Monter le sapin', '🎄'],
  ]
  for (const [title, emoji] of cases) it(title, () => expect(taskPictoFor(title, '')).toBe(emoji))
  it('the grocery list is still untouched by them', () => {
    for (const [line, taskPicture] of [['Sacs de recyclage', '♻️'], ['Filtre à café', '🌀'], ['Peinture à doigts', '🖌️'], ['Ampoules DEL', '💡']] as const) {
      expect(pictoFor(line, '·'), line).not.toBe(taskPicture)
    }
    expect(pictoFor('Savon à vaisselle', '·')).toBe('🧼')
  })
})
