import { type HelpEntry } from './helpMode'

// Help-mode copy for the board's view toggle (Grille ⟷ La semaine ⟷ Mois ⟷ L'année).
// Each points at the "Changer la vue" point of the board GUIDE card (index 7) so the
// "→ Voir le guide" link lands on the exact line. The per-person lens (face picker)
// has its own help entry elsewhere. See lib/helpMode + the board wiring in Board.tsx.
export const BOARD_HELP = {
  'view-bento': {
    card: 'board',
    point: 7,
    body: { fr: 'La grille : toute la journée d’un coup d’œil.', en: 'The grid: the whole day at a glance.' },
  },
  'view-semaine': {
    card: 'board',
    point: 7,
    body: {
      fr: 'La semaine : sept jours à partir d’aujourd’hui, écrits au long. Touche une journée pour l’ouvrir.',
      en: 'The week: seven days from today, spelled out. Tap a day to open it.',
    },
  },
  'view-month': {
    card: 'board',
    // Point 11, not 7 (« Changer la vue »): that one explains the three zooms, this one
    // explains what the Mois view itself now does — the day stays on screen, the ⋯ adds
    // to it, and the cells can spell themselves out.
    point: 11,
    body: {
      fr: 'Le mois : la vue d’ensemble. Touche une journée — elle reste à l’écran, et son ⋯ y ajoute un rendez-vous, une tâche, un repas ou une note.',
      en: 'The month: the big picture. Tap a day — it stays on screen, and its ⋯ adds an event, a task, a meal or a note to it.',
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
      fr: 'Tâches : ce qui est dû aujourd’hui, ce qui attend, et ce que tu as coché. Une tâche cochée reste jusqu’à la fin du jour. Tes listes qui reviennent (sac de piscine…) vivent sur la carte « Avant de partir ».',
      en: 'Tasks: what is due today, what is waiting, and what you ticked. A ticked task stays until the day ends. Your recurring checklists (pool bag…) live on the “Before you go” card.',
    },
  },
  // « Avant de partir » — the departure card: today's checklists + bring-lists + the
  // door to the full pre-departure screen. Deep-links to the board guide card.
  departure: {
    card: 'board',
    body: {
      fr: '« Avant de partir » : tes listes de départ du jour (à cocher, réutilisables d’un tap), le « à apporter » des activités, et la porte vers l’écran de départ complet — météo, horaire, tâches, l’auto.',
      en: '“Before you go”: today’s leaving checklists (tickable, reusable in one tap), each activity’s “what to bring”, and the door to the full departure screen — weather, schedule, tasks, the car.',
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
  // « Mots » — the fridge card (one card since 0142). Deep-links to the `mots` guide.
  mots: {
    card: 'mots',
    body: {
      fr: 'Mots : les papiers du frigo — écrits, vocaux, dessinés ou en photo. Un mot pour quelqu’un n’apparaît qu’à son visage et s’ouvre d’une tape; jamais de compte de non-lus.',
      en: 'Messages: the papers on the fridge — typed, spoken, drawn or a photo. One for someone shows only on their face and opens with a tap; never an unread count.',
    },
  },
  // The rest of the board's section cards — a one-line "what is this" each, deep-linking to
  // the relevant guide concept. Help-mode only (armed via the board "?"), so no clutter.
  today: {
    card: 'board',
    body: {
      fr: 'Aujourd’hui : l’agenda du jour — repas, événements. Les jours chargés, il se lit comme « le fil du jour » : rendez-vous et heures de travail placés dans l’ordre de l’heure, avec un repère « Maintenant ». « Demain » se range en dessous quand il y a quelque chose à préparer.',
      en: 'Today: the day’s agenda — meals, events. On a busy day it reads as “the day’s timeline”: appointments and work hours placed in time order, with a “Now” marker. “Tomorrow” tucks in below when there’s something to prep.',
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
  // The greeting doubles as « Depuis ce matin » (A-3) — a real button, but it looks
  // like plain text, so armed help is where a mouse user learns the door exists
  // (ACTIONS.md Wave C: it was the board's one undiscoverable action).
  greeting: {
    card: 'board',
    body: {
      fr: 'La salutation s’ouvre : « Depuis ce matin » — ce que la maisonnée a ajouté aujourd’hui, visage par visage. Rien ne clignote; tu tires quand tu veux.',
      en: 'The greeting opens: “Since this morning” — what the household added today, face by face. Nothing blinks; you pull when you want.',
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
  // One entry per card with no heading of its own to arm: an armed tap ANYWHERE on the card
  // explains it (CardSlot's `explain`, solidify 4.3). helpRegistry.test.ts holds every card.
  'card-heroes': {
    card: 'board',
    body: { fr: 'Le souper de ce soir et la météo : les deux choses qu’on regarde en passant.', en: 'Tonight’s supper and the weather: the two things you glance at in passing.' },
  },
  'card-souvenirs': {
    card: 'board',
    body: { fr: 'Un souvenir de la maisonnée qui revient : une photo ou une note d’il y a quelque temps.', en: 'A household memory coming back: a photo or a note from a while ago.' },
  },
  'card-aRegler': {
    card: 'board',
    body: { fr: '« À régler » : ce qui attend une petite décision. Une fois réglé, ça disparaît.', en: '“To settle”: what is waiting on a small decision. Once settled, it goes away.' },
  },
  'card-autoCard': {
    card: 'auto',
    body: { fr: 'L’auto : qui l’a aujourd’hui, et les trajets du jour.', en: 'The car: who has it today, and the day’s rides.' },
  },
  'card-routineNext': {
    card: 'routines',
    body: { fr: 'La prochaine routine de la journée. Touche-la pour la lancer.', en: 'The day’s next routine. Tap it to start.' },
  },
  'card-habitudes': {
    card: 'habits',
    body: { fr: 'Tes habitudes du jour, à cocher quand c’est fait. Aucun score, aucune série.', en: 'Today’s habits, ticked when done. No score, no streak.' },
  },
  'card-tomorrow': {
    card: 'board',
    body: { fr: 'Demain en un coup d’œil, pour ne pas être pris de court.', en: 'Tomorrow at a glance, so nothing catches you off guard.' },
  },
  'card-countdown': {
    card: 'board',
    body: { fr: 'Le prochain grand moment et les dodos qu’il reste.', en: 'The next big moment and the sleeps left.' },
  },
  'card-cercleNotes': {
    card: 'notes',
    body: { fr: 'Les notes de la famille qui comptent en ce moment. Touche-en une pour l’ouvrir.', en: 'The family notes that matter right now. Tap one to open it.' },
  },
  'card-voyage': {
    card: 'voyage',
    body: { fr: 'Votre prochain voyage : les dates et ce qu’il reste à préparer.', en: 'Your next trip: the dates and what is left to prepare.' },
  },
  'card-carnets': {
    card: 'carnets',
    body: { fr: 'Les carnets de la maison, de l’auto et de vos choses : leur prochain entretien.', en: 'The logbooks for the house, the car and your things: what is due next.' },
  },
  'card-seasonUpkeep': {
    card: 'carnets',
    body: { fr: 'L’entretien de la saison : ce qui revient à ce temps-ci de l’année.', en: 'This season’s upkeep: what comes back at this time of year.' },
  },
  'card-drawings': {
    card: 'board',
    body: { fr: 'Les dessins épinglés au babillard par la famille.', en: 'Drawings the family pinned to the board.' },
  },
  'card-photos': {
    card: 'board',
    body: { fr: 'Une photo de la maisonnée qui change de temps en temps.', en: 'A household photo that changes from time to time.' },
  },
  'card-remarks': {
    card: 'settings',
    body: { fr: 'Tes remarques envoyées sur l’application, et leurs réponses.', en: 'The remarks you sent about the app, and their replies.' },
  },
} satisfies Record<string, HelpEntry>
