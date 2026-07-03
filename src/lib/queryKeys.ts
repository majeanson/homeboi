// Shared TanStack Query keys for data read from more than one page. A key
// defined twice drifts silently (same string today, two caches after a rename),
// so the cross-page ones live here. Kitchen-only keys stay in
// components/kitchen/types.ts beside the code that owns them.
export const BOARD_KEY = ['board']
// The calendar/agenda window (/api/month): events + recurring-chore occurrences +
// the day's OPEN À compléter todos. Read by MonthView (['month', from]) AND the day
// page (['month', date]); written by the event/chore forms and any todo done/edit
// (a todo's done state changes which rows /api/month returns). Shared so all those
// sites agree on one key — invalidating MONTH_KEY prefix-matches every windowed read.
export const MONTH_KEY = ['month']
export const ROUTINES_KEY = ['routines']
// The kept-drawing collection (« Mes dessins », #14). Cross-page: the gallery page,
// the board paint badge, and lib/drawingGallery all key off it.
export const DRAWINGS_KEY = ['drawings']
// Deployment + household capabilities from /api/health (binding presence + the
// effective AI on/off state). Read in Réglages, on Signup, AND by the shared
// useAi() hook that hides every AI affordance — shared so the AI toggle's PATCH
// can invalidate it and the whole UI flips at once.
export const HEALTH_KEY = ['health']
// Household-level settings (postal, store filter, per-slot meal colours +
// hide-list). Read on the board/kitchen (meal colours) AND in Réglages, so the
// key is shared: a settings PATCH invalidates it and every meal surface re-tints.
export const HOUSEHOLD_KEY = ['household']
// Family "favorites" hearts (#21): who loves which recipe. Read on the recipe
// list/view AND on planned meals (board + kitchen), so the key is shared — a
// heart toggle invalidates it and every surface re-renders its hearts at once.
export const LOVES_KEY = ['recipe-loves']
// À cocher (todos): the board glance reads the global-+-today set under this key;
// the day page reads its day under ['todos', <day>] — a prefix of TODOS_KEY, so
// invalidating TODOS_KEY refreshes both. Templates feed Réglages + the picker.
export const TODOS_KEY = ['todos']
export const TODO_TEMPLATES_KEY = ['todo-templates']
// « À régler » — the cross-domain heads-up scan (functions/api/a-regler). Read by
// the board card AND the « Cette semaine » block, so the key is shared.
export const A_REGLER_KEY = ['a-regler']
// Opt-in purchase-tracking predictions (/api/ghost — « souvent racheté »). Read by
// La liste, the Quick-add page, and the AddSheet quick-add; written when an item is
// added/bought. Shared so a list add refreshes the prediction strip everywhere.
export const GHOSTS_KEY = ['ghosts']
// Shopping-list purchase history (the « déjà acheté » log). Read by La liste, Quick-add,
// and Réglages ▸ Magasinage. Shared so a purchase/clear refreshes all three.
export const HISTORY_KEY = ['list-history']
// Projets & Entretien (home_projects): the longer-horizon home work under Corvées.
// Read by the Réglages Corvées sub-tabs (Projets/Entretien) AND surfaced on the
// board + month (dated upkeep), so the key is shared — an edit invalidates it and
// every surface refreshes. Filtered by `kind` ('plan'|'upkeep') on the client.
export const HOME_PROJECTS_KEY = ['home-projects']
// Le cercle (people directory): contacts + relationship edges, read on the cercle
// tab AND on the board (upcoming birthdays derive from it), so the key is shared —
// a contact/birthday edit invalidates it and both surfaces refresh.
export const CERCLE_KEY = ['cercle']
// Le cercle → Famille → "Notes & recommandations": durable per-member / family-wide
// quick notes. Read on the cercle tab AND by the global search, so the key is shared.
export const FAMILY_NOTES_KEY = ['family-notes']
// « Laisse un mot » (member-to-member messages): read by the board's « Mots » inbox card
// AND the per-face presence dot on the board's face row, so the key is shared — leaving /
// opening / keeping a mot invalidates it and both surfaces refresh at once.
export const MOTS_KEY = ['mots']
// Le cercle → Business: the services/vendors directory (vet, plumber…). Read on the
// cercle Business tab AND by the EventForm "Avec" picker (a rendez-vous can link a
// business), so the key is shared — adding a business there refreshes the picker.
export const BUSINESSES_KEY = ['businesses']
// « Les carnets » — the cared-for-things tree (/api/carnets) + the lifecycle "soon"
// glance. Read by the cercle « Les carnets » SubTab, the carnet scene, AND the board
// « Les carnets » card, so the key is shared — a carnet/care-log edit invalidates it
// and every surface refreshes. A carnet's history reads ['care-log', <id>].
export const CARNETS_KEY = ['carnets']
export const CARE_LOG_KEY = ['care-log']
// « En cas de pépin » — a home carnet's map pins (/api/home-pins). Read per-carnet as
// ['home-pins', <id>]; a prefix invalidation refreshes the open map.
export const HOME_PINS_KEY = ['home-pins']
// « L'auto » — the weekly work-schedule template (schedule_blocks). Read in Réglages
// ▸ L'auto AND by the /voiture week view (it resolves the car's busy spans from it),
// so the key is shared — editing an horaire refreshes the week + the board glance.
export const SCHEDULE_KEY = ['schedule']
// « L'auto » resolved read model (/api/car): the car's busy spans + rides +
// conflicts. The board glance reads today under ['car']; the /voiture week reads its
// window under ['car', from] (a prefix of CAR_KEY). Invalidated by a ride, an
// horaire, or a car_day override so every car surface re-resolves at once.
export const CAR_KEY = ['car']
// « Voyage » — trips (/api/trips): read by the trip scene, the board "Prochain
// voyage" card, AND the month band, so the key is shared. A trip's content reads
// per-trip prefix keys: its notes/itinerary under ['trip-notes', <id>] and its
// per-member packing under ['trip-packing', <id>] — a bare-prefix invalidation
// (TRIP_NOTES_KEY / TRIP_PACKING_KEY) refreshes the open trip.
export const TRIPS_KEY = ['trips']
export const TRIP_NOTES_KEY = ['trip-notes']
export const TRIP_PACKING_KEY = ['trip-packing']
// Household members (/api/members): the roster read across the board, capture,
// forms, and Réglages — shared so a member edit invalidates one key everywhere.
export const MEMBERS_KEY = ['members']
// Photo-frame / gallery photos (/api/photos): read on the board frame AND Réglages
// media, so the key is shared.
export const PHOTOS_KEY = ['photos']
// Calendar events (/api/events): read by the event forms + Réglages agenda.
export const EVENTS_KEY = ['events']
// Chores/tasks (/api/chores): read by the chore forms + Réglages corvées.
export const CHORES_KEY = ['chores']
// Weather glance (/api/weather): read on the board + departure + day page.
export const WEATHER_KEY = ['weather']
// Paired devices (/api/devices): read in Réglages devices.
export const DEVICES_KEY = ['devices']
// Flyers/circulaires (/api/flyers): read by the flyer viewer + Réglages shopping.
export const FLYERS_KEY = ['flyers']
// AI error journal (/api/ai-errors): read in Réglages Debug.
export const AI_ERRORS_KEY = ['ai-errors']
// Sample/demo data presence (/api/seed → { count }): read by the board banner
// (« Exemples pour explorer ») AND the Réglages sample-data control, so the key is
// shared — seeding or clearing invalidates it and both surfaces agree at once.
export const SAMPLE_KEY = ['sample']
// Unifies the per-kind guest-window read keys: WelcomePage/HandoffPage/
// FamilyWindowPage use no sub, Postbox uses 'postbox', IntakeForm uses 'intake'.
// `preview` is the operator's ?preview=<kind> override (null → 'self').
export function guestWindowKey(preview: string | null | undefined, sub?: string) {
  return sub ? ['guest-window', preview ?? 'self', sub] : ['guest-window', preview ?? 'self']
}
