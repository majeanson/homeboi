import { useQueryClient } from '@tanstack/react-query'
import { useOnline } from '../lib/online'
import { useT, useLang } from '../i18n'
import { InlineIcon } from './Icon'

// A clear, calm "hors ligne" bar shown across the hub when the device loses
// connectivity, so a glance at the (cached) board is trusted rather than mistaken
// for live data. Carries a "Données du …" stamp — the newest successful fetch in
// the cache — so you know how fresh the snapshot is. Writes still go through the
// normal path (queued/failed as usual); this is awareness, not a gate.
export function OfflineBanner() {
  const online = useOnline()
  const t = useT()
  const { lang } = useLang()
  const qc = useQueryClient()
  if (online) return null

  let newest = 0
  for (const q of qc.getQueryCache().getAll()) {
    if (q.state.status === 'success' && q.state.dataUpdatedAt > newest) newest = q.state.dataUpdatedAt
  }
  const stamp = newest
    ? new Date(newest).toLocaleString(lang === 'fr' ? 'fr-CA' : 'en-CA', {
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      })
    : null

  return (
    <div className="offline-bar mono" role="status" aria-live="polite">
      <InlineIcon name="wifi-high-bold" /> {t.offline.banner}
      {stamp && (
        <span className="offline-bar__stamp">
          {' '}
          · {t.offline.since} {stamp}
        </span>
      )}
    </div>
  )
}
