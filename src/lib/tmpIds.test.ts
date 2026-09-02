import { describe, it, expect, beforeEach } from 'vitest'
import {
  isTmpId,
  recordTmpId,
  resolveId,
  resolveTmpIdsIn,
  resolveTmpIdsInBody,
  onTmpIdResolved,
  _resetTmpIds,
} from './tmpIds'

// The session tmp→real id registry (E-41's online half). The bug it exists for:
// swipe-delete a row while its optimistic create is still reconciling → the
// deferred delete fired 15 s later with `{id: 'tmp-…'}` → DELETE matched zero
// rows, answered 200, and the real row lived forever ("items come back").
describe('tmpIds registry', () => {
  beforeEach(() => _resetTmpIds())

  it('recognizes tmp ids by their prefix', () => {
    expect(isTmpId('tmp-123-abc')).toBe(true)
    expect(isTmpId('r4X9')).toBe(false)
  })

  it('resolves a recorded tmp id and leaves everything else alone', () => {
    recordTmpId('tmp-1-a', 'real-1')
    expect(resolveId('tmp-1-a')).toBe('real-1')
    expect(resolveId('tmp-2-b')).toBe('tmp-2-b') // unknown → unchanged
    expect(resolveId('real-1')).toBe('real-1')
  })

  it('refuses nonsense mappings (non-tmp source, tmp target)', () => {
    recordTmpId('real-1', 'real-2')
    expect(resolveId('real-1')).toBe('real-1')
    recordTmpId('tmp-1-a', 'tmp-2-b')
    expect(resolveId('tmp-1-a')).toBe('tmp-1-a')
  })

  it('notifies subscribers when a mapping lands', () => {
    const seen: string[] = []
    const off = onTmpIdResolved((t, r) => seen.push(`${t}→${r}`))
    recordTmpId('tmp-1-a', 'real-1')
    off()
    recordTmpId('tmp-2-b', 'real-2')
    expect(seen).toEqual(['tmp-1-a→real-1'])
  })

  it('rewrites every known tmp id inside a serialized path/body', () => {
    recordTmpId('tmp-1-a', 'real-1')
    recordTmpId('tmp-2-b', 'real-2')
    expect(resolveTmpIdsIn('list/tmp-1-a')).toBe('list/real-1')
    expect(resolveTmpIdsIn('{"ids":["tmp-1-a","tmp-2-b","x"]}')).toBe('{"ids":["real-1","real-2","x"]}')
    expect(resolveTmpIdsIn('{"id":"tmp-9-z"}')).toBe('{"id":"tmp-9-z"}') // unknown stays
  })

  it('resolves a JSON body without touching one that references no known tmp id', () => {
    recordTmpId('tmp-1-a', 'real-1')
    expect(resolveTmpIdsInBody({ id: 'tmp-1-a' })).toEqual({ id: 'real-1' })
    const untouched = { id: 'real-9', ids: ['a', 'b'] }
    expect(resolveTmpIdsInBody(untouched)).toBe(untouched) // same ref — no re-serialize churn
    expect(resolveTmpIdsInBody(undefined)).toBe(undefined)
  })

  it('passes a Blob through untouched (media uploads must never round-trip JSON)', () => {
    recordTmpId('tmp-1-a', 'real-1')
    const blob = new Blob(['x'], { type: 'image/png' })
    expect(resolveTmpIdsInBody(blob)).toBe(blob)
  })
})
