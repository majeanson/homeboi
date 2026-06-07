import { useLang, useT } from '../i18n'
import { type Deal, money } from '../lib/deals'
import { ZoomableImg } from './ZoomableImg'

// One flyer-deal card: clipping image, store (+ best-price star), name, valid
// dates, price / unit-price / was-price, and a row of actions. Shared by the
// price-match proof sheet AND the standalone flyer browser so both render deals
// identically. Actions are opt-in via props:
//   onViewFlyer — open the full flyer (only when the deal has a flyerId)
//   onAddToList — drop this deal onto the shared grocery list
//   onChoose    — pick this price for the cashier list (proof sheet only)
//   onStage     — add to the list AND stage for the cashier in one tap (browser)
export function DealCard({
  deal,
  isBest,
  isChosen,
  added,
  staged,
  onViewFlyer,
  onAddToList,
  onChoose,
  onStage,
}: {
  deal: Deal
  isBest?: boolean
  isChosen?: boolean
  added?: boolean
  staged?: boolean
  onViewFlyer?: (deal: Deal) => void
  onAddToList?: (name: string) => void
  onChoose?: (deal: Deal) => void
  onStage?: (deal: Deal) => void
}) {
  const t = useT()
  const { lang } = useLang()
  const fmtDate = (iso: string | null) => {
    if (!iso) return ''
    const d = new Date(iso)
    return Number.isNaN(d.getTime())
      ? ''
      : d.toLocaleDateString(lang === 'fr' ? 'fr-CA' : 'en-CA', { month: 'short', day: 'numeric' })
  }

  return (
    <li className={`deal${isBest ? ' deal--best' : ''}${isChosen ? ' deal--chosen' : ''}`}>
      {deal.image && <ZoomableImg className="deal__img" src={deal.image} alt={deal.name} />}
      <div className="deal__body">
        <span className="deal__merchant mono">
          {deal.merchant}
          {isBest && <span className="deal__best mono">★ {t.shop.best}</span>}
        </span>
        <span className="deal__name">{deal.name}</span>
        <span className="deal__dates mono">{deal.validTo ? `${t.shop.until} ${fmtDate(deal.validTo)}` : ''}</span>
        <span className="deal__actions">
          {deal.flyerId != null && onViewFlyer && (
            <button type="button" className="deal__flyer-btn mono" onClick={() => onViewFlyer(deal)}>
              {t.shop.viewFlyer} →
            </button>
          )}
          {onAddToList && (
            <button type="button" className="deal__choose mono" onClick={() => onAddToList(deal.name)}>
              {added ? `✓ ${t.shop.addToList}` : `+ ${t.shop.addToList}`}
            </button>
          )}
          {onChoose && (
            <button
              type="button"
              className={`deal__choose mono${isChosen ? ' is-chosen' : ''}`}
              onClick={() => onChoose(deal)}
            >
              {isChosen ? t.shop.chosen : t.shop.choose}
            </button>
          )}
          {onStage && (
            <button
              type="button"
              className={`deal__choose mono${staged ? ' is-chosen' : ''}`}
              onClick={() => onStage(deal)}
            >
              {staged ? `✓ ${t.shop.present}` : `🧾 ${t.shop.present}`}
            </button>
          )}
        </span>
      </div>
      <div className="deal__price">
        <span className="deal__now">{money(deal.price)}</span>
        {deal.unitPrice != null ? (
          <span className={`deal__unit mono${deal.unitApprox ? ' deal__unit--approx' : ''}`}>
            {deal.unitApprox ? '≈ ' : ''}
            {money(deal.unitPrice)}
            {deal.unitLabel}
          </span>
        ) : (
          <span className="deal__unit deal__unit--none mono">{t.shop.noUnit}</span>
        )}
        {deal.wasPrice != null && deal.wasPrice > (deal.price ?? 0) && (
          <span className="deal__was mono">
            {t.shop.was} {money(deal.wasPrice)}
          </span>
        )}
      </div>
    </li>
  )
}
