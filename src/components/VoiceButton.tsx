import { useT } from '../i18n'
import type { VoiceInput } from '../lib/useVoiceInput'

// The shared "speak it" mic, used by every add field (CaptureBar, the ＋ sheet,
// La liste, the garde-manger). The caller owns the useVoiceInput hook (so the
// input can swap its placeholder to "J'écoute…" while listening) and hands the
// returned state down here. Renders nothing where the browser has no Web Speech
// API, so an unsupported device never shows a dead button.

export function VoiceButton({ voice, label }: { voice: VoiceInput; label: string }) {
  const t = useT()
  if (!voice.hasVoice) return null
  // A grant the browser remembers as refused: keep the button visible but mark
  // it blocked, so it reads as "fix this in settings" rather than a dead tap.
  // (We can't re-grant from code — the browser/OS owns the permission.)
  const blocked = voice.permission === 'denied'
  return (
    <button
      type="button"
      className={`btn btn--ghost capture__voice${voice.listening ? ' is-listening' : ''}${blocked ? ' is-blocked' : ''}`}
      onClick={voice.start}
      aria-label={blocked ? `${label} — ${t.list.voiceDenied}` : label}
      aria-pressed={voice.listening}
      title={blocked ? t.list.voiceDenied : undefined}
    >
      🎤
    </button>
  )
}

// The calm one-line feedback under a continuous (auto-add) voice field: a hint
// while the mic is open, or WHY nothing landed (denied / unsupported / silence)
// so the mic is never a silent dead button. Single-shot fields (fill-the-input)
// don't need it — the text appearing is feedback enough.
export function VoiceStatus({ voice }: { voice: VoiceInput }) {
  const t = useT()
  // Explain a remembered-blocked mic before the user even taps, so a kiosk that
  // was never granted access doesn't look merely silent.
  if (!voice.error && voice.permission === 'denied') {
    return (
      <p className="list-add__voicemsg list-add__voicemsg--err" role="status">
        {t.list.voiceDenied}
      </p>
    )
  }
  if (voice.error) {
    const msg =
      voice.error === 'not-allowed' || voice.error === 'service-not-allowed'
        ? t.list.voiceDenied
        : voice.error === 'language-not-supported'
          ? t.list.voiceUnsupported
          : t.list.voiceNoSpeech
    return (
      <p className="list-add__voicemsg list-add__voicemsg--err" role="status">
        {msg}
      </p>
    )
  }
  if (voice.listening) {
    return (
      <p className="list-add__voicemsg" role="status">
        {t.list.voiceHint}
      </p>
    )
  }
  return null
}
