import { describe, expect, it } from 'vitest'
import { FR } from '../i18n'
import { captureAck } from './captureAck'
import { formatDay, formatDayTime } from './format'

// Review #10: « Ajouté : dentiste · Léa » said neither WHAT nor WHEN. The line names the
// kind and the day the server filed on, so a capture can be checked at a glance.
const copy = { routed: FR.capture.routed, types: FR.capture.types, slots: FR.kitchen.slots }
const AT = 1795550400
const R = FR.capture.routed

describe('captureAck', () => {
  it('names the kind and the moment of an appointment', () => {
    const ack = captureAck({ kind: 'event', label: 'dentiste · Léa', when: { at: AT, allDay: false } }, copy, 'fr')
    expect(ack).toBe(`${R} Rendez-vous · dentiste · Léa · ${formatDayTime(AT, 'fr')}`)
  })

  it('gives a day without a time when the row is a whole day', () => {
    const ack = captureAck({ kind: 'task', label: 'sortir le bac', when: { at: AT, allDay: true } }, copy, 'fr')
    expect(ack).toBe(`${R} Tâche · sortir le bac · ${formatDay(AT, 'fr')}`)
  })

  it('names a meal by its slot: « Dîner » is lunch, never « Souper »', () => {
    const ack = captureAck({ kind: 'meal', label: 'soupe', when: { at: AT, allDay: true }, slot: 'lunch' }, copy, 'fr')
    expect(ack).toBe(`${R} Dîner · soupe · ${formatDay(AT, 'fr')}`)
  })

  it('says no day for what has none (a list line, a note)', () => {
    expect(captureAck({ kind: 'list-item', label: 'lait' }, copy, 'fr')).toBe(`${R} Liste · lait`)
    expect(captureAck({ kind: 'note', label: 'appeler mamie' }, copy, 'fr')).toBe(`${R} Note · appeler mamie`)
  })
})
