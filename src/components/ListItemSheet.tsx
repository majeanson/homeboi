import { useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { useT } from '../i18n'
import { parseDeal, parseTerms, unstageDeal } from '../lib/picks'
import { money } from '../lib/deals'
import { BOARD_KEY } from '../lib/queryKeys'
import { useModal } from '../lib/useModal'
import { useSwipeToDismiss } from '../lib/useSwipeToDismiss'

// Edit one grocery line: rename it, manage the extra flyer-search synonyms (so
// "Œuf" can also match "egg"/"oeufs" in the deals lookup), unlink a staged deal,
// or remove it from the list. Reuses the price-match sheet's keyboard-safe shell
// (.pm-overlay is pinned to the visual viewport, so it rides above the keyboard).
export function ListItemSheet({
  item,
  onClose,
}: {
  item: { id: string; text: string; deal_json?: string | null; search_terms?: string | null }
  onClose: () => void
}) {
  const t = useT()
  const qc = useQueryClient()
  const [text, setText] = useState(item.text)
  const [terms, setTerms] = useState<string[]>(() => parseTerms(item.search_terms))
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const deal = parseDeal(item.deal_json)

  // Esc / scroll-lock / focus-trap on the overlay; swipe-down-to-close on the sheet.
  const overlayRef = useRef<HTMLDivElement>(null)
  const sheetRef = useRef<HTMLDivElement>(null)
  useModal(overlayRef, onClose)
  useSwipeToDismiss(sheetRef, onClose)

  function addTerm(raw: string) {
    const v = raw.trim()
    if (!v) return
    // Case/accent-blind dedupe so "Œuf" and "œuf" don't both land.
    const fold = (s: string) => s.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '')
    if (terms.some((x) => fold(x) === fold(v))) {
      setDraft('')
      return
    }
    setTerms((xs) => [...xs, v])
    setDraft('')
  }
  function removeTerm(i: number) {
    setTerms((xs) => xs.filter((_, k) => k !== i))
  }

  async function save() {
    const name = text.trim()
    if (!name || busy) return
    setBusy(true)
    // Fold a still-typed term in rather than silently dropping it.
    const allTerms = draft.trim() ? [...terms, draft.trim()] : terms
    await api('list', { method: 'PATCH', body: { id: item.id, text: name, search_terms: allTerms } }).catch(() => {})
    await qc.invalidateQueries({ queryKey: BOARD_KEY })
    setBusy(false)
    onClose()
  }

  async function unlink() {
    setBusy(true)
    await unstageDeal(qc, item.id)
    setBusy(false)
    onClose()
  }

  async function remove() {
    setBusy(true)
    await api('list', { method: 'DELETE', body: { id: item.id } }).catch(() => {})
    await qc.invalidateQueries({ queryKey: BOARD_KEY })
    setBusy(false)
    onClose()
  }

  return (
    <div
      ref={overlayRef}
      className="pm-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={t.list.editTitle}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div ref={sheetRef} className="pm-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="pm-sheet__head">
          <div>
            <div className="hand-tag">{t.list.editTitle}</div>
            <h2 className="pm-sheet__title">{item.text}</h2>
          </div>
          <button type="button" className="btn btn--ghost mono" onClick={onClose} aria-label={t.shop.close}>
            ✕
          </button>
        </div>

        <div className="li-edit">
          <label className="li-edit__field">
            <span className="li-edit__label">{t.list.nameLabel}</span>
            <input
              className="input"
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && save()}
              aria-label={t.list.nameLabel}
            />
          </label>

          <div className="li-edit__field">
            <span className="li-edit__label">{t.list.termsLabel}</span>
            <span className="li-edit__hint">{t.list.termsHint}</span>
            {terms.length > 0 && (
              <div className="li-terms">
                {terms.map((term, i) => (
                  <span key={`${term}-${i}`} className="li-term">
                    {term}
                    <button
                      type="button"
                      className="li-term__x"
                      onClick={() => removeTerm(i)}
                      aria-label={`${t.shop.close} ${term}`}
                    >
                      ✕
                    </button>
                  </span>
                ))}
              </div>
            )}
            <input
              className="input"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ',') {
                  e.preventDefault()
                  addTerm(draft)
                }
              }}
              placeholder={t.list.addTerm}
              aria-label={t.list.addTerm}
            />
          </div>

          {deal && (
            <button type="button" className="btn btn--ghost li-edit__row" onClick={unlink} disabled={busy}>
              🏷️ {t.list.unlinkDeal} · {deal.merchant} {money(deal.price)}
            </button>
          )}

          <div className="li-edit__actions">
            <button type="button" className="btn btn--ghost li-edit__danger" onClick={remove} disabled={busy}>
              🗑 {t.list.deleteItem}
            </button>
            <button type="button" className="btn btn--primary" onClick={save} disabled={busy || !text.trim()}>
              {t.list.save}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
