import { useRef, useState, type ReactNode } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useLang, useT } from '../../i18n'
import { formatAgo } from '../../lib/format'
import { useWrite } from '../../lib/write'
import { useConfirm } from '../../lib/confirm'
import { api, ApiError, isStatus } from '../../lib/api'
import { BOARD_KEY, MEMBERS_KEY, MOTS_KEY } from '../../lib/queryKeys'
import { useProfile } from '../../lib/profile'
import { useAuth } from '../../lib/auth'
import { formatDayTime } from '../../lib/format'
import { useAllMots, sentMots, isScheduled, motLabel, type Mot } from '../../lib/mots'
import { type Member as OperatorMember } from '../../lib/members'
import { useEntityDetail } from '../detail/DetailProvider'
import { buildMot } from '../detail/adapters'
import { Act } from './Act'
import { Disclosure } from '../Disclosure'
import { Modal } from '../Modal'
import { RescheduleBody } from '../mots/RescheduleBody'
import { useSpeak } from '../../lib/speak'
import { isGuest } from '../../lib/device'
import { imgUrl } from '../../lib/image'
import { useDrawingToRoutine } from '../../lib/drawingToRoutine'
import { useKeepInGalleryToast, useKeepKeysInGalleryToast } from '../../lib/drawingGallery'
import { useDrawEdit } from '../../lib/drawEdit'
import { useAddSheet } from '../../lib/addSheet'
import { Icon, InlineIcon } from '../Icon'
import { Chip } from '../Chip'
import { useReportEmpty } from '../../lib/useReportEmpty'
import { useDeferredRemoval } from '../../lib/useDeferredRemoval'
import { DrawPad } from '../DrawPad'
import { DrawEditChoice } from '../DrawEditChoice'
import { ZoomableImg } from '../ZoomableImg'
import { colorOf as memberColorOf, type BoardData, type Member, type NoteRow } from './types'
import { colourFor } from '../../lib/things'
import { type HelpMode } from '../../lib/helpMode'

// « Mots » — the fridge on the Aujourd'hui board: little hand-written cards a parent can
// clear with a tap. Tinted by who left it (pick-your-face). Optimistically removed on
// clear, then the soft-delete persists. Toddler mode reads each note aloud on tap
// (NFR-KID-2) and a long-press-free single tap clears it — a kid helping "take the note
// down" is harmless (it's soft-deleted).
//
// ONE card since 2026-09-29 (migration 0142). The member-to-member « Laisse un mot » was
// its own card and table; a mot is now a paper here that MAY be addressed:
//   · it shows only to its recipient's face (and to nobody at rest — the face dot says
//     one is waiting), with « Pour toi »; tapping it while it waits OPENS it (the dot
//     clears everywhere) instead of taking it down;
//   · every paper can be KEPT (bottom-right) — onto the Souvenirs shelf, where it stays
//     even once taken down;
//   · « Ce que j'ai laissé » folds under the papers: what the picked face left for
//     someone, whether they've seen it, and a « Plus tard » still to come (movable).
export function Notes({
  notes,
  members,
  toddler,
  variant = 'all',
  action,
  help,
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
  // The board's help mode: while armed, the « Mots » title explains the card in place (the
  // `mots` help entry, which the retired « Laisse un mot » card carried) — as SecLabel does.
  help?: HelpMode
}) {
  const t = useT()
  const { lang } = useLang()
  // One "now" per render, not one per card: three cards computing three slightly
  // different nows is how a list ends up saying « il y a 1 j » beside « il y a 2 j »
  // for two notes written a minute apart.
  const nowSec = Math.floor(Date.now() / 1000)
  const write = useWrite()
  // The widget's own add door (top-right ＋): opens the ONE « Note rapide » sheet
  // (the same composer as the ＋ FAB tile) — never a parallel composer.
  const addSheet = useAddSheet()
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
  // The picked face. An addressed mot shows only to ITS face; at rest (Maisonnée) nobody
  // sees one — the dot on the face row is how it announces itself. The toddler lens
  // hears its addressed mots as « un mot pour toi » tiles, so its fridge stays family-wide.
  const { memberId: face } = useProfile()
  // « Boîte aux lettres » (C, 2026-09-29): the way family OUTSIDE the house leaves a mot —
  // and it lands right here. The door sits on the card its mots arrive on; it opens the
  // one guest-link form with the box already chosen. Minting a link is the operator's.
  const { signedIn } = useAuth()
  const canBox = variant === 'notes' && !ro && !toddler && signedIn
  const mine = (n: NoteRow) => n.for_member_id == null || (!toddler && face != null && n.for_member_id === face)
  const waitsForMe = (n: NoteRow) => n.for_member_id != null && n.for_member_id === face && n.opened_at == null
  // « Tout effacer » (tidy seam #1) rides the shared deferred-removal store: the
  // batch hides NOW, the N dismiss writes wait behind ONE undo toast, and the
  // board poll can't resurrect a note mid-undo. Keyed on BOARD_KEY like the list.
  const removal = useDeferredRemoval(BOARD_KEY)
  const shown = removal.visible(
    notes.filter(mine).filter((n) => (variant === 'drawings' ? isDrawing(n) : variant === 'notes' ? !isDrawing(n) : true)),
  )
  // « Garder »: onto the Souvenirs shelf (and back). A kept paper outlives being taken
  // down — the server keeps its media for the shelf — so no confirm is needed to keep one.
  const toggleKeep = (n: { id: string; saved_at?: number | null }) =>
    void write('notes', { method: 'PATCH', body: { id: n.id, saved: !n.saved_at }, affectedKeys: [BOARD_KEY, MOTS_KEY] }).catch(() => {})
  // Opening a mot that waits on YOUR face: first open wins server-side (idempotent), the
  // dot clears on every device. Its words are already on the paper — opening is the stamp.
  const openMot = (n: NoteRow) =>
    void write('notes', { method: 'PATCH', body: { id: n.id, opened: true }, affectedKeys: [BOARD_KEY, MOTS_KEY] }).catch(() => {})
  const shelfBadge = (n: NoteRow) =>
    ro || toddler ? null : (
      <button
        type="button"
        className={'note-card__keep-badge note-card__shelf-badge' + (n.saved_at ? ' is-done' : '')}
        onClick={() => toggleKeep(n)}
        aria-pressed={!!n.saved_at}
        aria-label={n.saved_at ? t.mots.kept : t.mots.keep}
        title={n.saved_at ? t.mots.kept : t.mots.keep}
      >
        <Icon name="push-pin-bold" size={14} />
      </button>
    )
  const toLine = (n: NoteRow) => (n.for_member_id ? <span className="note-card__from mono">{t.mots.forYou}</span> : null)
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
    // first, guarding an accidental tap from silently losing the attachment. Its write
    // then fires at once (optimistic drop + persist; queues offline, idempotent).
    if (n.media_key) {
      if (!(await confirm({ message: t.notes.dismissMediaConfirm, tone: 'danger' }))) return
      void write('notes', {
        method: 'DELETE',
        body: { id: n.id },
        affectedKeys: [BOARD_KEY],
        optimistic: (qc) =>
          qc.setQueryData<BoardData>(BOARD_KEY, (d) => (d ? { ...d, notes: d.notes.filter((x) => x.id !== n.id) } : d)),
      }).catch(() => {})
      return
    }
    // A TEXT note rides the same held, undoable clear as « Tout effacer » (ACTIONS.md
    // Wave B: the single dismiss was the only board delete with NO undo tier — a
    // toddler tap-to-clear or a parent mis-tap silently ate the note). Deferred, so
    // no poll can flash it back mid-undo, and undo simply cancels the held DELETE.
    removal.remove([n.id], t.notes.clearedN(1), () =>
      write('notes', { method: 'DELETE', body: { id: n.id }, affectedKeys: [BOARD_KEY] }).catch(() => {}),
    )
  }

  // Nothing to show and nothing being edited — render nothing. The trailing
  // `action` (the gallery door) keeps the section alive even with zero current
  // drawings, since saved drawings live on in the gallery regardless — which is why
  // the « Dessins » card never reports itself empty, and defaults to mode 'always'.
  const outbox = useOutbox(face, variant !== 'drawings' && !toddler && !ro)
  const empty = !shown.length && !draw.editing && !creating && !action && !outbox.rows.length
  useReportEmpty(empty)
  if (empty) return null

  // The strip's own quick-add: parent lens (drawings variant is never toddler) can
  // start a NEW drawing right here, not only from the ＋ "Note rapide" sheet. Hidden
  // for a read-only guest and when R2 is unbound (503 surfaced on a prior save).
  const canDraw = variant === 'drawings' && !ro && !drawHidden

  return (
    <section className={'notes' + (toddler ? ' notes--kid' : '') + (variant === 'drawings' ? ' notes--drawings' : '')} aria-label={title}>
      <div className="notes__head mono">
        {help?.active && variant !== 'drawings' ? (
          <button type="button" className="help-title" onClick={() => help.pick('mots', () => {})()} title={t.help.learnMore}>
            <InlineIcon name="push-pin-bold" /> {title}
          </button>
        ) : (
          <span aria-hidden="true">
            <InlineIcon name={variant === 'drawings' ? 'paint-brush-bold' : 'push-pin-bold'} /> {title}
          </span>
        )}
        <span className="notes__head-actions">
          {/* « Tout effacer » — one tap empties the strip, one toast undoes it.
              Writes, so hidden from a guest; parent lens only (the toddler tap-to-
              clear stays per-note); pointless under two notes. */}
          {!ro && !toddler && shown.length > 1 && (
            <button type="button" className="notes__clear-all" onClick={clearAll}>
              <InlineIcon name="broom-bold" size={13} /> {t.notes.clearAll}
            </button>
          )}
          {/* Top-right ＋ — the widget's own reachable door to « Note rapide »
              (writes, so guest-hidden; toddler adds nothing; the drawings strip
              already has its own draw quick-add below). */}
          {!ro && !toddler && variant === 'notes' && (
            <button
              type="button"
              className="notes__add"
              onClick={() => addSheet.open('note')}
              aria-label={t.capture.quick}
              title={t.capture.quick}
            >
              <Icon name="plus-bold" size={14} />
            </button>
          )}
        </span>
      </div>
      {help && variant !== 'drawings' ? help.bubbleFor('mots') : null}
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
          // How long it has been on the fridge (bmad/12 #25) — but ONLY once it has
          // been there a full day. A stamp on every note would be noise on a surface
          // whose whole job is to be glanced at: what you actually want to know is
          // « ça traîne depuis quand, ça ? », and that question doesn't exist for
          // something written this morning. Client-side from created_at; there is no
          // origin marker to show (that would need a column — out of scope).
          const ageSec = nowSec - n.created_at
          const age =
            ageSec >= 86400 ? (
              <span className="note-card__age mono">{formatAgo(n.created_at * 1000, lang, nowSec * 1000)}</span>
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
                {toLine(n)}
                {from}
                {age}
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
                {shelfBadge(n)}
              </div>
            )
          }

          // Guest + parent lens: an inert text card — no clear write, no ✕.
          if (ro && !toddler) {
            return (
              <div key={n.id} className="note-card" style={css}>
                <span className="note-card__text">{n.text}</span>
                {from}
                {age}
              </div>
            )
          }
          // Toddler: the whole paper is one button — read it aloud (helping read the fridge).
          if (toddler) {
            return (
              <button key={n.id} type="button" className="note-card" style={css} onClick={() => speak(n.text)} aria-label={n.text}>
                <span className="note-card__text">{n.text}</span>
                {from}
                {age}
              </button>
            )
          }
          // Parent: a tap takes it down (undoable) — or, for a mot still waiting on YOUR
          // face, OPENS it. The keep badge sits BESIDE that tap target, never inside it (a
          // control inside a control — nested-interactive.test).
          const waiting = waitsForMe(n)
          return (
            <div
              key={n.id}
              className={'note-card note-card--paper' + (waiting ? ' note-card--waiting' : '')}
              style={css}
            >
              <button
                type="button"
                className="note-card__tap"
                onClick={() => (waiting ? openMot(n) : dismiss(n))}
                aria-label={waiting ? `${n.text} — ${t.mots.forYou}` : `${n.text} — ${t.notes.clear}`}
              >
                <span className="note-card__text">{n.text}</span>
                <span className="note-card__clear" aria-hidden="true">
                  <Icon name={waiting ? 'envelope-bold' : 'x-bold'} size={14} />
                </span>
              </button>
              {toLine(n)}
              {from}
              {age}
              {shelfBadge(n)}
            </div>
          )
        })}
        {/* Trailing actions — the strip's own quick-add (a new drawing, same DrawPad
            + POST as the ＋ sheet) and the door to the lasting collection ("La
            galerie"). Grouped into ONE compact cluster that trails the cards on a
            wide tablet and wraps neatly under them on a phone, never claiming its
            own row. */}
        {(canDraw || action || canBox) && (
          <div className="notes__action">
            {canBox && (
              <Chip to="/settings?tab=settings&focus=guestLinks&kind=postbox" icon="envelope-bold">
                {t.mots.postboxDoor}
              </Chip>
            )}
            {canDraw && (
              <Chip onClick={() => setCreating(true)} icon="pencil-simple-bold">
                {t.memo.draw}
              </Chip>
            )}
            {action}
          </div>
        )}
      </div>
      {outbox.rows.length > 0 && (
        <Disclosure label={t.mots.sentGroup} defaultOpen={!shown.length}>
          {outbox.rows}
        </Disclosure>
      )}
      {outbox.modal}
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

// « Ce que j'ai laissé » — the picked face's own outbox: the mots they left FOR someone
// (or scheduled for later), whether each has been seen, and a « Plus tard » still to come
// that can be moved or pulled back before it lands. Presence + per-item status, never a
// tally. Reads the RAW mots (lib/mots) — a scheduled paper is not on the fridge yet, so
// the board payload does not carry it. Opening one of YOUR mots never stamps it opened:
// the author looking at their outbox is not the recipient hearing it.
function useOutbox(face: string | null, enabled: boolean): { rows: ReactNode[]; modal: ReactNode } {
  const t = useT()
  const fn = t.mots
  const { lang } = useLang()
  const write = useWrite()
  const detail = useEntityDetail()
  const removal = useDeferredRemoval(MOTS_KEY)
  const [reschedule, setReschedule] = useState<Mot | null>(null)
  const all = useAllMots()
  const { data } = useQuery({ queryKey: MEMBERS_KEY, queryFn: () => api<{ members: OperatorMember[] }>('members') })
  const members = data?.members ?? []
  if (!enabled) return { rows: [], modal: null }
  const nowSec = Date.now() / 1000
  const sent = removal.visible(sentMots(all, face))
  const nameOf = (id: string | null) => members.find((m) => m.id === id)?.display_name ?? null
  const status = (m: Mot) => {
    const to = m.member_id === null ? fn.forMaisonnee : fn.to(nameOf(m.member_id) ?? '?')
    const st = isScheduled(m, nowSec) ? fn.scheduledFor(formatDayTime(m.surface_at!, lang)) : m.opened_at ? fn.statusSeen : fn.statusWaiting
    return [to, st].join(' · ')
  }
  const remove = (m: Mot) =>
    removal.remove([m.id], fn.deleted, () => write('notes', { method: 'DELETE', body: { id: m.id }, affectedKeys: [MOTS_KEY, BOARD_KEY] }))
  const open = (m: Mot) => {
    const scheduled = isScheduled(m, nowSec)
    detail.open(
      buildMot(m, { t, lang, members }, {
        saved: !!m.saved_at,
        onReschedule: scheduled ? () => setReschedule(m) : undefined,
        onDelete: () => remove(m),
        whenOverride: scheduled ? fn.scheduledFor(formatDayTime(m.surface_at!, lang)) : undefined,
      }),
    )
  }
  const rows = sent.map((m) => (
    <Act
      key={'sent-' + m.id}
      cat="cercle"
      color={members.find((x) => x.id === m.member_id)?.colour ?? undefined}
      icon={isScheduled(m, nowSec) ? 'clock-bold' : 'envelope-bold'}
      title={motLabel(m, fn)}
      who={status(m)}
      onOpen={() => open(m)}
    />
  ))
  const modal = (
    <Modal open={!!reschedule} onClose={() => setReschedule(null)} title={fn.rescheduleTitle} className="cnote-memo">
      {reschedule && <RescheduleBody mot={reschedule} onDone={() => setReschedule(null)} />}
    </Modal>
  )
  return { rows, modal }
}
