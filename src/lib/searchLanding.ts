import { localDayStart } from './localDay'
import { TASKS_VIEW_HREF } from './settingsNav'

// WHERE A SEARCH HIT LANDS (solidify 4.2, 2026-11-05) — ONE table. Two rules:
//   · an entity with its OWN SCENE opens that scene (a recipe, a person, a trip);
//   · an entity that lives in a CONTAINER opens the container with `?item=<id>`, and the
//     container pulses that row (`useItemPulse`, or Maison/Notes' own focusItem).
// Before this, a hit on a drawing, a habit, an idea, a mot or a todo opened the page and
// left you to find the thing yourself, while ACTIONS.md said otherwise.
export type SearchHit =
  | { kind: 'recipe' | 'person' | 'pet' | 'carnet' | 'routine' | 'trip' | 'listItem' | 'business' | 'note' | 'drawing' | 'habit' | 'mot' | 'idea' | 'todo'; id: string }
  | { kind: 'project'; carnetId: string | null }
  | { kind: 'carnetEntry'; carnetId: string }
  | { kind: 'meal'; date: number }
  | { kind: 'event'; at: number }
  | { kind: 'group'; id: string; family: boolean }
  | { kind: 'pantry' }
  | { kind: 'chore' }
  | { kind: 'car' }

export function landingFor(hit: SearchHit): string {
  switch (hit.kind) {
    case 'recipe':
      return `/kitchen/recipe/${hit.id}`
    case 'person':
      return `/cercle/person/${hit.id}`
    case 'pet':
      return `/cercle/pet/${hit.id}`
    case 'carnet':
      return `/cercle/carnet/${hit.id}`
    case 'routine':
      return `/routine/${hit.id}`
    case 'trip':
      return `/voyage/${hit.id}`
    case 'listItem':
      return `/liste/item/${hit.id}`
    case 'business':
      return `/maison?section=business&item=${hit.id}`
    case 'note':
      return `/notes?item=${hit.id}`
    case 'drawing':
      return `/drawings?item=${hit.id}`
    case 'habit':
      return `/board/habitudes?item=${hit.id}`
    case 'mot':
    case 'todo':
      return `/board?item=${hit.id}`
    case 'idea':
      return `/kitchen/idees?tab=kid&item=${hit.id}`
    case 'project':
      return hit.carnetId ? `/cercle/carnet/${hit.carnetId}` : TASKS_VIEW_HREF
    case 'carnetEntry':
      return `/cercle/carnet/${hit.carnetId}?seg=carnet`
    case 'meal':
      return `/kitchen/day/${hit.date}?vue=repas`
    case 'event':
      return `/kitchen/day/${localDayStart(new Date(hit.at * 1000))}`
    case 'group':
      return hit.family ? `/cercle/family/${hit.id}` : '/maison?section=social'
    case 'chore':
      return TASKS_VIEW_HREF
    case 'pantry':
      return '/kitchen?tab=pantry'
    case 'car':
      return '/voiture'
  }
}
