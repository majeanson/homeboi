import { useT } from '../../i18n'
import { useOperatorT } from '../../i18n.operator'
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
  const o18n = useOperatorT()
  return (
    <HouseholdListSection<ReserveLocation>
      field="reserveLocations"
      seed={() => seedReserveDefaults(t.kitchen.reserveDefaultPantry, t.kitchen.reserveDefaultFreezer)}
      help={help}
      helpKey="reserveLocations"
      labels={{
        title: o18n.reserveTitle,
        name: o18n.reserveLocationName,
        add: o18n.reserveAddLocation,
        empty: o18n.reserveEmpty,
      }}
    />
  )
}
