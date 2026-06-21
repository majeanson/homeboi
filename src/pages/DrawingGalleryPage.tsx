import { useState } from 'react'
import { useT } from '../i18n'
import { useAudience } from '../lib/audience'
import { isGuest } from '../lib/device'
import { imgUrl } from '../lib/image'
import { useSceneClose, useEscapeKey } from '../lib/sceneNav'
import { useGallery, useSaveToGallery, useUpdateInGallery, useDeleteFromGallery, usePinToFridge } from '../lib/drawingGallery'
import { useDrawingToRoutine } from '../lib/drawingToRoutine'
import { useConfirm } from '../lib/confirm'
import { SceneHead } from '../components/SceneHead'
import { EmptyState } from '../components/EmptyState'
import { Icon } from '../components/Icon'
import { DrawPad } from '../components/DrawPad'
import { ZoomableImg } from '../components/ZoomableImg'

// /drawings — the drawing COLLECTION / gallery (#14). "Mes dessins": a lasting wall
// of kept drawings, especially a toddler's growing collection (big tap targets,
// tap any to keep drawing on it). Parents get the same wall plus delete. Adding or
// continuing opens the full DrawPad and saves a fresh entry (non-destructive — the
// original stays). A read-only guest can browse but not add/remove.
export function DrawingGalleryPage() {
  const t = useT()
  const close = useSceneClose('/board')
  useEscapeKey(close)
  const { audience } = useAudience()
  const toddler = audience === 'toddler'
  const ro = isGuest()
  const { data } = useGallery()
  const save = useSaveToGallery()
  const update = useUpdateInGallery()
  const remove = useDeleteFromGallery()
  const toRoutine = useDrawingToRoutine()
  const pinToFridge = usePinToFridge()
  const confirm = useConfirm()
  // The pad: closed, or open as a fresh sheet / continuing an existing drawing (id).
  const [pad, setPad] = useState<{ open: boolean; id?: string; initial?: string; sceneUrl?: string }>({ open: false })
  // Ids freshly pinned to the fridge this session — a calm "✓ épinglé" acknowledgement
  // (the drawing stays in the gallery; pinning makes an independent board copy).
  const [pinned, setPinned] = useState<Set<string>>(new Set())
  const drawings = data?.drawings ?? []

  async function onPin(d: { media_key: string; scene_key: string | null }, id: string) {
    try {
      await pinToFridge(d.media_key, d.scene_key)
      setPinned((s) => new Set(s).add(id))
    } catch {
      /* R2 unset / offline — leave the gallery untouched */
    }
  }

  async function onSaved(png: Blob, scene: string) {
    const id = pad.id
    setPad({ open: false })
    // Continuing a kept drawing replaces it in place; the ＋ flow keeps a new one.
    await (id ? update(id, png, scene) : save(png, scene)).catch(() => {})
  }
  async function onDelete(id: string) {
    if (await confirm({ message: t.memo.galleryDelete, tone: 'danger' })) await remove(id).catch(() => {})
  }

  return (
    <div className="scene drawgallery" aria-label={t.memo.galleryTitle}>
      <SceneHead title={t.memo.galleryTitle} icon="paint-brush-bold" onClose={close} />
      <div className="scene__body drawgallery__body">
        {!ro && (
          <button type="button" className="btn btn--primary drawgallery__add" onClick={() => setPad({ open: true })}>
            <Icon name="plus-bold" size={18} /> {t.memo.draw}
          </button>
        )}
        {drawings.length === 0 ? (
          <EmptyState tone="calm">{t.memo.galleryEmpty}</EmptyState>
        ) : (
          <div className={'drawgallery__grid' + (toddler ? ' drawgallery__grid--kid' : '')}>
            {drawings.map((d) => (
              <div key={d.id} className="drawgallery__item">
                {ro ? (
                  // Read-only guest: can't open the pad, so the thumbnail IS the
                  // viewer — tap to inspect full-screen (pinch-zoom + drag to pan).
                  <ZoomableImg className="drawgallery__img" src={imgUrl(d.media_key)} alt={t.notes.drawing} />
                ) : (
                  // Parent / toddler: tap opens the pad to keep drawing on it; zoom
                  // (pinch + pan) is available there too once it's open.
                  <button
                    type="button"
                    className="drawgallery__open"
                    onClick={() => setPad({ open: true, id: d.id, initial: imgUrl(d.media_key), sceneUrl: d.scene_key ? imgUrl(d.scene_key) : undefined })}
                    aria-label={t.memo.editTitle}
                  >
                    <img src={imgUrl(d.media_key)} alt={t.notes.drawing} loading="lazy" />
                  </button>
                )}
                {!ro && (
                  <button
                    type="button"
                    className={'drawgallery__pin' + (pinned.has(d.id) ? ' is-done' : '')}
                    onClick={() => void onPin(d, d.id)}
                    aria-label={pinned.has(d.id) ? t.memo.pinnedToFridge : t.memo.pinToFridge}
                    title={pinned.has(d.id) ? t.memo.pinnedToFridge : t.memo.pinToFridge}
                  >
                    <Icon name={pinned.has(d.id) ? 'check-bold' : 'push-pin-bold'} size={14} />
                  </button>
                )}
                {!ro && !toddler && (
                  <button type="button" className="drawgallery__del" onClick={() => void onDelete(d.id)} aria-label={t.common.delete}>
                    <Icon name="trash-bold" size={14} />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
      {pad.open && (
        <DrawPad
          open
          toddler={toddler}
          initial={pad.initial}
          initialSceneUrl={pad.sceneUrl}
          onCancel={() => setPad({ open: false })}
          onSave={(png, scene) => void onSaved(png, scene)}
          // Continuing a kept item is already in the gallery (keep:false avoids a
          // duplicate); the ＋ new flow keeps a copy so it's never lost.
          onMakeRoutine={toddler ? undefined : (png, scene) => void toRoutine(png, scene, { keep: !pad.id })}
        />
      )}
    </div>
  )
}
