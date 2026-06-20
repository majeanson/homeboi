import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useT, useLang } from '../i18n'
import { api } from '../lib/api'
import { fold } from '../lib/normalize'
import { CATS } from '../lib/cats'
import { CERCLE_KEY } from '../lib/queryKeys'
import { type Contact } from '../lib/cercle'
import { useRecipes, useBoardData } from '../lib/queryHooks'
import { recipeImg } from '../lib/recipes'
import { pictoFor } from '../lib/picto'
import { localDayStart } from '../lib/localDay'
import { type EventRow } from '../components/board/types'
import { SceneHead } from '../components/SceneHead'
import { EmptyState } from '../components/EmptyState'
import { Avatar } from '../components/Avatar'
import { Icon, InlineIcon, type IconName } from '../components/Icon'
import { useSceneClose, useEscapeKey } from '../lib/sceneNav'

// #30 — global search: ONE box across recipes, Le cercle people, events, and the
// shared list. A full-screen scene (deep-linkable: /search?q=…) that reads the
// SAME warm caches the pages already poll (no extra fetch) and matches with the
// shared accent-insensitive `fold`. Each hit is a direct link to where it lives —
// the recipe, the person, the day, the list. Capped per section so a broad term
// stays glanceable.
//
// #12 — the same box also ASKS the AI (POST /api/ask): a calm answer over your own
// data, tagged with the domain it reasoned over so the card shows the matching
// category look (reusing lib/cats), plus "not what you wanted?" links into the
// relevant sections + the Guide.
const CAP = 8

// The AI answer's domain — mirrors AnswerKind in functions/_lib/ai.ts.
type AnswerKind = 'meal' | 'event' | 'list' | 'chore' | 'recipe' | 'cercle' | 'note' | 'none'

// The answer card's look per domain — reuses lib/cats inks/washes so an AI answer
// reads in the SAME colour language as the board tiles it's about.
const ASK_LOOK: Record<AnswerKind, { icon: IconName; color: string; wash: string }> = {
  meal: { icon: CATS.meal.icon, color: CATS.meal.deep, wash: CATS.meal.wash },
  event: { icon: CATS.event.icon, color: CATS.event.deep, wash: CATS.event.wash },
  list: { icon: 'shopping-bag-bold', color: CATS.list.deep, wash: CATS.list.wash },
  chore: { icon: CATS.chore.icon, color: CATS.chore.deep, wash: CATS.chore.wash },
  recipe: { icon: 'book-open-bold', color: CATS.meal.deep, wash: CATS.meal.wash },
  cercle: { icon: CATS.cercle.icon, color: CATS.cercle.deep, wash: CATS.cercle.wash },
  note: { icon: 'push-pin-bold', color: CATS.list.deep, wash: CATS.list.wash },
  none: { icon: 'sparkle-bold', color: CATS.list.deep, wash: CATS.list.wash },
}

// "Not what you wanted?" — where each kind of answer lives, drawn from our existing
// hub sections + the Guide (Réglages ▸ Guide). Always ends with the Guide.
function relatedFor(kind: AnswerKind, t: ReturnType<typeof useT>): { to: string; label: string; icon: IconName }[] {
  const S = {
    board: { to: '/board', label: t.nav.board, icon: 'calendar-blank-bold' as IconName },
    kitchen: { to: '/kitchen', label: t.nav.kitchen, icon: 'fork-knife-bold' as IconName },
    liste: { to: '/liste', label: t.nav.list, icon: 'shopping-bag-bold' as IconName },
    cercle: { to: '/cercle', label: t.nav.cercle, icon: 'users-three-bold' as IconName },
    settings: { to: '/settings', label: t.nav.operator, icon: 'gear-six-bold' as IconName },
  }
  const guide = { to: '/settings?tab=guide', label: t.search.guide, icon: 'book-open-bold' as IconName }
  const map: Record<AnswerKind, { to: string; label: string; icon: IconName }[]> = {
    meal: [S.kitchen, S.liste],
    event: [S.board],
    list: [S.liste],
    chore: [S.settings, S.board],
    recipe: [S.kitchen],
    cercle: [S.cercle],
    note: [S.board],
    none: [S.board, S.kitchen, S.liste],
  }
  return [...map[kind], guide]
}

export function SearchPage() {
  const t = useT()
  const { lang } = useLang()
  const close = useSceneClose('/board')
  useEscapeKey(close)
  const [q, setQ] = useState('')
  // #12 — AI ask state. `answer` holds the prose + its domain (drives the card
  // look); `aiOff` latches the degraded path so the button hides once we know the
  // assistant is unbound; `askErr` is a soft "couldn't answer" with section links.
  const [asking, setAsking] = useState(false)
  const [answer, setAnswer] = useState<{ text: string; kind: AnswerKind } | null>(null)
  const [askErr, setAskErr] = useState(false)
  const [aiOff, setAiOff] = useState(false)

  async function ask() {
    const question = q.trim()
    if (!question || asking) return
    setAsking(true)
    setAskErr(false)
    setAnswer(null)
    try {
      const r = await api<{ answer: string | null; kind: AnswerKind; degraded: boolean }>('ask', {
        method: 'POST',
        body: { question },
      })
      if (r.degraded) setAiOff(true)
      else if (r.answer) setAnswer({ text: r.answer, kind: r.kind })
      else setAskErr(true)
    } catch {
      setAskErr(true)
    } finally {
      setAsking(false)
    }
  }

  const recipesData = useRecipes().data?.recipes ?? []
  const board = useBoardData().data
  const contacts = useQuery({ queryKey: CERCLE_KEY, queryFn: () => api<{ contacts: Contact[] }>('cercle') }).data?.contacts ?? []

  const needle = fold(q.trim())
  const res = useMemo(() => {
    if (!needle) return null
    const recipes = recipesData
      .filter((r) => fold(`${r.title} ${(r.ingredients ?? []).join(' ')} ${(r.tags ?? []).join(' ')}`).includes(needle))
      .slice(0, CAP)
    const people = contacts
      .filter((c) => fold(`${c.firstName} ${c.lastName} ${c.nickname ?? ''} ${(c.tags ?? []).join(' ')}`).includes(needle))
      .slice(0, CAP)
    // Events come across three board buckets; one event can sit in more than one —
    // dedupe by id before matching.
    const seen = new Set<string>()
    const allEvents: EventRow[] = [...(board?.today ?? []), ...(board?.tomorrow ?? []), ...(board?.upcoming ?? [])].filter((e) => {
      if (seen.has(e.id)) return false
      seen.add(e.id)
      return true
    })
    const events = allEvents.filter((e) => fold(e.title).includes(needle)).slice(0, CAP)
    const listItems = (board?.list ?? []).filter((li) => fold(li.text).includes(needle)).slice(0, CAP)
    return { recipes, people, events, listItems }
  }, [needle, recipesData, contacts, board])

  const total = res ? res.recipes.length + res.people.length + res.events.length + res.listItems.length : 0

  return (
    <div className="scene search" aria-label={t.search.title}>
      <SceneHead title={t.search.title} icon="magnifying-glass-bold" onClose={close} />
      <div className="scene__body search__body">
        <input
          className="input search__input"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void ask()
          }}
          placeholder={t.search.placeholder}
          aria-label={t.search.placeholder}
          autoFocus
          enterKeyHint="search"
        />

        {/* #12 — ask the AI the typed question (Enter does the same). */}
        {q.trim() && !aiOff && (
          <button type="button" className="btn btn--sm search__ask" onClick={ask} disabled={asking}>
            <Icon name="sparkle-bold" size={16} /> {t.search.ask}
          </button>
        )}

        {(asking || answer || askErr || aiOff) && (
          <div className="surface search__answer">
            {asking ? (
              <p className="search__asking mono">
                <InlineIcon name="sparkle-bold" /> {t.search.asking}
              </p>
            ) : answer ? (
              <>
                <div className="search__answer-head">
                  <span
                    className="search__answer-icon"
                    style={{ background: ASK_LOOK[answer.kind].wash, color: ASK_LOOK[answer.kind].color }}
                    aria-hidden="true"
                  >
                    <Icon name={ASK_LOOK[answer.kind].icon} size={20} />
                  </span>
                  <span className="search__answer-kind mono">{t.search.kinds[answer.kind]}</span>
                </div>
                <p className="search__answer-text">{answer.text}</p>
              </>
            ) : aiOff ? (
              <p className="search__asking mono">{t.search.askUnavailable}</p>
            ) : (
              <p className="search__asking mono">{t.search.askError}</p>
            )}

            {/* "Not what you wanted?" — related sections + the Guide. */}
            {(answer || askErr) && (
              <div className="search__related">
                <span className="search__related-head mono">{t.search.notWhat}</span>
                <div className="search__related-row">
                  {relatedFor(answer?.kind ?? 'none', t).map((d) => (
                    <Link key={d.to} to={d.to} className="search__related-chip">
                      <InlineIcon name={d.icon} /> {d.label}
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {!needle ? (
          <p className="search__hint mono">{t.search.hint}</p>
        ) : total === 0 ? (
          <EmptyState>{t.search.noResults}</EmptyState>
        ) : (
          <>
            {res!.recipes.length > 0 && (
              <Section label={t.search.recipes}>
                {res!.recipes.map((r) => (
                  <Link key={r.id} to={`/kitchen/recipe/${r.id}`} className="search__row">
                    <span className="search__pic" aria-hidden="true">
                      {recipeImg(r.image) ? <img src={recipeImg(r.image)!} alt="" /> : pictoFor(r.title, '🍳')}
                    </span>
                    <span className="search__main">
                      <span className="search__title">{r.title}</span>
                      {(r.tags ?? []).length > 0 && <span className="search__sub mono">{r.tags.join(' · ')}</span>}
                    </span>
                    <Icon name="arrow-right-bold" size={16} />
                  </Link>
                ))}
              </Section>
            )}

            {res!.people.length > 0 && (
              <Section label={t.search.people}>
                {res!.people.map((c) => (
                  <Link key={c.id} to={`/cercle/person/${c.id}`} className="search__row">
                    <span className="search__pic" aria-hidden="true">
                      <Avatar kind={c.photoKey ? 'photo' : null} photo={c.photoKey} colour="#C45E86" name={c.firstName} size={34} />
                    </span>
                    <span className="search__main">
                      <span className="search__title">{[c.firstName, c.lastName].filter(Boolean).join(' ') || c.nickname}</span>
                      {c.nickname && <span className="search__sub mono">« {c.nickname} »</span>}
                    </span>
                    <Icon name="arrow-right-bold" size={16} />
                  </Link>
                ))}
              </Section>
            )}

            {res!.events.length > 0 && (
              <Section label={t.search.events}>
                {res!.events.map((e) => (
                  <Link key={e.id} to={`/kitchen/day/${localDayStart(new Date(e.start_at * 1000))}`} className="search__row">
                    <span className="search__pic" aria-hidden="true">
                      <InlineIcon name={e.birthday ? 'cake-bold' : 'calendar-blank-bold'} />
                    </span>
                    <span className="search__main">
                      <span className="search__title">{e.title}</span>
                      <span className="search__sub mono">{new Date(e.start_at * 1000).toLocaleDateString(lang === 'fr' ? 'fr-CA' : 'en-CA', { weekday: 'short', day: 'numeric', month: 'short' })}</span>
                    </span>
                    <Icon name="arrow-right-bold" size={16} />
                  </Link>
                ))}
              </Section>
            )}

            {res!.listItems.length > 0 && (
              <Section label={t.search.listItems}>
                {res!.listItems.map((li) => (
                  <Link key={li.id} to={`/liste/item/${li.id}`} className="search__row">
                    <span className="search__pic" aria-hidden="true">{pictoFor(li.text, '🛒')}</span>
                    <span className="search__main">
                      <span className="search__title">{li.text}</span>
                    </span>
                    <Icon name="arrow-right-bold" size={16} />
                  </Link>
                ))}
              </Section>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section className="search__section">
      <h2 className="search__sectionhead mono">{label}</h2>
      <div className="search__rows">{children}</div>
    </section>
  )
}
