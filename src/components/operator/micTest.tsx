import { useEffect, useRef, useState } from 'react'
import { useLang, useT } from '../../i18n'
import { type HelpMode } from '../../lib/helpMode'
import { isIos } from '../../lib/useVoiceInput'
import { Icon } from '../Icon'
import { OperatorSection } from './OperatorSection'
import { StatusMessage } from '../StatusMessage'

// A copy-pasteable mic diagnostic, the recognition twin of the "Test the AI"
// probe above. The mic feature rides the browser's Web Speech API
// (webkitSpeechRecognition), which on iOS dies silently in three places —
// home-screen PWA (standalone WebKit), Private Browsing, and when the device
// lacks the requested dictation language — with NO usable error reaching our
// code. "Same settings, works on one iPhone not another" is unsolvable by
// comparing toggles because the deciding factors (iOS/WebKit build, installed
// dictation languages, standalone vs full-Safari context) aren't settings.
//
// So instead of guessing, this runs a fully-instrumented recognition attempt on
// the failing device and dumps EVERY lifecycle event with timings plus the full
// environment. The event timeline is the tell:
//   • onaudiostart but no onresult, then a clean onend → audio captured, nothing
//     transcribed: missing dictation language pack or Apple servers unreachable.
//   • immediate onerror 'not-allowed' / 'service-not-allowed' → blocked /
//     standalone-PWA restriction.
//   • no events at all → the API isn't really wired in this context.
// The user copies the blob and sends it; we read the cause off it.

interface RecogResult {
  isFinal: boolean
  0: { transcript: string }
}
interface RecogEvent {
  resultIndex: number
  results: ArrayLike<RecogResult>
}
interface RecogLike {
  lang: string
  continuous: boolean
  interimResults: boolean
  maxAlternatives: number
  start: () => void
  abort: () => void
  onstart: (() => void) | null
  onaudiostart: (() => void) | null
  onsoundstart: (() => void) | null
  onspeechstart: (() => void) | null
  onspeechend: (() => void) | null
  onsoundend: (() => void) | null
  onaudioend: (() => void) | null
  onnomatch: (() => void) | null
  onresult: ((e: RecogEvent) => void) | null
  onerror: ((e: { error: string }) => void) | null
  onend: (() => void) | null
}
type RecogCtor = new () => RecogLike

function getCtor(): RecogCtor | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as { SpeechRecognition?: RecogCtor; webkitSpeechRecognition?: RecogCtor }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

function ctorKind(): string {
  if (typeof window === 'undefined') return 'MISSING'
  const w = window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown }
  if (w.SpeechRecognition) return 'standard'
  if (w.webkitSpeechRecognition) return 'webkit'
  return 'MISSING'
}

// Home-screen PWA (standalone WebKit) vs full Safari — the single biggest iOS
// differentiator, and not a setting. navigator.standalone is the iOS-specific
// signal; display-mode covers the rest.
function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  const navAny = navigator as unknown as { standalone?: boolean }
  const mm = typeof window.matchMedia === 'function' && window.matchMedia('(display-mode: standalone)').matches
  return !!navAny.standalone || !!mm
}

function browserLabel(ua: string): string {
  if (/CriOS/.test(ua)) return 'Chrome (iOS)'
  if (/FxiOS/.test(ua)) return 'Firefox (iOS)'
  if (/EdgiOS/.test(ua)) return 'Edge (iOS)'
  if (/Safari/.test(ua) && /Version\//.test(ua)) return 'Safari'
  if (/Chrome/.test(ua)) return 'Chrome'
  if (/Firefox/.test(ua)) return 'Firefox'
  return 'unknown'
}

function iosVersion(ua: string): string | null {
  const m = ua.match(/OS (\d+)[_.](\d+)(?:[_.](\d+))?/)
  if (!m) return null
  return `${m[1]}.${m[2]}${m[3] ? '.' + m[3] : ''}`
}

type Phase = 'idle' | 'running' | 'done'

export function MicSelfTest({ help }: { help?: HelpMode }) {
  const t = useT()
  const { lang } = useLang()
  const [phase, setPhase] = useState<Phase>('idle')
  const [report, setReport] = useState('')
  const [interim, setInterim] = useState('')
  const [copied, setCopied] = useState(false)
  const [perm, setPerm] = useState('unknown')
  const recogRef = useRef<RecogLike | null>(null)
  const timerRef = useRef<number | null>(null)
  const doneRef = useRef(false)
  const taRef = useRef<HTMLTextAreaElement | null>(null)
  // Stable handle to "finish with the current verdict", set once a run begins so
  // Stop and the safety timer can ALWAYS produce a report from whatever happened
  // so far — never leave the probe in 'done' with an empty report (the "I can't
  // generate a log at all" case).
  const finishRef = useRef<(() => void) | null>(null)

  // Read the browser-remembered mic grant up front (best-effort; Safari often
  // can't answer, where we stay 'unknown' and lean on the live probe's onerror).
  useEffect(() => {
    const perms = navigator.permissions
    if (!perms?.query) return
    let cancelled = false
    perms
      .query({ name: 'microphone' as PermissionName })
      .then((s) => {
        if (!cancelled) setPerm(s.state)
      })
      .catch(() => {
        /* descriptor unsupported — stay 'unknown' */
      })
    return () => {
      cancelled = true
    }
  }, [])

  // Tear down a probe left running if the operator navigates away mid-test.
  useEffect(
    () => () => {
      if (timerRef.current != null) clearTimeout(timerRef.current)
      try {
        recogRef.current?.abort()
      } catch {
        /* already dead */
      }
    },
    [],
  )

  async function run() {
    setPhase('running')
    setReport('')
    setInterim('')
    setCopied(false)
    doneRef.current = false

    const ua = navigator.userAgent
    const reqLang = lang === 'fr' ? 'fr-CA' : 'en-CA'
    const t0 = typeof performance !== 'undefined' ? performance.now() : 0
    const at = () => `+${Math.round((typeof performance !== 'undefined' ? performance.now() : 0) - t0)}ms`
    const timeline: string[] = []

    // Earliest-possible finish: until the full verdict machinery is wired below,
    // Stop (e.g. during the Safari permission prompt, before recognition even
    // starts) still yields a real report instead of a blank 'done' screen. Gets
    // overwritten with the verdict-aware version once recognition is set up.
    finishRef.current = () => {
      if (doneRef.current) return
      doneRef.current = true
      setReport(`Babillard — mic diagnostic (stopped before recognition produced a result)\n\nTIMELINE\n${timeline.join('\n')}`)
      setInterim('')
      setPhase('done')
    }

    // 1) getUserMedia — works in iOS PWA + private even where Web Speech doesn't,
    // so its result isolates "mic access" from "recognition".
    let gum = 'not attempted'
    const md = navigator.mediaDevices
    const hasGum = typeof md?.getUserMedia === 'function'
    if (hasGum) {
      try {
        // Race the prompt against a timeout: in full Safari the permission dialog
        // blocks getUserMedia until the user answers, and an ignored prompt would
        // otherwise hang the whole probe forever (→ no log ever). After 7s we give
        // up on priming and let recognition surface its own permission state.
        const stream = await Promise.race<MediaStream>([
          md.getUserMedia({ audio: true }),
          new Promise<MediaStream>((_, rej) => window.setTimeout(() => rej(new Error('__timeout__')), 7000)),
        ])
        stream.getTracks().forEach((tr) => tr.stop())
        gum = 'granted'
      } catch (e) {
        const er = e as DOMException
        gum =
          (er as Error)?.message === '__timeout__'
            ? 'no response in 7s (permission prompt ignored or blocked) — continuing anyway'
            : `FAILED ${er?.name ?? 'Error'}: ${er?.message ?? ''}`.trim()
      }
    } else {
      gum = 'getUserMedia MISSING'
    }
    timeline.push(`${at()} getUserMedia → ${gum}`)

    const Ctor = getCtor()

    const finalize = (verdict: string) => {
      if (doneRef.current) return
      doneRef.current = true
      if (timerRef.current != null) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
      try {
        recogRef.current?.abort()
      } catch {
        /* no-op */
      }
      recogRef.current = null
      const env = [
        'Babillard — mic diagnostic',
        `when: ${new Date().toISOString()}`,
        `url: ${typeof location !== 'undefined' ? location.href : '?'}`,
        `browser: ${browserLabel(ua)}`,
        `iOS: ${isIos() ? 'yes' : 'no'}${iosVersion(ua) ? ' ' + iosVersion(ua) : ''}`,
        `standalone PWA: ${isStandalone() ? 'yes' : 'no'}`,
        `online: ${navigator.onLine ? 'yes' : 'no'}`,
        `lang requested: ${reqLang}`,
        `SpeechRecognition: ${ctorKind()}`,
        `getUserMedia: ${hasGum ? 'present' : 'MISSING'}`,
        `mic permission: ${perm}`,
        `userAgent: ${ua}`,
      ].join('\n')
      const blob = `${env}\n\nVERDICT: ${verdict}\n\nTIMELINE\n${timeline.join('\n')}`
      setReport(blob)
      setInterim('')
      setPhase('done')
    }

    if (!Ctor) {
      timeline.push(`${at()} no SpeechRecognition constructor in this context`)
      finalize('Web Speech API NOT AVAILABLE here (no recognition constructor). The mic cannot work in this browser/context.')
      return
    }

    let interimCount = 0
    let finalCount = 0
    let lastInterim = ''
    let finalText = ''
    let errorStr = ''
    let attemptNo = 0
    // Did getUserMedia actually open+close the mic just now? On iOS/iPadOS that
    // prime can race the audio session and abort the FIRST recognition attempt
    // instantly (zero audio). If it did, we retry ONCE without re-priming — both
    // to confirm the prime is the cause and to mirror the real app's recovery.
    const primed = gum === 'granted'

    // One verdict, read off whatever state we've reached — shared by onend, the
    // 10s safety timer, and Stop so every exit path yields the same honest read.
    // Order matters: a captured transcript (final, else interim) is MORE
    // informative than the error, so "heard 3 interims then aborted" never gets
    // flattened to a bare "ERROR aborted" that hides that the engine did hear you.
    const verdictFor = (): string => {
      const retried = attemptNo >= 2
      // getUserMedia is, by spec, ONLY defined in a secure context (https://).
      // Its absence on a Safari that supports it ⇒ a non-HTTPS origin (or a
      // restricted standalone context). Web Speech needs https too, so this is the
      // single most likely reason recognition is killed — surface it loudly.
      const insecureNote = !hasGum
        ? ' ⚠ getUserMedia is MISSING here — navigator.mediaDevices exists ONLY in a secure context (https://), so this is almost certainly a NON-HTTPS origin (or a restricted standalone PWA). Web Speech needs https; this is very likely a URL/context issue, NOT the mic. Reopen the page over https:// and retry.'
        : ''
      if (finalText)
        return retried
          ? `HEARD "${finalText}" on the 2nd attempt (no getUserMedia prime) — the FIRST attempt aborted instantly BECAUSE the getUserMedia prime raced the audio session; skipping/deferring the prime fixes it. Recognition WORKS here.`
          : `HEARD "${finalText}" — recognition WORKS here.`
      if (lastInterim) {
        // Non-terminal errors ('aborted'/'no-speech') AFTER interims = the engine
        // transcribed but iOS tore the session down before committing a final.
        // The usual cause is the home-screen-PWA (standalone WebKit) dictation
        // restriction; the same device in full Safari usually finalizes.
        if (errorStr && errorStr !== 'no-speech') {
          return `INTERIM-ONLY — heard ${interimCount} interim${interimCount === 1 ? '' : 's'} (last: "${lastInterim}") then "${errorStr}" before any final. The engine DID transcribe but never committed a final result — usual cause is the iOS home-screen-PWA (standalone WebKit) dictation restriction. The real app keeps this last interim; the same device in full Safari usually finalizes cleanly.`
        }
        return `INTERIM-ONLY "${lastInterim}" but never finalized — engine heard but didn't commit a final. The real app keeps this last interim.`
      }
      // Instant abort, zero audio — getUserMedia/audio-session race OR (when
      // getUserMedia is also missing) a non-secure context / standalone restriction.
      if (errorStr === 'aborted' && interimCount === 0 && finalCount === 0)
        return (
          (retried
            ? `ERROR "aborted" on BOTH attempts (WITH and WITHOUT the getUserMedia prime), zero audio each time — deeper than the prime race: a standalone-PWA recognition restriction or an audio-session conflict on this device/OS. Voice likely won't work in this installed-PWA context; full Safari may.`
            : `ERROR "aborted" instantly with zero audio — recognition was killed right after the mic opened (see timeline).`) + insecureNote
        )
      if (errorStr) return `ERROR "${errorStr}" — recognition refused/failed before any transcript (see timeline).` + insecureNote
      if (interimCount === 0)
        return (
          'SILENT — mic captured but ZERO transcripts came back. Classic iOS sign of a missing dictation language pack, unreachable dictation servers, or a standalone-PWA restriction.' +
          insecureNote
        )
      return 'No final result.'
    }
    finishRef.current = () => finalize(verdictFor())

    // Wire + start one recognition attempt. Returns false if start() threw (already
    // finalized). attemptNo 2 deliberately skips the getUserMedia prime.
    const startAttempt = (): boolean => {
      attemptNo++
      const recog = new Ctor()
      recog.lang = reqLang
      recog.continuous = false
      recog.interimResults = true
      recog.maxAlternatives = 1

      recog.onstart = () => timeline.push(`${at()} onstart`)
      recog.onaudiostart = () => timeline.push(`${at()} onaudiostart (mic capturing)`)
      recog.onsoundstart = () => timeline.push(`${at()} onsoundstart (sound detected)`)
      recog.onspeechstart = () => timeline.push(`${at()} onspeechstart (speech detected)`)
      recog.onspeechend = () => timeline.push(`${at()} onspeechend`)
      recog.onsoundend = () => timeline.push(`${at()} onsoundend`)
      recog.onaudioend = () => timeline.push(`${at()} onaudioend`)
      recog.onnomatch = () => timeline.push(`${at()} onnomatch (heard audio, no match)`)
      recog.onresult = (e) => {
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const r = e.results[i]
          const txt = r[0]?.transcript?.trim() ?? ''
          if (r.isFinal) {
            finalCount++
            finalText = txt
            timeline.push(`${at()} onresult FINAL — "${txt}"`)
          } else {
            interimCount++
            lastInterim = txt
            setInterim(txt)
            if (interimCount === 1) timeline.push(`${at()} onresult interim (first) — "${txt}"`)
          }
        }
      }
      recog.onerror = (e) => {
        errorStr = e.error
        timeline.push(`${at()} onerror — "${e.error}"`)
      }
      recog.onend = () => {
        timeline.push(`${at()} onend  (interims: ${interimCount}, finals: ${finalCount})`)
        // iPadOS/iOS: a getUserMedia prime right before start() can race the audio
        // session and abort the FIRST attempt instantly with zero audio. The grant
        // persists, so a second attempt WITHOUT re-priming usually starts clean.
        if (attemptNo === 1 && primed && errorStr === 'aborted' && interimCount === 0 && finalCount === 0 && !doneRef.current) {
          timeline.push(`${at()} instant abort after the getUserMedia prime — retrying WITHOUT re-priming…`)
          errorStr = ''
          startAttempt()
          return
        }
        finishRef.current?.()
      }

      recogRef.current = recog
      timeline.push(`${at()} starting recognition (attempt ${attemptNo}${attemptNo === 1 ? ', say "lait, œufs, pain"' : ' — no getUserMedia prime'})`)
      try {
        recog.start()
      } catch (e) {
        timeline.push(`${at()} start() threw — ${(e as Error)?.message ?? e}`)
        finalize('start() threw — recognition could not begin in this context.')
        return false
      }
      return true
    }

    if (!startAttempt()) return
    // Safety net: some iOS contexts never fire onend. Force-finish after 10s with
    // whatever state we reached — guarantees a report even when nothing fires.
    timerRef.current = window.setTimeout(() => {
      timeline.push(`${at()} timeout (10s) — forcing stop`)
      finishRef.current?.()
    }, 10000)
  }

  function stop() {
    if (timerRef.current != null) clearTimeout(timerRef.current)
    try {
      recogRef.current?.abort()
    } catch {
      /* no-op */
    }
    // abort() *may* fire onend → finish; but on iOS it often doesn't. So after a
    // beat, force the report ourselves from the current state. Critically this
    // builds a real report (via finishRef) instead of just flipping to 'done'
    // with an empty textarea — otherwise Stop produced "no log at all".
    window.setTimeout(() => {
      if (!doneRef.current) {
        if (finishRef.current) finishRef.current()
        else setPhase('done')
      }
    }, 300)
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(report)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard blocked (often iOS without a gesture/permission) — select the
      // textarea so a long-press → Copy works.
      taRef.current?.focus()
      taRef.current?.select()
    }
  }

  return (
    <OperatorSection title={t.operator.micTestTitle} help={help} helpKey="micTest">
      {phase !== 'running' ? (
        <button type="button" className="btn btn--primary" onClick={run}>
          {t.operator.micTestBtn}
        </button>
      ) : (
        <button type="button" className="btn" onClick={stop}>
          {t.operator.micTestStop}
        </button>
      )}

      {phase === 'running' && (
        <StatusMessage tone="info">
          {t.operator.micTestListening}
          {interim ? ` — « ${interim} »` : ''}
        </StatusMessage>
      )}

      {phase === 'done' && report && (
        <div className="mic-test__out">
          <p className="mono">{t.operator.micTestSend}</p>
          <textarea
            ref={taRef}
            className="input mono"
            readOnly
            rows={14}
            value={report}
            onFocus={(e) => e.currentTarget.select()}
            style={{ width: '100%', minHeight: '14rem', whiteSpace: 'pre', overflowWrap: 'normal' }}
          />
          <button type="button" className="btn btn--primary" onClick={copy} style={{ marginTop: '0.5rem' }}>
            <Icon name={copied ? 'check-bold' : 'file-text-bold'} size={18} /> {copied ? t.operator.micTestCopied : t.operator.micTestCopy}
          </button>
        </div>
      )}
    </OperatorSection>
  )
}
