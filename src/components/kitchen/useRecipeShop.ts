import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { normKey } from '../../lib/cookable'
import { ingredientName } from '../../lib/ingredient'
import { type Recipe } from '../../lib/recipes'
import { type MealRow, type WeekDay } from './types'

// "Shop this week", extracted from the Kitchen page: walk the planned suppers,
// pull each matched recipe's ingredients, drop anything already on the list
// (normalized), and confirm the rest onto the shared grocery list in one write.
// `recipeFor` resolves a planned meal to its recipe by the exact recipe_id link
// first (title only as a fallback), so renamed/duplicate recipes still shop.
export function useRecipeShop(
  week: WeekDay[],
  recipeFor: (meal: MealRow) => Recipe | undefined,
  listItems: string[],
) {
  const qc = useQueryClient()
  const [shopPrompt, setShopPrompt] = useState<{ item: string; on: boolean }[] | null>(null)
  const [shopBusy, setShopBusy] = useState(false)

  // Everything pre-checked — untick what you already have.
  function beginShopWeek() {
    const onList = new Set(listItems.map(normKey).filter(Boolean))
    const picked = new Set<string>()
    const items: string[] = []
    for (const { meal } of week) {
      if (!meal) continue
      const r = recipeFor(meal)
      if (!r) continue
      for (const ing of r.ingredients) {
        const k = normKey(ing)
        if (!k || onList.has(k) || picked.has(k)) continue
        picked.add(k)
        items.push(ingredientName(ing)) // buyable name, not the measured line
      }
    }
    setShopPrompt(items.map((item) => ({ item, on: true })))
  }

  function toggleShop(item: string) {
    setShopPrompt((p) => p?.map((o) => (o.item === item ? { ...o, on: !o.on } : o)) ?? p)
  }

  async function confirmShop() {
    const items = (shopPrompt ?? []).filter((o) => o.on).map((o) => o.item)
    if (!items.length) {
      setShopPrompt(null)
      return
    }
    setShopBusy(true)
    try {
      await api('recipe-to-list', { method: 'POST', body: { items } })
      qc.invalidateQueries({ queryKey: ['board'] })
      qc.invalidateQueries({ queryKey: ['list'] })
    } catch {
      /* a failed add isn't worth an error wall — the list just won't grow */
    } finally {
      setShopBusy(false)
      setShopPrompt(null)
    }
  }

  // How many planned suppers map to a saved recipe — the shop button only shows
  // when there's something to gather (never a no-op).
  const shoppableCount = week.filter((w) => w.meal && recipeFor(w.meal)).length

  return { shopPrompt, setShopPrompt, shopBusy, beginShopWeek, toggleShop, confirmShop, shoppableCount }
}
