import { readFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { describe, expect, it } from 'vitest'
import { blankComments, sourceFiles } from '../../src/lib/buildGuardScan'

// ONE TABLE OF TASKS (migration 0150). Three ways the merge would quietly come undone, each held
// here, because a handler that reads the wrong table returns an empty list with a 200, and every
// test that does not seed that exact table stays green:
//
//   · `tasks` IS GONE. No SQL names it (schemaRefs.test.ts fails it too, as an unknown table;
//     this one says why). A chore is a row of `home_projects`, a task with no kind (0153).
//   · `todos` HOLDS DEPARTURE CHECKLISTS, not tasks. Only the departure path writes it, and a
//     reader of to-dos goes through `todoRowsSql` (_lib/taskItem), which unions the loose rows
//     on the spine with the instances there. Every file that names it is listed below with why.
//   · A READ OF THE SPINE NAMES ITS FACE. `home_projects` holds every face now; a SELECT that
//     scans it without `kind` (or FACE.*) hands every task to a reader that expected
//     projects (the Réglages list, the season card, the calendar's home cells). Reading by id is
//     fine: an id names one row. A deliberate any-face read is listed below with why.
//
// Planted red three times (2026-11-08), each plant checked with `git diff` before the run:
// `AND ${FACE.home}` removed from year.ts; a `SELECT title FROM tasks` in recap.ts; an
// `INSERT INTO todos` in capture.ts. Since 0153 a gesture is the same for every task, so three
// files read the spine whole on purpose (listed below); planted red (2026-11-10) by taking
// `taskGestures.ts` off that list.

const ROOT = join(__dirname, '..', '..')
const files = [...sourceFiles(join(ROOT, 'functions')), ...sourceFiles(join(ROOT, 'worker'))]
  .filter((f) => /\.ts$/.test(f) && !/[\\/]test[\\/]/.test(f))
  .map((f) => ({ rel: relative(ROOT, f).split(sep).join('/'), src: blankComments(readFileSync(f, 'utf8')) }))

const hits = (re: RegExp) => files.flatMap((f) => [...f.src.matchAll(re)].map((m) => ({ file: f.rel, at: m.index, src: f.src })))
// The statement around a hit: forward to its `.bind(` (or a backstop), where its predicates are.
const statement = (h: { at: number; src: string }) => {
  const rest = h.src.slice(h.at, h.at + 600)
  const end = rest.search(/\.bind\(|\.all\(|\.first\(|\.run\(/)
  return end < 0 ? rest : rest.slice(0, end)
}

const TODOS_FILES: Record<string, string> = {
  'functions/api/todos.ts': 'the alias itself: departure instances (create, sweep) and, by id, any row an old Worker left there',
  'functions/_lib/taskItem.ts': 'todoRowsSql: THE read of to-do rows, loose (spine) + departure (todos)',
  'functions/_lib/staleDelete.ts': 'the to-do delete heals a stale id across both tables',
  'functions/_lib/members.ts': 'todos.member_id is an FK to members: every row must let go of a deleted member',
  'functions/_lib/sampleData.ts': 'the demo seeds an « Avant de partir » instance',
}
const ANY_FACE: Record<string, string> = {
  'functions/_lib/members.ts': 'a deleted member is detached from every task, whatever face it wears',
  'functions/_lib/sampleData.ts': '« Vider les exemples » clears the log lines of every sample task',
  'functions/_lib/taskViews.ts': 'its one row helper reads every face; each caller names its face (task-faces-rule.test.ts holds that)',
  'functions/_lib/taskGestures.ts': 'a gesture is the same for every task (0153): « Vider » reads and stamps any ticked row by name',
  'functions/_lib/taskDay.ts': 'the backfill rewrites every task’s day to its local midnight, whatever it is',
  'functions/_lib/staleDelete.ts': 'a stale id heals onto any task of the same name (one delete for every task, 0153)',
}

describe('one table of tasks', () => {
  it('walks the Worker’s sources (canary: a scan that reads nothing passes everything)', () => {
    expect(files.length).toBeGreaterThan(150)
    expect(hits(/\bFROM home_projects\b/g).length).toBeGreaterThan(10)
    expect(files.find((f) => f.rel === 'functions/api/todos.ts')?.src).toMatch(/INSERT INTO todos/)
  })

  it('no SQL names `tasks`: chores live on the spine', () => {
    const named = hits(/\b(?:FROM|INTO|UPDATE|JOIN)\s+tasks\b/g).map((h) => h.file)
    expect(named, 'read and write chores on home_projects with FACE.chore (_lib/taskItem)').toEqual([])
  })

  it('only the departure path touches `todos`', () => {
    const named = [...new Set(hits(/\b(?:FROM|INTO|UPDATE|JOIN)\s+todos\b/g).map((h) => h.file))].sort()
    expect(named, 'a loose to-do is a task: read it through todoRowsSql, write it on the spine').toEqual(Object.keys(TODOS_FILES).sort())
    // Every insert into `todos` is a departure instance: a template's rows or the ad-hoc sentinel.
    for (const h of hits(/\bINSERT INTO todos\b/g)) expect(statement(h), h.file).toMatch(/source_template_id/)
    expect(hits(/\bINSERT INTO todos\b/g).map((h) => h.file).sort()).toEqual(['functions/_lib/sampleData.ts', 'functions/api/todos.ts', 'functions/api/todos.ts'])
  })

  it('every read or change of the spine names its face, or one row by id', () => {
    const blind = hits(/\b(?:FROM|UPDATE)\s+home_projects\b/g)
      .filter((h) => !ANY_FACE[h.file])
      .filter((h) => {
        const s = statement(h)
        return !/\bkind\b|\$\{FACE\.|\bWHERE\s+(?:\w+\.)?id\s*=\s*\?|\bid\s+IN\s*\(/.test(s)
      })
      .map((h) => `${h.file}: ${statement(h).slice(0, 90).replace(/\s+/g, ' ')}`)
    expect(blind, 'a spine read without a face hands chores and to-dos to a reader that wanted projects').toEqual([])
  })

  it('every listed exception still exists (a stale exemption is noise the next reader trusts)', () => {
    for (const f of [...Object.keys(TODOS_FILES), ...Object.keys(ANY_FACE)]) expect(files.some((x) => x.rel === f), f).toBe(true)
  })
})
