import { type HelpEntry } from './helpMode'

// Help-mode copy for the Routines overview (parent lens) — the SAME reusable "?"
// mode as La liste / La cuisine / Le babillard. Arm it in the header, then tap a
// routine card to learn, in place, what it is and how to change it, instead of
// opening it. The overview is a flat grid of cards (no sub-headings), so its one
// help target is the card itself; the body covers the moment-of-day badge and the
// ＋ too, so a parent gets the whole picture from one tap. See lib/helpMode +
// the Routines.tsx wiring. Points at the 'routines' GUIDE card for "→ Voir le guide".
export const ROUTINES_HELP = {
  card: {
    card: 'routines',
    point: 0,
    body: {
      fr: 'Touche une routine pour la voir en grand et la modifier : ses étapes, le visage de l’enfant et le moment de la journée (matin / après-midi / soir, la pastille en haut). Le ＋ en bas en crée une nouvelle. En vue enfant, ces mêmes routines se tapent et se lisent à voix haute.',
      en: 'Tap a routine to see it large and edit it: its steps, the child’s face and the moment of day (morning / afternoon / evening, the badge up top). The ＋ at the bottom creates a new one. In kid view these same routines are tapped and read aloud.',
    },
  },
} satisfies Record<string, HelpEntry>
