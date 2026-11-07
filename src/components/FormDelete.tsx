import { InlineIcon } from './Icon'

// « Supprimer » under an edit form (a rendez-vous, a task). One danger button, full width like
// the form's own buttons, so the door to remove a wrong entry sits where the entry is being
// looked at. The peek offers the same one elsewhere.
export function FormDelete({ label, onDelete }: { label: string; onDelete: () => void }) {
  return (
    <div className="day-plan__form-delete">
      <button type="button" className="btn btn--danger" onClick={onDelete}>
        <InlineIcon name="trash-bold" /> {label}
      </button>
    </div>
  )
}
