import { useState } from 'react'
import { useT } from '../../i18n'
import { type HelpMode } from '../../lib/helpMode'
import { wash } from '../../lib/colors'
import { isGuest } from '../../lib/device'
import { useHouseholdListSetting, type HouseholdListItem } from '../../lib/householdListSetting'
import { ColorPicker } from '../ColorPicker'
import { EditField } from '../EditField'
import { RowActions } from '../RowActions'
import { EmptyState } from '../EmptyState'
import { StatusMessage } from '../StatusMessage'
import { OperatorSection } from './OperatorSection'

export interface HouseholdListLabels {
  title: string
  name: string // a11y label for the name field / colour picker
  add: string // the "add a …" field placeholder + label
  empty: string // the empty-list message
}

// THE shared Réglages section for a "household list setting" — a small editable list
// of `{id, name, colour}` items kept in one `households.*` JSON column. « L'auto »
// (cars) and « La réserve » (reserve locations) are byte-for-byte the same coloured
// -legend list + ColorPicker + add field + optimistic-save + undoable delete; this is
// that one component, driven by `useHouseholdListSetting`. A new such setting wires a
// `field` + localized `seed` + `labels` and gets the whole section for free.
//
// Read-only guest: the list reads as a coloured legend — no rename / recolour / add
// (RowActions hides its own delete for a guest too).
export function HouseholdListSection<T extends HouseholdListItem>({
  field,
  seed,
  labels,
  help,
  helpKey,
}: {
  field: string // the /api/household read + PATCH key ('cars' | 'reserveLocations')
  seed: () => T[] // localized defaults when the column was never set
  labels: HouseholdListLabels
  help?: HelpMode
  helpKey?: string
}) {
  const t = useT()
  const { items, status, setItems, rename, recolor, remove, add } = useHouseholdListSetting<T>(
    field,
    seed,
    (name) => t.undo.cleared(name),
  )
  const [adding, setAdding] = useState('')
  const ro = isGuest()

  if (items === null) return <p className="loading mono">{t.common.loading}</p>

  return (
    <OperatorSection title={labels.title} help={help} helpKey={helpKey}>
      {items.length === 0 ? (
        <EmptyState>{labels.empty}</EmptyState>
      ) : (
        <ul className="operator__list meal-slots">
          {items.map((it) => (
            <li key={it.id} className="meal-slots__row">
              <span className="meal-slots__name">
                <span
                  className="meal-slots__chip"
                  style={{ background: wash(it.color ?? '#888888'), color: it.color }}
                  aria-hidden="true"
                />
                {ro ? (
                  <span className="meal-slots__label">{it.name}</span>
                ) : (
                  <input
                    className="input"
                    value={it.name}
                    onChange={(e) => setItems(items.map((x) => (x.id === it.id ? { ...x, name: e.target.value } : x)))}
                    onBlur={(e) => rename(it.id, e.target.value.trim().slice(0, 40) || it.name)}
                    aria-label={labels.name}
                  />
                )}
              </span>
              {!ro && (
                <div className="meal-slots__pick">
                  <ColorPicker value={it.color ?? '#888888'} onChange={(col) => recolor(it.id, col)} label={labels.name} />
                </div>
              )}
              <RowActions onDelete={() => remove(it.id)} deleteLabel={`${t.common.delete} — ${it.name}`} />
            </li>
          ))}
        </ul>
      )}
      {!ro && (
        <EditField
          value={adding}
          onChange={setAdding}
          onSubmit={() => {
            add(adding)
            setAdding('')
          }}
          submitLabel={t.common.add}
          placeholder={labels.add}
          ariaLabel={labels.add}
        />
      )}
      {status === 'saved' && <StatusMessage tone="success">{t.operator.postalSaved}</StatusMessage>}
      {status === 'bad' && <StatusMessage tone="error">{t.operator.postalBad}</StatusMessage>}
    </OperatorSection>
  )
}
