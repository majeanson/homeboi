import { BOARD_KEY, MONTH_KEY, HOME_PROJECTS_KEY } from './queryKeys'
import { MEALS_KEY, MEAL_HISTORY_KEY, PANTRY_KEY, LEFTOVERS_KEY } from '../components/kitchen/types'

// The caches ONE capture can land in. The capture spine (functions/api/capture)
// routes a line to an event, task, list item, pantry-low flag, meal, leftover,
// home project or note — so a caller can't know which cache moved and has to
// invalidate the lot.
//
// It lives in its own pure module (no React, no component imports) because TWO
// surfaces write captures and must not drift apart: the ＋ sheet's `CaptureForm`
// and the PWA share-target scene `pages/SharePage`. Keeping the list inside
// CaptureForm would have made /share import that whole component graph
// (EditField, Disclosure, useVoiceInput…) just to reach an array of strings —
// a real cost with the bundle budget in scripts/check-bundle.mjs.
//
// Both of the modules it draws from are import-free constant files, so this adds
// nothing to a chunk beyond the strings themselves.
export const CAPTURE_KEYS = [
  BOARD_KEY,
  MEALS_KEY,
  PANTRY_KEY,
  LEFTOVERS_KEY,
  MONTH_KEY,
  MEAL_HISTORY_KEY,
  HOME_PROJECTS_KEY,
]
