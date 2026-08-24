// In-place help for each ＋ Add-sheet control (the sheet's "?" help mode). Tapping
// the "?" arms help mode; tapping any tile then shows a small box (HelpBubble) with
// this one-line "what it does" instead of running it, plus a "→ Voir le guide" link
// that opens the matching GUIDE card (/settings?tab=guide&card=<id>, the same target
// as HelpDot). Keyed by AddSheet mode OR kitchen-week action key; the title comes
// from the tile's own label. Calm: help is opt-in (tutorial mode), never modal-blocking.
//
// P2-9/C-15: an entry whose `body` merely restated a GUIDE card's `what`/point
// sources it via `helpFromGuide` instead (one prose to drift, not two) — see
// capture/ride/plan-today/plan-tomorrow/reserve below. A bespoke `body` stays
// hand-written where the bubble explains the TILE/CONTROL rather than the guide's
// concept prose (most entries — the two rarely say the same thing).
import { helpFromGuide } from './guideContent'

export interface AddHelp {
  body: { fr: string; en: string }
  card: string // a GUIDE entry id (lib/guideContent.ts)
  point?: number // optional 0-based sub-point in that card to open + highlight
}

export const ADD_HELP = {
  // Bespoke rather than helpFromGuide('capture'): this tile is now a plain NOTE (a
  // line + one clipped memo), while the guide's `capture` card is about the AI that
  // files things — which moved to the header mic (« Parle à la maison » ▸ Classer).
  // The bubble explains the tile; the « → Voir le guide » link still opens the card
  // that tells you where the AI went.
  note: {
    card: 'capture',
    body: {
      fr: 'Écris une note pour le babillard. Le trombone y joint un mémo vocal, un dessin ou une photo — la note garde tes mots.',
      en: 'Write a note for the board. The paperclip attaches a voice memo, a drawing or a photo — the note keeps your words.',
    },
  },
  event: {
    card: 'set-agenda',
    point: 0,
    body: { fr: 'Ajoute un rendez-vous à l’agenda partagé.', en: 'Add an event to the shared agenda.' },
  },
  chore: {
    card: 'set-chores',
    point: 0,
    body: {
      fr: 'Ajoute une corvée, ponctuelle ou récurrente, avec qui s’en occupe.',
      en: 'Add a chore, one-off or recurring, with who handles it.',
    },
  },
  'chores-pick': {
    card: 'set-chores',
    point: 0,
    body: {
      fr: 'Choisis : une corvée, un entretien qui revient, ou un projet de la maison.',
      en: 'Choose: a chore, recurring maintenance, or a home project.',
    },
  },
  todo: {
    card: 'todos',
    point: 0,
    body: {
      fr: 'Ajoute une chose « à compléter » : en tout temps, ou juste pour aujourd’hui. Coche-la quand c’est fait.',
      en: 'Add something “to complete”: anytime, or just for today. Check it off when done.',
    },
  },
  ride: {
    card: 'auto',
    point: 4,
    body: helpFromGuide('auto', 4),
  },
  departure: {
    card: 'board',
    point: 6,
    body: {
      fr: 'Ouvre l’écran « Avant de partir » : une liste à cocher, l’horaire du jour et la météo, le temps d’attraper tes clés.',
      en: 'Open the “Before you go” screen: a checklist, today’s schedule and the weather, while you grab your keys.',
    },
  },
  routine: {
    // Was 'set-routines' — an id that never existed in GUIDE, so the deep-link
    // was a dead end (the exact orphan class helpRegistry.test.ts now blocks).
    card: 'routines',
    body: { fr: 'Crée une routine d’images pour un enfant (matin, dodo…).', en: 'Build a picture routine for a child (morning, bedtime…).' },
  },
  // Point 2 = « Des raccourcis selon la section ». Index shifts are silent — if
  // you reorder that card's points, re-check every `point:` that targets it.
  'plan-today': {
    card: 'capture',
    point: 2,
    body: helpFromGuide('capture', 2),
  },
  'plan-tomorrow': {
    // Same guide point as 'plan-today' — it already covers BOTH shortcuts in one
    // sentence, so both tiles share the identical helpFromGuide text on purpose.
    card: 'capture',
    point: 2,
    body: helpFromGuide('capture', 2),
  },
  cook: {
    card: 'recipes',
    point: 7,
    body: { fr: 'Passe en mode cuisson plein écran pour un repas prévu aujourd’hui.', en: 'Jump into full-screen cook mode for a meal planned today.' },
  },
  recipe: {
    card: 'recipes',
    point: 0,
    body: { fr: 'Ajoute une recette à ton livre (à la main, par photo ou collée).', en: 'Add a recipe to your book (by hand, photo or paste).' },
  },
  meal: {
    card: 'kitchen',
    point: 1,
    body: { fr: 'Planifie un souper : choisis un jour et remplis-le.', en: 'Plan a supper: pick a day and fill it in.' },
  },
  leftovers: {
    card: 'kitchen',
    point: 8,
    body: { fr: 'Signale qu’un plat a des restes à finir bientôt.', en: 'Flag that a dish has leftovers to finish soon.' },
  },
  pantry: {
    card: 'kitchen',
    point: 2,
    body: { fr: 'Marque un article « il en manque » — un drapeau, jamais un inventaire.', en: 'Mark an item “running low” — a flag, never an inventory.' },
  },
  reserve: {
    card: 'reserve',
    point: 0,
    body: helpFromGuide('reserve', 0),
  },
  'list-item': {
    // The list has no dedicated "add a line" point — opening the liste card top
    // (its one-line "what" covers adding) beats highlighting an unrelated point.
    card: 'liste',
    body: { fr: 'Ajoute une ligne à la liste d’épicerie.', en: 'Add a line to the grocery list.' },
  },
  'quick-add': {
    card: 'liste',
    point: 3,
    body: { fr: 'Re-ajoute vite des articles déjà achetés.', en: 'Quickly re-add items you’ve bought before.' },
  },
  flyer: {
    card: 'deals',
    point: 3,
    body: { fr: 'Feuillette les circulaires et envoie des aubaines sur ta liste.', en: 'Browse the flyers and send deals to your list.' },
  },
  share: {
    card: 'liste',
    body: {
      fr: 'Envoie ta liste d’épicerie à quelqu’un (texto, courriel…) par le partage de ton appareil.',
      en: 'Send your grocery list to someone (text, email…) through your device’s share sheet.',
    },
  },
  'auto-pick': {
    card: 'liste',
    point: 7,
    body: { fr: 'Trouve la meilleure aubaine pour chaque ligne, puis va à la caisse.', en: 'Find the best deal for each line, then head to the cashier.' },
  },
  shop: {
    card: 'kitchen',
    body: {
      fr: 'Compare le plan de la semaine au garde-manger et ajoute ce qui manque à la liste, d’un coup.',
      en: 'Compare the week’s plan to the pantry and add what’s missing to the list, in one go.',
    },
  },
  // C-14 folded the old ai/book/useup/emptyFridge tiles into ONE « Idées » tile
  // that opens the IdeasDrawer — its own source chips (⭐🧊🤖👧) cover what those
  // four separate bubbles used to explain, so ONE bubble now, sourced from the
  // guide (the appended drawer point) instead of a fifth hand-typed restatement.
  ideas: {
    card: 'kitchen',
    point: 9,
    body: helpFromGuide('kitchen', 9),
  },
  // « Le cercle » ＋ chooser tiles.
  person: {
    card: 'cercle',
    point: 2,
    body: { fr: 'Ajoute une personne au cercle : prénom, photo, fête, courriel, téléphone.', en: 'Add someone to the circle: name, photo, birthday, email, phone.' },
  },
  family: {
    card: 'cercle',
    point: 4,
    body: { fr: 'Bâtis une famille d’un coup : place les visages et les liens se créent tout seuls.', en: 'Build a family in one pass: place the faces and the links create themselves.' },
  },
  connect: {
    card: 'cercle',
    point: 5,
    body: { fr: 'Relie deux personnes (donc deux familles) d’un seul lien ; le reste se déduit.', en: 'Connect two people (so two families) with one link; the rest is inferred.' },
  },
  group: {
    card: 'cercle',
    point: 8,
    body: { fr: 'Crée un groupe nommé (Famille Tremblay, Collègues…) avec sa couleur.', en: 'Create a named group (Tremblay family, Coworkers…) with its colour.' },
  },
  business: {
    card: 'cercle',
    point: 11,
    body: { fr: 'Ajoute un commerce ou service (vét, plombier, garderie) : catégorie, téléphone, adresse, carte d’affaires.', en: 'Add a business or service (vet, plumber, daycare): category, phone, address, business card.' },
  },
  pet: {
    card: 'cercle',
    body: { fr: 'Ajoute un animal de la maisonnée : nom, photo, et les infos utiles (vétérinaire, soins).', en: 'Add a household pet: name, photo, and the useful info (vet, care).' },
  },
  // The Maison tab's default section — build a new routine, or edit an existing one.
  'routine-pick': {
    card: 'routines',
    body: { fr: 'Crée une routine, ou touche une routine existante pour la modifier.', en: 'Create a routine, or tap an existing one to edit it.' },
  },
  // « Les notes » ＋ — the tab's only tile, straight into the rich editor.
  cnote: {
    card: 'notes',
    point: 2,
    body: { fr: 'Ouvre une nouvelle note riche : un titre, des listes à cocher, une photo ou un dessin.', en: 'Open a new rich note: a title, checklists, a photo or a drawing.' },
  },
} satisfies Record<string, AddHelp>
