import { type HelpEntry } from './helpMode'

// Help-mode copy for La cuisine — the SAME reusable "?" mode as the board view
// toggle, but page-wide: arm it once at the sub-tab nav, then tap a tab OR any
// sub-section heading (Idées de repas, Restants, Il en manque, La réserve, …) to
// learn what that concept is in place, instead of acting on it. Each points at the
// matching GUIDE card/point so "→ Voir le guide" lands on the right line. The
// sub-tab keys (meals/pantry/recipes) and the heading keys live in ONE map because
// one page-level help instance covers the whole tab (see Kitchen.tsx + lib/helpMode
// HelpTitle). Keys must be distinct from the sub-tab keys so a heading's bubble and
// a tab's bubble never both fire for the same key.
export const KITCHEN_TAB_HELP: Record<string, HelpEntry> = {
  // ── the sub-tab nav ──
  meals: {
    card: 'kitchen',
    point: 0,
    body: {
      fr: 'Le plan de la semaine : un souper par jour, qui cuisine, et les idées.',
      en: 'The week’s plan: a supper a day, who cooks, and the ideas.',
    },
  },
  pantry: {
    card: 'kitchen',
    point: 1,
    body: {
      fr: 'Ce qui manque et La réserve — des drapeaux « il en manque », jamais un inventaire.',
      en: 'What’s running low and The stash — “running low” flags, never an inventory.',
    },
  },
  recipes: {
    card: 'kitchen',
    point: 3,
    body: {
      fr: 'Ton livre de recettes : ajoute, importe et feuillette tes recettes.',
      en: 'Your recipe book: add, import and browse your recipes.',
    },
  },
  // ── headings on the Repas tab ──
  ideas: {
    card: 'kitchen',
    point: 9,
    body: {
      fr: 'Une réserve d’idées de repas (texte libre ou recette) ; touches-en une pour la déposer sur un jour. Elle reste dans la réserve, prête à replanifier.',
      en: 'A pool of meal ideas (free text or a recipe); tap one to drop it on a day. It stays in the pool, ready to re-plan.',
    },
  },
  leftovers: {
    card: 'leftovers',
    point: 0,
    body: {
      fr: 'Les restes à finir bientôt : un plat cuisiné dont il reste, pas encore fixé à un jour. Touches-en un pour le planifier ; jamais sur la liste d’épicerie.',
      en: 'Leftovers to finish soon: a cooked dish with extra, not pinned to a day yet. Tap one to plan it; never on the grocery list.',
    },
  },
  // ── headings on the Garde-manger tab ──
  low: {
    card: 'kitchen',
    point: 1,
    body: {
      fr: 'Marque un aliment « il en manque » ; coche-le pour l’envoyer sur la liste d’épicerie. Un simple drapeau, jamais un inventaire à compter.',
      en: 'Flag a food “running low”; check it to send it to the grocery list. Just a flag, never an inventory to count.',
    },
  },
  useSoon: {
    card: 'kitchen',
    point: 11,
    body: {
      fr: 'Ce qui est à utiliser bientôt avant que ça se perde. Ça n’achète rien — ça nourrit plutôt l’idée « finis ce que tu as » de « Qu’est-ce qu’on mange ? ».',
      en: 'What to use up soon before it spoils. It buys nothing — it feeds the “use what you have” idea in “What’s for supper?” instead.',
    },
  },
  reserve: {
    card: 'reserve',
    point: 0,
    body: {
      fr: 'La réserve : ce qui dort au congélateur ou au fond du garde-manger, rangé par endroit, pour que ça arrête d’être oublié. Cocher = utilisé / jeté.',
      en: 'The stash: what sleeps in the freezer or back of the pantry, grouped by spot, so it stops getting forgotten. Check = used / tossed.',
    },
  },
  // ── headings on the Recettes tab ──
  recipesBook: {
    card: 'recipes',
    point: 12,
    body: {
      fr: 'Ton livre de recettes : cherche, filtre (Quoi cuisiner ?, Favoris…), et touche une recette pour l’ouvrir ou la planifier comme repas.',
      en: 'Your recipe book: search, filter (What can I cook?, Favorites…), and tap a recipe to open it or plan it as a meal.',
    },
  },
  collections: {
    card: 'kitchen',
    point: 4,
    body: {
      fr: '« Aa » range tes recettes en ordre alphabétique ; « Collections » les regroupe par étiquette (Soupes, Desserts…). Ça réarrange seulement, ça ne filtre pas.',
      en: '“Aa” lists your recipes alphabetically; “Collections” groups them by tag (Soups, Desserts…). It only re-arranges, it doesn’t filter.',
    },
  },
}
