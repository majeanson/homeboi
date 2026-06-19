import { useCallback, useEffect, useState } from 'react'
import { useT } from '../../i18n'
import { type HelpMode } from '../../lib/helpMode'
import { api } from '../../lib/api'
import { useWrite } from '../../lib/write'
import { useUndoToast } from '../../lib/toast'
import { HOUSEHOLD_KEY } from '../../lib/queryKeys'
import { wash, PALETTE } from '../../lib/colors'
import { isGuest } from '../../lib/device'
import { type ReserveLocation, seedReserveDefaults } from '../../lib/reservePrefs'
import { ColorPicker } from '../ColorPicker'
import { EditField } from '../EditField'
import { RowActions } from '../RowActions'
import { EmptyState } from '../EmptyState'
import { OperatorSection } from './OperatorSection'

// Réglages ▸ Réserve. The household-level storage spots that group La réserve
// (the freezer / back-of-pantry reminder in La cuisine). Custom & editable:
// rename, recolour, remove, or add your own (basement freezer, cold room…). Seeded
// with two defaults — Garde-manger + Congélateur — shown editable; an empty list
// is a valid choice (items then fall under "Autres"). Persists on /api/household;
// saving invalidates HOUSEHOLD_KEY so La cuisine re-groups live (it reads the same
// key via useReserveLocations).
export function ReserveLocationsSection({ help }: { help?: HelpMode }) {
  const t = useT()
  const write = useWrite()
  const undo = useUndoToast()
  const [locs, setLocs] = useState<ReserveLocation[] | null>(null)
  const [adding, setAdding] = useState('')
  const [status, setStatus] = useState<'idle' | 'saved' | 'bad'>('idle')
  // Read-only guest: locations read as a coloured legend — no rename / recolour /
  // add (RowActions already hides its own delete).
  const ro = isGuest()

  // Seed from the stored list, or the two localized defaults when never set.
  useEffect(() => {
    const fallback = seedReserveDefaults(t.kitchen.reserveDefaultPantry, t.kitchen.reserveDefaultFreezer)
    api<{ reserveLocations?: ReserveLocation[] | null }>('household')
      .then((r) => setLocs(r.reserveLocations ?? fallback))
      .catch(() => setLocs(fallback))
    // Run once on mount — the labels are stable for the session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Persist a locations array and refresh the kitchen. Used directly (rename /
  // recolour / add — applied optimistically by save) and as the deferred commit
  // behind a location delete's undo toast.
  // KNOWN LIMITATION: this PATCHes the whole array, so two concurrent OPERATOR tabs
  // last-write-win (no merge). A merge-by-id would wrongly resurrect deletes (the
  // array is authoritative, no tombstones), and a correct compare-and-set guard
  // needs a version baseline on the wire — disproportionate for one-operator-per-
  // household (and kiosks can no longer write here, see reserve.ts 'operator' gate).
  const persist = useCallback(
    async (next: ReserveLocation[]) => {
      setStatus('idle')
      try {
        await write('household', {
          method: 'PATCH',
          body: { reserveLocations: next },
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
    (next: ReserveLocation[]) => {
      setLocs(next)
      void persist(next)
    },
    [persist],
  )

  if (locs === null) return <p className="loading mono">{t.common.loading}</p>

  function rename(id: string, name: string) {
    save(locs!.map((l) => (l.id === id ? { ...l, name } : l)))
  }
  function recolor(id: string, color: string) {
    save(locs!.map((l) => (l.id === id ? { ...l, color } : l)))
  }
  // Remove a location behind the deferred undo toast (the app-wide calm-delete
  // shape, like PantryTab.removeLowItem): drop it from the view now, hold the PATCH.
  // Undo restores the prior list (nothing reached the server); commit persists the
  // trimmed list. Items in a removed spot simply fall under "Autres" — no data loss.
  function remove(id: string) {
    const prev = locs!
    const loc = prev.find((l) => l.id === id)
    const next = prev.filter((l) => l.id !== id)
    setLocs(next)
    undo({
      message: t.undo.cleared(loc?.name ?? ''),
      onUndo: () => setLocs(prev),
      onCommit: () => void persist(next),
    })
  }
  function add() {
    const name = adding.trim().slice(0, 40)
    if (!name) return
    const id = (crypto.randomUUID?.() ?? Math.random().toString(36).slice(2)).slice(0, 12)
    const color = PALETTE[locs!.length % PALETTE.length]
    setAdding('')
    save([...locs!, { id, name, color }])
  }

  return (
    <OperatorSection title={t.operator.reserveTitle} help={help} helpKey="reserveLocations">
      {locs.length === 0 ? (
        <EmptyState>{t.operator.reserveEmpty}</EmptyState>
      ) : (
        <ul className="operator__list meal-slots">
          {locs.map((l) => (
            <li key={l.id} className="meal-slots__row">
              <span className="meal-slots__name">
                <span className="meal-slots__chip" style={{ background: wash(l.color ?? '#888888'), color: l.color }} aria-hidden="true" />
                {ro ? (
                  <span className="meal-slots__label">{l.name}</span>
                ) : (
                  <input
                    className="input"
                    value={l.name}
                    onChange={(e) => setLocs(locs.map((x) => (x.id === l.id ? { ...x, name: e.target.value } : x)))}
                    onBlur={(e) => rename(l.id, e.target.value.trim().slice(0, 40) || l.name)}
                    aria-label={t.operator.reserveLocationName}
                  />
                )}
              </span>
              {!ro && (
                <div className="meal-slots__pick">
                  <ColorPicker value={l.color ?? '#888888'} onChange={(c) => recolor(l.id, c)} label={t.operator.reserveLocationName} />
                </div>
              )}
              <RowActions onDelete={() => remove(l.id)} deleteLabel={`${t.common.delete} — ${l.name}`} />
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
          placeholder={t.operator.reserveAddLocation}
          ariaLabel={t.operator.reserveAddLocation}
        />
      )}
      {status === 'saved' && <p className="capture__routed mono">{t.operator.postalSaved}</p>}
      {status === 'bad' && <p className="error mono">{t.operator.postalBad}</p>}
    </OperatorSection>
  )
}
