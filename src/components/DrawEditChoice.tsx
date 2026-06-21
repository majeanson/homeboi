import { Modal } from './Modal'
import { Icon, type IconName } from './Icon'
import { useT } from '../i18n'

// #14 — the small choice shown when you tap an existing drawing to keep working on
// it. Three ways to continue, so re-opening a kept drawing is no longer ALWAYS a
// trace-over (the old "filigrane" feel):
//   • modify — edit the real drawing IN PLACE (rebuilds its editable layers).
//   • copy   — start an identical, fully-editable COPY; the original is untouched.
//   • trace  — load the original as a faded « calque » to redraw over; saved as new.
// The caller maps the mode to the right load + save target (PATCH in place vs POST
// new) and passes `filigrane` to DrawPad for the trace case. General-audience: a
// toddler keeping their own art gets the same three, big tap targets.
export type DrawEditMode = 'modify' | 'copy' | 'trace'

const OPTS: { mode: DrawEditMode; icon: IconName }[] = [
  { mode: 'modify', icon: 'pencil-simple-bold' },
  { mode: 'copy', icon: 'image-square-bold' },
  { mode: 'trace', icon: 'book-open-bold' },
]

export function DrawEditChoice({
  open,
  onPick,
  onCancel,
}: {
  open: boolean
  onPick: (mode: DrawEditMode) => void
  onCancel: () => void
}) {
  const t = useT()
  const label = (m: DrawEditMode) =>
    m === 'modify' ? t.memo.editChoiceModify : m === 'copy' ? t.memo.editChoiceCopy : t.memo.editChoiceTrace
  const hint = (m: DrawEditMode) =>
    m === 'modify' ? t.memo.editChoiceModifyHint : m === 'copy' ? t.memo.editChoiceCopyHint : t.memo.editChoiceTraceHint
  return (
    <Modal open={open} onClose={onCancel} title={t.memo.editChoiceTitle} className="draw-choice">
      <p className="draw-choice__sub">{t.memo.editChoiceSub}</p>
      <div className="draw-choice__opts">
        {OPTS.map((o) => (
          <button key={o.mode} type="button" className="draw-choice__opt" onClick={() => onPick(o.mode)}>
            <Icon name={o.icon} size={26} />
            <span className="draw-choice__label">{label(o.mode)}</span>
            <span className="draw-choice__hint">{hint(o.mode)}</span>
          </button>
        ))}
      </div>
    </Modal>
  )
}
