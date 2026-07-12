// À compléter — standalone check-off lists (todos), distinct from the loose-chore
// "À faire" board section. Shared shapes + pure helpers (unit-tested in
// todos.test.ts); the React surface lives in src/components/todos/TodoSection.tsx.
// Query keys live in lib/queryKeys.ts (TODOS_KEY / TODO_TEMPLATES_KEY).
import { TODOS_KEY } from './queryKeys'

// One todo. `day` null = global (a standing item); a number = local-midnight unix
// second it's pinned to. `member_id` is the optional face (attribution only).
// `done_at` null = open; a number = checked (marked in place, awaiting clear).
// `section` (migration 0047) = the top template's title when this todo came from
// instantiating a checklist (always set on new instances since mig 0116); null = a
// loose item / a manual add. `source_template_id` (mig 0116) = soft ref to the
// todo_templates row it was instantiated from (no FK — a deleted template never
// cascades): null = loose « À compléter » todo; set = a departure checklist-instance
// row (« Avant de partir »), always day-pinned server-side.
export interface Todo {
  id: string
  title: string
  day: number | null
  member_id: string | null
  done_at: number | null
  position: number
  section: string | null
  source_template_id: string | null
}

// A template item is EITHER a plain label OR a reference to another template
// (compose lists from lists). The stored / wire form is compact — a bare string,
// or { ref } — but the API serves the normalized union below.
export type TemplateItem = { kind: 'item'; label: string } | { kind: 'ref'; refId: string }
export type StoredItem = string | { ref?: string; label?: string }

export interface TodoTemplate {
  id: string
  title: string
  items: TemplateItem[]
  position: number
}

export interface TodosData {
  todos: Todo[]
}
export interface TemplatesData {
  templates: TodoTemplate[]
}

// Cap on a single instantiation's flattened size — a backstop against a pathological
// deep/wide composition. Mirrored server-side in functions/api/todos.ts.
const MAX_EXPAND = 100

// The query key for a todo scope: the board glance (global + today) is the base
// TODOS_KEY; a specific day is a child key, so invalidating TODOS_KEY (what the
// realtime hook + writes do) prefix-matches and refreshes every day view too.
export const todosKey = (day?: number | null) => (day == null ? TODOS_KEY : [...TODOS_KEY, day])

// The /api/todos path for a scope. No day → board glance; a day → that day's set.
export const todosPath = (day?: number | null) => (day == null ? 'todos' : `todos?date=${day}`)

export const isOpen = (t: Todo): boolean => t.done_at == null
export const isChecked = (t: Todo): boolean => t.done_at != null

// A reserved, non-template `source_template_id` for a FREE-TYPED « Avant de partir »
// item (one typed directly into the departure card, not picked from a saved
// checklist). It carries no real template — the sentinel just makes the row read as a
// checklist instance (isChecklistRow) so it groups on the departure card, counts on
// its mini, folds into the Aujourd'hui glance, and is swept once its day passes,
// exactly like an instantiated one. Won't collide with a real template id (those are
// random newId()s). MIRRORED in functions/api/todos.ts — keep the two in lockstep.
export const DEPARTURE_ADHOC = 'departure-adhoc'

// The « Avant de partir » discriminator: a row instantiated from a checklist
// template (source_template_id set) vs a loose « À compléter » todo. Legacy
// pre-0116 instances read as loose — accepted, they clear naturally.
export const isChecklistRow = (t: Todo): boolean => t.source_template_id != null

// Split a scope's rows into the two concepts: `loose` (« À faire »/« À compléter »)
// and `checklists` — one group per instantiated template, keyed by
// `source_template_id ?? section` (two instantiations of one template merge; a
// legacy sectioned row without the ref still folds under its section title),
// first-seen order. `section` is the group's display header (null only for
// pathological legacy rows — callers fall back to a generic title).
//
// Legacy policy (accepted, deliberate): a PRE-0116 COMPOSED-template instance
// (section set, ref null — plain ones got section null and stay loose) is treated
// as a checklist, so after the split it RELOCATES from « À faire » to the
// departure card; a global (day-null) one never matches the server sweep and
// lingers there until ticked + « Effacer cochées ». Bounded one-time cost — do
// NOT widen the sweep to ref-less rows (it would eat hand-sectioned data).
export interface ChecklistGroup {
  key: string
  section: string | null
  todos: Todo[]
}
export function splitTodos(todos: Todo[]): { loose: Todo[]; checklists: ChecklistGroup[] } {
  const loose: Todo[] = []
  const groups = new Map<string, ChecklistGroup>()
  for (const td of todos) {
    if (!isChecklistRow(td) && td.section == null) {
      loose.push(td)
      continue
    }
    const key = td.source_template_id ?? `s:${td.section}`
    const g = groups.get(key)
    if (g) g.todos.push(td)
    else groups.set(key, { key, section: td.section, todos: [td] })
  }
  return { loose, checklists: [...groups.values()] }
}

// The ids the bulk-clear should sweep: exactly the checked ones. Passed to the
// deferred-undo clear so a tick made after scheduling the undo isn't removed.
export const checkedIds = (todos: Todo[]): string[] => todos.filter(isChecked).map((t) => t.id)

// (groupBySection — the old contiguous-run section grouper — was deleted with the
// mig-0116 split: splitTodos above buckets across the WHOLE list and is the one
// grouping helper every surface uses.)

// ── Template composition (mirrors the server expansion in functions/api/todos.ts) ──

// Convert template items between the API union and the compact stored/wire form.
export function toStored(items: TemplateItem[]): StoredItem[] {
  return items.map((it) => (it.kind === 'ref' ? { ref: it.refId } : it.label))
}

const norm = (s: string) => s.trim().toLowerCase()

// Flatten ONE list's tree into concrete labels: refs expand inline, each list
// visited at most once (cycle-safe), labels deduped case-insensitively within the
// result. Used for a sub-list's section content + the editor's count preview.
export function expandTemplate(templates: TodoTemplate[], id: string, max = MAX_EXPAND): string[] {
  const byId = new Map(templates.map((t) => [t.id, t]))
  const seen = new Set<string>()
  const labels: string[] = []
  const walk = (tid: string) => {
    if (seen.has(tid) || labels.length >= max) return
    seen.add(tid)
    const tpl = byId.get(tid)
    if (!tpl) return
    for (const it of tpl.items) {
      if (labels.length >= max) break
      if (it.kind === 'item') labels.push(it.label)
      else walk(it.refId)
    }
  }
  walk(id)
  const seenLabel = new Set<string>()
  const out: string[] = []
  for (const l of labels) {
    const k = norm(l)
    if (!k || seenLabel.has(k)) continue
    seenLabel.add(k)
    out.push(l)
  }
  return out.slice(0, max)
}

// The instantiated, SECTIONED result of a (possibly composed) list. We always want
// the TOP parent and all its todos: EVERY instantiation (plain or composed) carries
// `section` = the top list's title — the departure card folds each instance under
// that header, so it must always exist (mig 0116; previously composed-only). A
// COMPOSED list (one containing any sub-list ref, at any depth) still flattens to
// that SINGLE section (deduped across the whole result); intermediate sub-list
// titles are not shown. Kept in lockstep with functions/api/todos.ts.
export function expandSectioned(
  templates: TodoTemplate[],
  id: string,
  max = MAX_EXPAND,
): { label: string; section: string | null }[] {
  const byId = new Map(templates.map((t) => [t.id, t]))
  const root = byId.get(id)
  if (!root) return []
  const section = root.title
  return expandTemplate(templates, id, max).map((label) => ({ label, section }))
}

// Would including `candidateId` inside `hostId` create a cycle? True if the
// candidate already (transitively) references the host — used to keep the
// include-a-list picker from offering a choice that would loop.
export function wouldCycle(templates: TodoTemplate[], hostId: string, candidateId: string): boolean {
  if (hostId === candidateId) return true
  const byId = new Map(templates.map((t) => [t.id, t]))
  const seen = new Set<string>()
  const reaches = (tid: string): boolean => {
    if (tid === hostId) return true
    if (seen.has(tid)) return false
    seen.add(tid)
    const tpl = byId.get(tid)
    if (!tpl) return false
    for (const it of tpl.items) if (it.kind === 'ref' && reaches(it.refId)) return true
    return false
  }
  return reaches(candidateId)
}
