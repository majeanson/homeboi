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
import { useCallback } from 'react'
import { useLang, type Lang } from '../i18n'

const SUPPORTED = typeof window !== 'undefined' && 'speechSynthesis' in window

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

// Best installed voice for a BCP-47 tag: exact match (fr-CA), else any voice in
// the same language family (fr-FR, fr), else null when none is installed.
function pickVoice(want: string): SpeechSynthesisVoice | null {
  if (!voices.length) refreshVoices()
  const lc = want.toLowerCase()
  const two = lc.slice(0, 2)
  return (
    voices.find((v) => v.lang.toLowerCase() === lc) ??
    voices.find((v) => v.lang.toLowerCase().replace('_', '-').startsWith(two)) ??
    null
  )
}

// Whether a voice for `lang` is actually installed, so a surface can choose to
// hide its 🔊 affordance rather than narrate with the wrong accent. Reads the
// live snapshot — call it from a render that re-runs as `voiceschanged` fires.
export function hasVoiceFor(lang: Lang): boolean {
  return pickVoice(wantedTag(lang)) !== null
}

export function useSpeak() {
  const { lang } = useLang()
  return useCallback(
    (text: string | undefined) => {
      if (!text || !SUPPORTED) return
      const want = wantedTag(lang)

      const utter = () => {
        try {
          const u = new SpeechSynthesisUtterance(text)
          u.lang = want
          const v = pickVoice(want)
          if (v) u.voice = v // matched voice -> reads in the toggled language
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
