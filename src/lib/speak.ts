// On-device read-aloud, extracted from the original KidView so every toddler
// surface can use it. Browser SpeechSynthesis only — ZERO Workers AI Neurons,
// nothing leaves the device (brief tenet 2, architecture "Narration is NOT
// Workers AI"). Narration is a nicety: it must never block or throw on a tap.
//
// Setting utterance.lang alone is NOT enough: most browsers keep the default
// (often English) voice and just read French text with an English mouth. So we
// EXPLICITLY pick a voice whose language matches the toggle. Two wrinkles this
// module handles so callers don't have to:
//   1. getVoices() is async — the list is often empty until the browser fires
//      `voiceschanged`, which can happen before any component mounts. We keep a
//      module-level snapshot, refreshed on that event, so taps read a warm cache
//      instead of each racing the first load.
//   2. If the OS has no voice for the wanted language (common on Windows with no
//      French voice installed), there's nothing to match — we fall back to the
//      same language family, then to best-effort default. That's an OS gap, not
//      a bug; install a Français (Canada) voice to hear it narrated properly.
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import { soundOn } from './sound'
import { useLang, type Lang } from '../i18n'

const SUPPORTED = typeof window !== 'undefined' && 'speechSynthesis' in window

// Per-language voice override + a global speaking rate, chosen in Réglages ▸
// Affichage. Empty/auto means "let pickBestVoice decide". Stored in localStorage
// (same convention as the other display prefs); read live at speak time so a
// change applies to the very next tap without threading a context everywhere.
const RATE_KEY = 'babillard-voice-rate'
const voicePrefKey = (lang: Lang) => `babillard-voice-${lang}`

export function getVoicePref(lang: Lang): string {
  try {
    return localStorage.getItem(voicePrefKey(lang)) ?? ''
  } catch {
    return ''
  }
}
export function setVoicePref(lang: Lang, voiceURI: string): void {
  try {
    if (voiceURI) localStorage.setItem(voicePrefKey(lang), voiceURI)
    else localStorage.removeItem(voicePrefKey(lang))
  } catch {
    /* storage blocked — narration just falls back to the auto-picked voice */
  }
}
export function getRate(): number {
  try {
    const n = Number(localStorage.getItem(RATE_KEY))
    // Clamp to the slider range; default 1 (normal) when unset/garbage.
    return Number.isFinite(n) && n >= 0.6 && n <= 1.4 ? n : 1
  } catch {
    return 1
  }
}
export function setRate(rate: number): void {
  try {
    localStorage.setItem(RATE_KEY, String(rate))
  } catch {
    /* noop */
  }
}

// A GLOBAL read-aloud language (Réglages ▸ Affichage) — 'auto' follows the app
// language (the long-standing default), 'fr'/'en' makes EVERY narration use that
// voice, app-wide. A per-call override (e.g. a recipe's own language) still wins;
// this is the fallback below that. Read live at speak time + by a tiny store so the
// settings control reflects it without prop-drilling.
const READ_LANG_KEY = 'babillard-read-lang'
export type ReadLang = 'auto' | Lang
const readLangListeners = new Set<() => void>()
function getReadLang(): ReadLang {
  try {
    const v = localStorage.getItem(READ_LANG_KEY)
    return v === 'fr' || v === 'en' ? v : 'auto'
  } catch {
    return 'auto'
  }
}
export function setReadLang(v: ReadLang): void {
  try {
    if (v === 'auto') localStorage.removeItem(READ_LANG_KEY)
    else localStorage.setItem(READ_LANG_KEY, v)
  } catch {
    /* private mode — the change still holds for this session via listeners */
  }
  readLangListeners.forEach((l) => l())
}
// Live hook for the settings control (re-renders when the global pref changes).
export function useReadLang(): ReadLang {
  return useSyncExternalStore(
    (cb) => {
      readLangListeners.add(cb)
      return () => readLangListeners.delete(cb)
    },
    getReadLang,
    () => 'auto',
  )
}

// The latest voice list. Populated lazily and kept current via `voiceschanged`.
let voices: SpeechSynthesisVoice[] = []

function refreshVoices(): void {
  try {
    voices = window.speechSynthesis.getVoices()
  } catch {
    /* no speech support — leave the cache empty */
  }
}

if (SUPPORTED) {
  refreshVoices()
  // Some browsers only populate after this event; keep our snapshot current.
  window.speechSynthesis.addEventListener('voiceschanged', refreshVoices)
}

function wantedTag(lang: Lang): string {
  return lang === 'fr' ? 'fr-CA' : 'en-CA'
}

// iOS ships SEVERAL voices per language at very different quality tiers, and
// getVoices() lists the robotic "compact" ones first — so "first match" reads
// French with the worst mouth on the device even after the user installs an
// enhanced/premium voice in Réglages ▸ Accessibilité ▸ Contenu énoncé. Tier is
// only exposed through the name/voiceURI ("com.apple.voice.premium.fr-CA…"),
// so rank by that. The "eloquence" set (Eddy, Flo, Grand-maman…) are novelty
// robot voices — below even compact.
function quality(v: { name: string; voiceURI: string }): number {
  const id = `${v.name} ${v.voiceURI}`.toLowerCase()
  if (id.includes('premium')) return 4
  if (id.includes('enhanced') || id.includes('amélior') || id.includes('amelior')) return 3
  // Legacy / novelty iOS voices (Albert, Zarvox, Fred, the eloquence set…) — robotic
  // and BELOW even the standard "compact" voices. They live on the OLD
  // `com.apple.speech.synthesis.voice.<name>` URI path; modern real voices use
  // `com.apple.voice.*` / `com.apple.ttsbundle.*`. Without demoting them they fall to
  // the default tier (2) and wrongly OUTRANK a real compact voice (1) — the "I only
  // get Albert in English" bug (French ships no such legacy voices, so it picked
  // right). Rank them lowest so any real voice wins.
  if (id.includes('eloquence') || id.includes('speech.synthesis.voice')) return 0
  if (id.includes('compact')) return 1
  return 2
}

// Best installed voice for a BCP-47 tag, among the whole language family:
// quality tier first (an enhanced fr-FR beats a compact fr-CA — the user
// installed that voice to be USED), exact locale as the tie-breaker (equal
// tiers → fr-CA wins for fr-CA). Null when the family has nothing. Pure +
// exported for tests; pickVoice below binds it to the live snapshot.
export function pickBestVoice<T extends Pick<SpeechSynthesisVoice, 'lang' | 'name' | 'voiceURI'>>(
  list: T[],
  want: string,
): T | null {
  const lc = want.toLowerCase()
  const two = lc.slice(0, 2)
  const norm = (l: string) => l.toLowerCase().replace('_', '-')
  let best: T | null = null
  let bestScore = -1
  for (const v of list) {
    if (!norm(v.lang).startsWith(two)) continue
    const score = quality(v) * 10 + (norm(v.lang) === lc ? 1 : 0)
    if (score > bestScore) {
      bestScore = score
      best = v
    }
  }
  return best
}

function pickVoice(want: string): SpeechSynthesisVoice | null {
  if (!voices.length) refreshVoices()
  // An explicit per-language override wins — but only if that voice is still
  // installed AND in the wanted language family (a stale fr pick must not read
  // English text). Otherwise fall back to the best auto-match.
  const lang: Lang = want.toLowerCase().startsWith('fr') ? 'fr' : 'en'
  const prefURI = getVoicePref(lang)
  if (prefURI) {
    const two = want.slice(0, 2).toLowerCase()
    const pref = voices.find(
      (v) => v.voiceURI === prefURI && v.lang.toLowerCase().replace('_', '-').startsWith(two),
    )
    if (pref) return pref
  }
  return pickBestVoice(voices, want)
}

// Every installed voice in a language's family (fr*/en*), best-quality first —
// the option list for the voice picker. Reads the live snapshot.
function listVoicesFor(lang: Lang): SpeechSynthesisVoice[] {
  if (!voices.length) refreshVoices()
  const two = wantedTag(lang).slice(0, 2)
  const norm = (l: string) => l.toLowerCase().replace('_', '-')
  return voices
    .filter((v) => norm(v.lang).startsWith(two))
    .slice()
    .sort((a, b) => quality(b) * 10 + (norm(b.lang) === wantedTag(lang) ? 1 : 0) - (quality(a) * 10 + (norm(a.lang) === wantedTag(lang) ? 1 : 0)))
}

// Voice list for `lang`, re-rendering when the browser finishes loading voices
// (the `voiceschanged` event can fire after a component mounts). For the picker.
export function useVoiceList(lang: Lang): SpeechSynthesisVoice[] {
  const [list, setList] = useState<SpeechSynthesisVoice[]>(() => listVoicesFor(lang))
  useEffect(() => {
    if (!SUPPORTED) return
    const update = () => {
      refreshVoices()
      setList(listVoicesFor(lang))
    }
    update()
    window.speechSynthesis.addEventListener('voiceschanged', update)
    return () => window.speechSynthesis.removeEventListener('voiceschanged', update)
  }, [lang])
  return list
}

// Whether a voice for `lang` is actually installed, so a surface can choose to
// hide its 🔊 affordance rather than narrate with the wrong accent. Reads the
// live snapshot — call it from a render that re-runs as `voiceschanged` fires.
export function hasVoiceFor(lang: Lang): boolean {
  return pickVoice(wantedTag(lang)) !== null
}

// The one parent-voice clip playing right now (playNarration below). Module-level
// so a second tap PAUSES the first clip instead of stacking two voices — TTS
// already had this guarantee via speechSynthesis.cancel(); clips didn't.
let currentClip: HTMLAudioElement | null = null
function stopClip(): void {
  const clip = currentClip
  currentClip = null
  if (!clip) return
  try {
    clip.pause()
  } catch {
    /* nothing playing */
  }
}

// Stop any in-progress narration immediately (toggling auto-read off, leaving a
// narrated surface) — BOTH mouths: the TTS queue and a playing parent-voice clip.
// A no-op where speech isn't supported; never throws.
export function stopSpeaking(): void {
  stopClip()
  if (!SUPPORTED) return
  try {
    window.speechSynthesis.cancel()
  } catch {
    /* nothing to cancel */
  }
}

// Narration text often carries emoji (weather tips "🧥", card icons) — some
// engines read them out loud ("manteau emoji"), which is noise to a toddler.
// Strip pictographs + joiners before speaking; never strip letters.
function spokenOnly(text: string): string {
  try {
    return text.replace(/[\p{Extended_Pictographic}️‍]/gu, '').replace(/\s+/g, ' ').trim()
  } catch {
    return text
  }
}

// Play a parent-voice narration clip (feature #17 A), FALLING BACK to on-device
// TTS if anything goes wrong — the clip can't load (R2 off / 503 / offline), the
// browser blocks autoplay, or the key is empty. `speak` is the same nicety this
// module already provides; pass it from a component that holds useSpeak(). A clip
// is served by /api/img/<key> (the immutable cache-first image route). Like every
// narration here, it must never block or throw on a tap. The returned cleanup
// stops the audio (used when leaving a narrated surface).
//
// Lives here, beside speak(), so BigTiles + KidView share ONE play-or-TTS path.
export function playNarration(
  audioKey: string | null | undefined,
  fallbackText: string | undefined,
  speak: (raw: string | undefined) => void,
): () => void {
  // Muted: neither the clip nor the TTS fallback — a recorded parent voice is the
  // LOUDEST thing this app plays, and it is the one most likely to start on its own.
  if (!soundOn()) return () => {}
  if (!audioKey) {
    speak(fallbackText)
    return () => {}
  }
  try {
    stopSpeaking() // a clip and TTS must never overlap — pauses a prior clip too
    const audio = new Audio(`/api/img/${audioKey}`)
    currentClip = audio // so the NEXT narration (or stopSpeaking) can pause this one
    audio.onerror = () => speak(fallbackText) // clip unavailable → TTS
    audio.onended = () => {
      if (currentClip === audio) currentClip = null
    }
    // play() rejects on a blocked autoplay / decode error — fall back then too.
    const p = audio.play()
    if (p && typeof p.catch === 'function') p.catch(() => speak(fallbackText))
    return () => {
      if (currentClip === audio) currentClip = null
      try {
        audio.pause()
      } catch {
        /* nothing playing */
      }
    }
  } catch {
    speak(fallbackText) // Audio unavailable — TTS still works
    return () => {}
  }
}

export function useSpeak() {
  const { lang } = useLang()
  // `langOverride` lets a caller read content in ITS OWN language regardless of the
  // UI toggle — e.g. an English recipe narrated in a French app reads with an
  // English voice (when one is installed), instead of English words in a French
  // mouth. Omitted → the UI language, the long-standing default.
  return useCallback(
    (raw: string | undefined, langOverride?: Lang, opts?: { onEnd?: () => void }) => {
      if (!raw || !SUPPORTED) return
      // Muted (lib/sound): this device makes no sound at all. Read live rather than
      // captured, so flipping the switch mid-sentence stops the NEXT utterance
      // without this callback needing to be rebuilt. `onEnd` still fires — a caller
      // that advances a stepper when the narration finishes must not stall forever
      // just because nobody could hear it.
      if (!soundOn()) {
        opts?.onEnd?.()
        return
      }
      const text = spokenOnly(raw)
      if (!text) return
      // A per-call override wins (a recipe's own language); else the household's
      // GLOBAL read-aloud language (Réglages ▸ Affichage); else the UI language.
      const pref = getReadLang()
      const want = wantedTag(langOverride ?? (pref === 'auto' ? lang : pref))

      const utter = () => {
        try {
          const u = new SpeechSynthesisUtterance(text)
          const v = pickVoice(want)
          // Keep lang and voice CONSISTENT: iOS quietly drops an assigned voice
          // when utterance.lang disagrees with it (fr-CA tag + fr-FR voice) and
          // falls back to the default mouth — so the voice's own tag wins.
          u.lang = v?.lang ?? want
          if (v) u.voice = v // matched voice -> reads in the toggled language
          u.rate = getRate() // parent-set speaking speed (Réglages ▸ Affichage)
          // Let a caller (e.g. the « Raconte-moi » tour) advance only once the voice
          // has actually finished this line, instead of guessing from text length.
          if (opts?.onEnd) u.onend = opts.onEnd
          window.speechSynthesis.cancel() // never overlap; narration is a nicety
          window.speechSynthesis.speak(u)
        } catch {
          /* narration must never block or throw on a tap */
        }
      }

      // Voices may still be loading on the very first tap; wait once so the
      // first word gets the right voice instead of the default accent. If none
      // ever load (no voices installed), TTS can't speak anyway — no regression.
      if (!voices.length) {
        refreshVoices()
        if (!voices.length) {
          const once = () => {
            window.speechSynthesis.removeEventListener('voiceschanged', once)
            refreshVoices()
            utter()
          }
          window.speechSynthesis.addEventListener('voiceschanged', once)
          return
        }
      }
      utter()
    },
    [lang],
  )
}
