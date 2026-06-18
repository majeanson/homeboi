// À cocher — standalone check-off lists (todos), distinct from the loose-chore
// "À faire" board section. Shared shapes + pure helpers (unit-tested in
// todos.test.ts); the React surface lives in src/components/todos/TodoSection.tsx.
// Query keys live in lib/queryKeys.ts (TODOS_KEY / TODO_TEMPLATES_KEY).
import { TODOS_KEY } from './queryKeys'

// One todo. `day` null = global (a standing item); a number = local-midnight unix
// second it's pinned to. `member_id` is the optional face (attribution only).
// `done_at` null = open; a number = checked (marked in place, awaiting clear).
export interface Todo {
  id: string
  title: string
  day: number | null
  member_id: string | null
  done_at: number | null
  position: number
}

export interface TodoTemplate {
  id: string
  title: string
  items: string[]
  position: number
}

export interface TodosData {
  todos: Todo[]
}
export interface TemplatesData {
  templates: TodoTemplate[]
}

// The query key for a todo scope: the board glance (global + today) is the base
// TODOS_KEY; a specific day is a child key, so invalidating TODOS_KEY (what the
// realtime hook + writes do) prefix-matches and refreshes every day view too.
export const todosKey = (day?: number | null) => (day == null ? TODOS_KEY : [...TODOS_KEY, day])

// The /api/todos path for a scope. No day → board glance; a day → that day's set.
export const todosPath = (day?: number | null) => (day == null ? 'todos' : `todos?date=${day}`)

export const isOpen = (t: Todo): boolean => t.done_at == null
export const isChecked = (t: Todo): boolean => t.done_at != null

// Open todos first (in order), then the checked ones (struck, awaiting "Effacer
// cochées") — so a glance reads "what's left" at the top, like La liste.
export function orderTodos(todos: Todo[]): Todo[] {
  return [...todos.filter(isOpen), ...todos.filter(isChecked)]
}

// The ids the bulk-clear should sweep: exactly the checked ones. Passed to the
// deferred-undo clear so a tick made after scheduling the undo isn't removed.
export const checkedIds = (todos: Todo[]): string[] => todos.filter(isChecked).map((t) => t.id)
