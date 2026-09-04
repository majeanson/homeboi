import { useEffect, useRef, useState } from 'react'
import { useT } from '../../i18n'
import { useWrite } from '../../lib/write'
import { isGuest } from '../../lib/device'
import { FAMILY_NOTES_KEY } from '../../lib/queryKeys'
import { type NoteScope } from '../../lib/familyNotes'
import { EditField } from '../EditField'
import { useMemoAttach } from '../MemoAttach'
import { useVoiceInput } from '../../lib/useVoiceInput'

// The ONE quick « note rapide » composer for family_notes — one line to write, a mic,
// and the 📎 to clip a voice memo / drawing / photo onto it, in ONE write. Two call
// sites share it: the board's « Notes (cercle) » card (its header ＋, `lean`) and the
// Notes tab's ＋ FAB long-press (the AddSheet `cnote` mode, `autoVoice`) — same
// endpoint, same memo attachment, same scope rule either way. The Notes tab itself has
// no inline composer any more: a plain tap on its ＋ opens a blank note straight in
// the rich full-screen editor (NoteEditor) instead.
//
// SCOPE follows the face: a member → a personal ('self') note, « Maisonnée » (null) →
// a family-wide one. No toggle. On the board the face IS the device profile (the
// « Aujourd'hui » MemberSwitcher), so the ＋ there composes for whoever the tablet is
// currently acting as.
export function NoteQuickAdd({
  memberId,
  className,
  drawDraftId = 'cercle-note',
  autoFocus,
  onSubmitted,
  lean = false,
  autoVoice = false,
}: {
  /** The acting face: a member id → a personal note, null → a Maisonnée note. */
  memberId: string | null
  /** Wrapper class — the board card's own `cnotes-card__composer`, or none inside
   *  the ＋ FAB's sheet (that shell already provides padding). */
  className?: string
  /** Keeps a half-finished drawing apart per surface (see useMemoAttach). */
  drawDraftId?: string
  autoFocus?: boolean
  /** Fired after a note is actually written (the board card closes its composer). */
  onSubmitted?: () => void
  /** LEAN (the board card's composer): the box is nothing but text — no mic, no
   *  📎, no « Ajouter » button. Enter writes the note. The mic and the attachment
   *  live in the Notes tab's ＋ FAB long-press instead — this same component
   *  WITHOUT `lean`. */
  lean?: boolean
  /** Open with the mic already listening (the ＋ FAB's hold-and-speak, bmad/12 #18). */
  autoVoice?: boolean
}) {
  const t = useT()
  const write = useWrite()
  const fn = t.cercle.familyNotes
  const scope: NoteScope = memberId ? 'self' : 'family'

  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const voice = useVoiceInput(setText)
  const memo = useMemoAttach({ drawDraftId })

  // Hold-and-speak: start listening on mount, once. `lean` has no mic at all, so
  // there'd be nothing to stop — and a mic running behind a box with no visible
  // listening state is exactly the "is it recording me?" anxiety to avoid.
  const started = useRef(false)
  useEffect(() => {
    if (!autoVoice || lean || started.current || !voice.hasVoice) return
    started.current = true
    voice.start()
  }, [autoVoice, lean, voice])

  // A read-only guest has no composer anywhere (EditField would hide its own box, but
  // the host's wrapper/heading would still paint an empty shell).
  if (isGuest()) return null

  // ONE write: /api/family-notes takes title/text/media together, so a note that is
  // just a drawing is as valid as one that is just a line.
  async function submit(v: string) {
    const value = v.trim()
    if ((!value && !memo.draft) || busy) return
    setBusy(true)
    try {
      await write('family-notes', {
        method: 'POST',
        body: { text: value, ...memo.body, scope, member_id: scope === 'self' ? memberId : null },
        affectedKeys: [FAMILY_NOTES_KEY],
      })
      setText('')
      memo.reset()
      onSubmitted?.()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={className}>
      <EditField
        value={text}
        onChange={setText}
        onSubmit={submit}
        // Lean: Enter IS the whole interaction (submitIcon null hides the button
        // outright), so the box spends its entire width on the text.
        submitLabel={lean ? undefined : t.common.add}
        submitIcon={lean ? null : 'check-bold'}
        submitLeadingIcon={lean ? undefined : 'plus-bold'}
        submitVariant="primary"
        voice={lean ? undefined : voice}
        placeholder={!lean && voice.listening ? t.capture.listening : fn.placeholder}
        ariaLabel={fn.addHint}
        busy={busy || memo.busy}
        allowEmpty={!lean && !!memo.draft}
        autoFocus={autoFocus}
        boxActions={lean ? undefined : memo.attachButton}
      >
        {lean ? null : memo.panel}
      </EditField>
    </div>
  )
}
