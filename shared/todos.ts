// What the client and the Worker both need to agree on about to-dos and checklist templates,
// written ONCE (review #40). This used to be two copies — src/lib/todos.ts and
// functions/api/todos.ts + todo-templates.ts — « kept in lockstep » by a test that read the
// handlers' source with a regex. Both sides import this file instead.

// Length caps. Deliberately GENEROUS: a todo is often a whole sentence ("appeler la garderie
// pour le formulaire de Léa avant vendredi"), and the old 200-char cap cut the tail SILENTLY,
// after the save. The handler slices with these as a backstop; every field that writes one
// passes the same number as its `limit`, so a too-long text is WARNED about before the write.
export const TODO_TITLE_MAX = 2000
// A template item BECOMES a todo title, so it shares the todo cap (todos.test.ts pins the two
// relations below).
export const TODO_ITEM_LABEL_MAX = 2000
export const TODO_TEMPLATE_TITLE_MAX = 200
// A checklist instance's section header IS its template's title, so it holds at least as much.
export const TODO_SECTION_MAX = 200

// Cap on a single instantiation's flattened size — a backstop against a pathological
// deep/wide composition.
export const MAX_EXPAND = 100

// A reserved, non-template `source_template_id` for a FREE-TYPED « Avant de partir » item
// (typed into the departure card, not picked from a saved checklist). The sentinel makes the
// row read as a checklist instance, so it groups on the departure card, counts on its mini,
// folds into the Aujourd'hui glance, and is swept once its day passes, exactly like an
// instantiated one. Won't collide with a real template id (those are random newId()s).
export const DEPARTURE_ADHOC = 'departure-adhoc'

// A template item as stored (`items_json`) and sent: a label, or a reference to another list.
// `{ label }` is an older spelling the server still reads.
export type StoredItem = string | { ref?: string; label?: string }

const normLabel = (s: string) => s.trim().toLowerCase()

// Flatten ONE list's tree into concrete labels: refs expand inline, each list visited at most
// once (cycle-safe), labels trimmed and deduped case-insensitively within the result. `itemsOf`
// answers a list's stored items, or undefined for a list that does not exist. The editor's
// count preview and the server's instantiation both run THIS, so they cannot disagree.
export function flattenTemplate(itemsOf: (id: string) => readonly StoredItem[] | undefined, id: string, max = MAX_EXPAND): string[] {
  const seen = new Set<string>()
  const labels: string[] = []
  const walk = (tid: string) => {
    if (seen.has(tid) || labels.length >= max) return
    seen.add(tid)
    for (const it of itemsOf(tid) ?? []) {
      if (labels.length >= max) break
      if (typeof it === 'string') {
        const s = it.trim()
        if (s) labels.push(s)
      } else if (it && typeof it.ref === 'string' && it.ref.trim()) {
        walk(it.ref.trim())
      } else if (it && typeof it.label === 'string' && it.label.trim()) {
        labels.push(it.label.trim())
      }
    }
  }
  walk(id)
  const seenLabel = new Set<string>()
  const out: string[] = []
  for (const l of labels) {
    const k = normLabel(l)
    if (!k || seenLabel.has(k)) continue
    seenLabel.add(k)
    out.push(l)
  }
  return out.slice(0, max)
}
