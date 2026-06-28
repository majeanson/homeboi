import { useEffect, useRef, useState } from 'react'
import { DECK_EMOJIS, type DeckCard } from '../lib/routineTemplates'
import { useT } from '../i18n'
import { usePointerDnd, DragGhost } from '../lib/dnd'
import { useOnline } from '../lib/online'
import { sideInsert, sideRemove, sideMove, sideSet, alignSide } from '../lib/parallelArray'
import { imgUrl, MAX_UPLOAD_BYTES } from '../lib/image'
import { uploadMedia, MediaUnavailableError } from '../lib/uploadMedia'
import { EditField } from './EditField'
import { DrawPad } from './DrawPad'
import { Icon, InlineIcon } from './Icon'

// Edit a routine's deck of picture cards: each card is an emoji + a word. Tap
// the emoji to switch it from a palette, type the word, reorder by dragging the
// handle (touch-friendly — works on the wall tablet) or the ↑/↓ buttons.
// Controlled: the parent owns the cards array.
//
// Feature #17 A — per-card PARENT-VOICE narration clips. When the parent passes
// `narration` + `onNarrationChange`, each card grows a 🎙️ control (record / play /
// re-record / clear). `narration` is a string[] kept rigorously PARALLEL to
// `cards` — same length, same index — so a clip never mis-attaches to the wrong
// card across add / remove / reorder (the sync ops live in lib/parallelArray, the
// deck just calls them on both arrays together). The clip is the parent's own
// voice reading the card aloud for a pre-reader; the kid view plays it on tap and
// falls back to on-device TTS when a slot is empty (or R2 is unset).
//
// Feature #17 C — per-card PHOTOS, the same parallel-array discipline as the
// clips. When the parent passes `photo` + `onPhotoChange`, each card grows a 📷
// control (add / change / remove) and the kid view shows the photo in place of
// the emoji. `photo` is a string[] kept rigorously PARALLEL to `cards` too, so a
// photo never mis-attaches across add / remove / reorder — every deck mutation
// moves cards, clips, and photos together.
export function CardDeckEditor({
  cards,
  onChange,
  narration,
  onNarrationChange,
  photo,
  onPhotoChange,
}: {
  cards: DeckCard[]
  onChange: (cards: DeckCard[]) => void
  narration?: string[]
  onNarrationChange?: (narration: string[]) => void
  photo?: string[]
  onPhotoChange?: (photo: string[]) => void
}) {
  const t = useT()
  const [paletteFor, setPaletteFor] = useState<number | null>(null)
  // R2 audio storage off (the upload 503'd once) → hide every clip control for
  // the rest of this edit, the same way PhotosSection hides on a 503. The kid
  // view already falls back to TTS, so nothing breaks — the control just isn't
  // offered when it can't do anything.
  const [audioOff, setAudioOff] = useState(false)
  // R2 photo storage off (a photo upload 503'd) → hide every photo control too;
  // the kid view falls back to the card's emoji.
  const [photoOff, setPhotoOff] = useState(false)
  const clips = onNarrationChange ? alignSide(narration, cards.length) : null
  const photos = onPhotoChange ? alignSide(photo, cards.length) : null

  // Mutate cards and the parallel media arrays TOGETHER so an index never drifts.
  // A `null` side means "leave that array untouched" (a clip-only edit doesn't
  // disturb photos and vice-versa); a deck change passes BOTH so they ride along.
  const commit = (nextCards: DeckCard[], nextClips: string[] | null, nextPhotos: string[] | null) => {
    onChange(nextCards)
    if (nextClips && onNarrationChange) onNarrationChange(nextClips)
    if (nextPhotos && onPhotoChange) onPhotoChange(nextPhotos)
  }
  const update = (i: number, patch: Partial<DeckCard>) =>
    onChange(cards.map((c, idx) => (idx === i ? { ...c, ...patch } : c)))
  const remove = (i: number) => {
    commit(
      cards.filter((_, idx) => idx !== i),
      clips ? sideRemove(clips, i) : null,
      photos ? sideRemove(photos, i) : null,
    )
    setPaletteFor(null)
  }
  const add = () =>
    commit(
      [...cards, { icon: '⭐', label: '' }],
      clips ? sideInsert(clips) : null,
      photos ? sideInsert(photos) : null,
    )
  const move = (from: number, to: number) => {
    if (to < 0 || to >= cards.length || from === to) return
    const next = [...cards]
    const [m] = next.splice(from, 1)
    next.splice(to, 0, m)
    commit(next, clips ? sideMove(clips, from, to) : null, photos ? sideMove(photos, from, to) : null)
  }
  const setClip = (i: number, key: string) => {
    if (clips) commit(cards, sideSet(clips, i, key), null)
  }
  const setPhoto = (i: number, key: string) => {
    if (photos) commit(cards, null, sideSet(photos, i, key))
  }

  // Reorder by dragging a card's grip onto another card (commit on drop, not a
  // live swap) — the same pointer DnD the meal plan uses, so it works on touch.
  const dnd = usePointerDnd({
    onDrop: (from, to) => move(Number(from), Number(to)),
    canDrop: (from, to) => from !== to,
  })

  return (
    <div className="deck">
      {cards.map((card, i) => (
        <div key={i} className="deck__row">
          <div
            data-dnd-zone={String(i)}
            className={
              'deck__card' +
              (dnd.activeId === String(i) ? ' is-dragging' : '') +
              (dnd.over === String(i) ? ' dnd-over' : '')
            }
          >
            <EditField
              value={card.label}
              onChange={(v) => update(i, { label: v })}
              placeholder={t.operator.cardWord}
              ariaLabel={t.operator.cardWord}
              clearable={false}
              leading={
                <>
                  <span
                    className="deck__handle dnd-grip mono"
                    data-dnd-grip=""
                    onPointerDown={(e) => dnd.start(String(i), card.label || t.operator.cardWord, e)}
                    role="button"
                    aria-label={t.operator.dragHint}
                    title={t.operator.dragHint}
                  >
                    ⠿
                  </span>
                  <button
                    type="button"
                    className={'deck__emoji' + (photos?.[i] ? ' deck__emoji--photo' : '')}
                    onClick={() => setPaletteFor(paletteFor === i ? null : i)}
                    aria-label={t.operator.emojiPick}
                  >
                    {/* A set photo wins over the emoji here too, so the editor
                        shows exactly what the kid + parent surfaces will show
                        (feature #17 C). Tapping still opens the emoji palette —
                        the emoji is the fallback when no photo is attached. */}
                    {photos?.[i] ? (
                      <img className="deck__emoji-photo" src={imgUrl(photos[i])} alt="" />
                    ) : (
                      card.icon || '⭐'
                    )}
                  </button>
                </>
              }
              reorder={{
                onUp: () => move(i, i - 1),
                onDown: () => move(i, i + 1),
                upDisabled: i === 0,
                downDisabled: i === cards.length - 1,
              }}
              onDelete={() => remove(i)}
              deleteLabel={t.operator.removeCard}
            />
          </div>
          {/* Per-card aids — the tap-to-start timer (needs no R2), the parent-voice
              clip (#17 A), the photo (#17 C) and "draw a step" all live in ONE
              indented row under the card so the affordances read as a single group
              and wrap together instead of as separate stacked strips. The timer
              always shows; the media controls hide where R2 audio/photo is unset. */}
          <div className="deck__media">
            <TimerControl
              seconds={card.seconds}
              onChange={(s) => update(i, { seconds: s || undefined })}
            />
            {clips && !audioOff && (
                <ClipControl
                  clipKey={clips[i]}
                  cardLabel={card.label || card.icon}
                  onUploaded={(key) => setClip(i, key)}
                  onClear={() => setClip(i, '')}
                  onAudioOff={() => setAudioOff(true)}
                />
              )}
              {/* A photo (or a drawing — a drawn step IS the card photo) replaces the
                  emoji on the kid surface, so a pre-reader spots the real toothbrush
                  / their own drawing, not a generic glyph. */}
              {photos && !photoOff && (
                <PhotoControl
                  photoKey={photos[i]}
                  onUploaded={(key) => setPhoto(i, key)}
                  onClear={() => setPhoto(i, '')}
                  onPhotoOff={() => setPhotoOff(true)}
                />
              )}
            </div>
          {paletteFor === i && (
            <div className="deck__palette">
              {DECK_EMOJIS.map((e) => (
                <button
                  key={e}
                  type="button"
                  className="deck__palette-emoji"
                  onClick={() => {
                    update(i, { icon: e })
                    setPaletteFor(null)
                  }}
                >
                  {e}
                </button>
              ))}
            </div>
          )}
        </div>
      ))}
      <button type="button" className="btn btn--ghost mono deck__add" onClick={add}>
        <InlineIcon name="plus-bold" /> {t.operator.addCard}
      </button>
      <DragGhost ghost={dnd.ghost} />
    </div>
  )
}

// Preset per-step durations the ⏱ control cycles through: off, then 30 s and
// 1–5 min — the calm "tap to cycle" the time-of-day chip uses, no menu to open.
// The duration lives ON the card (`seconds`), so unlike clips/photos it needs no
// parallel array and no R2 — every household can set a timer.
const TIMER_PRESETS = [0, 30, 60, 120, 180, 300]
// "30 s", "1 min", "2 min" — readable in both registers (min/s are universal).
const fmtDur = (s: number) => (s % 60 === 0 ? `${s / 60} min` : `${s} s`)

function TimerControl({ seconds = 0, onChange }: { seconds?: number; onChange: (s: number) => void }) {
  const t = useT()
  const isOn = seconds > 0
  // indexOf a non-preset (legacy custom) value is -1; +1 lands on 0 = off, so one
  // more tap clears an odd value and re-enters the preset cycle cleanly.
  const cycle = () => onChange(TIMER_PRESETS[(TIMER_PRESETS.indexOf(seconds) + 1) % TIMER_PRESETS.length])
  return (
    <div className="deck__timer mono">
      <button
        type="button"
        className={'deck__clip-btn' + (isOn ? ' is-on' : '')}
        onClick={cycle}
        aria-label={t.routines.timer}
      >
        <InlineIcon name="timer-bold" size={15} /> {isOn ? fmtDur(seconds) : t.routines.timer}
      </button>
      {isOn && (
        <button
          type="button"
          className="deck__clip-btn deck__clip-del"
          onClick={() => onChange(0)}
          aria-label={t.routines.timerOff}
        >
          <Icon name="x-bold" size={14} />
        </button>
      )}
    </div>
  )
}

// One card's parent-voice clip control (feature #17 A). Two shapes:
//   • empty → a 🎙️ "record" button (and, while recording, a stop button + a dot)
//   • saved → ▶ play · re-record · ✕ clear
// Recording uses the MediaRecorder API; on stop the blob is uploaded to
// /api/routine-audio (R2) and the returned key is handed up. A 503 (R2 unbound)
// tells the deck to hide every clip control; any other failure shows a calm
// inline line and keeps the card fully usable (TTS still covers it).
function ClipControl({
  clipKey,
  cardLabel,
  onUploaded,
  onClear,
  onAudioOff,
}: {
  clipKey: string
  cardLabel: string
  onUploaded: (key: string) => void
  onClear: () => void
  onAudioOff: () => void
}) {
  const t = useT()
  const online = useOnline()
  const [recording, setRecording] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(false)
  const recRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  // Always release the mic + any playing clip when the control unmounts (the card
  // was removed, or the form closed mid-record) — never leave the red dot on.
  useEffect(
    () => () => {
      stopStream()
      audioRef.current?.pause()
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  function stopStream() {
    try {
      streamRef.current?.getTracks().forEach((tr) => tr.stop())
    } catch {
      /* already stopped */
    }
    streamRef.current = null
  }

  async function startRecording() {
    if (busy || recording) return
    setErr(false)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      const rec = new MediaRecorder(stream)
      const chunks: BlobPart[] = []
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data)
      }
      rec.onstop = () => {
        stopStream()
        setRecording(false)
        const blob = new Blob(chunks, { type: rec.mimeType || 'audio/webm' })
        if (blob.size > 0) void upload(blob)
      }
      recRef.current = rec
      rec.start()
      setRecording(true)
    } catch {
      // Mic permission denied / no mic — a calm note, card still works via TTS.
      stopStream()
      setErr(true)
    }
  }

  function stopRecording() {
    try {
      recRef.current?.stop()
    } catch {
      stopStream()
      setRecording(false)
    }
  }

  async function upload(blob: Blob) {
    setBusy(true)
    setErr(false)
    try {
      // Audio rides as-is (no image resize); the returned R2 key is the clip.
      onUploaded(await uploadMedia('routine-audio', blob, { resize: false }))
    } catch (e) {
      // R2 unbound → hide the whole feature (it can't store anything). Anything
      // else (offline, server hiccup) → a calm inline note; the card is unharmed.
      if (e instanceof MediaUnavailableError) onAudioOff()
      else setErr(true)
    } finally {
      setBusy(false)
    }
  }

  function play() {
    if (!clipKey) return
    try {
      audioRef.current?.pause()
      const audio = new Audio(`/api/img/${clipKey}`)
      audioRef.current = audio
      void audio.play().catch(() => setErr(true))
    } catch {
      setErr(true)
    }
  }

  // No mic API at all (locked-down webview) → don't offer a dead record button,
  // but still let a previously-recorded clip be played / cleared.
  const canRecord =
    typeof navigator !== 'undefined' &&
    !!navigator.mediaDevices?.getUserMedia &&
    typeof MediaRecorder !== 'undefined'
  if (!canRecord && !clipKey) return null

  return (
    <div className="deck__clip mono">
      {clipKey ? (
        <>
          <button type="button" className="deck__clip-btn is-on" onClick={play} aria-label={t.routines.clipPlay}>
            <Icon name="play-bold" size={15} /> {t.routines.clipRecorded}
          </button>
          {canRecord && (
            <button
              type="button"
              className="deck__clip-btn"
              onClick={startRecording}
              disabled={busy || !online}
              aria-label={t.routines.recordClip}
            >
              <Icon name="microphone-bold" size={15} /> {t.routines.clipRecord}
            </button>
          )}
          <button
            type="button"
            className="deck__clip-btn deck__clip-del"
            onClick={onClear}
            aria-label={t.routines.clipRemove}
          >
            <Icon name="x-bold" size={14} />
          </button>
        </>
      ) : recording ? (
        <button
          type="button"
          className="deck__clip-btn is-recording"
          onClick={stopRecording}
          aria-label={t.routines.clipStop}
        >
          <span className="deck__clip-dot" aria-hidden="true" /> {t.routines.clipStop}
        </button>
      ) : (
        <button
          type="button"
          className="deck__clip-btn"
          onClick={startRecording}
          disabled={busy || !online}
          aria-label={t.routines.recordClip}
          title={cardLabel}
        >
          <Icon name="microphone-bold" size={15} /> {busy ? '…' : t.routines.recordClip}
        </button>
      )}
      {!online && !clipKey && <span className="deck__clip-note">{t.routines.clipOnline}</span>}
      {err && <span className="deck__clip-note deck__clip-note--err">{t.routines.clipFail}</span>}
    </div>
  )
}

// One card's photo control (feature #17 C). With a photo: a thumbnail + change /
// remove. Without: a single 📷 add button. The picked file is resized small
// client-side (PHOTO_MAX, like every other upload) and sent to the sibling
// /api/routine-card-photo endpoint; the returned R2 key is handed up. A 503 (R2
// unbound) tells the deck to hide every photo control; any other failure leaves
// the card un-photographed and never blocks the form — the emoji still covers it.
function PhotoControl({
  photoKey,
  onUploaded,
  onClear,
  onPhotoOff,
}: {
  photoKey: string
  onUploaded: (key: string) => void
  onClear: () => void
  onPhotoOff: () => void
}) {
  const t = useT()
  const online = useOnline()
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(false)
  // The in-place draw pad (#14 → #17 C). A drawn step is just a card photo: the
  // same DrawPad the fridge note uses, but its PNG uploads to the card-photo slot
  // instead of seeding a brand-new routine. Editing a routine no longer means the
  // ONLY way in for a drawing is "fridge note → make a routine".
  const [drawing, setDrawing] = useState(false)

  // Upload an image (a picked file OR a drawing's PNG) to the card-photo slot.
  // Resized small client-side like every other photo; a 503 means R2 is unbound,
  // so we tell the deck to hide the whole photo/draw control (it can't store).
  async function upload(input: Blob) {
    setBusy(true)
    setErr(false)
    try {
      // A picked file OR a drawing's PNG; resized small + capped like every photo.
      const key = await uploadMedia('routine-card-photo', input, { maxBytes: MAX_UPLOAD_BYTES, filename: 'dessin.png' })
      onUploaded(key)
    } catch (e) {
      // R2 unbound → hide the whole control; an un-shrinkable too-large blob or any
      // other failure → a calm inline note (setErr), the card unharmed.
      if (e instanceof MediaUnavailableError) onPhotoOff()
      else setErr(true)
    } finally {
      setBusy(false)
    }
  }

  // "Dessiner" — drawing offline can't upload (the card-photo POST needs the
  // server), so it follows the same online gate as the photo picker.
  const drawBtn = (
    <button
      type="button"
      className={'deck__clip-btn' + (busy || !online ? ' is-disabled' : '')}
      disabled={busy || !online}
      onClick={() => setDrawing(true)}
    >
      <InlineIcon name="paint-brush-bold" size={15} /> {photoKey ? t.routines.cardDrawRedo : t.routines.cardDraw}
    </button>
  )

  return (
    <div className="deck__photo">
      {photoKey ? (
        <>
          <img className="deck__photo-thumb" src={imgUrl(photoKey)} alt="" />
          <label className={'deck__clip-btn' + (busy || !online ? ' is-disabled' : '')}>
            <InlineIcon name="camera-bold" size={15} /> {busy ? '…' : t.routines.cardPhotoChange}
            <input
              type="file"
              accept="image/*"
              hidden
              disabled={busy || !online}
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) void upload(f)
                e.target.value = ''
              }}
            />
          </label>
          {drawBtn}
          <button
            type="button"
            className="deck__clip-btn deck__clip-del"
            onClick={onClear}
            aria-label={t.routines.cardPhotoRemove}
          >
            <Icon name="x-bold" size={14} />
          </button>
        </>
      ) : (
        <>
          <label className={'deck__clip-btn' + (busy || !online ? ' is-disabled' : '')}>
            <InlineIcon name="image-square-bold" size={15} /> {busy ? '…' : t.routines.cardPhotoAdd}
            <input
              type="file"
              accept="image/*"
              hidden
              disabled={busy || !online}
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) void upload(f)
                e.target.value = ''
              }}
            />
          </label>
          {drawBtn}
        </>
      )}
      {!online && !photoKey && <span className="deck__clip-note">{t.routines.clipOnline}</span>}
      {err && <span className="deck__clip-note deck__clip-note--err">{t.routines.clipFail}</span>}
      {/* The draw pad is a full-screen overlay; on save its PNG becomes this card's
          photo. Scene JSON is ignored — a card photo stores only the R2 image key. */}
      <DrawPad
        open={drawing}
        draftId="routine-card"
        onCancel={() => setDrawing(false)}
        onSave={(png) => {
          setDrawing(false)
          void upload(png)
        }}
      />
    </div>
  )
}
