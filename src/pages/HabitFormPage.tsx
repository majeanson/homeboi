import { useNavigate, useParams } from 'react-router-dom'
import '../styles/habits.css'
import { FormScene, toFace } from '../components/FormScene'
import { HabitForm } from '../components/forms/HabitForm'
import { useT } from '../i18n'
import { useHabits } from '../lib/habits'

// /habitude/new + /habitude/:id/edit — « Mes habitudes » create/edit as a
// full-screen scene (a tall form strands its inputs under the mobile keyboard in
// a sheet; FORM_ROUTES is the convention). Operator-only + guest-bounced by
// FormScene. Saving returns to the check-in scene, which is where a habit lives.
export function HabitFormPage() {
  const t = useT()
  const nav = useNavigate()
  const { id } = useParams()
  const { data } = useHabits()
  const habit = id ? (data?.habits.find((h) => h.id === id) ?? null) : null

  const back = () => nav('/board/habitudes', { replace: true })

  return (
    <FormScene title={id ? t.habits.edit : t.habits.add} icon="repeat-bold" fallback="/board/habitudes">
      {(members, close) => (
        <HabitForm
          // Re-init the fields once the edited habit arrives from the cache/poll.
          key={habit?.id ?? 'new'}
          faces={members.map(toFace)}
          value={habit}
          onSaved={id ? back : close}
          onDeleted={back}
          onCancel={close}
        />
      )}
    </FormScene>
  )
}
