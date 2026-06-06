import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useT } from '../i18n'
import { api, ApiError } from '../lib/api'
import { useAuth } from '../lib/auth'
import { useVoiceInput } from '../lib/useVoiceInput'
import { Icon, type IconName } from './Icon'
import { EventForm } from './forms/EventForm'
import { ChoreForm } from './forms/ChoreForm'
import { RoutineForm } from './forms/RoutineForm'

// Pip's "Add" bottom-sheet. ONE grid of icon tiles, each doing the whole thing:
//   • Note rapide — type/speak; the AI router sorts it (the fast, kiosk default).
//   • Rendez-vous / Corvée / Routine — the SAME full forms as Settings (shared
//     components, identical detail). Operator-only.
// (No separate force-type grid anymore — the AI routes the quick note; the 6
// types reappear only as a fallback when AI is off, to re-classify the note.)
type CaptureType = 'event' | 'meal' | 'task' | 'list-item' | 'pantry-low' | 'note'
type Mode = 'capture' | 'event' | 'chore' | 'routine'
interface FormMember { id: string; display_name: string; is_child: number }

// The 6 AI-router types — only shown as a fallback when a capture comes back
// degraded (AI off), so the human can re-route the saved note.
// wash = theme-aware CSS var so the icon tiles follow day↔night (night darkens
// each --*-wash); deep stays concrete hex (the glyph ink reads on both surfaces).
const TYPES: { type: CaptureType; icon: IconName; deep: string; wash: string }[] = [
  { type: 'event', icon: 'calendar-blank-bold', deep: '#5891AC', wash: 'var(--sky-wash)' },
  { type: 'meal', icon: 'carrot-bold', deep: '#C2563A', wash: 'var(--terracotta-wash)' },
  { type: 'task', icon: 'hand-heart-bold', deep: '#6B8A52', wash: 'var(--sage-wash)' },
  { type: 'list-item', icon: 'sparkle-bold', deep: '#D9842A', wash: 'var(--marigold-wash)' },
  { type: 'pantry-low', icon: 'carrot-bold', deep: '#C2563A', wash: 'var(--terracotta-wash)' },
  { type: 'note', icon: 'pencil-simple-bold', deep: '#95527A', wash: 'var(--berry-wash)' },
]

// The single chooser: each tile selects a mode that does the whole thing.
const MODES: { mode: Mode; icon: IconName; deep: string; wash: string }[] = [
  { mode: 'capture', icon: 'sparkle-bold', deep: '#D9842A', wash: 'var(--marigold-wash)' },
  { mode: 'event', icon: 'calendar-blank-bold', deep: '#5891AC', wash: 'var(--sky-wash)' },
  { mode: 'chore', icon: 'hand-heart-bold', deep: '#6B8A52', wash: 'var(--sage-wash)' },
  { mode: 'routine', icon: 'pencil-simple-bold', deep: '#95527A', wash: 'var(--berry-wash)' },
]

export function AddSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useT()
  const qc = useQueryClient()
  const { signedIn } = useAuth()
  const [mode, setMode] = useState<Mode>('capture')
  const [text, setText] = useState('')
  const { listening, hasVoice, start: startVoice } = useVoiceInput(setText)
  const [busy, setBusy] = useState(false)
  const [routed, setRouted] = useState<{ label: string; degraded: boolean } | null>(null)

  const { data: membersData } = useQuery({
    queryKey: ['members'],
    queryFn: () => api<{ members: FormMember[] }>('members'),
    enabled: signedIn && open,
  })
  const members = membersData?.members ?? []

  function close() {
    setMode('capture')
    setRouted(null)
    onClose()
  }
  const savedWith = (keys: string[][]) => () => {
    for (const k of keys) qc.invalidateQueries({ queryKey: k })
    close()
  }

  // Quick capture. forceType (from the degraded fallback) skips the AI router.
  async function submit(e?: React.FormEvent, forceType?: CaptureType) {
    e?.preventDefault()
    const value = text.trim()
    if (!value || busy) return
    setBusy(true)
    setRouted(null)
    try {
      const res = await api<{ type: string; degraded: boolean; routed: { kind: string; label: string } }>('capture', {
        method: 'POST',
        body: { text: value, forceType },
      })
      const degraded = res.degraded && !forceType
      setRouted({ label: res.routed?.label ?? value, degraded })
      if (!degraded) setText('')
      for (const key of [['board'], ['meals'], ['pantry']]) qc.invalidateQueries({ queryKey: key })
    } catch (e) {
      if (!(e instanceof ApiError)) throw e
    } finally {
      setBusy(false)
    }
  }

  const modeLabel = (m: Mode) =>
    m === 'capture' ? t.capture.quick : m === 'event' ? t.capture.types.event : m === 'chore' ? t.operator.chores : t.nav.routines

  return (
    <>
      <div className={'scrim' + (open ? ' show' : '')} onClick={close} aria-hidden="true" />
      <div className={'sheet' + (open ? ' show' : '')} role="dialog" aria-modal="true" aria-label={t.capture.add}>
        <div className="grab" aria-hidden="true" />
        <h3>{t.capture.add}</h3>

        {/* One chooser — operator only. Kiosk gets quick capture straight away. */}
        {signedIn && (
          <div className="cat-grid">
            {MODES.map((m) => (
              <button
                key={m.mode}
                type="button"
                className={'cat-pick' + (mode === m.mode ? ' sel' : '')}
                onClick={() => setMode(m.mode)}
                aria-pressed={mode === m.mode}
              >
                <span className="ct" style={{ background: m.wash }}>
                  <Icon name={m.icon} size={22} color={m.deep} />
                </span>
                <span>{modeLabel(m.mode)}</span>
              </button>
            ))}
          </div>
        )}

        {mode === 'capture' && (
          <form onSubmit={submit}>
            <div className="sheet__field">
              <Icon name="pencil-simple-bold" size={20} color="var(--ink-faint)" />
              <input
                autoFocus={open}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={listening ? t.capture.listening : t.capture.placeholder}
                aria-label={t.capture.add}
              />
              {hasVoice && (
                <button
                  type="button"
                  className={`btn btn--ghost capture__voice${listening ? ' is-listening' : ''}`}
                  onClick={startVoice}
                  aria-label={t.capture.voice}
                >
                  🎤
                </button>
              )}
            </div>

            {/* Fallback only: AI off → let the human re-route the saved note. */}
            {routed?.degraded && (
              <div className="cat-grid">
                {TYPES.map((ty) => (
                  <button
                    key={ty.type}
                    type="button"
                    className="cat-pick"
                    onClick={() => submit(undefined, ty.type)}
                  >
                    <span className="ct" style={{ background: ty.wash }}>
                      <Icon name={ty.icon} size={22} color={ty.deep} />
                    </span>
                    <span>{t.capture.types[ty.type]}</span>
                  </button>
                ))}
              </div>
            )}

            {routed && (
              <p className="capture__routed mono">
                {routed.degraded ? t.capture.degraded : `${t.capture.routed} ${routed.label}`}
              </p>
            )}

            <button type="submit" className="btn btn--primary" disabled={!text.trim() || busy}>
              <Icon name="plus-bold" size={20} />
              {t.capture.add}
            </button>
          </form>
        )}

        {mode === 'event' && <EventForm members={members} onSaved={savedWith([['board'], ['events']])} />}
        {mode === 'chore' && <ChoreForm members={members} onSaved={savedWith([['board'], ['chores']])} />}
        {mode === 'routine' && <RoutineForm members={members} onSaved={savedWith([['routines'], ['board']])} />}
      </div>
    </>
  )
}
