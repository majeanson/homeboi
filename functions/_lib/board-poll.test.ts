import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// THE BOARD POLL IS THE FREE-TIER LEVER (plan de la tâche unifiée, « Board poll cost »). A wall
// tablet asks for /api/board every few seconds, all day, so one more statement here is one
// more statement per kiosk per poll, for ever. The merged board section did not need one: the
// chores and home rows were already on the read, the to-dos ride their own poll, and a
// subject resolves on the client from what it holds. This pins that, as a ratchet: the number
// may fall, and raising it is a decision to take out loud, here, with the reason.
//
// It counts statements in the file because that is what can be counted without running it,
// which leaves one honest gap: a helper that prepares its own statement is invisible here.
//
// Plant: one more `ctx.env.DB.prepare('SELECT 1')` in functions/api/board.ts.
const STATEMENTS = 19

describe('the board poll', () => {
  const src = readFileSync(join(__dirname, '..', 'api', 'board.ts'), 'utf8')

  it('reads the handler (canary)', () => {
    expect(src).toContain("okWire('board'")
  })

  it(`stays at ${STATEMENTS} statements`, () => {
    expect((src.match(/\.prepare\(/g) ?? []).length).toBeLessThanOrEqual(STATEMENTS)
  })

  it('never asks for the tables a subject lives in', () => {
    expect(src).not.toMatch(/FROM\s+(carnets|pets|contacts|trips)\b(?! WHERE contacts\.id)/)
  })
})
