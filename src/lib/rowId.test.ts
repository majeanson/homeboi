import { describe, expect, it } from 'vitest'
import { newRowId } from './rowId'
import { rowIdFrom } from '../../functions/_lib/ids'

// Review #39: the server keeps the id the client minted — but only a UUID. Pinned from both
// ends, because a client id the server refuses would silently put the row under ANOTHER id.
describe('newRowId', () => {
  it('mints an id the server keeps', () => {
    const id = newRowId()
    expect(rowIdFrom(id)).toBe(id)
    expect(newRowId()).not.toBe(id)
  })

  it('keeps the same shape without randomUUID (an insecure context)', () => {
    const own = Object.getOwnPropertyDescriptor(crypto, 'randomUUID')
    Object.defineProperty(crypto, 'randomUUID', { value: undefined, configurable: true })
    try {
      const id = newRowId()
      expect(rowIdFrom(id)).toBe(id)
    } finally {
      if (own) Object.defineProperty(crypto, 'randomUUID', own)
      else delete (crypto as { randomUUID?: unknown }).randomUUID
    }
    expect(typeof crypto.randomUUID).toBe('function')
  })

  it('the server mints its own for anything else', () => {
    for (const v of [undefined, 'tmp-1-abc', 'x'.repeat(36), 'ABCDEFAB-0000-4000-8000-000000000000', 42]) expect(rowIdFrom(v)).not.toBe(v)
  })
})
