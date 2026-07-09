import { useEffect, useRef, useState } from 'react'
import { useT } from '../i18n'
import { api } from '../lib/api'
import { useSpeak } from '../lib/speak'
import { useVoiceInput } from '../lib/useVoiceInput'
import { AskAnswerCard, type AnswerKind, type AskAnswerStatus } from '../lib/askAnswer'
import { EditField } from './EditField'
import { Modal } from './Modal'
import { VoiceButton, VoiceStatus } from './VoiceButton'
import { Icon } from './Icon'

// E-22 — « Demande à la maison » : hold the mic, ask a question over the
// household's own data (POST /api/ask — the same typed endpoint the search box
// uses), get a calm spoken answer. STRICTLY on-demand: the mic opens under a
// finger, period — never ambient, never a background listener.
//
// Mounted ONLY while open (see the entry point in HubHead.tsx: `{open && <AskSheet
// .../>}`, not an `open` prop that hides-but-keeps-mounted like Sheet/AddSheet) —
// so closing the sheet UNMOUNTS this component, which fires useVoiceInput's own
// unmount cleanup and kills a still-listening mic. "Under a finger only" has to
// hold even if the user backgrounds the app mid-listen.
//
// Renders the SAME answer card as the search box's "Ask the AI" (lib/askAnswer —
// no drift), plus what's new here: a big tap-to-talk VoiceButton, a typed
// EditField fallback (no mic support / prefers typing), and an auto-speak-once
// of the answer with a 🔊 replay (the search box stays tap-to-hear-nothing; you
// already see the text there).
export function AskSheet({ onClose }: { onClose: () => void }) {
  const t = useT()
  const speak = useSpeak()
  const [question, setQuestion] = useState('')
  const [status, setStatus] = useState<AskAnswerStatus | null>(null)
  const [answer, setAnswer] = useState<{ text: string; kind: AnswerKind } | null>(null)
  // Guards the auto-speak-once: a fresh answer speaks exactly once; the 🔊
  // button can always replay it after.
  const spokenRef = useRef(false)

  async function ask(raw: string) {
    const q = raw.trim()
    if (!q || status === 'asking') return
    setStatus('asking')
    setAnswer(null)
    spokenRef.current = false
    try {
      const r = await api<{ answer: string | null; kind: AnswerKind; degraded: boolean }>('ask', {
        method: 'POST',
        body: { question: q },
      })
      if (r.degraded) setStatus('off')
      else if (r.answer) {
        setAnswer({ text: r.answer, kind: r.kind })
        setStatus('answer')
      } else {
        setStatus('error')
      }
    } catch {
      setStatus('error')
    }
  }

  // A finished spoken question asks immediately — no separate "now tap send" step.
  const voice = useVoiceInput((text) => {
    setQuestion(text)
    void ask(text)
  })

  // Auto-speak the answer once it lands (E-22 decision: auto-speak + 🔊 replay).
  useEffect(() => {
    if (status === 'answer' && answer && !spokenRef.current) {
      spokenRef.current = true
      speak(answer.text)
    }
  }, [status, answer, speak])

  return (
    <Modal open onClose={onClose} title={t.ask.title} className="ask-sheet">
      <p className="ask-sheet__hint mono">{t.ask.hint}</p>

      <div className="ask-sheet__mic">
        <VoiceButton voice={voice} label={t.ask.talk} />
        <VoiceStatus voice={voice} hint={t.ask.listening} />
      </div>

      <EditField
        value={question}
        onChange={setQuestion}
        onSubmit={ask}
        placeholder={t.ask.placeholder}
        submitLabel={t.ask.ask}
        submitLeadingIcon="sparkle-bold"
        busy={status === 'asking'}
      />

      {status && (
        <AskAnswerCard
          t={t}
          status={status}
          answer={answer}
          onRelatedClick={onClose}
          replay={
            status === 'answer' && answer ? (
              <button
                type="button"
                className="btn btn--ghost btn--sm ask-sheet__replay"
                onClick={() => speak(answer.text)}
                aria-label={t.ask.replay}
                title={t.ask.replay}
              >
                <Icon name="speaker-high-bold" size={18} />
              </button>
            ) : undefined
          }
        />
      )}
    </Modal>
  )
}
