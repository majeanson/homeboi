// ┌─────────────────────────────────────────────────────────────────────────┐
// │  MEASURING-TOOL COLOURS — matched to the household colour-coded spoon set. │
// │                                                                           │
// │  The colour is keyed PER TOOL: a quantity + a unit ("1/4|tsp" = the       │
// │  quarter-teaspoon spoon). Each pill is tinted to the actual measuring      │
// │  spoon, so a child can hear the amount and grab the right-coloured tool.   │
// │                                                                           │
// │  Keys: `${qty}|${unit}` where                                             │
// │    qty  = "1/8" "1/4" "1/3" "3/8" "1/2" "5/8" "2/3" "3/4" "7/8"           │
// │           "1" "2" … or a mixed "1 1/2"  (see qtyKey() in measure.ts)       │
// │    unit = "tsp" (c. à thé) | "tbsp" (c. à soupe) | "cup" (tasse)           │
// │                                                                           │
// │  Six physical spoons + a measuring-cup set, each a distinct colour so a     │
// │  child can grab the right tool (the label print + a calm, lighting-         │
// │  corrected band colour for the spoons; a cool-toned default palette for the │
// │  cups, which a household recolours to match its own cups in Réglages). A    │
// │  size NOT in either set (an odd amount like 2 cups / 1½ tbsp) falls back to │
// │  a muted per-unit tint — it still gets a tappable read-aloud pill, just not │
// │  a vivid tool colour.                                                       │
// └─────────────────────────────────────────────────────────────────────────┘
import type { Measure, MeasureUnit } from './measure'

// The six real spoons, left→right on the fan: 1 tbs, 1/2 tbs, 1 tsp, 1/2 tsp,
// 1/4 tsp, 1/8 tsp. These are the DEFAULTS — a household can recolour each one to
// match its own physical spoon set in Réglages ▸ Affichage (see lib/measurePrefs).
export const DEFAULT_MEASURE_COLORS: Record<string, string> = {
  // — tablespoon (c. à soupe) —
  '1|tbsp': '#8DB63C', // leaf green   (label "1 tbs")
  '1/2|tbsp': '#8A5A33', // brown        (label "1/2 tbs")
  // — teaspoon (c. à thé) —
  '1|tsp': '#E8BC2E', // golden yellow (label "1 tsp")
  '1/2|tsp': '#5F7A33', // forest green (label "1/2 tsp")
  '1/4|tsp': '#2BA39A', // teal         (label "1/4 tsp")
  '1/8|tsp': '#E8762A', // orange       (label "1/8 tsp")
  // — cup (tasse) — the household's real colour-coded measuring-cup set, a fan of
  // seven nested cups, each its own colour like the spoons so "¼ tasse" reads the
  // same way as "¼ c. à soupe". Colours matched to the physical cups (teal → sage →
  // lavender → steel-blue → terracotta → gold → pink). Other amounts (2 cups, 1½ cup)
  // still fall back to the muted per-unit "cup" tint below.
  '1|cup': '#86C7BE', // teal      (largest)
  '3/4|cup': '#A9BD8C', // sage green
  '2/3|cup': '#B3A6D6', // lavender
  '1/2|cup': '#6F93AC', // steel blue
  '1/3|cup': '#B36545', // terracotta
  '1/4|cup': '#E2A82C', // golden yellow
  '1/8|cup': '#EA9DAE', // pink      (smallest)
}

// No colour-coded tool for this amount — a soft, greyed tint per unit so the pill
// reads as "generic spoon/cup" without competing with the six vivid tool colours.
// Also editable (a household with colour-coded cups can give "cup" a real colour).
export const DEFAULT_UNIT_FALLBACK: Record<MeasureUnit, string> = {
  tsp: '#B6A0AE', // soft mauve-grey
  tbsp: '#A9B49A', // soft sage-grey
  cup: '#9DB9C4', // soft blue-grey (any cup amount not in the set above)
}

// A household's colour overrides: tool keys ("1|tbsp") and per-unit fallbacks keyed
// "unit:<unit>" ("unit:cup"). Empty = pure defaults. Built + persisted by
// lib/measurePrefs; passed in here so this module stays pure (no React, no storage).
export type MeasureOverrides = Record<string, string>

// The colour for a measure: a household override for the exact tool, else the
// default tool colour, else an override for the unit, else the unit default, else
// null (caller renders a neutral, still-tappable pill). `ov` defaults to empty so
// non-React callers (and tests) get the stock palette.
export function measureColor(m: Measure, ov: MeasureOverrides = {}): string | null {
  return ov[m.key] ?? DEFAULT_MEASURE_COLORS[m.key] ?? ov[`unit:${m.unit}`] ?? DEFAULT_UNIT_FALLBACK[m.unit] ?? null
}
