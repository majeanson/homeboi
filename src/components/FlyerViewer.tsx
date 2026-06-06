import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery, type QueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { useLang, useT } from '../i18n'
import { ZoomableImg } from './ZoomableImg'

// Full-flyer viewer. A Flipp flyer page is a canvas of item clippings positioned
// by coordinates (no scanned page image), so we fetch /api/flyer and reconstruct
// each page: a white sheet with every clipping absolutely placed by its box.
//
// It's interactive: tap any clipping to select it — that rings it, pins it,
// updates the directions banner (page + position), scrolls it into view, and
// opens a detail card (price, unit price, dates). So you can move freely between
// a deal's details and its spot on the flyer. Opens pre-selected on the item the
// proof card sent us (highlightId).
//
// Coordinate space (from the backend): x grows right; y is 0 at the top and
// negative going down. Pages tile horizontally — page N spans [left, right] with
// left = (N-1)*pageWidth. An item belongs to the page whose x-range contains its
// centre; its position within that page is a simple ratio of the page box.
interface Box {
  left: number
  top: number
  right: number
  bottom: number
}
interface FlyerPage extends Box {
  id: number | null
  page: number
}
interface FlyerItem extends Box {
  id: number | null
  name: string
  price: number | null
  unitPrice: number | null
  unitLabel: string | null
  unitKind: 'mass' | 'volume' | null
  validFrom: string | null
  validTo: string | null
  image: string | null
}

const money = (n: number | null) => (n == null ? '' : `$${n.toFixed(2)}`)

const FLYER_STALE = 30 * 60 * 1000 // flyers change ~weekly; cache generously

// Warm a flyer (its reconstruction data + clipping images) into the cache. Call
// on wifi — e.g. when the cashier sheet opens at home — so the proof is ready at
// the store even on poor signal. Best-effort: failures are swallowed.
export async function prefetchFlyer(qc: QueryClient, flyerId: number): Promise<void> {
  const data = await qc
    .fetchQuery({
      queryKey: ['flyer', flyerId],
      queryFn: () => api<{ pages: FlyerPage[]; items: FlyerItem[] }>(`flyer?id=${flyerId}`),
      staleTime: FLYER_STALE,
    })
    .catch(() => null)
  if (!data) return
  for (const it of data.items) if (it.image) new Image().src = it.image
}

export function FlyerViewer({
  flyerId,
  highlightId,
  title,
  onAddToList,
  onClose,
}: {
  flyerId: number
  highlightId?: number | null
  title?: string
  onAddToList?: (name: string) => void
  onClose: () => void
}) {
  const t = useT()
  const [addedName, setAddedName] = useState<string | null>(null)
  const { lang } = useLang()
  // Cached so re-opening the same flyer (or one prefetched on wifi) is instant.
  const { data, isError } = useQuery({
    queryKey: ['flyer', flyerId],
    queryFn: () => api<{ pages: FlyerPage[]; items: FlyerItem[] }>(`flyer?id=${flyerId}`),
    staleTime: FLYER_STALE,
  })
  const state: 'loading' | 'ok' | 'empty' | 'error' = isError
    ? 'error'
    : !data
      ? 'loading'
      : data.pages.length && data.items.length
        ? 'ok'
        : 'empty'
  // The selected item drives the ring, the directions banner, and the detail card.
  const [selectedId, setSelectedId] = useState<number | null>(highlightId ?? null)
  const selectedRef = useRef<HTMLButtonElement | null>(null)

  // Bring the selected item into view whenever it changes (incl. first paint).
  useEffect(() => {
    if (state === 'ok' && selectedRef.current) {
      selectedRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }, [state, selectedId])

  const selected = useMemo(
    () => (data && selectedId != null ? data.items.find((i) => i.id === selectedId) ?? null : null),
    [data, selectedId],
  )

  // Where in the flyer the selected item sits: page number + a 3x3 position
  // (top/middle/bottom × left/center/right) so you can find it at a glance.
  const directions = useMemo(() => {
    if (!data || !selected) return null
    const cx = (selected.left + selected.right) / 2
    const cy = (selected.top + selected.bottom) / 2
    const page = data.pages.find((p) => cx >= p.left && cx < p.right)
    if (!page) return null
    const fx = (cx - page.left) / (page.right - page.left) // 0..1 left→right
    const fy = (page.top - cy) / (page.top - page.bottom) // 0..1 top→bottom
    const p = t.shop.position
    const h = fx < 1 / 3 ? p.left : fx < 2 / 3 ? p.center : p.right
    const v = fy < 1 / 3 ? p.top : fy < 2 / 3 ? p.middle : p.bottom
    const col = Math.min(3, Math.floor(fx * 3) + 1) // 1..3, a rough column
    return { page: page.page, v, h, col }
  }, [data, selected, t])

  const fmtDate = (iso: string | null) => {
    if (!iso) return ''
    const d = new Date(iso)
    return Number.isNaN(d.getTime())
      ? ''
      : d.toLocaleDateString(lang === 'fr' ? 'fr-CA' : 'en-CA', { month: 'short', day: 'numeric' })
  }

  return (
    <div className="flyer-overlay" role="dialog" aria-modal="true" aria-label={title ?? 'flyer'}>
      <div className="flyer-bar">
        <span className="flyer-bar__title">{title ?? t.shop.proofTitle}</span>
        <button type="button" className="btn btn--ghost mono" onClick={onClose} aria-label={t.shop.close}>
          ✕
        </button>
      </div>

      {directions && (
        <button
          type="button"
          className="flyer-dir mono"
          aria-live="polite"
          onClick={() => selectedRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
          title={t.shop.viewFlyer}
        >
          📍 {t.shop.page} {directions.page} · {t.shop.position.col} {directions.col} · {directions.v}-
          {directions.h}
        </button>
      )}

      <div className="flyer-scroll">
        {state === 'loading' && <p className="loading mono">{t.shop.searching}</p>}
        {(state === 'empty' || state === 'error') && <p className="feed-empty">{t.shop.flyerNone}</p>}

        {state === 'ok' &&
          data!.pages.map((page) => {
            const pageW = page.right - page.left
            const pageH = page.top - page.bottom
            if (pageW <= 0 || pageH <= 0) return null
            const onPage = data!.items.filter((it) => {
              const cx = (it.left + it.right) / 2
              return cx >= page.left && cx < page.right
            })
            return (
              <div key={page.id ?? page.page} className="flyer-page-wrap">
                <div className="flyer-page-label mono">
                  {t.shop.page} {page.page}
                </div>
                <div className="flyer-page" style={{ aspectRatio: `${pageW} / ${pageH}` }}>
                  {onPage.map((it) => {
                    const isHit = selectedId != null && it.id === selectedId
                    const style: React.CSSProperties = {
                      left: `${((it.left - page.left) / pageW) * 100}%`,
                      top: `${((page.top - it.top) / pageH) * 100}%`,
                      width: `${((it.right - it.left) / pageW) * 100}%`,
                      height: `${((it.top - it.bottom) / pageH) * 100}%`,
                    }
                    return (
                      <button
                        type="button"
                        key={it.id ?? `${it.left},${it.top}`}
                        ref={isHit ? selectedRef : undefined}
                        className={`flyer-item${isHit ? ' is-hit' : ''}`}
                        style={style}
                        onClick={() => setSelectedId(it.id)}
                        aria-label={it.price != null ? `${it.name} — ${money(it.price)}` : it.name}
                      >
                        {it.image && <img src={it.image} alt={it.name} loading="lazy" />}
                        {isHit && (
                          <span className="flyer-item__pin" aria-hidden="true">
                            📍
                          </span>
                        )}
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}

        <p className="deal__disclaimer mono">{t.shop.disclaimer}</p>
      </div>

      {/* Detail card for the selected item — the "details there" view. Slides up
          over the flyer; close it to keep browsing. */}
      {selected && (
        <div className="flyer-detail">
          {selected.image && <ZoomableImg className="flyer-detail__img" src={selected.image} alt={selected.name} />}
          <div className="flyer-detail__body">
            <span className="flyer-detail__name">{selected.name || '—'}</span>
            <span className="flyer-detail__meta mono">
              {selected.unitPrice != null
                ? `${money(selected.unitPrice)}${selected.unitLabel}`
                : t.shop.noUnit}
              {selected.validTo ? ` · ${t.shop.until} ${fmtDate(selected.validTo)}` : ''}
            </span>
          </div>
          <span className="flyer-detail__price">{money(selected.price)}</span>
          {onAddToList && selected.name && (
            <button
              type="button"
              className="btn btn--ghost mono flyer-detail__add"
              onClick={() => {
                onAddToList(selected.name)
                setAddedName(selected.name)
              }}
            >
              {addedName === selected.name ? `✓ ${t.shop.addToList}` : `+ ${t.shop.addToList}`}
            </button>
          )}
          <button
            type="button"
            className="flyer-detail__close btn btn--ghost mono"
            onClick={() => setSelectedId(null)}
            aria-label={t.shop.close}
          >
            ✕
          </button>
        </div>
      )}
    </div>
  )
}
