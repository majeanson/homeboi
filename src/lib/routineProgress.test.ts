import { describe, expect, it } from 'vitest'
import {
  applyOp,
  currentStep,
  doneCount,
  isComplete,
  normalizeDone,
  opBody,
  previousDone,
  stepTimerRunning,
  withDone,
} from './routineProgress'

// « Done » is a rule, not a length. These pin the rule that the toddler player, the picker,
// the board card and the Maison tab all share — each used to have its own spelling of it.
describe('normalizeDone', () => {
  it('keeps distinct, in-range indices only', () => {
    expect(normalizeDone(3, [0, 1, 1, 2, 2, 2])).toEqual([0, 1, 2])
    expect(normalizeDone(3, [0, 7, -1, 1.5, NaN])).toEqual([0])
    expect(normalizeDone(0, [0, 1])).toEqual([])
    expect(normalizeDone(3, undefined)).toEqual([])
  })
})

describe('isComplete / doneCount', () => {
  it('a duplicate tick is not a finished routine (the double-tap bug)', () => {
    // [1, 1] on a 2-card deck: `length >= cards` said « finished » with step 0 never done.
    expect(isComplete(2, [1, 1])).toBe(false)
    expect(doneCount(2, [1, 1])).toBe(1)
  })

  it('stale indices past the end of an edited deck do not count', () => {
    // The deck shrank from 4 to 3 steps; the stored run still says [0,1,2,3].
    expect(doneCount(3, [0, 1, 3])).toBe(2)
    expect(isComplete(3, [0, 1, 3])).toBe(false)
    expect(isComplete(3, [0, 1, 2, 3])).toBe(true)
  })

  it('an empty deck is never « finished »', () => {
    expect(isComplete(0, [])).toBe(false)
  })
})

describe('currentStep', () => {
  it('is the first undone step, else the last', () => {
    expect(currentStep(4, [])).toBe(0)
    expect(currentStep(4, [0, 1])).toBe(2)
    expect(currentStep(4, [0, 1, 2, 3])).toBe(3)
    expect(currentStep(0, [])).toBe(-1)
  })

  it('is not fooled by an out-of-order or sparse run', () => {
    expect(currentStep(4, [2, 3])).toBe(0)
    expect(currentStep(4, [0, 2])).toBe(1)
  })
})

describe('previousDone (what ← rewinds to)', () => {
  it('is the last done step behind where we are', () => {
    expect(previousDone(4, [0, 1])).toBe(1)
    expect(previousDone(4, [0])).toBe(0)
  })

  it('is nothing on the first step, or with nothing done', () => {
    expect(previousDone(4, [])).toBe(-1)
    // Sparse: step 1 done but we are on 0 — nowhere behind us.
    expect(previousDone(4, [1])).toBe(-1)
  })

  it('skips holes rather than assuming cur - 1', () => {
    // On step 2 (0 done, 1 undone → we are on 1!) — cur is 1, behind it is 0.
    expect(previousDone(4, [0, 2])).toBe(0)
  })
})

describe('withDone', () => {
  it('is idempotent in both directions', () => {
    expect(withDone([0], 1, true)).toEqual([0, 1])
    expect(withDone(withDone([0], 1, true), 1, true)).toEqual([0, 1])
    expect(withDone([0, 1], 1, false)).toEqual([0])
    expect(withDone([0], 5, false)).toEqual([0])
  })

  it('heals an existing duplicate on write', () => {
    expect(withDone([1, 1, 0], 1, true)).toEqual([0, 1])
  })
})

describe('stepTimerRunning', () => {
  const now = 1_000
  it('is true only for a live endsAt on the CURRENT step', () => {
    expect(stepTimerRunning(3, [0], { 1: { endsAt: now + 60 } }, now)).toBe(true)
    // A timer on a step we are not on does not hold the drift.
    expect(stepTimerRunning(3, [0], { 2: { endsAt: now + 60 } }, now)).toBe(false)
  })
  it('a paused or finished timer does not hold it', () => {
    expect(stepTimerRunning(3, [0], { 1: { left: 30 } }, now)).toBe(false)
    expect(stepTimerRunning(3, [0], { 1: { endsAt: now - 1 } }, now)).toBe(false)
    expect(stepTimerRunning(3, [0], undefined, now)).toBe(false)
  })
})

describe('applyOp', () => {
  const data = () => ({
    routines: [
      { id: 'a', doneIdx: [0], timers: { 0: { left: 5 } } as Record<number, { left: number } | { endsAt: number }> },
      { id: 'b', doneIdx: [] as number[] },
    ],
  })

  it('only touches its own routine', () => {
    const out = applyOp(data(), { kind: 'done', routineId: 'a', cardIdx: 1, done: true })
    expect(out.routines[0].doneIdx).toEqual([0, 1])
    expect(out.routines[1].doneIdx).toEqual([])
  })

  it('re-applying the same op changes nothing — the writer relies on this', () => {
    const op = { kind: 'done', routineId: 'a', cardIdx: 1, done: true } as const
    const once = applyOp(data(), op)
    expect(applyOp(once, op)).toEqual(once)
  })

  it('reset wipes the ticks AND the timers, as the server does', () => {
    const out = applyOp(data(), { kind: 'reset', routineId: 'a' })
    expect(out.routines[0]).toMatchObject({ doneIdx: [], timers: {} })
  })

  it('a timer op sets, then clears, one step’s entry', () => {
    const set = applyOp(data(), { kind: 'timer', routineId: 'a', cardIdx: 2, timer: { endsAt: 99 } })
    expect(set.routines[0].timers).toMatchObject({ 0: { left: 5 }, 2: { endsAt: 99 } })
    const cleared = applyOp(set, { kind: 'timer', routineId: 'a', cardIdx: 2, timer: null })
    expect(cleared.routines[0].timers).toEqual({ 0: { left: 5 } })
  })
})

describe('opBody (the wire shape functions/api/routines.ts reads)', () => {
  it('spells each op the way the PATCH handler expects', () => {
    expect(opBody({ kind: 'done', routineId: 'r', cardIdx: 2, done: false })).toEqual({ routineId: 'r', cardIdx: 2, done: false })
    expect(opBody({ kind: 'reset', routineId: 'r' })).toEqual({ routineId: 'r', reset: true })
    expect(opBody({ kind: 'timer', routineId: 'r', cardIdx: 1, timer: { left: 9 } })).toEqual({
      routineId: 'r',
      cardIdx: 1,
      timer: { left: 9 },
    })
  })
})
