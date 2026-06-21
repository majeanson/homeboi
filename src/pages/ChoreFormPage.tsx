import { useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { FormScene } from '../components/FormScene'
import { ChoreForm } from '../components/forms/ChoreForm'
import { useT } from '../i18n'
import { MONTH_KEY } from '../lib/queryKeys'

// /chore/new — add a corvée as a full-screen scene (was a sheet form; tall forms
// strand under the mobile keyboard there). Editing a chore still happens inline
// in Réglages ▸ Corvées; this is the create path the ＋ uses. `?start=<sec>`
// (local-midnight) pre-fills the recurrence anchor when opened from the calendar.
export function ChoreFormPage() {
  const t = useT()
  const qc = useQueryClient()
  const [params] = useSearchParams()
  const startSeed = Number(params.get('start'))
  return (
    <FormScene title={t.operator.addChore} icon="hand-heart-bold" fallback="/board">
      {(members, close) => (
        <ChoreForm
          members={members}
          initialStart={Number.isFinite(startSeed) && startSeed > 0 ? startSeed : undefined}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ['board'] })
            qc.invalidateQueries({ queryKey: ['chores'] })
            qc.invalidateQueries({ queryKey: MONTH_KEY }) // refresh the calendar + day page
            close()
          }}
        />
      )}
    </FormScene>
  )
}
