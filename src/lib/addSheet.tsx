// One shared opener for the ＋ Add bottom-sheet. HubLayout owns the sheet's state
// and renders the single <AddSheet>; anything inside the hub opens it through
// this context. Keeping ONE sheet mounted avoids duplicate dialogs (and
// duplicate selectors in e2e). `open('routine')` jumps straight to that form;
// the no-arg call opens the CURRENT SECTION's default — the ＋ means "add a
// recipe" in the kitchen and "add to the list" on Liste, not one generic sheet.
// An optional `modes` overrides the section's chooser: Réglages (where the ＋ FAB
// is hidden) opens a single-form sheet, e.g. open('chore', ['chore']).
import { createContext, useContext } from 'react'

export type AddSheetMode =
  // « Note rapide » — a plain fridge note: a line of text and/or ONE clipped memo
  // (voice / drawing / photo) via the field's 📎. This tile used to be `capture`,
  // the AI router — whose field mic (dictate → the AI files it) sat directly above
  // « Mémo vocal » (record a clip → a note), two microphones meaning opposite
  // things. The AI router now lives on the header mic (« Parle à la maison » ▸
  // Classer, see AskSheet), leaving this tile to be exactly what it says.
  | 'note'
  | 'event'
  // « L'auto » (#28) — a ride is an event that takes the car / carries passengers.
  // Navigate-only to /event/new?ride=1 (the event form with its Transport block
  // pre-opened + the household car pre-picked). Operator-grade like `event`.
  | 'ride'
  // « Activité » — a recurring kid commitment (soccer, piano). Navigate-only to
  // /event/new?activity=1 (the event form, weekly by default + logistics block open:
  // driver · passengers · « à apporter »). It IS a recurring event, so it lands on
  // the board/calendar and surfaces its bring-list in « Avant de partir » for free.
  | 'activity'
  | 'chore'
  // Board ＋ « Corvées » tile — NOT a direct jump to the chore form. Picking it
  // expands an in-sheet sub-choice (Corvée · Entretien · Projets), mirroring the
  // « Planifier un repas » day-picker: one tile, an extra step, then the right
  // form. Corvée → /chore/new; Entretien/Projets → /home-project/new?kind=. So
  // the longer-horizon home work (home_projects) is reachable straight from the
  // board, not only buried in Réglages ▸ Corvées.
  | 'chores-pick'
  | 'todo'
  | 'routine'
  // The Routines ＋ opens a small in-sheet picker (NOT a straight jump to the
  // builder): a "new routine" button plus the household's existing routines, each
  // tappable to edit. `routine` stays the create-only nav used by the board tile
  // and the Réglages add button; `routine-pick` is the manage-from-the-tab sheet.
  | 'routine-pick'
  | 'plan-today'
  | 'plan-tomorrow'
  // #17 departure mode — navigate-only to /board/departure (a leaving-the-house
  // screen: a chosen checklist template + today's events + weather). Not a form.
  | 'departure'
  | 'list-item'
  | 'quick-add'
  | 'flyer'
  | 'auto-pick'
  // Share the list out (the OS share sheet) — runs in place like auto-pick. Lives
  // behind the ＋ so the list page itself stays just the list.
  | 'share'
  | 'recipe'
  // Prepare the printable toddler recipe/activity book (#45) — navigate-only to
  // /kitchen/book. A ＋ action, NOT an on-page button in the recipe view.
  | 'book'
  | 'meal'
  | 'leftovers'
  | 'pantry'
  | 'reserve'
  | 'cook'
  // « Le cercle » ＋ chooser — all navigate-only (NAV_TARGET): a person form, the
  // family builder, the connect / new-group flows, and a new business — opened on
  // /cercle via a ?param the page reads. No in-sheet form.
  | 'person'
  | 'family'
  | 'connect'
  | 'group'
  // Add a household service / vendor (vet, plumber, business card) — opens the
  // BusinessForm modal on /cercle via ?add=business. The Business tab no longer
  // carries its own add button; the ＋ FAB is the single entry, like the others.
  | 'business'
  // Add a pet (PersonKind 'pet') — a full-screen scene route (/cercle/pet/new),
  // like the person form, so the care form rides above the mobile keyboard.
  | 'pet'
  // Add a carnet (the house / the car / a thing we care for) — opens the CarnetForm
  // modal on /cercle via ?add=carnet. Mirrors `business`: the Carnets tab no longer
  // carries its own add button; the ＋ FAB is the single entry, like the others.
  | 'carnet'
  // « Ajouter une famille » — the RECIPIENT side of « Partager une famille ». Navigate-only
  // to /cercle/import (paste a share code, or land there from a shared link) to preview +
  // merge a family a friend on their own account shared with you.
  | 'family-import'
  // « Voyage » — start a new trip notebook. Navigate-only to /voyage/new (the create
  // form, then its scene). Operator-grade, like an event. Lets the planning rendez-vous
  // begin a trip straight from the board ＋.
  | 'voyage'
  // « Laisse un mot » (#mots) — leave a short member-to-member message (text / voice /
  // drawing / photo) for another face or the whole Maisonnée. An in-sheet composer (NOT
  // navigate-only): pick a recipient, then type or record. Any member can leave one (it's
  // not operator-grade), so a paired kiosk's kid can leave a mot for a parent too.
  | 'mot'
  // « Mes habitudes » — a new habit (walk, water, a weekly bike ride, a ceiling to
  // hold). Navigate-only to /habitude/new: it's a tall form (kind, cadence, target,
  // reminder times), so a scene rather than an in-sheet composer.
  | 'habit'
  // The board ＋ « Mes habitudes » tile opens a small in-sheet picker (the
  // routine-pick shape): a "new habit" button plus EVERY existing habit — non-due
  // and paused ones included — each tappable to edit. This is the manage door the
  // check-in scene can't be (it only rows habits still asking today). `habit`
  // stays the create-only nav used by deep-links and the check-in scene's button.
  | 'habit-pick'

// What the ＋ offers, per hub section (keyed by the first path segment). One
// action → the sheet skips the chooser and opens that form directly. Liste's ＋
// is a small chooser: add a line, restock past items (Ajout rapide), shop the
// flyers, or auto-pick the week's best prices. quick-add/flyer are navigate-only
// tiles (see NAV_TARGET in AddSheet); `auto-pick` runs an action in place (stages
// the best deal per line, then jumps to the cashier) — the page itself stays just
// the list, so no shopping action lives as an on-page button anymore.
export const SECTION_MODES: Record<string, AddSheetMode[]> = {
  // plan-today / plan-tomorrow are navigate-only shortcuts to the full day planner
  // (/kitchen/day/<date>): one place to set a day's meals + events + chores + note.
  // Their dates are dynamic, so AddSheet resolves the target at click time (like
  // cook/auto-pick) rather than through the static NAV_TARGET table.
  // ONE « Événement » tile — the unified event form covers a plain rendez-vous AND its
  // optional « Trajet » (car + passengers) / « À apporter » (bring-list) / recurrence,
  // so we no longer split it into three tiles. `ride`/`activity` stay as deep-links
  // (FORM_ROUTES, e.g. the L'auto card's quick "+ trajet") but aren't board ＋ tiles.
  // No `routine` tile here on purpose: routines have their OWN hub section (its ＋
  // creates + manages them), so offering "add a routine" from the board too was a
  // redundant second door. Add routines from Routines; the board ＋ stays the
  // glance-surface quick-adds that have no section of their own.
  board: ['note', 'event', 'chores-pick', 'todo', 'mot', 'habit-pick', 'voyage', 'plan-today', 'plan-tomorrow', 'departure'],
  // `cook` isn't an "add" — it's a shortcut to cook mode for the next meal due —
  // but it rides the kitchen ＋ as the most-wanted kitchen action (see AddSheet,
  // where it's navigate-only and resolves its target from the meal plan). `reserve`
  // adds to La réserve (freezer/back-of-pantry stash), the third Garde-manger list.
  kitchen: ['cook', 'recipe', 'book', 'meal', 'leftovers', 'pantry', 'reserve'],
  // The Routines tab's ＋ is the manage picker (create new + edit existing),
  // resolved in-sheet — see the `routine-pick` panel in AddSheet.
  routines: ['routine-pick'],
  liste: ['list-item', 'quick-add', 'flyer', 'auto-pick', 'share'],
  // Le cercle: add a person, build a family, connect two people, a new group, or a
  // business — all navigate-only tiles (the page opens connect/group/business from a
  // ?param). Every cercle subtab (Famille/Social/Notes/Business) offers the full set,
  // so e.g. "create a business" is reachable from the ＋ on any of them.
  cercle: ['person', 'family', 'connect', 'group', 'business', 'pet', 'carnet', 'family-import'],
}

// The operator-grade forms a kiosk that isn't signed in never sees as ＋ tiles.
// NOTE: `routine-pick` is deliberately NOT here — managing kid routines is the
// wall tablet's own job and the /api/routines POST/PATCH already accept a paired
// kiosk's device token (only member admin + device pairing stay operator-only,
// see functions/api/routines.ts). So the Routines-tab ＋ manage picker (new + edit
// existing) works on a parent-audience kiosk, matching the backend. Everything
// else here (event/chore add forms, capture, list, kitchen adds) is unchanged.
// `habit` is here because its form is a FormScene, which bounces any device that
// isn't signed in — showing the tile to an unsigned kiosk would lead to a dead
// bounce. (Marking a habit done on the check-in scene needs no session.)
// `habit-pick` rides along with `habit`: both of its doors land on the FormScene.
export const OPERATOR_MODES = new Set<AddSheetMode>(['event', 'ride', 'activity', 'chore', 'chores-pick', 'routine', 'voyage', 'habit', 'habit-pick'])

// The operator forms are full-screen SCENE routes now, not in-sheet forms: a
// tall multi-field form (a routine's name + member chips + template + card deck)
// strands its inputs under the mobile keyboard inside a height-capped sheet. As
// scenes they pin to the visible viewport and scroll. Every launch point routes
// here: the board chooser tiles (NAV_TARGET in AddSheet), the routines ＋ FAB and
// the Réglages add buttons (open() in HubLayout).
export const FORM_ROUTES: Partial<Record<AddSheetMode, string>> = {
  event: '/event/new',
  // A ride is the event form with its Transport block pre-opened (?ride=1).
  ride: '/event/new?ride=1',
  // An activity is the event form, weekly + logistics open (?activity=1).
  activity: '/event/new?activity=1',
  chore: '/chore/new',
  routine: '/routine/new',
  voyage: '/voyage/new',
  habit: '/habitude/new',
}

// Every mode, as a runtime list — what validates a ?plus=<mode> deep-link
// (HubLayout) and what guideLinks.test.ts checks guide links against. The
// `satisfies` keeps it complete: adding a mode to the union without listing it
// here (or vice versa) fails tsc.
const ALL_MODES = {
  note: 1,
  event: 1,
  ride: 1,
  activity: 1,
  chore: 1,
  'chores-pick': 1,
  todo: 1,
  routine: 1,
  'routine-pick': 1,
  'plan-today': 1,
  'plan-tomorrow': 1,
  departure: 1,
  'list-item': 1,
  'quick-add': 1,
  flyer: 1,
  'auto-pick': 1,
  share: 1,
  recipe: 1,
  book: 1,
  meal: 1,
  leftovers: 1,
  pantry: 1,
  reserve: 1,
  cook: 1,
  person: 1,
  family: 1,
  connect: 1,
  group: 1,
  business: 1,
  pet: 1,
  carnet: 1,
  'family-import': 1,
  voyage: 1,
  mot: 1,
  habit: 1,
  'habit-pick': 1,
} as const satisfies Record<AddSheetMode, 1>
export const ADD_MODES = Object.keys(ALL_MODES) as readonly AddSheetMode[]

export const AddSheetContext = createContext<{ open: (mode?: AddSheetMode, modes?: AddSheetMode[]) => void }>({
  open: () => {},
})

export const useAddSheet = () => useContext(AddSheetContext)
