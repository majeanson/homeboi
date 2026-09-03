import { useT } from '../i18n'
import { isIos, type VoiceInput } from '../lib/useVoiceInput'
import { useOnline } from '../lib/online'
import { Icon } from './Icon'
import { StatusMessage } from './StatusMessage'

// The shared "speak it" mic, used by every add field (CaptureBar, the ＋ sheet,
// La liste, the garde-manger). The caller owns the useVoiceInput hook (so the
// input can swap its placeholder to "J'écoute…" while listening) and hands the
// returned state down here. Renders nothing where the browser has no Web Speech
// API, so an unsupported device never shows a dead button.

export function VoiceButton({ voice, label }: { voice: VoiceInput; label: string }) {
  const t = useT()
  const online = useOnline()
  if (!voice.hasVoice) return null
  // A grant the browser remembers as refused: keep the button visible but mark
  // it blocked, so it reads as "fix this in settings" rather than a dead tap.
  // (We can't re-grant from code — the browser/OS owns the permission.)
  const blocked = voice.permission === 'denied'
  // iOS can't re-prompt from the page, so point at Settings instead of "your browser".
  const blockedMsg = isIos() ? t.list.voiceDeniedIos : t.list.voiceDenied
  // Speech recognition (Web Speech and our server-STT fallback) both need the
  // network, so the mic is dead offline — disable it with a calm hint rather than
  // letting a tap fail silently.
  const title = !online ? t.offline.unavailable : blocked ? blockedMsg : undefined
  return (
    <button
      type="button"
      className={`btn btn--ghost capture__voice${voice.listening ? ' is-listening' : ''}${blocked ? ' is-blocked' : ''}`}
      onClick={voice.start}
      disabled={!online}
      aria-label={title ? `${label} — ${title}` : label}
      aria-pressed={voice.listening}
      title={title}
    >
      <Icon name="microphone-bold" size={20} />
    </button>
  )
}

// The calm one-line feedback under a continuous (auto-add) voice field: a hint
// while the mic is open, or WHY nothing landed (denied / unsupported / silence)
// so the mic is never a silent dead button. Single-shot fields (fill-the-input)
// don't need it — the text appearing is feedback enough.
//
// `hint` overrides the "listening" line (default: the list-dictation copy, "say
// them with and…") for a caller whose mic isn't collecting a list — e.g.
// AskSheet's single-shot "I'm listening…" (E-22). The error copy stays shared
// (denied/unsupported/no-speech reads the same everywhere).
export function VoiceStatus({ voice, hint }: { voice: VoiceInput; hint?: string }) {
  const t = useT()
  // On iOS the only way back from a denial is Settings, so swap the recovery copy.
  const deniedMsg = isIos() ? t.list.voiceDeniedIos : t.list.voiceDenied
  // Explain a remembered-blocked mic before the user even taps, so a kiosk that
  // was never granted access doesn't look merely silent.
  if (!voice.error && voice.permission === 'denied') {
    return <StatusMessage tone="error">{deniedMsg}</StatusMessage>
  }
  if (voice.error) {
    const msg =
      voice.error === 'not-allowed' || voice.error === 'service-not-allowed'
        ? deniedMsg
        : voice.error === 'language-not-supported'
          ? t.list.voiceUnsupported
          : t.list.voiceNoSpeech
    return <StatusMessage tone="error">{msg}</StatusMessage>
  }
  if (voice.listening) {
    return <StatusMessage tone="info">{hint ?? t.list.voiceHint}</StatusMessage>
  }
  return null
}
