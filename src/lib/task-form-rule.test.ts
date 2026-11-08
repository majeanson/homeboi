import { readFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { describe, expect, it } from 'vitest'
import { sourceFiles, blankComments } from './buildGuardScan'

// ONE TASK FORM (plans/2026-11-06-TACHE-UNIFIEE.md, phase 4): « at its core a simple todo… up to
// the recurrent gouttière rotating ». Two ways it would drift back into three forms, each held here:
//
//   · ONLY THE TITLE IS REQUIRED. A task is a title; everything else is a layer. A write path
//     that refuses a task for want of a date, a person or a recurrence makes that layer a TYPE
//     again. Held on the server (the POST of each task endpoint refuses nothing but a missing
//     title, and the departure-template branch its unknown template; a PATCH only its id and a
//     bad snooze) and on the client (the form's Save waits for the title, and nothing else).
//   · NO UI BRANCHES ON A TASK'S TABLE. Which table a row lives in is decided by `taskTarget`
//     (lib/taskTarget.ts) and spelled by the save adapter (lib/taskSave.ts). A component that
//     compares `source === 'chore'` (or a table, or a door's kind) is a form growing a type.
//     When `tasks` and `todos` merge, those two files change and nothing else may need to.
//
// Planted red three times (2026-11-08), each plant grepped in place before the run: a
// `if (!body?.recur) return badRequest('Récurrence requise.')` in chores.ts's POST; a
// `|| !draft.recur` on TaskForm's saveDisabled; an `item.source === 'chore'` in TaskList.tsx.

const ROOT = join(__dirname, '..', '..')
const read = (f: string) => blankComments(readFileSync(join(ROOT, f), 'utf8'))

// One exported handler's source, from its `export const` to the next one.
function handler(src: string, name: string): string {
  const at = src.indexOf(`export const ${name}`)
  if (at < 0) return ''
  const next = src.indexOf('export const ', at + 1)
  return src.slice(at, next < 0 ? undefined : next)
}
const refusals = (body: string) => [...body.matchAll(/\bbadRequest\(\s*'([^']*)'/g)].map((m) => m[1])

// The one form's door (/api/tasks, 0150) and the three aliases it left standing.
const TASK_APIS = ['functions/api/tasks.ts', 'functions/api/chores.ts', 'functions/api/todos.ts', 'functions/api/home-projects.ts']
const POST_OK = new Set(['Titre requis.', 'Modèle introuvable.'])
const PATCH_OK = new Set(['id requis.', 'snooze invalide.'])

describe('only the title is required', () => {
  it('each task POST refuses nothing but a missing title (and an unknown checklist template)', () => {
    const extra = TASK_APIS.flatMap((f) => refusals(handler(read(f), 'onRequestPost')).filter((m) => !POST_OK.has(m!)).map((m) => `${f}: ${m}`))
    expect(extra, 'a layer became required: drop the refusal, a task is a title').toEqual([])
  })
  it('the scan reads the handlers (canary)', () => {
    for (const f of TASK_APIS) expect(refusals(handler(read(f), 'onRequestPost')), f).toContain('Titre requis.')
  })
  it('each task PATCH refuses nothing but a missing id or a bad snooze', () => {
    const extra = TASK_APIS.flatMap((f) => refusals(handler(read(f), 'onRequestPatch')).filter((m) => !PATCH_OK.has(m!)).map((m) => `${f}: ${m}`))
    expect(extra).toEqual([])
  })
  it('the one form saves as soon as it has a title, and on nothing else', () => {
    const form = read('src/components/forms/TaskForm.tsx')
    const gates = [...form.matchAll(/saveDisabled=\{([^}]*)\}/g)].map((m) => m[1]!.trim())
    expect(gates).toEqual(['!draft.title.trim()'])
    expect(form).toMatch(/if \(!draft\.title\.trim\(\) \|\| busy\) return/)
  })
})

// The files allowed to know which table a task lives in.
const ADAPTER = new Set(['src/lib/taskTarget.ts', 'src/lib/taskSave.ts', 'src/lib/tasks.ts'])
const TABLE_BRANCH = [
  /\b(?:source|table)\s*[!=]==?\s*['"`](?:chore|todo|home)['"`]/,
  /['"`](?:chore|todo|home)['"`]\s*[!=]==?\s*[\w.?]*\b(?:source|table)\b/,
]
// A door may NAME a kind (?kind=upkeep); a form or the scene must never branch on it.
const KIND_BRANCH = /\bkind\s*[!=]==?\s*['"`](?:plan|upkeep)['"`]/
const FORM_FILES = ['src/components/forms/TaskForm.tsx', 'src/pages/TaskFormPage.tsx', 'src/components/tasks/TaskList.tsx', 'src/components/tasks/useTaskActions.ts']

describe('no UI branches on a task’s table', () => {
  const files = sourceFiles(join(ROOT, 'src'))
    .filter((f) => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f))
    .map((f) => relative(ROOT, f).split(sep).join('/'))
  it('walks the tree (canary)', () => {
    expect(files).toContain('src/components/forms/TaskForm.tsx')
    expect(files.length).toBeGreaterThan(200)
  })
  it('nothing outside taskTarget and the save adapter compares a task’s source or table', () => {
    const hits = files
      .filter((f) => !ADAPTER.has(f))
      .flatMap((f) =>
        read(f)
          .split('\n')
          .map((line, i) => (TABLE_BRANCH.some((re) => re.test(line)) ? `${f}:${i + 1}` : null))
          .filter(Boolean),
      )
    expect(hits, 'ask lib/taskSave (canPostpone, taskScene, taskWrite…) instead of naming the table').toEqual([])
  })
  it('the form, its scene and the row never branch on a door’s kind', () => {
    const hits = FORM_FILES.flatMap((f) => (KIND_BRANCH.test(read(f)) ? [f] : []))
    expect(hits).toEqual([])
  })
})
