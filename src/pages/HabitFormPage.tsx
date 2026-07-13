import { useNavigate, useParams } from 'react-router-dom'
import '../styles/habits.css'
import { FormScene, toFace } from '../components/FormScene'
import { HabitForm } from '../components/forms/HabitForm'
import { useT } from '../i18n'
import { useHabits } from '../lib/habits'

// /habitude/new + /habitude/:id/edit — « Mes habitudes » create/edit as a
// full-screen scene (a tall form strands its inputs under the mobile keyboard in
// a sheet; FORM_ROUTES is the convention). Operator-only + guest-bounced by
// FormScene. Saving RETURNS WHERE YOU CAME FROM (FormScene's useSceneClose, like
// EventFormPage) — the fallback is the check-in scene, so the common edit-from-
// check-in path lands there anyway, while a deep-linked edit (a guide « Régler »,
// a board card) no longer teleports to /board/habitudes. Deleting still goes to
// the check-in scene: the habit's own context may not exist any more.
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
          onSaved={close}
          onDeleted={back}
          onCancel={close}
        />
      )}
    </FormScene>
  )
}
