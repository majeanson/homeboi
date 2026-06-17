import { useQueryClient } from '@tanstack/react-query'
import { FormScene } from '../components/FormScene'
import { RoutineForm } from '../components/forms/RoutineForm'
import { CATS } from '../lib/cats'
import { useT } from '../i18n'

// /routine/new — build a kid routine as a full-screen scene (was the worst sheet
// offender: name + member chips + template + the whole picture-card deck, all
// shoved under the mobile keyboard). Editing a routine still happens inline in
// Réglages ▸ Routines; this is the create path the ＋ uses.
export function RoutineFormPage() {
  const t = useT()
  const qc = useQueryClient()
  return (
    <FormScene title={t.routines.add} icon={CATS.routine.icon} fallback="/routines">
      {(members, close) => (
        <RoutineForm
          members={members}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ['routines'] })
            qc.invalidateQueries({ queryKey: ['board'] })
            close()
          }}
        />
      )}
    </FormScene>
  )
}
