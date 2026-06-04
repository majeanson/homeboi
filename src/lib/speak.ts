// On-device read-aloud, extracted from the original KidView so every toddler
// surface can use it. Browser SpeechSynthesis only — ZERO Workers AI Neurons,
// nothing leaves the device (brief tenet 2, architecture "Narration is NOT
// Workers AI"). Narration is a nicety: it must never block or throw on a tap.
import { useCallback } from 'react'
import { useLang } from '../i18n'

export function useSpeak() {
  const { lang } = useLang()
  return useCallback(
    (text: string | undefined) => {
      if (!text || typeof window === 'undefined' || !window.speechSynthesis) return
      try {
        const u = new SpeechSynthesisUtterance(text)
        u.lang = lang === 'fr' ? 'fr-CA' : 'en-CA'
        window.speechSynthesis.cancel()
        window.speechSynthesis.speak(u)
      } catch {
        /* narration is a nicety, never block the tap on it */
      }
    },
    [lang],
  )
}
