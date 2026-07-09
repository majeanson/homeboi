import { useState, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useT } from '../../i18n'
import { api } from '../../lib/api'
import { useWrite } from '../../lib/write'
import { useRecordUndo } from '../../lib/toast'
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
import { type MealIdea, type Leftover, type MealRow, MEAL_IDEAS_KEY, LEFTOVERS_KEY, MEALS_KEY } from './types'
import { recipeOptions, mealOptions } from './comboOptions'
import { MealPool } from './MealPool'
import { MealPlanPicker } from './MealPlanPicker'
import { SubTabs } from '../SubTabs'
import { Cluster } from '../Layout'
import { Avatar } from '../Avatar'
import { Icon, InlineIcon, type IconName } from '../Icon'
import { EmptyState } from '../EmptyState'
import { RowActions } from '../RowActions'

// « Un seul tiroir d'idées-repas » (C-14, bmad/10) — the ONE place every source of
// "what's for supper" ideas lives, replacing four-plus scattered pools a family
// learned one of and never found the rest (dormant machinery). A SubTabs row of
// sources, ONE active at a time:
//   Idées (default)   — the kept, reusable pool (MEAL_IDEAS_KEY) — was MealIdeas.tsx.
//   ⭐ Favoris          — recipes the household loved (useLoves) — shows WHICH faces
//                        loved it, never a count (calm — the chore-ledger rule).
//   🧊 À écouler        — Restants (leftovers) to finish + a `rankUseSoon` shortlist
//                        of recipes that use up what's about to spoil — was
//                        Leftovers.tsx, plus the old "useup" suggestion source.
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
export type IdeasChip = 'ideas' | 'favorites' | 'useSoon' | 'ai' | 'kid'

export const IDEAS_CHIPS = ['ideas', 'favorites', 'useSoon', 'ai', 'kid'] as const

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
  const recordUndo = useRecordUndo()
  const ro = isGuest()

  const { data: membersData } = useQuery({
    queryKey: MEMBERS_KEY,
    queryFn: () => api<{ members: Member[] }>('members'),
  })
  const members = membersData?.members ?? []
  const memberById = (id: string | null | undefined) => (id ? members.find((m) => m.id === id) : undefined)

  const recipeOpts = recipeOptions(recipes, lowItems, listItems, t)
  const recentOpts = mealOptions(recentMeals)

  // « Idées » — the kept, reusable pool. Planning an idea leaves it in the pool.
  function planIdea(idea: MealIdea, date: number, slot: MealSlot) {
    void write('meals', {
      method: 'POST',
      body: { date, slot, title: idea.title, recipeId: idea.recipe_id ?? null, staples: [] },
      affectedKeys: [MEALS_KEY, BOARD_KEY],
    }).catch(() => {})
  }

  // « À écouler » — Restants: planning CONSUMES the pool row (it becomes a real,
  // badged meal), so this carries a compensating undo (delete the meal AND
  // re-insert the pool row) — mirrors the retired Leftovers.tsx exactly.
  async function planLeftover(l: Leftover, date: number, slot: MealSlot) {
    const keys = [LEFTOVERS_KEY, MEALS_KEY, BOARD_KEY]
    const res = await write<{ mealId?: string }>('meal-leftovers', {
      method: 'POST',
      body: { action: 'plan', id: l.id, date, slot },
      affectedKeys: keys,
    }).catch(() => null)
    const mealId = res && !res.queued ? res.data?.mealId : undefined
    recordUndo({
      message: t.undo.leftoverPlanned(l.title),
      onUndo: async () => {
        if (mealId) await write('meals', { method: 'DELETE', body: { id: mealId }, affectedKeys: keys }).catch(() => {})
        await write('meal-leftovers', {
          method: 'POST',
          body: { title: l.title, recipeId: l.recipe_id ?? null, sourceMealId: l.source_meal_id ?? null },
          affectedKeys: keys,
        }).catch(() => {})
      },
    })
  }

  // A recipe row (⭐ Favoris / the 🧊 use-soon shortlist) plans REUSABLY, like an
  // idea — nothing is consumed, so no undo bookkeeping is needed.
  function planRecipe(r: Recipe, date: number, slot: MealSlot) {
    void write('meals', {
      method: 'POST',
      body: { date, slot, title: r.title, recipeId: r.id, staples: [] },
      affectedKeys: [MEALS_KEY, BOARD_KEY],
    }).catch(() => {})
  }

  // A bare AI-suggested title (🤖, no recipe link yet) plans the same way.
  function planAiIdea(title: string, date: number, slot: MealSlot) {
    void write('meals', {
      method: 'POST',
      body: { date, slot, title, recipeId: null, staples: [] },
      affectedKeys: [MEALS_KEY, BOARD_KEY],
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
        <MealPool<MealIdea, Recipe>
          items={ideas}
          queryKey={MEAL_IDEAS_KEY}
          collectionKey="ideas"
          endpoint="meal-ideas"
          options={recipeOpts}
          buildAddBody={(title, picked) => ({ title, recipeId: picked?.data.id ?? null, suggestedBy: profileId })}
          onPlan={planIdea}
          renderLead={(idea) => (idea.recipe_id ? <InlineIcon name="book-open-bold" size={14} color="var(--berry-deep)" /> : null)}
          // An idea born from a recipe: its 📖 picto opens that recipe (same tight
          // icon-only link as the combobox row). Tapping the chip still plans it.
          leadTo={(idea) => (idea.recipe_id ? `/kitchen/recipe/${idea.recipe_id}` : undefined)}
          leadToLabel={t.recipes.open}
          week={week}
          helpKey="ideas"
          noMatchLabel={t.recipes.noMatch}
          guide={{ card: 'kitchen', point: 9 }}
          hideHeading
          labels={{
            heading: t.kitchen.ideas,
            addAria: t.kitchen.addIdea,
            addPlaceholder: t.kitchen.addIdea,
            empty: t.kitchen.ideasEmpty,
            removeLabel: t.kitchen.removeIdea,
            removedUndo: (title) => t.undo.mealIdeaRemoved(title),
          }}
        />
      )}

      {active === 'favorites' && (
        <FavoritesChip recipes={recipes} members={members} week={week} readOnly={ro} onPlan={planRecipe} />
      )}

      {active === 'useSoon' && (
        <>
          <MealPool<Leftover, MealRow>
            items={leftovers}
            queryKey={LEFTOVERS_KEY}
            collectionKey="leftovers"
            endpoint="meal-leftovers"
            options={recentOpts}
            buildAddBody={(title, picked) => ({ title, recipeId: picked?.data.recipe_id ?? null, sourceMealId: picked?.data.id ?? null })}
            onPlan={planLeftover}
            renderLead={() => <InlineIcon name="arrow-counter-clockwise-bold" size={14} color="var(--terracotta-deep)" />}
            week={week}
            helpKey="leftovers"
            guide={{ card: 'kitchen', point: 8 }}
            hideHeading
            labels={{
              heading: t.kitchen.leftovers,
              addAria: t.kitchen.leftoversAdd,
              addPlaceholder: t.kitchen.leftoversAdd,
              empty: t.kitchen.leftoversEmpty,
              removeLabel: t.kitchen.removeLeftover,
              removedUndo: (title) => t.undo.leftoverRemoved(title),
            }}
          />
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
  const { isOpen, toggle, close } = useSingleOpen()
  // null = "not picked yet" → follow the household's hero meal (Réglages ▸ Repas).
  const heroSlot = useMealPrefs().hero
  const [planSlotPick, setPlanSlot] = useState<MealSlot | null>(null)
  const planSlot = planSlotPick ?? heroSlot
  return (
    <ul className="kitchen__ideas-list">
      {rows.map((row) => (
        <li key={row.key} className="kitchen__idea">
          <div className="kitchen__idea-row">
            {readOnly ? (
              <span className="chip kitchen__idea-name" aria-disabled="true">
                <InlineIcon name={row.icon} size={14} color={row.iconColor} /> {row.title}
                {row.sub && <span className="mono kitchen__suggestion-sub"> · {row.sub}</span>}
              </span>
            ) : (
              <button
                type="button"
                className={'chip kitchen__idea-name' + (isOpen(row.key) ? ' is-open' : '')}
                onClick={() => toggle(row.key)}
                aria-expanded={isOpen(row.key)}
              >
                <InlineIcon name={row.icon} size={14} color={row.iconColor} /> {row.title}
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
      ))}
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
