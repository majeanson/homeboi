import type { Cut, Lang, Orientation } from './manifest'

// The script ids that have been captured into public/captures/. Must match the
// folder names the capture rig writes (promo/scripts/index.ts → SCRIPTS[].id).
// Add an id here after you author + capture a new script.
export const SCRIPT_IDS = ['tour']

export const ORIENTATIONS: { name: Orientation; width: number; height: number }[] = [
  { name: 'landscape', width: 1920, height: 1080 },
  { name: 'vertical', width: 1080, height: 1920 },
]

export const LANGS: Lang[] = ['fr', 'en']

// Compositions are registered for both cuts so the studio can preview either. The
// render-all script only renders the cuts a script actually declares (manifest.cuts),
// and `beatsForCut` falls back to the full beat list if a short cut has no flagged beats.
export const CUTS: Cut[] = ['full', 'short']
