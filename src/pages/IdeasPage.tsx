import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useLang, useT } from '../i18n'
import { api, isUnauthorized } from '../lib/api'
import { WINDOW_DAYS_DEFAULT } from '../lib/mealSlots'
import { live } from '../lib/query'
import { useAi } from '../lib/ai'
import { useProfile } from '../lib/profile'
import { useTabParam } from '../lib/tabParam'
import { useSceneClose, useEscapeKey } from '../lib/sceneNav'
import { BOARD_KEY } from '../lib/queryKeys'
import { useMeals, useRecipes, usePantry, useLeftovers } from '../lib/queryHooks'
import { PairPrompt } from '../components/Fallback'
import { SceneHead } from '../components/SceneHead'
import { IdeasDrawer, IDEAS_CHIPS, type IdeasChip } from '../components/kitchen/IdeasDrawer'
import { EmptyFridgeSheet } from '../components/kitchen/EmptyFridgeSheet'
import { useAiWake } from '../components/kitchen/useAiWake'
import { useWeekLabeled } from '../components/kitchen/week'
import { type LowRow, type MealIdeasData, type ReserveData, MEAL_IDEAS_KEY, USE_SOON_KEY, RESERVE_KEY } from '../components/kitchen/types'

// /kitchen/idees — « Un seul tiroir d'idées-repas » (C-14) as a full-screen .scene
// route. It was a bottom Sheet, which a sheet's content-driven height made restless:
// every source swap (an empty « Favoris » → a full 🤖 IA batch) resized it from the
// bottom edge, so the tab row itself slid up and down as you moved between sources.
// A scene pins its header and scrolls only the body, so the tabs hold their y — the
// same reason DayManageSheet became /kitchen/day/:date.
//
// This page OWNS the queries (all shared cache keys the Kitchen grid already reads,
// so arriving here is warm and a cold deep-link still works) and the active source
// (?tab=, useTabParam — so the 👧 empty-day chip deep-links to ?tab=kid and a return
// from a planning scene lands back on the same source). IdeasDrawer is the body.
export function IdeasPage() {
  const t = useT()
  const { lang } = useLang()
  const { memberId: profileId } = useProfile()
  const close = useSceneClose('/kitchen')
  useEscapeKey(close)

  const [chip, setChip] = useTabParam<IdeasChip>('tab', 'ideas', IDEAS_CHIPS)

  const meals = useMeals()
  const recipesQ = useRecipes()
  const pantry = usePantry()
  const leftoversQ = useLeftovers()
  const ideasQ = useQuery({ queryKey: MEAL_IDEAS_KEY, queryFn: () => api<MealIdeasData>('meal-ideas'), ...live })
  const useSoonQ = useQuery({ queryKey: USE_SOON_KEY, queryFn: () => api<{ soon: LowRow[] }>('use-soon'), ...live })
  const reserveQ = useQuery({ queryKey: RESERVE_KEY, queryFn: () => api<ReserveData>('reserve'), ...live })
  // Shares the ['board'] cache with the Board/Liste pages — read only for the
  // shopping list, which ranks recipes by "what you could cook now".
  const boardQ = useQuery({
    queryKey: BOARD_KEY,
    queryFn: () => api<{ list: { text: string }[] }>('board'),
    ...live,
  })

  const lowItems = useMemo(() => (pantry.data?.low ?? []).map((l) => l.item), [pantry.data])
  const listItems = useMemo(() => (boardQ.data?.list ?? []).map((i) => i.text), [boardQ.data])
  const soonItems = useMemo(() => (useSoonQ.data?.soon ?? []).map((s) => s.item), [useSoonQ.data])
  // La réserve item names — the secondary "also on hand" signal « Vide-frigo » folds
  // in alongside use-soon (anti-waste).
  const reserveItems = useMemo(() => (reserveQ.data?.reserve ?? []).map((r) => r.item), [reserveQ.data])

  // The countdown window the day chips plan onto — same source (/api/meals) and same
  // DST-safe stepping as the Kitchen grid. 10 is the just-loaded fallback.
  //
  // `weekStart ?? 0` is the epoch until the meals payload lands, and here that was not
  // the cosmetic January-1970 flash the Kitchen grid had (bmad/11 tier-3, fixed at
  // Kitchen.tsx): these labelled days ARE the "plan it on…" chips, so on a cold open
  // a tap wrote a meal dated 1 Jan 1970. Empty week until the real anchor arrives —
  // the same guard RecipeViewPage, AddSheet and nextMeal already had, and this was
  // the one consumer of the five that didn't. (Sweep the rule, not the site.)
  const weekStart = meals.data?.weekStart ?? 0
  const labeled = useWeekLabeled(weekStart, meals.data?.windowDays ?? WINDOW_DAYS_DEFAULT, lang)
  const week = weekStart ? labeled : []

  const ai = useAiWake()
  const { enabled: aiEnabled } = useAi()

  // « Vide-frigo » (#5) — its own two-step modal, opened from the drawer's footer.
  const [fridgeOpen, setFridgeOpen] = useState(false)

  if (isUnauthorized(meals.error) || isUnauthorized(pantry.error)) return <PairPrompt />

  return (
    <div className="scene ideas-drawer" aria-label={t.kitchen.ideasDrawer.title}>
      <SceneHead title={t.kitchen.ideasDrawer.title} card="kitchen" onClose={close} closeLabel={t.common.close} />
      <div className="scene__body">
        <IdeasDrawer
          chip={chip}
          onChip={setChip}
          ideas={ideasQ.data?.ideas ?? []}
          leftovers={leftoversQ.data?.leftovers ?? []}
          recentMeals={meals.data?.recent ?? []}
          recipes={recipesQ.data?.recipes ?? []}
          lowItems={lowItems}
          listItems={listItems}
          soonItems={soonItems}
          week={week}
          profileId={profileId}
          ai={ai}
          aiEnabled={aiEnabled}
          onOpenFridge={() => setFridgeOpen(true)}
        />
      </div>
      <EmptyFridgeSheet
        open={fridgeOpen}
        onClose={() => setFridgeOpen(false)}
        soonItems={soonItems}
        reserveItems={reserveItems}
      />
    </div>
  )
}
