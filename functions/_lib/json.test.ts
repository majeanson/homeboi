import { describe, it, expect } from 'vitest'
import { parseJsonArray, ok, badRequest, unauthorized } from './json'

describe('parseJsonArray', () => {
  it('parses a JSON array', () => {
    expect(parseJsonArray('[1,2,3]')).toEqual([1, 2, 3])
  })
  it('returns [] for null / undefined / empty', () => {
    expect(parseJsonArray(null)).toEqual([])
    expect(parseJsonArray(undefined)).toEqual([])
    expect(parseJsonArray('')).toEqual([])
  })
  it('returns [] for malformed JSON instead of throwing', () => {
    expect(parseJsonArray('{nope')).toEqual([])
  })
  it('returns [] when the parsed value is not an array', () => {
    expect(parseJsonArray('{"a":1}')).toEqual([])
  })
  it('filters elements through the guard', () => {
    const isNum = (v: unknown): v is number => typeof v === 'number'
    expect(parseJsonArray('[1,"x",2,null]', isNum)).toEqual([1, 2])
  })
})

describe('response helpers', () => {
  it('ok() is 200', () => {
    expect(ok().status).toBe(200)
  })
  it('badRequest() is 400 carrying the message', async () => {
    const r = badRequest('nope')
    expect(r.status).toBe(400)
    expect(await r.json()).toEqual({ error: 'nope' })
  })
  it('unauthorized() is 401', () => {
    expect(unauthorized().status).toBe(401)
  })
})
