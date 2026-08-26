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
  // The SIMPLE ↔ AVANCÉ chip in the section's control bar (lib/notesMode). Anchored
  // there in BOTH faces — in simple mode it's the one control that explains why the
  // section looks lighter than it used to, and how to get the old one back.
  mode: {
    card: 'notes',
    point: 6, // « Simple ou avancé » — appended to the notes card's points

    body: {
      fr: 'Simple (par défaut) : on LIT. Des rangées serrées qui montrent plusieurs lignes de chaque note, et une seule boîte — écris, appuie sur Entrée, c’est noté. Le micro, le dessin et la photo vivent dans le ＋ en bas à droite. Ce ⚙ passe en Avancé : c’est là qu’on modifie, supprime et réordonne une note, avec l’éditeur complet.',
      en: 'Simple (the default): you READ. Tight rows showing several lines of each note, and one plain box — type, press Enter, it’s written. The mic, drawing and photo live in the ＋ at the bottom right. This ⚙ switches to Advanced: that’s where a note is edited, deleted and reordered, with the full editor.',
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
