import { describe, it, expect } from 'vitest'
import { handoffGaps, HANDOFF_GAP_ORDER, type SitterWindowLike } from './handoffGaps'

// D-19 (bmad/10) — the sitter-card gap detector. Same pure "each gap fires alone,
// nothing fires when everything's filled" discipline as itemLife.test.ts.
describe('handoffGaps', () => {
  const FULL: SitterWindowLike = {
    wifi: { ssid: 'BellFibe-1234' },
    emergency: [{ name: 'Mamie', phone: '450-555-0201' }],
    toKnow: [{ name: 'Léa', isChild: true, notes: 'Allergie aux arachides' }],
    bedtimeRoutines: [{ id: 'r1', name: 'Coucher de Léa' }],
    pins: [{ kind: 'shutoff', label: 'Eau' }],
  }

  it('reports no gaps when every section is filled', () => {
    expect(handoffGaps(FULL)).toEqual([])
  })

  it('reports every gap when nothing is set at all', () => {
    expect(handoffGaps({})).toEqual([...HANDOFF_GAP_ORDER])
  })

  it('reports every gap for a null/undefined payload (not-yet-loaded)', () => {
    expect(handoffGaps(null)).toEqual([...HANDOFF_GAP_ORDER])
    expect(handoffGaps(undefined)).toEqual([...HANDOFF_GAP_ORDER])
  })

  it('flags emergency alone when it is empty', () => {
    expect(handoffGaps({ ...FULL, emergency: [] })).toEqual(['emergency'])
    expect(handoffGaps({ ...FULL, emergency: undefined })).toEqual(['emergency'])
  })

  it('flags toKnow alone when it is empty', () => {
    expect(handoffGaps({ ...FULL, toKnow: [] })).toEqual(['toKnow'])
  })

  it('flags bedtimeRoutines alone when it is empty', () => {
    expect(handoffGaps({ ...FULL, bedtimeRoutines: [] })).toEqual(['bedtimeRoutines'])
  })

  it('flags wifiSsid alone when the ssid is blank/null', () => {
    expect(handoffGaps({ ...FULL, wifi: { ssid: null } })).toEqual(['wifiSsid'])
    expect(handoffGaps({ ...FULL, wifi: { ssid: '' } })).toEqual(['wifiSsid'])
    expect(handoffGaps({ ...FULL, wifi: null })).toEqual(['wifiSsid'])
  })

  it('flags pins alone when it is empty', () => {
    expect(handoffGaps({ ...FULL, pins: [] })).toEqual(['pins'])
  })

  it('keeps the canonical order when multiple gaps fire together', () => {
    expect(handoffGaps({ wifi: { ssid: 'x' }, emergency: [], toKnow: [], bedtimeRoutines: [{ id: 'r1', name: 'x' }], pins: [] })).toEqual([
      'emergency',
      'toKnow',
      'pins',
    ])
  })
})
