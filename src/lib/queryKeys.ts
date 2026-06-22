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
// Le cercle (people directory): contacts + relationship edges, read on the cercle
// tab AND on the board (upcoming birthdays derive from it), so the key is shared —
// a contact/birthday edit invalidates it and both surfaces refresh.
export const CERCLE_KEY = ['cercle']
// Le cercle → Famille → "Notes & recommandations": durable per-member / family-wide
// quick notes. Read on the cercle tab AND by the global search, so the key is shared.
export const FAMILY_NOTES_KEY = ['family-notes']
// Le cercle → Business: the services/vendors directory (vet, plumber…). Read on the
// cercle Business tab AND by the EventForm "Avec" picker (a rendez-vous can link a
// business), so the key is shared — adding a business there refreshes the picker.
export const BUSINESSES_KEY = ['businesses']
// « L'auto » — the weekly work-schedule template (schedule_blocks). Read in Réglages
// ▸ L'auto AND by the /voiture week view (it resolves the car's busy spans from it),
// so the key is shared — editing an horaire refreshes the week + the board glance.
export const SCHEDULE_KEY = ['schedule']
// « L'auto » resolved read model (/api/car): the car's busy spans + rides +
// conflicts. The board glance reads today under ['car']; the /voiture week reads its
// window under ['car', from] (a prefix of CAR_KEY). Invalidated by a ride, an
// horaire, or a car_day override so every car surface re-resolves at once.
export const CAR_KEY = ['car']
