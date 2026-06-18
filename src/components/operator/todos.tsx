import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useT } from '../../i18n'
import { api } from '../../lib/api'
import { useWrite } from '../../lib/write'
import { live } from '../../lib/query'
import { useRecordUndo } from '../../lib/toast'
import { isGuest } from '../../lib/device'
import { TODO_TEMPLATES_KEY } from '../../lib/queryKeys'
import { type TemplatesData, type TodoTemplate } from '../../lib/todos'
import { EditField } from '../EditField'
import { RowActions } from '../RowActions'
import { Icon } from '../Icon'

// Réglages ▸ À compléter. Reusable check-off checklists ("Avant de partir", "Chez
// grand-papa"): a title + an ordered list of item labels. Instantiating one (from
// the board / day page template chips) drops its items in as real todos, so a
// stressful departure is pre-thought-out. Each edit PATCHes the whole items array
// (small, operator-driven); deletes go behind the app-wide deferred undo.
export function TodoTemplatesSection() {
  const t = useT()
  const write = useWrite()
  const recordUndo = useRecordUndo()
  const ro = isGuest()
  const { data } = useQuery({
    queryKey: TODO_TEMPLATES_KEY,
    queryFn: () => api<TemplatesData>('todo-templates'),
    ...live,
    enabled: !ro,
  })
  const templates = data?.templates ?? []

  const [newName, setNewName] = useState('')
  const [newItem, setNewItem] = useState<Record<string, string>>({})
  // Inline item edit: which (template, index) is open + its draft text.
  const [editItem, setEditItem] = useState<{ id: string; idx: number } | null>(null)
  const [editText, setEditText] = useState('')

  const saveItems = (tpl: TodoTemplate, items: string[]) =>
    void write('todo-templates', { method: 'PATCH', body: { id: tpl.id, items }, affectedKeys: [TODO_TEMPLATES_KEY] }).catch(
      () => {},
    )

  async function addTemplate() {
    const name = newName.trim()
    if (!name) return
    setNewName('')
    await write('todo-templates', { method: 'POST', body: { title: name, items: [] }, affectedKeys: [TODO_TEMPLATES_KEY] }).catch(
      () => {},
    )
  }

  function renameTemplate(tpl: TodoTemplate, title: string) {
    const v = title.trim()
    if (!v || v === tpl.title) return
    void write('todo-templates', { method: 'PATCH', body: { id: tpl.id, title: v }, affectedKeys: [TODO_TEMPLATES_KEY] }).catch(
      () => {},
    )
  }

  // Delete now, with a COMPENSATING undo that re-creates the template (a new id,
  // same title + items) — the list is live-polled, so a deferred hold would fight
  // the refetch; re-create is the clean reversal.
  function removeTemplate(tpl: TodoTemplate) {
    void write('todo-templates', { method: 'DELETE', body: { id: tpl.id }, affectedKeys: [TODO_TEMPLATES_KEY] }).catch(
      () => {},
    )
    recordUndo({
      message: t.todos.removed(tpl.title),
      onUndo: () =>
        void write('todo-templates', {
          method: 'POST',
          body: { title: tpl.title, items: tpl.items },
          affectedKeys: [TODO_TEMPLATES_KEY],
        }).catch(() => {}),
    })
  }

  function addItem(tpl: TodoTemplate) {
    const label = (newItem[tpl.id] ?? '').trim()
    if (!label) return
    setNewItem((m) => ({ ...m, [tpl.id]: '' }))
    saveItems(tpl, [...tpl.items, label])
  }
  function removeItem(tpl: TodoTemplate, idx: number) {
    saveItems(tpl, tpl.items.filter((_, i) => i !== idx))
  }
  function renameItem(tpl: TodoTemplate, idx: number, label: string) {
    const v = label.trim()
    setEditItem(null)
    if (!v) return
    saveItems(tpl, tpl.items.map((x, i) => (i === idx ? v : x)))
  }
  function moveItem(tpl: TodoTemplate, idx: number, dir: 'up' | 'down') {
    const j = dir === 'up' ? idx - 1 : idx + 1
    if (j < 0 || j >= tpl.items.length) return
    const next = [...tpl.items]
    ;[next[idx], next[j]] = [next[j], next[idx]]
    saveItems(tpl, next)
  }

  if (ro) return null

  return (
    <section className="surface operator__section">
      <h2>{t.todos.templatesTitle}</h2>
      <p className="lead">{t.todos.templatesHint}</p>

      {templates.length === 0 ? (
        <p className="board__empty mono">{t.todos.noTemplates}</p>
      ) : (
        <ul className="operator__list">
          {templates.map((tpl) => (
            <li key={tpl.id} className="todo-tpl">
              <div className="todo-tpl__head">
                <input
                  className="input todo-tpl__name"
                  defaultValue={tpl.title}
                  onBlur={(e) => renameTemplate(tpl, e.target.value)}
                  aria-label={t.todos.templateName}
                  maxLength={80}
                />
                <span className="todo-tpl__count mono">{t.todos.templateItemsCount(tpl.items.length)}</span>
                <RowActions onDelete={() => removeTemplate(tpl)} deleteLabel={`${t.common.delete} — ${tpl.title}`} />
              </div>

              <ul className="todo-tpl__items">
                {tpl.items.map((item, idx) =>
                  editItem && editItem.id === tpl.id && editItem.idx === idx ? (
                    <li key={idx}>
                      <EditField
                        value={editText}
                        onChange={setEditText}
                        onSubmit={(v) => renameItem(tpl, idx, v)}
                        onCancel={() => setEditItem(null)}
                        autoFocus
                        ariaLabel={t.todos.templateItems}
                      />
                    </li>
                  ) : (
                    <li key={idx} className="todo-tpl__item">
                      <button
                        type="button"
                        className="todo-tpl__item-name"
                        onClick={() => {
                          setEditItem({ id: tpl.id, idx })
                          setEditText(item)
                        }}
                        aria-label={t.todos.edit}
                      >
                        {item}
                      </button>
                      <ItemReorder
                        onUp={() => moveItem(tpl, idx, 'up')}
                        onDown={() => moveItem(tpl, idx, 'down')}
                        upDisabled={idx === 0}
                        downDisabled={idx === tpl.items.length - 1}
                        upLabel={t.operator.moveUp}
                        downLabel={t.operator.moveDown}
                      />
                      <RowActions onDelete={() => removeItem(tpl, idx)} deleteLabel={`${t.common.delete} — ${item}`} />
                    </li>
                  ),
                )}
              </ul>

              <EditField
                value={newItem[tpl.id] ?? ''}
                onChange={(v) => setNewItem((m) => ({ ...m, [tpl.id]: v }))}
                onSubmit={() => addItem(tpl)}
                submitLabel={t.todos.addItem}
                submitLeadingIcon="plus-bold"
                placeholder={t.todos.addItem}
                ariaLabel={t.todos.addItem}
              />
            </li>
          ))}
        </ul>
      )}

      <div className="todo-tpl__new">
        <EditField
          value={newName}
          onChange={setNewName}
          onSubmit={() => addTemplate()}
          submitLabel={t.todos.addTemplate}
          submitLeadingIcon="plus-bold"
          placeholder={t.todos.templateNamePlaceholder}
          ariaLabel={t.todos.templateName}
        />
      </div>
    </section>
  )
}

// Small ↑/↓ reorder pair (the shared EditField already has one, but the static
// item row isn't an EditField). Mirrors the EditField reorder buttons + classes.
function ItemReorder({
  onUp,
  onDown,
  upDisabled,
  downDisabled,
  upLabel,
  downLabel,
}: {
  onUp: () => void
  onDown: () => void
  upDisabled?: boolean
  downDisabled?: boolean
  upLabel: string
  downLabel: string
}) {
  return (
    <div className="edit-field__reorder">
      <button type="button" className="edit-field__mini" onClick={onUp} disabled={upDisabled} aria-label={upLabel}>
        <Icon name="caret-up-bold" size={16} />
      </button>
      <button type="button" className="edit-field__mini" onClick={onDown} disabled={downDisabled} aria-label={downLabel}>
        <Icon name="caret-down-bold" size={16} />
      </button>
    </div>
  )
}
