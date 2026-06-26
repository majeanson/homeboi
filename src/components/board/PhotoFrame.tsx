import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { live } from '../../lib/query'
import { PHOTOS_KEY } from '../../lib/queryKeys'
import { imgUrl } from '../../lib/image'
import { useT } from '../../i18n'
import { ZoomableImg } from '../ZoomableImg'
import { Icon } from '../Icon'

// A calm family-photo frame for the wall: one photo at a time, a slow cross-fade
// every 30s. Tapping the photo opens it full-screen via the shared ZoomableImg
// (pinch + pan); a small shuffle button jumps to a random other photo. Silent
// no-op when there are no photos (or R2 is off).
export function PhotoFrame() {
  const t = useT()
  const { data } = useQuery({
    queryKey: PHOTOS_KEY,
    queryFn: () => api<{ photos: { id: string; key: string }[] }>('photos'),
    ...live,
  })
  const photos = data?.photos ?? []
  const [idx, setIdx] = useState(0)
  useEffect(() => {
    if (photos.length < 2) return
    const id = setInterval(() => setIdx((i) => (i + 1) % photos.length), 30000)
    return () => clearInterval(id)
  }, [photos.length])
  if (!photos.length) return null
  const cur = idx % photos.length
  const p = photos[cur]
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
      <ZoomableImg key={p.id} src={imgUrl(p.key)} />
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
