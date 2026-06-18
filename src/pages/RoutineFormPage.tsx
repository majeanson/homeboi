import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Navigate, useParams } from 'react-router-dom'
import { FormScene } from '../components/FormScene'
import { RoutineForm, type RoutineInit } from '../components/forms/RoutineForm'
import { Loading } from '../components/Fallback'
import { api } from '../lib/api'
import { ROUTINES_KEY } from '../lib/queryKeys'
import { CATS } from '../lib/cats'
import { useT } from '../i18n'

// /routine/new — build a kid routine; /routine/:id — edit one in place. Both are
// full-screen scenes (the form was the worst sheet offender: name + member chips +
// template + the whole picture-card deck, all shoved under the mobile keyboard).
// The Routines ＋ picker is the entry to both (new, or pick a routine to modify);
// Réglages + the board ＋ tile still create via /routine/new.
export function RoutineFormPage() {
  const t = useT()
  const qc = useQueryClient()
  const { id } = useParams()
  const editing = !!id

  // Edit: prefill from the routine. The list is normally already cached from the
  // Routines tab; a cold deep-link fetches it. Create: no fetch.
  const { data } = useQuery({
    queryKey: ROUTINES_KEY,
    queryFn: () => api<{ routines: RoutineInit[] }>('routines'),
    enabled: editing,
  })
  const routine = editing ? data?.routines.find((r) => r.id === id) ?? null : null

  return (
    <FormScene
      title={editing ? t.routines.editTitle : t.routines.add}
      icon={CATS.routine.icon}
      fallback="/routines"
    >
      {(members, close) => {
        // Still loading the routine to edit → wait; loaded but gone (deleted from
        // another device) → bounce back to the tab rather than show a blank form.
        if (editing && !routine) return data ? <Navigate to="/routines" replace /> : <Loading />
        return (
          <RoutineForm
            members={members}
            value={routine}
            onSaved={() => {
              qc.invalidateQueries({ queryKey: ROUTINES_KEY })
              qc.invalidateQueries({ queryKey: ['board'] })
              close()
            }}
          />
        )
      }}
    </FormScene>
  )
}
