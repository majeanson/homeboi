import { useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useT } from '../../i18n'
import { useWrite } from '../../lib/write'
import { api, ApiError } from '../../lib/api'
import { BOARD_KEY } from '../../lib/queryKeys'
import { useSpeak } from '../../lib/speak'
import { isGuest } from '../../lib/device'
import { imgUrl } from '../../lib/image'
import { useDrawingToRoutine } from '../../lib/drawingToRoutine'
import { Icon, InlineIcon } from '../Icon'
import { DrawPad } from '../DrawPad'
import { colorOf as memberColorOf, type BoardData, type Member, type NoteRow } from './types'

// Fridge notes on the Aujourd'hui board: little hand-written cards a parent can
// clear with a tap. Tinted by who left it (pick-your-face). Optimistically
// removed on clear, then the soft-delete persists. Toddler mode reads each note
// aloud on tap (NFR-KID-2) and a long-press-free single tap clears it — a kid
// helping "take the note down" is harmless (it's soft-deleted).
export function Notes({
  notes,
  members,
  toddler,
  variant = 'all',
}: {
  notes: NoteRow[]
  members: Member[]
  toddler?: boolean
  // Which notes this instance shows. The parent board splits them: drawings ride
  // ONLY in the Grille/bento view (`drawings`), every other note rides above all
  // views (`notes`). Toddler + default render everything (`all`).
  variant?: 'all' | 'notes' | 'drawings'
}) {
  const t = useT()
  const write = useWrite()
  const qc = useQueryClient()
  const speak = useSpeak()
  const toRoutine = useDrawingToRoutine()
  // One shared <audio> so playing a voice memo (#38) stops any previous one.
  const audioRef = useRef<HTMLAudioElement | null>(null)
  // A drawing being re-opened in DrawPad to add to it (#14, the shared family doodle).
  const [editing, setEditing] = useState<NoteRow | null>(null)
  // Read-only guest: clearing a note is a write. In the parent lens the card becomes
  // inert display text (no ✕, no tap). The toddler read-aloud stays (it's a read).
  const ro = isGuest()
  const colorOf = (id: string | null) => memberColorOf(members, id)
  const isDrawing = (n: NoteRow) => n.media_kind === 'drawing' && !!n.media_key
  const shown = notes.filter((n) => (variant === 'drawings' ? isDrawing(n) : variant === 'notes' ? !isDrawing(n) : true))
  const title = variant === 'drawings' ? t.notes.drawings : t.notes.title

  // Save the added-to drawing: upload the new PNG + editable scene (#1), then PATCH
  // the note in place (re-tints to whoever drew, resurfaces it). Media uploads can't
  // be queued offline (the R2 blob must land), so this uses api() directly like
  // MemoControls; the board poll/realtime reconciles the card.
  async function saveDrawing(png: Blob, scene: string) {
    const note = editing
    setEditing(null)
    if (!note) return
    try {
      const { key } = await api<{ key: string }>('note-media', { method: 'POST', body: png })
      let sceneKey: string | undefined
      if (scene) {
        try {
          const r = await api<{ key: string }>('note-media', { method: 'POST', body: new Blob([scene], { type: 'application/json' }) })
          sceneKey = r.key
        } catch {
          /* scene optional — keep the PNG even if the scene upload fails */
        }
      }
      await api('notes', { method: 'PATCH', body: { id: note.id, media_key: key, scene_key: sceneKey } })
    } catch (e) {
      if (!(e instanceof ApiError)) throw e // server said no → let the refetch correct it
    } finally {
      qc.invalidateQueries({ queryKey: BOARD_KEY })
    }
  }

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

  // Nothing to show and nothing being edited — render nothing.
  if (!shown.length && !editing) return null

  return (
    <section className={'notes' + (toddler ? ' notes--kid' : '') + (variant === 'drawings' ? ' notes--drawings' : '')} aria-label={title}>
      <div className="notes__head mono" aria-hidden="true">
        <InlineIcon name={variant === 'drawings' ? 'paint-brush-bold' : 'push-pin-bold'} /> {title}
      </div>
      <div className="notes__grid">
        {shown.map((n) => {
          const tint = colorOf(n.member_id) ?? '#FBD66B'
          const css = { '--note-tint': tint } as React.CSSProperties
          const media = n.media_kind && n.media_key ? n.media_kind : null
          // The card's inner face by kind: a drawing (#14) or shared photo (#13)
          // image, a voice-memo play affordance (#38), or the written line. An
          // image/audio note may also carry a caption (text), shown beneath.
          const body =
            media === 'drawing' || media === 'image' ? (
              <span className="note-card__media">
                <img
                  className="note-card__draw"
                  src={imgUrl(n.media_key!)}
                  alt={media === 'image' ? t.notes.photo : t.notes.drawing}
                />
                {n.text && <span className="note-card__cap">{n.text}</span>}
              </span>
            ) : media === 'audio' ? (
              <span className="note-card__memo">
                <Icon name="play-bold" size={16} /> {t.notes.memo}
                {n.text && <span className="note-card__cap">{n.text}</span>}
              </span>
            ) : (
              <span className="note-card__text">{n.text}</span>
            )

          // Media notes: the body plays (audio), or — for a drawing — IS the tap
          // target to re-open and add to it (shared family doodle); a shared photo
          // just shows. A separate ✕ clears (parent only) so a tap never also
          // dismisses it.
          if (media) {
            const play = media === 'audio' ? () => playClip(n.media_key!) : undefined
            // A drawing is the family doodle: parent OR toddler (not a guest) can tap
            // it to add to it. Clearing (✕) stays parent-only below.
            const editable = !ro && media === 'drawing'
            const isVisual = media === 'drawing' || media === 'image'
            return (
              <div key={n.id} className={`note-card note-card--media${isVisual ? ' note-card--visual' : ''}`} style={css}>
                {play ? (
                  <button type="button" className="note-card__mediabtn" onClick={play} aria-label={t.notes.memo}>
                    {body}
                  </button>
                ) : editable ? (
                  // The whole drawing is the edit target; the corner ✏️ is the cue.
                  <button type="button" className="note-card__mediabtn" onClick={() => setEditing(n)} aria-label={t.memo.edit}>
                    {body}
                    <span className="note-card__edit-badge" aria-hidden="true">
                      <Icon name="pencil-simple-bold" size={14} />
                    </span>
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
      {editing && (
        <DrawPad
          open
          toddler={toddler}
          initial={editing.media_key ? imgUrl(editing.media_key) : undefined}
          initialSceneUrl={editing.scene_key ? imgUrl(editing.scene_key) : undefined}
          onCancel={() => setEditing(null)}
          onSave={(png, scene) => void saveDrawing(png, scene)}
          onMakeRoutine={toddler ? undefined : (png) => void toRoutine(png)}
        />
      )}
    </section>
  )
}
