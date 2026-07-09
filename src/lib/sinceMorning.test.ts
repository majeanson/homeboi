import { describe, it, expect } from 'vitest'
import { FR } from '../i18n'
import { composeSinceMorning, type ChangeRow } from './sinceMorning'

// Build a minimal wire row with just the fields the composer reads.
const row = (overrides: Partial<ChangeRow> & Pick<ChangeRow, 'id' | 'kind' | 'at'>): ChangeRow => ({
  text: '',
  memberId: null,
  name: null,
  avatarKind: null,
  avatarRef: null,
  colour: null,
  authorLabel: null,
  ...overrides,
})

describe('composeSinceMorning — per-source sentences', () => {
  it('list_item -> "<name> a ajouté <text>"', () => {
    const [e] = composeSinceMorning(
      [row({ id: '1', kind: 'list_item', at: 100, text: 'du lait', name: 'Papa' })],
      FR,
    )
    expect(e.text).toBe('Papa a ajouté du lait')
    expect(e.face?.name).toBe('Papa')
  })

  it('meal -> "<name> a proposé <title>"', () => {
    const [e] = composeSinceMorning(
      [row({ id: '1', kind: 'meal', at: 100, text: 'une pizza', name: 'Léa' })],
      FR,
    )
    expect(e.text).toBe('Léa a proposé une pizza')
  })

  it('note with text -> quotes a short excerpt', () => {
    const [e] = composeSinceMorning(
      [row({ id: '1', kind: 'note', at: 100, text: 'penser à appeler maman', name: 'Cam' })],
      FR,
    )
    expect(e.text).toBe('Cam a laissé un mot : « penser à appeler maman »')
  })

  it('note with text longer than the excerpt cap is truncated with an ellipsis', () => {
    const long = 'x'.repeat(60)
    const [e] = composeSinceMorning([row({ id: '1', kind: 'note', at: 100, text: long, name: 'Cam' })], FR)
    expect(e.text).toBe(`Cam a laissé un mot : « ${'x'.repeat(40)}… »`)
  })

  it('note with no text -> generic "a laissé un mot" (media-only postbox drop)', () => {
    const [e] = composeSinceMorning([row({ id: '1', kind: 'note', at: 100, text: '', name: 'Papi' })], FR)
    expect(e.text).toBe('Papi a laissé un mot')
  })

  it('day_note -> "<name> a écrit une note pour la journée"', () => {
    const [e] = composeSinceMorning([row({ id: '1', kind: 'day_note', at: 100, name: 'Papa' })], FR)
    expect(e.text).toBe('Papa a écrit une note pour la journée')
  })

  it('drawing -> "<name> a fait un dessin"', () => {
    const [e] = composeSinceMorning([row({ id: '1', kind: 'drawing', at: 100, name: 'Léa' })], FR)
    expect(e.text).toBe('Léa a fait un dessin')
  })

  it('event -> face-less "Nouveau rendez-vous : <title>" line, no face', () => {
    const [e] = composeSinceMorning(
      [row({ id: '1', kind: 'event', at: 100, text: 'Dentiste', name: 'Papa' })],
      FR,
    )
    expect(e.text).toBe('Nouveau rendez-vous : Dentiste')
    expect(e.face).toBeNull()
  })
})

describe('composeSinceMorning — Maisonnée / no-member fallback', () => {
  it('null member (Maisonnée) falls back to "Quelqu\'un"', () => {
    const [e] = composeSinceMorning(
      [row({ id: '1', kind: 'list_item', at: 100, text: 'du pain', name: null })],
      FR,
    )
    expect(e.text).toBe('Quelqu’un a ajouté du pain')
    expect(e.face?.name).toBe('Quelqu’un')
  })
})

describe('composeSinceMorning — author_label (postbox) takes precedence', () => {
  it('a postbox note names the sender (author_label), even when a member matched (tint)', () => {
    const [e] = composeSinceMorning(
      [
        row({
          id: '1',
          kind: 'note',
          at: 100,
          text: 'Bisous',
          name: 'Léa', // exact-name-matched member (tint), NOT the sender
          authorLabel: 'Papi',
          colour: '#ff0000',
        }),
      ],
      FR,
    )
    expect(e.text).toBe('Papi a laissé un mot : « Bisous »')
    expect(e.face?.name).toBe('Papi')
    // the tint (colour) still rides along from the matched member.
    expect(e.face?.colour).toBe('#ff0000')
  })

  it('a postbox note with no member match still names the sender, generic disc', () => {
    const [e] = composeSinceMorning(
      [row({ id: '1', kind: 'note', at: 100, text: '', name: null, authorLabel: 'Mamie' })],
      FR,
    )
    expect(e.text).toBe('Mamie a laissé un mot')
    expect(e.face?.name).toBe('Mamie')
    expect(e.face?.colour).toBeNull()
  })
})

describe('composeSinceMorning — sort + cap', () => {
  it('sorts newest first regardless of input order', () => {
    const rows = [
      row({ id: 'a', kind: 'drawing', at: 100, name: 'Léa' }),
      row({ id: 'b', kind: 'drawing', at: 300, name: 'Cam' }),
      row({ id: 'c', kind: 'drawing', at: 200, name: 'Papa' }),
    ]
    expect(composeSinceMorning(rows, FR).map((e) => e.key)).toEqual(['drawing-b', 'drawing-c', 'drawing-a'])
  })

  it('caps the merged result to the default of 20', () => {
    const rows = Array.from({ length: 30 }, (_, i) => row({ id: String(i), kind: 'drawing', at: i, name: 'Léa' }))
    expect(composeSinceMorning(rows, FR)).toHaveLength(20)
  })

  it('keeps the newest N when capped, not an arbitrary N', () => {
    const rows = Array.from({ length: 25 }, (_, i) => row({ id: String(i), kind: 'drawing', at: i, name: 'Léa' }))
    const kept = composeSinceMorning(rows, FR).map((e) => e.key)
    expect(kept).toContain('drawing-24')
    expect(kept).not.toContain('drawing-0')
  })

  it('honours a custom cap', () => {
    const rows = Array.from({ length: 10 }, (_, i) => row({ id: String(i), kind: 'drawing', at: i, name: 'Léa' }))
    expect(composeSinceMorning(rows, FR, 3)).toHaveLength(3)
  })

  it('an empty row list composes to an empty entry list', () => {
    expect(composeSinceMorning([], FR)).toEqual([])
  })
})
