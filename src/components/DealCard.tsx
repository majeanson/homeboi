import { useLang, useT } from '../i18n'
import { type Deal, money } from '../lib/deals'
import { isGuest } from '../lib/device'
import { ZoomableImg } from './ZoomableImg'
import { InlineIcon } from './Icon'
import { ActionMenu } from './ActionMenu'

// One flyer-deal card: clipping image, store (+ best-price star), name, valid
// dates, price / unit-price / was-price, and a row of actions. Shared by the
// price-match proof sheet AND the standalone flyer browser so both render deals
// identically. Actions are opt-in via props:
//   onViewFlyer — open the full flyer (only when the deal has a flyerId)
//   onAddToList — drop this deal onto the shared grocery list (plain add)
//   onChoose    — pick this price for the cashier list (proof sheet only)
//   onStage     — add to the list AND link the deal for the cashier in one tap.
//                 When present it REPLACES the plain add: "add to list" always
//                 carries the deal to the cashier (image + price), so there's no
//                 separate "show the cashier" button to think about.
export function DealCard({
  deal,
  isBest,
  isChosen,
  added,
  staged,
  addedTo,
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
  // The EXISTING list line this deal rode on (deal ↔ item: « Pommes Gala 3 lb »
  // lands on « Pommes »). Shown instead of the plain label so a reuse doesn't look
  // like nothing happened — null/undefined = it made a new line.
  addedTo?: string | null
  onViewFlyer?: (deal: Deal) => void
  onAddToList?: (name: string) => void
  onChoose?: (deal: Deal) => void
  onStage?: (deal: Deal) => void
}) {
  const t = useT()
  const { lang } = useLang()
  // Read-only guest: viewing the deal + opening the flyer are reads (keep), but
  // add-to-list / choose / stage all write — hide them.
  const ro = isGuest()
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
          {isBest && (
            <span className="deal__best mono">
              <InlineIcon name="star-fill" size={12} /> {t.shop.best}
            </span>
          )}
        </span>
        <span className="deal__name">{deal.name}</span>
        <span className="deal__dates mono">{deal.validTo ? `${t.shop.until} ${fmtDate(deal.validTo)}` : ''}</span>
        <span className="deal__actions">
          {/* One "add to list" action: it links the deal for the cashier when it
              can (onStage), else a plain add. No separate "show the cashier". It's
              the ONE thing a deal card is tapped for, so it stays a real button;
              seeing the flyer, price-matching and sharing ride the ⋯ beside it. */}
          {ro ? null : onStage ? (
            <button
              type="button"
              className={`deal__choose mono${staged ? ' is-chosen' : ''}`}
              onClick={() => onStage(deal)}
            >
              <InlineIcon name={staged ? 'check-bold' : 'plus-bold'} />{' '}
              {staged && addedTo ? t.shop.addedTo(addedTo) : t.shop.addToList}
            </button>
          ) : onAddToList ? (
            <button type="button" className="deal__choose mono" onClick={() => onAddToList(deal.name)}>
              <InlineIcon name={added ? 'check-bold' : 'plus-bold'} />{' '}
              {added && addedTo ? t.shop.addedTo(addedTo) : t.shop.addToList}
            </button>
          ) : null}
          <ActionMenu
            items={[
              ...(deal.flyerId != null && onViewFlyer
                ? [{ icon: 'newspaper-bold' as const, label: t.shop.viewFlyer, onSelect: () => onViewFlyer(deal) }]
                : []),
              ...(!ro && onChoose
                ? [{ icon: 'check-bold' as const, label: isChosen ? t.shop.chosen : t.shop.choose, onSelect: () => onChoose(deal) }]
                : []),
              ...(navigator.share
                ? [
                    {
                      icon: 'arrow-up-right-bold' as const,
                      label: t.shop.share,
                      onSelect: () => {
                        const lines = [
                          `${deal.name} — ${money(deal.price)}`,
                          deal.merchant,
                          deal.validTo ? `${t.shop.until} ${fmtDate(deal.validTo)}` : '',
                        ].filter(Boolean)
                        void navigator.share({ title: deal.name, text: lines.join('\n') })
                      },
                    },
                  ]
                : []),
            ]}
          />
        </span>
      </div>
      <div className="deal__price">
        <span className="deal__now">{money(deal.price)}</span>
        {deal.unitPrice != null ? (
          <span className={`deal__unit mono${deal.unitApprox ? ' deal__unit--approx' : ''}`}>
            {deal.unitApprox && (
              <>
                <InlineIcon name="approximate-equals-bold" size={11} />{' '}
              </>
            )}
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
