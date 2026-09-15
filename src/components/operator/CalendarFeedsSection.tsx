import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useT, useLang } from '../../i18n'
import { type HelpMode } from '../../lib/helpMode'
import { OperatorSection } from './OperatorSection'
import { api } from '../../lib/api'
import { CALENDAR_FEEDS_KEY, MONTH_KEY } from '../../lib/queryKeys'
import { useConfirm } from '../../lib/confirm'
import { useOnline } from '../../lib/online'
import { isGuest, isPaired } from '../../lib/device'
import { formatDay } from '../../lib/format'
import { EditField } from '../EditField'
import { RowActions } from '../RowActions'
import { Toggle } from '../Toggle'
import { Cluster } from '../Layout'
import { EmptyState } from '../EmptyState'
import { StatusMessage } from '../StatusMessage'
import { LoadError } from '../LoadError'

interface Feed {
  id: string
  url: string
  label: string
  colour: string | null
  memberId: string | null
  enabled: boolean
  lastFetchAt: number | null
  lastError: string | null
  partialCount: number
  eventCount: number
}

// « Les calendriers » — subscribe to a read-only ICS feed (migration 0129).
//
// Every event in this app used to be typed by a person. A school publishes its
// pedagogical days, a team its schedule, a city its collection calendar — all of it
// already exists at a URL. This is the one place in the app where the calendar fills
// ITSELF, and it fills it with things nobody here can edit.
//
// Operator-only, like the other cards in this sub: a subscription is a standing
// outbound request this deployment makes on the household's behalf.
export function CalendarFeedsSection({ help }: { help?: HelpMode }) {
  const t = useT()
  const { lang } = useLang()
  const qc = useQueryClient()
  const confirm = useConfirm()
  const online = useOnline()
  const [url, setUrl] = useState('')
  const [label, setLabel] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const feedsQ = useQuery({
    queryKey: CALENDAR_FEEDS_KEY,
    queryFn: () => api<{ feeds: Feed[] }>('calendar-feeds'),
    enabled: !isGuest() && !isPaired(),
  })

  if (isGuest() || isPaired()) return null

  // Every write here invalidates the CALENDAR too: a feed that just appeared (or was
  // just turned off) changes what the month and the week show, and leaving that to
  // the next natural refetch means adding a calendar and being shown the old one.
  const refreshAll = async () => {
    await qc.invalidateQueries({ queryKey: CALENDAR_FEEDS_KEY })
    await qc.invalidateQueries({ queryKey: MONTH_KEY })
  }

  async function add() {
    if (!url.trim() || !label.trim() || busy) return
    setBusy(true)
    setErr(null)
    setNotice(null)
    try {
      const r = await api<{ error: string | null; count: number; partial: number }>('calendar-feeds', {
        method: 'POST',
        body: { url: url.trim(), label: label.trim() },
      })
      setUrl('')
      setLabel('')
      // The FIRST fetch's outcome, said plainly. A subscription that silently adds
      // nothing is indistinguishable from a typo, and the household is the only one
      // who can tell which — so the answer arrives with the tap, not tomorrow.
      setNotice(r.error ? t.feeds.errors[r.error as 'http'] ?? t.feeds.errors.network : t.feeds.added(r.count))
      await refreshAll()
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function patch(id: string, body: Record<string, unknown>) {
    setBusy(true)
    setErr(null)
    try {
      await api('calendar-feeds', { method: 'PATCH', body: { id, ...body } })
      await refreshAll()
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function remove(f: Feed) {
    // Names what is lost, per the confirmCopy rule — and what ISN'T: the events go,
    // but they were never yours, so nothing of the household's is at stake.
    if (!(await confirm({ message: t.feeds.removeConfirm(f.label), confirmLabel: t.common.delete, tone: 'danger' }))) return
    setBusy(true)
    try {
      await api('calendar-feeds', { method: 'DELETE', body: { id: f.id } })
      await refreshAll()
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const feeds = feedsQ.data?.feeds ?? []

  return (
    <OperatorSection title={t.feeds.title} hint={t.feeds.hint} help={help} helpKey="feeds">
      {feedsQ.isError && !feedsQ.data ? (
        <LoadError onRetry={() => void qc.invalidateQueries({ queryKey: CALENDAR_FEEDS_KEY })} />
      ) : feeds.length === 0 ? (
        <EmptyState>{t.feeds.empty}</EmptyState>
      ) : (
        <ul className="operator__list">
          {feeds.map((f) => (
            <li key={f.id} className="operator__list-row">
              <span className="operator__list-main">
                <strong>{f.label}</strong>
                <span className="operator__hint mono">
                  {/* The one honest status line. A feed that quietly stopped updating
                      is the failure mode a subscription HAS, and the household is the
                      only one who can fix a wrong URL — so the error is named, not
                      logged. */}
                  {f.lastError
                    ? t.feeds.errors[f.lastError as 'http'] ?? t.feeds.errors.network
                    : t.feeds.ok(f.eventCount, f.lastFetchAt ? formatDay(f.lastFetchAt, lang) : '—')}
                  {/* Honesty over silence: an RRULE we do not implement contributes
                      its first day only, and saying so beats a calendar that LOOKS
                      complete (the OCR « Rapport » precedent). */}
                  {f.partialCount > 0 && <> · {t.feeds.partial(f.partialCount)}</>}
                </span>
              </span>
              <Cluster>
                {/* Show/hide, not delete: a calendar you stop wanting on the wall for
                    a season (the hockey schedule in July) keeps its URL and its
                    validators, so turning it back on costs one tap and no retyping.
                    The month read JOINs on `enabled`, so the rows vanish at once. */}
                <Toggle
                  on={f.enabled}
                  icon="eye-bold"
                  label={t.feeds.show}
                  onClick={() => void patch(f.id, { enabled: !f.enabled })}
                  disabled={busy || !online}
                />
                {/* « Rafraîchir » rides the EXTRA slot, not the edit one: there is
                    nothing here to edit — the feed is somebody else’s calendar — and
                    a ✏️ that refetched would promise otherwise. */}
                <RowActions
                  onExtra={() => void patch(f.id, { refresh: true })}
                  extraIcon="arrow-clockwise-bold"
                  extraLabel={t.feeds.refresh}
                  onDelete={() => void remove(f)}
                  deleteLabel={t.common.delete}
                />
              </Cluster>
            </li>
          ))}
        </ul>
      )}

      {notice && <StatusMessage tone="info">{notice}</StatusMessage>}
      {err && <StatusMessage tone="error">{err}</StatusMessage>}

      <EditField value={label} onChange={setLabel} placeholder={t.feeds.labelPlaceholder} limit={60} />
      <EditField
        value={url}
        onChange={setUrl}
        placeholder={t.feeds.urlPlaceholder}
        submitLabel={t.feeds.add}
        onSubmit={add}
        disabled={busy || !online}
      />
      <p className="operator__hint">{t.feeds.where}</p>
      {!online && <p className="operator__hint mono">{t.offline.unavailable}</p>}
    </OperatorSection>
  )
}
