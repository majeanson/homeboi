import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useT, useLang } from '../i18n'
import { api } from '../lib/api'
import { live } from '../lib/query'
import { useAudience } from '../lib/audience'
import { isGuest } from '../lib/device'
import { imgUrl } from '../lib/image'
import { useSceneClose, useEscapeKey } from '../lib/sceneNav'
import { useGallery, useSaveToGallery, useUpdateInGallery, useDeleteFromGallery, usePinToFridge } from '../lib/drawingGallery'
import { useDrawingToRoutine } from '../lib/drawingToRoutine'
import { useDrawEdit } from '../lib/drawEdit'
import { useConfirm } from '../lib/confirm'
import { MEMBERS_KEY } from '../lib/queryKeys'
import { SceneHead } from '../components/SceneHead'
import { EmptyState } from '../components/EmptyState'
import { Avatar } from '../components/Avatar'
import { Icon } from '../components/Icon'
import { DrawPad } from '../components/DrawPad'
import { DrawEditChoice } from '../components/DrawEditChoice'
import { ZoomableImg } from '../components/ZoomableImg'
import { ageAt, groupByYear } from '../lib/year'
import type { GalleryDrawing } from '../lib/drawingGallery'
import type { OperatorMember } from '../lib/members'

// /drawings — the drawing COLLECTION / gallery (#14). "Mes dessins": a lasting wall
// of kept drawings, especially a toddler's growing collection (big tap targets,
// tap any to keep drawing on it). Parents get the same wall plus delete. Adding or
// continuing opens the full DrawPad and saves a fresh entry (non-destructive — the
// original stays). A read-only guest can browse but not add/remove.
export function DrawingGalleryPage() {
  const t = useT()
  const { lang } = useLang()
  const close = useSceneClose('/board')
  useEscapeKey(close)
  const { audience } = useAudience()
  const toddler = audience === 'toddler'
  const ro = isGuest()
  const { data } = useGallery()
  // Who drew it + when — the gallery should credit the author and the date, not just
  // show anonymous works. Members give us the face/name behind each drawing's member_id.
  // The FULL member rows (/api/members) — birthday included, so a drawing can
  // credit the child's age at the time (B-11).
  const { data: membersData } = useQuery({ queryKey: MEMBERS_KEY, queryFn: () => api<{ members: OperatorMember[] }>('members'), ...live })
  const members = membersData?.members ?? []
  const loc = lang === 'fr' ? 'fr-CA' : 'en-CA'
  const fmtDate = (sec: number) => new Date(sec * 1000).toLocaleDateString(loc, { day: 'numeric', month: 'short', year: 'numeric' })
  const save = useSaveToGallery()
  const update = useUpdateInGallery()
  const remove = useDeleteFromGallery()
  const toRoutine = useDrawingToRoutine()
  const pinToFridge = usePinToFridge()
  const confirm = useConfirm()
  // Re-opening a kept drawing (#14): the shared chooser (modify / copy / calquer) and
  // the pad load props it resolves to. `draw.isNew` = copy/trace (→ a new gallery row).
  const draw = useDrawEdit<GalleryDrawing>()
  // The ＋ "new blank drawing" flow (no chooser — there's no original to continue).
  const [adding, setAdding] = useState(false)
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

  // Modify replaces a row in place; the ＋ flow and copy/trace keep a new one.
  async function onSaved(png: Blob, scene: string, id?: string) {
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
          <button type="button" className="btn btn--primary drawgallery__add" onClick={() => setAdding(true)}>
            <Icon name="plus-bold" size={18} /> {t.memo.draw}
          </button>
        )}
        {drawings.length === 0 ? (
          <EmptyState tone="calm">{t.memo.galleryEmpty}</EmptyState>
        ) : (
          // B-11 (bmad/09): the gallery reads as the family album — grouped by
          // YEAR once more than one year exists (a young gallery stays one calm
          // grid), each drawing crediting the child's AGE at the time when the
          // birth year is known (« Léa · 3 ans »). Pure regrouping, no new rows.
          groupByYear(drawings, (d) => d.created_at).map(([year, items]) => (
            <section key={year ?? 'all'}>
              {year != null && <h2 className="drawgallery__year mono">{year}</h2>}
              <div className={'drawgallery__grid' + (toddler ? ' drawgallery__grid--kid' : '')}>
                {items.map((d) => {
                  const author = members.find((m) => m.id === d.member_id)
                  const age = author ? ageAt(author.birthday, d.created_at) : null
                  return (
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
                        onClick={() => draw.begin(d)}
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
                    {/* Credit: who drew it (face + name, + their age then) and when. */}
                    <div className="drawgallery__meta">
                      {author && (
                        <span className="drawgallery__by">
                          <Avatar kind={author.avatar_kind} photo={author.avatar_ref} colour={author.colour} name={author.display_name} size={18} />
                          {author.display_name}
                          {age != null && <span className="drawgallery__age"> · {t.memo.ageN(age)}</span>}
                        </span>
                      )}
                      <time className="drawgallery__date">{fmtDate(d.created_at)}</time>
                    </div>
                  </div>
                  )
                })}
              </div>
            </section>
          ))
        )}
      </div>
      {/* Ask how to continue a kept drawing before opening the pad (#14): modify in
          place, an independent copy, or a faded calque. */}
      <DrawEditChoice open={draw.chooserOpen} onCancel={draw.cancelChoice} onPick={draw.pick} />
      {(adding || draw.editing) && (
        <DrawPad
          open
          toddler={toddler}
          draftId="gallery"
          {...(draw.editing ? draw.padProps! : {})}
          onCancel={() => { setAdding(false); draw.close() }}
          onSave={(png, scene) => {
            // Modify edits this row in place; ＋ new and copy/trace make a new entry.
            const id = draw.editing && !draw.isNew ? draw.editing.id : undefined
            setAdding(false)
            draw.close()
            void onSaved(png, scene, id)
          }}
          // Modifying an existing item is already in the gallery (keep:false avoids a
          // duplicate); a new / copied / traced drawing keeps a copy so it's never lost.
          onMakeRoutine={toddler ? undefined : (png, scene) => void toRoutine(png, scene, { keep: adding || draw.isNew })}
        />
      )}
    </div>
  )
}
