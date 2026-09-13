import { useState } from 'react'
import { useT } from '../../i18n'
import { useWrite } from '../../lib/write'
import { TODO_TEMPLATES_KEY } from '../../lib/queryKeys'
import {
  type TodoTemplate,
  type TemplateItem,
  toStored,
  expandTemplate,
  expandSectioned,
  wouldCycle,
  TODO_TITLE_MAX,
  TODO_TEMPLATE_TITLE_MAX,
} from '../../lib/todos'
import { EditField } from '../EditField'
import { RowActions } from '../RowActions'
import { Icon } from '../Icon'
import { Reorder } from '../Reorder'
import { EmptyState } from '../EmptyState'
import { Modal } from '../Modal'

// The body of ONE « liste à compléter » — rename, its ordered items (plain labels
// and references to other lists), the two adders, and the « Voir la liste finale »
// preview. It used to be inlined once per template inside Réglages ▸ Maison, so a
// household with four lists met four open editors stacked down the panel; the
// section is now one short row per list and this editor opens as its own scene
// (/liste-modele/:id, TodoTemplatePage) behind the row's ✏. Same writes, same
// classes — only the place it renders moved.
//
// Each edit PATCHes the whole items array (small, operator-driven).
export function TemplateEditor({ templates, tpl }: { templates: TodoTemplate[]; tpl: TodoTemplate }) {
  const t = useT()
  const write = useWrite()
  // Inline item edit: which index is open + its draft text.
  const [editIdx, setEditIdx] = useState<number | null>(null)
  const [editText, setEditText] = useState('')
  const [newItem, setNewItem] = useState('')
  const [preview, setPreview] = useState(false)

  // Lists this one may include without looping (self + cyclic deps filtered).
  const candidates = templates.filter((c) => !wouldCycle(templates, tpl.id, c.id))

  const saveItems = (items: TemplateItem[]) =>
    void write('todo-templates', {
      method: 'PATCH',
      body: { id: tpl.id, items: toStored(items) },
      affectedKeys: [TODO_TEMPLATES_KEY],
    }).catch(() => {})

  function renameTemplate(title: string) {
    const v = title.trim()
    if (!v || v === tpl.title) return
    void write('todo-templates', {
      method: 'PATCH',
      body: { id: tpl.id, title: v },
      affectedKeys: [TODO_TEMPLATES_KEY],
    }).catch(() => {})
  }
  function addItem() {
    const label = newItem.trim()
    if (!label) return
    setNewItem('')
    saveItems([...tpl.items, { kind: 'item', label }])
  }
  function includeList(refId: string) {
    if (!refId) return
    saveItems([...tpl.items, { kind: 'ref', refId }])
  }
  function removeItem(idx: number) {
    saveItems(tpl.items.filter((_, i) => i !== idx))
  }
  function renameItem(idx: number, label: string) {
    const v = label.trim()
    setEditIdx(null)
    if (!v) return
    saveItems(tpl.items.map((x, i) => (i === idx ? { kind: 'item', label: v } : x)))
  }
  function moveItem(idx: number, dir: 'up' | 'down') {
    const j = dir === 'up' ? idx - 1 : idx + 1
    if (j < 0 || j >= tpl.items.length) return
    const next = [...tpl.items]
    ;[next[idx], next[j]] = [next[j], next[idx]]
    saveItems(next)
  }

  return (
    <div className="todo-tpl-edit">
      <input
        className="input todo-tpl__name"
        defaultValue={tpl.title}
        onBlur={(e) => renameTemplate(e.target.value)}
        aria-label={t.todos.templateName}
        maxLength={TODO_TEMPLATE_TITLE_MAX}
      />

      {tpl.items.length === 0 ? (
        <EmptyState tone="calm">{t.todos.noItems}</EmptyState>
      ) : (
        <ul className="todo-tpl__items">
          {tpl.items.map((it, idx) => {
            const reorder = (
              <Reorder
                onUp={() => moveItem(idx, 'up')}
                onDown={() => moveItem(idx, 'down')}
                upDisabled={idx === 0}
                downDisabled={idx === tpl.items.length - 1}
                upLabel={t.operator.moveUp}
                downLabel={t.operator.moveDown}
              />
            )
            // A reference to another list — a chip with its name + expanded count.
            if (it.kind === 'ref') {
              const ref = templates.find((x) => x.id === it.refId)
              return (
                <li key={idx} className="todo-tpl__item todo-tpl__item--ref">
                  <span className="todo-tpl__ref">
                    <Icon name="link-bold" size={15} />
                    {ref ? ref.title : t.todos.listDeleted}
                    {ref && <em className="mono">{t.todos.templateItemsCount(expandTemplate(templates, ref.id).length)}</em>}
                  </span>
                  {reorder}
                  <RowActions onDelete={() => removeItem(idx)} deleteLabel={`${t.common.delete} — ${ref?.title ?? ''}`} />
                </li>
              )
            }
            // A plain item — tap to edit inline.
            return editIdx === idx ? (
              <li key={idx}>
                <EditField
                  value={editText}
                  onChange={setEditText}
                  onSubmit={(v) => renameItem(idx, v)}
                  onCancel={() => setEditIdx(null)}
                  autoFocus
                  ariaLabel={t.todos.templateItems}
                  // An item label BECOMES a todo title on instantiation, so it
                  // carries the todos cap, warned about up front.
                  limit={TODO_TITLE_MAX}
                />
              </li>
            ) : (
              <li key={idx} className="todo-tpl__item">
                <button
                  type="button"
                  className="todo-tpl__item-name"
                  onClick={() => {
                    setEditIdx(idx)
                    setEditText(it.label)
                  }}
                  aria-label={`${t.common.edit} — ${it.label}`}
                >
                  {it.label}
                </button>
                {reorder}
                <RowActions
                  onEdit={() => {
                    setEditIdx(idx)
                    setEditText(it.label)
                  }}
                  onDelete={() => removeItem(idx)}
                  editLabel={`${t.common.edit} — ${it.label}`}
                  deleteLabel={`${t.common.delete} — ${it.label}`}
                />
              </li>
            )
          })}
        </ul>
      )}

      <div className="todo-tpl__adders">
        <EditField
          value={newItem}
          onChange={setNewItem}
          onSubmit={() => addItem()}
          submitIcon="plus-bold"
          placeholder={t.todos.addItem}
          ariaLabel={t.todos.addItem}
          limit={TODO_TITLE_MAX}
        />
        {/* Include another list as a section (cyclic choices filtered out). */}
        {candidates.length > 0 && (
          <select
            className="input todo-tpl__include"
            value=""
            onChange={(e) => {
              includeList(e.target.value)
              e.currentTarget.value = ''
            }}
            aria-label={t.todos.includeList}
          >
            <option value="">{t.todos.includeList}</option>
            {candidates.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* « Voir la liste finale » — a read-only preview of the flattened, sectioned
          result (how it lands when added), mirroring the « Avant de partir »
          departure view. Only worth showing once the list has content. */}
      {tpl.items.length > 0 && (
        <button type="button" className="btn btn--sm todo-tpl__preview" onClick={() => setPreview(true)}>
          <Icon name="check-square-bold" size={16} /> {t.todos.previewFinal}
        </button>
      )}

      {preview && <TemplatePreview templates={templates} id={tpl.id} onClose={() => setPreview(false)} />}
    </div>
  )
}

// Read-only "how it will look once added" preview — the flattened, sectioned result
// (expandSectioned mirrors the server's instantiation) rendered like the real « À
// compléter » list: hollow check discs + section headers. A composed list shows its
// one section header; a plain list is a headless run.
function TemplatePreview({ templates, id, onClose }: { templates: TodoTemplate[]; id: string; onClose: () => void }) {
  const t = useT()
  const tpl = templates.find((x) => x.id === id)
  const rows = tpl ? expandSectioned(templates, id) : []
  // Collapse consecutive same-section rows into groups so each header prints once.
  const groups: { section: string | null; labels: string[] }[] = []
  for (const r of rows) {
    const last = groups[groups.length - 1]
    if (last && last.section === r.section) last.labels.push(r.label)
    else groups.push({ section: r.section, labels: [r.label] })
  }
  return (
    <Modal open onClose={onClose} title={tpl?.title} className="todo-preview-modal">
      <p className="todo-preview__hint">{t.todos.previewHint}</p>
      {rows.length === 0 ? (
        <EmptyState tone="calm">{t.todos.empty}</EmptyState>
      ) : (
        <div className="todo-preview">
          {groups.map((g, gi) => (
            <div key={gi} className="todo-preview__group">
              {g.section && <div className="todo-preview__section mono">{g.section}</div>}
              {g.labels.map((label, i) => (
                <div key={i} className="todo-preview__row">
                  <span className="todo-preview__check" aria-hidden="true" />
                  <span className="todo-preview__label">{label}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </Modal>
  )
}
