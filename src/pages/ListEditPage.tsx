import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { useWrite } from '../lib/write'
import { live } from '../lib/query'
import { useT } from '../i18n'
import { Loading } from '../components/Fallback'
import { Icon, InlineIcon } from '../components/Icon'
import { SceneHead } from '../components/SceneHead'
import { parseDeal, parseTerms, unstageDeal, type ListItem } from '../lib/picks'
import { money } from '../lib/deals'
import { BOARD_KEY } from '../lib/queryKeys'
import { useSceneClose, useEscapeKey } from '../lib/sceneNav'

// /liste/item/:itemId — edit one grocery line as a full-screen route (was a
// bottom sheet, flaky to scroll): rename it, manage the extra flyer-search
// synonyms (so "Œuf" can also match "egg"/"oeufs" in the deals lookup), unlink a
// staged deal, or remove it from the list. The line is read off the shared
// ['board'] cache by id, so there are no props to thread and it's deep-linkable.
export function ListEditPage() {
  const t = useT()
  const qc = useQueryClient()
  const write = useWrite()
  const { itemId = '' } = useParams()
  const close = useSceneClose('/liste')
  useEscapeKey(close)

  const { data: board } = useQuery({ queryKey: BOARD_KEY, queryFn: () => api<{ list: ListItem[] }>('board'), ...live })
  const item = board?.list?.find((i) => i.id === itemId) ?? null

  // Seed the editable fields once from the line. `seeded` guards against the live
  // board poll re-seeding (and wiping) an in-progress edit on every refetch.
  const [seeded, setSeeded] = useState(false)
  const [text, setText] = useState('')
  const [terms, setTerms] = useState<string[]>([])
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (item && !seeded) {
      setText(item.text)
      setTerms(parseTerms(item.search_terms))
      setSeeded(true)
    }
  }, [item, seeded])

  // The line is gone (cleared elsewhere, or a cold deep-link to a stale id) →
  // slip back to the list. Not while busy: a save/delete unmounts the line itself.
  useEffect(() => {
    if (board && !item && !busy) close()
  }, [board, item, busy, close])

  const deal = parseDeal(item?.deal_json)

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
    await write('list', {
      method: 'PATCH',
      body: { id: itemId, text: name, search_terms: allTerms },
      affectedKeys: [BOARD_KEY],
    }).catch(() => {})
    close()
  }

  async function unlink() {
    setBusy(true)
    await unstageDeal(qc, itemId)
    close()
  }

  async function remove() {
    setBusy(true)
    await write('list', { method: 'DELETE', body: { id: itemId }, affectedKeys: [BOARD_KEY] }).catch(() => {})
    close()
  }

  if (!board) return <Loading />
  if (!item) return null

  return (
    <div className="scene" aria-label={t.list.editTitle}>
      <SceneHead title={t.list.editTitle} subtitle={item.text} onClose={close} closeLabel={t.shop.close} />

      <div className="scene__body">
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
                      <Icon name="x-bold" size={12} />
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
              <InlineIcon name="tag-bold" /> {t.list.unlinkDeal} · {deal.merchant} {money(deal.price)}
            </button>
          )}

          <div className="li-edit__actions">
            <button type="button" className="btn btn--ghost li-edit__danger" onClick={remove} disabled={busy}>
              <InlineIcon name="trash-bold" /> {t.list.deleteItem}
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
