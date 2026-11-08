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
