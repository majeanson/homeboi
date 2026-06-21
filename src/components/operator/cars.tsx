import { useCallback, useEffect, useState } from 'react'
import { useT } from '../../i18n'
import { type HelpMode } from '../../lib/helpMode'
import { api } from '../../lib/api'
import { useWrite } from '../../lib/write'
import { useUndoToast } from '../../lib/toast'
import { HOUSEHOLD_KEY } from '../../lib/queryKeys'
import { wash, PALETTE } from '../../lib/colors'
import { isGuest } from '../../lib/device'
import { type Car, seedCarDefaults } from '../../lib/carPrefs'
import { ColorPicker } from '../ColorPicker'
import { EditField } from '../EditField'
import { RowActions } from '../RowActions'
import { EmptyState } from '../EmptyState'
import { StatusMessage } from '../StatusMessage'
import { OperatorSection } from './OperatorSection'

// Réglages ▸ L'auto. The household-level vehicle(s) that « L'auto » coordinates
// around — the scarce, shared car (one in most homes; the list allows a second).
// Custom & editable: rename, recolour, remove, or add a car. Seeded with one
// localized default (« L'auto »), shown editable; an empty list is a valid choice
// (a carpool-only household with no car of its own — rides then ride on a partner's
// car). Persists on /api/household; saving invalidates HOUSEHOLD_KEY so every ride
// picker / car glance re-reads the same key via useCars.
//
// Mirrors ReserveLocationsSection deliberately — same household-config shape, same
// optimistic-save + undoable-delete pattern. The KNOWN LIMITATION there (whole-array
// PATCH = two concurrent operator tabs last-write-win) applies identically and is
// acceptable for the same reason (one-operator-per-household).
export function CarsSection({ help }: { help?: HelpMode }) {
  const t = useT()
  const write = useWrite()
  const undo = useUndoToast()
  const [cars, setCars] = useState<Car[] | null>(null)
  const [adding, setAdding] = useState('')
  const [status, setStatus] = useState<'idle' | 'saved' | 'bad'>('idle')
  // Read-only guest: cars read as a coloured legend — no rename / recolour / add.
  const ro = isGuest()

  // Seed from the stored list, or the one localized default when never set.
  useEffect(() => {
    const fallback = seedCarDefaults(t.operator.carDefaultName)
    api<{ cars?: Car[] | null }>('household')
      .then((r) => setCars(r.cars ?? fallback))
      .catch(() => setCars(fallback))
    // Run once on mount — the label is stable for the session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Persist a cars array and refresh every surface that names/tints a car. Used
  // directly (rename / recolour / add — applied optimistically by save) and as the
  // deferred commit behind a car delete's undo toast.
  const persist = useCallback(
    async (next: Car[]) => {
      setStatus('idle')
      try {
        await write('household', {
          method: 'PATCH',
          body: { cars: next },
          affectedKeys: [HOUSEHOLD_KEY],
        })
        setStatus('saved')
      } catch {
        setStatus('bad')
      }
    },
    [write],
  )

  const save = useCallback(
    (next: Car[]) => {
      setCars(next)
      void persist(next)
    },
    [persist],
  )

  if (cars === null) return <p className="loading mono">{t.common.loading}</p>

  function rename(id: string, name: string) {
    save(cars!.map((c) => (c.id === id ? { ...c, name } : c)))
  }
  function recolor(id: string, color: string) {
    save(cars!.map((c) => (c.id === id ? { ...c, color } : c)))
  }
  // Remove a car behind the deferred undo toast (the app-wide calm-delete shape):
  // drop it from the view now, hold the PATCH. Undo restores the prior list; commit
  // persists the trimmed list. Rides on a removed car simply lose their car link —
  // no data loss, they fall back to "no car set".
  function remove(id: string) {
    const prev = cars!
    const car = prev.find((c) => c.id === id)
    const next = prev.filter((c) => c.id !== id)
    setCars(next)
    undo({
      message: t.undo.cleared(car?.name ?? ''),
      onUndo: () => setCars(prev),
      onCommit: () => void persist(next),
    })
  }
  function add() {
    const name = adding.trim().slice(0, 40)
    if (!name) return
    const id = (crypto.randomUUID?.() ?? Math.random().toString(36).slice(2)).slice(0, 12)
    const color = PALETTE[cars!.length % PALETTE.length]
    setAdding('')
    save([...cars!, { id, name, color }])
  }

  return (
    <OperatorSection title={t.operator.carsTitle} hint={t.operator.carsHint} help={help} helpKey="cars">
      {cars.length === 0 ? (
        <EmptyState>{t.operator.carsEmpty}</EmptyState>
      ) : (
        <ul className="operator__list meal-slots">
          {cars.map((c) => (
            <li key={c.id} className="meal-slots__row">
              <span className="meal-slots__name">
                <span
                  className="meal-slots__chip"
                  style={{ background: wash(c.color ?? '#888888'), color: c.color }}
                  aria-hidden="true"
                />
                {ro ? (
                  <span className="meal-slots__label">{c.name}</span>
                ) : (
                  <input
                    className="input"
                    value={c.name}
                    onChange={(e) => setCars(cars.map((x) => (x.id === c.id ? { ...x, name: e.target.value } : x)))}
                    onBlur={(e) => rename(c.id, e.target.value.trim().slice(0, 40) || c.name)}
                    aria-label={t.operator.carName}
                  />
                )}
              </span>
              {!ro && (
                <div className="meal-slots__pick">
                  <ColorPicker value={c.color ?? '#888888'} onChange={(col) => recolor(c.id, col)} label={t.operator.carName} />
                </div>
              )}
              <RowActions onDelete={() => remove(c.id)} deleteLabel={`${t.common.delete} — ${c.name}`} />
            </li>
          ))}
        </ul>
      )}
      {!ro && (
        <EditField
          value={adding}
          onChange={setAdding}
          onSubmit={() => add()}
          submitLabel={t.capture.add}
          placeholder={t.operator.carAdd}
          ariaLabel={t.operator.carAdd}
        />
      )}
      {status === 'saved' && <StatusMessage tone="success">{t.operator.postalSaved}</StatusMessage>}
      {status === 'bad' && <StatusMessage tone="error">{t.operator.postalBad}</StatusMessage>}
    </OperatorSection>
  )
}
