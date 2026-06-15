import { useQueryClient } from '@tanstack/react-query'
import { FormScene } from '../components/FormScene'
import { EventForm } from '../components/forms/EventForm'
import { useT } from '../i18n'

// /event/new — add a rendez-vous as a full-screen scene (was a sheet form; tall
// forms strand under the mobile keyboard there). Editing an event still happens
// inline in Réglages ▸ Agenda; this is the create path the ＋ uses.
export function EventFormPage() {
  const t = useT()
  const qc = useQueryClient()
  return (
    <FormScene title={t.operator.addEvent} icon="calendar-blank-bold" fallback="/board">
      {(members, close) => (
        <EventForm
          members={members}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ['board'] })
            qc.invalidateQueries({ queryKey: ['events'] })
            close()
          }}
        />
      )}
    </FormScene>
  )
}
