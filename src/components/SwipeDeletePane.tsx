import { Icon } from './Icon'

// The red "delete" pane `useSwipeToDelete` (lib/useSwipeToDelete.ts) reveals behind
// a `.list-row` as the foreground slides left. The hook owns the BEHAVIOUR; this
// owns the PANE, so the markup can't drift between callers (it was hand-copied in
// La liste and Ajout rapide — ACTIONS.md Wave C). Inert and aria-hidden on purpose:
// the swipe drives it, and every caller keeps a real non-touch mirror (RowActions,
// an edit sheet's Delete). Styled by `.list-row__del*` (styles/sheets/list-actions.css).
export function SwipeDeletePane({ label }: { label: string }) {
  return (
    <span className="list-row__del" aria-hidden="true">
      <span className="list-row__del-icon">
        <Icon name="trash-bold" size={18} />
      </span>
      <span className="list-row__del-label">{label}</span>
    </span>
  )
}
