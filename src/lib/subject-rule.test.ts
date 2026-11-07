import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { sourceFiles, blankComments } from './buildGuardScan'
import { subjectOf, type SubjectKind } from './subjects'

// ONE SUBJECT LINK (plans/2026-11-06-TACHE-UNIFIEE.md : « one word, one scheduler, one subject
// link, one look, one row, one form, each held by a guard »).
//
// A task's subject has five kinds, and the moment a row or a page branches on them by hand
// there are two answers to « how does a pet read here ? », then six. `subjectOf()` is the one
// place that knows. Reading the raw columns is the door to a second answer, so on the client
// only the row shapes that declare them may name `subject_kind`: everything else gets a
// resolved `Subject`. The server's half is `subjectFromRow` (_lib/subject.ts), which is why
// `carnet_id` reading as a subject has exactly one spelling.
//
// Plant: `row.subject_kind === 'pet'` in src/components/board/WeekView.tsx.

const SRC = join(__dirname, '..')

const ALLOWED: Record<string, string> = {
  'lib/subjects.ts': 'the resolver itself',
  'lib/todos.ts': 'declares the column on the Todo row shape',
  'components/operator/types.ts': 'declares the columns on the Chore and HomeProject row shapes',
  'components/forms/ChoreForm.tsx': 'declares the columns on ChoreInit; it reads them through subjectRefOf',
}

const rel = (f: string) => f.slice(SRC.length + 1).replace(/\\/g, '/')

describe('one subject resolver', () => {
  const files = sourceFiles(SRC).filter((f) => /\.tsx?$/.test(f))

  it('walks the tree (canary)', () => {
    expect(files.length).toBeGreaterThan(200)
    expect(files.some((f) => rel(f) === 'lib/subjects.ts')).toBe(true)
  })

  it('nothing outside the resolver reads the raw subject columns', () => {
    const strays = files.filter((f) => !(rel(f) in ALLOWED) && /\bsubject_(kind|id)\b/.test(blankComments(readFileSync(f, 'utf8'))))
    expect(strays.map(rel)).toEqual([])
  })

  it('every ALLOWED entry still exists, so the list cannot rot', () => {
    for (const f of Object.keys(ALLOWED)) expect(files.map(rel)).toContain(f)
  })

  // The client and the Worker each name the kinds. They cannot share a module, so the guard
  // reads the server's list as text and makes the resolver answer every entry.
  it('the resolver answers every kind the server accepts', () => {
    const server = readFileSync(join(SRC, '..', 'functions', '_lib', 'subject.ts'), 'utf8')
    const list = /SUBJECT_KINDS = \[([^\]]+)\]/.exec(server)?.[1] ?? ''
    const kinds = [...list.matchAll(/'([a-z]+)'/g)].map((m) => m[1] as SubjectKind)
    expect(kinds.length).toBeGreaterThan(3)
    for (const kind of kinds) {
      const s = subjectOf({ kind, id: 'x' })
      expect(s.icon, kind).toBeTruthy()
      expect(s.to, kind).toBeTruthy()
    }
  })
})
