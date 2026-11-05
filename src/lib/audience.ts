// Who is looking at this surface right now. THREE lenses off the SAME data (a
// presentation axis, NOT a permission boundary — auth still gates writes
// server-side):
//   • `parent`  — a capable reader; the full app.
//   • `toddler` — a PRE-reader (a three-year-old): picture-first, big targets,
//     read-aloud, no required reading, no settings.
//   • `simple`  — a POST-reader (bmad/08 A-1, the "grandma" lens): a capable
//     adult who reads fine but wants calm, large, spoken. The toddler machinery
//     pointed at the OTHER end of life — real words + full capability (she gets
//     the PARENT views on every tab), but ~1.4× type, a four-giant-tile board,
//     tap-to-hear, no settings. Boots locked via `?simple=1` exactly like
//     `?kid=1`.
// Same shape as LangContext (src/i18n.ts): a global context persisted to
// localStorage, overridable by `?kid=1` / `?simple=1` so a wall tablet can boot
// locked into the toddler or simple view.
//
// `locked` is that kiosk lock: when the tablet booted with `?kid=1` OR
// `?simple=1`, the viewer must not flip back to the parent view or wander into
// Réglages. The switch and the settings tab hide, and /settings redirects away
// (PRD C5).
//
// `unlock()` is the adult escape hatch. Relaunching with `?kid=0` / `?simple=0`
// works in a browser tab, but an INSTALLED PWA has no address bar — so once
// latched, a locked kiosk has no way out. unlock() is the in-app equivalent: it
// clears the lock(s) and drops back to the parent lens. It sits behind an exit
// gate (a sustained long-press; toddler additionally needs a math challenge a
// pre-reader can't solve — a post-reader adult doesn't), so the one-way-door
// property holds for the child while an adult can still get out without a URL bar.
import { createContext, useContext } from 'react'

export type Audience = 'parent' | 'toddler' | 'simple'

export const AudienceContext = createContext<{
  audience: Audience
  setAudience: (a: Audience) => void
  locked: boolean
  unlock: () => void
  // `guestPreview` is the operator's read-only "act as a guest" mode — the third
  // option beside Parent|Toddler in Réglages. It lives in the context (not just
  // localStorage) so toggling it re-renders the tree and the read-only guards
  // (RowActions/EditField hide, `writeWith` refuses) take effect at once. Unlike a
  // link guest it does NOT lock Réglages, so the operator can switch back to Parent.
  guestPreview: boolean
  setGuestPreview: (on: boolean) => void
}>({
  audience: 'parent',
  setAudience: () => {},
  locked: false,
  unlock: () => {},
  guestPreview: false,
  setGuestPreview: () => {},
})

export const useAudience = () => useContext(AudienceContext)

// THE lens flags — the one place that says what each audience may SEE and DO.
//
// Before 2026-11-05 every surface compared `audience === '…'` for itself (46 sites), and
// the `simple` lens was gated by accident: three sites let it see the help layer
// (`!== 'toddler'`), six hid the edit doors from it (`=== 'parent'`) — per-file
// coincidences, not a rule. `lens-rule.test.ts` fails a new inline comparison; a surface
// reads a FLAG here and names what it is gating:
//
//   • toddler / simple / parent — WHICH VIEW renders (ToddlerBoard vs SimpleBoard vs the
//     full tab). Use these only to pick a view, never to hide a control.
//   • teaches — the comprehension layer: « ? » dots, EmptyState guide links, section
//     intros, the welcome card, the tour overlay. Off for a pre-reader (a dot she cannot
//     read is clutter), ON for `simple` (she reads fine; an explanation is calm).
//   • interrupts — things that arrive UNINVITED: the tour auto-offer, the habit check-in
//     prompt, the AI-error toast. Parent only: `simple` is the calm lens by contract and
//     a toddler cannot answer them.
//   • acts — the doors that change the household: edit / share / « Demander » / the
//     board's « À régler ». Off for a toddler; for `simple`, see the note on the flip.
//   • spoken — tap-to-hear is armed (toddler + simple, the two read-aloud lenses).
//
// Marc's decision (2026-11-05): teaches + acts ON for simple, interrupts OFF. `acts`
// landed in TWO commits so each was reviewable on its own: the first reproduced the
// old per-site behaviour exactly (parent only, 8686b535); this one flips it to
// `!toddler`, and e2e/lens-gates.spec.ts holds the table — it was red on the first
// commit's tree (the simple lens had no loupe) before this line changed.
//
// What `simple` gains by the flip, concretely: the hub-head loupe and « Demander »,
// « Modifier » / « Partager » on an event peek, the kitchen's row actions, the board's
// « À régler », and a recipe sheet that is no longer read-only. What it still never
// gets: the board-layout editor, Réglages when `locked`, and anything in `interrupts`.
export interface Lens {
  audience: Audience
  locked: boolean
  toddler: boolean
  simple: boolean
  parent: boolean
  teaches: boolean
  interrupts: boolean
  acts: boolean
  spoken: boolean
}

export function useLens(): Lens {
  const { audience, locked } = useAudience()
  const toddler = audience === 'toddler'
  const simple = audience === 'simple'
  const parent = audience === 'parent'
  return {
    audience,
    locked,
    toddler,
    simple,
    parent,
    teaches: !toddler,
    interrupts: parent,
    acts: !toddler,
    spoken: toddler || simple,
  }
}
