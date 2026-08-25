import { createDeviceStore } from './createDeviceStore'

// « Les notes » — SIMPLE (default) vs AVANCÉ, one device-local flag.
//
// The tab had accumulated furniture: a section title + subtitle repeating what the
// hub header already says, a full face ROW on a kiosk, a composer whose mic + 📎 ate
// most of the typing width, an always-open search field, and rows carrying a grip, a
// tint dot, a scope chip and two action buttons before the text got any room. The
// default is now the LEAN face: a small face chip, a collapsed 🔍, one wide text box
// (Enter writes the note), and the board-card's compact rows — maximum note per pixel.
//
// AVANCÉ is exactly what the tab used to be, kept for a household that wants it:
// the section header, the kiosk face row, mic + attachment in the composer, roomy
// rows with drag-reorder / tint dot / scope chip, and the rich editor's explicit
// title field + the BETA editor flip.
//
// DEVICE-LOCAL, so a guest may flip it (CLAUDE.md: a localStorage presentation
// preference is not a household write — never gate one on isGuest). A wall kiosk and
// a phone each keep their own answer.
const store = createDeviceStore<boolean>('babillard-notes-advanced', false, {
  read: (raw) => raw === '1',
  write: (v) => (v ? '1' : '0'),
})

/** Live: is this device on the advanced (pre-lean) Notes face? */
export const useNotesAdvanced = store.use
/** Read once, outside React (the editor's save path). */
export const getNotesAdvanced = store.get
export const setNotesAdvanced = store.set
