import { useEffect, useRef, useState } from 'react'
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
//   • `continuous` (La liste, garde-manger) — stays open and emits each finished
//     phrase as its own item, so you can rattle off a whole grocery run hands-free.
//     With `split`, one breath of "lait, œufs pis pain" becomes three items, AND a
//     plain *pause* between items breaks them too (see PAUSE_MS below).

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

// How long a silence ends the current spoken item (continuous mode only).
// Chrome's own end-of-speech detection waits far longer, so rattling off
// "patate … blé d'inde … tarte" with short pauses arrived as ONE merged
// transcript — and since there's no connector to split on (and we can't split on
// spaces without chopping multi-word items like "blé d'inde"), it landed as one
// item. We instead cut on our OWN pause threshold: long enough not to split the
// gap inside "blé d'inde" (~150ms), short enough that a deliberate pause works.
const PAUSE_MS = 800

interface VoiceOpts {
  // Keep the mic open and emit every finished phrase (caller adds each). Tap
  // again to stop. Without this the mic captures one phrase then stops.
  continuous?: boolean
  // Split one phrase on list connectors (and, in continuous mode, on pauses).
  split?: boolean
}

// The browser-remembered mic grant for this origin. 'granted'/'denied' persist
// across sessions and PWA launches (per-origin, owned by the browser/OS — we
// can't save or pre-grant it ourselves); 'prompt' means it'll ask on first tap.
// 'unknown' = the Permissions API can't tell us (Safari, older engines) — we
// fall back to the reactive onerror path. Lets callers show a blocked mic
// BEFORE a dead tap, e.g. a kiosk where the grant was never given.
export type MicPermission = 'granted' | 'denied' | 'prompt' | 'unknown'

export interface VoiceInput {
  listening: boolean
  hasVoice: boolean
  error: string | null
  permission: MicPermission
  start: () => void
  stop: () => void
}

export function useVoiceInput(onResult: (text: string) => void, opts: VoiceOpts = {}): VoiceInput {
  const { lang } = useLang()
  const [listening, setListening] = useState(false)
  // Last recognition error (e.g. 'not-allowed', 'no-speech', 'language-not-supported')
  // so callers can show *why* nothing landed instead of a silent dead mic.
  const [error, setError] = useState<string | null>(null)
  const [permission, setPermission] = useState<MicPermission>('unknown')
  const recogRef = useRef<SpeechRecognitionLike | null>(null)
  // Set when the user taps to stop, so the onend auto-restart (continuous mode)
  // knows this was intentional and lets it end.
  const stoppedRef = useRef(false)
  // Pending "end of item on silence" timer (continuous mode). See PAUSE_MS.
  const silenceRef = useRef<number | null>(null)
  const hasVoice = !!getCtor()

  // Read the browser-remembered mic grant up front, and follow it live (the
  // operator may flip it in browser/kiosk settings while the app is open). This
  // only READS state — there's no web API to save or pre-grant a permission;
  // the browser/OS owns that. Best-effort: the 'microphone' descriptor isn't in
  // every engine (notably Safari), where we stay 'unknown' and lean on onerror.
  useEffect(() => {
    if (!hasVoice) return
    const perms = navigator.permissions
    if (!perms?.query) return
    let status: PermissionStatus | null = null
    const apply = () => status && setPermission(status.state as MicPermission)
    let cancelled = false
    perms
      .query({ name: 'microphone' as PermissionName })
      .then((s) => {
        if (cancelled) return
        status = s
        apply()
        s.addEventListener('change', apply)
      })
      .catch(() => {
        /* descriptor unsupported — stay 'unknown' */
      })
    return () => {
      cancelled = true
      status?.removeEventListener('change', apply)
    }
  }, [hasVoice])

  function clearSilence() {
    if (silenceRef.current != null) {
      clearTimeout(silenceRef.current)
      silenceRef.current = null
    }
  }

  // (Re)arm the pause timer. Each interim result resets it; a gap longer than
  // PAUSE_MS fires it. Firing force-finalizes the current utterance by stopping
  // the engine — onresult then emits it exactly once and onend auto-restarts a
  // fresh phrase (continuous mode), so a pause cleanly ends one item.
  function armSilence() {
    clearSilence()
    silenceRef.current = window.setTimeout(() => {
      silenceRef.current = null
      try {
        recogRef.current?.stop()
      } catch {
        /* stop() on an already-stopped engine is a no-op */
      }
    }, PAUSE_MS)
  }

  function stop() {
    stoppedRef.current = true
    clearSilence()
    setListening(false)
    recogRef.current?.stop()
    recogRef.current = null
  }

  // Drop the timer (and abort a live mic) when the caller unmounts.
  useEffect(() => () => clearSilence(), [])

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
      let sawInterim = false
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i]
        if (!r.isFinal) {
          sawInterim = true
          continue
        }
        const phrase = r[0]?.transcript?.trim()
        if (!phrase) continue
        const parts = opts.split ? splitItems(phrase) : [phrase]
        for (const p of parts) onResult(p)
      }
      // Single-shot mode is done after its one phrase.
      if (!opts.continuous) {
        stop()
        return
      }
      // Continuous: a final closes the current item (cancel any pending pause cut);
      // an interim means speech is still flowing, so (re)arm the pause timer that
      // cuts the next item on silence.
      if (sawInterim) armSilence()
      else clearSilence()
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
        clearSilence()
        setListening(false)
        recogRef.current = null
        // Reflect a refused grant even where the Permissions API is 'unknown'
        // (Safari), so the button shows blocked next time without another tap.
        if (e.error !== 'language-not-supported') setPermission('denied')
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

  return { listening, hasVoice, error, permission, start, stop }
}
