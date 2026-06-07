import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { TopBar } from '../components/TopBar'
import { useT } from '../i18n'
import { api } from '../lib/api'
import { setDeviceToken, isPaired } from '../lib/device'
import { useSurface } from '../lib/surface'

// The tablet's pairing screen (kiosk side of device pairing). Get a code,
// display it big, poll until the operator approves from their phone, then store
// the device token and jump to the board. If already paired, go straight in.
type Phase = 'idle' | 'waiting' | 'paired' | 'expired'

export function Pair() {
  const t = useT()
  const nav = useNavigate()
  const { setSurface } = useSurface()
  const [phase, setPhase] = useState<Phase>('idle')
  const [code, setCode] = useState('')
  const pairingId = useRef<string | null>(null)
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    // Reaching the pairing screen IS the wall-display path — latch the kiosk role
    // so the board boots into the kiosk dashboard once paired.
    setSurface('kiosk')
    if (isPaired()) nav('/board')
    return () => {
      if (timer.current) clearInterval(timer.current)
    }
    // setSurface is stable (from context); run once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nav])

  async function getCode() {
    try {
      const res = await api<{ pairingId: string; code: string }>('pair/start', { method: 'POST' })
      pairingId.current = res.pairingId
      setCode(res.code)
      setPhase('waiting')
      startPolling()
    } catch {
      setPhase('expired')
    }
  }

  function startPolling() {
    if (timer.current) clearInterval(timer.current)
    timer.current = setInterval(async () => {
      if (!pairingId.current) return
      try {
        const res = await api<{ status: string; deviceToken?: string; householdId?: string }>(
          `pair/poll?pairingId=${pairingId.current}`,
        )
        if (res.status === 'approved' && res.deviceToken && res.householdId) {
          if (timer.current) clearInterval(timer.current)
          setDeviceToken(res.deviceToken, res.householdId)
          setPhase('paired')
          setTimeout(() => nav('/board'), 1200)
        } else if (res.status === 'expired') {
          if (timer.current) clearInterval(timer.current)
          setPhase('expired')
        }
      } catch {
        /* transient — keep polling */
      }
    }, 2500)
  }

  return (
    <div className="page">
      <TopBar />
      <main className="narrow pair auth">
        <h1>{t.pair.title}</h1>
        <p className="lead">{t.pair.lead}</p>

        {phase === 'idle' && (
          <button type="button" className="btn btn--primary" onClick={getCode}>
            {t.pair.getCode}
          </button>
        )}

        {phase === 'waiting' && (
          <div className="pair__code-block">
            <p className="mono">{t.pair.showing}</p>
            <div className="pair__code" aria-label={code.split('').join(' ')}>
              {code}
            </div>
            <p className="pair__waiting mono">{t.pair.waiting}</p>
          </div>
        )}

        {phase === 'paired' && (
          <p className="pair__ok">
            <span className="pair__ok-mark" aria-hidden="true">✓</span> {t.pair.paired}
          </p>
        )}

        {phase === 'expired' && (
          <div>
            <p className="error mono">{t.pair.expired}</p>
            <button type="button" className="btn" onClick={getCode}>
              {t.pair.getCode}
            </button>
          </div>
        )}
      </main>
    </div>
  )
}
