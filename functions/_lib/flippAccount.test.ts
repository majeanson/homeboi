import { describe, it, expect } from 'vitest'
import { buildOps, clearOps, type Clipping, type ServerList } from './flippAccount'

// The op-builder is the fragile half of « Lier Flipp »: the exact objects we PUT to
// Flipp's private accounts API, and the de-dupe that keeps a re-send from doubling.
// It is PURE, so it is tested here in isolation — the network half (pushToFlipp)
// only wires it to their endpoints, and e2e/flipp-live would catch a moved shape.

const clip = (over: Partial<Clipping>): Clipping => ({
  flyerItemId: 101,
  name: 'Lait 2% 4L',
  flyerId: 5001,
  price: '4.99',
  merchantId: 3384,
  merchantName: 'Super C',
  merchantLogoUrl: 'https://l',
  thumbnailUrl: 'https://t',
  validTo: '2026-09-16T23:59:59-04:00',
  left: 10,
  right: 20,
  top: -5,
  bottom: -15,
  ...over,
})

describe('buildOps — Flipp accounts-API ops, with the same uniqueness their merge applies', () => {
  it('builds a clipping op in Flipp’s snake_case shape, geometry and all', () => {
    const { ops } = buildOps([clip({})], [], {})
    expect(ops).toHaveLength(1)
    expect(ops[0]).toEqual({
      verb: 'post',
      object: {
        id: null,
        commit_version: null,
        type: 'flyer_item_clipping',
        flyer_item_id: 101,
        name: 'Lait 2% 4L',
        flyer_id: 5001,
        right: 20,
        left: 10,
        top: -5,
        bottom: -15,
        price: '4.99',
        merchant_id: 3384,
        merchant_name: 'Super C',
        merchant_logo_url: 'https://l',
        thumbnail_url: 'https://t',
        cutout_image_url: 'https://t',
        valid_to: '2026-09-16T23:59:59-04:00',
      },
    })
  })

  it('geometry defaults to null when a staged deal lacks the box', () => {
    const { ops } = buildOps([clip({ left: undefined, right: undefined, top: undefined, bottom: undefined })], [], {})
    const o = (ops[0] as { object: Record<string, unknown> }).object
    expect([o.left, o.right, o.top, o.bottom]).toEqual([null, null, null, null])
  })

  it('a typed item is a list_item op', () => {
    const { ops } = buildOps([], ['Oeufs'], {})
    expect(ops[0]).toEqual({ verb: 'post', object: { id: null, commit_version: null, type: 'list_item', term: 'Oeufs', checked: false } })
  })

  it('skips a clipping already on the list (by flyer item) and a term already there (case-insensitive)', () => {
    const existing: ServerList = { flyer_item_clippings: [{ flyer_item_id: 101 }], list_items: [{ term: 'oeufs' }] }
    const { ops, skipped } = buildOps([clip({}), clip({ flyerItemId: 202, name: 'Pain' })], ['OEUFS', 'Beurre'], existing)
    expect(skipped).toBe(2)
    const types = ops.map((o) => (o as { object: { type: string; flyer_item_id?: number; term?: string } }).object)
    expect(types.map((o) => o.flyer_item_id ?? o.term)).toEqual([202, 'Beurre'])
  })

  it('de-dupes within the same batch too', () => {
    const { ops, skipped } = buildOps([clip({}), clip({})], ['Pain', 'pain', ' PAIN '], {})
    expect(ops).toHaveLength(2) // one clipping, one term
    expect(skipped).toBe(3) // dupe clipping + « pain » + « PAIN » (all seen already)
  })

  it('caps a long name and term, and normalizes whitespace', () => {
    const { ops } = buildOps([clip({ name: 'x'.repeat(300) })], ['a  b\tc' + ' '.repeat(5) + 'd'.repeat(200)], {})
    const name = (ops[0] as { object: { name: string } }).object.name
    const term = (ops[1] as { object: { term: string } }).object.term
    expect(name.length).toBe(200)
    expect(term.startsWith('a b c d')).toBe(true)
    expect(term.length).toBeLessThanOrEqual(120)
  })

  it('drops a clipping with no id or no name, and a blank term', () => {
    const { ops } = buildOps([clip({ flyerItemId: undefined as unknown as number }), clip({ name: '' })], ['', '   '], {})
    expect(ops).toEqual([])
  })
})

describe('cutout + replace + clear (2026-09-11 render-fix attempt)', () => {
  const c = (over: Partial<Clipping> = {}): Clipping => clip({ ...over })
  it('the op carries cutout_image_url (their renderer draws that), falling back to the thumbnail', () => {
    const { ops } = buildOps([c({ cutoutImageUrl: 'https://cut', thumbnailUrl: 'https://thumb' })], [], {})
    expect((ops[0] as { object: { cutout_image_url: string } }).object.cutout_image_url).toBe('https://cut')
    const { ops: ops2 } = buildOps([c({ cutoutImageUrl: undefined, thumbnailUrl: 'https://thumb' })], [], {})
    expect((ops2[0] as { object: { cutout_image_url: string } }).object.cutout_image_url).toBe('https://thumb')
  })
  it('replace: a clipping already present is deleted then re-posted (fresh fields)', () => {
    const existing: ServerList = { flyer_item_clippings: [{ id: 'srv-1', flyer_item_id: 101, commit_version: 4 }] }
    const { ops } = buildOps([c({})], [], existing, true)
    expect(ops).toHaveLength(2)
    expect((ops[0] as { verb: string; object: { id: string; type: string } }).verb).toBe('delete')
    expect((ops[0] as { object: { id: string } }).object.id).toBe('srv-1')
    expect((ops[1] as { verb: string }).verb).toBe('post')
  })
  it('clearOps deletes every clipping and typed item by id', () => {
    const existing: ServerList = {
      flyer_item_clippings: [{ id: 'a', flyer_item_id: 1 }, { id: 'b', flyer_item_id: 2 }],
      list_items: [{ id: 'li1', term: 'Pain' }],
    }
    const ops = clearOps(existing)
    expect(ops).toHaveLength(3)
    expect(ops.every((o) => (o as { verb: string }).verb === 'delete')).toBe(true)
    expect(ops.map((o) => (o as { object: { id: string } }).object.id)).toEqual(['a', 'b', 'li1'])
  })
})
