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
const FORCE_TYPES: IntentType[] = ['event', 'task', 'list-item', 'pantry-low', 'meal', 'leftover', 'note']

export function CaptureBar({ onCaptured }: { onCaptured?: () => void }) {
  const t = useT()
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [routed, setRouted] = useState<{ kind: string; label: string } | null>(null)
  const [needType, setNeedType] = useState<string | null>(null)
  const voice = useVoiceInput(setText)
  const { listening } = voice

  async function submit(forceType?: IntentType) {
    const value = text.trim()
    if (!value || busy) return
    setBusy(true)
    setRouted(null)
    try {
      const res = await api<{ type: string; degraded: boolean; routed: { kind: string; label: string } }>(
        'capture',
        { method: 'POST', body: { text: value, source: 'text', forceType } },
      )
      if (res.degraded && !forceType) {
        // AI offline and no explicit type — ask the human which it was, keep
        // the text so they don't retype.
        setNeedType(value)
      } else {
        setRouted(res.routed)
        setText('')
        setNeedType(null)
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
          submit()
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
            <button key={ty} type="button" className="btn btn--ghost mono" onClick={() => submit(ty)}>
              {t.capture.types[ty]}
            </button>
          ))}
        </div>
      )}

      {routed && (
        <p className="capture__routed mono" role="status">
          {t.capture.routed} <strong>{routed.label}</strong>{' '}
          <span className="capture__routed-kind">{t.capture.types[routed.kind as IntentType] ?? routed.kind}</span>
        </p>
      )}
    </div>
  )
}
