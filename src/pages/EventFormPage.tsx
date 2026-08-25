import { useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { FormScene } from '../components/FormScene'
import { EventForm } from '../components/forms/EventForm'
import { useT } from '../i18n'
import { MONTH_KEY, BOARD_KEY, EVENTS_KEY, CAR_KEY } from '../lib/queryKeys'

// /event/new — add a rendez-vous as a full-screen scene (was a sheet form; tall
// forms strand under the mobile keyboard there). Editing an event still happens
// inline in Réglages ▸ Agenda; this is the create path the ＋ uses. `?date=<sec>`
// (local-midnight) pre-fills the date when opened from the calendar's day page.
export function EventFormPage() {
  const t = useT()
  const qc = useQueryClient()
  const [params] = useSearchParams()
  const dateSeed = Number(params.get('date'))
  // ?ride=1 (the ＋ "Ajouter un trajet" tile / the /voiture add) opens the form as a
  // ride: the Transport block expanded + the household car pre-picked.
  const ride = params.get('ride') === '1'
  // ?activity=1 (the ＋ « Activité » tile) opens the form as a recurring kid
  // commitment: weekly recurrence + the logistics block (car · passengers · à
  // apporter) expanded.
  const activity = params.get('activity') === '1'
  return (
    <FormScene title={activity ? t.operator.addActivity : ride ? t.auto.addRide : t.operator.addEvent} icon="calendar-blank-bold" fallback="/board">
      {(members, close) => (
        <EventForm
          members={members}
          defaultRide={ride}
          defaultActivity={activity}
          initialDate={Number.isFinite(dateSeed) && dateSeed > 0 ? dateSeed : undefined}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: BOARD_KEY })
            qc.invalidateQueries({ queryKey: EVENTS_KEY })
            qc.invalidateQueries({ queryKey: MONTH_KEY }) // refresh the calendar + day page
            qc.invalidateQueries({ queryKey: CAR_KEY }) // …and « L'auto », if it takes the car
            close()
          }}
        />
      )}
    </FormScene>
  )
}
