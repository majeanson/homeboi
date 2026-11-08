import { readFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { describe, expect, it } from 'vitest'
import { blankComments, sourceFiles } from '../../src/lib/buildGuardScan'

// THE FACES LIVE IN ONE PLACE (plans/2026-11-06-TACHE-UNIFIEE.md, « retire the faces »).
//
// Since 0150 every task is one row of `home_projects`, and `kind` still says which old payload
// it wears ('chore', 'todo', 'plan', 'upkeep'). Retiring that is the owner's call, because what
// a household sees still differs by face (the table at the top of _lib/taskViews.ts). What this
// guard holds is the step before: EVERY READER of a task reads it through `_lib/taskViews.ts`,
// on one row shape (`TaskRow`, `TASK_COLS`), and no reader decides a face on its own. So the
// day the owner picks one rule per line of that table, one file changes, not twelve.
//
//   · the face vocabulary of `_lib/taskItem` (FACE, faceOfKind, todoRowsSql, the per-face row
//     builders) is imported only by the files listed below, each with why;
//   · no SQL outside `_lib/taskItem` spells a face (`kind = 'chore'`, `kind = 'todo'`, or the
//     `kind IN ('plan', 'upkeep')` that exists only to leave them out);
//   · the readers (the board, the calendar, the year, « Cette semaine », the recap, the house
//     assistant) hold no SELECT of the spine of their own;
//   · every read in `_lib/taskViews` goes through its one helper, with one column list;
//   · on the client, nothing outside the form's write path branches on a task's face.
//
// Planted red (2026-11-08), each plant checked with grep before the run: `FACE` imported back
// into year.ts; a `kind = 'chore'` SELECT in recap.ts; a `t.source === 'chore'` in
// boardModel.ts.

const ROOT = join(__dirname, '..', '..')
const scan = (dir: string, ext: RegExp) =>
  sourceFiles(join(ROOT, dir))
    .filter((f) => ext.test(f) && !/\.test\.tsx?$/.test(f) && !/[\\/]test[\\/]/.test(f))
    .map((f) => ({ rel: relative(ROOT, f).split(sep).join('/'), src: blankComments(readFileSync(f, 'utf8')) }))
const worker = [...scan('functions', /\.ts$/), ...scan('worker', /\.ts$/)]
const client = scan('src', /\.tsx?$/)

const FACE_EXPORTS = ['FACE', 'faceOfKind', 'todoRowsSql', 'CHORE_TASK_COLS', 'HOME_TASK_COLS', 'choreTask', 'homeTask', 'todoTask', 'clearStatements', 'Face']

// Who may speak the faces, and why. Every entry is a write path or the reader module itself.
const ALLOWED: Record<string, string> = {
  'functions/_lib/taskItem.ts': 'defines the faces',
  'functions/_lib/taskViews.ts': 'THE reader: every view of a task is built here, on one row',
  'functions/api/chores.ts': 'alias kept for old tabs and queued writes: serves and writes the chore face, in its old shape',
  'functions/api/home-projects.ts': 'alias kept for old tabs and queued writes: serves and writes the home face, in its old shape',
  'functions/api/todos.ts': 'alias kept for old tabs and queued writes: the to-do face beside the departure checklists',
  'functions/api/tasks.ts': 'the one form’s door: an edit keeps or raises a row’s face (faceAfter), and deletes any face',
  'functions/_lib/taskWrite.ts': 'the one form’s write: which columns a face stores (`at` is encoded per face, 0150)',
  'functions/_lib/staleDelete.ts': 'the to-do delete heals a stale tmp- id on the to-do face (the todos alias’s heal)',
}

// The readers that used to hold their own per-face SELECTs. They must not regrow one.
const READERS = [
  'functions/api/board.ts',
  'functions/api/month.ts',
  'functions/api/year.ts',
  'functions/api/this-week.ts',
  'functions/api/recap.ts',
  'functions/_lib/askSnapshot.ts',
]

// The client files that still read a task's face, and why (the form's write doors, and the
// calendar dots, one per payload list until the month wire has one list).
const CLIENT_ALLOWED: Record<string, string> = {
  'src/lib/tasks.ts': 'the client’s task module',
  'src/lib/taskSave.ts': 'a row’s gesture goes to its face’s alias (the server keeps each face’s tick semantics)',
  'src/lib/taskTarget.ts': 'the shared rule that picks a new task’s face (the server uses it too)',
  'src/components/board/DayMark.tsx': 'a calendar dot per month payload list (chores, home, to-dos): the month wire is still per face',
}

const importedFaceNames = (src: string): string[] =>
  [...src.matchAll(/import\s*(?:type\s*)?\{([^}]*)\}\s*from\s*'[^']*\btaskItem'/g)].flatMap((m) =>
    (m[1] ?? '')
      .split(',')
      .map((x) => x.trim().replace(/^type\s+/, '').split(/\s+as\s+/)[0]?.trim() ?? '')
      .filter((n) => FACE_EXPORTS.includes(n)),
  )

describe('the faces live in one place', () => {
  it('walks the sources (canary: a scan that reads nothing passes everything)', () => {
    expect(worker.length).toBeGreaterThan(150)
    expect(client.length).toBeGreaterThan(300)
    expect(importedFaceNames(worker.find((f) => f.rel === 'functions/_lib/taskViews.ts')!.src)).toContain('FACE')
    expect(worker.find((f) => f.rel === 'functions/_lib/taskItem.ts')!.src).toMatch(/kind = 'chore'/)
  })

  it('only the listed files import the face vocabulary of _lib/taskItem', () => {
    const using = worker.filter((f) => importedFaceNames(f.src).length > 0).map((f) => f.rel)
    expect(using.filter((f) => !ALLOWED[f]), 'read a task through _lib/taskViews, which already knows its face').toEqual([])
  })

  it('no SQL outside _lib/taskItem spells a face', () => {
    const FACE_SQL = /\bkind\s*=\s*'(?:chore|todo)'|\bkind\s+IN\s*\(\s*'plan'\s*,\s*'upkeep'\s*\)/
    const spelled = worker.filter((f) => f.rel !== 'functions/_lib/taskItem.ts' && FACE_SQL.test(f.src)).map((f) => f.rel)
    expect(spelled, 'name a face with FACE.* inside _lib/taskViews, never with a string of your own').toEqual([])
  })

  it('the readers hold no SELECT of the spine of their own', () => {
    for (const rel of READERS) {
      const f = worker.find((x) => x.rel === rel)
      expect(f, rel).toBeDefined()
      expect(f!.src, `${rel}: ask _lib/taskViews for the rows`).not.toMatch(/\bFROM\s+home_projects\b/)
      expect(f!.src, `${rel}: canary, it reads through taskViews`).toMatch(/from '[^']*\btaskViews'/)
    }
  })

  it('every read in _lib/taskViews of the spine’s rows uses the one column list', () => {
    const src = worker.find((f) => f.rel === 'functions/_lib/taskViews.ts')!.src
    const selects = [...src.matchAll(/SELECT ([^`]*?) FROM home_projects\b/g)].map((m) => (m[1] ?? '').trim())
    expect(selects, 'canary: the helper is there').toContain('${TASK_COLS}')
    expect(selects.filter((s) => s !== '${TASK_COLS}'), 'a second column list is a second row shape').toEqual([])
    // …and the helper reads every face at once, so each caller must name the ones it shows
    // (the merge rule's « a spine read names its face », held here for the one helper).
    const calls = [...src.matchAll(/\browsOf\(\s*db,\s*`([^`]*)`/g)].map((m) => m[1] ?? '')
    expect(calls.length, 'canary: the views call it').toBeGreaterThan(5)
    expect(calls.filter((w) => !/\$\{FACE\.\w+\}/.test(w)), 'a read without a face hands chores and to-dos to a view that wanted projects').toEqual([])
  })

  it('on the client, nothing outside the listed files branches on a task’s face', () => {
    const FACE_JS = /\b(?:source|kind)\s*===?\s*'(?:chore|todo)'|\bsource\s*===?\s*'home'/
    const branching = client.filter((f) => FACE_JS.test(f.src)).map((f) => f.rel)
    expect(branching.filter((f) => !CLIENT_ALLOWED[f]), 'read the task, not the table it came from').toEqual([])
  })

  it('every listed exception still exists (a stale exemption is noise the next reader trusts)', () => {
    for (const f of Object.keys(ALLOWED)) expect(worker.some((x) => x.rel === f), f).toBe(true)
    for (const f of Object.keys(CLIENT_ALLOWED)) expect(client.some((x) => x.rel === f), f).toBe(true)
  })
})
