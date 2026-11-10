import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { describe, expect, it } from 'vitest'
import { blankComments, sourceFiles } from '../../src/lib/buildGuardScan'
import { FACE, faceOfKind } from './taskItem'

// NO READER OR WRITER TELLS A FORMER CHORE FROM A FORMER TO-DO (plans/2026-11-06-TACHE-UNIFIEE.md).
//
// Since 0150 every task is one row of `home_projects`. Since 2026-11-08 (« align every view »)
// what a household SEES is one rule per question, read off a task's axes (the table at the top
// of _lib/taskViews.ts). Since 0153 (the owner's decisions of 2026-11-10: one tick, one
// « Vider », one day encoding) what a row DOES is one gesture per question too
// (_lib/taskGestures.ts), and `kind` is `plan | upkeep | NULL`: a task, or a home row. This
// guard holds all of it:
//
//   · the retired kinds are gone: `FACE` names a task and a home row and nothing else, every
//     stored kind reads as one of the two, no SQL near the spine spells 'chore' or 'todo', and
//     the latest rebuild of the spine CHECKs `kind` (a forgotten door fails in D1, not later);
//   · no wire type and no client branch names a retired kind as a task's `source`;
//   · ONE DAY ENCODING: the raw encoders a face used to pick (`dateSec`, `startSec`) are gone
//     from the Worker, a task handler reads a body's date only through `taskDayOf`, and no task
//     file on the client speaks the UTC-anchor pair (`dateToAnchorSec`…), which is for
//     appointments only;
//   · EVERY READER reads a task through `_lib/taskViews.ts`, on one row shape (`TaskRow`,
//     `TASK_COLS`) handed over through the one day decoder, and no view decides on a face;
//   · the face vocabulary of `_lib/taskItem` (FACE, faceOfKind, todoRowsSql) is imported only
//     by the files listed below, each with why.
//
// Planted red (2026-11-08), each plant checked with grep before the run: `FACE` imported back
// into year.ts; a `kind = 'chore'` SELECT in recap.ts; a `t.source === 'chore'` in
// boardModel.ts; a `${FACE.chore}` read back in taskViews' recap; an `r.kind === 'chore'` rule
// back in taskViews' cells; `data?.homeOverdue` back in boardModel.ts.
// Planted red (2026-11-10, 0153), each plant checked with grep before the run: a
// `kind = 'todo'` UPDATE back in todos.ts; `chore: "kind = 'chore'"` back in FACE; `'chore' |`
// back in the wire's `source`; `todayAnchorDate()` back in TaskForm.tsx; a raw
// `binds.push(body.at)` in home-projects.ts; the CHECK removed from 0153; `.map(withTaskDay)`
// dropped from taskViews' row helper.

const ROOT = join(__dirname, '..', '..')
const scan = (dir: string, ext: RegExp) =>
  sourceFiles(join(ROOT, dir))
    .filter((f) => ext.test(f) && !/\.test\.tsx?$/.test(f) && !/[\\/]test[\\/]/.test(f))
    .map((f) => ({ rel: relative(ROOT, f).split(sep).join('/'), src: blankComments(readFileSync(f, 'utf8')) }))
const worker = [...scan('functions', /\.ts$/), ...scan('worker', /\.ts$/)]
const client = scan('src', /\.tsx?$/)
const file = (rel: string) => [...worker, ...client].find((f) => f.rel === rel)!

const FACE_EXPORTS = ['FACE', 'faceOfKind', 'todoRowsSql', 'Face']

// Who may speak the faces (a task, a home row), and why.
const ALLOWED: Record<string, string> = {
  'functions/_lib/taskItem.ts': 'defines the faces',
  'functions/_lib/taskViews.ts': 'THE reader: `faceOfKind` stamps a cell’s `source`, `todoRowsSql` reads the departure checklists; no rule reads a face (held below)',
  'functions/api/chores.ts': 'alias kept for old tabs and queued writes: serves every task (FACE.task) in its old shape',
  'functions/api/home-projects.ts': 'serves the home rows (FACE.home): the season card, the carnets, Réglages, search',
  'functions/api/todos.ts': 'alias kept for old tabs and queued writes: every task beside the departure checklists',
  'functions/api/tasks.ts': 'the one door: an edit keeps or raises a row’s face (faceAfter)',
  'functions/_lib/taskWrite.ts': 'the one write: which columns a task and a home row store',
  'functions/_lib/staleDelete.ts': 'the to-do alias’s delete heals a stale tmp- id across the task rows and the checklists',
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

// The client files that still read a task's face, and why.
const CLIENT_ALLOWED: Record<string, string> = {
  'src/lib/tasks.ts': 'the client’s task module',
  'src/lib/taskSave.ts': 'a home row’s edit scene and « Reporter » (the server keeps one gesture per question)',
  'src/lib/taskTarget.ts': 'the shared rule that picks whether a new task is a home row (the server uses it too)',
  'src/components/board/DayMark.tsx': 'marker SHAPES, not faces: `chore` is the one task diamond, `todo` the departure checklist’s check (dayLines DotKind)',
}

// The task handlers: where a body's date becomes a stored day.
const TASK_HANDLERS = ['functions/api/tasks.ts', 'functions/api/chores.ts', 'functions/api/todos.ts', 'functions/api/home-projects.ts']
// The client's task files: none may speak the appointment pair (a UTC midnight).
const TASK_CLIENT = (rel: string) =>
  rel === 'src/lib/taskSave.ts' || rel === 'src/lib/tasks.ts' || rel === 'src/pages/TaskFormPage.tsx' || rel === 'src/components/forms/TaskForm.tsx' || rel.startsWith('src/components/tasks/')

const importedFaceNames = (src: string): string[] =>
  [...src.matchAll(/import\s*(?:type\s*)?\{([^}]*)\}\s*from\s*'[^']*\btaskItem'/g)].flatMap((m) =>
    (m[1] ?? '')
      .split(',')
      .map((x) => x.trim().replace(/^type\s+/, '').split(/\s+as\s+/)[0]?.trim() ?? '')
      .filter((n) => FACE_EXPORTS.includes(n)),
  )

// The statement around a mention of the spine: forward to its `.bind(` (or a backstop).
const statementsOn = (src: string, table: string) =>
  [...src.matchAll(new RegExp(`\\b${table}\\b`, 'g'))].map((m) => {
    const rest = src.slice(m.index, m.index + 700)
    const end = rest.search(/\.bind\(|\.all\(|\.first\(|\.run\(/)
    return end < 0 ? rest : rest.slice(0, end)
  })

describe('the faces live in one place, and a former chore and a former to-do are one thing', () => {
  it('walks the sources (canary: a scan that reads nothing passes everything)', () => {
    expect(worker.length).toBeGreaterThan(150)
    expect(client.length).toBeGreaterThan(300)
    expect(importedFaceNames(file('functions/_lib/taskViews.ts').src)).toContain('faceOfKind')
    expect(file('functions/_lib/taskItem.ts').src).toMatch(/kind IS NULL/)
  })

  it('`kind` is a task or a home row: FACE has two entries, and every stored kind reads as one', () => {
    expect(Object.keys(FACE).sort()).toEqual(['home', 'task'])
    for (const k of [null, undefined, 'chore', 'todo', 'anything']) expect(faceOfKind(k), String(k)).toBe('task')
    for (const k of ['plan', 'upkeep']) expect(faceOfKind(k)).toBe('home')
  })

  it('the latest rebuild of the spine CHECKs `kind`, and no later migration writes a retired one', () => {
    const dir = join(ROOT, 'functions', 'db', 'migrations')
    const sqls = readdirSync(dir).filter((f) => /^\d{4}_.*\.sql$/.test(f)).sort()
    const rebuilds = sqls.filter((f) => /CREATE TABLE home_projects_new/.test(readFileSync(join(dir, f), 'utf8')))
    const last = rebuilds[rebuilds.length - 1]!
    expect(last >= '0153_', 'canary: 0153 rebuilds the spine').toBe(true)
    const code = readFileSync(join(dir, last), 'utf8').replace(/--[^\n]*/g, '')
    expect(code, `${last}: the spine's kind is checked`).toMatch(/kind\s+TEXT\s+CHECK\s*\(\s*kind IS NULL OR kind IN \('plan', 'upkeep'\)\s*\)/)
    for (const f of sqls.filter((x) => x > last)) {
      const later = readFileSync(join(dir, f), 'utf8').replace(/--[^\n]*/g, '')
      expect(/home_projects/.test(later) && /'(?:chore|todo)'/.test(later), `${f} writes a retired kind`).toBe(false)
    }
  })

  it('no SQL near the spine spells a retired kind, and no code names FACE.chore / FACE.todo', () => {
    // The one reader of the retired kinds: a copy taken before 0153 is brought forward, so its
    // 'chore' and 'todo' rows are read once, and written back as NULL (`upgradeTasks`).
    const OLD_COPIES = 'functions/_lib/restore.ts'
    const spelled = worker
      .filter((f) => f.rel !== OLD_COPIES)
      .filter((f) => statementsOn(f.src, 'home_projects').some((s) => /'(?:chore|todo)'/.test(s)) || /\bFACE\.(?:chore|todo)\b/.test(f.src))
      .map((f) => f.rel)
    expect(file(OLD_COPIES).src, `${OLD_COPIES}: canary, it brings 0153 forward`).toMatch(/function shrinkKinds/)
    expect(spelled, 'a task has no kind (0153): write NULL, read FACE.task').toEqual([])
  })

  it('no wire type and no client type lists a retired kind as a task’s source', () => {
    for (const rel of ['functions/_lib/wire.ts', 'src/lib/tasks.ts']) {
      const lines = file(rel).src.split('\n').filter((l) => /^\s*source:\s*'/.test(l))
      expect(lines.length, `${rel}: canary, the source line is read`).toBeGreaterThan(0)
      expect(lines.filter((l) => /'(?:chore|todo)'/.test(l)), rel).toEqual([])
    }
  })

  it('ONE DAY ENCODING: the raw encoders are gone, a handler reads a body’s date through taskDayOf', () => {
    expect(worker.filter((f) => /\b(?:dateSec|startSec)\b/.test(f.src)).map((f) => f.rel), 'store a day through taskDayOf (_lib/taskDay)').toEqual([])
    for (const rel of TASK_HANDLERS) {
      const src = file(rel).src
      const raw = [...src.matchAll(/\bbody\??\.(?:at|start)\b/g)].filter((m) => {
        const before = src.slice(Math.max(0, m.index - 10), m.index)
        const after = src.slice(m.index + m[0].length, m.index + m[0].length + 16)
        return !/taskDayOf\($/.test(before) && !/^\s*[!=]==?\s*undefined/.test(after)
      })
      expect(raw.map((m) => src.slice(0, m.index).split('\n').length), `${rel}: a body's date reaches SQL only through taskDayOf`).toEqual([])
    }
    const anchor = client.filter((f) => TASK_CLIENT(f.rel) && /\b(?:dateToAnchorSec|anchorSecToDate|todayAnchorDate)\b/.test(f.src)).map((f) => f.rel)
    expect(anchor, 'a task’s day is a local midnight: localDayFromInput / inputFromLocalDay').toEqual([])
  })

  it('only the listed files import the face vocabulary of _lib/taskItem', () => {
    const using = worker.filter((f) => importedFaceNames(f.src).length > 0).map((f) => f.rel)
    expect(using.filter((f) => !ALLOWED[f]), 'read a task through _lib/taskViews, which already knows its face').toEqual([])
  })

  it('the readers hold no SELECT of the spine of their own', () => {
    for (const rel of READERS) {
      const f = worker.find((x) => x.rel === rel)
      expect(f, rel).toBeDefined()
      expect(f!.src, `${rel}: ask _lib/taskViews for the rows`).not.toMatch(/\bFROM\s+home_projects\b/)
      expect(f!.src, `${rel}: canary, it reads through taskViews`).toMatch(/from '[^']*\btaskViews'/)
    }
  })

  it('every read in _lib/taskViews of the spine’s rows uses the one column list, through the one day decoder', () => {
    const src = file('functions/_lib/taskViews.ts').src
    const selects = [...src.matchAll(/SELECT ([^`]*?) FROM home_projects\b/g)].map((m) => (m[1] ?? '').trim())
    expect(selects, 'canary: the helper is there').toContain('${TASK_COLS}')
    expect(selects.filter((s) => s !== '${TASK_COLS}'), 'a second column list is a second row shape').toEqual([])
    expect(src, 'every row is handed over decoded (_lib/taskDay)').toMatch(/FROM home_projects WHERE \$\{where\}`\)[^\n]*\.map\(withTaskDay\)/)
  })

  it('no rule in _lib/taskViews reads a face: one rule per question, off the axes', () => {
    const src = file('functions/_lib/taskViews.ts').src
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

  it('on the client, nothing branches on a retired kind, and only the listed files on a home row', () => {
    const RETIRED_JS = /\b(?:source|kind|face|table)\s*===?\s*'(?:chore|todo)'|\bsource:\s*'(?:chore|todo)'/
    expect(client.filter((f) => RETIRED_JS.test(f.src) && f.rel !== 'src/components/board/DayMark.tsx').map((f) => f.rel), 'a task is a task (0153)').toEqual([])
    const HOME_JS = /\bsource\s*===?\s*'home'/
    expect(client.filter((f) => HOME_JS.test(f.src) && !CLIENT_ALLOWED[f.rel]).map((f) => f.rel), 'read the task, not the table it came from').toEqual([])
  })

  it('every listed exception still exists (a stale exemption is noise the next reader trusts)', () => {
    for (const f of [...Object.keys(ALLOWED), ...TASK_HANDLERS]) expect(worker.some((x) => x.rel === f), f).toBe(true)
    for (const f of Object.keys(CLIENT_ALLOWED)) expect(client.some((x) => x.rel === f), f).toBe(true)
  })
})
