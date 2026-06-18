import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from './api'
import { HOUSEHOLD_KEY } from './queryKeys'
import type { HouseholdSettings } from './mealPrefs'
import type { MeasureUnit } from './measure'
import {
  DEFAULT_MEASURE_COLORS,
  DEFAULT_UNIT_FALLBACK,
  type MeasureOverrides,
} from './measureColors'

// Editable measuring-tool colours — the HOUSEHOLD maps each pill / scoop circle to
// the colour of its OWN physical measuring spoons and cups (Réglages ▸ Affichage),
// shared across the wall tablet and every phone (everyone uses the same spoons).
// Persisted server-side on /api/household (migration 0048), read via the shared
// HOUSEHOLD_KEY query so a colour edit repaints every recipe + Cook-mode surface
// the moment the cache refreshes — the same pattern as the meal-slot colours
// (lib/mealPrefs). The DEFAULTS live in measureColors.ts; only the per-household
// overrides ride on the household settings.

export interface MeasureSwatch {
  id: string // override key: a tool key ("1|tbsp") or a unit fallback ("unit:cup")
  kind: 'tool' | 'unit'
  unit: MeasureUnit
  label: { fr: string; en: string }
  def: string // the default colour (the stock spoon set / unit tint)
}

// The nine editable swatches: the six physical spoons (exact amount + unit), then
// the three per-unit fallbacks used for any OTHER amount of that unit (e.g. a cup,
// or an odd spoon size not in the set). Order = how they read in the settings grid.
// Keep these ids in sync with functions/_lib/measureColors.ts (the PATCH validator).
export const MEASURE_SWATCHES: MeasureSwatch[] = [
  { id: '1|tbsp', kind: 'tool', unit: 'tbsp', def: DEFAULT_MEASURE_COLORS['1|tbsp'], label: { fr: '1 c. à soupe', en: '1 tbsp' } },
  { id: '1/2|tbsp', kind: 'tool', unit: 'tbsp', def: DEFAULT_MEASURE_COLORS['1/2|tbsp'], label: { fr: '½ c. à soupe', en: '½ tbsp' } },
  { id: '1|tsp', kind: 'tool', unit: 'tsp', def: DEFAULT_MEASURE_COLORS['1|tsp'], label: { fr: '1 c. à thé', en: '1 tsp' } },
  { id: '1/2|tsp', kind: 'tool', unit: 'tsp', def: DEFAULT_MEASURE_COLORS['1/2|tsp'], label: { fr: '½ c. à thé', en: '½ tsp' } },
  { id: '1/4|tsp', kind: 'tool', unit: 'tsp', def: DEFAULT_MEASURE_COLORS['1/4|tsp'], label: { fr: '¼ c. à thé', en: '¼ tsp' } },
  { id: '1/8|tsp', kind: 'tool', unit: 'tsp', def: DEFAULT_MEASURE_COLORS['1/8|tsp'], label: { fr: '⅛ c. à thé', en: '⅛ tsp' } },
  { id: 'unit:tbsp', kind: 'unit', unit: 'tbsp', def: DEFAULT_UNIT_FALLBACK.tbsp, label: { fr: 'c. à soupe (autre quantité)', en: 'tablespoon (other amount)' } },
  { id: 'unit:tsp', kind: 'unit', unit: 'tsp', def: DEFAULT_UNIT_FALLBACK.tsp, label: { fr: 'c. à thé (autre quantité)', en: 'teaspoon (other amount)' } },
  { id: 'unit:cup', kind: 'unit', unit: 'cup', def: DEFAULT_UNIT_FALLBACK.cup, label: { fr: 'Tasse', en: 'Cup' } },
]

const EMPTY: MeasureOverrides = {}

// Live household overrides. Pass the result to measureColor(m, ov) so a colour edit
// re-renders every pill/scoop. Falls back to {} (pure defaults) before the
// household settings load or where the actor can't read them (e.g. a 401 kiosk).
export function useMeasureColors(): MeasureOverrides {
  const { data } = useQuery({
    queryKey: HOUSEHOLD_KEY,
    queryFn: () => api<HouseholdSettings>('household'),
    staleTime: 5 * 60_000,
  })
  return data?.measureColors ?? EMPTY
}

// The current colour shown for a swatch in the settings grid (override or default).
export function swatchColor(s: MeasureSwatch, ov: MeasureOverrides): string {
  return ov[s.id] ?? s.def
}

// Editor for the settings section: a live optimistic preview while the colour
// picker is open, then one PATCH on commit (so dragging the picker doesn't spam the
// API). `preview` only paints the shared cache; `commit`/`reset` persist + refetch.
export function useMeasureColorsEditor() {
  const qc = useQueryClient()
  const overrides = useMeasureColors()

  // Paint the shared household cache so every pill/scoop (and the settings preview)
  // updates instantly — no network. Used on each colour-input change.
  const paint = (next: MeasureOverrides) => {
    qc.setQueryData<HouseholdSettings>(HOUSEHOLD_KEY, (old) =>
      old ? { ...old, measureColors: next } : { measureColors: next },
    )
  }

  const persist = async (next: MeasureOverrides) => {
    paint(next)
    try {
      await api('household', { method: 'PATCH', body: { measureColors: next } })
    } finally {
      qc.invalidateQueries({ queryKey: HOUSEHOLD_KEY })
    }
  }

  return {
    overrides,
    // live preview (no save) — for the picker's onChange while dragging
    preview: (id: string, color: string) => paint({ ...overrides, [id]: color }),
    // persist one tool's colour — for the picker's onBlur (commit)
    commit: (id: string, color: string) => persist({ ...overrides, [id]: color }),
    // back to the stock spoon-set palette
    reset: () => persist({}),
  }
}
