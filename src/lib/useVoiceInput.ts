import { useRef, useState } from 'react'
import { useLang } from '../i18n'

// On-device speech-to-text via the browser's Web Speech API. This is the calm,
// zero-cost, in-browser STT the capture surfaces share: where the browser
// supports it, nothing we pay for or host runs. `hasVoice` is false where it's
// unsupported so callers hide the mic entirely rather than show a dead button.
// (Server STT like Whisper was considered, but this keeps capture free + private
// and good enough for short household notes.)
//
// Two modes, set per caller:
//   • default (CaptureBar) — single phrase, fills the input for the user to route.
//   • `continuous` (La liste) — stays open and emits each finished phrase as its
//     own item, so you can rattle off a whole grocery run hands-free. With
//     `split`, one breath of "lait, œufs pis pain" becomes three items.

type SpeechRecognitionCtor = new () => SpeechRecognitionLike
interface SpeechRecognitionResultLike {
  isFinal: boolean
  0: { transcript: string }
}
interface SpeechRecognitionLike {
  lang: string
  continuous: boolean
  interimResults: boolean
  maxAlternatives: number
  onresult: (e: SpeechRecognitionEventLike) => void
  onend: () => void
  onerror: (e: { error: string }) => void
  start: () => void
  stop: () => void
  abort: () => void
}
interface SpeechRecognitionEventLike {
  resultIndex: number
  results: ArrayLike<SpeechRecognitionResultLike>
}

function getCtor(): SpeechRecognitionCtor | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor
    webkitSpeechRecognition?: SpeechRecognitionCtor
  }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

// Break a spoken phrase into separate list items on natural list connectors,
// FR-CA first ("et", "pis", "puis") plus comma/"and". Single phrases (no
// connector) pass straight through as one item.
export function splitItems(text: string): string[] {
  return text
    .split(/\s*,\s*|\s+(?:et|pis|puis|and)\s+/i)
    .map((s) => s.trim())
    .filter(Boolean)
}

interface VoiceOpts {
  // Keep the mic open and emit every finished phrase (caller adds each). Tap
  // again to stop. Without this the mic captures one phrase then stops.
  continuous?: boolean
  // Split one phrase on list connectors into multiple results.
  split?: boolean
}

export function useVoiceInput(onResult: (text: string) => void, opts: VoiceOpts = {}) {
  const { lang } = useLang()
  const [listening, setListening] = useState(false)
  // Last recognition error (e.g. 'not-allowed', 'no-speech', 'language-not-supported')
  // so callers can show *why* nothing landed instead of a silent dead mic.
  const [error, setError] = useState<string | null>(null)
  const recogRef = useRef<SpeechRecognitionLike | null>(null)
  // Set when the user taps to stop, so the onend auto-restart (continuous mode)
  // knows this was intentional and lets it end.
  const stoppedRef = useRef(false)
  const hasVoice = !!getCtor()

  function stop() {
    stoppedRef.current = true
    setListening(false)
    recogRef.current?.stop()
    recogRef.current = null
  }

  function start() {
    const Ctor = getCtor()
    if (!Ctor) return
    // Toggle: a second tap on an open mic stops it (continuous mode).
    if (recogRef.current) {
      stop()
      return
    }
    setError(null)
    stoppedRef.current = false

    const recog = new Ctor()
    recog.lang = lang === 'fr' ? 'fr-CA' : 'en-CA'
    recog.continuous = !!opts.continuous
    // Interim results let the input show a live "…" placeholder and keep Chrome
    // from cutting recognition short between phrases; we still only ACT on finals.
    recog.interimResults = !!opts.continuous
    recog.maxAlternatives = 1

    recog.onresult = (e) => {
      // Only emit phrases the engine has finalized — interim guesses would add
      // half-heard junk. Walk from resultIndex so each final fires exactly once.
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i]
        if (!r.isFinal) continue
        const phrase = r[0]?.transcript?.trim()
        if (!phrase) continue
        const parts = opts.split ? splitItems(phrase) : [phrase]
        for (const p of parts) onResult(p)
      }
      // Single-shot mode is done after its one phrase.
      if (!opts.continuous) stop()
    }

    recog.onend = () => {
      recogRef.current = null
      // Chrome ends recognition after a stretch of silence. In continuous mode
      // that shouldn't end the session — restart unless the user tapped stop or
      // a fatal permission error fired.
      if (opts.continuous && !stoppedRef.current) {
        start()
        return
      }
      setListening(false)
    }

    recog.onerror = (e) => {
      setError(e.error)
      // A denied mic or unsupported language is terminal — don't auto-restart
      // into the same wall. 'no-speech'/'aborted' are transient; onend handles
      // the restart for those.
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed' || e.error === 'language-not-supported') {
        stoppedRef.current = true
        setListening(false)
        recogRef.current = null
      }
    }

    recogRef.current = recog
    setListening(true)
    try {
      recog.start()
    } catch {
      // start() throws if called while already running — treat as a no-op so the
      // mic state doesn't get stuck.
      setListening(false)
      recogRef.current = null
    }
  }

  return { listening, hasVoice, error, start, stop }
}
