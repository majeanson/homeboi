import { useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { FormScene } from '../components/FormScene'
import { EventForm } from '../components/forms/EventForm'
import { useT } from '../i18n'

// /event/new — add a rendez-vous as a full-screen scene (was a sheet form; tall
// forms strand under the mobile keyboard there). Editing an event still happens
// inline in Réglages ▸ Agenda; this is the create path the ＋ uses. `?date=<sec>`
// (local-midnight) pre-fills the date when opened from the calendar's day page.
export function EventFormPage() {
  const t = useT()
  const qc = useQueryClient()
  const [params] = useSearchParams()
  const dateSeed = Number(params.get('date'))
  return (
    <FormScene title={t.operator.addEvent} icon="calendar-blank-bold" fallback="/board">
      {(members, close) => (
        <EventForm
          members={members}
          initialDate={Number.isFinite(dateSeed) && dateSeed > 0 ? dateSeed : undefined}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ['board'] })
            qc.invalidateQueries({ queryKey: ['events'] })
            qc.invalidateQueries({ queryKey: ['month'] }) // refresh the calendar + day page
            close()
          }}
        />
      )}
    </FormScene>
  )
}
