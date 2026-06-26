import { describe, it, expect } from 'vitest'
import { isPdfKey, warrantyExpiries, type Carnet } from './carnets'

const carnet = (over: Partial<Carnet>): Carnet => ({
  id: 'c1',
  parentId: null,
  kind: 'appliance',
  name: 'Chauffe-eau',
  mediaKey: null,
  color: '#88a36f',
  facts: null,
  installedAt: null,
  lifespanMonths: null,
  linkId: null,
  notes: null,
  sort: 0,
  ...over,
})

describe('isPdfKey', () => {
  it('detects the .pdf suffix (case-insensitive), nothing else', () => {
    expect(isPdfKey('cl_abc.pdf')).toBe(true)
    expect(isPdfKey('cl_abc.PDF')).toBe(true)
    expect(isPdfKey('cl_abc.jpg')).toBe(false)
    expect(isPdfKey('cl_abc')).toBe(false) // suffix-less (pre-fix upload)
  })
})

describe('warrantyExpiries', () => {
  const now = Math.floor(new Date(2026, 0, 15).getTime() / 1000)
  const day = 86400
  it('surfaces a warranty inside the lead window, soonest first', () => {
    const items = [
      carnet({ id: 'a', name: 'A', facts: { warrantyUntil: now + 90 * day } }),
      carnet({ id: 'b', name: 'B', facts: { warrantyUntil: now + 30 * day } }),
    ]
    const out = warrantyExpiries(items, now)
    expect(out.map((w) => w.carnetId)).toEqual(['b', 'a'])
  })
  it('stays quiet for a far-off or already-expired warranty', () => {
    const items = [
      carnet({ id: 'far', facts: { warrantyUntil: now + 400 * day } }),
      carnet({ id: 'gone', facts: { warrantyUntil: now - 5 * day } }),
      carnet({ id: 'none', facts: null }),
    ]
    expect(warrantyExpiries(items, now)).toEqual([])
  })
})
