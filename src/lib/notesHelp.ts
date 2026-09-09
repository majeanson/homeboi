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
  // « Pour qui » — the scope control, and the one thing a first-timer gets wrong
  // here: a face writes a personal note, Maisonnée writes a family-wide one. It was
  // explained in the guide and nowhere on the page.
  face: {
    card: 'notes',
    point: 1,
    body: {
      fr: 'Choisis à qui appartient la note : un visage → une note personnelle, « Maisonnée » → une note pour toute la famille. Le même choix filtre ce que tu vois ici.',
      en: 'Pick who the note belongs to: a face → a personal note, “Household” → one for the whole family. The same pick filters what you see here.',
    },
  },
  // A note ROW: what a tap does, and that a note is more than a line of text.
  note: {
    card: 'notes',
    point: 2,
    body: {
      fr: 'Touche une note pour l’ouvrir : titre, mise en forme, listes à cocher — et le 📎 pour un mémo vocal, un dessin ou une photo.',
      en: 'Tap a note to open it: title, formatting, checklists — and the 📎 for a voice memo, a drawing or a photo.',
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
