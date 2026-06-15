import { describe, it, expect } from 'vitest'
import { classifyCapture, suggestMeals, mealStaples, resolveLang, extractSizes } from './ai'
import type { Env } from './env'

// A fake Workers AI binding that returns a canned `response`, so we can test the
// parsing/normalization without a real model. `response` is typed `unknown` on
// purpose: newer models (llama-3.3-70b-fp8-fast) hand back an already-PARSED
// object/array when the output is valid JSON, while older ones returned a string.
const mockAiEnv = (response: unknown): Env =>
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

// REGRESSION: the model swap to llama-3.3-70b-fp8-fast made `response` arrive as
// an already-parsed JS value instead of a string. Before the fix this dropped to
// [] and the endpoint 503'd. Both shapes must now produce the same dishes.
describe('suggestMeals (response shape)', () => {
  it('parses a string-wrapped JSON array (old model shape)', async () => {
    const env = mockAiEnv('Voici: ["spaghetti","chili","tacos"]')
    const r = await suggestMeals(env, [], [])
    expect(r).toEqual(['spaghetti', 'chili', 'tacos'])
  })
  it('accepts an already-parsed array (new fp8-fast model shape)', async () => {
    const env = mockAiEnv(['spaghetti', 'chili', 'tacos'])
    const r = await suggestMeals(env, [], [])
    expect(r).toEqual(['spaghetti', 'chili', 'tacos'])
  })
})

describe('mealStaples (response shape)', () => {
  it('accepts an already-parsed array (new model shape)', async () => {
    const env = mockAiEnv(['pâtes', 'sauce tomate', 'viande hachée'])
    const r = await mealStaples(env, 'spaghetti')
    expect(r).toEqual(['pâtes', 'sauce tomate', 'viande hachée'])
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

  it('accepts an already-parsed array (new fp8-fast model shape)', async () => {
    const env = mockAiEnv([
      { i: 0, size: '2 L' },
      { i: 1, size: null },
      { i: 2, size: '500 g' },
    ])
    const r = await extractSizes(env, ['lait', 'pain', 'poulet'])
    expect(r).toEqual(['2 L', null, '500 g'])
  })
})

// classifyCapture's JSON parse must also accept the new parsed-object shape, or
// every capture silently falls back to a generic note.
describe('classifyCapture (response shape)', () => {
  it('routes from a string-wrapped JSON object (old model shape)', async () => {
    const env = mockAiEnv('{"type":"list-item","payload":{"item":"lait"}}')
    const r = await classifyCapture(env, 'ajoute du lait')
    expect(r.type).toBe('list-item')
    expect(r.payload.item).toBe('lait')
  })
  it('routes from an already-parsed object (new fp8-fast model shape)', async () => {
    const env = mockAiEnv({ type: 'pantry-low', payload: { item: 'café' } })
    const r = await classifyCapture(env, 'pus de café')
    expect(r.type).toBe('pantry-low')
    expect(r.payload.item).toBe('café')
  })
  // The 7th intent: leftovers from an already-cooked dish (distinct from pantry-low
  // "out of" and meal "to cook"). Must survive the VALID gate and carry its title.
  it('routes a leftover intent and keeps the dish title', async () => {
    const env = mockAiEnv({ type: 'leftover', payload: { title: 'lasagne' } })
    const r = await classifyCapture(env, 'il reste de la lasagne')
    expect(r.type).toBe('leftover')
    expect(r.payload.title).toBe('lasagne')
  })
})
