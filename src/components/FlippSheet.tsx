import { useState } from 'react'
import { useT } from '../i18n'
import { settingsHref } from '../lib/settingsNav'
import { FLIPP_CLEAR_PAYLOAD, flippAddTextsUrl, flippBundle, flippListOpenUrl, flippListPayload } from '../lib/flippList'
import { flippListUrl, type Pick } from '../lib/deals'
import type { ListItem } from '../lib/picks'
import { Chip } from './Chip'
import { Cluster } from './Layout'
import { Icon, InlineIcon } from './Icon'
import { Modal } from './Modal'

// « Ma liste Flipp » — every LIST-level Flipp act, in one place, opened from La liste.
//
// WHY IT IS NOT AT THE TILL ANY MORE (2026-09-12). The till and this sheet answer two
// questions at two different moments. « Montrer à la caisse » is for standing at the
// register with a cashier waiting: tap the item she is scanning, show the deal. Sending
// your list to Flipp is something you do at home, before you leave. Those four doors
// shared one row because they shared a word (« Flipp »), not a moment — and the till,
// the one surface with someone waiting on you, carried the clutter. The per-item proof
// (« Montrer Flipp ») stays where it is contextual: on the item's own card.
//
// WHAT TRAVELS is said BEFORE the tap, not after. `flippBundle` (lib/flippList) is the
// ONE derivation, shared with anything else that sends: only rows still to buy go, and
// the checked ones that stay home are counted out loud rather than left to guess.
export function FlippSheet({
  open,
  onClose,
  rows,
  picks,
  postal,
}: {
  open: boolean
  onClose: () => void
  /** The whole list, checked rows included — the bundle decides what travels. */
  rows: ListItem[]
  /** EVERY staged deal on the list — never the till-filtered set. « À la caisse : Non »
   *  hides a store from its own register and says nothing about Flipp; passing the
   *  till's picks here silently demoted a hidden store's deals to words (2026-09-12). */
  picks: Pick[]
  postal: string | null
}) {
  const t = useT()
  // The confirmation must OUTLIVE the trip to flipp.com: every door here opens another
  // window that covers this page, so a toast would fire into a hidden tab and be gone
  // before anyone looked back (the CashierMode lesson, kept).
  const [done, setDone] = useState<'idle' | 'sent' | 'deals' | 'words' | 'clear'>('idle')

  const bundle = flippBundle(rows, picks)
  const total = bundle.clippable.length + bundle.terms.length
  const sendUrl = flippAddTextsUrl(bundle.sendTerms, postal) ?? flippListUrl(postal)

  return (
    <Modal open={open} onClose={onClose} title={t.shop.flippSheet} className="flippsheet">
      {!postal ? (
        // Every door below needs the household postal (Flipp keys its whole catalogue
        // on it), so say the one thing that unblocks them instead of showing four
        // buttons that would all fail.
        <>
          <p className="mono">{t.shop.flippNeedPostal}</p>
          <Chip to={settingsHref({ tab: 'liste', focus: 'shop' })}>{t.shop.flippSetPostal}</Chip>
        </>
      ) : (
        <>
          {/* WHAT WILL GO — the question this screen used to answer only afterwards. */}
          <p className="flippsheet__what">
            {total > 0 ? t.shop.flippWillSend(total, bundle.clippable.length) : t.shop.flippNothingToSend}
          </p>
          <p className="flippsheet__rule mono">
            {t.shop.flippOnlyUnchecked}
            {bundle.keptChecked > 0 && <> {t.shop.sentKeptChecked(bundle.keptChecked)}</>}
          </p>

          {/* A staged deal that cannot travel AS a deal still travels — as its words,
              without the photo or the price. From Flipp that is indistinguishable from
              « it wasn't added » (Marc's Maxi produce deal, 2026-09-12), so the sheet
              says it here, with the reason, before the tap rather than never. */}
          {bundle.demotedEnded + bundle.demotedNoId > 0 && (
            <p className="flippsheet__demoted mono">
              {t.shop.flippAsWords(bundle.demotedEnded + bundle.demotedNoId)}{' '}
              {[bundle.demotedEnded > 0 ? t.shop.flippWhyEnded : null, bundle.demotedNoId > 0 ? t.shop.flippWhyNoId : null]
                .filter(Boolean)
                .join(' · ')}
            </p>
          )}

          {/* ONE VERB, THREE CARGOES. The doors differ by WHAT THEY CARRY, never by
              their verb — the whole point of the 2026-09-12 vocabulary pass. The two
              that ride the bookmark sit together; the no-bookmark one is below with
              the line that says why it exists. */}
          <Cluster className="flippsheet__doors">
            {/* Everything: the deals with their photos, plus the written lines. The
                list rides in the address (flippListOpenUrl's #bb=), where the bookmark
                reads it before anything else. */}
            <a
              className="btn btn--primary flippsheet__send"
              href={flippListOpenUrl(postal, undefined, bundle.payload)}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setDone('sent')}
              aria-disabled={total === 0}
            >
              <InlineIcon name="arrow-up-right-bold" /> {t.shop.toFlipp}
            </a>
            {/* THE DEALS ALONE (Marc, 2026-09-12: « only copy deals and not all items »)
                — put this week's finds in Flipp without emptying the whole grocery list
                into it. Same payload minus its `items` half. Hidden when there is no
                deal to send: a door whose cargo is empty is noise, not an option. */}
            {bundle.clippable.length > 0 && (
              <a
                className="btn btn--ghost flippsheet__deals"
                href={flippListOpenUrl(postal, undefined, flippListPayload(bundle.clippable))}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setDone('deals')}
              >
                <InlineIcon name="tag-bold" /> {t.shop.toFlippDeals}
              </a>
            )}
          </Cluster>
          {bundle.clippable.length > 0 && (
            <p className="flippsheet__why mono">{t.shop.flippWillSendDeals(bundle.clippable.length)}</p>
          )}

          {/* The words-only door, through Flipp's own universal link — the way in for a
              phone with no bookmark set up. */}
          <a
            className="btn btn--ghost flippsheet__words"
            href={sendUrl!}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setDone('words')}
          >
            <InlineIcon name="arrow-up-right-bold" /> {t.shop.sendToFlipp}
          </a>
          <p className="flippsheet__why mono">{t.shop.sendToFlippWhy}</p>

          {/* VIDER — rare, and destructive on the other side, so it sits apart and
              quiet. The bookmark asks again ON flipp.com, naming what is lost; that
              confirm IS the undo tier (nothing here can reach across and put it back). */}
          <a
            className="btn btn--ghost flippsheet__clear"
            href={flippListOpenUrl(postal, undefined, FLIPP_CLEAR_PAYLOAD)}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setDone('clear')}
          >
            <InlineIcon name="trash-bold" /> {t.shop.flippClearList}
          </a>

          {done !== 'idle' && (
            <p className="flippsheet__done mono">
              <Icon name="check-bold" size={14} />{' '}
              {done === 'clear' ? t.shop.flippClearCopied : done === 'words' ? t.shop.sentToFlipp(bundle.sendTerms.length) : t.shop.flippCopied}{' '}
              {/* The same door again, cargo included — for a window that never opened
                  (a blocked popup, a phone that ignored the Safari scheme). */}
              <a
                className="btn btn--ghost flippsheet__open"
                href={flippListOpenUrl(postal, undefined, done === 'clear' ? FLIPP_CLEAR_PAYLOAD : done === 'deals' ? flippListPayload(bundle.clippable) : bundle.payload)}
                target="_blank"
                rel="noopener noreferrer"
              >
                <InlineIcon name="arrow-up-right-bold" /> {t.shop.openFlipp}
              </a>
            </p>
          )}

          <Chip to={settingsHref({ tab: 'liste', focus: 'flipp' })}>{t.shop.flippHow}</Chip>
        </>
      )}
    </Modal>
  )
}
