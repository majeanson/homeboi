import { useEffect, useRef, useState } from 'react'
import { useT } from '../i18n'
import { api } from '../lib/api'
import { useSpeak } from '../lib/speak'
import { useVoiceInput } from '../lib/useVoiceInput'
import { AskAnswerCard, speakableAnswer, type AnswerKind, type AskAnswerStatus } from '../lib/askAnswer'
import { CaptureForm } from './CaptureForm'
import { Cluster } from './Layout'
import { EditField } from './EditField'
import { Modal } from './Modal'
import { VoiceButton, VoiceStatus } from './VoiceButton'
import { Icon } from './Icon'

// E-22 — « Parle à la maison » : the ONE voice surface, reachable from every hub tab's
// header. Two things you can say to the house, told apart by an explicit segment rather
// than by guessing which you meant:
//
//   • « Demander » (read)  — a question over the household's own data (POST /api/ask, the
//     same typed endpoint the search box uses) → a calm spoken answer.
//   • « Classer »  (write) — the capture spine (POST /api/capture): Workers AI files the
//     line as an event / task / list item / pantry-low / meal / note.
//
// Classer used to live in the board's ＋ sheet, directly above the audio-memo buttons — a
// field whose mic dictated text for the AI to file, stacked on a button whose mic recorded
// a clip that REPLACED that text. Same microphone glyph, opposite meanings. Moving the
// write spine here frees the ＋ sheet's note tile to be a plain note (with a 📎 for a memo),
// and puts both AI mics on one surface where a segment says which one you're holding.
//
// The mic opens under a finger, period — never ambient, never a background listener.
// Mounted ONLY while open (see HubHead: `{open && <AskSheet …/>}`, not an `open` prop that
// hides-but-keeps-mounted like Sheet/AddSheet) — so closing UNMOUNTS this, which fires
// useVoiceInput's own unmount cleanup and kills a still-listening mic. "Under a finger
// only" has to hold even if the user backgrounds the app mid-listen.
//
// AI off (`aiEnabled` false — binding unset, or the household switched it off): there is no
// answer to give, so « Demander » drops and the sheet is « Classer » alone. Capture's
// degraded path (pick the type yourself) needs no model — which is exactly why the header
// mic no longer hides on !aiEnabled the way it did when this sheet only asked questions.
// Hiding it would now take the write spine offline with it.
type AskMode = 'ask' | 'file'

export function AskSheet({ aiEnabled = true, onClose }: { aiEnabled?: boolean; onClose: () => void }) {
  const t = useT()
  const speak = useSpeak()
  const [mode, setMode] = useState<AskMode>(aiEnabled ? 'ask' : 'file')
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
      speak(speakableAnswer(answer.text))
    }
  }, [status, answer, speak])

  // Leaving « Demander » stops a listening mic and clears the answer: the surface is
  // about to mean "file this", and a question still being heard (or answered) under
  // that label is exactly the ambiguity this segment exists to remove.
  function pick(next: AskMode) {
    if (next === mode) return
    if (next === 'file') {
      voice.stop()
      setStatus(null)
      setAnswer(null)
    }
    setMode(next)
  }

  return (
    <Modal open onClose={onClose} title={t.ask.title} className="ask-sheet">
      {/* Which of the two things you're about to say. Hidden when AI is off — only
          « Classer » remains, and a one-option segment is noise. */}
      {aiEnabled && (
        <Cluster fill className="ask-sheet__modes" role="group" aria-label={t.ask.title}>
          <button
            type="button"
            className={'btn btn--sm' + (mode === 'ask' ? ' btn--primary' : '')}
            aria-pressed={mode === 'ask'}
            onClick={() => pick('ask')}
          >
            <Icon name="magnifying-glass-bold" size={16} /> {t.ask.modeAsk}
          </button>
          <button
            type="button"
            className={'btn btn--sm' + (mode === 'file' ? ' btn--primary' : '')}
            aria-pressed={mode === 'file'}
            onClick={() => pick('file')}
          >
            <Icon name="sparkle-bold" size={16} /> {t.ask.modeFile}
          </button>
        </Cluster>
      )}

      <p className="ask-sheet__hint mono">{mode === 'ask' ? t.ask.hint : t.ask.fileHint}</p>

      {mode === 'ask' ? (
        <>
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
                    onClick={() => speak(speakableAnswer(answer.text))}
                    aria-label={t.ask.replay}
                    title={t.ask.replay}
                  >
                    <Icon name="speaker-high-bold" size={18} />
                  </button>
                ) : undefined
              }
            />
          )}
        </>
      ) : (
        // The capture spine, moved here whole: its own field + dictation mic, the
        // offline queue, the degraded type-picker and the calm compensating undo.
        <CaptureForm autoFocus />
      )}
    </Modal>
  )
}
