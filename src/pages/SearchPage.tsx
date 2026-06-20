import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useT, useLang } from '../i18n'
import { api } from '../lib/api'
import { fold } from '../lib/normalize'
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
import { Icon, InlineIcon } from '../components/Icon'
import { useSceneClose, useEscapeKey } from '../lib/sceneNav'

// #30 — global search: ONE box across recipes, Le cercle people, events, and the
// shared list. A full-screen scene (deep-linkable: /search?q=…) that reads the
// SAME warm caches the pages already poll (no extra fetch) and matches with the
// shared accent-insensitive `fold`. Each hit is a direct link to where it lives —
// the recipe, the person, the day, the list. Capped per section so a broad term
// stays glanceable.
const CAP = 8

export function SearchPage() {
  const t = useT()
  const { lang } = useLang()
  const close = useSceneClose('/board')
  useEscapeKey(close)
  const [q, setQ] = useState('')

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
          placeholder={t.search.placeholder}
          aria-label={t.search.placeholder}
          autoFocus
          enterKeyHint="search"
        />

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
