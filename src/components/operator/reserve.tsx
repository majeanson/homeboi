import { useCallback, useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useT } from '../../i18n'
import { api } from '../../lib/api'
import { HOUSEHOLD_KEY } from '../../lib/queryKeys'
import { wash, PALETTE } from '../../lib/colors'
import { type ReserveLocation, seedReserveDefaults } from '../../lib/reservePrefs'
import { ColorPicker } from '../ColorPicker'
import { RowActions } from '../RowActions'

// Réglages ▸ Réserve. The household-level storage spots that group La réserve
// (the freezer / back-of-pantry reminder in La cuisine). Custom & editable:
// rename, recolour, remove, or add your own (basement freezer, cold room…). Seeded
// with two defaults — Garde-manger + Congélateur — shown editable; an empty list
// is a valid choice (items then fall under "Autres"). Persists on /api/household;
// saving invalidates HOUSEHOLD_KEY so La cuisine re-groups live (it reads the same
// key via useReserveLocations).
export function ReserveLocationsSection() {
  const t = useT()
  const qc = useQueryClient()
  const [locs, setLocs] = useState<ReserveLocation[] | null>(null)
  const [adding, setAdding] = useState('')
  const [status, setStatus] = useState<'idle' | 'saved' | 'bad'>('idle')

  // Seed from the stored list, or the two localized defaults when never set.
  useEffect(() => {
    const fallback = seedReserveDefaults(t.kitchen.reserveDefaultPantry, t.kitchen.reserveDefaultFreezer)
    api<{ reserveLocations?: ReserveLocation[] | null }>('household')
      .then((r) => setLocs(r.reserveLocations ?? fallback))
      .catch(() => setLocs(fallback))
    // Run once on mount — the labels are stable for the session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const save = useCallback(
    async (next: ReserveLocation[]) => {
      setLocs(next)
      setStatus('idle')
      try {
        await api('household', { method: 'PATCH', body: { reserveLocations: next } })
        qc.invalidateQueries({ queryKey: HOUSEHOLD_KEY })
        setStatus('saved')
      } catch {
        setStatus('bad')
      }
    },
    [qc],
  )

  if (locs === null) return <p className="loading mono">{t.common.loading}</p>

  function rename(id: string, name: string) {
    save(locs!.map((l) => (l.id === id ? { ...l, name } : l)))
  }
  function recolor(id: string, color: string) {
    save(locs!.map((l) => (l.id === id ? { ...l, color } : l)))
  }
  function remove(id: string) {
    save(locs!.filter((l) => l.id !== id))
  }
  function add(e: React.FormEvent) {
    e.preventDefault()
    const name = adding.trim().slice(0, 40)
    if (!name) return
    const id = (crypto.randomUUID?.() ?? Math.random().toString(36).slice(2)).slice(0, 12)
    const color = PALETTE[locs!.length % PALETTE.length]
    setAdding('')
    save([...locs!, { id, name, color }])
  }

  return (
    <section className="surface operator__section">
      <h2>{t.operator.reserveTitle}</h2>
      <p className="lead">{t.operator.reserveHint}</p>
      {locs.length === 0 ? (
        <p className="board__empty mono">{t.operator.reserveEmpty}</p>
      ) : (
        <ul className="operator__list meal-slots">
          {locs.map((l) => (
            <li key={l.id} className="meal-slots__row">
              <span className="meal-slots__name">
                <span className="meal-slots__chip" style={{ background: wash(l.color ?? '#888888'), color: l.color }} aria-hidden="true" />
                <input
                  className="input"
                  value={l.name}
                  onChange={(e) => setLocs(locs.map((x) => (x.id === l.id ? { ...x, name: e.target.value } : x)))}
                  onBlur={(e) => rename(l.id, e.target.value.trim().slice(0, 40) || l.name)}
                  aria-label={t.operator.reserveLocationName}
                />
              </span>
              <div className="meal-slots__pick">
                <ColorPicker value={l.color ?? '#888888'} onChange={(c) => recolor(l.id, c)} label={t.operator.reserveLocationName} />
              </div>
              <RowActions onDelete={() => remove(l.id)} deleteLabel={`${t.common.delete} — ${l.name}`} />
            </li>
          ))}
        </ul>
      )}
      <form className="operator__inline-form" onSubmit={add}>
        <input
          className="input"
          value={adding}
          onChange={(e) => setAdding(e.target.value)}
          placeholder={t.operator.reserveAddLocation}
        />
        <button type="submit" className="btn" disabled={!adding.trim()}>
          {t.capture.add}
        </button>
      </form>
      {status === 'saved' && <p className="capture__routed mono">{t.operator.postalSaved}</p>}
      {status === 'bad' && <p className="error mono">{t.operator.postalBad}</p>}
    </section>
  )
}
