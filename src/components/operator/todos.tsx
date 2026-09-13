import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { useT } from '../../i18n'
import { type HelpMode } from '../../lib/helpMode'
import { api } from '../../lib/api'
import { useWrite } from '../../lib/write'
import { live } from '../../lib/query'
import { useRecordUndo } from '../../lib/toast'
import { isGuest } from '../../lib/device'
import { TODO_TEMPLATES_KEY } from '../../lib/queryKeys'
import { type TemplatesData, type TodoTemplate, toStored, expandSectioned, TODO_TEMPLATE_TITLE_MAX } from '../../lib/todos'
import { EditField } from '../EditField'
import { ListRow } from '../ListRow'
import { RowActions } from '../RowActions'
import { EmptyState } from '../EmptyState'
import { OperatorSection } from './OperatorSection'

// Réglages ▸ Maison ▸ Tâches de la maison ▸ À compléter. Reusable check-off checklists
// ("Avant de partir", "Chez grand-papa"): a title + an ordered list of items. An item
// is a plain label OR a reference to ANOTHER list (compose lists from lists).
// Instantiating a composed list flattens to one todo list grouped BY SECTION — each
// included list becomes a section (see src/lib/todos.ts expandSectioned).
//
// This section is a SHORT ROW PER LIST, not the editors themselves: name + how many
// items it lands, with the ✏ that opens the one editor as a scene (/liste-modele/:id).
// It used to render every list's full editor open at once — name field, every item
// with its ↑↓/✏/🗑, two adders and a preview button, stacked — so four lists made a
// wall of fields you scrolled past to reach the one you came for, and nothing on the
// panel told you at a glance what lists you even had. Deletes stay here (a row's 🗑,
// behind the app-wide undo); everything that EDITS a list lives on its scene.
export function TodoTemplatesSection({ help }: { help?: HelpMode }) {
  const t = useT()
  const nav = useNavigate()
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

  const open = (tpl: TodoTemplate) => nav(`/liste-modele/${tpl.id}`)

  // A brand-new list is empty by definition, so creating one and staying here would
  // leave you looking at a row with nothing in it: the create hands straight over to
  // the editor scene. Offline the server id isn't known yet (the write is queued), so
  // the row simply appears in the list and waits for its ✏.
  async function addTemplate() {
    const name = newName.trim()
    if (!name) return
    setNewName('')
    const res = await write<{ id?: string }>('todo-templates', {
      method: 'POST',
      body: { title: name, items: [] },
      affectedKeys: [TODO_TEMPLATES_KEY],
    }).catch(() => null)
    const id = res && !res.queued ? res.data?.id : undefined
    if (id) nav(`/liste-modele/${id}`)
  }

  // Delete now, with a COMPENSATING undo that re-creates the template (a new id,
  // same title + items) — the list is live-polled, so a deferred hold would fight
  // the refetch; re-create is the clean reversal. NOTE: a new id means any OTHER
  // list that referenced this one keeps a now-dangling ref (skipped at instantiate).
  function removeTemplate(tpl: TodoTemplate) {
    void write('todo-templates', { method: 'DELETE', body: { id: tpl.id }, affectedKeys: [TODO_TEMPLATES_KEY] }).catch(() => {})
    recordUndo({
      message: t.todos.removed(tpl.title),
      onUndo: () =>
        void write('todo-templates', {
          method: 'POST',
          body: { title: tpl.title, items: toStored(tpl.items) },
          affectedKeys: [TODO_TEMPLATES_KEY],
        }).catch(() => {}),
    })
  }

  if (ro) return null

  return (
    <OperatorSection title={t.todos.templatesTitle} help={help} helpKey="todoTemplates">
      {templates.length === 0 ? (
        <EmptyState guide={{ card: 'todos' }}>{t.todos.noTemplates}</EmptyState>
      ) : (
        <ul className="operator__list todo-tpl-rows">
          {templates.map((tpl) => (
            <li key={tpl.id}>
              <ListRow
                // The real instantiated size (flattened + sectioned), so the count
                // on the row is what you actually get when you add the list.
                title={
                  <button type="button" className="todo-tpl-row__name" onClick={() => open(tpl)}>
                    {tpl.title}
                  </button>
                }
                subtitle={t.todos.templateItemsCount(expandSectioned(templates, tpl.id).length)}
                actions={
                  <RowActions
                    onEdit={() => open(tpl)}
                    onDelete={() => removeTemplate(tpl)}
                    editLabel={`${t.common.edit} — ${tpl.title}`}
                    deleteLabel={`${t.common.delete} — ${tpl.title}`}
                  />
                }
              />
            </li>
          ))}
        </ul>
      )}

      <div className="todo-tpl__new">
        <EditField
          value={newName}
          onChange={setNewName}
          onSubmit={() => void addTemplate()}
          submitLabel={t.todos.addTemplate}
          submitLeadingIcon="plus-bold"
          placeholder={t.todos.templateNamePlaceholder}
          ariaLabel={t.todos.templateName}
          limit={TODO_TEMPLATE_TITLE_MAX}
        />
      </div>
    </OperatorSection>
  )
}
