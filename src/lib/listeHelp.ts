import { type HelpEntry } from './helpMode'

// Help-mode copy for La liste — the SAME reusable "?" mode as the board view
// toggle and the kitchen headings: arm it once in the header, then tap one of the
// list's controls (the flyer search, Vider les cochés, Montrer à la caisse) to
// learn what it does in place instead of running it. Each points at the matching
// GUIDE card/point so "→ Voir le guide" lands on the right line. See lib/helpMode
// + the Liste.tsx wiring. (The list itself has no sub-section headings — it's one
// list — so the help targets here are its buttons, not titles.)
export const LISTE_HELP = {
  flyer: {
    card: 'liste',
    point: 4,
    body: {
      fr: 'La loupe ouvre les circulaires de la semaine pour chercher un article en aubaine et l’envoyer sur ta liste.',
      en: 'The magnifier opens this week’s flyers to search an item on sale and send it to your list.',
    },
  },
  quick: {
    card: 'liste',
    point: 3,
    body: {
      fr: 'Rouvre tes articles déjà achetés ou suggérés pour regarnir la liste en quelques taps, avec leurs synonymes d’aubaine.',
      en: 'Reopen your past or suggested items to restock the list in a few taps, carrying their flyer synonyms.',
    },
  },
  // The « Allées » menu (the sort choice + the on-demand aisle tag) — the same
  // guide point as Réglages ▸ Magasinage's aisle order, which is what « Par
  // allée » follows.
  aisles: {
    card: 'liste',
    point: 8,
    body: {
      fr: 'Choisis l’ordre de la liste : « Mon ordre » (le tien, à la main) ou « Par allée » (le parcours de ton magasin). Tu peux aussi afficher l’allée sous chaque article, ou ranger ta liste par allée d’un coup.',
      en: 'Choose the list’s order: “My order” (yours, by hand) or “By aisle” (your store’s walk). You can also show each item’s aisle under its name, or arrange the whole list by aisle in one tap.',
    },
  },
  // The SIMPLE ↔ AVANCÉ chip (lib/listeMode) — the exact twin of NOTES_HELP.mode,
  // deliberately worded the same way: two lists that behave alike are learned once.
  // Anchored in BOTH faces, because in simple mode this ⚙ is the one control that
  // explains why the rows carry no ✏️/🗑 — and how to get them back.
  mode: {
    card: 'liste',
    point: 9, // « Simple ou avancé » — appended to the liste card's points
    body: {
      fr: 'Simple (par défaut) : on MAGASINE. Une rangée, c’est une image, un nom et un crochet — rien d’autre sous le pouce dans l’allée. Garde le doigt sur une rangée pour la modifier, et touche l’image pour ouvrir le retaillon de la circulaire. Ce ⚙ passe en Avancé : le ✏️ et la 🗑 reviennent sur chaque rangée — c’est aussi la porte pour qui range sa liste à la souris. C’est par appareil : ta tablette et ton téléphone peuvent différer.',
      en: 'Simple (the default): you SHOP. A row is a picture, a name and a check — nothing else under your thumb in the aisle. Press and hold a row to edit it, and tap the picture to open the flyer clipping. This ⚙ switches to Advanced: the ✏️ and 🗑 come back on every row — which is also the door for whoever tidies the list with a mouse. It’s per device: your tablet and your phone can differ.',
    },
  },
  clear: {
    card: 'liste',
    point: 2,
    body: {
      fr: 'Enlève d’un coup tout ce qui est coché (compté comme acheté), et garde le reste pour la prochaine fois. Un bandeau « Annuler » te couvre.',
      en: 'Removes everything checked at once (logged as bought) and keeps the rest for next time. An “Undo” toast has your back.',
    },
  },
  cashier: {
    card: 'deals',
    point: 5,
    body: {
      fr: 'Passe en mode caisse : une grille de tes articles en aubaine. Touche celui que la caissière scanne pour montrer sa preuve de prix.',
      en: 'Switch to cashier mode: a grid of your items on deal. Tap the one being scanned to show its price proof.',
    },
  },
  // The HEADER magnifier — global search, distinct from `flyer` (the in-list
  // flyer loupe) above. A-9 soft icon label.
  search: {
    card: 'board',
    point: 4,
    body: {
      fr: 'La loupe du haut : une seule recherche pour tout — recettes, personnes, listes, rendez-vous… et le guide.',
      en: 'The top magnifier: one search for everything — recipes, people, lists, appointments… and the guide.',
    },
  },
} satisfies Record<string, HelpEntry>
