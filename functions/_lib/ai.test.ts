import { describe, it, expect } from 'vitest'
import { classifyCapture, suggestMeal } from './ai'
import type { Env } from './env'

// With no AI binding the router must NEVER throw and NEVER lose the words —
// it degrades to a note so the UI can offer a manual type-picker. This is the
// graceful-degrade contract the brief promises.
const noAiEnv = { DB: {} as D1Database } as Env

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
