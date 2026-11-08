import { describe, expect, it } from 'vitest'
import { lookColour, lookOf, subjectOf, subjectRefOf, suggestIcon, type SubjectLookup } from './subjects'

const lookup: SubjectLookup = {
  members: [{ id: 'm1', display_name: 'Léa', colour: '#111111' }],
  carnets: [{ id: 'c1', name: 'La maison', kind: 'home', color: '#222222' }],
  contacts: [{ id: 'p1', name: 'Mamie', colour: null }],
  pets: [{ id: 'a1', name: 'Rex', colour: '#333333' }],
  projects: [{ id: 'h1', title: 'Le sous-sol', color: '#444444' }],
  trips: [{ id: 't1', title: 'Gaspésie', colour: '#555555' }],
}

describe('subjectOf', () => {
  it('no subject answers with nothing, not with a fallback name', () => {
    expect(subjectOf(null, lookup)).toMatchObject({ ref: null, name: null, to: null, icon: null })
    expect(subjectOf(undefined)).toMatchObject({ ref: null })
  })

  it.each([
    ['carnet', 'c1', 'La maison', '/cercle/carnet/c1', '#222222'],
    ['person', 'm1', 'Léa', '/maison?section=family', '#111111'],
    ['person', 'p1', 'Mamie', '/cercle/person/p1', null],
    ['pet', 'a1', 'Rex', '/cercle/pet/a1', '#333333'],
    ['trip', 't1', 'Gaspésie', '/voyage/t1', '#555555'],
    ['project', 'h1', 'Le sous-sol', '/board?view=taches&par=sujet&sujet=project:h1', '#444444'],
  ] as const)('%s %s resolves name, link and colour', (kind, id, name, to, colour) => {
    const s = subjectOf({ kind, id }, lookup)
    expect(s).toMatchObject({ name, to, colour })
    expect(s.icon).toBeTruthy()
  })

  it('a member with a linked contact opens that contact’s page', () => {
    const linked = { ...lookup, contacts: [{ id: 'p9', name: 'Léa T.', member_id: 'm1' }] }
    expect(subjectOf({ kind: 'person', id: 'm1' }, linked).to).toBe('/cercle/person/p9')
  })

  it('a stored row reads as a ref, and its carnet_id is a carnet', () => {
    expect(subjectRefOf({ subject_kind: 'pet', subject_id: 'a1' })).toEqual({ kind: 'pet', id: 'a1' })
    expect(subjectRefOf({ carnet_id: 'c1' })).toEqual({ kind: 'carnet', id: 'c1' })
    expect(subjectRefOf({ subject_kind: 'moon', subject_id: 'x' })).toBeNull()
    expect(subjectRefOf(null)).toBeNull()
  })

  it('a carnet wears its own glyph', () => {
    expect(subjectOf({ kind: 'carnet', id: 'c1' }, lookup).emoji).toBeTruthy()
  })

  // The board's promise: resolving must not need a query. With nothing to read, a row still
  // gets its leading icon and its door; only the name waits.
  it('the kind alone still gives an icon and a link, and never invents a name', () => {
    expect(subjectOf({ kind: 'pet', id: 'gone' })).toMatchObject({ name: null, colour: null, to: '/cercle/pet/gone', icon: 'smiley-bold' })
  })

  it('a deleted subject reads as its kind, with no name', () => {
    expect(subjectOf({ kind: 'carnet', id: 'gone' }, lookup)).toMatchObject({ name: null, emoji: null })
  })
})

// THE LOOK (0148): task override, then subject, then the default, and nowhere else.
describe('lookOf', () => {
  const pets = { pets: [{ id: 'a1', name: 'Rex', colour: '#333333', icon: '🐕' }] }
  const maison = subjectOf({ kind: 'carnet', id: 'c1' }, lookup)

  it('no pick and no subject: the category default, in both halves', () => {
    expect(lookOf({ icon: null, color: null }, subjectOf(null))).toEqual({ emoji: null, icon: null, colour: null })
  })

  it('no pick: the subject shows through, its emoji and its colour', () => {
    expect(lookOf({ icon: null, color: null }, maison)).toEqual({ emoji: maison.emoji, icon: null, colour: '#222222' })
    expect(lookOf({}, subjectOf({ kind: 'pet', id: 'a1' }, pets))).toEqual({ emoji: '🐕', icon: null, colour: '#333333' })
  })

  it('a subject with no glyph of its own lends its kind icon', () => {
    expect(lookOf({}, subjectOf({ kind: 'person', id: 'm1' }, lookup))).toMatchObject({ emoji: null, icon: 'user-bold', colour: '#111111' })
  })

  it('the task own pick wins, each half on its own', () => {
    expect(lookOf({ icon: '🍂', color: null }, maison)).toEqual({ emoji: '🍂', icon: null, colour: '#222222' })
    expect(lookOf({ icon: null, color: '#B06A93' }, maison)).toEqual({ emoji: maison.emoji, icon: null, colour: '#B06A93' })
  })

  // The column default was written by every form unasked: it is not a choice, in any case.
  it('the stored task default reads as « not chosen », so the subject colour shows', () => {
    expect(lookColour('#88A36F')).toBeNull()
    expect(lookColour('#88a36f')).toBeNull()
    expect(lookColour('#B06A93')).toBe('#B06A93')
    expect(lookOf({ color: '#88A36F' }, maison).colour).toBe('#222222')
  })
})

describe('suggestIcon', () => {
  it('suggests a picture for the words, or nothing', () => {
    expect(suggestIcon('Nettoyer les gouttières')).toBe('🍂')
    expect(suggestIcon('Sortir le bac')).toBe('🗑️')
    expect(suggestIcon('Vaccin du chien')).toBe('🐶')
    expect(suggestIcon('Zzyzx')).toBeNull()
    expect(suggestIcon('   ')).toBeNull()
  })
  it('the ambiguous words do not misfire', () => {
    expect(suggestIcon('Souper à 6 h pile')).not.toBe('🔋')
    expect(suggestIcon('Tire d’érable')).not.toBe('🛞')
  })
})
