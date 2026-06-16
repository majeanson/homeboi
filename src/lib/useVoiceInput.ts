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

// iOS (incl. iPadOS, which poses as a Mac). There the Permissions API can't
// read the mic grant AND a denied mic can't be re-prompted from the page — the
// only way back is iOS Settings. So callers swap to the Settings-pointing
// recovery copy on iOS rather than the generic "allow it in your browser".
export function isIos(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent
  if (/iP(hone|ad|od)/.test(ua)) return true
  // iPadOS 13+ reports a desktop Safari UA; touch support disambiguates it.
  return /Macintosh/.test(ua) && typeof document !== 'undefined' && 'ontouchend' in document
}

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
  // Latest interim transcript for the CURRENT utterance, not yet committed. Some
  // engines (notably iOS Safari in continuous mode) stream interim guesses but
  // never mark one `isFinal` before our pause-stop fires — so the phrase would be
  // lost and the mic looks like it "hears nothing." We keep the last interim and
  // flush it when an utterance ends without a final. A real final supersedes it.
  const pendingRef = useRef('')
  // Whether the OS mic grant has been (re)established via getUserMedia this run.
  const micGrantedRef = useRef(false)
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

  // Commit the last interim transcript when an utterance ended without ever
  // producing a final (see pendingRef). No-op when a final already cleared it, so
  // a healthy engine never double-adds. Returns whether anything was emitted, so
  // onend can clear a non-fatal error once we've recovered a usable transcript.
  function flushPending(): boolean {
    const phrase = pendingRef.current.trim()
    pendingRef.current = ''
    if (!phrase) return false
    const parts = opts.split ? splitItems(phrase) : [phrase]
    for (const p of parts) onResult(p)
    return true
  }

  // iOS-only: establish (and, on an installed PWA, PERSIST) the mic grant via
  // getUserMedia before handing off to Web Speech. iOS doesn't remember Web
  // Speech's own capture across PWA launches — so a backgrounded-then-reopened app
  // re-prompted every time — but it DOES remember a getUserMedia grant. Priming
  // here means the next cold launch reuses the grant silently. We don't keep the
  // stream (Web Speech captures on its own); releasing it clears the recording
  // indicator while the grant stays. Elsewhere (Android/desktop) the engine's own
  // permission handling already persists, so we skip this to avoid a 2nd prompt.
  async function ensureMicGrant(): Promise<boolean> {
    if (!isIos() || micGrantedRef.current) return true
    const md = navigator.mediaDevices
    if (!md?.getUserMedia) return true
    try {
      const stream = await md.getUserMedia({ audio: true })
      stream.getTracks().forEach((tr) => tr.stop())
      micGrantedRef.current = true
      setPermission('granted')
      return true
    } catch (err) {
      const name = (err as DOMException)?.name
      if (name === 'NotAllowedError' || name === 'SecurityError') {
        setPermission('denied')
        setError('not-allowed')
        setListening(false)
        stoppedRef.current = true
        return false
      }
      // NotFoundError / transient glitch — don't block; let the engine try and
      // surface its own error.
      return true
    }
  }

  function stop() {
    stoppedRef.current = true
    clearSilence()
    setListening(false)
    recogRef.current?.stop()
    recogRef.current = null
  }

  // Kill the pause timer AND the live mic when the caller unmounts. Without the
  // abort, a continuous mic left open as the caller unmounts (navigating away
  // from La liste / the garde-manger) keeps recognising and re-arming itself via
  // onend — a leaked, perpetually-restarting mic. Set stoppedRef first so onend
  // sees the teardown and doesn't restart. Refs are stable, so no stale capture.
  useEffect(
    () => () => {
      stoppedRef.current = true
      clearSilence()
      try {
        recogRef.current?.abort()
      } catch {
        /* abort on an already-dead engine is a no-op */
      }
      recogRef.current = null
    },
    [],
  )

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
    // On iOS, establish/persist the grant first (then begin in its resolution);
    // everywhere else begin synchronously so the engine's start() stays inside the
    // user gesture exactly as before.
    if (isIos() && !micGrantedRef.current && typeof navigator.mediaDevices?.getUserMedia === 'function') {
      void ensureMicGrant().then((ok) => {
        if (ok && !stoppedRef.current) begin(Ctor)
      })
      return
    }
    begin(Ctor)
  }

  function begin(Ctor: SpeechRecognitionCtor) {
    const recog = new Ctor()
    recog.lang = lang === 'fr' ? 'fr-CA' : 'en-CA'
    recog.continuous = !!opts.continuous
    // Interim results both drive the live "…" placeholder AND give us a fallback
    // transcript to flush if the engine never marks one final (see pendingRef) —
    // the "it listens but adds nothing" case on some phones. We still only commit
    // a final, or that last interim once the utterance ends.
    recog.interimResults = true
    recog.maxAlternatives = 1
    pendingRef.current = ''

    recog.onresult = (e) => {
      // Walk from resultIndex so each final fires exactly once. Interim guesses
      // are remembered (not emitted) so a final can supersede them.
      let sawInterim = false
      let emittedFinal = false
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i]
        if (!r.isFinal) {
          sawInterim = true
          pendingRef.current = r[0]?.transcript?.trim() ?? pendingRef.current
          continue
        }
        const phrase = r[0]?.transcript?.trim()
        pendingRef.current = '' // a final supersedes any interim for this utterance
        if (!phrase) continue
        emittedFinal = true
        const parts = opts.split ? splitItems(phrase) : [phrase]
        for (const p of parts) onResult(p)
      }
      // Single-shot: done once a final lands. An interim-only event must NOT stop
      // (it would cut before the final); onend flushes the last interim as a
      // fallback if no final ever comes.
      if (!opts.continuous) {
        if (emittedFinal) stop()
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
      // Commit a trailing interim the engine never finalized (no-op if a final
      // already cleared it). Without this, phones that don't finalize before our
      // pause-stop dropped every phrase. On iOS the engine often streams interims
      // then fires a non-fatal 'aborted' at end-of-speech without ever committing
      // a final (the standalone-PWA dictation restriction) — recovering the last
      // interim here means the phrase still lands.
      const recovered = flushPending()
      // We salvaged a usable transcript, so the transient error that accompanied
      // it (e.g. 'aborted'/'no-speech') isn't a user-facing failure — clear it so
      // callers don't show an error over text that actually arrived.
      if (recovered) setError(null)
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
