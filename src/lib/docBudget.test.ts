import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

// THE DOCS STAY SMALL, AND A FEW LISTS ONLY SHRINK (review #42, 2026-11-18).
//
// This replaced docCounts.test.ts, which asserted every number written in prose against the code
// (« 32 guide cards », « 12 tools », « 144 states »…). Each claim was true and each one cost a
// test edit per change. The docs now write no counts at all; a count is run, not typed. What is
// left is what a count never was: budgets that only go down.
//
// Every number here is a CEILING: it may fall, never rise. Raising one is a decision to argue
// for in the commit message; the escape hatch is always the same — the finished part belongs in
// git, not in the front door. (`split(/\r?\n/)` counts one more line than `wc -l`.)

const ROOT = join(import.meta.dirname, '..', '..')
const read = (f: string) => readFileSync(join(ROOT, f), 'utf8')
const lines = (f: string) => read(f).split(/\r?\n/).length
const bytes = (f: string) => Buffer.byteLength(read(f), 'utf8')

// CLAUDE.md is the LAW, read by every session before it writes code; it grew one honest
// paragraph at a time to 734 lines (2026-09-24). Review #42 cut it to 171 / 16 KB. Bytes are held
// as well as lines, because a line budget can be met by writing longer lines.
const CLAUDE_MAX_LINES = 172 // today 171 by wc -l
const CLAUDE_MAX_BYTES = 16_000

// STATE.md answers « what should I do next? ». It had grown to 4 289 lines with the only open work
// at line 3 490 (2026-09-17). A session writes its §3 entry and moves the previous one out.
const STATE_MAX_LINES = 331
const STATE_MAX_BYTES = 57_600
const STATE_FIRST_OPEN_BOX_BY = 300

describe('the front doors stay small', () => {
  it(`CLAUDE.md: at most ${CLAUDE_MAX_LINES} lines and ${CLAUDE_MAX_BYTES} bytes`, () => {
    expect(lines('CLAUDE.md'), 'CLAUDE.md grew. Move the story to the doc it points at (git keeps it); do not raise the budget').toBeLessThanOrEqual(CLAUDE_MAX_LINES)
    expect(bytes('CLAUDE.md'), 'CLAUDE.md grew in bytes: longer lines are not a way around the line budget').toBeLessThanOrEqual(CLAUDE_MAX_BYTES)
  })

  it(`STATE.md: at most ${STATE_MAX_LINES} lines and ${STATE_MAX_BYTES} bytes`, () => {
    expect(lines('STATE.md'), 'STATE.md grew. Cut the finished part (git keeps it); do not raise the budget').toBeLessThanOrEqual(STATE_MAX_LINES)
    expect(bytes('STATE.md'), 'STATE.md grew in bytes: longer lines are not a way around the line budget').toBeLessThanOrEqual(STATE_MAX_BYTES)
  })

  // The length is a proxy; THIS is the property it stands for. Zero open boxes is a real state,
  // allowed only while §4 SAYS so, so an emptied section can never pass for a finished one.
  it(`STATE.md puts its first open box within the first ${STATE_FIRST_OPEN_BOX_BY} lines`, () => {
    const state = read('STATE.md').split(/\r?\n/)
    const first = state.findIndex((l) => /^- \[ \] /.test(l))
    if (first < 0) {
      expect(state.some((l) => /^> \*\*No open box\.\*\*/.test(l)), 'no open box at all: say so in §4 (« > **No open box.** »)').toBe(true)
      return
    }
    expect(first + 1, 'the open work moved down the file; whatever grew above it is history').toBeLessThanOrEqual(STATE_FIRST_OPEN_BOX_BY)
  })
})

describe('the e2e allow lists only shrink', () => {
  // The GET paths the mock answers `{}` for (e2e/unknownGets.reporter.ts fails a run on one
  // outside this file). A path leaves by getting a fixture, and this number follows it down.
  it('e2e/unknown-gets.json: at most 2 paths, each saying why it stays', () => {
    const listed = JSON.parse(read('e2e/unknown-gets.json')) as { path: string; why: string }[]
    expect(listed.length).toBeLessThanOrEqual(2)
    for (const l of listed) expect(l.why.length, l.path).toBeGreaterThan(20)
  })

  it('e2e/axe-allow.json: at most 1 entry', () => {
    expect(JSON.parse(read('e2e/axe-allow.json')).length).toBeLessThanOrEqual(1)
  })

  // `(await x.boundingBox())!` throws when React detaches the node between the two resolves; the
  // suite measures with boxOf() (e2e/measure.ts). The sweep finished 2026-09-09: none may return.
  it('no bare (await x.boundingBox())! in e2e/', () => {
    const dir = join(ROOT, 'e2e')
    const bare: string[] = []
    for (const f of readdirSync(dir).filter((f) => f.endsWith('.ts')))
      read(join('e2e', f))
        .split('\n')
        .forEach((line, i) => {
          if (!/^\s*(\/\/|\*)/.test(line) && /\.boundingBox\(\)\)!/.test(line)) bare.push(`e2e/${f}:${i + 1}`)
        })
    expect(bare, 'measure with boxOf() (e2e/measure.ts)').toEqual([])
  })
})
