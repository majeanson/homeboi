import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Navigate, useLocation, useParams } from 'react-router-dom'
import { FormScene } from '../components/FormScene'
import { RoutineForm, type RoutineInit } from '../components/forms/RoutineForm'
import { EntityShareModal } from '../components/EntityShareModal'
import type { RoutineSeed } from '../lib/drawingToRoutine'
import { Loading } from '../components/Fallback'
import { api } from '../lib/api'
import { useAuth } from '../lib/auth'
import { useWrite } from '../lib/write'
import { useConfirm } from '../lib/confirm'
import { ROUTINES_KEY } from '../lib/queryKeys'
import { CATS } from '../lib/cats'
import { useT } from '../i18n'

// /routine/new — build a kid routine; /routine/:id — edit one in place. Both are
// full-screen scenes (the form was the worst sheet offender: name + member chips +
// template + the whole picture-card deck, all shoved under the mobile keyboard).
// The Routines ＋ picker is the entry to both (new, or pick a routine to modify);
// Réglages + the board ＋ tile still create via /routine/new. Tapping a routine CARD
// runs it, so this scene is also where « Partager » lives (the routine-card peek that
// used to host it is gone — see components/detail/adapters).
export function RoutineFormPage() {
  const t = useT()
  const qc = useQueryClient()
  const write = useWrite()
  const confirm = useConfirm()
  const { signedIn } = useAuth()
  const { id } = useParams()
  const location = useLocation()
  const editing = !!id
  const [sharing, setSharing] = useState(false)
  // A drawing handed off from DrawPad seeds the first card's photo (#14 → #17 C).
  const seed = (location.state as { routineSeed?: RoutineSeed } | null)?.routineSeed ?? null

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
      fallback="/maison"
    >
      {(members, close) => {
        // Still loading the routine to edit → wait; loaded but gone (deleted from
        // another device) → bounce back to the tab rather than show a blank form.
        if (editing && !routine) return data ? <Navigate to="/maison" replace /> : <Loading />
        // Delete from the same scene that edits it (no trip to Réglages ▸ Corvées).
        // A weighty confirm (useConfirm), then a DELETE via useWrite so an offline
        // tap queues to the outbox, then back to the tab.
        const onDelete =
          routine &&
          (async () => {
            const ok = await confirm({
              message: t.routines.deleteConfirm(routine.name),
              confirmLabel: t.routines.delete,
              tone: 'danger',
            })
            if (!ok) return
            await write('routines', { method: 'DELETE', body: { id: routine.id }, affectedKeys: [ROUTINES_KEY] })
            qc.invalidateQueries({ queryKey: ROUTINES_KEY })
            close()
          })
        return (
          <>
            <RoutineForm
              members={members}
              value={routine}
              seed={editing ? null : seed}
              onSaved={() => {
                qc.invalidateQueries({ queryKey: ROUTINES_KEY })
                close()
              }}
              onDelete={onDelete || undefined}
              // « Partager » — operator only (minting the link is a server write).
              onShare={routine && signedIn ? () => setSharing(true) : undefined}
            />
            {routine && sharing && (
              <EntityShareModal
                open
                onClose={() => setSharing(false)}
                title={`${t.shareLink.action} · ${routine.name}`}
                body={{ kind: 'routine', routineId: routine.id }}
              />
            )}
          </>
        )
      }}
    </FormScene>
  )
}
