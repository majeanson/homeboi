// À compléter — standalone check-off lists (todos), distinct from the loose-chore
// "À faire" board section. Shared shapes + pure helpers (unit-tested in
// todos.test.ts); the React surface lives in src/components/todos/TodoSection.tsx.
// Query keys live in lib/queryKeys.ts (TODOS_KEY / TODO_TEMPLATES_KEY).
import { TODOS_KEY } from './queryKeys'

// One todo. `day` null = global (a standing item); a number = local-midnight unix
// second it's pinned to. `member_id` is the optional face (attribution only).
// `done_at` null = open; a number = checked (marked in place, awaiting clear).
// `section` (migration 0047) = the source sub-list's title when this todo came
// from instantiating a COMPOSED template; null = a loose item / a manual add.
export interface Todo {
  id: string
  title: string
  day: number | null
  member_id: string | null
  done_at: number | null
  position: number
  section: string | null
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

// The ids the bulk-clear should sweep: exactly the checked ones. Passed to the
// deferred-undo clear so a tick made after scheduling the undo isn't removed.
export const checkedIds = (todos: Todo[]): string[] => todos.filter(isChecked).map((t) => t.id)

// ── Sectioned render ────────────────────────────────────────────────────────
// Group todos into contiguous runs sharing a section, in server order — so a
// composed list renders "a list with sections". A run whose section is null is
// headless (loose items / manual adds).
export interface TodoGroup {
  section: string | null
  todos: Todo[]
}
export function groupBySection(todos: Todo[]): TodoGroup[] {
  const groups: TodoGroup[] = []
  for (const td of todos) {
    const section = td.section ?? null
    const last = groups[groups.length - 1]
    if (last && last.section === section) last.todos.push(td)
    else groups.push({ section, todos: [td] })
  }
  return groups
}

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
// the TOP parent and all its todos: a COMPOSED list (one containing any sub-list ref,
// at any depth) flattens to a SINGLE section titled after the top list — every label,
// loose or pulled from a nested sub-list, lands under that one header (deduped across
// the whole result). A PLAIN list (no refs) stays headless (section null). Intermediate
// sub-list titles are not shown — only the top parent groups the board's expand/collapse.
export function expandSectioned(
  templates: TodoTemplate[],
  id: string,
  max = MAX_EXPAND,
): { label: string; section: string | null }[] {
  const byId = new Map(templates.map((t) => [t.id, t]))
  const root = byId.get(id)
  if (!root) return []
  const composed = root.items.some((it) => it.kind === 'ref')
  const section = composed ? root.title : null
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
