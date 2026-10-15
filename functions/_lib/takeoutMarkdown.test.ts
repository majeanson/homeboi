import { describe, it, expect } from 'vitest'
import type { Takeout } from './takeout'
import { takeoutMarkdown } from './takeoutMarkdown'

// 2026-10-15 12:00 UTC — the export instant; meals are stored as local midnights.
const NOW = Date.UTC(2026, 9, 15, 12) / 1000
const midnight = (d: number) => Date.UTC(2026, 9, d, 4) / 1000 // 00:00 at UTC-4

const dump = (tables: Takeout['tables'], household: Takeout['household'] = { name: 'Maisonnée Tremblay' }): Takeout => ({
  app: 'Babillard',
  format: 1,
  householdId: 'h1',
  exportedAt: NOW,
  household,
  tables,
  skipped: [],
  media: [],
})

describe('the readable takeout', () => {
  it('renders a recipe with its sections, steps and meta — headings are not list items', () => {
    const md = takeoutMarkdown(
      dump({
        recipes: [
          {
            title: 'Pâté chinois',
            servings: 6,
            servings_unit: 'portions',
            prep_min: 20,
            cook_min: 45,
            ingredients_json: JSON.stringify(['## Viande', '1 lb de boeuf', '## Purée', '4 patates']),
            steps_json: JSON.stringify(['Cuire le boeuf', '## Montage', 'Superposer']),
            tags_json: JSON.stringify(['plat principal']),
            notes: 'Mieux le lendemain',
            source: 'Grand-maman',
          },
        ],
      }),
    )
    expect(md).toContain('# Maisonnée Tremblay')
    expect(md).toContain('### Pâté chinois')
    expect(md).toContain('_6 portions · prép. 20 min · cuisson 45 min · #plat-principal_')
    expect(md).toContain('**Viande**\n\n- 1 lb de boeuf')
    expect(md).toContain('**Purée**\n\n- 4 patates')
    expect(md).not.toContain('- ## ')
    // The numbering restarts under a heading.
    expect(md).toContain('1. Cuire le boeuf')
    expect(md).toContain('**Montage**\n\n1. Superposer')
    expect(md).toContain('> Mieux le lendemain')
    expect(md).toContain('Source : Grand-maman')
  })

  it('the list shows only what is still to buy; supper skips the past; soft-deleted notes stay out', () => {
    const md = takeoutMarkdown(
      dump({
        list_items: [
          { text: 'Lait', checked_at: null },
          { text: 'Pain', checked_at: 123 },
          { text: 'Oeufs', checked_at: null, deleted_at: 5 },
        ],
        meals: [
          { date: midnight(10), title: 'Vieux souper' },
          { date: midnight(16), title: 'Spaghetti' },
        ],
        family_notes: [
          { text: 'Dentiste jeudi', created_at: NOW, deleted_at: null },
          { text: 'Effacée', created_at: NOW, deleted_at: 9 },
        ],
      }),
    )
    expect(md).toContain('- [ ] Lait')
    expect(md).not.toContain('Pain')
    expect(md).not.toContain('Oeufs')
    expect(md).toContain('**ven. 2026-10-16** — Spaghetti')
    expect(md).not.toContain('Vieux souper')
    expect(md).toContain('Dentiste jeudi')
    expect(md).not.toContain('Effacée')
  })

  it('an empty household still yields a readable file, in the requested language', () => {
    const fr = takeoutMarkdown(dump({}, null))
    expect(fr).toContain('# Ma maisonnée')
    expect(fr).toContain('Rien à acheter pour l’instant.')
    const en = takeoutMarkdown(dump({}, null), 'en')
    expect(en).toContain('# My household')
    expect(en).toContain('Nothing to buy right now.')
  })

  it('people and routines render, and untrusted text cannot become structure', () => {
    const md = takeoutMarkdown(
      dump({
        members: [{ display_name: 'Léa', sort_order: 1 }],
        contacts: [{ first_name: 'Marie', last_name: 'Roy', nickname: 'Mamie', birthday: '0000-03-04', phone: '514-555-0100' }],
        routines: [{ name: 'Matin', cards_json: JSON.stringify([{ label: 'Déjeuner' }, { label: 'Dents' }]) }],
        list_items: [{ text: '# Pas un titre\nsur deux lignes', checked_at: null }],
      }),
    )
    expect(md).toContain('- Léa _(maisonnée)_')
    expect(md).toContain('- Marie Roy — « Mamie » · Anniversaire 03-04 · 514-555-0100')
    expect(md).toContain('- **Matin** — Déjeuner → Dents')
    expect(md).toContain('- [ ] \\# Pas un titre sur deux lignes')
  })

  it('a corrupt json column drops a line, never the export', () => {
    const md = takeoutMarkdown(dump({ recipes: [{ title: 'Cassée', ingredients_json: '{not json', steps_json: 42 }] }))
    expect(md).toContain('### Cassée')
  })
})
