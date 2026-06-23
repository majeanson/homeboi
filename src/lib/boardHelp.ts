import { type HelpEntry } from './helpMode'

// Help-mode copy for the board's view toggle (the five glance views). Each points
// at the "Changer la vue" point of the board GUIDE card (index 5 — the card grew,
// so this is NOT point 2 anymore) so the "→ Voir le guide" link lands on the exact
// line. See lib/helpMode + the board wiring in Board.tsx.
export const BOARD_HELP: Record<string, HelpEntry> = {
  'view-bento': {
    card: 'board',
    point: 5,
    body: { fr: 'La grille : toute la semaine d’un coup d’œil.', en: 'The grid: the whole week at a glance.' },
  },
  'view-next': {
    card: 'board',
    point: 5,
    body: {
      fr: '« Maintenant » : juste la prochaine affaire, façon tableau de départs.',
      en: '“Now”: just the next thing, departure-board style.',
    },
  },
  'view-lanes': {
    card: 'board',
    point: 5,
    body: { fr: 'Par personne : une colonne par membre, sa journée à lui.', en: 'By person: one column per member, their own day.' },
  },
  'view-month': {
    card: 'board',
    point: 5,
    body: {
      fr: 'Le mois : la vue d’ensemble ; touche une journée pour la planifier.',
      en: 'The month: the big picture; tap a day to plan it.',
    },
  },
  'view-moment': {
    card: 'moment',
    point: 0,
    body: {
      fr: '« Moments » : choisis un moment (ce soir, demain, une date, la semaine) et vois tout ce qui s’en vient — avec la liste « À compléter » de chaque jour, à cocher sur place.',
      en: '“Moments”: pick a moment (tonight, tomorrow, a date, the week) and see everything coming up — with each day’s “To complete” list, checkable in place.',
    },
  },
}
