import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useParams, useSearchParams } from 'react-router-dom'
import { loadStateOf } from '../components/Fallback'
import { FormDelete } from '../components/FormDelete'
import { FormScene } from '../components/FormScene'
import { ChoreForm, type ChoreInit } from '../components/forms/ChoreForm'
import { useChoreRemovals } from '../components/detail/EntityRemovals'
import { useT } from '../i18n'
import { useOperatorT } from '../i18n.operator'
import { api } from '../lib/api'
import { MONTH_KEY, BOARD_KEY, CHORES_KEY, TASKS_KEY } from '../lib/queryKeys'

// /chore/new adds a task as a full-screen scene (tall forms strand under the mobile keyboard
// in a sheet); /chore/:id edits one, the door every peek's « Modifier » opens now that tasks
// left Réglages. `?start=<sec>` (local-midnight) pre-fills the recurrence anchor when opened
// from the calendar.
export function ChoreFormPage() {
  const t = useT()
  const o18n = useOperatorT()
  const qc = useQueryClient()
  const { id } = useParams()
  const [params] = useSearchParams()
  const removals = useChoreRemovals()
  const startSeed = Number(params.get('start'))
  const q = useQuery({ queryKey: CHORES_KEY, queryFn: () => api<{ chores: ChoreInit[] }>('chores'), enabled: !!id })
  const chore = id ? q.data?.chores.find((c) => c.id === id) : undefined
  const wait = id && !chore ? loadStateOf(q) : null
  return (
    <FormScene card="set-chores" title={id ? o18n.editChore : o18n.addChore} icon="hand-heart-bold" fallback="/board?view=taches" kiosk={!!id}>
      {(members, close) =>
        wait ?? (
          <>
            <ChoreForm
              key={chore?.id ?? 'new'}
              members={members}
              value={chore}
              initialStart={Number.isFinite(startSeed) && startSeed > 0 ? startSeed : undefined}
              onSaved={() => {
                qc.invalidateQueries({ queryKey: BOARD_KEY })
                qc.invalidateQueries({ queryKey: CHORES_KEY })
                qc.invalidateQueries({ queryKey: TASKS_KEY })
                qc.invalidateQueries({ queryKey: MONTH_KEY }) // refresh the calendar + day page
                close()
              }}
            />
            {chore && (
              <FormDelete
                label={t.detail.deleteChoreLabel}
                onDelete={() => {
                  removals.removeChore({ id: chore.id, title: chore.title })
                  close()
                }}
              />
            )}
          </>
        )
      }
    </FormScene>
  )
}
