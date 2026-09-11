import { useEffect, useRef, useState } from 'react'
import { useT } from '../i18n'
import { type Pick, flippItemUrl } from '../lib/deals'
import { useModal } from '../lib/useModal'
import { Icon, InlineIcon } from './Icon'
import { Cluster } from './Layout'
import { Loading } from './Fallback'

// « MONTRER FLIPP », ONE AFTER THE OTHER (2026-09-11). Marc, from the till: « a flow
// where it's easy to Montrer Flipp one after the other without too many clicks ».
// Until now the door was a link: a new tab per pick, then back to Babillard, back to
// the grid, the next tile, its card, its link — five taps and two app switches per
// item, at a till. And the Flipp APP cannot be the answer yet: its universal-link
// parser does not open on an item (lib/deals flippItemUrl says how that was proven).
//
// What CAN be done was checked against the real site the same day: flipp.com sends
// no `X-Frame-Options` and no `frame-ancestors` (its CSP is a <meta>, which cannot
// carry that directive), and the item page has no frame-buster — it renders whole
// inside an <iframe> on an iPhone-sized viewport: store, photo, name, price, their
// own « Ajouter à la liste », the dates. So the page a cashier accepts is shown HERE,
// full-screen, and « Suivant » swaps the frame to the next pick. One tap per item,
// no app switch. Same shape as FlyerViewer (a full-screen overlay over the till,
// z-index 70, classified BELOW_SHEET in layer-order.test.ts).
//
// Two honest limits, both designed around rather than hidden:
//   · A framed third-party page keeps PARTITIONED storage on iOS/Chrome: an « Ajouter
//     à la liste » tapped inside the frame lands in a list Flipp's own tab and app
//     never see. This pager is for SHOWING; adding to Flipp's list stays with the
//     grid's tap-by-tap loop (a real tab) and « Envoyer à Flipp ».
//   · Flipp could start refusing frames any day, and a refused frame paints blank
//     with no event we can read. So the bar always carries « Ouvrir dans Flipp » —
//     the same URL in a real tab — and the veil lifts on the frame's load event
//     (which a refusal also fires), so nothing ever spins forever.
export function FlippPager({
  picks,
  index,
  postal,
  onIndex,
  onClose,
}: {
  /** The picks that have a live Flipp page (a Flipp id, not ended) — the till's `clippable`. */
  picks: Pick[]
  /** Which pick the frame shows; the pager itself asks to move. */
  index: number
  postal: string
  onIndex: (next: number) => void
  onClose: () => void
}) {
  const t = useT()
  const ref = useRef<HTMLDivElement>(null)
  useModal(ref, onClose)
  const pick = picks[Math.min(index, picks.length - 1)]
  const url = pick ? flippItemUrl(pick.deal.id, postal) : null
  // The veil rides the URL: a new pick → loading again until its frame reports in.
  const [loadedUrl, setLoadedUrl] = useState<string | null>(null)
  const loading = url != null && loadedUrl !== url
  const last = index >= picks.length - 1
  // ← / → on a keyboard (the desktop rule: nothing reachable only by a thumb). The
  // frame swallows keys once focused; the buttons below are the mirror that always
  // works, this is the shortcut while the bar has focus.
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' && !last) onIndex(index + 1)
      else if (e.key === 'ArrowLeft' && index > 0) onIndex(index - 1)
    }
    el.addEventListener('keydown', onKey)
    return () => el.removeEventListener('keydown', onKey)
  }, [index, last, onIndex])

  if (!pick || !url) return null
  return (
    <div ref={ref} className="flipp-pager" role="dialog" aria-modal="true" aria-label={t.shop.showFlipp}>
      <div className="flipp-pager__bar">
        <span className="flipp-pager__title">
          <span className="flipp-pager__count mono">{t.shop.flippPagerOf(index + 1, picks.length)}</span>
          <span className="flipp-pager__for">{pick.itemText}</span>
        </span>
        {/* The real tab — the escape if a frame ever paints blank, and the door for a
            cashier who wants the page in the browser itself. */}
        <a className="btn btn--ghost mono flipp-pager__open" href={url} target="_blank" rel="noopener noreferrer">
          <InlineIcon name="arrow-up-right-bold" size={16} /> {t.shop.flippOpenTab}
        </a>
        <button type="button" className="btn btn--ghost mono" onClick={onClose} aria-label={t.shop.close}>
          <Icon name="x-bold" size={18} />
        </button>
      </div>
      <div className="flipp-pager__body">
        {loading && (
          <div className="flipp-pager__veil">
            <Loading />
          </div>
        )}
        {/* `key` on the URL: a fresh frame per pick — swapping `src` on one frame
            pushes a history entry per item on some browsers, and Back would then walk
            the frame instead of leaving the till. */}
        <iframe key={url} className="flipp-pager__frame" src={url} title={`${t.shop.showFlipp} — ${pick.deal.name}`} onLoad={() => setLoadedUrl(url)} />
      </div>
      <Cluster className="flipp-pager__nav">
        <button type="button" className="btn flipp-pager__prev" onClick={() => onIndex(index - 1)} disabled={index === 0}>
          <InlineIcon name="caret-left-bold" /> {t.shop.flippPagerPrev}
        </button>
        {last ? (
          <button type="button" className="btn btn--primary flipp-pager__next" onClick={onClose}>
            <InlineIcon name="check-bold" /> {t.common.done}
          </button>
        ) : (
          <button type="button" className="btn btn--primary flipp-pager__next" onClick={() => onIndex(index + 1)}>
            {t.shop.flippPagerNext} <InlineIcon name="caret-right-bold" />
          </button>
        )}
      </Cluster>
    </div>
  )
}
