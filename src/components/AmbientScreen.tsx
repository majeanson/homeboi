import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useLang, useT } from '../i18n'
import { api } from '../lib/api'
import { BOARD_KEY } from '../lib/queryKeys'
import { formatTime, formatDayLong } from '../lib/format'
import { useAmbient } from '../lib/ambient'
import { PhotoMosaic } from './PhotoMosaic'
import { InlineIcon } from './Icon'

// The ambient screensaver (backlog #3): after N idle minutes the kiosk fades to a
// big clock + date over the slow photo frame, with an optional "next up" line.
// Tap/press anything to wake. What it shows is operator-tunable (lib/ambient,
// Réglages ▸ Affichage). HubLayout owns the idle timer + the `show` flag and the
// wake (any pointer/key reset hides it); this is just the calm full-screen face.
// Renders nothing when hidden, so it's free while tucked away.
interface BoardEvent {
  id: string
  title: string
  start_at: number
  all_day: number
}

const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s)

export function AmbientScreen({ show, onWake }: { show: boolean; onWake: () => void }) {
  const a = useAmbient()
  const t = useT()
  const { lang } = useLang()

  // A gentle minute clock — tick every 10 s so the displayed HH:MM is never stale
  // by more than a few seconds, without a per-second re-render on the wall.
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!show) return
    setNow(Date.now())
    const id = setInterval(() => setNow(Date.now()), 10_000)
    return () => clearInterval(id)
  }, [show])

  // Next event still to come today, from the already-cached board frame (no extra
  // load on a fresh kiosk — the board polls this anyway).
  const { data } = useQuery({
    queryKey: BOARD_KEY,
    queryFn: () => api<{ today: BoardEvent[] }>('board'),
    enabled: show && a.showNext,
  })
  const nowSec = Math.floor(now / 1000)
  const next =
    a.showNext
      ? [...(data?.today ?? [])]
          .filter((e) => e.all_day === 1 || e.start_at >= nowSec)
          .sort((x, y) => x.start_at - y.start_at)[0]
      : undefined

  if (!show) return null
  return (
    <div
      className="ambient"
      role="dialog"
      aria-label={t.ambient.title}
      onPointerDown={onWake}
      onKeyDown={onWake}
      tabIndex={-1}
    >
      {a.showPhotos && (
        <div className="ambient__bg" aria-hidden="true">
          <PhotoMosaic />
        </div>
      )}
      <div className="ambient__veil" aria-hidden="true" />
      <div className="ambient__center">
        {a.showClock && <div className="ambient__clock">{formatTime(nowSec, lang)}</div>}
        {a.showDate && <div className="ambient__date">{cap(formatDayLong(nowSec, lang))}</div>}
        {next && (
          <div className="ambient__next mono">
            <InlineIcon name="calendar-blank-bold" />{' '}
            {next.all_day === 1 ? next.title : `${formatTime(next.start_at, lang)} · ${next.title}`}
          </div>
        )}
      </div>
      <p className="ambient__wake mono">{t.ambient.wake}</p>
    </div>
  )
}
