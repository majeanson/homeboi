import { useCallback, useEffect, useState } from 'react'
import { useT } from '../../i18n'
import { api } from '../../lib/api'
import { fetchGhostManage, patchGhost, deleteGhost, type GhostCandidate, type GhostManageItem } from '../../lib/ghost'

// Shopping: the household's postal code, used by the flyer/deal lookups so the
// price-match proof on the list knows where to search. Set once, used every trip.
export function ShopSection() {
  const t = useT()
  const [postal, setPostal] = useState('')
  const [status, setStatus] = useState<'idle' | 'saved' | 'bad'>('idle')

  useEffect(() => {
    api<{ postal: string | null }>('household')
      .then((r) => setPostal(r.postal ?? ''))
      .catch(() => {})
  }, [])

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setStatus('idle')
    try {
      const r = await api<{ postal: string | null }>('household', {
        method: 'PATCH',
        body: { postal: postal.trim() },
      })
      setPostal(r.postal ?? '')
      setStatus('saved')
    } catch {
      setStatus('bad')
    }
  }

  return (
    <section className="surface operator__section">
      <h2>{t.operator.shopping}</h2>
      <p className="lead">{t.operator.shopHint}</p>
      <form className="operator__inline-form" onSubmit={save}>
        <input
          className="input"
          value={postal}
          onChange={(e) => {
            setPostal(e.target.value.toUpperCase())
            setStatus('idle')
          }}
          placeholder={t.operator.postalPlaceholder}
          aria-label={t.operator.postalLabel}
          maxLength={7}
        />
        <button type="submit" className="btn btn--primary">
          {t.common.save}
        </button>
      </form>
      {status === 'saved' && <p className="capture__routed mono">{t.operator.postalSaved}</p>}
      {status === 'bad' && <p className="error mono">{t.operator.postalBad}</p>}
    </section>
  )
}

// Ghost list management — the manual handle on the predictive grocery layer.
// Lists the staples and the items the operator chose to track (tracking is a
// CONSCIOUS step — buying something never enrolls it); the operator retunes the
// days, hides one, or adds a custom staple. Frequent untracked buys appear as
// one-tap "track it?" suggestions — the deliberate opt-in.
export function GhostSection() {
  const t = useT()
  const [items, setItems] = useState<GhostManageItem[]>([])
  const [candidates, setCandidates] = useState<GhostCandidate[]>([])
  const [label, setLabel] = useState('')
  const [days, setDays] = useState('7')

  const load = useCallback(async () => {
    const r = await fetchGhostManage().catch(() => ({ items: [], candidates: [] }))
    setItems(r.items)
    setCandidates(r.candidates)
  }, [])
  useEffect(() => {
    load()
  }, [load])

  // The conscious step: one tap turns a frequent buy into a tracked item, with
  // its learned cadence as the starting point.
  async function track(c: GhostCandidate) {
    await patchGhost({ key: c.key, label: c.label, cadenceDays: c.cadenceDays }).catch(() => {})
    load()
  }

  async function save(item: GhostManageItem, patch: { cadenceDays?: number; muted?: boolean }) {
    await patchGhost({
      key: item.key,
      label: item.label,
      cadenceDays: patch.cadenceDays ?? item.cadenceDays ?? undefined,
      muted: patch.muted ?? item.muted,
    }).catch(() => {})
    load()
  }
  async function remove(item: GhostManageItem) {
    await deleteGhost(item.key).catch(() => {})
    load()
  }
  async function add(e: React.FormEvent) {
    e.preventDefault()
    const name = label.trim()
    if (!name) return
    const n = Math.max(1, Math.min(365, Math.round(Number(days) || 7)))
    await patchGhost({ label: name, cadenceDays: n }).catch(() => {})
    setLabel('')
    setDays('7')
    load()
  }

  return (
    <section className="surface operator__section">
      <h2>{t.operator.ghost}</h2>
      <p className="lead">{t.ghost.manageHint}</p>
      {items.length === 0 ? (
        <p className="board__empty mono">{t.ghost.emptyManage}</p>
      ) : (
        <ul className="operator__list ghost-admin">
          {items.map((it) => (
            <GhostRow key={it.key} item={it} onSave={save} onRemove={remove} />
          ))}
        </ul>
      )}
      {candidates.length > 0 && (
        <div className="ghost-admin__candidates">
          <p className="mono">{t.ghost.candidatesTitle}</p>
          <div className="ghost-admin__candidate-chips">
            {candidates.map((c) => (
              <button
                key={c.key}
                type="button"
                className="chip"
                onClick={() => track(c)}
                title={`${c.label} · ${c.count}× · ${t.ghost.every} ${c.cadenceDays} ${t.ghost.days}`}
              >
                ＋ {c.label} <span className="ghost-admin__candidate-n">{c.count}×</span>
              </button>
            ))}
          </div>
        </div>
      )}
      <form className="operator__inline-form" onSubmit={add}>
        <input
          className="input"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder={t.ghost.staplePlaceholder}
          aria-label={t.ghost.addStaple}
        />
        <label className="ghost-admin__cadence mono">
          {t.ghost.every}
          <input
            className="input ghost-admin__days"
            type="number"
            inputMode="numeric"
            min={1}
            max={365}
            value={days}
            onChange={(e) => setDays(e.target.value)}
            aria-label={t.ghost.every}
          />
          {t.ghost.days}
        </label>
        <button type="submit" className="btn" disabled={!label.trim()}>
          {t.ghost.addStaple}
        </button>
      </form>
    </section>
  )
}

// One manageable item. The days input is locally controlled and only persists on
// blur, so typing doesn't fire a write per keystroke.
function GhostRow({
  item,
  onSave,
  onRemove,
}: {
  item: GhostManageItem
  onSave: (item: GhostManageItem, patch: { cadenceDays?: number; muted?: boolean }) => void
  onRemove: (item: GhostManageItem) => void
}) {
  const t = useT()
  const [days, setDays] = useState(String(item.cadenceDays ?? ''))
  const sourceLabel = item.source === 'staple' ? t.ghost.sourceStaple : t.ghost.sourceManual

  function commit() {
    const n = Math.max(1, Math.min(365, Math.round(Number(days) || item.cadenceDays || 7)))
    setDays(String(n))
    if (n !== item.cadenceDays) onSave(item, { cadenceDays: n })
  }

  return (
    <li className={'ghost-admin__row' + (item.muted ? ' is-muted' : '')}>
      <span className="ghost-admin__name">{item.label}</span>
      <span className="ghost-admin__meta mono">
        {sourceLabel}
        {item.count > 0 ? ` · ${item.count}×` : ''}
      </span>
      <label className="ghost-admin__cadence mono">
        {t.ghost.every}
        <input
          className="input ghost-admin__days"
          type="number"
          inputMode="numeric"
          min={1}
          max={365}
          value={days}
          onChange={(e) => setDays(e.target.value)}
          onBlur={commit}
          aria-label={`${item.label} — ${t.ghost.every}`}
        />
        {t.ghost.days}
      </label>
      <button type="button" className="btn btn--ghost mono" onClick={() => onSave(item, { muted: !item.muted })}>
        {item.muted ? t.ghost.unmute : t.ghost.mute}
      </button>
      {item.source === 'manual' && (
        <button type="button" className="btn btn--ghost mono operator__del" onClick={() => onRemove(item)}>
          {t.ghost.remove}
        </button>
      )}
    </li>
  )
}
