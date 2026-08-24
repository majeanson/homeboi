import { type HelpEntry } from './helpMode'

// Help-mode copy for « Les notes » (pages/Notes.tsx) — the SAME reusable "?" mode
// as La liste / La cuisine / Maison. Arm it in the header, then tap the notes
// board's title (or the search magnifier) to learn, in place, what it is instead
// of leaving the page. Mirrors lib/routinesHelp.ts's shape exactly.
export const NOTES_HELP = {
  // CercleNotes reads this key directly (`HelpTitle help={help} k="notes"` +
  // `help?.bubbleFor('notes')`) — the notes board's own header title.
  notes: {
    card: 'notes',
    point: 0,
    body: {
      fr: 'Le babillard de notes : des notes rapides — pour toi ou pour toute la Maisonnée — avec titre, texte, dessin, photo ou mémo vocal. Le ＋ en écrit une nouvelle.',
      en: 'The notes board: quick notes — for you or the whole Household — with a title, text, drawing, photo or voice memo. The ＋ writes a new one.',
    },
  },
  // The header magnifier (A-9 soft icon label — armed help explains the loupe
  // in place instead of leaving the page). Same body/target as ROUTINES_HELP's
  // own `search` entry (the header magnifier is the SAME control everywhere).
  search: {
    card: 'board',
    point: 4,
    body: {
      fr: 'La loupe : une seule recherche pour tout — recettes, personnes, listes, rendez-vous… et le guide.',
      en: 'The magnifier: one search for everything — recipes, people, lists, appointments… and the guide.',
    },
  },
} satisfies Record<string, HelpEntry>
