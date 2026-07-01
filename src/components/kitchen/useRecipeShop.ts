import { useState } from 'react'
import { useWrite } from '../../lib/write'
import { normKey } from '../../lib/cookable'
import { ingredientName } from '../../lib/ingredient'
import { withoutHeadings } from '../../lib/recipeSections'
import { type Recipe } from '../../lib/recipes'
import { BOARD_KEY } from '../../lib/queryKeys'
import { type MealRow } from './types'

// "Shop this week", extracted from the Kitchen page: walk EVERY planned meal that
// maps to a recipe (any slot, several per slot), pull each matched recipe's
// ingredients, drop anything already on the list (normalized), and confirm the
// rest onto the shared grocery list in one write. `recipeFor` resolves a planned
// meal to its recipe by the exact recipe_id link first (title as a fallback), so
// renamed/duplicate recipes still shop.
export function useRecipeShop(
  meals: MealRow[],
  recipeFor: (meal: MealRow) => Recipe | undefined,
  listItems: string[],
) {
  const write = useWrite()
  const [shopPrompt, setShopPrompt] = useState<{ item: string; on: boolean }[] | null>(null)
  const [shopBusy, setShopBusy] = useState(false)

  // Everything starts UNCHECKED — tick only what you actually need this trip.
  // (The opposite of the old "all on, untick what you have": a calmer default that
  // never dumps a recipe's whole ingredient list onto the grocery list by reflex.)
  // Items already on the list are dropped entirely — they're not a choice to make.
  function beginShopWeek() {
    const onList = new Set(listItems.map(normKey).filter(Boolean))
    const picked = new Set<string>()
    const items: string[] = []
    const seenRecipe = new Set<string>()
    for (const meal of meals) {
      const r = recipeFor(meal)
      if (!r || seenRecipe.has(r.id)) continue // a recipe planned twice shops once
      seenRecipe.add(r.id)
      for (const ing of withoutHeadings(r.ingredients)) {
        const k = normKey(ing)
        if (!k || onList.has(k) || picked.has(k)) continue
        picked.add(k)
        items.push(ingredientName(ing)) // buyable name, not the measured line
      }
    }
    setShopPrompt(items.map((item) => ({ item, on: false })))
  }

  function toggleShop(item: string) {
    setShopPrompt((p) => p?.map((o) => (o.item === item ? { ...o, on: !o.on } : o)) ?? p)
  }

  // One tap to flip the whole list — check everything when most of it is wanted,
  // or clear back to none. Mirrors the current majority state.
  function toggleAllShop() {
    setShopPrompt((p) => {
      if (!p) return p
      const allOn = p.every((o) => o.on)
      return p.map((o) => ({ ...o, on: !allOn }))
    })
  }

  async function confirmShop() {
    const items = (shopPrompt ?? []).filter((o) => o.on).map((o) => o.item)
    if (!items.length) {
      setShopPrompt(null)
      return
    }
    setShopBusy(true)
    try {
      // useWrite so a "shop this week" done offline (the wall tablet) queues + replays;
      // the shared list lives under BOARD_KEY (no separate ['list'] cache).
      await write('recipe-to-list', { method: 'POST', body: { items }, affectedKeys: [BOARD_KEY] })
    } catch {
      /* a failed add isn't worth an error wall — the list just won't grow */
    } finally {
      setShopBusy(false)
      setShopPrompt(null)
    }
  }

  // How many distinct recipes are planned this week — the shop button only shows
  // when there's something to gather (never a no-op).
  const shoppableCount = new Set(meals.map((m) => recipeFor(m)?.id).filter(Boolean)).size

  return { shopPrompt, setShopPrompt, shopBusy, beginShopWeek, toggleShop, toggleAllShop, confirmShop, shoppableCount }
}
