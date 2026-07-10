import { type ComboOption } from '../EntityCombobox'
import { type TodoTemplate, expandTemplate } from '../../lib/todos'
import { type useT } from '../../i18n'

// The shared builder that turns todo templates into EntityCombobox options, so the
// "Modèles :" dropdown reads identically wherever it appears (the board / departure
// checklist via TodoSection, and the ＋ sheet's À compléter tab). Both used to map
// templates inline and drifted apart; this is the one place they agree.
type T = ReturnType<typeof useT>

// How many item labels the hint line names before it defers to the count badge.
const HINT_ITEMS = 4

// Picking a template instantiates it — a batch of todos lands at once. So the row
// says what's inside BEFORE you commit: the flattened labels (refs expanded, deduped —
// exactly what `instantiate` will add) as a faint hint line, with the total as a badge.
// Those same labels become `keywords`, so typing "portefeuille" finds the list that
// carries it, not just lists whose title happens to match.
export function templateOptions(templates: TodoTemplate[], t: T): ComboOption<TodoTemplate>[] {
  return templates.map((tpl): ComboOption<TodoTemplate> => {
    const items = expandTemplate(templates, tpl.id)
    const shown = items.slice(0, HINT_ITEMS)
    const more = items.length - shown.length
    return {
      id: tpl.id,
      label: tpl.title,
      data: tpl,
      icon: 'check-square-bold',
      group: t.todos.templatesLabel,
      keywords: items,
      // An empty list has nothing to preview and nothing to count — stay quiet
      // rather than badge it "0 éléments".
      hint: items.length > 0 ? shown.join(' · ') + (more > 0 ? ` · +${more}` : '') : undefined,
      badge:
        items.length > 0
          ? (
              <span className="combobox__badge mono" title={t.todos.templateItemsCount(items.length)}>
                {items.length}
              </span>
            )
          : undefined,
    }
  })
}
