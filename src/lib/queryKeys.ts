// Shared TanStack Query keys for data read from more than one page. A key
// defined twice drifts silently (same string today, two caches after a rename),
// so the cross-page ones live here. Kitchen-only keys stay in
// components/kitchen/types.ts beside the code that owns them.
export const BOARD_KEY = ['board']
export const ROUTINES_KEY = ['routines']
// Household-level settings (postal, store filter, per-slot meal colours +
// hide-list). Read on the board/kitchen (meal colours) AND in Réglages, so the
// key is shared: a settings PATCH invalidates it and every meal surface re-tints.
export const HOUSEHOLD_KEY = ['household']
// Family "favorites" hearts (#21): who loves which recipe. Read on the recipe
// list/view AND on planned meals (board + kitchen), so the key is shared — a
// heart toggle invalidates it and every surface re-renders its hearts at once.
export const LOVES_KEY = ['recipe-loves']
