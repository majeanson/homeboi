import { describe, it, expect } from 'vitest'
import { classifyCapture, suggestMeal, resolveLang } from './ai'
import type { Env } from './env'

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

describe('suggestMeal (degraded)', () => {
  it('returns null when AI is unset so the UI hides the button', async () => {
    const r = await suggestMeal(noAiEnv, ['café'], ['pâtes'])
    expect(r).toBeNull()
  })
})
