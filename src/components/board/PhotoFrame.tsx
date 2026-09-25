import { useEffect, useState } from 'react'
import { usePhotos, useKeepPhoto } from '../../lib/photoGallery'
import { isGuest } from '../../lib/device'
import { imgUrl } from '../../lib/image'
import { useT } from '../../i18n'
import { useReportEmpty } from '../../lib/useReportEmpty'
import { ZoomableImg } from '../ZoomableImg'
import { Icon } from '../Icon'
import { useCardLens } from './CardLens'
import { CardMini } from './BoardCard'

// A calm family-photo frame for the wall: one photo at a time, a slow cross-fade
// every 30s. Tapping the photo opens it full-screen via the shared ZoomableImg
// (pinch + pan); a small shuffle button jumps to a random other photo. Silent
// no-op when there are no photos (or R2 is off).
export function PhotoFrame() {
  const t = useT()
  const lens = useCardLens()
  const { data } = usePhotos({ poll: true })
  const keep = useKeepPhoto()
  const photos = data?.photos ?? []
  const [idx, setIdx] = useState(0)
  useEffect(() => {
    if (photos.length < 2) return
    const id = setInterval(() => setIdx((i) => (i + 1) % photos.length), 30000)
    return () => clearInterval(id)
  }, [photos.length])
  useReportEmpty(!photos.length)
  if (!photos.length) return null
  const cur = idx % photos.length
  const p = photos[cur]
  // The compact lens (see CardLens.tsx): a halved « Photo du jour » is a MEDIA mini —
  // just the photo, no shuffle, no zoom (both wait for the tap-to-grow).
  if (lens && lens.compact && !lens.expanded) {
    return (
      <CardMini
        className="cardmini--media"
        label={t.boardCard.photos}
        onExpand={lens.expand}
        body={<img key={p!.id} className="cardmini__photo" src={imgUrl(p!.key)} alt="" loading="lazy" />}
      />
    )
  }
  // Jump to a random photo OTHER than the one showing (no-op with a single photo).
  const shuffle = () => {
    if (photos.length < 2) return
    let next = cur
    while (next === cur) next = Math.floor(Math.random() * photos.length)
    setIdx(next)
  }
  // key=id so React remounts the <img>, re-triggering the gentle fade per photo.
  return (
    <div className="photo-frame">
      {/* The way back once grown to full width — top-LEFT, clear of the ⟳ shuffle. */}
      {lens?.expanded && (
        <button
          type="button"
          className="sec-label__reduce photo-frame__reduce"
          onClick={(e) => {
            e.stopPropagation()
            lens.collapse()
          }}
          aria-expanded="true"
          aria-label={t.board.collapseCard(t.boardCard.photos)}
          title={t.board.collapseCard(t.boardCard.photos)}
        >
          <Icon name="caret-up-bold" size={14} />
        </button>
      )}
      <ZoomableImg key={p.id} src={imgUrl(p.key)} />
      {/* « Garder » (C1): keep the photo on show for the « Souvenirs » shelf — a toggle,
          its pressed state the whole confirmation. Bottom-right, clear of the ⟳ shuffle. */}
      {!isGuest() && (
        <button
          type="button"
          className={'photo-frame__keep' + (p.saved_at ? ' is-done' : '')}
          onClick={() => void keep(p.id, !p.saved_at).catch(() => {})}
          aria-pressed={!!p.saved_at}
          aria-label={p.saved_at ? t.mots.kept : t.mots.keep}
          title={p.saved_at ? t.mots.kept : t.mots.keep}
        >
          <Icon name="hand-heart-bold" size={18} />
        </button>
      )}
      {photos.length > 1 && (
        <button
          type="button"
          className="photo-frame__shuffle"
          onClick={shuffle}
          aria-label={t.board.shufflePhoto}
          title={t.board.shufflePhoto}
        >
          <Icon name="repeat-bold" size={18} />
        </button>
      )}
    </div>
  )
}
