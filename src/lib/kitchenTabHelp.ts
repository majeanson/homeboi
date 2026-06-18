import { type HelpEntry } from './helpMode'

// Help-mode copy for the kitchen's sub-tab nav (Repas · Garde-manger · Recettes).
// Same reusable "?" mode as the board view toggle: arm it, tap a tab, learn what
// that section does in place instead of switching to it. Each points at the matching
// GUIDE card so "→ Voir le guide" lands on the right page. See lib/helpMode + the
// Kitchen.tsx wiring.
export const KITCHEN_TAB_HELP: Record<string, HelpEntry> = {
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
    card: 'recipes',
    body: {
      fr: 'Ton livre de recettes : ajoute, importe et feuillette tes recettes.',
      en: 'Your recipe book: add, import and browse your recipes.',
    },
  },
}
