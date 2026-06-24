import { type HelpEntry } from './helpMode'

// Help-mode copy for the board's view toggle (the two glance views: Grille ⟷ Mois).
// Each points at the "Changer la vue" point of the board GUIDE card (index 5) so the
// "→ Voir le guide" link lands on the exact line. The per-person lens (face picker)
// and the « Moments » recap have their own help entries elsewhere. See lib/helpMode +
// the board wiring in Board.tsx.
export const BOARD_HELP: Record<string, HelpEntry> = {
  'view-bento': {
    card: 'board',
    point: 5,
    body: { fr: 'La grille : toute la journée d’un coup d’œil.', en: 'The grid: the whole day at a glance.' },
  },
  'view-month': {
    card: 'board',
    point: 5,
    body: {
      fr: 'Le mois : la vue d’ensemble ; touche une journée pour la planifier.',
      en: 'The month: the big picture; tap a day to plan it.',
    },
  },
}
