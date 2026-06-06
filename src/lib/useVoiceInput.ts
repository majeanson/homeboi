import { useRef, useState } from 'react'
import { useLang } from '../i18n'

// On-device speech-to-text via the browser's Web Speech API. This is the calm,
// zero-cost, in-browser STT the capture surfaces share: where the browser
// supports it, nothing we pay for or host runs. `hasVoice` is false where it's
// unsupported so callers hide the mic entirely rather than show a dead button.
// (Server STT like Whisper was considered, but this keeps capture free + private
// and good enough for short household notes.)

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

function getCtor(): SpeechRecognitionCtor | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor
    webkitSpeechRecognition?: SpeechRecognitionCtor
  }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

export function useVoiceInput(onResult: (text: string) => void) {
  const { lang } = useLang()
  const [listening, setListening] = useState(false)
  const recogRef = useRef<SpeechRecognitionLike | null>(null)
  const hasVoice = !!getCtor()

  function start() {
    const Ctor = getCtor()
    if (!Ctor) return
    const recog = new Ctor()
    recog.lang = lang === 'fr' ? 'fr-CA' : 'en-CA'
    recog.interimResults = false
    recog.maxAlternatives = 1
    recog.onresult = (e) => {
      onResult(e.results[0]?.[0]?.transcript ?? '')
      setListening(false)
    }
    recog.onend = () => setListening(false)
    recog.onerror = () => setListening(false)
    recogRef.current = recog
    setListening(true)
    recog.start()
  }

  return { listening, hasVoice, start }
}
