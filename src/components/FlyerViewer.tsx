import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { useLang, useT } from '../i18n'
import { ZoomableImg } from './ZoomableImg'
import { Icon, InlineIcon } from './Icon'
import { type Deal, type FlyerSummary } from '../lib/deals'
import { useModal } from '../lib/useModal'

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

interface FlyerResponse {
  pages: FlyerPage[]
  items: FlyerItem[]
  // Flyer-level run dates (the cashier-facing validity span, e.g. 11 juin → 17
  // juin). Derived server-side from the items; null if the feed omits them.
  validFrom: string | null
  validTo: string | null
  // The postal code the flyer was fetched for — used to deep-link the official
  // Flipp web flyer (the dense scanned pages we can't render in-app).
  postal?: string | null
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
      queryFn: () => api<FlyerResponse>(`flyer?id=${flyerId}`),
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
  logo,
  premium,
  onAddToList,
  onStage,
  onClose,
}: {
  flyerId: number
  highlightId?: number | null
  title?: string
  // Store logo for the header band. The flyer detail endpoint carries no merchant
  // info, so the caller passes it when it has it (the store browser does); else we
  // fall back to the nearby-stores cache, then to a monogram.
  logo?: string | null
  // Whether this is an image-based (premium) flyer. Drives the "official vs
  // reconstructed" note. Resolved like logo (prop → flyers cache → unknown).
  premium?: boolean
  onAddToList?: (name: string) => void
  onStage?: (deal: Deal) => void // stage this flyer item for the cashier (one tap)
  onClose: () => void
}) {
  const t = useT()
  const qc = useQueryClient()
  const overlayRef = useRef<HTMLDivElement>(null)
  useModal(overlayRef, onClose)
  const [addedName, setAddedName] = useState<string | null>(null)
  const { lang } = useLang()

  // Logo for the header band: explicit prop wins; otherwise look this flyer up by
  // id in any cached /api/flyers list (warmed by the store browser / prefetch).
  // The reconstruction can't show reebee's rendered banner, so we brand our own.
  const resolvedLogo = useMemo(() => {
    if (logo != null) return logo
    for (const [, data] of qc.getQueriesData<{ flyers: FlyerSummary[] }>({ queryKey: ['flyers'] })) {
      const hit = data?.flyers?.find((f) => f.flyerId === flyerId)
      if (hit?.logo) return hit.logo
    }
    return null
  }, [logo, qc, flyerId])
  const monogram = (title ?? '').trim().charAt(0).toUpperCase() || '🏬'

  // Premium = image-based flyer (Super C, Métro, IGA): the reconstruction is built
  // from real scanned clippings, so we present it as the official flyer. SFML flyers
  // (Maxi, Provigo) are vector-only — flag them as a reconstruction so the cashier
  // knows. Resolved prop → flyers cache → unknown (null shows no note).
  const resolvedPremium = useMemo<boolean | null>(() => {
    if (typeof premium === 'boolean') return premium
    for (const [, data] of qc.getQueriesData<{ flyers: FlyerSummary[] }>({ queryKey: ['flyers'] })) {
      const hit = data?.flyers?.find((f) => f.flyerId === flyerId)
      if (hit && typeof hit.premium === 'boolean') return hit.premium
    }
    return null
  }, [premium, qc, flyerId])
  // Cached so re-opening the same flyer (or one prefetched on wifi) is instant.
  const { data, isError } = useQuery({
    queryKey: ['flyer', flyerId],
    queryFn: () => api<FlyerResponse>(`flyer?id=${flyerId}`),
    staleTime: FLYER_STALE,
  })
  const state: 'loading' | 'ok' | 'empty' | 'error' = isError
    ? 'error'
    : !data
      ? 'loading'
      : data.pages.length && data.items.length
        ? 'ok'
        : 'empty'
  // Two ways to look at the same clippings:
  // - 'offres' (default): a tight grid of every clipping, no white gaps. The
  //   reconstruction places clippings at their true flyer coordinates, but Flipp
  //   only exposes ~60-70% of a page as clippable items (banners, promo blocks
  //   and uncut products aren't in the feed), so the position-faithful page reads
  //   as half-empty. The grid packs the real deals together so it looks complete.
  // - 'plan': the position-faithful page reconstruction — useful in-store to find
  //   where an item sits. We open straight to it when launched on a specific item.
  const [view, setView] = useState<'offres' | 'plan'>(highlightId != null ? 'plan' : 'offres')

  // The selected item drives the ring, the directions banner, and the detail
  // card. We track it by ARRAY INDEX, not id: many flyer items come back with a
  // null id, so id-based selection would collapse them all into "nothing
  // selected" and the detail card would never open.
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null)
  const selectedRef = useRef<HTMLButtonElement | null>(null)

  // Once the flyer loads, pre-select the item the proof card sent us (by id).
  useEffect(() => {
    if (highlightId == null || !data) return
    const idx = data.items.findIndex((i) => i.id === highlightId)
    if (idx >= 0) setSelectedIdx(idx)
  }, [data, highlightId])

  // Bring the selected item into view whenever it changes (incl. first paint and
  // when flipping between the grid and the map, so "find it" lands on the item).
  useEffect(() => {
    if (state === 'ok' && selectedRef.current) {
      selectedRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }, [state, selectedIdx, view])

  const selected = useMemo(
    () => (data && selectedIdx != null ? data.items[selectedIdx] ?? null : null),
    [data, selectedIdx],
  )

  // Step through items in flyer order so you can walk the whole circular item by
  // item without hunting for the next clipping. Wraps around both ends.
  const step = (delta: number) => {
    if (!data || !data.items.length) return
    setSelectedIdx((cur) => {
      const n = data.items.length
      return (((cur ?? 0) + delta) % n + n) % n
    })
  }

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

  // The flyer's validity span for the header — "11 juin au 17 juin". This is the
  // date the cashier checks; reebee shows it but our reconstruction dropped it.
  const dateRange = useMemo(() => {
    const from = fmtDate(data?.validFrom ?? null)
    const to = fmtDate(data?.validTo ?? null)
    if (from && to) return `${from} ${t.shop.dateRangeTo} ${to}`
    return to ? `${t.shop.until} ${to}` : from
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.validFrom, data?.validTo, lang, t])

  // Deep-link to the official Flipp web flyer — the full, dense, zoomable scanned
  // pages we can't reconstruct in-app. Flipp routes client-side on the numeric id
  // + postal_code, so the merchant slug is cosmetic; we build it from the store
  // name (accent-stripped, spaces → hyphens: "Super C" → "super-c", "Métro" →
  // "metro").
  const officialUrl = useMemo(() => {
    const slug =
      (title ?? '')
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'circulaire'
    const pc = data?.postal ? `?postal_code=${encodeURIComponent(data.postal)}` : ''
    return `https://flipp.com/${lang}-ca/circulaire/${flyerId}-${slug}-circulaire${pc}`
  }, [lang, flyerId, title, data?.postal])

  return (
    <div ref={overlayRef} className="flyer-overlay" role="dialog" aria-modal="true" aria-label={title ?? 'flyer'}>
      <div className="flyer-bar">
        <div className="flyer-bar__brand">
          {resolvedLogo ? (
            <img className="flyer-bar__logo" src={resolvedLogo} alt="" loading="lazy" />
          ) : (
            <span className="flyer-bar__logo flyer-bar__logo--mono" aria-hidden="true">
              {monogram}
            </span>
          )}
          <span className="flyer-bar__title">
            {title ?? t.shop.proofTitle}
            {dateRange && <span className="flyer-bar__dates mono">{dateRange}</span>}
          </span>
        </div>
        <button type="button" className="btn btn--ghost mono" onClick={onClose} aria-label={t.shop.close}>
          <Icon name="x-bold" size={18} />
        </button>
      </div>

      <div className="flyer-meta">
        {resolvedPremium != null && (
          <span
            className={`flyer-note mono ${resolvedPremium ? 'flyer-note--official' : 'flyer-note--recon'}`}
            aria-live="polite"
          >
            {resolvedPremium ? (
              <>
                <InlineIcon name="check-bold" color="var(--sage-deep)" /> {t.shop.flyerOfficial}
              </>
            ) : (
              <>
                <InlineIcon name="approximate-equals-bold" /> {t.shop.flyerReconstructed}
              </>
            )}
          </span>
        )}
        {/* The real, full flyer (dense scanned pages, zoom) lives on Flipp's site —
            we render a quick reconstruction; this opens the complete one. */}
        <a className="flyer-full-link mono" href={officialUrl} target="_blank" rel="noopener noreferrer">
          {t.shop.flyerFull} <InlineIcon name="arrow-up-right-bold" size={13} />
        </a>
      </div>

      {state === 'ok' && (
        <div className="subtabs flyer-tabs" role="tablist" aria-label={title ?? t.shop.proofTitle}>
          <button
            type="button"
            role="tab"
            className={`subtabs__opt${view === 'offres' ? ' is-on' : ''}`}
            onClick={() => setView('offres')}
            aria-selected={view === 'offres'}
          >
            <InlineIcon name="tag-bold" /> {t.shop.flyerTabOffers}
          </button>
          <button
            type="button"
            role="tab"
            className={`subtabs__opt${view === 'plan' ? ' is-on' : ''}`}
            onClick={() => setView('plan')}
            aria-selected={view === 'plan'}
          >
            <InlineIcon name="map-pin-bold" /> {t.shop.flyerTabMap}
          </button>
        </div>
      )}

      {view === 'plan' && directions && (
        <button
          type="button"
          className="flyer-dir mono"
          aria-live="polite"
          onClick={() => selectedRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
          title={t.shop.viewFlyer}
        >
          <InlineIcon name="map-pin-bold" /> {t.shop.page} {directions.page} · {t.shop.position.col} {directions.col} ·{' '}
          {directions.v}-{directions.h}
        </button>
      )}

      <div className="flyer-scroll">
        {state === 'loading' && <p className="loading mono">{t.shop.searching}</p>}
        {(state === 'empty' || state === 'error') && <p className="feed-empty">{t.shop.flyerNone}</p>}

        {/* Offres — a tight grid of every clipping (each carries its own price), so
            the view reads as complete even though the flyer page has gaps Flipp
            never clipped. Same index-based selection as the map, so tapping a cell
            opens the detail card (and the map can then locate it). */}
        {state === 'ok' && view === 'offres' && (
          <div className="flyer-grid">
            {data!.items.map((it, idx) =>
              it.image ? (
                <button
                  type="button"
                  key={idx}
                  ref={selectedIdx === idx ? selectedRef : undefined}
                  className={`flyer-grid__cell${selectedIdx === idx ? ' is-hit' : ''}`}
                  onClick={() => setSelectedIdx(idx)}
                  aria-label={it.price != null ? `${it.name} — ${money(it.price)}` : it.name}
                >
                  <img src={it.image} alt={it.name} loading="lazy" />
                </button>
              ) : null,
            )}
          </div>
        )}

        {state === 'ok' &&
          view === 'plan' &&
          data!.pages.map((page) => {
            const pageW = page.right - page.left
            const pageH = page.top - page.bottom
            if (pageW <= 0 || pageH <= 0) return null
            const onPage = data!.items
              .map((it, idx) => ({ it, idx }))
              .filter(({ it }) => {
                const cx = (it.left + it.right) / 2
                return cx >= page.left && cx < page.right
              })
            // Skip pages that carry no item clippings. Image-based (premium) flyers
            // open on a cover/feature page that's pure branding — we have no cutouts
            // to place there, so it would render as a blank white box (the "blank
            // pages" bug). A reconstruction only earns a page when it has something
            // real to show; the page LABEL keeps the flyer's true page numbers.
            if (onPage.length === 0) return null
            return (
              <div key={page.id ?? page.page} className="flyer-page-wrap">
                <div className="flyer-page-label mono">
                  {t.shop.page} {page.page}
                </div>
                <div className="flyer-page" style={{ aspectRatio: `${pageW} / ${pageH}` }}>
                  {onPage.map(({ it, idx }) => {
                    const isHit = selectedIdx === idx
                    const style: React.CSSProperties = {
                      left: `${((it.left - page.left) / pageW) * 100}%`,
                      top: `${((page.top - it.top) / pageH) * 100}%`,
                      width: `${((it.right - it.left) / pageW) * 100}%`,
                      height: `${((it.top - it.bottom) / pageH) * 100}%`,
                    }
                    return (
                      <button
                        type="button"
                        key={idx}
                        ref={isHit ? selectedRef : undefined}
                        className={`flyer-item${isHit ? ' is-hit' : ''}`}
                        style={style}
                        onClick={() => setSelectedIdx(idx)}
                        aria-label={it.price != null ? `${it.name} — ${money(it.price)}` : it.name}
                      >
                        {it.image && <img src={it.image} alt={it.name} loading="lazy" />}
                        {isHit && (
                          <span className="flyer-item__pin" aria-hidden="true">
                            <Icon name="map-pin-bold" size={16} />
                          </span>
                        )}
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}
      </div>

      {/* Detail card for the selected item — the "details there" view. Slides up
          over the flyer; close it to keep browsing. */}
      {selected && (
        <div className="flyer-detail">
          <div className="flyer-detail__info">
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
          </div>
          <div className="flyer-detail__actions">
            {data && data.items.length > 1 && (
              <div className="flyer-detail__nav mono">
                <button type="button" className="flyer-detail__step" onClick={() => step(-1)} aria-label={t.shop.prev}>
                  ‹
                </button>
                <span className="flyer-detail__count">
                  {(selectedIdx ?? 0) + 1}/{data.items.length}
                </span>
                <button type="button" className="flyer-detail__step" onClick={() => step(1)} aria-label={t.shop.next}>
                  ›
                </button>
              </div>
            )}
            {/* One action: adding from the flyer links the deal for the cashier
                too (store, price, image) — so the list row shows the ✓ + flyer
                picture, and there's no separate "show the cashier" button here. */}
            {(onStage || onAddToList) && selected.name && (
              <button
                type="button"
                className="btn btn--primary mono flyer-detail__add"
                onClick={() => {
                  const nm = selected.name
                  if (onStage) {
                    // Synthesize a Deal from the flyer item + this flyer's
                    // merchant/id so the cashier card has store, price, and image.
                    onStage({
                      id: selected.id,
                      flyerId,
                      name: nm,
                      price: selected.price,
                      wasPrice: null,
                      unitPrice: selected.unitPrice,
                      unitLabel: selected.unitLabel,
                      unitKind: selected.unitKind,
                      unitApprox: false,
                      merchant: title ?? '',
                      logo: resolvedLogo,
                      premium: resolvedPremium ?? false,
                      image: selected.image,
                      validFrom: selected.validFrom,
                      validTo: selected.validTo,
                    })
                  } else {
                    onAddToList!(nm)
                  }
                  setAddedName(nm)
                }}
              >
                {addedName === selected.name ? (
                  <>
                    <InlineIcon name="check-bold" /> {t.shop.addToList}
                  </>
                ) : (
                  <>
                    <InlineIcon name="plus-bold" /> {t.shop.addToList}
                  </>
                )}
              </button>
            )}
            <button
              type="button"
              className="flyer-detail__close btn btn--ghost mono"
              onClick={() => setSelectedIdx(null)}
              aria-label={t.shop.close}
            >
              <Icon name="x-bold" size={18} />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
