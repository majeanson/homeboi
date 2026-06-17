import { useCallback, useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useT } from '../../i18n'
import { api, isStatus } from '../../lib/api'
import { useWrite } from '../../lib/write'
import { type FlyerSummary } from '../../lib/deals'
import { fetchGhostManage, patchGhost, deleteGhost, type GhostCandidate, type GhostManageItem } from '../../lib/ghost'
import { Icon } from '../Icon'
import { EditField } from '../EditField'

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

  async function save() {
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
      <EditField
        value={postal}
        onChange={(v) => {
          setPostal(v.toUpperCase())
          setStatus('idle')
        }}
        onSubmit={() => save()}
        submitLabel={t.common.save}
        submitVariant="primary"
        placeholder={t.operator.postalPlaceholder}
        ariaLabel={t.operator.postalLabel}
        maxLength={7}
      />
      {status === 'saved' && <p className="capture__routed mono">{t.operator.postalSaved}</p>}
      {status === 'bad' && <p className="error mono">{t.operator.postalBad}</p>}
    </section>
  )
}

// Store filter — sits right under the postal locator. Lists the grocery stores
// the flyer/deal lookups found near the household and lets the operator keep only
// the ones they shop (an allowlist). A store left out is dropped server-side
// (/api/deals and /api/flyers), so it never reaches the deal cards, the store
// picker, or the price-match proof. With nothing narrowed, every store is kept.
type ManageStore = { key: string; merchant: string; logo: string | null; included: boolean }

export function StoreFilterSection() {
  const t = useT()
  const write = useWrite()
  const [stores, setStores] = useState<ManageStore[] | null>(null)
  const [state, setState] = useState<'loading' | 'ok' | 'empty' | 'noPostal' | 'error'>('loading')
  const [pending, setPending] = useState<Set<string>>(new Set())

  const load = useCallback(async () => {
    setState('loading')
    try {
      // The manage feed supplies names + logos (and the current included flag); the
      // household supplies the stored keys, so a store the operator kept that's no
      // longer in this week's feed still shows here and can be toggled.
      const [hh, fl] = await Promise.all([
        api<{ includedStores: string[] }>('household'),
        api<{ flyers: FlyerSummary[] }>('flyers?manage=1'),
      ])
      const included = new Set(hh.includedStores ?? [])
      const noFilter = included.size === 0 // unconfigured = every store kept
      const byKey = new Map<string, ManageStore>()
      for (const f of fl.flyers) {
        const key = f.merchant.trim().toLowerCase()
        byKey.set(key, { key, merchant: f.merchant, logo: f.logo, included: f.included ?? (noFilter || included.has(key)) })
      }
      for (const key of included) {
        if (!byKey.has(key)) byKey.set(key, { key, merchant: key, logo: null, included: true })
      }
      const list = [...byKey.values()].sort((a, b) => a.merchant.localeCompare(b.merchant))
      setStores(list)
      setState(list.length ? 'ok' : 'empty')
    } catch (e) {
      setState(isStatus(e, 400) ? 'noPostal' : 'error')
    }
  }, [])
  useEffect(() => {
    load()
  }, [load])

  async function toggle(s: ManageStore) {
    if (!stores) return
    const prev = stores
    const next = stores.map((x) => (x.key === s.key ? { ...x, included: !x.included } : x))
    setStores(next) // optimistic
    setPending((p) => new Set(p).add(s.key))
    try {
      await write('household', {
        method: 'PATCH',
        body: { includedStores: next.filter((x) => x.included).map((x) => x.key) },
        affectedKeys: [['flyers']],
      })
    } catch {
      setStores(prev) // revert on failure
    } finally {
      setPending((p) => {
        const n = new Set(p)
        n.delete(s.key)
        return n
      })
    }
  }

  return (
    <section className="surface operator__section">
      <h2>{t.operator.storeFilter}</h2>
      <p className="lead">{t.operator.storeFilterHint}</p>
      {state === 'loading' && <p className="board__empty mono">{t.shop.searching}</p>}
      {state === 'noPostal' && <p className="board__empty mono">{t.operator.storeFilterNoPostal}</p>}
      {state === 'error' && <p className="board__empty mono">{t.operator.storeFilterError}</p>}
      {state === 'empty' && <p className="board__empty mono">{t.operator.storeFilterEmpty}</p>}
      {state === 'ok' && stores && (
        <ul className="operator__list store-filter">
          {stores.map((s) => (
            <li key={s.key} className={'store-filter__row' + (s.included ? '' : ' is-off')}>
              {s.logo ? (
                <img className="store-filter__logo" src={s.logo} alt="" loading="lazy" />
              ) : (
                <span className="store-filter__logo store-filter__logo--none" aria-hidden="true">
                  <Icon name="storefront-bold" size={20} />
                </span>
              )}
              <span className="store-filter__name">{s.merchant}</span>
              <button
                type="button"
                className={'btn mono store-filter__toggle' + (s.included ? ' btn--primary' : ' btn--ghost')}
                onClick={() => toggle(s)}
                disabled={pending.has(s.key)}
                aria-pressed={s.included}
              >
                {s.included ? t.operator.storeIncluded : t.operator.storeExcluded}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

// Grocery history — what the ⚡ Quick add panel (and the add-bar typeahead)
// suggests, drawn from past buys. The cleanup handle: a flyer deal used to be able
// to log a specific product name ("Oeuf blanc sélection") instead of riding on the
// recurring item, so this lets the operator RENAME such an entry back to its
// generic name (folding its buy history in) or REMOVE it outright. Deals now
// attach to the generic item, so this is mostly for tidying older entries.
interface HistRow {
  key: string
  text: string
  count: number
  lastAt: number
}

export function HistorySection() {
  const t = useT()
  const qc = useQueryClient()
  const write = useWrite()
  const [items, setItems] = useState<HistRow[] | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState<Set<string>>(new Set())

  const load = useCallback(async () => {
    const r = await api<{ items: HistRow[] }>('list?view=history').catch(() => ({ items: [] as HistRow[] }))
    // Only genuinely bought-and-cleared entries (the purchase_log side, count > 0)
    // are tidied here — a count-0 row is just a line still on the open list, which
    // the list itself owns and quick-add already hides.
    setItems(r.items.filter((i) => i.count > 0))
  }, [])
  useEffect(() => {
    load()
  }, [load])

  // After a change, refresh this list AND the Liste page's quick-add caches so the
  // suggestion panel reflects the cleanup without a reload.
  function refresh() {
    load()
    qc.invalidateQueries({ queryKey: ['list-history'] })
    qc.invalidateQueries({ queryKey: ['ghosts'] })
  }
  const mark = (key: string, on: boolean) =>
    setBusy((b) => {
      const n = new Set(b)
      if (on) n.add(key)
      else n.delete(key)
      return n
    })

  async function remove(it: HistRow) {
    mark(it.key, true)
    await write('list', { method: 'DELETE', body: { historyKey: it.key } }).catch(() => {})
    refresh()
    mark(it.key, false)
  }
  async function rename(it: HistRow) {
    const text = draft.trim()
    setEditing(null)
    if (!text || text === it.text) return
    mark(it.key, true)
    await write('list', { method: 'PATCH', body: { historyKey: it.key, renameTo: text } }).catch(() => {})
    refresh()
    mark(it.key, false)
  }

  return (
    <section className="surface operator__section">
      <h2>{t.operator.history}</h2>
      <p className="lead">{t.operator.historyHint}</p>
      {items === null ? (
        <p className="board__empty mono">{t.shop.searching}</p>
      ) : items.length === 0 ? (
        <p className="board__empty mono">{t.operator.historyEmpty}</p>
      ) : (
        <ul className="operator__list ghost-admin">
          {items.map((it) =>
            editing === it.key ? (
              <li key={it.key} className="ghost-admin__row">
                <form
                  className="operator__inline-form"
                  onSubmit={(e) => {
                    e.preventDefault()
                    rename(it)
                  }}
                >
                  <input
                    className="input"
                    autoFocus
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    aria-label={t.operator.historyRename}
                  />
                  <button type="submit" className="btn btn--primary mono">
                    {t.common.save}
                  </button>
                  <button type="button" className="btn btn--ghost mono" onClick={() => setEditing(null)}>
                    {t.common.cancel}
                  </button>
                </form>
              </li>
            ) : (
              <li key={it.key} className="ghost-admin__row">
                <span className="ghost-admin__name">{it.text}</span>
                <span className="ghost-admin__meta mono">{it.count > 0 ? `${it.count}×` : ''}</span>
                <button
                  type="button"
                  className="btn btn--ghost mono"
                  disabled={busy.has(it.key)}
                  onClick={() => {
                    setEditing(it.key)
                    setDraft(it.text)
                  }}
                >
                  {t.operator.historyRename}
                </button>
                <button
                  type="button"
                  className="btn btn--ghost mono operator__del"
                  disabled={busy.has(it.key)}
                  onClick={() => remove(it)}
                >
                  {t.operator.historyRemove}
                </button>
              </li>
            ),
          )}
        </ul>
      )}
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
