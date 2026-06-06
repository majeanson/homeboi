import { describe, it, expect } from 'vitest'
import { classifyCapture, suggestMeals, mealStaples, resolveLang, extractSizes } from './ai'
import type { Env } from './env'

// A fake Workers AI binding that returns a canned response, so we can test the
// parsing/normalization without a real model.
const mockAiEnv = (response: string): Env =>
  ({ DB: {} as D1Database, AI: { run: async () => ({ response }) } as unknown as Ai }) as Env

// With no AI binding the router must NEVER throw and NEVER lose the words —
// it degrades to a note so the UI can offer a manual type-picker. This is the
// graceful-degrade contract the brief promises.
const noAiEnv = { DB: {} as D1Database } as Env

const req = (lang?: string) =>
  new Request('https://x/api/capture', { headers: lang ? { 'X-Lang': lang } : {} })

describe('resolveLang', () => {
  it('prefers a valid X-Lang header over DEFAULT_LANG', () => {
    expect(resolveLang({ DEFAULT_LANG: 'fr' } as Env, req('en'))).toBe('en')
  })
  it('falls back to DEFAULT_LANG when the header is absent', () => {
    expect(resolveLang({ DEFAULT_LANG: 'en' } as Env, req())).toBe('en')
  })
  it('ignores a malformed header and falls back', () => {
    expect(resolveLang({ DEFAULT_LANG: 'en' } as Env, req('es'))).toBe('en')
  })
  it('defaults to fr when nothing is set', () => {
    expect(resolveLang({} as Env, req())).toBe('fr')
  })
})

describe('classifyCapture (degraded)', () => {
  it('returns a note carrying the raw text when AI is unset', async () => {
    const r = await classifyCapture(noAiEnv, '  souper spaghetti jeudi  ')
    expect(r.type).toBe('note')
    expect(r.degraded).toBe(true)
    expect(r.payload.text).toBe('souper spaghetti jeudi')
  })
})

describe('suggestMeals (degraded)', () => {
  it('returns [] when AI is unset so the UI hides the button', async () => {
    const r = await suggestMeals(noAiEnv, ['café'], ['pâtes'])
    expect(r).toEqual([])
  })
})

describe('mealStaples (degraded)', () => {
  it('returns an empty list when AI is unset so the meal just saves', async () => {
    const r = await mealStaples(noAiEnv, 'spaghetti')
    expect(r).toEqual([])
  })
  it('returns an empty list for a blank title without calling AI', async () => {
    const r = await mealStaples({ DB: {} as D1Database, AI: {} as Ai } as Env, '   ')
    expect(r).toEqual([])
  })
})

describe('extractSizes', () => {
  it('returns all-null when AI is unset (graceful degrade)', async () => {
    const r = await extractSizes(noAiEnv, ['Lait Lactantia', 'Pain'])
    expect(r).toEqual([null, null])
  })

  it('returns [] for no names without calling AI', async () => {
    const r = await extractSizes({ DB: {} as D1Database, AI: {} as Ai } as Env, [])
    expect(r).toEqual([])
  })

  it('maps model sizes back by index and keeps nulls', async () => {
    const env = mockAiEnv('[{"i":0,"size":"2 L"},{"i":1,"size":null},{"i":2,"size":"500 g"}]')
    const r = await extractSizes(env, ['lait', 'pain', 'poulet'])
    expect(r).toEqual(['2 L', null, '500 g'])
  })

  it('tolerates prose around the JSON and out-of-range indices', async () => {
    const env = mockAiEnv('Sure! [{"i":0,"size":"1 kg"},{"i":9,"size":"oops"}] done')
    const r = await extractSizes(env, ['boeuf'])
    expect(r).toEqual(['1 kg'])
  })

  it('returns all-null on unparseable model output', async () => {
    const env = mockAiEnv('no json here')
    const r = await extractSizes(env, ['x', 'y'])
    expect(r).toEqual([null, null])
  })
})
