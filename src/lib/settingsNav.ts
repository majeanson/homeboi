// The Réglages navigation taxonomy as PLAIN DATA — one source for the sub-tab
// ids (and their order), the focusable section anchors inside stacked subs, and
// the « Voir dans l'app » backlinks. pages/Operator.tsx builds its sub pill rows
// from SETTINGS_SUBS (so the ids can't drift), OperatorSection derives its DOM
// anchor from SETTINGS_FOCUS, and lib/guideLinks.test.ts validates every guide
// « Régler » URL (?tab=&sub=&focus=) against these maps. No React in here on
// purpose: vitest imports this file directly.

// Every themed Réglages tab's sub-section ids, in pill order. The id is the
// ?sub= deep-link value (unchanged from the old 9-tab layout — old links
// survive). `as const` so Operator's body map is typechecked against it: a sub
// listed here without a body (or vice versa) fails tsc, not the user.
export const SETTINGS_SUBS = {
  board: ['events', 'layout', 'thisweek'],
  kitchen: ['apparence', 'meals', 'reserve'],
  liste: ['shop', 'aisles', 'stores', 'history', 'ghost'],
  cercle: ['members', 'cercle', 'cars', 'schedule', 'annee'],
  routines: ['routines', 'chores', 'todos'],
  settings: ['tablets', 'guest', 'display', 'ambient', 'photos', 'ai', 'voice', 'calm', 'system'],
} as const

export type SettingsTabId = keyof typeof SETTINGS_SUBS

// ?focus= targets — the section cards a guide « Régler » link can land on
// INSIDE a stacked sub (C-15 stacks several OperatorSection bodies under one
// pill, so ?tab=&sub= alone can't name the exact card). The value IS the
// section's operatorHelp helpKey: OperatorSection already receives it, and
// derives the DOM anchor (id="op-<helpKey>") only for keys listed here — that
// keeps ids unique (helpKey 'guest' is shared by five sections and is
// deliberately absent).
export const SETTINGS_FOCUS: Record<string, readonly string[]> = {
  'board/events': ['schoolYear'],
  'board/thisweek': ['recap'],
  'kitchen/apparence': ['recipeTags', 'recipePills', 'measureColors'],
  'settings/ambient': ['ambient', 'habits'],
  'settings/system': ['micTest', 'aiLog'],
}

// Flat set of every focusable helpKey — what OperatorSection checks before
// rendering its anchor.
export const FOCUSABLE_HELP_KEYS: ReadonlySet<string> = new Set(Object.values(SETTINGS_FOCUS).flat())

// « Voir dans l'app » — the standard way back from a Réglages sub to the live
// surface it configures (the board▸Disposition ↔ /board?edit=1 mirror,
// generalized). Key is `<tab>/<sub>`; subs with no obvious live counterpart
// (device pairing, guests, display machinery…) simply have no entry.
export const SUB_GOTO: Record<string, string> = {
  'board/events': '/board',
  'board/layout': '/board?edit=1',
  'board/thisweek': '/board',
  'kitchen/apparence': '/kitchen',
  'kitchen/meals': '/kitchen',
  'kitchen/reserve': '/kitchen',
  'liste/shop': '/liste',
  'liste/aisles': '/liste',
  'liste/stores': '/liste/circulaires',
  'liste/history': '/liste',
  'liste/ghost': '/liste',
  'cercle/members': '/cercle',
  'cercle/cercle': '/cercle',
  'cercle/cars': '/voiture',
  'cercle/schedule': '/voiture',
  'routines/routines': '/routines',
  'routines/chores': '/board',
  'routines/todos': '/board',
  'settings/photos': '/board',
}

// Every path prefix a guide route/point link may target — mirrors the route
// table in src/router.tsx (keep in sync when adding a scene). guideLinks.test.ts
// rejects any guide link whose path doesn't start with one of these, so a typo'd
// or retired route fails the build instead of 404ing a curious parent.
export const ROUTE_PREFIXES: readonly string[] = [
  '/board',
  '/kitchen',
  '/routines',
  '/cercle',
  '/liste',
  '/settings',
  '/search',
  '/moment',
  '/drawings',
  '/voyage',
  '/voiture',
  '/jouer',
  '/event/new',
  '/chore/new',
  '/home-project/new',
  '/routine',
  '/habitude',
  '/cast',
  '/share',
]
