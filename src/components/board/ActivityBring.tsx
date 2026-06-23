import { useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { live } from '../../lib/query'
import { useWrite } from '../../lib/write'
import { useT } from '../../i18n'
import { TODO_TEMPLATES_KEY, TODOS_KEY, MONTH_KEY } from '../../lib/queryKeys'
import { type TemplatesData, expandTemplate } from '../../lib/todos'
import { Icon } from '../Icon'

interface BringEvent {
  id: string
  title: string
  bring_template_id?: string | null
}

// « À apporter » — the bring-lists for the day's activities, surfaced in « Avant de
// partir ». An activity is a recurring event with a `bring_template_id` (a saved
// todo_templates list); here we just read those templates and show their items per
// activity (« Soccer de Léa — souliers · gourde · chandail »). One tap « Ajouter à
// cocher » instantiates the list onto the day as real, tickable todos — the SAME
// POST /api/todos {templateId, day} the departure checklist's TodoSection uses — so
// nothing is written until the parent asks. Renders nothing when no activity that
// day carries a bring-list. Reuses `expandTemplate` (lib/todos) + the template cache.
export function ActivityBring({ events, day }: { events: BringEvent[]; day: number }) {
  const t = useT()
  const write = useWrite()
  const withBring = events.filter((e) => e.bring_template_id)
  const templates =
    useQuery({
      queryKey: TODO_TEMPLATES_KEY,
      queryFn: () => api<TemplatesData>('todo-templates'),
      ...live,
      enabled: withBring.length > 0,
    }).data?.templates ?? []

  const sections = withBring
    .map((e) => ({ e, items: e.bring_template_id ? expandTemplate(templates, e.bring_template_id) : [] }))
    .filter((s) => s.items.length > 0)
  if (sections.length === 0) return null

  const add = (templateId: string) =>
    write('todos', { method: 'POST', body: { templateId, day }, affectedKeys: [TODOS_KEY, MONTH_KEY] }).catch(() => {})

  return (
    <section className="departure__bring">
      <h2 className="departure__h mono">{t.departure.bring}</h2>
      {sections.map(({ e, items }) => (
        <div key={e.id} className="departure__bring-act">
          <div className="departure__bring-head">
            <span className="departure__bring-title">{e.title}</span>
            <button type="button" className="btn btn--sm mono" onClick={() => add(e.bring_template_id!)}>
              <Icon name="plus-bold" size={14} /> {t.departure.bringAdd}
            </button>
          </div>
          <p className="departure__bring-items mono">{items.join(' · ')}</p>
        </div>
      ))}
    </section>
  )
}
