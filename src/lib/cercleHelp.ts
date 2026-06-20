import type { HelpEntry } from './helpMode'

// In-place help for « Le cercle »'s controls (the list's "?" help mode). Tapping the
// "?" arms help mode; tapping a button/title then shows a one-line HelpBubble + a
// "→ Voir le guide" link into the existing `cercle` GUIDE card (point = the sub-point
// to open). Keyed by control id; the title comes from the control's own label
// (labelFn in Cercle.tsx). Same engine as Kitchen's KITCHEN_TAB_HELP. FR-CA first.
export const CERCLE_HELP: Record<string, HelpEntry> = {
  // View switch (Liste / Liens / Arbre) — guide point 5 ("Trois vues").
  list: { card: 'cercle', point: 5, body: { fr: 'Le répertoire, regroupé par famille.', en: 'The directory, grouped by family.' } },
  links: { card: 'cercle', point: 5, body: { fr: 'Touche un visage : ses liens s’affichent autour, touche-en un autre pour recentrer.', en: 'Tap a face: their ties fan out; tap another to re-center.' } },
  tree: { card: 'cercle', point: 5, body: { fr: 'L’arbre : les générations, les couples côte à côte.', en: 'The tree: generations, couples side by side.' } },
  search: { card: 'cercle', point: 1, body: { fr: 'Cherche quelqu’un par son prénom OU son nom de famille.', en: 'Search someone by their first OR last name.' } },
  birthdays: { card: 'cercle', point: 7, body: { fr: 'Les anniversaires des 31 prochains jours, sans notification.', en: 'Birthdays in the next 31 days, no notification.' } },
  // Maisonnée card.
  household: { card: 'cercle', point: 0, body: { fr: 'Ta maisonnée au complet, sous le nom que tu lui donnes dans Réglages.', en: 'Your whole household, under the name you give it in Settings.' } },
  householdLinks: { card: 'cercle', point: 0, body: { fr: 'Dis qui est le parent, l’enfant, le frère ou la sœur de qui — sans créer de groupe.', en: 'Say who’s the parent, child, brother or sister of whom — without making a group.' } },
  // Groups + families.
  namedGroup: { card: 'cercle', point: 6, body: { fr: 'Un groupe nommé que tu as créé (famille, amis, collègues…).', en: 'A named group you created (family, friends, coworkers…).' } },
  familyAuto: { card: 'cercle', point: 2, body: { fr: 'Une famille détectée toute seule à partir des liens.', en: 'A family detected automatically from the links.' } },
  groupBuilder: { card: 'cercle', point: 3, body: { fr: 'Rouvre cette famille dans le bâtisseur pour l’agrandir.', en: 'Reopen this family in the builder to extend it.' } },
  groupConnect: { card: 'cercle', point: 4, body: { fr: 'Relie cette famille à une autre personne, d’un seul lien.', en: 'Connect this family to another person, with one link.' } },
  editGroup: { card: 'cercle', point: 6, body: { fr: 'Renomme le groupe, ou change son type et sa couleur.', en: 'Rename the group, or change its kind and colour.' } },
  deleteGroup: { card: 'cercle', point: 6, body: { fr: 'Supprime le groupe ; les personnes restent dans le cercle.', en: 'Delete the group; the people stay in the circle.' } },
  others: { card: 'cercle', point: 1, body: { fr: 'Les personnes qui ne sont dans aucun groupe ni famille.', en: 'People who aren’t in any group or family.' } },
}
