import { useQueryClient } from '@tanstack/react-query'
import { FormScene } from '../components/FormScene'
import { ChoreForm } from '../components/forms/ChoreForm'
import { useT } from '../i18n'

// /chore/new — add a corvée as a full-screen scene (was a sheet form; tall forms
// strand under the mobile keyboard there). Editing a chore still happens inline
// in Réglages ▸ Corvées; this is the create path the ＋ uses.
export function ChoreFormPage() {
  const t = useT()
  const qc = useQueryClient()
  return (
    <FormScene title={t.operator.addChore} icon="hand-heart-bold" fallback="/board">
      {(members, close) => (
        <ChoreForm
          members={members}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ['board'] })
            qc.invalidateQueries({ queryKey: ['chores'] })
            close()
          }}
        />
      )}
    </FormScene>
  )
}
