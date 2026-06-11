import { useQueryClient } from '@tanstack/react-query'
import { useT } from '../../i18n'
import { api } from '../../lib/api'
import { BOARD_KEY } from '../../lib/queryKeys'
import { useSpeak } from '../../lib/speak'
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
  const qc = useQueryClient()
  const speak = useSpeak()
  if (!notes.length) return null
  const colorOf = (id: string | null) => (id ? members.find((m) => m.id === id)?.colour : null)

  function dismiss(n: NoteRow) {
    // Optimistic: drop it from the cached board at once, then persist the clear.
    qc.setQueryData<BoardData>(BOARD_KEY, (d) =>
      d ? { ...d, notes: d.notes.filter((x) => x.id !== n.id) } : d,
    )
    api('notes', { method: 'DELETE', body: { id: n.id } })
      .catch(() => {})
      .finally(() => qc.invalidateQueries({ queryKey: BOARD_KEY }))
  }

  return (
    <section className={'notes' + (toddler ? ' notes--kid' : '')} aria-label={t.notes.title}>
      <div className="notes__head mono" aria-hidden="true">
        📌 {t.notes.title}
      </div>
      <div className="notes__grid">
        {notes.map((n) => {
          const tint = colorOf(n.member_id) ?? '#FBD66B'
          return (
            <button
              key={n.id}
              type="button"
              className="note-card"
              style={{ '--note-tint': tint } as React.CSSProperties}
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
                  ✕
                </span>
              )}
            </button>
          )
        })}
      </div>
    </section>
  )
}
