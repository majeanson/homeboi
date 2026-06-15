import { useState } from 'react'
import { api } from '../lib/api'
import { useT } from '../i18n'
import { useVoiceInput } from '../lib/useVoiceInput'
import { VoiceButton } from './VoiceButton'
import type { IntentType } from '../lib/captureTypes'

// The capture bar: one input, type or speak. Voice is the shared on-device
// useVoiceInput hook (zero-cost, in-browser STT). The text is then classified
// server-side by Workers AI.
//
// When the server reports `degraded` (AI binding unset), we show a manual
// type-picker so the capture is never lost — the same shape the brief promises.
//
// After ANY routing we keep the routed text + the exact rows the server wrote
// (`cleanup`), so the "Non, plutôt…" picker can correct a misroute in one tap:
// re-submitting with `forceType` + `undo` deletes the wrong row and lays the
// right one. This also covers the degraded path, where a fallback note is
// auto-created and must be removed when the human then picks the real type.
const FORCE_TYPES: IntentType[] = ['event', 'task', 'list-item', 'pantry-low', 'meal', 'leftover', 'note']

type Cleanup = { table: string; id: string }
type CaptureRes = {
  type: string
  degraded: boolean
  routed: { kind: string; label: string; cleanup: Cleanup[] }
}

export function CaptureBar({ onCaptured }: { onCaptured?: () => void }) {
  const t = useT()
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [routed, setRouted] = useState<{ kind: string; label: string } | null>(null)
  const [needType, setNeedType] = useState<string | null>(null)
  // The text + rows of the LAST routing, so a correction can re-run it and undo it.
  const [lastText, setLastText] = useState('')
  const [lastCleanup, setLastCleanup] = useState<Cleanup[]>([])
  const [showReroute, setShowReroute] = useState(false)
  const [corrected, setCorrected] = useState(false)
  const voice = useVoiceInput(setText)
  const { listening } = voice

  // value is passed explicitly so a correction can re-send the already-cleared
  // text. `isCorrection` marks the explicit "Non, plutôt…" path (→ "Déplacé."),
  // distinct from a first-time degraded type-pick (still just "Ajouté :").
  async function submit(value: string, forceType?: IntentType, undo?: Cleanup[], isCorrection = false) {
    const v = value.trim()
    if (!v || busy) return
    setBusy(true)
    if (!forceType) setRouted(null)
    try {
      const res = await api<CaptureRes>('capture', {
        method: 'POST',
        body: { text: v, source: 'text', forceType, undo },
      })
      if (res.degraded && !forceType) {
        // AI offline and no explicit type — a fallback note was written; ask the
        // human which it really was (keep the text + the note's ref so picking a
        // type re-routes and removes the placeholder note instead of duplicating).
        setNeedType(v)
        setLastText(v)
        setLastCleanup(res.routed.cleanup)
        setRouted(null)
      } else {
        setRouted({ kind: res.routed.kind, label: res.routed.label })
        setLastText(v)
        setLastCleanup(res.routed.cleanup)
        setCorrected(isCorrection)
        setText('')
        setNeedType(null)
        setShowReroute(false)
        onCaptured?.()
      }
    } catch {
      /* surfaced by the empty routed state; keep the text for a retry */
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="capture">
      <form
        className="capture__row"
        onSubmit={(e) => {
          e.preventDefault()
          submit(text)
        }}
      >
        <input
          className="input capture__input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={listening ? t.capture.listening : t.capture.placeholder}
          aria-label={t.capture.placeholder}
          disabled={busy}
        />
        <VoiceButton voice={voice} label={t.capture.voice} />
        <button type="submit" className="btn capture__add" disabled={busy || !text.trim()}>
          {t.capture.add}
        </button>
      </form>

      {needType && (
        <div className="capture__picker" role="group" aria-label={t.capture.pickType}>
          <span className="capture__picker-label mono">{t.capture.degraded}</span>
          {FORCE_TYPES.map((ty) => (
            <button
              key={ty}
              type="button"
              className="btn btn--ghost mono"
              disabled={busy}
              onClick={() => submit(needType, ty, lastCleanup)}
            >
              {t.capture.types[ty]}
            </button>
          ))}
        </div>
      )}

      {routed && (
        <div className="capture__ack">
          <p className="capture__routed mono" role="status">
            {corrected ? t.capture.rerouteDone : t.capture.routed} <strong>{routed.label}</strong>{' '}
            <span className="capture__routed-kind">
              {t.capture.types[routed.kind as IntentType] ?? routed.kind}
            </span>
          </p>
          <button
            type="button"
            className="capture__reroute mono"
            disabled={busy}
            aria-expanded={showReroute}
            onClick={() => setShowReroute((s) => !s)}
          >
            {t.capture.reroute}
          </button>
          {showReroute && (
            <div className="capture__picker" role="group" aria-label={t.capture.pickType}>
              {FORCE_TYPES.filter((ty) => ty !== routed.kind).map((ty) => (
                <button
                  key={ty}
                  type="button"
                  className="btn btn--ghost mono"
                  disabled={busy}
                  onClick={() => submit(lastText, ty, lastCleanup, true)}
                >
                  {t.capture.types[ty]}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
