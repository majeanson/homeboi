import { type HelpEntry } from './helpMode'

// Help-mode copy for La liste — the SAME reusable "?" mode as the board view
// toggle and the kitchen headings: arm it once in the header, then tap one of the
// list's controls (the flyer search, Vider les cochés, Montrer à la caisse) to
// learn what it does in place instead of running it. Each points at the matching
// GUIDE card/point so "→ Voir le guide" lands on the right line. See lib/helpMode
// + the Liste.tsx wiring. (The list itself has no sub-section headings — it's one
// list — so the help targets here are its buttons, not titles.)
export const LISTE_HELP: Record<string, HelpEntry> = {
  flyer: {
    card: 'liste',
    point: 3,
    body: {
      fr: 'La loupe ouvre les circulaires de la semaine pour chercher un article en aubaine et l’envoyer sur ta liste.',
      en: 'The magnifier opens this week’s flyers to search an item on sale and send it to your list.',
    },
  },
  quick: {
    card: 'liste',
    point: 0,
    body: {
      fr: 'Rouvre tes articles déjà achetés ou suggérés pour regarnir la liste en quelques taps, avec leurs synonymes d’aubaine.',
      en: 'Reopen your past or suggested items to restock the list in a few taps, carrying their flyer synonyms.',
    },
  },
  clear: {
    card: 'liste',
    point: 1,
    body: {
      fr: 'Enlève d’un coup tout ce qui est coché (compté comme acheté), et garde le reste pour la prochaine fois. Un bandeau « Annuler » te couvre.',
      en: 'Removes everything checked at once (logged as bought) and keeps the rest for next time. An “Undo” toast has your back.',
    },
  },
  cashier: {
    card: 'cashier',
    point: 0,
    body: {
      fr: 'Passe en mode caisse : tes articles avec une aubaine choisie, prêts à montrer et à pointer à l’épicerie.',
      en: 'Switch to cashier mode: your items with a picked deal, ready to show and check off at the store.',
    },
  },
}
