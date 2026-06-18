// In-place help for each ＋ Add-sheet control (the sheet's "?" help mode). Tapping
// the "?" arms help mode; tapping any tile then shows a small box (HelpBubble) with
// this one-line "what it does" instead of running it, plus a "→ Voir le guide" link
// that opens the matching GUIDE card (/settings?tab=guide&card=<id>, the same target
// as HelpDot). Keyed by AddSheet mode OR kitchen-week action key; the title comes
// from the tile's own label. Calm: help is opt-in (tutorial mode), never modal-blocking.
export interface AddHelp {
  body: { fr: string; en: string }
  card: string // a GUIDE entry id (lib/guideContent.ts)
}

export const ADD_HELP: Record<string, AddHelp> = {
  capture: {
    card: 'capture',
    body: {
      fr: 'Écris ou dis une note ; l’app devine si c’est un rendez-vous, une corvée, un article, un repas ou une note.',
      en: 'Type or say a note; the app guesses if it’s an event, chore, item, meal or note.',
    },
  },
  event: {
    card: 'board',
    body: { fr: 'Ajoute un rendez-vous à l’agenda partagé.', en: 'Add an event to the shared agenda.' },
  },
  chore: {
    card: 'board',
    body: {
      fr: 'Ajoute une corvée, ponctuelle ou récurrente, avec qui s’en occupe.',
      en: 'Add a chore, one-off or recurring, with who handles it.',
    },
  },
  routine: {
    card: 'routines',
    body: { fr: 'Crée une routine d’images pour un enfant (matin, dodo…).', en: 'Build a picture routine for a child (morning, bedtime…).' },
  },
  'plan-today': {
    card: 'capture',
    body: {
      fr: 'Ouvre aujourd’hui pour tout planifier d’un coup : repas, rendez-vous, corvées, note.',
      en: 'Open today to plan it all at once: meals, events, chores, a note.',
    },
  },
  'plan-tomorrow': {
    card: 'capture',
    body: { fr: 'Ouvre demain pour tout planifier d’un coup.', en: 'Open tomorrow to plan it all at once.' },
  },
  cook: {
    card: 'cookmode',
    body: { fr: 'Passe en mode cuisson plein écran pour un repas prévu aujourd’hui.', en: 'Jump into full-screen cook mode for a meal planned today.' },
  },
  recipe: {
    card: 'recipes',
    body: { fr: 'Ajoute une recette à ton livre (à la main, par photo ou collée).', en: 'Add a recipe to your book (by hand, photo or paste).' },
  },
  meal: {
    card: 'kitchen',
    body: { fr: 'Planifie un souper : choisis un jour et remplis-le.', en: 'Plan a supper: pick a day and fill it in.' },
  },
  leftovers: {
    card: 'leftovers',
    body: { fr: 'Signale qu’un plat a des restes à finir bientôt.', en: 'Flag that a dish has leftovers to finish soon.' },
  },
  pantry: {
    card: 'kitchen',
    body: { fr: 'Marque un article « il en manque » — un drapeau, jamais un inventaire.', en: 'Mark an item “running low” — a flag, never an inventory.' },
  },
  reserve: {
    card: 'reserve',
    body: { fr: 'Ajoute un article à La réserve (congélateur, fond de garde-manger).', en: 'Add an item to The stash (freezer, back of the pantry).' },
  },
  'list-item': {
    card: 'liste',
    body: { fr: 'Ajoute une ligne à la liste d’épicerie.', en: 'Add a line to the grocery list.' },
  },
  'quick-add': {
    card: 'liste',
    body: { fr: 'Re-ajoute vite des articles déjà achetés.', en: 'Quickly re-add items you’ve bought before.' },
  },
  flyer: {
    card: 'flyers',
    body: { fr: 'Feuillette les circulaires et envoie des aubaines sur ta liste.', en: 'Browse the flyers and send deals to your list.' },
  },
  'auto-pick': {
    card: 'deals',
    body: { fr: 'Trouve la meilleure aubaine pour chaque ligne, puis va à la caisse.', en: 'Find the best deal for each line, then head to the cashier.' },
  },
  shop: {
    card: 'kitchen',
    body: {
      fr: 'Compare le plan de la semaine au garde-manger et ajoute ce qui manque à la liste, d’un coup.',
      en: 'Compare the week’s plan to the pantry and add what’s missing to the list, in one go.',
    },
  },
  ai: {
    card: 'kitchen',
    body: { fr: 'Demande à l’IA une volée d’idées de soupers.', en: 'Ask the AI for a batch of supper ideas.' },
  },
  book: {
    card: 'recipes',
    body: { fr: 'Pige des idées de repas dans ton propre livre de recettes.', en: 'Pull meal ideas from your own recipe book.' },
  },
  useup: {
    card: 'kitchen',
    body: { fr: 'Propose une recette qui finit ce que tu as marqué « à utiliser bientôt ».', en: 'Suggest a recipe that uses up what you flagged “use soon”.' },
  },
}
