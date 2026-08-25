import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useLang, useT } from '../../i18n'
import { api } from '../../lib/api'
import { formatPastDay } from '../../lib/format'
import { useWrite } from '../../lib/write'
import { useDeferredRemoval } from '../../lib/useDeferredRemoval'
import { useSingleOpen } from '../Disclosure'
import { isGuest } from '../../lib/device'
import { rankUseSoon } from '../../lib/cookable'
import { imgUrl } from '../../lib/image'
import { useLoves } from '../../lib/loves'
import { type Member } from '../../lib/members'
import { type MealSlot } from '../../lib/mealSlots'
import { useMealPrefs } from '../../lib/mealPrefs'
import { MEMBERS_KEY, BOARD_KEY } from '../../lib/queryKeys'
import { type AiWake } from './useAiWake'
import { useMealSuggest } from './useMealSuggest'
import { type Recipe } from '../../lib/recipes'
import {
  type MealIdea,
  type Leftover,
  type MealRow,
  type MealHistorySummary,
  type PastDish,
  MEAL_IDEAS_KEY,
  MEALS_KEY,
  MEAL_HISTORY_KEY,
  MEAL_HISTORY_SUMMARY_KEY,
} from './types'
import { MealIdeas, usePlanIdea } from './MealIdeas'
import { Leftovers } from './Leftovers'
import { MealPlanPicker } from './MealPlanPicker'
import { SubTabs } from '../SubTabs'
import { Cluster } from '../Layout'
import { Avatar } from '../Avatar'
import { Icon, InlineIcon, type IconName } from '../Icon'
import { EmptyState } from '../EmptyState'
import { LoadError } from '../Fallback'
import { RowActions } from '../RowActions'

// « Un seul tiroir d'idées-repas » (C-14, bmad/10) — the ONE place every source of
// "what's for supper" ideas lives, replacing four-plus scattered pools a family
// learned one of and never found the rest (dormant machinery). A SubTabs row of
// sources, ONE active at a time:
//   Idées (default)   — the kept, reusable pool (MEAL_IDEAS_KEY), the shared
//                        <MealIdeas> the kitchen week grid also renders inline.
//   ⭐ Favoris          — recipes the household loved (useLoves) — shows WHICH faces
//                        loved it, never a count (calm — the chore-ledger rule).
//   🧊 À écouler        — Restants (leftovers) to finish + a `rankUseSoon` shortlist
//                        of recipes that use up what's about to spoil (the old "useup"
//                        suggestion source). Restants is the SAME shared <Leftovers>
//                        La cuisine ▸ Repas renders inline above « Idées de repas »,
//                        so the two can't drift — same deal as <MealIdeas>.
//   🤖 IA               — a fresh `useMealSuggest` AI batch, as rows (hides when AI
//                        is off — degrade, never crash).
//   👧 Proposé par      — `meal_ideas` rows a child suggested (`suggested_by` set);
//                        the empty-day-tile "Léa propose 🍕" chip lands HERE
//                        (never auto-plans — a glance chip never commits).
// « Vide-frigo » keeps its OWN identity (not a source): a button that opens the
// untouched EmptyFridgeSheet. It sits in the 🤖 IA tab's footer — it IS an AI ask, so
// hanging it under every source (Favoris, Restants, 👧) read as a fifth, unrelated
// action on tabs that never call the model. This is deliberately NOT a week-planner
// (A-1 stays rejected) — planning a day is still the one-row MealPlanPicker each
// idea reveals.
//
// This is the prop-driven BODY; the full-screen `.scene` shell that owns the queries
// and the ?tab= source state is IdeasPage (/kitchen/idees). It used to be a bottom
// Sheet, but a sheet is sized by its content: switching from an empty « Favoris » to
// a full 🤖 batch grew it from the bottom edge, so the whole panel — tabs included —
// jumped up and down under the thumb. A scene's header is pinned; only the body
// scrolls. Same reason DayManageSheet became /kitchen/day/:date.
//   🕰 Déjà mangé      — the household's own record: distinct past dishes from the
//                        full meal history (?summary=1), most-often-planned first
//                        with a quiet "dernière fois : …" tag — never a count.
export type IdeasChip = 'ideas' | 'favorites' | 'past' | 'useSoon' | 'ai' | 'kid'

export const IDEAS_CHIPS = ['ideas', 'favorites', 'past', 'useSoon', 'ai', 'kid'] as const

export function IdeasDrawer({
  chip,
  onChip,
  ideas,
  leftovers,
  recentMeals,
  recipes,
  lowItems,
  listItems,
  soonItems,
  week,
  profileId,
  ai,
  aiEnabled,
  onOpenFridge,
}: {
  // The active source, owned by the page (?tab=) so a return from a planning scene
  // lands back on the same source — the 👧 empty-day chip deep-links to ?tab=kid.
  chip: IdeasChip
  onChip: (chip: IdeasChip) => void
  ideas: MealIdea[]
  leftovers: Leftover[]
  recentMeals: MealRow[]
  recipes: Recipe[]
  lowItems: string[]
  listItems: string[]
  soonItems: string[]
  week: { date: number; label: string }[]
  profileId: string | null
  ai: AiWake
  aiEnabled: boolean
  onOpenFridge: () => void
}) {
  const t = useT()
  const write = useWrite()
  const ro = isGuest()

  const { data: membersData } = useQuery({
    queryKey: MEMBERS_KEY,
    queryFn: () => api<{ members: Member[] }>('members'),
  })
  const members = membersData?.members ?? []
  const memberById = (id: string | null | undefined) => (id ? members.find((m) => m.id === id) : undefined)

  // « Idées » — the kept, reusable pool. Planning an idea leaves it in the pool. The
  // 👧 chip's rows are meal_ideas rows too, so they plan through the same helper.
  const planIdea = usePlanIdea()

  // A recipe row (⭐ Favoris / the 🧊 use-soon shortlist) plans REUSABLY, like an
  // idea — nothing is consumed, so no undo bookkeeping is needed.
  function planRecipe(r: Recipe, date: number, slot: MealSlot) {
    void write('meals', {
      method: 'POST',
      body: { date, slot, title: r.title, recipeId: r.id, staples: [] },
      affectedKeys: [MEALS_KEY, BOARD_KEY, MEAL_HISTORY_KEY],
    }).catch(() => {})
  }

  // A bare AI-suggested title (🤖, no recipe link yet) plans the same way.
  function planAiIdea(title: string, date: number, slot: MealSlot) {
    void write('meals', {
      method: 'POST',
      body: { date, slot, title, recipeId: null, staples: [] },
      affectedKeys: [MEALS_KEY, BOARD_KEY, MEAL_HISTORY_KEY],
    }).catch(() => {})
  }

  // Keep a free-text AI title into the pool (mirrors the old suggestion card's
  // « Garder »). Once kept it also becomes plannable from the Idées chip.
  const [keptAi, setKeptAi] = useState<Set<string>>(() => new Set())
  async function keepAiIdea(title: string) {
    if (keptAi.has(title)) return
    setKeptAi((p) => new Set(p).add(title))
    await write('meal-ideas', {
      method: 'POST',
      body: { title, recipeId: null, suggestedBy: profileId },
      affectedKeys: [MEAL_IDEAS_KEY],
    }).catch(() => {
      setKeptAi((p) => {
        const n = new Set(p)
        n.delete(title)
        return n
      })
    })
  }

  const suggest = useMealSuggest(ai)

  // 👧 Proposé par — kept-pool rows an existing member suggested. A dismiss just
  // removes it from the pool (the same live-poll-safe deferred delete every pool
  // row uses); planning it reuses the reusable `planIdea` above (it's still a
  // meal_ideas row under the hood).
  const kidIdeas = ideas.filter((i) => i.suggested_by != null)
  const kidRemoval = useDeferredRemoval(MEAL_IDEAS_KEY)
  const kidVisible = kidRemoval.visible(kidIdeas)
  function dismissKidIdea(idea: MealIdea) {
    kidRemoval.remove([idea.id], t.undo.mealIdeaRemoved(idea.title), () =>
      write('meal-ideas', { method: 'DELETE', body: { id: idea.id }, affectedKeys: [MEAL_IDEAS_KEY] }).catch(() => {}),
    )
  }

  const useSoonShortlist = rankUseSoon(recipes, soonItems)
    .filter((r) => r.uses.length > 0)
    .slice(0, 5)

  const CHIPS: { key: IdeasChip; icon: IconName; label: string }[] = [
    { key: 'ideas', icon: 'bowl-food-bold', label: t.kitchen.ideas },
    { key: 'favorites', icon: 'heart-bold', label: t.recipes.favorites },
    { key: 'past', icon: 'clock-counter-clockwise-bold', label: t.kitchen.ideasDrawer.chipPast },
    { key: 'useSoon', icon: 'arrow-counter-clockwise-bold', label: t.kitchen.ideasDrawer.chipUseSoon },
    ...(aiEnabled ? [{ key: 'ai' as const, icon: 'sparkle-bold' as const, label: t.kitchen.ideasDrawer.chipAi }] : []),
    { key: 'kid', icon: 'baby-bold', label: t.kitchen.ideasDrawer.chipKid },
  ]
  // AI off (binding unset or the household switched it off) drops the 🤖 source, so
  // a stale `?tab=ai` deep-link (or a mid-session AI outage) has no tab to select —
  // fall back to the default rather than render an empty body under no active tab.
  const active = CHIPS.some((c) => c.key === chip) ? chip : 'ideas'

  return (
    <>
      <SubTabs<IdeasChip>
        options={CHIPS.map((c) => ({ key: c.key, label: c.label, icon: c.icon }))}
        value={active}
        onSelect={onChip}
        ariaLabel={t.kitchen.ideasDrawer.title}
      />

      {active === 'ideas' && (
        <>
          {/* Say what this drawer IS. It opened on a bare list of rows wearing a
              caret, a pencil and a bin, and nothing stated that picking one puts
              supper on a day (UX review 2026-07-14) — a first-timer read it as a
              settings list. The line already existed in both languages and was
              rendered nowhere. */}
          <p className="lead ideas-drawer__lead">{t.kitchen.ideasHint}</p>
          <MealIdeas
            ideas={ideas}
            recipes={recipes}
            week={week}
            lowItems={lowItems}
            listItems={listItems}
            profileId={profileId}
            hideHeading
          />
        </>
      )}

      {active === 'favorites' && (
        <FavoritesChip recipes={recipes} members={members} week={week} readOnly={ro} onPlan={planRecipe} />
      )}

      {active === 'past' && <PastChip recipes={recipes} week={week} readOnly={ro} onPlan={planIdea} />}

      {active === 'useSoon' && (
        <>
          <Leftovers leftovers={leftovers} recentMeals={recentMeals} week={week} hideHeading />
          {useSoonShortlist.length > 0 && (
            <section className="ideas-drawer__shortlist">
              <p className="sheet__group-label mono">{t.kitchen.useSoon}</p>
              <RecipeRows
                rows={useSoonShortlist.map(({ recipe, uses }) => ({
                  key: recipe.id,
                  title: recipe.title,
                  sub: t.recipes.usesN(uses.length),
                  icon: 'carrot-bold' as const,
                  iconColor: '#6B8A52',
                  recipe,
                }))}
                week={week}
                readOnly={ro}
                onPlan={planRecipe}
              />
            </section>
          )}
        </>
      )}

      {active === 'ai' && (
        <>
          <AiChip
            suggest={suggest}
            keptAi={keptAi}
            onKeep={keepAiIdea}
            onPlan={planAiIdea}
            week={week}
            readOnly={ro}
          />
          <Cluster justify="end" className="ideas-drawer__footer">
            <button type="button" className="btn btn--ghost mono" onClick={onOpenFridge}>
              <InlineIcon name="cooking-pot-bold" /> {t.kitchen.fridge.tile}
            </button>
          </Cluster>
        </>
      )}

      {active === 'kid' && (
        <KidChip
          ideas={kidVisible}
          memberById={memberById}
          week={week}
          readOnly={ro}
          onPlan={planIdea}
          onDismiss={dismissKidIdea}
        />
      )}
    </>
  )
}

// A tap-to-reveal-the-plan-picker row, shared by the Favoris / 🧊 shortlist / 🤖 IA
// chips — read-mostly rows (no rename, no delete) over a recipe or a bare AI title.
function RecipeRows({
  rows,
  week,
  readOnly,
  onPlan,
  faces,
}: {
  rows: { key: string; title: string; sub?: string; icon: IconName; iconColor: string; recipe: Recipe }[]
  week: { date: number; label: string }[]
  readOnly: boolean
  onPlan: (r: Recipe, date: number, slot: MealSlot) => void
  faces?: (key: string) => ReactNode
}) {
  const t = useT()
  const { isOpen, toggle, close } = useSingleOpen()
  // null = "not picked yet" → follow the household's hero meal (Réglages ▸ Repas).
  const heroSlot = useMealPrefs().hero
  const [planSlotPick, setPlanSlot] = useState<MealSlot | null>(null)
  const planSlot = planSlotPick ?? heroSlot
  return (
    <ul className="kitchen__ideas-list">
      {rows.map((row) => {
        // Each row IS a recipe, so its picto opens that recipe (the tight icon-only
        // link « Idées »/« Restants » use); the chip itself still reveals the plan
        // picker. A guest can still follow it — recipe pages are read-only-safe.
        const to = `/kitchen/recipe/${row.recipe.id}`
        return (
        <li key={row.key} className="kitchen__idea">
          <div className="kitchen__idea-row">
            <Link to={to} className="kitchen__idea-open" aria-label={t.recipes.open} title={t.recipes.open}>
              <InlineIcon name={row.icon} size={14} color={row.iconColor} />
            </Link>
            {readOnly ? (
              <span className="chip kitchen__idea-name" aria-disabled="true">
                {row.title}
                {row.sub && <span className="mono kitchen__suggestion-sub"> · {row.sub}</span>}
              </span>
            ) : (
              <button
                type="button"
                className={'chip kitchen__idea-name' + (isOpen(row.key) ? ' is-open' : '')}
                onClick={() => toggle(row.key)}
                aria-expanded={isOpen(row.key)}
              >
                {row.title}
                {row.sub && <span className="mono kitchen__suggestion-sub"> · {row.sub}</span>}
                <span className="kitchen__idea-caret" aria-hidden="true">
                  <Icon name="caret-down-bold" size={12} />
                </span>
              </button>
            )}
            {faces?.(row.key)}
          </div>
          {!readOnly && isOpen(row.key) && (
            <MealPlanPicker
              slot={planSlot}
              onSlot={setPlanSlot}
              week={week}
              onPickDay={(date) => {
                close()
                onPlan(row.recipe, date, planSlot)
              }}
            />
          )}
        </li>
        )
      })}
    </ul>
  )
}

function FavoritesChip({
  recipes,
  members,
  week,
  readOnly,
  onPlan,
}: {
  recipes: Recipe[]
  members: Member[]
  week: { date: number; label: string }[]
  readOnly: boolean
  onPlan: (r: Recipe, date: number, slot: MealSlot) => void
}) {
  const t = useT()
  const { loversOf, lovedSet } = useLoves()
  const loved = recipes.filter((r) => lovedSet.has(r.id))
  if (loved.length === 0) return <EmptyState>{t.kitchen.ideasDrawer.emptyFavorites}</EmptyState>
  return (
    <RecipeRows
      rows={loved.map((r) => ({ key: r.id, title: r.title, icon: 'heart-bold' as const, iconColor: '#c2563a', recipe: r }))}
      week={week}
      readOnly={readOnly}
      onPlan={onPlan}
      faces={(key) => {
        const ids = loversOf(key)
        if (ids.length === 0) return null
        const faces = ids.map((id) => members.find((m) => m.id === id)).filter((m): m is Member => !!m)
        if (faces.length === 0) return null
        return (
          <span className="hearts__faces" aria-hidden="true">
            {faces.slice(0, 4).map((m) => {
              const photo = m.avatar_kind === 'photo' && m.avatar_ref ? imgUrl(m.avatar_ref) : null
              return (
                <span key={m.id} className="hearts__face" style={{ background: photo ? undefined : m.colour }}>
                  {photo ? <img src={photo} alt="" /> : (m.display_name?.[0] ?? '?').toUpperCase()}
                </span>
              )
            })}
          </span>
        )
      }}
    />
  )
}

// 🕰 « Déjà mangé » — the household's own record as an idea source: distinct past
// dishes from the FULL meal history (/api/meal-history?summary=1), most-often-
// planned first. Each row wears only a quiet "dernière fois : …" tag — the rank is
// the order, no count ships (calm — the chore-ledger rule, applied to dishes).
// A dish whose most recent planning linked a recipe keeps that link: the lead
// picto opens the recipe, and planning it re-links the recipe. Cold-path: the
// query mounts only while this source is active, and every meal write refreshes
// it via the ['meal-history'] prefix invalidation.
function PastChip({
  recipes,
  week,
  readOnly,
  onPlan,
}: {
  recipes: Recipe[]
  week: { date: number; label: string }[]
  readOnly: boolean
  onPlan: (dish: Pick<PastDish, 'title' | 'recipe_id'>, date: number, slot: MealSlot) => void
}) {
  const t = useT()
  const { lang } = useLang()
  const summaryQ = useQuery({
    queryKey: MEAL_HISTORY_SUMMARY_KEY,
    queryFn: () => api<MealHistorySummary>('meal-history?summary=1'),
  })
  const { isOpen, toggle, close } = useSingleOpen()
  // null = "not picked yet" → follow the household's hero meal (Réglages ▸ Repas).
  const heroSlot = useMealPrefs().hero
  const [planSlotPick, setPlanSlot] = useState<MealSlot | null>(null)
  const planSlot = planSlotPick ?? heroSlot
  // A failed summary read would otherwise leave this source PERMANENTLY blank —
  // the chip stays selected over nothing at all. Say it failed; the loading pass
  // still renders nothing (the empty line must not flash before the data lands).
  if (summaryQ.error && !summaryQ.data) return <LoadError />
  if (!summaryQ.data) return null // brief cold load
  const dishes = summaryQ.data.dishes
  if (dishes.length === 0) return <EmptyState>{t.kitchen.ideasDrawer.emptyPast}</EmptyState>
  return (
    <ul className="kitchen__ideas-list">
      {dishes.map((dish) => {
        // The dish's most recent planning may have linked a recipe that still
        // exists — its picto then opens that recipe (the tight icon-only link
        // every source uses); a bare title keeps a plain clock.
        const recipe = dish.recipe_id ? recipes.find((r) => r.id === dish.recipe_id) : undefined
        const key = dish.title.toLowerCase()
        const sub = t.kitchen.ideasDrawer.lastServedOn(formatPastDay(dish.last_at, lang))
        return (
          <li key={key} className="kitchen__idea">
            <div className="kitchen__idea-row">
              {recipe ? (
                <Link
                  to={`/kitchen/recipe/${recipe.id}`}
                  className="kitchen__idea-open"
                  aria-label={t.recipes.open}
                  title={t.recipes.open}
                >
                  <InlineIcon name="clock-counter-clockwise-bold" size={14} color="var(--terracotta-deep)" />
                </Link>
              ) : (
                <InlineIcon name="clock-counter-clockwise-bold" size={14} color="var(--terracotta-deep)" />
              )}
              {readOnly ? (
                <span className="chip kitchen__idea-name" aria-disabled="true">
                  {dish.title}
                  <span className="mono kitchen__suggestion-sub"> · {sub}</span>
                </span>
              ) : (
                <button
                  type="button"
                  className={'chip kitchen__idea-name' + (isOpen(key) ? ' is-open' : '')}
                  onClick={() => toggle(key)}
                  aria-expanded={isOpen(key)}
                >
                  {dish.title}
                  <span className="mono kitchen__suggestion-sub"> · {sub}</span>
                  <span className="kitchen__idea-caret" aria-hidden="true">
                    <Icon name="caret-down-bold" size={12} />
                  </span>
                </button>
              )}
            </div>
            {!readOnly && isOpen(key) && (
              <MealPlanPicker
                slot={planSlot}
                onSlot={setPlanSlot}
                week={week}
                onPickDay={(date) => {
                  close()
                  onPlan(dish, date, planSlot)
                }}
              />
            )}
          </li>
        )
      })}
    </ul>
  )
}

function AiChip({
  suggest,
  keptAi,
  onKeep,
  onPlan,
  week,
  readOnly,
}: {
  suggest: ReturnType<typeof useMealSuggest>
  keptAi: Set<string>
  onKeep: (title: string) => void
  onPlan: (title: string, date: number, slot: MealSlot) => void
  week: { date: number; label: string }[]
  readOnly: boolean
}) {
  const t = useT()
  const { isOpen, toggle, close } = useSingleOpen()
  // null = "not picked yet" → follow the household's hero meal (Réglages ▸ Repas).
  const heroSlot = useMealPrefs().hero
  const [planSlotPick, setPlanSlot] = useState<MealSlot | null>(null)
  const planSlot = planSlotPick ?? heroSlot
  return (
    <div className="ideas-drawer__ai">
      <Cluster>
        <button type="button" className="btn btn--primary mono" onClick={suggest.refresh} disabled={suggest.busy || suggest.aiOff}>
          <InlineIcon name="sparkle-bold" />{' '}
          {suggest.batch.length ? t.kitchen.ideasDrawer.aiMore : t.kitchen.ideasDrawer.aiAsk}
        </button>
      </Cluster>
      {suggest.busy && (
        <p className="kitchen__ai-waking mono" role="status">
          ⏳ {t.kitchen.aiWaking}
        </p>
      )}
      {suggest.aiOff && <EmptyState>{t.kitchen.suggestAiOff}</EmptyState>}
      {!suggest.busy && !suggest.aiOff && suggest.batch.length === 0 && (
        <EmptyState>{t.kitchen.ideasDrawer.emptyAi}</EmptyState>
      )}
      {suggest.batch.length > 0 && (
        <ul className="kitchen__ideas-list">
          {suggest.batch.map((title) => (
            <li key={title} className="kitchen__idea">
              <div className="kitchen__idea-row">
                {readOnly ? (
                  <span className="chip kitchen__idea-name" aria-disabled="true">
                    <InlineIcon name="sparkle-bold" size={14} color="#D9842A" /> {title}
                  </span>
                ) : (
                  <button
                    type="button"
                    className={'chip kitchen__idea-name' + (isOpen(title) ? ' is-open' : '')}
                    onClick={() => toggle(title)}
                    aria-expanded={isOpen(title)}
                  >
                    <InlineIcon name="sparkle-bold" size={14} color="#D9842A" /> {title}
                    <span className="kitchen__idea-caret" aria-hidden="true">
                      <Icon name="caret-down-bold" size={12} />
                    </span>
                  </button>
                )}
                {!readOnly && (
                  <button
                    type="button"
                    className="btn btn--ghost mono"
                    onClick={() => onKeep(title)}
                    disabled={keptAi.has(title)}
                  >
                    {keptAi.has(title) ? (
                      <>
                        <InlineIcon name="check-bold" /> {t.kitchen.suggestKept}
                      </>
                    ) : (
                      <>
                        <InlineIcon name="plus-bold" /> {t.kitchen.suggestKeep}
                      </>
                    )}
                  </button>
                )}
              </div>
              {!readOnly && isOpen(title) && (
                <MealPlanPicker
                  slot={planSlot}
                  onSlot={setPlanSlot}
                  week={week}
                  onPickDay={(date) => {
                    close()
                    onPlan(title, date, planSlot)
                  }}
                />
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function KidChip({
  ideas,
  memberById,
  week,
  readOnly,
  onPlan,
  onDismiss,
}: {
  ideas: MealIdea[]
  memberById: (id: string | null | undefined) => Member | undefined
  week: { date: number; label: string }[]
  readOnly: boolean
  onPlan: (idea: MealIdea, date: number, slot: MealSlot) => void
  onDismiss: (idea: MealIdea) => void
}) {
  const t = useT()
  const { isOpen, toggle, close } = useSingleOpen()
  // null = "not picked yet" → follow the household's hero meal (Réglages ▸ Repas).
  const heroSlot = useMealPrefs().hero
  const [planSlotPick, setPlanSlot] = useState<MealSlot | null>(null)
  const planSlot = planSlotPick ?? heroSlot
  if (ideas.length === 0) return <EmptyState>{t.kitchen.ideasDrawer.emptyKid}</EmptyState>
  return (
    <ul className="kitchen__ideas-list ideas-drawer__kid">
      {ideas.map((idea) => {
        const who = memberById(idea.suggested_by)
        const dayLabel = idea.date != null ? week.find((w) => w.date === idea.date)?.label : undefined
        return (
          <li key={idea.id} className="kitchen__idea">
            <div className="kitchen__idea-row">
              <Avatar kind={who?.avatar_kind} photo={who?.avatar_ref} colour={who?.colour} name={who?.display_name} size={28} />
              {readOnly ? (
                <span className="chip kitchen__idea-name" aria-disabled="true">
                  {idea.title}
                  {dayLabel && <span className="mono kitchen__suggestion-sub"> · {dayLabel}</span>}
                </span>
              ) : (
                <button
                  type="button"
                  className={'chip kitchen__idea-name' + (isOpen(idea.id) ? ' is-open' : '')}
                  onClick={() => toggle(idea.id)}
                  aria-expanded={isOpen(idea.id)}
                >
                  {idea.title}
                  {dayLabel && <span className="mono kitchen__suggestion-sub"> · {dayLabel}</span>}
                  <span className="kitchen__idea-caret" aria-hidden="true">
                    <Icon name="caret-down-bold" size={12} />
                  </span>
                </button>
              )}
              <RowActions onDelete={() => onDismiss(idea)} deleteLabel={t.kitchen.removeIdea} readOnly={readOnly} />
            </div>
            {!readOnly && isOpen(idea.id) && (
              <MealPlanPicker
                slot={planSlot}
                onSlot={setPlanSlot}
                week={week}
                onPickDay={(date) => {
                  close()
                  onPlan(idea, date, planSlot)
                }}
              />
            )}
          </li>
        )
      })}
    </ul>
  )
}
