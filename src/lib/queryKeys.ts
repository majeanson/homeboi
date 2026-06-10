// Shared TanStack Query keys for data read from more than one page. A key
// defined twice drifts silently (same string today, two caches after a rename),
// so the cross-page ones live here. Kitchen-only keys stay in
// components/kitchen/types.ts beside the code that owns them.
export const BOARD_KEY = ['board']
export const ROUTINES_KEY = ['routines']
