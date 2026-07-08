import { useQueryClient } from '@tanstack/react-query'
import { newestFetchMs, useDataFreshness, useOnline } from '../lib/online'
import { useOutboxCount } from '../lib/write'
import { useT, useLang } from '../i18n'
import { InlineIcon } from './Icon'

// A clear, calm "hors ligne" bar shown across the hub when the device loses
// connectivity OR (bmad/10 B-7) when it's still "online" but the shared data has
// quietly stopped refreshing (captive portal, dead uplink past the router, Worker
// outage) — `navigator.onLine` alone would show nothing at all in that case. Both
// conditions render the same bar with a "Données du/de …" stamp — the newest
// successful fetch in the cache — so you know how fresh the snapshot is. Writes
// still go through the normal path (queued/failed as usual); this is awareness,
// never a gate. True-offline always wins when both are true (it's the stronger,
// more certain signal).
export function OfflineBanner() {
  const online = useOnline()
  const stale = useDataFreshness()
  const t = useT()
  const { lang } = useLang()
  const qc = useQueryClient()
  const pending = useOutboxCount()
  if (online && !stale) return null

  const staleOnly = online // reached this line + online → must be the stale-while-online case
  const newest = newestFetchMs(qc)
  const stamp = newest
    ? new Date(newest).toLocaleString(
        lang === 'fr' ? 'fr-CA' : 'en-CA',
        staleOnly
          ? { hour: '2-digit', minute: '2-digit' }
          : { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' },
      )
    : null

  return (
    <div className={`offline-bar mono${staleOnly ? ' offline-bar--stale' : ''}`} role="status" aria-live="polite">
      <InlineIcon name={staleOnly ? 'clock-bold' : 'wifi-high-bold'} />{' '}
      {staleOnly ? (
        stamp && (
          <>
            {t.offline.stale} {stamp}
          </>
        )
      ) : (
        t.offline.banner
      )}
      {pending > 0 && <span className="offline-bar__stamp"> · {pending} {t.offline.pending}</span>}
      {!staleOnly && stamp && (
        <span className="offline-bar__stamp">
          {' '}
          · {t.offline.since} {stamp}
        </span>
      )}
    </div>
  )
}
