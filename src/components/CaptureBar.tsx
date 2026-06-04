import { useRef, useState } from 'react'
import { api } from '../lib/api'
import { useLang, useT } from '../i18n'
import type { IntentType } from '../lib/captureTypes'

// The capture bar: one input, type or speak. Voice uses the browser's on-device
// SpeechRecognition (zero Neurons, nothing leaves the device for STT in the
// prototype). The text is then classified server-side by Workers AI.
//
// When the server reports `degraded` (AI binding unset), we show a manual
// type-picker so the capture is never lost — the same shape the brief promises.
const FORCE_TYPES: IntentType[] = ['event', 'task', 'list-item', 'pantry-low', 'meal', 'note']

export function CaptureBar({ onCaptured }: { onCaptured?: () => void }) {
  const t = useT()
  const { lang } = useLang()
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [routed, setRouted] = useState<{ kind: string; label: string } | null>(null)
  const [needType, setNeedType] = useState<string | null>(null)
  const [listening, setListening] = useState(false)
  const recogRef = useRef<SpeechRecognitionLike | null>(null)

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

  function startVoice() {
    const Ctor =
      (window as unknown as { SpeechRecognition?: SpeechRecognitionCtor }).SpeechRecognition ??
      (window as unknown as { webkitSpeechRecognition?: SpeechRecognitionCtor }).webkitSpeechRecognition
    if (!Ctor) return
    const recog = new Ctor()
    recog.lang = lang === 'fr' ? 'fr-CA' : 'en-CA'
    recog.interimResults = false
    recog.maxAlternatives = 1
    recog.onresult = (e: SpeechRecognitionEventLike) => {
      const said = e.results[0]?.[0]?.transcript ?? ''
      setText(said)
      setListening(false)
    }
    recog.onend = () => setListening(false)
    recog.onerror = () => setListening(false)
    recogRef.current = recog
    setListening(true)
    recog.start()
  }

  const hasVoice =
    typeof window !== 'undefined' &&
    !!(
      (window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition ||
      (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition
    )

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
        {hasVoice && (
          <button
            type="button"
            className={`btn btn--ghost capture__voice${listening ? ' is-listening' : ''}`}
            onClick={startVoice}
            aria-label={t.capture.voice}
          >
            🎤
          </button>
        )}
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

// --- Minimal Web Speech typings (not in lib.dom for all targets) ------------
type SpeechRecognitionCtor = new () => SpeechRecognitionLike
interface SpeechRecognitionLike {
  lang: string
  interimResults: boolean
  maxAlternatives: number
  onresult: (e: SpeechRecognitionEventLike) => void
  onend: () => void
  onerror: () => void
  start: () => void
}
interface SpeechRecognitionEventLike {
  results: ArrayLike<ArrayLike<{ transcript: string }>>
}
