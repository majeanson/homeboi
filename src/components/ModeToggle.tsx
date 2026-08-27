import { Icon } from './Icon'

// The ⚙ SIMPLE ↔ AVANCÉ chip, shared by « Les notes » and « La liste ».
//
// Both tabs lean the same way: the default face is for READING/DOING (a row is its
// content and one action), and the advanced face puts the explicit ✏️/🗑 furniture
// back. Two tabs behaving alike should be learned once, so they share this control
// rather than each growing a lookalike.
//
// Two rules it encodes, so a third caller can't get them wrong:
//   • The accessible name says where the NEXT tap goes, never the current state —
//     the lit background already carries the state, and a name that reads "Avancé"
//     while sitting in Avancé is a coin-flip for a screen-reader user.
//   • It is device-local presentation, so it renders for a GUEST too. Gating a
//     localStorage preference on isGuest() is what once hid the whole in-app guide
//     from the public demo (CLAUDE.md, "The demo is a guest link").
//
// Lives in the eager shell (styles/kit.css), NOT in cercle.css: that sheet is
// imported lazily by the cercle/notes pages, so a class defined there renders
// unstyled anywhere else — which is exactly what happened when La liste first
// borrowed `.notes-mode`. Same reasoning as ShareModal's block beside it.
export function ModeToggle({
  advanced,
  onToggle,
  toSimple,
  toAdvanced,
  tint,
  className,
}: {
  advanced: boolean
  onToggle: () => void
  /** Accessible name while ADVANCED — i.e. what the next tap does: back to simple. */
  toSimple: string
  /** Accessible name while SIMPLE — what the next tap does: go advanced. */
  toAdvanced: string
  /** The lit colour when on. Defaults to the app accent; a tab passes its own tint
   *  (Notes teal, La liste marigold) so the control belongs to its section. */
  tint?: string
  className?: string
}) {
  const label = advanced ? toSimple : toAdvanced
  return (
    <button
      type="button"
      className={'mode-toggle' + (advanced ? ' is-on' : '') + (className ? ` ${className}` : '')}
      style={tint ? ({ '--mode-tint': tint } as React.CSSProperties) : undefined}
      onClick={onToggle}
      aria-pressed={advanced}
      aria-label={label}
      title={label}
    >
      <Icon name="gear-six-bold" size={16} />
    </button>
  )
}
