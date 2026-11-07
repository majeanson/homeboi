import { describe, expect, it } from 'vitest'
import { FR } from '../i18n'
import { frictionRow, type Friction, type FrictionKind } from './aRegler'

// The endpoint sends structure, this composes the sentence — so the promises that keep a
// wall tablet calm and discreet live here, not in the scan.

const row = (kind: FrictionKind, over: Partial<Friction> = {}) =>
  frictionRow({ kind, key: 'k', label: '', href: '/board', ...over }, FR)

describe('frictionRow', () => {
  it('never puts a sender on the wall: the mail lines ignore whatever label arrives', () => {
    expect(row('mail-postbox', { label: 'Mamie' }).text).not.toContain('Mamie')
    expect(row('mail-intake', { label: 'Mamie' }).text).not.toContain('Mamie')
  })

  it('keeps the two mail kinds apart: a message and a person are different glyphs', () => {
    expect(row('mail-postbox').icon).toBe('envelope-bold')
    expect(row('mail-intake').icon).toBe('user-bold')
  })

  it('names the slot that is empty, not always the souper', () => {
    expect(row('meal-empty', { label: 'lunch', sub: 'tomorrow' }).text).toBe('Dîner de demain à planifier')
    expect(row('meal-empty', { label: 'supper', sub: 'today' }).text).toBe('Souper d’aujourd’hui à planifier')
  })

  it('reads a pre-upgrade payload (no label, no day) as tomorrow’s souper', () => {
    expect(row('meal-empty').text).toBe('Souper de demain à planifier')
  })

  it('leaves the parenthesis off a car clash when nobody is known to hold the car', () => {
    expect(row('car-clash', { label: 'Épicerie', sub: 'Travail' }).text).toBe('Épicerie — l’auto est déjà prise (Travail)')
    expect(row('car-clash', { label: 'Épicerie' }).text).toBe('Épicerie — l’auto est déjà prise')
  })

  it('carries the label into the remaining lines, each with its own icon', () => {
    expect(row('ride', { label: 'Soccer' })).toEqual({ icon: 'car-bold', text: 'Soccer — personne pour conduire' })
    expect(row('birthday', { label: 'Léa' })).toEqual({ icon: 'cake-bold', text: 'Léa — fête bientôt, aucune idée de cadeau' })
    expect(row('transfer-due', { label: 'Loyer' })).toEqual({ icon: 'receipt-bold', text: 'Loyer — un virement à envoyer' })
    expect(row('meal-low', { label: 'Tacos', sub: 'limes' })).toEqual({ icon: 'carrot-bold', text: 'Tacos : il manque limes' })
  })

  it('does not print « undefined » when a low-stock line lost its item', () => {
    expect(row('meal-low', { label: 'Tacos' }).text).not.toContain('undefined')
  })
})
