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
import { qtyKey, type Measure, type MeasureUnit } from './measure'

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

// The colour actually painted for a tool key (override, else the stock default).
const toolColor = (key: string, ov: MeasureOverrides): string | undefined => ov[key] ?? DEFAULT_MEASURE_COLORS[key]

// A whole multiple of a tool ("2 c. à thé", "3 tasses") is just N fills of the
// 1-unit tool, so it carries THAT tool's colour rather than the muted "autre
// quantité" tint. (An exact "1|unit" already keys to its own tool above; only 2,
// 3, … land here.) Returns the base "1|unit" key, or null when it isn't a plain
// whole multiple.
function baseToolKey(m: Measure): string | null {
  if (!/^\d+$/.test(m.qty)) return null
  const base = `1|${m.unit}`
  return DEFAULT_MEASURE_COLORS[base] ? base : null
}

// The colour for a measure: a household override for the exact tool, else the
// default tool colour, else — for a whole multiple — the base tool's colour, else
// an override for the unit, else the unit default, else null (caller renders a
// neutral, still-tappable pill). `ov` defaults to empty so non-React callers (and
// tests) get the stock palette.
export function measureColor(m: Measure, ov: MeasureOverrides = {}): string | null {
  const base = baseToolKey(m)
  return (
    ov[m.key] ??
    DEFAULT_MEASURE_COLORS[m.key] ??
    (base ? toolColor(base, ov) : undefined) ??
    ov[`unit:${m.unit}`] ??
    DEFAULT_UNIT_FALLBACK[m.unit] ??
    null
  )
}

// The sub-1 tool amounts available per unit (largest first), derived from the stock
// palette — used to greedily split an odd remainder into the tools that DO exist.
const FRAC_VALUE: Record<string, number> = {
  '1/8': 1 / 8, '1/4': 1 / 4, '1/3': 1 / 3, '3/8': 3 / 8,
  '1/2': 1 / 2, '5/8': 5 / 8, '2/3': 2 / 3, '3/4': 3 / 4, '7/8': 7 / 8,
}
const FRACTION_TOOLS: Record<MeasureUnit, [number, string][]> = { tsp: [], tbsp: [], cup: [] }
for (const key of Object.keys(DEFAULT_MEASURE_COLORS)) {
  const [qty, unit] = key.split('|') as [string, MeasureUnit]
  const v = FRAC_VALUE[qty]
  if (v != null) FRACTION_TOOLS[unit].push([v, key])
}
for (const u of Object.keys(FRACTION_TOOLS) as MeasureUnit[]) FRACTION_TOOLS[u].sort((a, b) => b[0] - a[0])

// One drawn scoop circle: a colour + how full it is (1 = a complete scoop of that
// tool; <1 = a part-filled circle for a remainder that has no dedicated tool).
export interface Scoop {
  color: string
  fill: number
}

// Decompose a measure into the physical scoops a cook would actually fill, each
// circle tinted to its OWN tool: "2 c. à thé" → two yellow 1-tsp circles (not one
// mauve "×2"); "1 ½ tasse" → one teal 1-cup + one steel-blue ½-cup. A fraction with
// a dedicated tool (¼, ½, ⅓…) is one FULL circle of that tool (its colour already
// says which fraction it is); an odd remainder with no tool greedily splits into the
// tools that DO exist, else a single part-filled fallback circle. Pure — pass the
// household overrides so it honours custom colours.
export function measureScoops(m: Measure, ov: MeasureOverrides = {}): Scoop[] {
  const whole = Math.floor(m.value + 1e-9)
  const frac = m.value - whole
  const baseColor = toolColor(`1|${m.unit}`, ov) ?? DEFAULT_UNIT_FALLBACK[m.unit]
  const scoops: Scoop[] = []
  for (let i = 0; i < whole; i++) scoops.push({ color: baseColor, fill: 1 })

  if (frac > 0.05) {
    const exact = toolColor(`${qtyKey(frac)}|${m.unit}`, ov)
    if (exact) {
      // A real nested cup/spoon (¼ tasse, ½ c. à thé…) — one FULL scoop of it.
      scoops.push({ color: exact, fill: 1 })
    } else {
      // No dedicated tool for this remainder — fill the biggest tools that fit.
      let rem = frac
      const pieces: Scoop[] = []
      for (const [val, key] of FRACTION_TOOLS[m.unit]) {
        while (rem >= val - 0.02 && pieces.length < 4) {
          pieces.push({ color: toolColor(key, ov)!, fill: 1 })
          rem -= val
        }
      }
      if (pieces.length && rem <= 0.05) scoops.push(...pieces)
      else scoops.push({ color: ov[`unit:${m.unit}`] ?? DEFAULT_UNIT_FALLBACK[m.unit], fill: frac })
    }
  }

  if (scoops.length === 0) scoops.push({ color: baseColor, fill: 1 })
  return scoops
}
