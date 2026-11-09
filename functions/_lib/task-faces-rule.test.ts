import { readFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { describe, expect, it } from 'vitest'
import { blankComments, sourceFiles } from '../../src/lib/buildGuardScan'

// THE FACES LIVE IN ONE PLACE, AND NO VIEW READS THEM (plans/2026-11-06-TACHE-UNIFIEE.md).
//
// Since 0150 every task is one row of `home_projects`, and `kind` still says which alias a
// row's gestures go to ('chore', 'todo') or what a home row is ('plan', 'upkeep'). Since
// 2026-11-08 (« align every view ») what a household SEES is one rule per question, read off a
// task's axes (the table at the top of _lib/taskViews.ts). This guard holds both halves:
// EVERY READER reads a task through `_lib/taskViews.ts`, on one row shape (`TaskRow`,
// `TASK_COLS`), and NO VIEW decides anything on a face:
//
//   · in _lib/taskViews no read names a face and no rule compares `kind` (it asks `kindOf`,
//     which only knows the two behaviours, plan and upkeep);
//   · no client view and no wire type spells a retired per-face payload field
//     (choresToday, homeOverdue, homeProjects… — one `tasks` list replaced them);
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
// boardModel.ts. Then, for « align every view »: a `${FACE.chore}` read back in taskViews'
// recap; an `r.kind === 'chore'` rule back in taskViews' cells; `data?.homeOverdue` back in
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
  'functions/_lib/taskViews.ts': 'THE reader: `faceOfKind` stamps a cell’s `source` (the alias its gestures go to) and `todoRowsSql` reads the departure checklists; no rule reads a face (held below)',
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
  'src/components/board/DayMark.tsx': 'marker SHAPES, not faces: `chore` is the one task diamond, `todo` the departure checklist’s check (dayLines DotKind)',
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
    expect(importedFaceNames(worker.find((f) => f.rel === 'functions/_lib/taskViews.ts')!.src)).toContain('faceOfKind')
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
  })

  it('no rule in _lib/taskViews reads a face: one rule per question, off the axes', () => {
    const src = worker.find((f) => f.rel === 'functions/_lib/taskViews.ts')!.src
    const reads = [...src.matchAll(/\browsOf\(\s*db,\s*['`]([^'`]*)['`]/g)].map((m) => m[1] ?? '')
    expect(reads.length, 'canary: the views call the one helper').toBeGreaterThan(5)
    expect(reads.filter((w) => /FACE\.|\bkind\b/.test(w)), 'a read that picks a face shows one view to some tasks and not others').toEqual([])
    expect(src, 'a rule that compares `kind` decides by face: ask kindOf').not.toMatch(/\bkind\s*[!=]==?\s*'/)
    expect(importedFaceNames(src).filter((n) => n !== 'faceOfKind' && n !== 'todoRowsSql'), 'only the alias stamp and the departure read').toEqual([])
  })

  it('no view and no wire type spells a retired per-face payload field', () => {
    // (`homeProjects` is not listed: the word also names the search section and a Réglages id.)
    const RETIRED = /\b(?:choresToday|choresUpcoming|homeToday|homeUpcoming|homeOverdue|visibleChores|visibleHome|removeChore|removeHome)\b/
    const spelled = [...client, ...worker.filter((f) => f.rel === 'functions/_lib/wire.ts' || f.rel.startsWith('functions/api/'))].filter((f) => RETIRED.test(f.src)).map((f) => f.rel)
    expect(spelled, 'one `tasks` list (TaskItem, TaskCell) answers every view').toEqual([])
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
