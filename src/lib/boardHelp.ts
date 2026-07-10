import { type HelpEntry } from './helpMode'

// Help-mode copy for the board's view toggle (the two glance views: Grille ⟷ Mois).
// Each points at the "Changer la vue" point of the board GUIDE card (index 7) so the
// "→ Voir le guide" link lands on the exact line. The per-person lens (face picker)
// and the « Moments » recap have their own help entries elsewhere. See lib/helpMode +
// the board wiring in Board.tsx.
export const BOARD_HELP = {
  'view-bento': {
    card: 'board',
    point: 7,
    body: { fr: 'La grille : toute la journée d’un coup d’œil.', en: 'The grid: the whole day at a glance.' },
  },
  'view-month': {
    card: 'board',
    point: 7,
    body: {
      fr: 'Le mois : la vue d’ensemble ; touche une journée pour la planifier.',
      en: 'The month: the big picture; tap a day to plan it.',
    },
  },
  'view-annee': {
    card: 'board',
    point: 7,
    body: {
      fr: 'L’année : l’horizon — fêtes, anniversaires, voyages, entretien. Touche un mois pour l’ouvrir.',
      en: 'The year: the horizon — holidays, birthdays, trips, upkeep. Tap a month to open it.',
    },
  },
  // The « À faire » card holds two kinds of to-do, distinguished in place: loose one-off
  // tasks (often dictated) up top, and reusable checklists (« À compléter ») below.
  todos: {
    card: 'todos',
    body: {
      fr: '« À faire » : des choses ponctuelles à cocher, puis c’est fini (souvent dictées). « À compléter » en dessous : tes listes qui reviennent — sac de piscine, avant de partir… — réutilisables d’un tap.',
      en: '“À faire”: one-off things you tick off, then they’re done (often dictated). “À compléter” below: your recurring checklists — pool bag, before leaving… — reusable in one tap.',
    },
  },
  // « Laisse un mot » — the member-to-member inbox card. Deep-links to the `mots` guide.
  mots: {
    card: 'mots',
    body: {
      fr: 'Mots : un petit message qu’un membre laisse à un autre — écrit, vocal, dessiné ou en photo. Il attend, fermé, sur ton visage; touche-le pour l’ouvrir. Jamais de compte de non-lus.',
      en: 'Notes: a little message one member leaves for another — typed, spoken, drawn or a photo. It waits, unopened, on your face; tap it to open. Never an unread count.',
    },
  },
  // The rest of the board's section cards — a one-line "what is this" each, deep-linking to
  // the relevant guide concept. Help-mode only (armed via the board "?"), so no clutter.
  today: {
    card: 'board',
    body: {
      fr: 'Aujourd’hui : l’agenda du jour — repas, événements, corvées. « Demain » se range en dessous quand il y a quelque chose à préparer.',
      en: 'Today: the day’s agenda — meals, events, chores. “Tomorrow” tucks in below when there’s something to prep.',
    },
  },
  fil: {
    card: 'board',
    point: 2,
    body: {
      fr: 'Le fil du jour : tes rendez-vous, trajets et heures de travail placés dans l’ordre de l’heure, avec un repère « Maintenant » et les plages « Libre ».',
      en: 'The day’s timeline: your appointments, rides and work hours placed in time order, with a “Now” marker and “Free” stretches.',
    },
  },
  toFinish: {
    card: 'kitchen',
    point: 8,
    body: {
      fr: 'À finir : les restes à manger en premier, pour ne rien gaspiller. Coche quand c’est fini.',
      en: 'To finish: leftovers to eat first so nothing’s wasted. Tick one off when it’s gone.',
    },
  },
  upcoming: {
    card: 'board',
    point: 10,
    body: {
      fr: 'À venir : ce qui s’en vient cette semaine, avec « dans X jours » quand c’est proche.',
      en: 'Coming up: what’s ahead this week, with “in X days” when it’s close.',
    },
  },
  // The header magnifier (A-9 soft icon label — the icon stays wordless; armed
  // help explains it in place instead of navigating away).
  search: {
    card: 'board',
    point: 4,
    body: {
      fr: 'La loupe : une seule recherche pour tout — recettes, personnes, listes, rendez-vous… et le guide.',
      en: 'The magnifier: one search for everything — recipes, people, lists, appointments… and the guide.',
    },
  },
} satisfies Record<string, HelpEntry>
