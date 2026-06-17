import { useRef } from 'react'
import { useT } from '../../i18n'
import { useWrite } from '../../lib/write'
import { BOARD_KEY } from '../../lib/queryKeys'
import { useSpeak } from '../../lib/speak'
import { isGuest } from '../../lib/device'
import { imgUrl } from '../../lib/image'
import { Icon, InlineIcon } from '../Icon'
import type { BoardData, Member, NoteRow } from './types'

// Fridge notes on the Aujourd'hui board: little hand-written cards a parent can
// clear with a tap. Tinted by who left it (pick-your-face). Optimistically
// removed on clear, then the soft-delete persists. Toddler mode reads each note
// aloud on tap (NFR-KID-2) and a long-press-free single tap clears it — a kid
// helping "take the note down" is harmless (it's soft-deleted).
export function Notes({
  notes,
  members,
  toddler,
}: {
  notes: NoteRow[]
  members: Member[]
  toddler?: boolean
}) {
  const t = useT()
  const write = useWrite()
  const speak = useSpeak()
  // One shared <audio> so playing a voice memo (#38) stops any previous one.
  const audioRef = useRef<HTMLAudioElement | null>(null)
  // Read-only guest: clearing a note is a write. In the parent lens the card becomes
  // inert display text (no ✕, no tap). The toddler read-aloud stays (it's a read).
  const ro = isGuest()
  if (!notes.length) return null
  const colorOf = (id: string | null) => (id ? members.find((m) => m.id === id)?.colour : null)

  function playClip(key: string) {
    try {
      audioRef.current?.pause()
      const a = new Audio(imgUrl(key))
      audioRef.current = a
      void a.play()
    } catch {
      /* autoplay blocked / unsupported — harmless, it's optional media */
    }
  }

  function dismiss(n: NoteRow) {
    // Optimistic: drop it from the cached board at once, then persist (queues
    // offline and replays on reconnect — deleting a note by id is idempotent).
    void write('notes', {
      method: 'DELETE',
      body: { id: n.id },
      affectedKeys: [BOARD_KEY],
      optimistic: (qc) =>
        qc.setQueryData<BoardData>(BOARD_KEY, (d) => (d ? { ...d, notes: d.notes.filter((x) => x.id !== n.id) } : d)),
    }).catch(() => {})
  }

  return (
    <section className={'notes' + (toddler ? ' notes--kid' : '')} aria-label={t.notes.title}>
      <div className="notes__head mono" aria-hidden="true">
        <InlineIcon name="push-pin-bold" /> {t.notes.title}
      </div>
      <div className="notes__grid">
        {notes.map((n) => {
          const tint = colorOf(n.member_id) ?? '#FBD66B'
          const css = { '--note-tint': tint } as React.CSSProperties
          const media = n.media_kind && n.media_key ? n.media_kind : null
          // The card's inner face by kind: a drawing image (#14), a voice-memo
          // play affordance (#38), or the written line.
          const body =
            media === 'drawing' ? (
              <img className="note-card__draw" src={imgUrl(n.media_key!)} alt={t.notes.drawing} />
            ) : media === 'audio' ? (
              <span className="note-card__memo">
                <Icon name="play-bold" size={16} /> {t.notes.memo}
              </span>
            ) : (
              <span className="note-card__text">{n.text}</span>
            )

          // Media notes: the body plays (audio) or just shows (drawing); a separate
          // ✕ clears (parent only) so a tap on the memo never also dismisses it.
          if (media) {
            const play = media === 'audio' ? () => playClip(n.media_key!) : undefined
            return (
              <div key={n.id} className="note-card note-card--media" style={css}>
                {play ? (
                  <button type="button" className="note-card__mediabtn" onClick={play} aria-label={t.notes.memo}>
                    {body}
                  </button>
                ) : (
                  body
                )}
                {!ro && !toddler && (
                  <button
                    type="button"
                    className="note-card__clear note-card__clear--btn"
                    onClick={() => dismiss(n)}
                    aria-label={t.notes.clear}
                  >
                    <Icon name="x-bold" size={14} />
                  </button>
                )}
              </div>
            )
          }

          // Guest + parent lens: an inert text card — no clear write, no ✕.
          if (ro && !toddler) {
            return (
              <div key={n.id} className="note-card" style={css}>
                <span className="note-card__text">{n.text}</span>
              </div>
            )
          }
          return (
            <button
              key={n.id}
              type="button"
              className="note-card"
              style={css}
              onClick={() => {
                // Toddler: read it aloud (helping read the fridge). Parent: clear it.
                if (toddler) speak(n.text)
                else dismiss(n)
              }}
              aria-label={toddler ? n.text : `${n.text} — ${t.notes.clear}`}
            >
              <span className="note-card__text">{n.text}</span>
              {!toddler && (
                <span className="note-card__clear" aria-hidden="true">
                  <Icon name="x-bold" size={14} />
                </span>
              )}
            </button>
          )
        })}
      </div>
    </section>
  )
}
