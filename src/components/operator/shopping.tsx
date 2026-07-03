import { useCallback, useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useT } from '../../i18n'
import { type HelpMode } from '../../lib/helpMode'
import { OperatorSection } from './OperatorSection'
import { api, isStatus } from '../../lib/api'
import { useWrite } from '../../lib/write'
import { useUndoToast } from '../../lib/toast'
import { FLYERS_KEY, GHOSTS_KEY, HISTORY_KEY, HOUSEHOLD_KEY } from '../../lib/queryKeys'
import { type FlyerSummary } from '../../lib/deals'
import { fetchGhostManage, patchGhost, deleteGhost, type GhostCandidate, type GhostManageItem } from '../../lib/ghost'
import { isGuest } from '../../lib/device'
import { Icon, InlineIcon } from '../Icon'
import { EditField } from '../EditField'
import { Chip } from '../Chip'
import { EmptyState } from '../EmptyState'
import { StatusMessage } from '../StatusMessage'

// Shopping: the household's postal code, used by the flyer/deal lookups so the
// price-match proof on the list knows where to search. Set once, used every trip.
export function ShopSection({ help }: { help?: HelpMode }) {
  const t = useT()
  const write = useWrite()
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
      // useWrite so setting the postal code offline queues + replays. Online we
      // adopt the server-normalized value back; a queued write has no data to read.
      const res = await write<{ postal: string | null }>('household', {
        method: 'PATCH',
        body: { postal: postal.trim() },
        affectedKeys: [HOUSEHOLD_KEY],
      })
      if (!res.queued) setPostal(res.data.postal ?? '')
      setStatus('saved')
    } catch {
      setStatus('bad')
    }
  }

  return (
    <OperatorSection title={t.operator.shopping} help={help} helpKey="shop">
      {!isGuest() && (
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
      )}
      {status === 'saved' && <StatusMessage tone="success">{t.operator.postalSaved}</StatusMessage>}
      {status === 'bad' && <StatusMessage tone="error">{t.operator.postalBad}</StatusMessage>}
    </OperatorSection>
  )
}

// Store filter — sits right under the postal locator. Lists the grocery stores
// the flyer/deal lookups found near the household and lets the operator keep only
// the ones they shop (an allowlist). A store left out is dropped server-side
// (/api/deals and /api/flyers), so it never reaches the deal cards, the store
// picker, or the price-match proof. With nothing narrowed, every store is kept.
// `included` = the store is considered in deal/flyer lookups (the allowlist).
// `tillHidden` = its deals are dropped from "Montrer à la caisse" only — the store
// you do your own shopping at, where holding up its own flyer to its own cashier is
// pointless (migration 0066). The two flags are independent.
type ManageStore = { key: string; merchant: string; logo: string | null; included: boolean; tillHidden: boolean }

export function StoreFilterSection({ help }: { help?: HelpMode }) {
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
        api<{ includedStores: string[]; cashierExcludedStores: string[] }>('household'),
        api<{ flyers: FlyerSummary[] }>('flyers?manage=1'),
      ])
      const included = new Set(hh.includedStores ?? [])
      const tillHidden = new Set(hh.cashierExcludedStores ?? [])
      const noFilter = included.size === 0 // unconfigured = every store kept
      const byKey = new Map<string, ManageStore>()
      for (const f of fl.flyers) {
        const key = f.merchant.trim().toLowerCase()
        byKey.set(key, {
          key,
          merchant: f.merchant,
          logo: f.logo,
          included: f.included ?? (noFilter || included.has(key)),
          tillHidden: tillHidden.has(key),
        })
      }
      for (const key of included) {
        if (!byKey.has(key)) byKey.set(key, { key, merchant: key, logo: null, included: true, tillHidden: tillHidden.has(key) })
      }
      // A store may be hidden-at-till yet have dropped out of this week's feed and the
      // include list — keep it visible so its till flag stays toggleable.
      for (const key of tillHidden) {
        if (!byKey.has(key)) byKey.set(key, { key, merchant: key, logo: null, included: noFilter, tillHidden: true })
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
        affectedKeys: [FLYERS_KEY],
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

  // Toggle the "hide at the till" flag — independent of the include allowlist, so it
  // PATCHes its own field and doesn't touch deal/flyer lookups (no affectedKeys).
  async function toggleTill(s: ManageStore) {
    if (!stores) return
    const prev = stores
    const next = stores.map((x) => (x.key === s.key ? { ...x, tillHidden: !x.tillHidden } : x))
    setStores(next) // optimistic
    setPending((p) => new Set(p).add(s.key))
    try {
      await write('household', {
        method: 'PATCH',
        body: { cashierExcludedStores: next.filter((x) => x.tillHidden).map((x) => x.key) },
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
    <OperatorSection title={t.operator.storeFilter} help={help} helpKey="storeFilter">
      {state === 'loading' && <EmptyState>{t.shop.searching}</EmptyState>}
      {state === 'noPostal' && <EmptyState>{t.operator.storeFilterNoPostal}</EmptyState>}
      {state === 'error' && <EmptyState>{t.operator.storeFilterError}</EmptyState>}
      {state === 'empty' && <EmptyState>{t.operator.storeFilterEmpty}</EmptyState>}
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
              {isGuest() ? (
                <span className="mono store-filter__toggle">
                  {s.included ? t.operator.storeIncluded : t.operator.storeExcluded}
                </span>
              ) : (
                <button
                  type="button"
                  className={'btn mono store-filter__toggle' + (s.included ? ' btn--primary' : ' btn--ghost')}
                  onClick={() => toggle(s)}
                  disabled={pending.has(s.key)}
                  aria-pressed={s.included}
                >
                  {s.included ? t.operator.storeIncluded : t.operator.storeExcluded}
                </button>
              )}
              {/* "À la caisse: Oui/Non" — only meaningful for an included store (an
                  excluded one never reaches the till anyway). Oui = shown to the
                  cashier; Non = hidden there (e.g. the store you shop at). */}
              {s.included &&
                (isGuest() ? (
                  <span className="mono store-filter__till" title={t.operator.storeCashierHint}>
                    {t.operator.storeCashier}: {s.tillHidden ? t.operator.storeCashierOff : t.operator.storeCashierOn}
                  </span>
                ) : (
                  <button
                    type="button"
                    className={'btn mono store-filter__till' + (s.tillHidden ? ' btn--ghost' : ' btn--primary')}
                    onClick={() => toggleTill(s)}
                    disabled={pending.has(s.key)}
                    aria-pressed={!s.tillHidden}
                    title={t.operator.storeCashierHint}
                  >
                    {t.operator.storeCashier}: {s.tillHidden ? t.operator.storeCashierOff : t.operator.storeCashierOn}
                  </button>
                ))}
            </li>
          ))}
        </ul>
      )}
    </OperatorSection>
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

export function HistorySection({ help }: { help?: HelpMode }) {
  const t = useT()
  const qc = useQueryClient()
  const write = useWrite()
  const undo = useUndoToast()
  const [items, setItems] = useState<HistRow[] | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState<Set<string>>(new Set())
  // Read-only guest: history reads as plain rows — no rename / remove.
  const ro = isGuest()

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
    qc.invalidateQueries({ queryKey: HISTORY_KEY })
    qc.invalidateQueries({ queryKey: GHOSTS_KEY })
  }
  const mark = (key: string, on: boolean) =>
    setBusy((b) => {
      const n = new Set(b)
      if (on) n.add(key)
      else n.delete(key)
      return n
    })

  // Removing a folded purchase-history entry is DEFERRED behind the undo toast, like
  // every other destructive tap in the app — a mis-tap costs nothing and never
  // round-trips. Hide the row now (local `items`, not a live-polled cache), hold the
  // DELETE, and a tap of Annuler leaves it (onUndo reloads it back from the server,
  // where it still lives until commit).
  function remove(it: HistRow) {
    setItems((prev) => (prev ? prev.filter((r) => r.key !== it.key) : prev))
    undo({
      message: t.undo.cleared(it.text),
      onUndo: () => void load(),
      onCommit: async () => {
        await write('list', { method: 'DELETE', body: { historyKey: it.key } }).catch(() => {})
        refresh()
      },
    })
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
    <OperatorSection title={t.operator.history} help={help} helpKey="history">
      {items === null ? (
        <EmptyState>{t.shop.searching}</EmptyState>
      ) : items.length === 0 ? (
        <EmptyState>{t.operator.historyEmpty}</EmptyState>
      ) : (
        <ul className="operator__list ghost-admin">
          {items.map((it) =>
            !ro && editing === it.key ? (
              <li key={it.key} className="ghost-admin__row">
                <EditField
                  value={draft}
                  onChange={setDraft}
                  onSubmit={() => rename(it)}
                  onCancel={() => setEditing(null)}
                  submitLabel={t.common.save}
                  submitVariant="primary"
                  autoFocus
                  ariaLabel={t.operator.historyRename}
                />
              </li>
            ) : (
              <li key={it.key} className="ghost-admin__row">
                <span className="ghost-admin__name">{it.text}</span>
                <span className="ghost-admin__meta mono">{it.count > 0 ? `${it.count}×` : ''}</span>
                {!ro && (
                  <>
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
                  </>
                )}
              </li>
            ),
          )}
        </ul>
      )}
    </OperatorSection>
  )
}

// Ghost list management — the manual handle on the predictive grocery layer.
// Lists the staples and the items the operator chose to track (tracking is a
// CONSCIOUS step — buying something never enrolls it); the operator retunes the
// days, hides one, or adds a custom staple. Frequent untracked buys appear as
// one-tap "track it?" suggestions — the deliberate opt-in.
export function GhostSection({ help }: { help?: HelpMode }) {
  const t = useT()
  const [items, setItems] = useState<GhostManageItem[]>([])
  const [candidates, setCandidates] = useState<GhostCandidate[]>([])
  const [label, setLabel] = useState('')
  const [days, setDays] = useState('7')
  // Read-only guest: hide the track-candidate chips + the add-staple form. The
  // GhostRow controls are gated inside that component.
  const ro = isGuest()

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

  async function save(
    item: GhostManageItem,
    patch: { cadenceDays?: number; muted?: boolean; standing?: boolean },
  ) {
    await patchGhost({
      key: item.key,
      label: item.label,
      cadenceDays: patch.cadenceDays ?? item.cadenceDays ?? undefined,
      muted: patch.muted ?? item.muted,
      // Always send the resolved standing so tuning cadence/mute never unpins it.
      standing: patch.standing ?? item.standing,
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
    <OperatorSection title={t.operator.ghost} help={help} helpKey="ghost">
      {items.length === 0 ? (
        <EmptyState>{t.ghost.emptyManage}</EmptyState>
      ) : (
        <ul className="operator__list ghost-admin">
          {items.map((it) => (
            <GhostRow key={it.key} item={it} onSave={save} onRemove={remove} />
          ))}
        </ul>
      )}
      {!ro && candidates.length > 0 && (
        <div className="ghost-admin__candidates">
          <p className="mono">{t.ghost.candidatesTitle}</p>
          <div className="ghost-admin__candidate-chips">
            {candidates.map((c) => (
              <Chip
                key={c.key}
                onClick={() => track(c)}
                title={`${c.label} · ${c.count}× · ${t.ghost.every} ${c.cadenceDays} ${t.ghost.days}`}
              >
                <InlineIcon name="plus-bold" /> {c.label} <span className="ghost-admin__candidate-n">{c.count}×</span>
              </Chip>
            ))}
          </div>
        </div>
      )}
      {!ro && (
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
      )}
    </OperatorSection>
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
  onSave: (item: GhostManageItem, patch: { cadenceDays?: number; muted?: boolean; standing?: boolean }) => void
  onRemove: (item: GhostManageItem) => void
}) {
  const t = useT()
  const [days, setDays] = useState(String(item.cadenceDays ?? ''))
  const sourceLabel = item.source === 'staple' ? t.ghost.sourceStaple : t.ghost.sourceManual
  // Read-only guest: cadence reads as text, no mute/unmute, no remove.
  const ro = isGuest()

  function commit() {
    const n = Math.max(1, Math.min(365, Math.round(Number(days) || item.cadenceDays || 7)))
    setDays(String(n))
    if (n !== item.cadenceDays) onSave(item, { cadenceDays: n })
  }

  return (
    <li className={'ghost-admin__row' + (item.muted ? ' is-muted' : '') + (item.standing ? ' is-standing' : '')}>
      <span className="ghost-admin__name">
        {item.standing && (
          <InlineIcon name="push-pin-bold" size={13} color="var(--marigold-deep)" />
        )}{' '}
        {item.label}
      </span>
      <span className="ghost-admin__meta mono">
        {sourceLabel}
        {item.standing ? ` · ${t.ghost.standingTag}` : ''}
        {item.count > 0 ? ` · ${item.count}×` : ''}
      </span>
      <label className="ghost-admin__cadence mono">
        {t.ghost.every}
        {ro ? (
          <span className="ghost-admin__days">{item.cadenceDays ?? '—'}</span>
        ) : (
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
        )}
        {t.ghost.days}
      </label>
      {!ro && (
        <button
          type="button"
          className={'btn btn--ghost mono' + (item.standing ? ' btn--primary' : '')}
          onClick={() => onSave(item, { standing: !item.standing })}
          aria-pressed={item.standing}
          title={t.ghost.standingHint}
        >
          <InlineIcon name="push-pin-bold" size={13} /> {item.standing ? t.ghost.standingOn : t.ghost.standingOff}
        </button>
      )}
      {!ro && (
        <button type="button" className="btn btn--ghost mono" onClick={() => onSave(item, { muted: !item.muted })}>
          {item.muted ? t.ghost.unmute : t.ghost.mute}
        </button>
      )}
      {!ro && item.source === 'manual' && (
        <button type="button" className="btn btn--ghost mono operator__del" onClick={() => onRemove(item)}>
          {t.ghost.remove}
        </button>
      )}
    </li>
  )
}
