import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useLang, useT } from '../../i18n'
import { GUIDE, GUIDE_GROUPS, type GuideEntry } from '../../lib/guideContent'

// Réglages ▸ Guide — the whole how-it-works manual in one place. Each concept is
// a collapsible card (native <details>, so it stays accessible and calm). A
// search box filters across titles, the one-line "what", and every point, in the
// current language. Content lives in lib/guideContent.ts; this is just the view.
export function GuideSection() {
  const t = useT()
  const { lang } = useLang()
  const [query, setQuery] = useState('')
  const [params, setParams] = useSearchParams()

  // A contextual "?" elsewhere links here as ?card=<id> (see HelpDot). Open that
  // card and scroll to it. We mirror the id into local state and CONSUME the
  // param (replace) so a refresh/back doesn't re-force it and the parent can
  // collapse it again. The effect (not initial state) is the real driver — it
  // also handles the case where the Guide tab is already mounted.
  const [openId, setOpenId] = useState<string | null>(() => params.get('card'))
  const targetRef = useRef<HTMLDetailsElement | null>(null)
  useEffect(() => {
    const card = params.get('card')
    if (!card) return
    setOpenId(card)
    const next = new URLSearchParams(params)
    next.delete('card')
    setParams(next, { replace: true })
  }, [params, setParams])
  useEffect(() => {
    if (openId && targetRef.current) targetRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [openId])

  const q = query.trim().toLowerCase()
  const matches = useMemo(() => {
    if (!q) return GUIDE
    const hit = (e: GuideEntry) =>
      [e.title[lang], e.what[lang], ...e.points.flatMap((p) => [p.label[lang], p.detail[lang]])]
        .join(' ')
        .toLowerCase()
        .includes(q)
    return GUIDE.filter(hit)
  }, [q, lang])

  return (
    <section className="surface operator__section guide">
      <h2>{t.operator.guideTitle}</h2>
      <p className="lead">{t.operator.guideHint}</p>

      <input
        type="search"
        className="guide__search"
        placeholder={t.operator.guideSearch}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        aria-label={t.operator.guideSearch}
      />

      {matches.length === 0 && <p className="feed-empty">{t.operator.guideNone}</p>}

      {GUIDE_GROUPS.map((group) => {
        const entries = matches.filter((e) => e.group === group.id)
        if (entries.length === 0) return null
        return (
          <div key={group.id} className="guide__group">
            <h3 className="guide__group-title">{group.label[lang]}</h3>
            <p className="guide__group-blurb mono">{group.blurb[lang]}</p>
            <div className="guide__cards">
              {entries.map((e) => (
                // Open the matching cards while searching, so a hit is visible at once;
                // also open (and scroll to) a card a contextual "?" deep-linked us to.
                <details
                  key={e.id}
                  ref={e.id === openId ? targetRef : undefined}
                  className={`guide__card${e.id === openId ? ' is-target' : ''}`}
                  open={q.length > 0 || e.id === openId}
                >
                  <summary className="guide__summary">
                    <span className="guide__icon" aria-hidden="true">
                      {e.icon}
                    </span>
                    <span className="guide__heads">
                      <span className="guide__title">{e.title[lang]}</span>
                      <span className="guide__what">{e.what[lang]}</span>
                    </span>
                  </summary>
                  <dl className="guide__points">
                    {e.points.map((p, i) => (
                      <div key={i} className="guide__point">
                        <dt>{p.label[lang]}</dt>
                        <dd>{p.detail[lang]}</dd>
                      </div>
                    ))}
                  </dl>
                </details>
              ))}
            </div>
          </div>
        )
      })}
    </section>
  )
}
