import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { live } from '../../lib/query'
import { imgUrl } from '../../lib/image'

// A calm family-photo frame for the wall: one photo at a time, a slow cross-fade
// every 30s. Silent no-op when there are no photos (or R2 is off).
export function PhotoFrame() {
  const { data } = useQuery({
    queryKey: ['photos'],
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
  const p = photos[idx % photos.length]
  // key=id so React remounts the <img>, re-triggering the gentle fade per photo.
  return (
    <div className="photo-frame">
      <img key={p.id} src={imgUrl(p.key)} alt="" />
    </div>
  )
}
