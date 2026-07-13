import { useRef, useState, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useT } from '../../i18n'
import { useWrite } from '../../lib/write'
import { useConfirm } from '../../lib/confirm'
import { api, ApiError, isStatus } from '../../lib/api'
import { BOARD_KEY } from '../../lib/queryKeys'
import { useSpeak } from '../../lib/speak'
import { isGuest } from '../../lib/device'
import { imgUrl } from '../../lib/image'
import { useDrawingToRoutine } from '../../lib/drawingToRoutine'
import { useKeepInGalleryToast, useKeepKeysInGalleryToast } from '../../lib/drawingGallery'
import { useDrawEdit } from '../../lib/drawEdit'
import { Icon, InlineIcon } from '../Icon'
import { useReportEmpty } from '../../lib/useReportEmpty'
import { useDeferredRemoval } from '../../lib/useDeferredRemoval'
import { DrawPad } from '../DrawPad'
import { DrawEditChoice } from '../DrawEditChoice'
import { ZoomableImg } from '../ZoomableImg'
import { colorOf as memberColorOf, type BoardData, type Member, type NoteRow } from './types'
import { colourFor } from '../../lib/things'

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
  action,
}: {
  notes: NoteRow[]
  members: Member[]
  toddler?: boolean
  // Which notes this instance shows. The parent board splits them: drawings ride
  // ONLY in the Grille/bento view (`drawings`), every other note rides above all
  // views (`notes`). Toddler + default render everything (`all`).
  variant?: 'all' | 'notes' | 'drawings'
  // Optional trailing control rendered as the last item of the grid (e.g. the
  // "La galerie" door under the drawings strip) — sits beside the cards on a wide
  // tablet, wraps under them on a phone, instead of taking its own row.
  action?: ReactNode
}) {
  const t = useT()
  const write = useWrite()
  const confirm = useConfirm()
  const qc = useQueryClient()
  const speak = useSpeak()
  const toRoutine = useDrawingToRoutine()
  // Keep a drawing into « Mes dessins » with a calm, undoable confirming toast (the
  // paint badge / in-pad "Garder" gave no clear feedback before). Best-effort.
  const keepInGallery = useKeepInGalleryToast()
  // Keep a board drawing into « Mes dessins » WITHOUT opening the pad — an independent
  // copy, so clearing the note later never frees the kept drawing (#14, never lose one).
  const keepKeysInGallery = useKeepKeysInGalleryToast()
  const [kept, setKept] = useState<Set<string>>(new Set())
  // One shared <audio> so playing a voice memo (#38) stops any previous one.
  const audioRef = useRef<HTMLAudioElement | null>(null)
  // Re-opening a drawing (#14): the shared chooser (modify / copy / calquer) + the pad
  // load props it resolves to. `draw.isNew` says copy/trace (→ a new note) vs modify.
  const draw = useDrawEdit<NoteRow>()
  // A brand-new drawing being created from this strip's quick-add (parallel to the
  // ＋ « Note rapide » sheet's 📎) — opens a blank DrawPad and POSTs a note.
  const [creating, setCreating] = useState(false)
  // R2 unbound (503 on save) → hide the quick-add draw button, like useMemoAttach.
  const [drawHidden, setDrawHidden] = useState(false)
  // Read-only guest: clearing a note is a write. In the parent lens the card becomes
  // inert display text (no ✕, no tap). The toddler read-aloud stays (it's a read).
  const ro = isGuest()
  const colorOf = (id: string | null) => memberColorOf(members, id)
  const isDrawing = (n: NoteRow) => n.media_kind === 'drawing' && !!n.media_key
  // « Tout effacer » (tidy seam #1) rides the shared deferred-removal store: the
  // batch hides NOW, the N dismiss writes wait behind ONE undo toast, and the
  // board poll can't resurrect a note mid-undo. Keyed on BOARD_KEY like the list.
  const removal = useDeferredRemoval(BOARD_KEY)
  const shown = removal.visible(
    notes.filter((n) => (variant === 'drawings' ? isDrawing(n) : variant === 'notes' ? !isDrawing(n) : true)),
  )
  const title = variant === 'drawings' ? t.notes.drawings : t.notes.title

  // Persist a drawing: upload the PNG + editable scene (#1), then either PATCH an
  // existing note in place (adding to it — re-tints to whoever drew, resurfaces it)
  // or POST a brand-new fridge note (the quick-add path, mirroring useMemoAttach).
  // Media uploads can't be queued offline (the R2 blob must land), so this uses
  // api() directly; the board poll/realtime reconciles the card.
  async function saveDrawing(png: Blob, scene: string, note: NoteRow | null) {
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
      if (note) await api('notes', { method: 'PATCH', body: { id: note.id, media_key: key, scene_key: sceneKey } })
      else await api('notes', { method: 'POST', body: { media_kind: 'drawing', media_key: key, scene_key: sceneKey, text: '' } })
    } catch (e) {
      if (isStatus(e, 503)) setDrawHidden(true) // R2 unbound → hide the quick-add
      else if (!(e instanceof ApiError)) throw e // server said no → let the refetch correct it
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

  async function keepNote(n: NoteRow) {
    if (!n.media_key) return
    // Toast confirms + offers undo; on undo the badge reverts. Best-effort (null on fail).
    const id = await keepKeysInGallery(n.media_key, n.scene_key, () =>
      setKept((s) => { const x = new Set(s); x.delete(n.id); return x }),
    )
    if (id) setKept((s) => new Set(s).add(n.id))
  }

  // Batch-dismiss every note this strip currently shows, as ONE undoable action
  // (tidy seam #1 — the Sunday tidy was per-item labour, per-item confirms
  // included). No confirm, even for media notes: unlike the per-item ✕ (whose
  // write fires at once and frees the R2 blob), the held writes only run after
  // the undo window closes — undo restores everything, blobs untouched.
  function clearAll() {
    const ids = shown.map((n) => n.id)
    removal.remove(ids, t.notes.clearedN(ids.length), () =>
      Promise.all(
        ids.map((id) => write('notes', { method: 'DELETE', body: { id }, affectedKeys: [BOARD_KEY] }).catch(() => {})),
      ),
    )
  }

  async function dismiss(n: NoteRow) {
    // A media note frees its R2 blob on delete (the media-undo-blob rule: media rows
    // confirm, they don't undo) — so a parent's ✕ on a drawing/photo/voice memo confirms
    // first, guarding an accidental tap from silently losing the attachment. Plain text
    // notes stay a quick, friction-free clear (they're transient by design, and toddler
    // tap-to-clear only ever hits text notes — the media ✕ is parent-only).
    if (n.media_key && !(await confirm({ message: t.notes.dismissMediaConfirm, tone: 'danger' }))) return
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

  // Nothing to show and nothing being edited — render nothing. The trailing
  // `action` (the gallery door) keeps the section alive even with zero current
  // drawings, since saved drawings live on in the gallery regardless — which is why
  // the « Dessins » card never reports itself empty, and defaults to mode 'always'.
  const empty = !shown.length && !draw.editing && !creating && !action
  useReportEmpty(empty)
  if (empty) return null

  // The strip's own quick-add: parent lens (drawings variant is never toddler) can
  // start a NEW drawing right here, not only from the ＋ "Note rapide" sheet. Hidden
  // for a read-only guest and when R2 is unbound (503 surfaced on a prior save).
  const canDraw = variant === 'drawings' && !ro && !drawHidden

  return (
    <section className={'notes' + (toddler ? ' notes--kid' : '') + (variant === 'drawings' ? ' notes--drawings' : '')} aria-label={title}>
      <div className="notes__head mono">
        <span aria-hidden="true">
          <InlineIcon name={variant === 'drawings' ? 'paint-brush-bold' : 'push-pin-bold'} /> {title}
        </span>
        {/* « Tout effacer » — one tap empties the strip, one toast undoes it.
            Writes, so hidden from a guest; parent lens only (the toddler tap-to-
            clear stays per-note); pointless under two notes. */}
        {!ro && !toddler && shown.length > 1 && (
          <button type="button" className="notes__clear-all" onClick={clearAll}>
            <InlineIcon name="broom-bold" size={13} /> {t.notes.clearAll}
          </button>
        )}
      </div>
      <div className="notes__grid">
        {shown.map((n) => {
          const tint = colourFor('note', colorOf(n.member_id))
          const css = { '--note-tint': tint } as React.CSSProperties
          const media = n.media_kind && n.media_key ? n.media_kind : null
          // Attribution for a « boîte aux lettres » message (#postbox) — « — Papi ».
          // Absent on ordinary household notes, so nothing changes for those.
          const from = n.author_label ? (
            <span className="note-card__from mono">— {n.author_label}</span>
          ) : null
          // The card's inner face by kind: a drawing (#14) or shared photo (#13)
          // image, a voice-memo play affordance (#38), or the written line. An
          // image/audio note may also carry a caption (text), shown beneath.
          const body =
            media === 'drawing' || media === 'image' ? (
              <span className="note-card__media">
                {/* Tap the image to inspect it full-screen (pinch-zoom + drag to pan +
                    double-tap), like flyer/recipe photos. For a drawing, editing moved
                    to the ✏️ badge button below so a tap zooms instead of opening the pad. */}
                <ZoomableImg
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
            // A drawing is the family doodle: parent OR toddler (not a guest) can open
            // it to add to it — now via the ✏️ badge, since a tap on the image zooms it.
            const editable = !ro && media === 'drawing'
            const isVisual = media === 'drawing' || media === 'image'
            return (
              <div key={n.id} className={`note-card note-card--media${isVisual ? ' note-card--visual' : ''}`} style={css}>
                {play ? (
                  <button type="button" className="note-card__mediabtn" onClick={play} aria-label={t.notes.memo}>
                    {body}
                  </button>
                ) : (
                  // Visual media: the image is its own zoom target (ZoomableImg). A
                  // drawing also gets a ✏️ badge button to open the pad and add to it.
                  <>
                    {body}
                    {editable && (
                      <button
                        type="button"
                        className="note-card__edit-badge note-card__edit-badge--btn"
                        onClick={() => draw.begin(n)}
                        aria-label={t.memo.edit}
                      >
                        <Icon name="pencil-simple-bold" size={14} />
                      </button>
                    )}
                    {/* Keep this drawing into « Mes dessins » (independent copy) so it
                        survives clearing the note — the "vice versa" of pinning. */}
                    {!ro && !toddler && media === 'drawing' && (
                      <button
                        type="button"
                        className={'note-card__keep-badge' + (kept.has(n.id) ? ' is-done' : '')}
                        onClick={() => void keepNote(n)}
                        aria-label={kept.has(n.id) ? t.memo.savedToGallery : t.memo.saveToGallery}
                        title={kept.has(n.id) ? t.memo.savedToGallery : t.memo.saveToGallery}
                      >
                        <Icon name={kept.has(n.id) ? 'check-bold' : 'paint-brush-bold'} size={14} />
                      </button>
                    )}
                  </>
                )}
                {from}
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
                {from}
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
              {from}
              {!toddler && (
                <span className="note-card__clear" aria-hidden="true">
                  <Icon name="x-bold" size={14} />
                </span>
              )}
            </button>
          )
        })}
        {/* Trailing actions — the strip's own quick-add (a new drawing, same DrawPad
            + POST as the ＋ sheet) and the door to the lasting collection ("La
            galerie"). Grouped into ONE compact cluster that trails the cards on a
            wide tablet and wraps neatly under them on a phone, never claiming its
            own row. */}
        {(canDraw || action) && (
          <div className="notes__action">
            {canDraw && (
              <button type="button" className="chip" onClick={() => setCreating(true)}>
                <InlineIcon name="pencil-simple-bold" /> {t.memo.draw}
              </button>
            )}
            {action}
          </div>
        )}
      </div>
      {/* Ask how to continue a kept drawing before opening the pad (#14). */}
      <DrawEditChoice open={draw.chooserOpen} onCancel={draw.cancelChoice} onPick={draw.pick} />
      {draw.editing && (
        <DrawPad
          open
          toddler={toddler}
          {...draw.padProps!}
          onCancel={draw.close}
          // Modify edits the note in place; copy/trace save a fresh, independent note
          // so the original drawing stays exactly as it was.
          onSave={(png, scene) => {
            const note = draw.isNew ? null : draw.editing
            draw.close()
            void saveDrawing(png, scene, note)
          }}
          // Keep a permanent copy in « Mes dessins » — available to toddlers too, so
          // a child can save their own art (not just pin the fridge note).
          onKeep={(png, scene) => void keepInGallery(png, scene)}
          // Make-routine stays parent-only: it leaves into the parent routine builder.
          // toRoutine keeps an independent gallery copy first, so the drawing is never lost.
          onMakeRoutine={toddler ? undefined : (png, scene) => void toRoutine(png, scene)}
        />
      )}
      {creating && (
        <DrawPad
          open
          draftId="board-note"
          onCancel={() => setCreating(false)}
          onSave={(png, scene) => {
            setCreating(false)
            void saveDrawing(png, scene, null)
          }}
          onKeep={(png, scene) => void keepInGallery(png, scene)}
          onMakeRoutine={(png, scene) => void toRoutine(png, scene)}
        />
      )}
    </section>
  )
}
