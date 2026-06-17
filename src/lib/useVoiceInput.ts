import { useEffect, useRef, useState } from 'react'
import { useLang } from '../i18n'
import { api } from './api'

// On-device speech-to-text via the browser's Web Speech API. This is the calm,
// zero-cost, in-browser STT the capture surfaces share: where the browser
// supports it, nothing we pay for or host runs. `hasVoice` is false where NEITHER
// path below works, so callers hide the mic rather than show a dead button.
//
// One context defeats on-device recognition: an iOS/iPadOS INSTALLED PWA, where
// webkitSpeechRecognition starts then aborts instantly with zero audio (the
// standalone-sandbox dictation restriction). getUserMedia/MediaRecorder still work
// there, so we fall back to recording a short clip and transcribing it server-side
// via Workers AI Whisper (/api/transcribe) — feeding the SAME onResult the
// recognizer would. The fallback also catches any browser with no SpeechRecognition
// at all (e.g. Firefox). On-device stays the default everywhere it actually works;
// Whisper only runs where recognition is gated, so capture stays free + private
// for the common case.
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

// Whisper fallback has no streaming, so the continuous callers can't lean on the
// engine's own end-of-phrase events the way on-device recognition does. Instead an
// AnalyserNode watches the mic level and we cut a segment after PAUSE_MS of quiet —
// each segment is its own clip → its own /api/transcribe → its own item, so rattling
// off "lait … œufs … pain" word by word lands as three items instead of one mushed
// transcript (Whisper only inserts the commas splitItems() needs when you speak a
// flowing SENTENCE, not isolated words). Poll cadence + the RMS level (normalized
// mic samples, 0–1) that counts as speech rather than room noise.
const VAD_POLL_MS = 100
const VAD_THRESHOLD = 0.02

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

// Running as an installed PWA (home-screen icon), not a browser tab. On iOS this
// is exactly the context where webkitSpeechRecognition is gated, so it picks the
// Whisper recording fallback. Checks the iOS-only `navigator.standalone` flag AND
// the standard display-mode media query (Android/desktop installs). Mirrors the
// same check in components/operator/micTest.tsx.
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  const navAny = navigator as unknown as { standalone?: boolean }
  const mm = typeof window.matchMedia === 'function' && window.matchMedia('(display-mode: standalone)').matches
  return !!navAny.standalone || !!mm
}

// Pick a container MediaRecorder can actually produce on THIS engine: iOS Safari
// only does audio/mp4 (AAC); Chromium/Android prefer audio/webm. '' lets the
// recorder choose its own default. Whisper decodes any of them server-side.
function pickAudioMime(): string {
  if (typeof window === 'undefined' || typeof window.MediaRecorder === 'undefined') return ''
  const MR = window.MediaRecorder
  for (const m of ['audio/mp4', 'audio/webm', 'audio/ogg']) {
    if (typeof MR.isTypeSupported === 'function' && MR.isTypeSupported(m)) return m
  }
  return ''
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
  // iOS/iPadOS instant-abort recovery (see onend). The getUserMedia grant-prime
  // fired right before start() can race the audio session and abort the very
  // FIRST attempt instantly with zero audio (seen on iPadOS 17 installed PWA).
  // sawResultRef = did this attempt produce any result; lastErrorRef = its last
  // engine error; retriedRef = have we already spent our one no-prime retry.
  const sawResultRef = useRef(false)
  const lastErrorRef = useRef<string | null>(null)
  const retriedRef = useRef(false)
  // Whisper fallback (iOS installed PWA / no SpeechRecognition): the live recorder,
  // its captured chunks, the held mic stream, and the safety auto-stop timer. The
  // state ref guards against a tap landing mid-transcription starting a 2nd clip.
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<BlobPart[]>([])
  const audioStreamRef = useRef<MediaStream | null>(null)
  const whisperTimerRef = useRef<number | null>(null)
  const whisperStateRef = useRef<'idle' | 'recording' | 'transcribing'>('idle')
  // Whisper continuous-mode pause-cut (VAD). The AudioContext + poll timer watch the
  // live mic level; vadActive stays true between items so each recorder's onstop
  // opens the next segment, and a tap-stop clears it to make the current one final.
  // hadSpeech/silentPolls track "have we heard speech, and for how many quiet polls"
  // so we only cut AFTER real speech, never on the leading silence before item one.
  const audioCtxRef = useRef<AudioContext | null>(null)
  const vadIntervalRef = useRef<number | null>(null)
  const vadActiveRef = useRef(false)
  const hadSpeechRef = useRef(false)
  const silentPollsRef = useRef(0)

  // Which STT path this device uses. On-device recognition is preferred, but it's
  // gated in an iOS installed PWA (instant abort), so there we record + transcribe
  // server-side instead. `canRecord` also rescues any browser with no recognition
  // API. `hasVoice` stays false only when NEITHER works, so the mic hides cleanly.
  const recognitionUsable = !!getCtor() && !(isIos() && isStandalone())
  const canRecord =
    typeof navigator !== 'undefined' &&
    !!navigator.mediaDevices?.getUserMedia &&
    typeof window !== 'undefined' &&
    typeof window.MediaRecorder !== 'undefined'
  const useWhisper = !recognitionUsable && canRecord
  const hasVoice = recognitionUsable || useWhisper

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

  function clearWhisperTimer() {
    if (whisperTimerRef.current != null) {
      clearTimeout(whisperTimerRef.current)
      whisperTimerRef.current = null
    }
  }

  // Release the held mic so the OS recording indicator clears. Safe to call twice.
  function teardownStream() {
    audioStreamRef.current?.getTracks().forEach((t) => t.stop())
    audioStreamRef.current = null
  }

  // Watch the live mic level and cut a segment after PAUSE_MS of quiet (continuous
  // Whisper mode only). Returns whether VAD actually started — if Web Audio is
  // missing we fall back to one clip on stop (same as a single capture). Best-effort
  // throughout: any failure just means no pause-cutting, never a dead mic.
  function startVad(stream: MediaStream): boolean {
    const Ctx =
      (window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext })
        .AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctx) return false
    let ctx: AudioContext
    try {
      ctx = new Ctx()
    } catch {
      return false
    }
    audioCtxRef.current = ctx
    void ctx.resume?.()
    const analyser = ctx.createAnalyser()
    analyser.fftSize = 1024
    try {
      ctx.createMediaStreamSource(stream).connect(analyser)
    } catch {
      stopVad()
      return false
    }
    const buf = new Uint8Array(analyser.fftSize)
    hadSpeechRef.current = false
    silentPollsRef.current = 0
    const silenceToCut = Math.ceil(PAUSE_MS / VAD_POLL_MS)
    vadIntervalRef.current = window.setInterval(() => {
      analyser.getByteTimeDomainData(buf)
      let sum = 0
      for (let i = 0; i < buf.length; i++) {
        const v = (buf[i]! - 128) / 128 // centre the 0–255 byte and normalize to ±1
        sum += v * v
      }
      const rms = Math.sqrt(sum / buf.length)
      if (rms > VAD_THRESHOLD) {
        hadSpeechRef.current = true
        silentPollsRef.current = 0
        return
      }
      // Only count quiet AFTER we've heard the current item — leading silence (before
      // item one, or just after a cut) must not fire an empty segment.
      if (!hadSpeechRef.current) return
      if (++silentPollsRef.current >= silenceToCut) {
        hadSpeechRef.current = false
        silentPollsRef.current = 0
        cutSegment()
      }
    }, VAD_POLL_MS)
    return true
  }

  function stopVad() {
    if (vadIntervalRef.current != null) {
      clearInterval(vadIntervalRef.current)
      vadIntervalRef.current = null
    }
    const ctx = audioCtxRef.current
    audioCtxRef.current = null
    if (ctx) {
      try {
        void ctx.close()
      } catch {
        /* already closed */
      }
    }
    hadSpeechRef.current = false
    silentPollsRef.current = 0
  }

  // Finalize the current item on a detected pause: stopping the recorder fires its
  // onstop, which transcribes this segment in the background AND opens the next one.
  function cutSegment() {
    const mr = mediaRecorderRef.current
    if (mr && mr.state === 'recording') {
      try {
        mr.stop()
      } catch {
        /* already stopped */
      }
    }
  }

  // One MediaRecorder per segment. While vadActive (continuous, mid-run), each
  // onstop transcribes its clip and immediately opens the next recorder so the
  // following item is captured — the brief gap is always inside a pause. When
  // vadActive is false (single capture, or the user ended a continuous run) this is
  // the LAST segment: transcribe it, release the mic, and reset. A hard stop()/
  // unmount (stoppedRef) drops the clip instead.
  function makeRecorder(stream: MediaStream): MediaRecorder {
    audioChunksRef.current = []
    const mime = pickAudioMime()
    let mr: MediaRecorder
    try {
      mr = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined)
    } catch {
      mr = new MediaRecorder(stream) // engine rejected the hint — take its default
    }
    mr.ondataavailable = (e) => {
      if (e.data && e.data.size) audioChunksRef.current.push(e.data)
    }
    mr.onstop = () => {
      const chunks = audioChunksRef.current
      audioChunksRef.current = []
      const type = mr.mimeType || pickAudioMime() || 'audio/webm'
      const blob = new Blob(chunks, { type })
      const drop = stoppedRef.current
      if (vadActiveRef.current && !drop) {
        if (blob.size > 0) void transcribeSegment(blob)
        const next = makeRecorder(stream)
        mediaRecorderRef.current = next
        try {
          next.start()
        } catch {
          /* if the next segment can't open, stopVad on teardown still clears the mic */
        }
        return
      }
      // Final segment for this run.
      mediaRecorderRef.current = null
      stopVad()
      teardownStream()
      if (!drop) {
        if (blob.size > 0) void transcribeSegment(blob)
        else setError('no-speech')
      }
      whisperStateRef.current = 'idle'
      setListening(false)
    }
    return mr
  }

  // POST one segment's clip and emit its transcript through the same onResult as
  // recognition (split into items when the caller asked). Mid-stream failures stay
  // quiet in continuous mode — one dropped item shouldn't error over the run.
  async function transcribeSegment(blob: Blob) {
    try {
      const res = await api<{ text?: string }>('transcribe', { method: 'POST', body: blob })
      const phrase = (res?.text ?? '').trim()
      if (phrase) {
        const parts = opts.split ? splitItems(phrase) : [phrase]
        for (const p of parts) onResult(p)
        setError(null)
      } else if (!opts.continuous) {
        setError('no-speech')
      }
    } catch {
      // api() already popped the AI-error notice if the server tagged the response.
      if (!opts.continuous) setError('no-speech')
    }
  }

  // Whisper path entry. First tap opens the mic and records; a second tap ends and
  // transcribes (there's no per-word streaming server-side). In continuous mode an
  // AnalyserNode cuts items on pauses (see startVad) so a whole grocery run lands as
  // separate items; a single capture stays one clip. A safety cap stops a forgotten
  // mic. Mirrors the recognition path's single-tap-toggle.
  async function startWhisper() {
    if (whisperStateRef.current === 'recording') {
      stopWhisper()
      return
    }
    if (whisperStateRef.current === 'transcribing') return // busy — ignore the tap
    setError(null)
    stoppedRef.current = false
    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch (err) {
      const name = (err as DOMException)?.name
      if (name === 'NotAllowedError' || name === 'SecurityError') {
        setPermission('denied')
        setError('not-allowed')
      } else {
        setError('no-speech')
      }
      setListening(false)
      return
    }
    setPermission('granted')
    audioStreamRef.current = stream
    // Continuous → pause-cut into per-item segments; single capture → one clip on
    // stop. If VAD can't start (no Web Audio) the continuous run degrades to one
    // clip, exactly as before.
    vadActiveRef.current = opts.continuous ? startVad(stream) : false
    const mr = makeRecorder(stream)
    mediaRecorderRef.current = mr
    whisperStateRef.current = 'recording'
    setListening(true)
    try {
      mr.start()
    } catch {
      /* recorder refused to start — surface as a missed capture */
      stopVad()
      teardownStream()
      whisperStateRef.current = 'idle'
      setListening(false)
      setError('no-speech')
      return
    }
    // A grocery run (continuous) gets a longer window than one capture; either way
    // the mic can't run forever if the user walks away.
    const cap = opts.continuous ? 120000 : 15000
    whisperTimerRef.current = window.setTimeout(() => stopWhisper(), cap)
  }

  // End the run gracefully: clear vadActive so the current segment becomes the FINAL
  // one (its onstop transcribes it, then cleans up) rather than chaining another.
  // 'transcribing' blocks a re-tap until the text lands.
  function stopWhisper() {
    clearWhisperTimer()
    vadActiveRef.current = false
    const mr = mediaRecorderRef.current
    if (mr && whisperStateRef.current === 'recording') {
      whisperStateRef.current = 'transcribing'
      try {
        mr.stop()
      } catch {
        /* already stopped */
      }
    }
  }

  function stop() {
    stoppedRef.current = true
    vadActiveRef.current = false
    clearSilence()
    clearWhisperTimer()
    stopVad()
    setListening(false)
    recogRef.current?.stop()
    recogRef.current = null
    // Abandon any in-flight recording — the recorder's onstop sees stoppedRef and drops it.
    if (mediaRecorderRef.current && whisperStateRef.current === 'recording') {
      whisperStateRef.current = 'transcribing'
      try {
        mediaRecorderRef.current.stop()
      } catch {
        /* no-op */
      }
    }
  }

  // Kill the pause timer AND the live mic when the caller unmounts. Without the
  // abort, a continuous mic left open as the caller unmounts (navigating away
  // from La liste / the garde-manger) keeps recognising and re-arming itself via
  // onend — a leaked, perpetually-restarting mic. Set stoppedRef first so onend
  // sees the teardown and doesn't restart. Refs are stable, so no stale capture.
  useEffect(
    () => () => {
      stoppedRef.current = true
      vadActiveRef.current = false
      clearSilence()
      clearWhisperTimer()
      stopVad()
      try {
        recogRef.current?.abort()
      } catch {
        /* abort on an already-dead engine is a no-op */
      }
      recogRef.current = null
      // Kill a live recording and release the mic so the stream never leaks.
      if (mediaRecorderRef.current && whisperStateRef.current === 'recording') {
        try {
          mediaRecorderRef.current.stop()
        } catch {
          /* no-op */
        }
      }
      teardownStream()
    },
    [],
  )

  function start() {
    // iOS installed PWA / no recognition API → record + server-transcribe instead.
    // startWhisper owns its own tap-toggle, so just hand off.
    if (useWhisper) {
      void startWhisper()
      return
    }
    const Ctor = getCtor()
    if (!Ctor) return
    // Toggle: a second tap on an open mic stops it (continuous mode).
    if (recogRef.current) {
      stop()
      return
    }
    setError(null)
    stoppedRef.current = false
    // Fresh user-initiated session gets one no-prime retry (begin() keeps it).
    retriedRef.current = false
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
    // Per-attempt reset for the instant-abort recovery (see onend).
    sawResultRef.current = false
    lastErrorRef.current = null

    recog.onresult = (e) => {
      // Walk from resultIndex so each final fires exactly once. Interim guesses
      // are remembered (not emitted) so a final can supersede them.
      let sawInterim = false
      let emittedFinal = false
      sawResultRef.current = true // any result at all rules out the instant-abort retry
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
      // iOS/iPadOS instant-abort recovery: the getUserMedia grant-prime fired right
      // before start() can race the audio session and abort the FIRST attempt
      // instantly — 'aborted' with zero results, before any speech (seen on iPadOS
      // 17 installed PWA). The grant now persists (micGrantedRef), so retrying via
      // begin() — which SKIPS the prime — usually starts clean. One retry only
      // (retriedRef), single-shot only: continuous already restarts via start()
      // below (which also skips the prime once primed), so it self-heals.
      if (
        !opts.continuous &&
        !recovered &&
        !stoppedRef.current &&
        !retriedRef.current &&
        !sawResultRef.current &&
        lastErrorRef.current === 'aborted' &&
        isIos()
      ) {
        retriedRef.current = true
        begin(Ctor)
        return
      }
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
      lastErrorRef.current = e.error
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
