import { useMemo, useState } from 'react'
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
                // Open the matching cards while searching, so a hit is visible at once.
                <details key={e.id} className="guide__card" open={q.length > 0}>
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
