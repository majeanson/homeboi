import { useT } from '../../i18n'
import { type HelpMode } from '../../lib/helpMode'
import { type ReserveLocation, seedReserveDefaults } from '../../lib/reservePrefs'
import { HouseholdListSection } from './HouseholdListSection'

// Réglages ▸ Réserve. The household-level storage spots that group La réserve (the
// freezer / back-of-pantry reminder in La cuisine). Custom & editable: rename,
// recolour, remove, or add your own (basement freezer, cold room…). Seeded with two
// defaults — Garde-manger + Congélateur; an empty list is valid (items fall under
// "Autres"). Persists on /api/household → invalidates HOUSEHOLD_KEY so La cuisine
// re-groups live via useReserveLocations. A thin wrapper over the shared
// <HouseholdListSection> (the « L'auto » twin); only the field key, seed, and copy differ.
export function ReserveLocationsSection({ help }: { help?: HelpMode }) {
  const t = useT()
  return (
    <HouseholdListSection<ReserveLocation>
      field="reserveLocations"
      seed={() => seedReserveDefaults(t.kitchen.reserveDefaultPantry, t.kitchen.reserveDefaultFreezer)}
      help={help}
      helpKey="reserveLocations"
      labels={{
        title: t.operator.reserveTitle,
        name: t.operator.reserveLocationName,
        add: t.operator.reserveAddLocation,
        empty: t.operator.reserveEmpty,
      }}
    />
  )
}
