import { type HelpEntry } from './helpMode'

// Help-mode copy for the board's view toggle (the two glance views: Grille ⟷ Mois).
// Each points at the "Changer la vue" point of the board GUIDE card (index 7) so the
// "→ Voir le guide" link lands on the exact line. The per-person lens (face picker)
// has its own help entry elsewhere. See lib/helpMode + the board wiring in Board.tsx.
export const BOARD_HELP = {
  'view-bento': {
    card: 'board',
    point: 7,
    body: { fr: 'La grille : toute la journée d’un coup d’œil.', en: 'The grid: the whole day at a glance.' },
  },
  'view-month': {
    card: 'board',
    // Point 11, not 7 (« Changer la vue »): that one explains the three zooms, this one
    // explains what the Mois view itself now does — the day stays on screen, the ⋯ adds
    // to it, and the cells can spell themselves out.
    point: 11,
    body: {
      fr: 'Le mois : la vue d’ensemble. Touche une journée — elle reste à l’écran, et son ⋯ y ajoute un rendez-vous, une corvée, un repas ou une note.',
      en: 'The month: the big picture. Tap a day — it stays on screen, and its ⋯ adds an event, a chore, a meal or a note to it.',
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
  // The « À faire » card is the loose to-do home since the « Avant de partir » split
  // (mig 0116): one-off things, standing or pinned to today. The reusable departure
  // checklists live on their own card now.
  todos: {
    card: 'todos',
    body: {
      fr: '« À faire » : des choses ponctuelles à cocher, puis c’est fini (souvent dictées) — en tout temps ou pour aujourd’hui. Tes listes qui reviennent (sac de piscine, avant de partir…) vivent sur la carte « Avant de partir ».',
      en: '“À faire”: one-off things you tick off, then they’re done (often dictated) — standing or for today. Your recurring checklists (pool bag, before leaving…) live on the “Before you go” card.',
    },
  },
  // « Avant de partir » — the departure card: today's checklists + bring-lists + the
  // door to the full pre-departure screen. Deep-links to the board guide card.
  departure: {
    card: 'board',
    body: {
      fr: '« Avant de partir » : tes listes de départ du jour (à cocher, réutilisables d’un tap), le « à apporter » des activités, et la porte vers l’écran de départ complet — météo, horaire, corvées, l’auto.',
      en: '“Before you go”: today’s leaving checklists (tickable, reusable in one tap), each activity’s “what to bring”, and the door to the full departure screen — weather, schedule, chores, the car.',
    },
  },
  // « Le défi du jour » — the day-long family défi on the Habitudes card. Deep-links to
  // the « Le défi du jour » point (index 0) of the `habits` guide card.
  defi: {
    card: 'habits',
    point: 0,
    body: {
      fr: 'Le défi du jour : un petit défi qui dure toute la journée (« porte du jaune »). Pige-en un — ou écris le tien —, essaie-le, puis chacun le coche quand il l’a tenu. Une invitation, jamais un devoir — rien n’est compté.',
      en: 'Today’s challenge: a little challenge that lasts all day (“wear something yellow”). Draw one — or write your own — try it, then each person checks it off once they’ve done it. An invitation, never a duty — nothing is counted.',
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
      fr: 'Aujourd’hui : l’agenda du jour — repas, événements, corvées. Les jours chargés, il se lit comme « le fil du jour » : rendez-vous et heures de travail placés dans l’ordre de l’heure, avec un repère « Maintenant ». « Demain » se range en dessous quand il y a quelque chose à préparer.',
      en: 'Today: the day’s agenda — meals, events, chores. On a busy day it reads as “the day’s timeline”: appointments and work hours placed in time order, with a “Now” marker. “Tomorrow” tucks in below when there’s something to prep.',
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
    // 10 → 9: the « Voir un moment » point (index 8) went with « Moments ».
    point: 9,
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
