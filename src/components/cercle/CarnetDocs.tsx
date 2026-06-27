import { useState } from 'react'
import { useT } from '../../i18n'
import { imgUrl } from '../../lib/image'
import { isPdfKey } from '../../lib/carnets'
import { ZoomableImg } from '../ZoomableImg'
import { Modal } from '../Modal'
import { Icon, InlineIcon } from '../Icon'

// The attached-docs strip for a « carnet » — an invoice, a manual, a photo (R2 keys).
// An image tile zooms full-screen (ZoomableImg, pinch + pan); a PDF tile opens a read
// SHEET with an inline <iframe> so a facture/manuel is readable right here, like
// expanding a fridge note. A key tells us its type from its `.pdf` suffix (care-log
// uploads with extFromType); an older suffix-less PDF key would render as a broken
// image, so a failed <img> load also falls back to the PDF tile.
//
// Reused read-only in the carnet scene (historique + en cas de pépin) and editable
// (with `onRemove`) in the CareLogForm/HomePinForm previews.
//
// `variant='list'` swaps the square thumbnails for full-width rows that also show
// each doc's NAME (`labelFor`) — the convenient, glanceable way to check a stack of
// trip documents on a phone, where anonymous little squares are hard to tell apart.
export function CarnetDocs({
  keys,
  onRemove,
  className,
  variant = 'grid',
  labelFor,
}: {
  keys: string[]
  onRemove?: (key: string) => void
  className?: string
  variant?: 'grid' | 'list'
  /** Optional display name per key (e.g. a trip doc's file name) — list variant only. */
  labelFor?: (key: string) => string | undefined
}) {
  const t = useT()
  const [openSrc, setOpenSrc] = useState<string | null>(null)
  if (keys.length === 0) return null
  return (
    <span className={'carnet-docs carnet-docs--' + variant + (className ? ` ${className}` : '')}>
      {keys.map((k) => (
        <DocTile
          key={k}
          docKey={k}
          variant={variant}
          label={labelFor?.(k)}
          onOpenPdf={setOpenSrc}
          onRemove={onRemove}
          removeLabel={t.common.delete}
        />
      ))}

      {/* The PDF read sheet — an iframe that renders the document inline, plus a
          full-screen escape hatch for a long/zoomy doc. */}
      <Modal open={!!openSrc} onClose={() => setOpenSrc(null)} title={t.carnets.docTitle} className="carnet-docsheet">
        {openSrc && (
          <>
            <iframe src={openSrc} title={t.carnets.docTitle} className="carnet-docsheet__frame" />
            <a className="btn btn--ghost mono carnet-docsheet__open" href={openSrc} target="_blank" rel="noopener noreferrer">
              <InlineIcon name="arrow-up-right-bold" size={16} /> {t.carnets.openInTab}
            </a>
          </>
        )}
      </Modal>
    </span>
  )
}

function DocTile({
  docKey,
  variant,
  label,
  onOpenPdf,
  onRemove,
  removeLabel,
}: {
  docKey: string
  variant: 'grid' | 'list'
  label?: string
  onOpenPdf: (src: string) => void
  onRemove?: (key: string) => void
  removeLabel: string
}) {
  const [isPdf, setIsPdf] = useState(isPdfKey(docKey))
  const src = imgUrl(docKey)

  // The tap-to-open thumbnail: a PDF opens the read sheet; an image zooms full-screen
  // (pinch/pan). A suffix-less PDF (uploaded before extFromType) fails as an image →
  // flip to the PDF tile so it becomes readable instead of a blank square.
  const thumb = isPdf ? (
    <button type="button" className="carnet-docs__pdf" onClick={() => onOpenPdf(src)} aria-label="PDF" title="PDF">
      <Icon name="file-text-bold" size={20} />
      <span className="carnet-docs__pdf-tag mono">PDF</span>
    </button>
  ) : (
    <ZoomableImg src={src} alt={label ?? ''} onError={() => setIsPdf(true)} />
  )

  const rm = onRemove && (
    <button type="button" className="carnet-docs__rm" aria-label={removeLabel} onClick={() => onRemove(docKey)}>
      <Icon name="x-bold" size={12} />
    </button>
  )

  // List row: the same tappable thumbnail, but with the file name beside it so a
  // stack of trip docs is legible at a glance on a phone.
  if (variant === 'list') {
    return (
      <span className={'carnet-docs__row' + (isPdf ? ' carnet-docs__row--pdf' : '')}>
        <span className="carnet-docs__thumb">{thumb}</span>
        <span className="carnet-docs__meta">
          <span className="carnet-docs__name">{label || (isPdf ? 'PDF' : '—')}</span>
          {isPdf && <span className="carnet-docs__type mono">PDF</span>}
        </span>
        {rm}
      </span>
    )
  }

  return <span className={'carnet-docs__doc' + (isPdf ? ' carnet-docs__doc--pdf' : '')}>{thumb}{rm}</span>
}
