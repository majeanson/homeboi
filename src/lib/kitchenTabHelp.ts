import { type HelpEntry } from './helpMode'
import { helpFromGuide } from './guideContent'

// Help-mode copy for La cuisine — the SAME reusable "?" mode as the board view
// toggle, but page-wide: arm it once at the sub-tab nav, then tap a tab OR any
// sub-section heading (Idées de repas, Restants, Il en manque, La réserve, …) to
// learn what that concept is in place, instead of acting on it. Each points at the
// matching GUIDE card/point so "→ Voir le guide" lands on the right line. The
// sub-tab keys (meals/pantry/recipes) and the heading keys live in ONE map because
// one page-level help instance covers the whole tab (see Kitchen.tsx + lib/helpMode
// HelpTitle). Keys must be distinct from the sub-tab keys so a heading's bubble and
// a tab's bubble never both fire for the same key.
export const KITCHEN_TAB_HELP = {
  // ── the sub-tab nav ──
  meals: {
    card: 'kitchen',
    point: 1,
    body: {
      fr: 'Le plan de la semaine : un souper par jour, qui cuisine, et les idées.',
      en: 'The week’s plan: a supper a day, who cooks, and the ideas.',
    },
  },
  pantry: {
    card: 'kitchen',
    point: 2,
    body: {
      fr: 'Ce qui manque et La réserve — des drapeaux « il en manque », jamais un inventaire.',
      en: 'What’s running low and The stash — “running low” flags, never an inventory.',
    },
  },
  recipes: {
    card: 'kitchen',
    point: 4,
    body: {
      fr: 'Ton livre de recettes : ajoute, importe et feuillette tes recettes.',
      en: 'Your recipe book: add, import and browse your recipes.',
    },
  },
  history: {
    card: 'kitchen',
    point: 10,
    body: {
      fr: 'Tous les repas planifiés depuis le début, du plus récent au plus ancien, mois par mois.',
      en: 'Every planned meal since the beginning, newest first, month by month.',
    },
  },
  // ── headings on the Repas tab ──
  // C-14 — sourced from the guide's appended drawer point instead of a hand-typed
  // restatement (P2-9): this opener and the IdeasDrawer explain the same concept.
  ideas: {
    card: 'kitchen',
    point: 9,
    body: helpFromGuide('kitchen', 9),
  },
  leftovers: {
    card: 'kitchen',
    point: 8,
    body: {
      fr: 'Les restes à finir bientôt : un plat cuisiné dont il reste, pas encore fixé à un jour. Touches-en un pour le planifier ; jamais sur la liste d’épicerie.',
      en: 'Leftovers to finish soon: a cooked dish with extra, not pinned to a day yet. Tap one to plan it; never on the grocery list.',
    },
  },
  // ── headings on the Garde-manger tab ──
  low: {
    card: 'kitchen',
    point: 2,
    body: {
      fr: 'Marque un aliment « il en manque » ; coche-le pour l’envoyer sur la liste d’épicerie. Un simple drapeau, jamais un inventaire à compter.',
      en: 'Flag a food “running low”; check it to send it to the grocery list. Just a flag, never an inventory to count.',
    },
  },
  useSoon: {
    card: 'kitchen',
    point: 8,
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
    point: 6,
    body: {
      fr: '« Filtrer » ouvre les pastilles (Quoi cuisiner ?, Favoris, ≤ 30 min…) et tes étiquettes : elles se cumulent, et le chiffre sur le bouton dit combien sont actives. Fermé, c’est le livre au complet — touche une recette pour l’ouvrir ou la planifier comme repas.',
      en: '« Filter » pops the pills (What can I cook?, Favorites, ≤ 30 min…) and your tags: they stack, and the number on the button says how many are on. Closed, it’s the whole book — tap a recipe to open it or plan it as a meal.',
    },
  },
  collections: {
    card: 'kitchen',
    point: 5,
    body: {
      fr: '« Aa » range tes recettes en ordre alphabétique ; « Collections » les regroupe par étiquette (Soupes, Desserts…). Ça réarrange seulement, ça ne filtre pas.',
      en: '“Aa” lists your recipes alphabetically; “Collections” groups them by tag (Soups, Desserts…). It only re-arranges, it doesn’t filter.',
    },
  },
  // The header magnifier (A-9 soft icon label).
  search: {
    card: 'board',
    point: 4,
    body: {
      fr: 'La loupe : une seule recherche pour tout — recettes, personnes, listes, rendez-vous… et le guide.',
      en: 'The magnifier: one search for everything — recipes, people, lists, appointments… and the guide.',
    },
  },
} satisfies Record<string, HelpEntry>
