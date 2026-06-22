import { useEffect, useState } from 'react'
import QRCode from 'qrcode'

// A dumb, presentational QR tile. Encodes `value` to a data-URL <img> client-side
// (no network), so a minted share link can be scanned off the wall tablet or
// printed to tape by the door (#35 "a QR by the door"). Renders on a white tile
// regardless of theme so it always scans. Used under the share-link input in
// operator/guest.tsx; lives in /dev/kit.
export function QrCode({ value, size = 180 }: { value: string; size?: number }) {
  const [src, setSrc] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    QRCode.toDataURL(value, { margin: 1, width: size })
      .then((url) => {
        if (alive) setSrc(url)
      })
      .catch(() => {
        // Encoding can't realistically fail for a URL; if it does, the link text
        // is still shown above for manual entry — just render nothing here.
        if (alive) setSrc(null)
      })
    return () => {
      alive = false
    }
  }, [value, size])

  if (!src) return null
  return (
    <div className="qrcode">
      <img className="qrcode__img" src={src} width={size} height={size} alt={value} />
    </div>
  )
}
