import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { EmptyState } from './EmptyState'
import { useLang, useT } from '../i18n'
import { type Pick, money } from '../lib/deals'
import { isGuest } from '../lib/device'
import { FlyerViewer, prefetchFlyer } from './FlyerViewer'
import { ZoomableImg } from './ZoomableImg'
import { Icon, InlineIcon } from './Icon'
import { useModal } from '../lib/useModal'

// "Show the cashier" mode. Two phases:
//   review  — every picked deal in a list; revise or remove any before you go.
//   present — a big one-card-at-a-time stepper to hold up at the till: store,
//             picture, BIG price, unit price, dates, and a "view flyer" button.
//             Back / Next, a progress count, nothing else to think about.
// Deliberately oversized and low-text so it's usable at a glance under pressure.
export function CashierMode({
  picks,
  onRevise,
  onRemove,
  onClose,
}: {
  picks: Pick[]
  onRevise: (pick: Pick) => void
  onRemove: (itemId: string) => void
  onClose: () => void
}) {
  const t = useT()
  const { lang } = useLang()
  const qc = useQueryClient()
  // Read-only guest: the present-phase stepper is all reads (keep), but the review
  // phase's revise/remove per pick are writes — hide that action cluster.
  const ro = isGuest()
  // Esc-to-close + scroll-lock + focus-trap. One ref rides whichever phase view
  // is rendered (only one is mounted at a time).
  const cashierRef = useRef<HTMLDivElement>(null)
  useModal(cashierRef, onClose)
  const [phase, setPhase] = useState<'review' | 'present' | 'thanks'>('review')
  const [idx, setIdx] = useState(0)
  const [flyerOpen, setFlyerOpen] = useState(false)
  // After the last deal: a "thank you" hand-back screen. The Continue button only
  // appears after a 5s pause, so the device is calmly handed back to the user.
  const [canContinue, setCanContinue] = useState(false)
  useEffect(() => {
    if (phase !== 'thanks') return
    setCanContinue(false)
    const id = setTimeout(() => setCanContinue(true), 5000)
    return () => clearTimeout(id)
  }, [phase])

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

  // Nothing picked yet — shouldn't normally open, but guard anyway.
  if (picks.length === 0) {
    return (
      <div ref={cashierRef} className="cashier" role="dialog" aria-modal="true">
        <div className="cashier__bar">
          <span className="cashier__title">{t.shop.cashierTitle}</span>
          <button
            type="button"
            className="btn btn--ghost mono"
            onClick={() => {
              setIdx(0)
              setPhase('present')
            }}
          >
            {t.shop.present} ({picks.length}) <InlineIcon name="arrow-right-bold" />
          </button>
          <button type="button" className="btn btn--ghost mono" onClick={onClose} aria-label={t.shop.close}>
            <Icon name="x-bold" size={18} />
          </button>
        </div>
        <EmptyState>{t.shop.none}</EmptyState>
      </div>
    )
  }

  // ---- Review phase: tweak picks before presenting -------------------------
  if (phase === 'review') {
    return (
      <div ref={cashierRef} className="cashier" role="dialog" aria-modal="true" aria-label={t.shop.cashierTitle}>
        <div className="cashier__bar">
          {/* No redundant title here: the big CTA already reads "Montrer à la
              caisse". It lives up next to ✕, NOT as a bottom bar button — on iOS
              Safari a portal's bottom edge sits under the browser toolbar, so a
              footer CTA there is unreachable; the top bar is always clear. */}
          <button
            type="button"
            className="btn btn--primary mono cashier__present cashier__present--lead"
            onClick={() => {
              setIdx(0)
              setPhase('present')
            }}
          >
            {t.shop.present} ({picks.length}) <InlineIcon name="arrow-right-bold" />
          </button>
          <button type="button" className="btn btn--ghost mono" onClick={onClose} aria-label={t.shop.close}>
            <Icon name="x-bold" size={18} />
          </button>
        </div>

        <div className="cashier__review">
          <ul className="review-list">
            {picks.map((p) => (
              <li key={p.itemId} className="review-row">
                {p.deal.image && <ZoomableImg className="review-row__img" src={p.deal.image} alt={p.deal.name} />}
                <div className="review-row__body">
                  <span className="review-row__for mono">{p.itemText}</span>
                  <span className="review-row__name">{p.deal.name}</span>
                  <span className="review-row__meta mono">
                    {p.deal.merchant} · {money(p.deal.price)}
                    {p.deal.unitPrice != null ? ` · ${money(p.deal.unitPrice)}${p.deal.unitLabel}` : ''}
                  </span>
                </div>
                {!ro && (
                  <div className="review-row__actions">
                    <button type="button" className="btn btn--ghost mono" onClick={() => onRevise(p)}>
                      {t.shop.choose}
                    </button>
                    <button
                      type="button"
                      className="btn btn--ghost mono review-row__del"
                      onClick={() => onRemove(p.itemId)}
                      aria-label={t.shop.clearPicks}
                    >
                      <Icon name="x-bold" size={15} />
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      </div>
    )
  }

  // ---- Thanks phase: hand the device back, Continue after a 5s pause -------
  if (phase === 'thanks') {
    return (
      <div ref={cashierRef} className="cashier cashier--thanks" role="dialog" aria-modal="true" aria-label={t.shop.thanks}>
        <div className="cashier__thanks">
          <span className="cashier__thanks-emoji" aria-hidden="true">
            <Icon name="heart-fill" size={56} color="#E8B84B" />
          </span>
          <h2 className="cashier__thanks-title">{t.shop.thanks}</h2>
          <p className="cashier__thanks-hint mono">{t.shop.handBack}</p>
          {canContinue && (
            <button type="button" className="btn btn--primary" onClick={onClose}>
              {t.shop.continueApp}
            </button>
          )}
        </div>
      </div>
    )
  }

  // ---- Present phase: big one-at-a-time stepper ----------------------------
  const cur = picks[Math.min(idx, picks.length - 1)]
  const d = cur.deal
  const atFirst = idx === 0
  const atLast = idx === picks.length - 1

  return (
    <div ref={cashierRef} className="cashier" role="dialog" aria-modal="true" aria-label={t.shop.cashierTitle}>
      <div className="cashier__bar">
        <button
          type="button"
          className="btn btn--ghost mono"
          onClick={() => setPhase('review')}
          aria-label={t.shop.prev}
        >
          <InlineIcon name="caret-left-bold" /> {t.shop.cashierTitle}
        </button>
        <span className="cashier__count mono">
          {idx + 1} / {picks.length}
        </span>
        <button type="button" className="btn btn--ghost mono" onClick={onClose} aria-label={t.shop.close}>
          <Icon name="x-bold" size={18} />
        </button>
      </div>

      <div className="cashier__stage">
        <div className="bigcard">
          {/* Source flyer band: logo + store, so "where this deal is from" reads at
              a glance before the cashier even taps "Voir la circulaire". */}
          <span className="bigcard__store">
            {d.logo && <img className="bigcard__logo" src={d.logo} alt="" loading="lazy" />}
            {d.merchant}
          </span>
          {d.image && <ZoomableImg className="bigcard__img" src={d.image} alt={d.name} />}
          <span className="bigcard__for mono">
            {t.shop.matchFor}: {cur.itemText}
          </span>
          <span className="bigcard__name">{d.name}</span>
          <span className="bigcard__price">{money(d.price)}</span>
          {d.unitPrice != null && (
            <span className="bigcard__unit mono">
              {d.unitApprox && (
                <>
                  <InlineIcon name="approximate-equals-bold" size={11} />{' '}
                </>
              )}
              {money(d.unitPrice)}
              {d.unitLabel}
            </span>
          )}
          {d.validTo && (
            <span className="bigcard__dates mono">
              {t.shop.until} {fmtDate(d.validTo)}
            </span>
          )}
          {d.flyerId != null && (
            <button type="button" className="btn bigcard__flyer" onClick={() => setFlyerOpen(true)}>
              <InlineIcon name="file-text-bold" /> {t.shop.viewFlyer}
            </button>
          )}
        </div>
      </div>

      <div className="cashier__nav">
        <button
          type="button"
          className="cashier__arrow"
          onClick={() => setIdx((i) => Math.max(0, i - 1))}
          disabled={atFirst}
          aria-label={t.shop.prev}
        >
          <Icon name="arrow-left-bold" size={20} /><span className="cashier__arrow-label">{t.shop.prev}</span>
        </button>
        {atLast ? (
          <button type="button" className="cashier__arrow cashier__arrow--done" onClick={() => setPhase('thanks')}>
            <Icon name="check-bold" size={20} /><span className="cashier__arrow-label">{t.shop.done}</span>
          </button>
        ) : (
          <button
            type="button"
            className="cashier__arrow cashier__arrow--next"
            onClick={() => setIdx((i) => Math.min(picks.length - 1, i + 1))}
            aria-label={t.shop.next}
          >
            <span className="cashier__arrow-label">{t.shop.next}</span><Icon name="arrow-right-bold" size={20} />
          </button>
        )}
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
