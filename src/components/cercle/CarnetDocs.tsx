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
export function CarnetDocs({
  keys,
  onRemove,
  className,
}: {
  keys: string[]
  onRemove?: (key: string) => void
  className?: string
}) {
  const t = useT()
  const [openSrc, setOpenSrc] = useState<string | null>(null)
  if (keys.length === 0) return null
  return (
    <span className={'carnet-docs' + (className ? ` ${className}` : '')}>
      {keys.map((k) => (
        <DocTile key={k} docKey={k} onOpenPdf={setOpenSrc} onRemove={onRemove} removeLabel={t.common.delete} />
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
  onOpenPdf,
  onRemove,
  removeLabel,
}: {
  docKey: string
  onOpenPdf: (src: string) => void
  onRemove?: (key: string) => void
  removeLabel: string
}) {
  const [isPdf, setIsPdf] = useState(isPdfKey(docKey))
  const src = imgUrl(docKey)
  return (
    <span className={'carnet-docs__doc' + (isPdf ? ' carnet-docs__doc--pdf' : '')}>
      {isPdf ? (
        <button type="button" className="carnet-docs__pdf" onClick={() => onOpenPdf(src)} aria-label="PDF" title="PDF">
          <Icon name="file-text-bold" size={20} />
          <span className="carnet-docs__pdf-tag mono">PDF</span>
        </button>
      ) : (
        // A suffix-less PDF (uploaded before extFromType) fails as an image → flip to
        // the PDF tile so it becomes readable instead of a blank square.
        <ZoomableImg src={src} alt="" onError={() => setIsPdf(true)} />
      )}
      {onRemove && (
        <button type="button" className="carnet-docs__rm" aria-label={removeLabel} onClick={() => onRemove(docKey)}>
          <Icon name="x-bold" size={12} />
        </button>
      )}
    </span>
  )
}
