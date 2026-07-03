import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useIsFetching } from '@tanstack/react-query'
import { useT, useLang } from '../i18n'
import { api } from '../lib/api'
import { useAi } from '../lib/ai'
import { fold } from '../lib/normalize'
import { CATS } from '../lib/cats'
import { colourFor } from '../lib/things'
import { CERCLE_KEY, FAMILY_NOTES_KEY, BUSINESSES_KEY, ROUTINES_KEY, TODOS_KEY, CARNETS_KEY, HOME_PROJECTS_KEY, CARE_LOG_KEY, HOME_PINS_KEY, DRAWINGS_KEY, MEMBERS_KEY } from '../lib/queryKeys'
import { type Carnet, type CareLog, type HomePin, PIN_EMOJI } from '../lib/carnets'
import { type GalleryDrawing } from '../lib/drawingGallery'
import { type Member } from '../lib/members'
import { imgUrl } from '../lib/image'
import { type Contact, type Pet } from '../lib/cercle'
import { type FamilyNote } from '../lib/familyNotes'
import { firstLine, plainText } from '../lib/noteMarkdown'
import { type Business, BUSINESS_COLOUR } from '../lib/businesses'
import { type Routine, type HomeProject } from '../components/operator/types'
import { type TodosData } from '../lib/todos'
import { type ReserveData, RESERVE_KEY } from '../components/kitchen/types'
import { useCars } from '../lib/carPrefs'
import { useRecipes, useBoardData, usePantry } from '../lib/queryHooks'
import { recipeImg } from '../lib/recipes'
import { GUIDE } from '../lib/guideContent'
import { stripTokens } from '../lib/richText'
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
  // #12 — the "Ask the AI" affordance only shows when AI is on (binding present AND
  // the household hasn't switched it off). The local fuzzy search below stays — it's
  // not AI. `aiOff` is the reactive fallback if a call still comes back degraded.
  const { enabled: aiEnabled } = useAi()
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
    const notes = familyNotes.filter((n) => fold(`${n.title} ${plainText(n.text)}`).includes(needle)).slice(0, CAP)
    // Le cercle animals — match on name/species/breed + the care free-text.
    const petHits = pets
      .filter((p) => fold(`${p.name} ${p.species ?? ''} ${p.breed ?? ''} ${p.notes ?? ''}`).includes(needle))
      .slice(0, CAP)
    // Services / commerces (vet, plumber…) — name + category + contact details.
    const bizHits = businesses
      .filter((b) => fold(`${b.name} ${b.category ?? ''} ${b.phone ?? ''} ${b.address ?? ''} ${b.notes ?? ''}`).includes(needle))
      .slice(0, CAP)
    // Kid routines — the routine name plus every card label.
    const routineHits = routines
      .filter((r) => fold(`${r.name} ${(r.cards ?? []).map((c) => c.label).join(' ')}`).includes(needle))
      .slice(0, CAP)
    // À compléter — open todos by title.
    const todoHits = todos.filter((td) => fold(td.title).includes(needle)).slice(0, CAP)
    // Garde-manger + La réserve — both keyed on the free-text item; tagged so the
    // row can label which list it's from while linking to the same Pantry tab.
    const pantryHits = [
      ...low.filter((l) => fold(l.item).includes(needle)).map((l) => ({ id: l.id, item: l.item, reserve: false })),
      ...reserve.filter((r) => fold(r.item).includes(needle)).map((r) => ({ id: r.id, item: r.item, reserve: true })),
    ].slice(0, CAP)
    // « L'auto » — the household car name(s).
    const carHits = cars.filter((c) => fold(c.name).includes(needle)).slice(0, CAP)
    // The board's fridge memos — text notes only (media-only notes carry no text).
    const fridgeNotes = boardNotes.filter((n) => n.text && fold(n.text).includes(needle)).slice(0, CAP)
    // « Les carnets » + home projects — name/title + notes.
    const carnetHits = carnets.filter((x) => fold(`${x.name} ${x.notes ?? ''}`).includes(needle)).slice(0, CAP)
    const projectHits = homeProjects.filter((p) => fold(`${p.title} ${p.notes ?? ''}`).includes(needle)).slice(0, CAP)
    // A carnet's service history — the entry title + its free-text note.
    const careHits = careLog.filter((e) => fold(`${e.title} ${e.note ?? ''}`).includes(needle)).slice(0, CAP)
    // « En cas de pépin » map pins — the label + its detail (where the valve is, how
    // the thermostat works…).
    const pinHits = homePins.filter((p) => fold(`${p.label} ${p.detail ?? ''}`).includes(needle)).slice(0, CAP)
    // Kept drawings — no text of their own, so match the author's name.
    const drawingHits = drawings
      .filter((d) => {
        const author = d.member_id ? memberName.get(d.member_id) : null
        return author ? fold(author).includes(needle) : false
      })
      .slice(0, CAP)
    // The Guide / in-app help. Match a card on its title + one-liner + every
    // sub-point (label, detail, why) in the active language, tokens stripped to
    // the words a reader sees. A title/summary hit links to the whole card; when
    // ONLY a sub-point matched, deep-link to that point so the answer lands open.
    const guide: GuideHit[] = []
    for (const e of GUIDE) {
      if (guide.length >= CAP) break
      const titleStr = e.title[lang]
      const whatStr = stripTokens(e.what[lang])
      const cardHit = fold(`${titleStr} ${whatStr}`).includes(needle)
      let pointIdx = -1
      for (let i = 0; i < e.points.length; i++) {
        const p = e.points[i]
        if (fold(stripTokens(`${p.label[lang]} ${p.detail[lang]} ${p.why?.[lang] ?? ''}`)).includes(needle)) {
          pointIdx = i
          break
        }
      }
      if (!cardHit && pointIdx < 0) continue
      const usePoint = !cardHit && pointIdx >= 0
      guide.push({
        id: e.id,
        icon: e.icon,
        title: titleStr,
        sub: usePoint ? stripTokens(e.points[pointIdx].label[lang]) : whatStr,
        to: usePoint ? `/settings?tab=guide&card=${e.id}&point=${pointIdx}` : `/settings?tab=guide&card=${e.id}`,
      })
    }
    return { recipes, people, pets: petHits, businesses: bizHits, routines: routineHits, todos: todoHits, pantry: pantryHits, cars: carHits, carnets: carnetHits, projects: projectHits, care: careHits, pins: pinHits, drawings: drawingHits, events, listItems, notes, fridgeNotes, guide }
  }, [needle, recipesData, contacts, pets, businesses, routines, todos, low, reserve, cars, carnets, homeProjects, careLog, homePins, drawings, memberName, board, familyNotes, boardNotes, lang])

  const total = res
    ? res.recipes.length +
      res.people.length +
      res.pets.length +
      res.businesses.length +
      res.routines.length +
      res.todos.length +
      res.pantry.length +
      res.cars.length +
      res.carnets.length +
      res.projects.length +
      res.care.length +
      res.pins.length +
      res.drawings.length +
      res.events.length +
      res.listItems.length +
      res.notes.length +
      res.fridgeNotes.length +
      res.guide.length
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
          onChange={(e) => setQ(e.target.value)}
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
                      <Avatar kind={c.photoKey ? 'photo' : null} photo={c.photoKey} colour={CATS.cercle.deep} name={c.firstName} size={34} />
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

            {res!.pets.length > 0 && (
              <Section label={t.search.pets}>
                {res!.pets.map((p) => (
                  <Link key={p.id} to={`/cercle/pet/${p.id}`} className="search__row">
                    <span className="search__pic" aria-hidden="true">
                      <Avatar kind={p.photoKey ? 'photo' : null} photo={p.photoKey} colour={colourFor('pet', p.colour)} name={p.name} size={34} />
                    </span>
                    <span className="search__main">
                      <span className="search__title">{p.name}</span>
                      {(p.species || p.breed) && <span className="search__sub mono">{[p.species, p.breed].filter(Boolean).join(' · ')}</span>}
                    </span>
                    <Icon name="arrow-right-bold" size={16} />
                  </Link>
                ))}
              </Section>
            )}

            {res!.businesses.length > 0 && (
              <Section label={t.search.businesses}>
                {res!.businesses.map((b) => (
                  <Link key={b.id} to={`/cercle?section=business&item=${b.id}`} className="search__row">
                    <span className="search__pic" aria-hidden="true" style={{ color: b.colour ?? BUSINESS_COLOUR }}>
                      <InlineIcon name="storefront-bold" />
                    </span>
                    <span className="search__main">
                      <span className="search__title">{b.name}</span>
                      {b.category && <span className="search__sub mono">{b.category}</span>}
                    </span>
                    <Icon name="arrow-right-bold" size={16} />
                  </Link>
                ))}
              </Section>
            )}

            {res!.carnets.length > 0 && (
              <Section label={t.search.carnets}>
                {res!.carnets.map((x) => (
                  <Link key={x.id} to={`/cercle/carnet/${x.id}`} className="search__row">
                    <span className="search__pic" aria-hidden="true" style={{ color: x.color ?? undefined }}>
                      <InlineIcon name="book-open-bold" />
                    </span>
                    <span className="search__main">
                      <span className="search__title">{x.name}</span>
                    </span>
                    <Icon name="arrow-right-bold" size={16} />
                  </Link>
                ))}
              </Section>
            )}

            {res!.projects.length > 0 && (
              <Section label={t.search.homeProjects}>
                {res!.projects.map((p) => (
                  <Link
                    key={p.id}
                    to={p.carnet_id ? `/cercle/carnet/${p.carnet_id}` : '/settings?tab=chores'}
                    className="search__row"
                  >
                    <span className="search__pic" aria-hidden="true" style={{ color: p.color ?? undefined }}>
                      <InlineIcon name="calendar-blank-bold" />
                    </span>
                    <span className="search__main">
                      <span className="search__title">{p.title}</span>
                    </span>
                    <Icon name="arrow-right-bold" size={16} />
                  </Link>
                ))}
              </Section>
            )}

            {res!.care.length > 0 && (
              <Section label={t.search.careLog}>
                {res!.care.map((e) => (
                  <Link key={e.id} to={`/cercle/carnet/${e.carnetId}?seg=carnet`} className="search__row">
                    <span className="search__pic" aria-hidden="true" style={{ color: CATS.chore.deep }}>
                      <InlineIcon name="receipt-bold" />
                    </span>
                    <span className="search__main">
                      <span className="search__title">{e.title}</span>
                      {carnetName.get(e.carnetId) && <span className="search__sub mono">{carnetName.get(e.carnetId)}</span>}
                    </span>
                    <Icon name="arrow-right-bold" size={16} />
                  </Link>
                ))}
              </Section>
            )}

            {res!.pins.length > 0 && (
              <Section label={t.search.homePins}>
                {res!.pins.map((p) => (
                  <Link key={p.id} to={`/cercle/carnet/${p.carnetId}?seg=carnet`} className="search__row">
                    <span className="search__pic" aria-hidden="true">{PIN_EMOJI[p.kind]}</span>
                    <span className="search__main">
                      <span className="search__title">{p.label}</span>
                      {carnetName.get(p.carnetId) && <span className="search__sub mono">{carnetName.get(p.carnetId)}</span>}
                    </span>
                    <Icon name="arrow-right-bold" size={16} />
                  </Link>
                ))}
              </Section>
            )}

            {res!.drawings.length > 0 && (
              <Section label={t.search.drawings}>
                {res!.drawings.map((d) => (
                  <Link key={d.id} to="/drawings" className="search__row">
                    <span className="search__pic" aria-hidden="true">
                      <img src={imgUrl(d.media_key)} alt="" />
                    </span>
                    <span className="search__main">
                      <span className="search__title">{d.member_id ? memberName.get(d.member_id) ?? t.notes.drawing : t.notes.drawing}</span>
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

            {res!.routines.length > 0 && (
              <Section label={t.search.routines}>
                {res!.routines.map((r) => (
                  <Link key={r.id} to={`/routine/${r.id}`} className="search__row">
                    <span className="search__pic" aria-hidden="true" style={{ color: CATS.routine.deep }}>
                      <InlineIcon name="smiley-bold" />
                    </span>
                    <span className="search__main">
                      <span className="search__title">{r.name}</span>
                      {r.memberName && <span className="search__sub mono">{r.memberName}</span>}
                    </span>
                    <Icon name="arrow-right-bold" size={16} />
                  </Link>
                ))}
              </Section>
            )}

            {res!.todos.length > 0 && (
              <Section label={t.search.todos}>
                {res!.todos.map((td) => (
                  <Link key={td.id} to="/board" className="search__row">
                    <span className="search__pic" aria-hidden="true" style={{ color: CATS.chore.deep }}>
                      <InlineIcon name="check-square-bold" />
                    </span>
                    <span className="search__main">
                      <span className="search__title">{td.title}</span>
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

            {res!.pantry.length > 0 && (
              <Section label={t.search.pantry}>
                {res!.pantry.map((it) => (
                  <Link key={(it.reserve ? 'r:' : 'l:') + it.id} to="/kitchen?tab=pantry" className="search__row">
                    <span className="search__pic" aria-hidden="true" style={{ color: CATS.pantry.deep }}>
                      <InlineIcon name={it.reserve ? 'cloud-snow-bold' : 'carrot-bold'} />
                    </span>
                    <span className="search__main">
                      <span className="search__title">{it.item}</span>
                      <span className="search__sub mono">{it.reserve ? t.kitchen.reserve : t.kitchen.tabPantry}</span>
                    </span>
                    <Icon name="arrow-right-bold" size={16} />
                  </Link>
                ))}
              </Section>
            )}

            {res!.cars.length > 0 && (
              <Section label={t.search.auto}>
                {res!.cars.map((c) => (
                  <Link key={c.id} to="/voiture" className="search__row">
                    <span className="search__pic" aria-hidden="true" style={{ color: c.color ?? CATS.work.deep }}>
                      <InlineIcon name="car-bold" />
                    </span>
                    <span className="search__main">
                      <span className="search__title">{c.name}</span>
                    </span>
                    <Icon name="arrow-right-bold" size={16} />
                  </Link>
                ))}
              </Section>
            )}

            {res!.notes.length > 0 && (
              <Section label={t.search.notes}>
                {res!.notes.map((n) => (
                  <Link key={n.id} to={`/cercle?section=notes&item=${n.id}`} className="search__row">
                    <span className="search__pic" aria-hidden="true">
                      <InlineIcon name="file-text-bold" />
                    </span>
                    <span className="search__main">
                      <span className="search__title">{n.title.trim() || firstLine(n.text) || t.cercle.familyNotes.untitled}</span>
                    </span>
                    <Icon name="arrow-right-bold" size={16} />
                  </Link>
                ))}
              </Section>
            )}

            {res!.fridgeNotes.length > 0 && (
              <Section label={t.search.boardNotes}>
                {res!.fridgeNotes.map((n) => (
                  <Link key={n.id} to="/board" className="search__row">
                    <span className="search__pic" aria-hidden="true" style={{ color: CATS.list.deep }}>
                      <InlineIcon name="push-pin-bold" />
                    </span>
                    <span className="search__main">
                      <span className="search__title">{n.text}</span>
                    </span>
                    <Icon name="arrow-right-bold" size={16} />
                  </Link>
                ))}
              </Section>
            )}

            {res!.guide.length > 0 && (
              <Section label={t.search.help}>
                {res!.guide.map((g) => (
                  <Link key={g.id} to={g.to} className="search__row">
                    <span className="search__pic" aria-hidden="true">
                      <InlineIcon name={g.icon} />
                    </span>
                    <span className="search__main">
                      <span className="search__title">{g.title}</span>
                      {g.sub && <span className="search__sub mono">{g.sub}</span>}
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
