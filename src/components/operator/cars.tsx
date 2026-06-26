import { useT } from '../../i18n'
import { type HelpMode } from '../../lib/helpMode'
import { type Car, seedCarDefaults } from '../../lib/carPrefs'
import { HouseholdListSection } from './HouseholdListSection'

// Réglages ▸ L'auto. The household-level vehicle(s) that « L'auto » coordinates around
// — the scarce, shared car (one in most homes; the list allows a second). Custom &
// editable: rename, recolour, remove, or add a car. Seeded with one localized default
// (« L'auto »); an empty list is a valid choice (a carpool-only household). Persists on
// /api/household → invalidates HOUSEHOLD_KEY so every ride picker / car glance re-reads
// via useCars. A thin wrapper over the shared <HouseholdListSection> (the « réserve »
// twin); only the field key, the seed, and the copy differ.
export function CarsSection({ help }: { help?: HelpMode }) {
  const t = useT()
  return (
    <HouseholdListSection<Car>
      field="cars"
      seed={() => seedCarDefaults(t.operator.carDefaultName)}
      help={help}
      helpKey="cars"
      labels={{ title: t.operator.carsTitle, name: t.operator.carName, add: t.operator.carAdd, empty: t.operator.carsEmpty }}
    />
  )
}
