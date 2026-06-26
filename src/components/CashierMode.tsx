import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { EmptyState } from './EmptyState'
import { useLang, useT } from '../i18n'
import { type Pick, money } from '../lib/deals'
import { FlyerViewer, prefetchFlyer } from './FlyerViewer'
import { ZoomableImg } from './ZoomableImg'
import { Icon, InlineIcon } from './Icon'
import { useModal } from '../lib/useModal'

// "Show the cashier" mode. The user holds the phone (the cashier never does) and
// items hit the belt in an unpredictable order — so this is RANDOM-ACCESS, not a
// sequential stepper:
//   grid — every picked deal as a tile; tap the one being scanned right now.
//   peek — that pick blown up full-screen (store, picture, BIG price, unit price,
//          dates, "view flyer"), with ‹ Retour back to the grid to pick the next.
// A tapped tile dims with a ✓ (ephemeral, this trip only — no count, stays calm) so
// a big cart stays trackable. Deliberately oversized + low-text for use under pressure.
export function CashierMode({
  picks,
  onClose,
}: {
  picks: Pick[]
  onClose: () => void
}) {
  const t = useT()
  const { lang } = useLang()
  const qc = useQueryClient()
  // Esc-to-close + scroll-lock + focus-trap. One ref rides whichever view is
  // rendered (only one — grid or peek — is mounted at a time).
  const cashierRef = useRef<HTMLDivElement>(null)
  useModal(cashierRef, onClose)
  // selected === null → the grid; a Pick → its full-screen proof peek.
  const [selected, setSelected] = useState<Pick | null>(null)
  // Which picks have been shown this trip — dims the tile with a ✓ so a big,
  // unordered cart stays trackable. Ephemeral by design (resets when the mode
  // closes), and carries NO count/score, so it stays calm (no streak/points).
  const [shown, setShown] = useState<Set<string>>(() => new Set())
  const [flyerOpen, setFlyerOpen] = useState(false)

  // Opened at home on wifi → warm each pick's flyer + clipping images so the
  // full-flyer proof is ready at the till even on poor signal. Re-runs only when
  // the set of flyers changes (keyed by flyerKey); prefetchFlyer is cached.
  const flyerKey = picks.map((p) => p.deal.flyerId ?? '').join(',')
  useEffect(() => {
    for (const p of picks) if (p.deal.flyerId != null) prefetchFlyer(qc, p.deal.flyerId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flyerKey, qc])

  const fmtDate = (iso: string | null) => {
    if (!iso) return ''
    const d = new Date(iso)
    return Number.isNaN(d.getTime())
      ? ''
      : d.toLocaleDateString(lang === 'fr' ? 'fr-CA' : 'en-CA', { month: 'short', day: 'numeric' })
  }

  // Show a pick: mark it shown (✓) and open its proof.
  const show = (p: Pick) => {
    setShown((s) => (s.has(p.itemId) ? s : new Set(s).add(p.itemId)))
    setSelected(p)
  }

  // Nothing picked yet — CashierPage redirects in this case, but guard anyway.
  if (picks.length === 0) {
    return (
      <div ref={cashierRef} className="cashier" role="dialog" aria-modal="true" aria-label={t.shop.cashierTitle}>
        <div className="cashier__bar">
          <span className="cashier__title">{t.shop.cashierTitle}</span>
          <button type="button" className="btn btn--ghost mono" onClick={onClose} aria-label={t.shop.close}>
            <Icon name="x-bold" size={18} />
          </button>
        </div>
        <EmptyState>{t.shop.none}</EmptyState>
      </div>
    )
  }

  // ---- Grid: every picked deal as a tile, tap the one being scanned ---------
  if (!selected) {
    return (
      <div ref={cashierRef} className="cashier" role="dialog" aria-modal="true" aria-label={t.shop.cashierTitle}>
        <div className="cashier__bar">
          <span className="cashier__title">{t.shop.cashierTitle}</span>
          {/* Reset the within-trip ✓ marks — only when there's something to reset. */}
          {shown.size > 0 && (
            <button type="button" className="btn btn--ghost mono cashier__reset" onClick={() => setShown(new Set())}>
              <InlineIcon name="arrow-counter-clockwise-bold" /> {t.shop.showAgain}
            </button>
          )}
          <button type="button" className="btn btn--ghost mono" onClick={onClose} aria-label={t.shop.close}>
            <Icon name="x-bold" size={18} />
          </button>
        </div>

        <div className="cashier__grid-wrap">
          <p className="cashier__hint mono">{t.shop.tapToShow}</p>
          <ul className="cashier__grid">
            {picks.map((p) => {
              const isShown = shown.has(p.itemId)
              return (
                <li key={p.itemId}>
                  <button
                    type="button"
                    className={`cashier__tile${isShown ? ' is-shown' : ''}`}
                    onClick={() => show(p)}
                  >
                    {p.deal.image && (
                      <img className="cashier__tile-img" src={p.deal.image} alt="" loading="lazy" />
                    )}
                    <span className="cashier__tile-for">{p.itemText}</span>
                    <span className="cashier__tile-name mono">{p.deal.name}</span>
                    <span className="cashier__tile-price">{money(p.deal.price)}</span>
                    <span className="cashier__tile-store mono">{p.deal.merchant}</span>
                    {isShown && (
                      <span className="cashier__tile-check" aria-label={t.shop.shown}>
                        <Icon name="check-bold" size={14} />
                      </span>
                    )}
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      </div>
    )
  }

  // ---- Peek: the picked deal blown up, the proof to hold up at the till -----
  const d = selected.deal

  return (
    <div ref={cashierRef} className="cashier" role="dialog" aria-modal="true" aria-label={t.shop.cashierTitle}>
      <div className="cashier__bar">
        <button
          type="button"
          className="btn btn--ghost mono"
          onClick={() => setSelected(null)}
          aria-label={t.common.back}
        >
          <InlineIcon name="caret-left-bold" /> {t.common.back}
        </button>
        <button type="button" className="btn btn--ghost mono" onClick={onClose} aria-label={t.shop.close}>
          <Icon name="x-bold" size={18} />
        </button>
      </div>

      {/* Proof = picture | facts. Side-by-side on a wide tablet (fills the space, no
          dead margins); stacked on a phone. Big type + numbers throughout so it reads
          across the counter (NFR accessibility). */}
      <div className="cashier__stage">
        <div className="bigcard">
          {d.image && (
            <div className="bigcard__media">
              <ZoomableImg className="bigcard__img" src={d.image} alt={d.name} />
            </div>
          )}
          <div className="bigcard__info">
            {/* Source flyer band: logo + store, so "where this deal is from" reads at
                a glance before the cashier even taps "Voir la circulaire". */}
            <span className="bigcard__store">
              {d.logo && <img className="bigcard__logo" src={d.logo} alt="" loading="lazy" />}
              {d.merchant}
            </span>
            <span className="bigcard__for">
              {t.shop.matchFor} <strong>{selected.itemText}</strong>
            </span>
            <span className="bigcard__name">{d.name}</span>
            <span className="bigcard__price">{money(d.price)}</span>
            {/* Validity is high-level info — a cashier checks the deal is still valid
                before adjusting — so it's the loud, prominent dated pill, not fine
                print. No edit/delete here: the peek is a clean proof to hold up. */}
            {d.validTo && (
              <span className="bigcard__valid">
                <InlineIcon name="calendar-dots-bold" size={28} /> {t.shop.until} {fmtDate(d.validTo)}
              </span>
            )}
            {d.flyerId != null && (
              <button type="button" className="btn bigcard__flyer" onClick={() => setFlyerOpen(true)}>
                <InlineIcon name="file-text-bold" /> {t.shop.viewFlyer}
              </button>
            )}
          </div>
        </div>
      </div>

      {flyerOpen && d.flyerId != null && (
        <FlyerViewer
          flyerId={d.flyerId}
          highlightId={d.id}
          title={d.merchant}
          logo={d.logo}
          premium={d.premium}
          onClose={() => setFlyerOpen(false)}
        />
      )}
    </div>
  )
}
