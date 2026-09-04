import { type HelpEntry } from './helpMode'

// Help-mode copy for « Les notes » (pages/Notes.tsx) — the SAME reusable "?" mode
// as La liste / La cuisine / Maison. Arm it in the header, then tap the notes
// board's title (or the search magnifier) to learn, in place, what it is instead
// of leaving the page. Mirrors lib/routinesHelp.ts's shape exactly.
// NOTE — there is no `notes` entry any more. It was anchored on CercleNotes'
// section title, and that title is gone from BOTH faces (the hub header already
// says « Les notes »). The explanation itself isn't lost: it's guide card « notes »
// point 0, which the page's SectionIntro and HubHead `card="notes"` both open.
export const NOTES_HELP = {
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
