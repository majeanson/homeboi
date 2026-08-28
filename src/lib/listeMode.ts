import { createModeStore } from './surfaceMode'

// « La liste » — SIMPLE (default) vs AVANCÉ, one device-local flag. The same shape
// and the same reasoning as [[notesMode]] (src/lib/notesMode.ts), deliberately: two
// lists that behave the same way should be learned once.
//
// SIMPLE is the shopping face. A row is a picture, a name and a check — nothing
// else competing for the thumb in a grocery aisle. Editing is still one gesture
// away (press and hold a row), and the picture opens the flyer clipping.
//
// AVANCÉ puts the explicit ✏️/🗑 back on every row. It is not decoration: a
// long-press is invisible to a mouse and unreachable from a keyboard, so this
// toggle IS the non-touch door to editing (CLAUDE.md: never leave a touch gesture
// as the only path to an action). Whoever tidies the list on a laptop lives here.
//
// DEVICE-LOCAL, so a guest may flip it — a localStorage presentation preference is
// not a household write, and gating one on isGuest() is what once hid the whole
// in-app guide from the demo. A wall kiosk and a phone each keep their own answer.
const store = createModeStore('babillard-liste-advanced')

/** Live: is this device on the advanced (row-actions) list face? */
export const useListeAdvanced = store.use
export const setListeAdvanced = store.set
