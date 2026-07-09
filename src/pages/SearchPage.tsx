import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useQuery, useIsFetching } from '@tanstack/react-query'
import { useT, useLang } from '../i18n'
import { api } from '../lib/api'
import { useAi } from '../lib/ai'
import { fold } from '../lib/normalize'
import { SEARCH_INDEX, drawingFields, type SearchFields, type PantryRow } from '../lib/searchIndex'
import { CATS } from '../lib/cats'
import { colourFor } from '../lib/things'
import { CERCLE_KEY, FAMILY_NOTES_KEY, BUSINESSES_KEY, ROUTINES_KEY, TODOS_KEY, CARNETS_KEY, HOME_PROJECTS_KEY, CARE_LOG_KEY, HOME_PINS_KEY, DRAWINGS_KEY, MEMBERS_KEY } from '../lib/queryKeys'
import { type Carnet, type CareLog, type HomePin, PIN_EMOJI } from '../lib/carnets'
import { type GalleryDrawing } from '../lib/drawingGallery'
import { type Member } from '../lib/members'
import { imgUrl } from '../lib/image'
import { type Contact, type Pet } from '../lib/cercle'
import { type FamilyNote } from '../lib/familyNotes'
import { firstLine } from '../lib/noteMarkdown'
import { type Business, BUSINESS_COLOUR } from '../lib/businesses'
import { type Routine, type HomeProject } from '../components/operator/types'
import { type TodosData } from '../lib/todos'
import { type ReserveData, RESERVE_KEY } from '../components/kitchen/types'
import { useCars } from '../lib/carPrefs'
import { useRecipes, useBoardData, usePantry } from '../lib/queryHooks'
import { recipeImg } from '../lib/recipes'
import { GUIDE } from '../lib/guideContent'
import { stripTokens, highlight } from '../lib/richText'
import { pictoFor } from '../lib/picto'
import { localDayStart } from '../lib/localDay'
import { type EventRow } from '../components/board/types'
import { SceneHead } from '../components/SceneHead'
import { EmptyState } from '../components/EmptyState'
import { Avatar } from '../components/Avatar'
import { Icon, InlineIcon, type IconName } from '../components/Icon'
import { useSceneClose, useEscapeKey } from '../lib/sceneNav'
import { AskAnswerCard, type AnswerKind } from '../lib/askAnswer'

// #30 — global search: ONE box across recipes, Le cercle people, events, and the
// shared list. A full-screen scene (deep-linkable: /search?q=…) that reads the
// SAME warm caches the pages already poll (no extra fetch) and matches with the
// shared accent-insensitive `fold`. Each hit is a direct link to where it lives —
// the recipe, the person, the day, the list. Capped per section so a broad term
// stays glanceable.
//
// …and the Guide: the same box also searches the in-app help (lib/guideContent —
// the ONE documentation taxonomy). A help hit deep-links into Réglages ▸ Guide,
// to the exact card (?card=id) — or, when only a sub-point matched, straight to
// that point (?card=id&point=i). So "where do I set X?" surfaces the doc, not
// just the data. Card prose carries [[card:…]]/[[icon:…]] tokens; we strip them
// to their visible words (richText.stripTokens) before matching.
//
// #12 — the same box also ASKS the AI (POST /api/ask): a calm answer over your own
// data, tagged with the domain it reasoned over so the card shows the matching
// category look (reusing lib/cats), plus "not what you wanted?" links into the
// relevant sections + the Guide.
const CAP = 8

// A Guide / help hit: the card's own icon + title, a subtitle (the card's
// one-liner, or the matched sub-point's label), and a deep-link into the Guide.
type GuideHit = { id: string; icon: IconName; title: string; sub: string; to: string }

export function SearchPage() {
  const t = useT()
  const { lang } = useLang()
  // #12 — the "Ask the AI" affordance only shows when AI is on (binding present AND
  // the household hasn't switched it off). The local fuzzy search below stays — it's
  // not AI. `aiOff` is the reactive fallback if a call still comes back degraded.
  const { enabled: aiEnabled } = useAi()
  const close = useSceneClose('/board')
  useEscapeKey(close)
  // The documented /search?q=… deep-link (D-33): seed the box from the URL and
  // mirror typing back (replace, so Back still leaves the scene in one step).
  // A bookmark / help-card link lands pre-filled; a refresh keeps the query.
  const [params, setParams] = useSearchParams()
  const [q, setQ] = useState(() => params.get('q') ?? '')
  const setQuery = (v: string) => {
    setQ(v)
    const next = new URLSearchParams(params)
    if (v) next.set('q', v)
    else next.delete('q')
    setParams(next, { replace: true })
  }
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
  // /api/cercle carries BOTH the people directory and the household animals (#pets):
  // read both off the one shared cache — no extra fetch — and search each as its own
  // section (a pet has its own /cercle/pet/:id card).
  const cercleData = useQuery({ queryKey: CERCLE_KEY, queryFn: () => api<{ contacts: Contact[]; pets: Pet[] }>('cercle') }).data
  const contacts = cercleData?.contacts ?? []
  const pets = cercleData?.pets ?? []
  // Le cercle → Famille → "Notes & recommandations" — searchable too (text only;
  // media-only notes carry no text so they don't surface here).
  const familyNotes = useQuery({ queryKey: FAMILY_NOTES_KEY, queryFn: () => api<{ notes: FamilyNote[] }>('family-notes') }).data?.notes ?? []
  // Le cercle → Business: the services / vendors directory (vet, plumber…).
  const businesses = useQuery({ queryKey: BUSINESSES_KEY, queryFn: () => api<{ businesses: Business[] }>('businesses') }).data?.businesses ?? []
  // Kid routines — the same ROUTINES_KEY cache the Routines tab + Réglages fill.
  const routines = useQuery({ queryKey: ROUTINES_KEY, queryFn: () => api<{ routines: Routine[] }>('routines') }).data?.routines ?? []
  // À compléter — the board glance's open todos (global + today) under TODOS_KEY.
  const todos = useQuery({ queryKey: TODOS_KEY, queryFn: () => api<TodosData>('todos') }).data?.todos ?? []
  // Garde-manger: "ce qui s'achève" (running-low) + La réserve (the stash). Both
  // live under the kitchen Pantry tab; each item links there.
  const low = usePantry().data?.low ?? []
  const reserve = useQuery({ queryKey: RESERVE_KEY, queryFn: () => api<ReserveData>('reserve') }).data?.reserve ?? []
  // « L'auto » — the household car(s); a name match jumps to the /voiture week view.
  const cars = useCars().cars
  // « Les carnets » (cared-for things: house/car/appliances) — name/notes match jumps
  // to the carnet scene. Home projects (Projets & Entretien) — a title/notes match jumps
  // to its carnet (if linked) or Réglages ▸ Corvées. Both were missing from search.
  const carnets = useQuery({ queryKey: CARNETS_KEY, queryFn: () => api<{ carnets: Carnet[] }>('carnets') }).data?.carnets ?? []
  const homeProjects = useQuery({ queryKey: HOME_PROJECTS_KEY, queryFn: () => api<{ projects: HomeProject[] }>('home-projects') }).data?.projects ?? []
  // A carnet's SERVICE HISTORY (care_log) and its « en cas de pépin » map pins
  // (home_pins) — both were missing from search (a water-heater invoice note or the
  // "où est la valve d'eau" pin returned nothing). Read the WHOLE household at once
  // (no `?carnet=` → every entry), keyed on the bare CARE_LOG_KEY / HOME_PINS_KEY so
  // this global index never collides with the per-carnet [...KEY, id] caches the scene
  // uses. A hit links to its carnet's « Le carnet » tab (?seg=carnet).
  const careLog = useQuery({ queryKey: CARE_LOG_KEY, queryFn: () => api<{ entries: CareLog[] }>('care-log') }).data?.entries ?? []
  const homePins = useQuery({ queryKey: HOME_PINS_KEY, queryFn: () => api<{ pins: HomePin[] }>('home-pins') }).data?.pins ?? []
  // « Mes dessins » (the kept-drawing gallery) — a drawing carries no text of its own,
  // so it's matched by its AUTHOR's name ("les dessins de Léa"); members give us the
  // name behind each member_id. A hit links to the gallery (/drawings).
  const drawings = useQuery({ queryKey: DRAWINGS_KEY, queryFn: () => api<{ drawings: GalleryDrawing[] }>('drawings') }).data?.drawings ?? []
  const members = useQuery({ queryKey: MEMBERS_KEY, queryFn: () => api<{ members: Member[] }>('members') }).data?.members ?? []
  // Name lookups for the row subtitles / drawing-author match.
  const carnetName = useMemo(() => new Map(carnets.map((c) => [c.id, c.name])), [carnets])
  const memberName = useMemo(() => new Map(members.map((m) => [m.id, m.display_name])), [members])
  // The board's fridge memos (#38/#14/#13) — distinct from the cercle family notes
  // above. Already in the board payload; only text notes surface (media-only carry none).
  const boardNotes = board?.notes ?? []

  const needle = fold(q.trim())
  // Mark the typed words inside each result row (same calm <mark class="hl"> as
  // the Guide search — lib/richText highlight(), accent-insensitive). No-op on a
  // row field the needle didn't touch (a recipe found via its ingredients keeps a
  // plain title).
  const hl = (s: string) => highlight(s, q.trim())
  const res = useMemo(() => {
    if (!needle) return null
    // Ranked matching (the Guide-search idea, applied per section): being NAMED
    // what you typed beats merely containing it. rank 0 = the name/title IS the
    // query, 1 = the name/title contains it, 2 = only a secondary/body field does
    // (ingredients, prose notes, details…). Each section sorts its hits by rank
    // BEFORE the CAP (so a title hit never loses its spot to a body hit), and the
    // sections themselves render best-hit-first below — a guide card titled
    // « Voyage » outranks a memo that mentions a voyage in passing.
    const rankOf = (primary: string, secondary: string) => {
      const p = fold(primary)
      if (p === needle) return 0
      if (p.includes(needle)) return 1
      return fold(secondary).includes(needle) ? 2 : -1
    }
    // WHICH fields make each kind findable lives in lib/searchIndex (P2-7 — the
    // one contract: searchable = has a SEARCH_INDEX entry). This only ranks+caps.
    const pick = <T,>(xs: T[], fields: SearchFields<T>) => {
      const hits: { x: T; r: number }[] = []
      for (const x of xs) {
        const r = rankOf(fields.primary(x), fields.secondary?.(x) ?? '')
        if (r !== -1) hits.push({ x, r })
      }
      hits.sort((a, b) => a.r - b.r) // stable: ties keep source order
      return { items: hits.slice(0, CAP).map((h) => h.x), best: hits.length ? hits[0].r : 99 }
    }

    const recipes = pick(recipesData, SEARCH_INDEX.recipe)
    const people = pick(contacts, SEARCH_INDEX.person)
    // Events come across three board buckets; one event can sit in more than one —
    // dedupe by id before matching.
    const seen = new Set<string>()
    const allEvents: EventRow[] = [...(board?.today ?? []), ...(board?.tomorrow ?? []), ...(board?.upcoming ?? [])].filter((e) => {
      if (seen.has(e.id)) return false
      seen.add(e.id)
      return true
    })
    const events = pick(allEvents, SEARCH_INDEX.event)
    const listItems = pick(board?.list ?? [], SEARCH_INDEX.listItem)
    const notes = pick(familyNotes, SEARCH_INDEX.familyNote)
    const petHits = pick(pets, SEARCH_INDEX.pet)
    const bizHits = pick(businesses, SEARCH_INDEX.business)
    const routineHits = pick(routines, SEARCH_INDEX.routine)
    const todoHits = pick(todos, SEARCH_INDEX.todo)
    // Garde-manger + La réserve — one merged ranked pool, tagged so the row can
    // label which list it's from while linking to the same Pantry tab.
    const pantryHits = pick(
      [
        ...low.map((l): PantryRow => ({ id: l.id, item: l.item, reserve: false })),
        ...reserve.map((r): PantryRow => ({ id: r.id, item: r.item, reserve: true })),
      ],
      SEARCH_INDEX.pantry,
    )
    const carHits = pick(cars, SEARCH_INDEX.car)
    // The board's fridge memos — text notes only (media-only notes carry no text).
    const fridgeNotes = pick(boardNotes.filter((n) => n.text), SEARCH_INDEX.fridgeNote)
    const carnetHits = pick(carnets, SEARCH_INDEX.carnet)
    const projectHits = pick(homeProjects, SEARCH_INDEX.homeProject)
    const careHits = pick(careLog, SEARCH_INDEX.careLog)
    const pinHits = pick(homePins, SEARCH_INDEX.homePin)
    // Kept drawings — no text of their own, so match the author's name.
    const drawingHits = pick(drawings, drawingFields(memberName))
    // The Guide / in-app help. Match a card on its title + one-liner + every
    // sub-point (label, detail, why) in the active language, tokens stripped to
    // the words a reader sees. A title/summary hit links to the whole card; when
    // ONLY a sub-point matched, deep-link to that point so the answer lands open.
    // Ranked like the rest: card title (0/1) over one-liner/point prose (2).
    const guideAll: { g: GuideHit; r: number }[] = []
    for (const e of GUIDE) {
      const titleStr = e.title[lang]
      const whatStr = stripTokens(e.what[lang])
      let pointIdx = -1
      for (let i = 0; i < e.points.length; i++) {
        const p = e.points[i]
        if (fold(stripTokens(`${p.label[lang]} ${p.detail[lang]} ${p.why?.[lang] ?? ''}`)).includes(needle)) {
          pointIdx = i
          break
        }
      }
      const tf = fold(titleStr)
      const whatHit = fold(whatStr).includes(needle)
      const r = tf === needle ? 0 : tf.includes(needle) ? 1 : whatHit || pointIdx >= 0 ? 2 : -1
      if (r === -1) continue
      const usePoint = r === 2 && !whatHit && pointIdx >= 0
      guideAll.push({
        r,
        g: {
          id: e.id,
          icon: e.icon,
          title: titleStr,
          sub: usePoint ? stripTokens(e.points[pointIdx].label[lang]) : whatStr,
          to: usePoint ? `/settings?tab=guide&card=${e.id}&point=${pointIdx}` : `/settings?tab=guide&card=${e.id}`,
        },
      })
    }
    guideAll.sort((a, b) => a.r - b.r)
    const guide = { items: guideAll.slice(0, CAP).map((h) => h.g), best: guideAll.length ? guideAll[0].r : 99 }
    return { recipes, people, pets: petHits, businesses: bizHits, routines: routineHits, todos: todoHits, pantry: pantryHits, cars: carHits, carnets: carnetHits, projects: projectHits, care: careHits, pins: pinHits, drawings: drawingHits, events, listItems, notes, fridgeNotes, guide }
  }, [needle, recipesData, contacts, pets, businesses, routines, todos, low, reserve, cars, carnets, homeProjects, careLog, homePins, drawings, memberName, board, familyNotes, boardNotes, lang])

  const total = res
    ? res.recipes.items.length +
      res.people.items.length +
      res.pets.items.length +
      res.businesses.items.length +
      res.routines.items.length +
      res.todos.items.length +
      res.pantry.items.length +
      res.cars.items.length +
      res.carnets.items.length +
      res.projects.items.length +
      res.care.items.length +
      res.pins.items.length +
      res.drawings.items.length +
      res.events.items.length +
      res.listItems.items.length +
      res.notes.items.length +
      res.fridgeNotes.items.length +
      res.guide.items.length
    : 0
  // Are any queries still in flight? Used to distinguish a cold-load "searching" from a
  // genuine "no results" (so a deep-link doesn't flash "aucun résultat" before data lands).
  const fetching = useIsFetching()

  return (
    <div className="scene search" aria-label={t.search.title}>
      <SceneHead title={t.search.title} icon="magnifying-glass-bold" onClose={close} />
      <div className="scene__body search__body">
        {/* No autoFocus — house rule: the keyboard only ever opens on an
            explicit tap, never when a scene mounts. On a tablet, programmatic
            focus never pops the soft keyboard, and because the field is then
            already focused the user's own tap isn't a focus change, so the
            keyboard never appears at all. Letting the tap do the focusing is
            what summons it. */}
        <input
          className="input search__input"
          value={q}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && aiEnabled) void ask()
          }}
          placeholder={t.search.placeholder}
          aria-label={t.search.placeholder}
          enterKeyHint="search"
        />

        {/* #12 — ask the AI the typed question (Enter does the same). Hidden when
            AI is off (binding absent or household-disabled). */}
        {q.trim() && aiEnabled && !aiOff && (
          <button type="button" className="btn btn--sm search__ask" onClick={ask} disabled={asking}>
            <Icon name="sparkle-bold" size={16} /> {t.search.ask}
          </button>
        )}

        {/* #12 — the shared answer card (src/lib/askAnswer.tsx): AskSheet (E-22,
            the board mic) renders the SAME card, so the two "ask" entry points
            never drift into two answer looks. */}
        {(asking || answer || askErr || aiOff) && (
          <AskAnswerCard
            t={t}
            status={asking ? 'asking' : answer ? 'answer' : aiOff ? 'off' : 'error'}
            answer={answer ? { text: answer.text, kind: answer.kind } : null}
          />
        )}

        {!needle ? (
          <p className="search__hint mono">{t.search.hint}</p>
        ) : total === 0 ? (
          // A cold deep-link (/search?q=… with no warm cache) has its queries in flight —
          // say "searching" rather than the misleading "no results" until they settle.
          fetching > 0 ? (
            <p className="search__hint mono">{t.search.searching}</p>
          ) : (
            <EmptyState>{t.search.noResults}</EmptyState>
          )
        ) : (
          <>
            {/* A concise, polite live count so a screen-reader user hears "3 résultats"
                as the search settles — the grouped rows below give no such summary. */}
            <p className="search__hint mono" role="status">{t.search.resultsCount(total)}</p>
            {/* Sections render best-hit-first: a section whose top row is NAMED
                what you typed floats above sections that only contain it in a
                body field (see the rank comment in the memo). Ties keep the
                familiar fixed order (stable sort); an empty section's node is
                `false` and renders nothing. */}
            {[
              {
                best: res!.recipes.best,
                node: res!.recipes.items.length > 0 && (
              <Section key="recipes" label={t.search.recipes}>
                {res!.recipes.items.map((r) => (
                  <Link key={r.id} to={`/kitchen/recipe/${r.id}`} className="search__row">
                    <span className="search__pic" aria-hidden="true">
                      {recipeImg(r.image) ? <img src={recipeImg(r.image)!} alt="" /> : pictoFor(r.title, '🍳')}
                    </span>
                    <span className="search__main">
                      <span className="search__title">{hl(r.title)}</span>
                      {(r.tags ?? []).length > 0 && <span className="search__sub mono">{hl(r.tags.join(' · '))}</span>}
                    </span>
                    <Icon name="arrow-right-bold" size={16} />
                  </Link>
                ))}
              </Section>
                ),
              },

              {
                best: res!.people.best,
                node: res!.people.items.length > 0 && (
              <Section key="people" label={t.search.people}>
                {res!.people.items.map((c) => (
                  <Link key={c.id} to={`/cercle/person/${c.id}`} className="search__row">
                    <span className="search__pic" aria-hidden="true">
                      <Avatar kind={c.photoKey ? 'photo' : null} photo={c.photoKey} colour={CATS.cercle.deep} name={c.firstName} size={34} />
                    </span>
                    <span className="search__main">
                      <span className="search__title">{hl([c.firstName, c.lastName].filter(Boolean).join(' ') || c.nickname || '')}</span>
                      {c.nickname && <span className="search__sub mono">« {hl(c.nickname)} »</span>}
                    </span>
                    <Icon name="arrow-right-bold" size={16} />
                  </Link>
                ))}
              </Section>
                ),
              },

              {
                best: res!.pets.best,
                node: res!.pets.items.length > 0 && (
              <Section key="pets" label={t.search.pets}>
                {res!.pets.items.map((p) => (
                  <Link key={p.id} to={`/cercle/pet/${p.id}`} className="search__row">
                    <span className="search__pic" aria-hidden="true">
                      <Avatar kind={p.photoKey ? 'photo' : null} photo={p.photoKey} colour={colourFor('pet', p.colour)} name={p.name} size={34} />
                    </span>
                    <span className="search__main">
                      <span className="search__title">{hl(p.name)}</span>
                      {(p.species || p.breed) && <span className="search__sub mono">{hl([p.species, p.breed].filter(Boolean).join(' · '))}</span>}
                    </span>
                    <Icon name="arrow-right-bold" size={16} />
                  </Link>
                ))}
              </Section>
                ),
              },

              {
                best: res!.businesses.best,
                node: res!.businesses.items.length > 0 && (
              <Section key="businesses" label={t.search.businesses}>
                {res!.businesses.items.map((b) => (
                  <Link key={b.id} to={`/cercle?section=business&item=${b.id}`} className="search__row">
                    <span className="search__pic" aria-hidden="true" style={{ color: b.colour ?? BUSINESS_COLOUR }}>
                      <InlineIcon name="storefront-bold" />
                    </span>
                    <span className="search__main">
                      <span className="search__title">{hl(b.name)}</span>
                      {b.category && <span className="search__sub mono">{hl(b.category)}</span>}
                    </span>
                    <Icon name="arrow-right-bold" size={16} />
                  </Link>
                ))}
              </Section>
                ),
              },

              {
                best: res!.carnets.best,
                node: res!.carnets.items.length > 0 && (
              <Section key="carnets" label={t.search.carnets}>
                {res!.carnets.items.map((x) => (
                  <Link key={x.id} to={`/cercle/carnet/${x.id}`} className="search__row">
                    <span className="search__pic" aria-hidden="true" style={{ color: x.color ?? undefined }}>
                      <InlineIcon name="book-open-bold" />
                    </span>
                    <span className="search__main">
                      <span className="search__title">{hl(x.name)}</span>
                    </span>
                    <Icon name="arrow-right-bold" size={16} />
                  </Link>
                ))}
              </Section>
                ),
              },

              {
                best: res!.projects.best,
                node: res!.projects.items.length > 0 && (
              <Section key="projects" label={t.search.homeProjects}>
                {res!.projects.items.map((p) => (
                  <Link
                    key={p.id}
                    to={p.carnet_id ? `/cercle/carnet/${p.carnet_id}` : '/settings?tab=routines&sub=chores'}
                    className="search__row"
                  >
                    <span className="search__pic" aria-hidden="true" style={{ color: p.color ?? undefined }}>
                      <InlineIcon name="calendar-blank-bold" />
                    </span>
                    <span className="search__main">
                      <span className="search__title">{hl(p.title)}</span>
                    </span>
                    <Icon name="arrow-right-bold" size={16} />
                  </Link>
                ))}
              </Section>
                ),
              },

              {
                best: res!.care.best,
                node: res!.care.items.length > 0 && (
              <Section key="care" label={t.search.careLog}>
                {res!.care.items.map((e) => (
                  <Link key={e.id} to={`/cercle/carnet/${e.carnetId}?seg=carnet`} className="search__row">
                    <span className="search__pic" aria-hidden="true" style={{ color: CATS.chore.deep }}>
                      <InlineIcon name="receipt-bold" />
                    </span>
                    <span className="search__main">
                      <span className="search__title">{hl(e.title)}</span>
                      {carnetName.get(e.carnetId) && <span className="search__sub mono">{carnetName.get(e.carnetId)}</span>}
                    </span>
                    <Icon name="arrow-right-bold" size={16} />
                  </Link>
                ))}
              </Section>
                ),
              },

              {
                best: res!.pins.best,
                node: res!.pins.items.length > 0 && (
              <Section key="pins" label={t.search.homePins}>
                {res!.pins.items.map((p) => (
                  <Link key={p.id} to={`/cercle/carnet/${p.carnetId}?seg=carnet`} className="search__row">
                    <span className="search__pic" aria-hidden="true">{PIN_EMOJI[p.kind]}</span>
                    <span className="search__main">
                      <span className="search__title">{hl(p.label)}</span>
                      {carnetName.get(p.carnetId) && <span className="search__sub mono">{carnetName.get(p.carnetId)}</span>}
                    </span>
                    <Icon name="arrow-right-bold" size={16} />
                  </Link>
                ))}
              </Section>
                ),
              },

              {
                best: res!.drawings.best,
                node: res!.drawings.items.length > 0 && (
              <Section key="drawings" label={t.search.drawings}>
                {res!.drawings.items.map((d) => (
                  <Link key={d.id} to="/drawings" className="search__row">
                    <span className="search__pic" aria-hidden="true">
                      <img src={imgUrl(d.media_key)} alt="" />
                    </span>
                    <span className="search__main">
                      <span className="search__title">{hl(d.member_id ? memberName.get(d.member_id) ?? t.notes.drawing : t.notes.drawing)}</span>
                    </span>
                    <Icon name="arrow-right-bold" size={16} />
                  </Link>
                ))}
              </Section>
                ),
              },

              {
                best: res!.events.best,
                node: res!.events.items.length > 0 && (
              <Section key="events" label={t.search.events}>
                {res!.events.items.map((e) => (
                  <Link key={e.id} to={`/kitchen/day/${localDayStart(new Date(e.start_at * 1000))}`} className="search__row">
                    <span className="search__pic" aria-hidden="true">
                      <InlineIcon name={e.birthday ? 'cake-bold' : 'calendar-blank-bold'} />
                    </span>
                    <span className="search__main">
                      <span className="search__title">{hl(e.title)}</span>
                      <span className="search__sub mono">{new Date(e.start_at * 1000).toLocaleDateString(lang === 'fr' ? 'fr-CA' : 'en-CA', { weekday: 'short', day: 'numeric', month: 'short' })}</span>
                    </span>
                    <Icon name="arrow-right-bold" size={16} />
                  </Link>
                ))}
              </Section>
                ),
              },

              {
                best: res!.routines.best,
                node: res!.routines.items.length > 0 && (
              <Section key="routines" label={t.search.routines}>
                {res!.routines.items.map((r) => (
                  <Link key={r.id} to={`/routine/${r.id}`} className="search__row">
                    <span className="search__pic" aria-hidden="true" style={{ color: CATS.routine.deep }}>
                      <InlineIcon name="smiley-bold" />
                    </span>
                    <span className="search__main">
                      <span className="search__title">{hl(r.name)}</span>
                      {r.memberName && <span className="search__sub mono">{r.memberName}</span>}
                    </span>
                    <Icon name="arrow-right-bold" size={16} />
                  </Link>
                ))}
              </Section>
                ),
              },

              {
                best: res!.todos.best,
                node: res!.todos.items.length > 0 && (
              <Section key="todos" label={t.search.todos}>
                {res!.todos.items.map((td) => (
                  <Link key={td.id} to="/board" className="search__row">
                    <span className="search__pic" aria-hidden="true" style={{ color: CATS.chore.deep }}>
                      <InlineIcon name="check-square-bold" />
                    </span>
                    <span className="search__main">
                      <span className="search__title">{hl(td.title)}</span>
                    </span>
                    <Icon name="arrow-right-bold" size={16} />
                  </Link>
                ))}
              </Section>
                ),
              },

              {
                best: res!.listItems.best,
                node: res!.listItems.items.length > 0 && (
              <Section key="listItems" label={t.search.listItems}>
                {res!.listItems.items.map((li) => (
                  <Link key={li.id} to={`/liste/item/${li.id}`} className="search__row">
                    <span className="search__pic" aria-hidden="true">{pictoFor(li.text, '🛒')}</span>
                    <span className="search__main">
                      <span className="search__title">{hl(li.text)}</span>
                    </span>
                    <Icon name="arrow-right-bold" size={16} />
                  </Link>
                ))}
              </Section>
                ),
              },

              {
                best: res!.pantry.best,
                node: res!.pantry.items.length > 0 && (
              <Section key="pantry" label={t.search.pantry}>
                {res!.pantry.items.map((it) => (
                  <Link key={(it.reserve ? 'r:' : 'l:') + it.id} to="/kitchen?tab=pantry" className="search__row">
                    <span className="search__pic" aria-hidden="true" style={{ color: CATS.pantry.deep }}>
                      <InlineIcon name={it.reserve ? 'cloud-snow-bold' : 'carrot-bold'} />
                    </span>
                    <span className="search__main">
                      <span className="search__title">{hl(it.item)}</span>
                      <span className="search__sub mono">{it.reserve ? t.kitchen.reserve : t.kitchen.tabPantry}</span>
                    </span>
                    <Icon name="arrow-right-bold" size={16} />
                  </Link>
                ))}
              </Section>
                ),
              },

              {
                best: res!.cars.best,
                node: res!.cars.items.length > 0 && (
              <Section key="cars" label={t.search.auto}>
                {res!.cars.items.map((c) => (
                  <Link key={c.id} to="/voiture" className="search__row">
                    <span className="search__pic" aria-hidden="true" style={{ color: c.color ?? CATS.work.deep }}>
                      <InlineIcon name="car-bold" />
                    </span>
                    <span className="search__main">
                      <span className="search__title">{hl(c.name)}</span>
                    </span>
                    <Icon name="arrow-right-bold" size={16} />
                  </Link>
                ))}
              </Section>
                ),
              },

              {
                best: res!.notes.best,
                node: res!.notes.items.length > 0 && (
              <Section key="notes" label={t.search.notes}>
                {res!.notes.items.map((n) => (
                  <Link key={n.id} to={`/cercle?section=notes&item=${n.id}`} className="search__row">
                    <span className="search__pic" aria-hidden="true">
                      <InlineIcon name="file-text-bold" />
                    </span>
                    <span className="search__main">
                      <span className="search__title">{hl(n.title.trim() || firstLine(n.text) || t.cercle.familyNotes.untitled)}</span>
                    </span>
                    <Icon name="arrow-right-bold" size={16} />
                  </Link>
                ))}
              </Section>
                ),
              },

              {
                best: res!.fridgeNotes.best,
                node: res!.fridgeNotes.items.length > 0 && (
              <Section key="fridgeNotes" label={t.search.boardNotes}>
                {res!.fridgeNotes.items.map((n) => (
                  <Link key={n.id} to="/board" className="search__row">
                    <span className="search__pic" aria-hidden="true" style={{ color: CATS.list.deep }}>
                      <InlineIcon name="push-pin-bold" />
                    </span>
                    <span className="search__main">
                      <span className="search__title">{hl(n.text)}</span>
                    </span>
                    <Icon name="arrow-right-bold" size={16} />
                  </Link>
                ))}
              </Section>
                ),
              },

              {
                best: res!.guide.best,
                node: res!.guide.items.length > 0 && (
              <Section key="guide" label={t.search.help}>
                {res!.guide.items.map((g) => (
                  <Link key={g.id} to={g.to} className="search__row">
                    <span className="search__pic" aria-hidden="true">
                      <InlineIcon name={g.icon} />
                    </span>
                    <span className="search__main">
                      <span className="search__title">{hl(g.title)}</span>
                      {g.sub && <span className="search__sub mono">{hl(g.sub)}</span>}
                    </span>
                    <Icon name="arrow-right-bold" size={16} />
                  </Link>
                ))}
              </Section>
                ),
              },
            ]
              .sort((a, b) => a.best - b.best)
              .map((s) => s.node)}
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
