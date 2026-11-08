import { readFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { describe, expect, it } from 'vitest'
import { sourceFiles, blankComments } from './buildGuardScan'

// ONE LOOK (plans/2026-11-06-TACHE-UNIFIEE.md, phase 3). A task and its subject are dressed
// with the same two gestures, an icon and a colour, through ONE control: LookPicker. A form
// that writes a task or a subject and spells its own colour row, emoji grid or emoji field
// beside it is how « Allure » would grow five shapes, the way the subject row nearly did
// before subjectOf. Fails the build unless ALLOWED says why.
//
// WHICH FILES: structural, not a list. A file is a task or subject form when it writes one of
// their endpoints through useWrite (`write('chores'`, `write<…>('pets'`, …) or hosts the
// SubjectPicker. A new form joins the rule by being one, with nothing to register.
//
// Planted red twice (2026-11-08): a `<ColorPicker>` pasted back into ChoreForm beside its
// LookPicker (the line LookPicker replaced), and an `<EmojiField>` pasted into PetForm.

const SRC = join(__dirname, '..')
const ENDPOINTS = ['chores', 'home-projects', 'todos', 'carnets', 'pets']
const WRITES = new RegExp(String.raw`\bwrite(?:With)?(?:<[^>]*>)?\(\s*(?:qc\s*,\s*)?['"\x60](?:${ENDPOINTS.join('|')})(?:['"\x60?/])`)
const HOSTS_SUBJECT = /<SubjectPicker\b/
const HAND_ROLLED: [RegExp, string][] = [
  [/<ColorPicker\b/, 'a colour row'],
  [/<EmojiPicker\b/, 'an emoji grid'],
  [/<EmojiField\b/, 'an emoji field'],
  [/type=["']color["']/, 'a native colour input'],
  [/className=["'{][^>]*\b(?:colorpick|emoji-picker|emoji-field)\b/, 'the picker classes by hand'],
]

const ALLOWED = new Map<string, string>([
  ['components/LookPicker.tsx', 'the primitive: it composes EmojiField and ColorPicker, and writes nothing'],
  [
    'components/operator/household.tsx',
    'the MEMBER colour row: a person’s colour is their « who » ink (the title tint of every row they own, with `taken` to keep it distinct), not a look, and a person has no icon (0148). Its only task-table write is a pet DELETE',
  ],
])

const files = sourceFiles(SRC)
  .filter((f) => f.endsWith('.tsx') || f.endsWith('.ts'))
  .filter((f) => !/\.test\.tsx?$/.test(f))
  .map((f) => ({ path: relative(SRC, f).split(sep).join('/'), raw: blankComments(readFileSync(f, 'utf8')) }))

const isForm = (raw: string) => WRITES.test(raw) || HOSTS_SUBJECT.test(raw)

describe('look rule — task and subject forms pick their look through LookPicker', () => {
  it('the detector sees a task write and a hand-rolled control (canary)', () => {
    expect(isForm(`await write('chores', { method: 'POST' })`)).toBe(true)
    expect(isForm(`const res = await write<{ id?: string }>('pets', {`)).toBe(true)
    expect(isForm(`write(\`todos?id=\${x}\`, {`)).toBe(true)
    expect(isForm(`write('recipes', {`)).toBe(false)
    expect(HAND_ROLLED.some(([re]) => re.test('<ColorPicker value={c} onChange={setC} />'))).toBe(true)
  })

  it('the forms the rule exists for are seen as forms', () => {
    const byPath = new Map(files.map((f) => [f.path, f.raw]))
    for (const p of ['components/forms/ChoreForm.tsx', 'components/forms/HomeProjectForm.tsx', 'components/cercle/CarnetForm.tsx', 'components/cercle/PetForm.tsx']) {
      expect(isForm(byPath.get(p) ?? ''), p).toBe(true)
    }
  })

  it('no task or subject form hand-rolls a colour or an icon control', () => {
    const offenders = files
      .filter((f) => !ALLOWED.has(f.path) && isForm(f.raw))
      .flatMap((f) => HAND_ROLLED.filter(([re]) => re.test(f.raw)).map(([, what]) => `${f.path}: ${what}`))
    expect(offenders, 'render <LookPicker value onChange inherit|fallbackIcon suggest /> (components/LookPicker.tsx)').toEqual([])
  })

  it('every ALLOWED entry still exists', () => {
    const live = new Set(files.map((f) => f.path))
    expect([...ALLOWED.keys()].filter((p) => !live.has(p))).toEqual([])
  })
})
