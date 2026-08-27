import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { EmptyState } from './EmptyState'
import { api } from '../lib/api'
import { useLang, useT } from '../i18n'
import { isGuest } from '../lib/device'
import { ZoomableImg } from './ZoomableImg'
import { Icon, InlineIcon } from './Icon'
import { SubTabs } from './SubTabs'
import { type Deal, type FlyerSummary } from '../lib/deals'
import { type AddedTo } from '../lib/picks'
import { FLYERS_KEY } from '../lib/queryKeys'
import { useModal } from '../lib/useModal'
import { warmImageCache } from '../lib/cacheWarm'
import { scrollBehavior } from '../lib/motion'

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

// Clipping images live on f.wishabi.net (cross-origin), which the service worker
// never caches. Route them through the same-origin proxy (functions/api/flyer-img)
// so the SW caches them cache-first and they survive offline / poor store signal.
const proxied = (url: string | null | undefined): string =>
  // Only the cross-origin Flipp CDN needs the proxy; data: URIs (tests) and any
  // already same-origin src pass through untouched.
  url ? (/^https?:\/\//i.test(url) ? `/api/flyer-img?u=${encodeURIComponent(url)}` : url) : ''

// A flyer's clippings load eagerly and all at once (not lazy) — a slower start, but
// the page fills in completely instead of popping in as you scroll. The browser caps
// itself at ~6 concurrent connections, so "eager" queues rather than truly flooding.
// data-state drives a calm placeholder (sheets/flyer.css): 'loading' shows a soft shimmer so
// the grid never reads as broken blank boxes; the real bitmap fades in on load. On a
// genuine failure we retry the SAME url ONCE (a remount via key, cache-friendly — no
// cache-buster that would re-hit the upstream every time), then settle to a static
// 'fail' tint rather than a broken-image icon or an endless shimmer.
type ImgState = 'loading' | 'ok' | 'fail'
const FLYER_IMG_RETRIES = 1
function FlyerImg({ src, alt, className }: { src: string; alt: string; className?: string }) {
  const url = proxied(src)
  const canRetry = url.startsWith('/api/flyer-img')
  const [tries, setTries] = useState(0)
  const [state, setState] = useState<ImgState>('loading')

  // Retry after a short backoff so a transient proxy/CDN hiccup clears, instead of
  // hammering the moment it fails. Remounting (key={tries}) re-fetches the same URL.
  useEffect(() => {
    if (state !== 'fail' || !canRetry || tries >= FLYER_IMG_RETRIES) return
    const id = setTimeout(() => {
      setTries((n) => n + 1)
      setState('loading')
    }, 600)
    return () => clearTimeout(id)
  }, [state, tries, canRetry])

  // While a retry is still pending keep the calm shimmer; only settle to the static
  // fail tint once retries are genuinely exhausted.
  const exhausted = state === 'fail' && (!canRetry || tries >= FLYER_IMG_RETRIES)
  return (
    <img
      key={tries}
      // A cache-first hit can finish before React attaches onLoad (the img is already
      // `complete`), which would otherwise leave it stuck hidden — reveal it here.
      ref={(el) => {
        if (el?.complete && el.naturalWidth > 0) setState('ok')
      }}
      src={url}
      alt={alt}
      className={className}
      loading="eager"
      data-loaded={state === 'ok' ? '1' : exhausted ? 'x' : '0'}
      onLoad={() => setState('ok')}
      onError={() => setState('fail')}
    />
  )
}

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
  // fetch() each clipping (not `new Image()`, which can satisfy from the browser memory
  // cache without ever populating the SW cache-first store) — see lib/cacheWarm.
  await warmImageCache(data.items.map((it) => proxied(it.image)))
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
  // Both answer with the EXISTING list line the add rode on (deal ↔ item: a
  // specific flyer product lands on its generic line), or null for a new line —
  // the button says which, so a reuse doesn't read as nothing happening.
  onAddToList?: (name: string) => void | Promise<AddedTo | void>
  onStage?: (deal: Deal) => void | Promise<AddedTo | void> // stage for the cashier (one tap)
  onClose: () => void
}) {
  const t = useT()
  const qc = useQueryClient()
  const overlayRef = useRef<HTMLDivElement>(null)
  useModal(overlayRef, onClose)
  const [addedName, setAddedName] = useState<string | null>(null)
  // The list line the last add landed on (null = a new line, or not known yet).
  const [addedTo, setAddedTo] = useState<AddedTo>(null)
  const { lang } = useLang()

  // Logo for the header band: explicit prop wins; otherwise look this flyer up by
  // id in any cached /api/flyers list (warmed by the store browser / prefetch).
  // The reconstruction can't show reebee's rendered banner, so we brand our own.
  const resolvedLogo = useMemo(() => {
    if (logo != null) return logo
    for (const [, data] of qc.getQueriesData<{ flyers: FlyerSummary[] }>({ queryKey: FLYERS_KEY })) {
      const hit = data?.flyers?.find((f) => f.flyerId === flyerId)
      if (hit?.logo) return hit.logo
    }
    return null
  }, [logo, qc, flyerId])
  const monogram = (title ?? '').trim().charAt(0).toUpperCase() || '🏬'

  // Premium = Flipp's per-flyer flag for an image-based (scanned) flyer: the
  // reconstruction is built from real scanned clippings, so we present it as the
  // official flyer. SFML (vector) flyers — which is most QC grocery flyers, incl.
  // IGA — are flagged as a reconstruction so the cashier knows. It's per flyer,
  // not per merchant. Resolved prop → flyers cache → unknown (null shows no note).
  const resolvedPremium = useMemo<boolean | null>(() => {
    if (typeof premium === 'boolean') return premium
    for (const [, data] of qc.getQueriesData<{ flyers: FlyerSummary[] }>({ queryKey: FLYERS_KEY })) {
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
  //   where an item sits, and the default: it reads as the real flyer. We also open
  //   straight to it when launched on a specific item (highlightId).
  const [view, setView] = useState<'offres' | 'plan'>('plan')

  // Manual "download for offline": pull every clipping through the same-origin
  // proxy so the service worker caches it, before you lose wifi (the store). Just
  // viewing warms them lazily; this guarantees the whole flyer is there. We
  // remember it per flyer in localStorage so the ✓ badge shows on re-open.
  const offlineKey = `bb_flyer_offline_${flyerId}`
  const [dl, setDl] = useState<{ state: 'idle' | 'busy' | 'done'; done: number; total: number }>(() => ({
    state: typeof localStorage !== 'undefined' && localStorage.getItem(offlineKey) ? 'done' : 'idle',
    done: 0,
    total: 0,
  }))

  const download = async () => {
    if (!data || dl.state === 'busy') return
    const urls = data.items.map((it) => proxied(it.image)).filter(Boolean)
    if (!urls.length) return
    setDl({ state: 'busy', done: 0, total: urls.length })
    // Shared cache-warm pool, with a progress tick driving the bar (see lib/cacheWarm).
    await warmImageCache(urls, 6, (done) => setDl((d) => (d.state === 'busy' ? { ...d, done } : d)))
    try {
      localStorage.setItem(offlineKey, '1')
    } catch {
      /* private mode — the badge just won't persist */
    }
    setDl({ state: 'done', done: urls.length, total: urls.length })
  }

  // #21 — eager warm on OPEN: as soon as the flyer's data lands, quietly fetch every
  // clipping into the cache-first store (best-effort, no progress UI) so browsing every
  // page is instant and the whole flyer survives going offline at the store — without
  // waiting for the operator to tap "download for offline". On WebKit there's no
  // Background Fetch, so this in-session warm is the way. Runs once per flyer; if the
  // operator already downloaded it, the bytes are cached and these fetches are cheap.
  const warmedRef = useRef<number | null>(null)
  useEffect(() => {
    if (!data || warmedRef.current === flyerId) return
    warmedRef.current = flyerId
    void warmImageCache(data.items.map((it) => proxied(it.image)))
  }, [data, flyerId])

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
      selectedRef.current.scrollIntoView({ behavior: scrollBehavior(), block: 'center' })
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
        {/* Pull every clipping into the offline cache so the flyer survives a weak
            store signal. Viewing warms them too; this does the whole flyer at once. */}
        {state === 'ok' && (
          <button
            type="button"
            className={`flyer-dl mono${dl.state === 'done' ? ' is-done' : ''}`}
            onClick={download}
            disabled={dl.state !== 'idle'}
            aria-live="polite"
          >
            {dl.state === 'busy' ? (
              <>
                <InlineIcon name="download-simple-bold" /> {t.shop.flyerSaving} {dl.done}/{dl.total}
              </>
            ) : dl.state === 'done' ? (
              <>
                <InlineIcon name="check-bold" color="var(--sage-deep)" /> {t.shop.flyerSavedOffline}
              </>
            ) : (
              <>
                <InlineIcon name="download-simple-bold" /> {t.shop.flyerSaveOffline}
              </>
            )}
          </button>
        )}
        {/* The real, full flyer (dense scanned pages, zoom) lives on Flipp's site —
            we render a quick reconstruction; this opens the complete one. */}
        <a className="flyer-full-link mono" href={officialUrl} target="_blank" rel="noopener noreferrer">
          {t.shop.flyerFull} <InlineIcon name="arrow-up-right-bold" size={13} />
        </a>
      </div>

      {state === 'ok' && (
        <SubTabs
          className="flyer-tabs"
          ariaLabel={title ?? t.shop.proofTitle}
          value={view}
          onSelect={setView}
          options={[
            { key: 'plan', label: t.shop.flyerTabMap, icon: 'map-pin-bold' },
            { key: 'offres', label: t.shop.flyerTabOffers, icon: 'tag-bold' },
          ]}
        />
      )}

      {view === 'plan' && directions && (
        <button
          type="button"
          className="flyer-dir mono"
          aria-live="polite"
          onClick={() => selectedRef.current?.scrollIntoView({ behavior: scrollBehavior(), block: 'center' })}
          title={t.shop.viewFlyer}
        >
          <InlineIcon name="map-pin-bold" /> {t.shop.page} {directions.page} · {t.shop.position.col} {directions.col} ·{' '}
          {directions.v}-{directions.h}
        </button>
      )}

      <div className="flyer-scroll">
        {state === 'loading' && <p className="loading mono">{t.shop.searching}</p>}
        {(state === 'empty' || state === 'error') && <EmptyState>{t.shop.flyerNone}</EmptyState>}

        {/* Offres — a tight grid of every clipping (each carries its own price), so
            the view reads as complete even though the flyer page has gaps Flipp
            never clipped. Same index-based selection as the map, so tapping a cell
            opens the detail card (and the map can then locate it). */}
        {state === 'ok' && view === 'offres' && (
          <div className="flyer-grid">
            {data!.items.map((it, idx) => {
              if (!it.image) return null
              // Reserve each cell's height from the clipping's true box ratio so the
              // grid is laid out correctly on first paint — before any image loads.
              // Without it, cells are 0px tall, lazy images never intersect (so they
              // stay blank until a tab switch forces a re-layout), and as they
              // trickle in the cells reflow ("random order until it stabilizes").
              const w = it.right - it.left
              const h = it.top - it.bottom
              const ratio = w > 0 && h > 0 ? `${w} / ${h}` : undefined
              return (
                <button
                  type="button"
                  key={idx}
                  ref={selectedIdx === idx ? selectedRef : undefined}
                  className={`flyer-grid__cell${selectedIdx === idx ? ' is-hit' : ''}`}
                  style={ratio ? { aspectRatio: ratio } : undefined}
                  onClick={() => setSelectedIdx(idx)}
                  aria-label={it.price != null ? `${it.name} — ${money(it.price)}` : it.name}
                >
                  <FlyerImg src={it.image} alt={it.name} />
                </button>
              )
            })}
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
                        {it.image && <FlyerImg src={it.image} alt={it.name} />}
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
            {selected.image && (
              <ZoomableImg className="flyer-detail__img" src={proxied(selected.image)} alt={selected.name} />
            )}
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
                  <Icon name="caret-left-bold" size={18} />
                </button>
                <span className="flyer-detail__count">
                  {(selectedIdx ?? 0) + 1}/{data.items.length}
                </span>
                <button type="button" className="flyer-detail__step" onClick={() => step(1)} aria-label={t.shop.next}>
                  <Icon name="caret-right-bold" size={18} />
                </button>
              </div>
            )}
            {/* One action: adding from the flyer links the deal for the cashier
                too (store, price, image) — so the list row shows the ✓ + flyer
                picture, and there's no separate "show the cashier" button here.
                Once THIS item is added the button goes inert (same rule as
                DealCard): a re-tap re-ran the match and could re-create a line
                the household had deleted in between. The parent's per-name guard
                backs this up for taps that land before the re-render. */}
            {!isGuest() && (onStage || onAddToList) && selected.name && (
              <button
                type="button"
                className="btn btn--primary mono flyer-detail__add"
                aria-disabled={addedName === selected.name || undefined}
                onClick={() => {
                  if (addedName === selected.name) return
                  const nm = selected.name
                  setAddedTo(null)
                  // Whichever action this flyer was opened with answers with the
                  // list line the item rode on — show it on the button.
                  const done = (r: void | Promise<AddedTo | void>) =>
                    void Promise.resolve(r).then((on) => setAddedTo(on ?? null))
                  if (onStage) {
                    // Synthesize a Deal from the flyer item + this flyer's
                    // merchant/id so the cashier card has store, price, and image.
                    done(
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
                      }),
                    )
                  } else {
                    done(onAddToList!(nm))
                  }
                  setAddedName(nm)
                }}
              >
                {addedName === selected.name ? (
                  <>
                    <InlineIcon name="check-bold" /> {addedTo ? t.shop.addedTo(addedTo) : t.shop.addedToList}
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
