// Per-kind builders: an entity (a board row, a kitchen meal, a recipe…) → a
// normalized DetailModel (lib/detail) the shared EntityDetailSheet can render.
// Pure functions — no hooks — so a caller that already holds the data (Board,
// Kitchen, RecipesTab) just calls the matching builder and hands the result to
// useEntityDetail().open(). Colours/icons reuse the one source (lib/cats), dates
// the shared formatters (lib/format), images imgUrl()/recipeImg().
import { CATS } from '../../lib/cats'
import { formatDay, formatTime } from '../../lib/format'
import { localDayStart } from '../../lib/localDay'
import { recipeImg, recipeTotalMin, type Recipe } from '../../lib/recipes'
import { SLOT_ICON_NAME, isMealSlot } from '../../lib/mealSlots'
import type { Lang } from '../../i18n'
import type { IconName } from '../Icon'
import { nameOf, colorOf, type Dict, type Member, type EventRow, type ChoreInstance } from '../board/types'
import type { DetailBlock, DetailModel, DetailWho } from '../../lib/detail'

// What every builder needs to resolve names/faces + locale + copy.
export interface DetailCtx {
  t: Dict
  lang: Lang
  members: Member[]
}

// A face for the header, drawn by the shared <Avatar>. Null when no member.
function whoOf(members: Member[], id: string | null, role?: string): DetailWho | null {
  const m = members.find((x) => x.id === id)
  if (!m) return null
  return { role, name: m.display_name, colour: m.colour, avatarKind: m.avatar_kind ?? null, avatarRef: m.avatar_ref ?? null }
}

// Recipe section headings are inline "## Title" lines in the flat arrays — skip
// them when previewing ingredients/steps (every iterator must, see CLAUDE.md).
const isHeading = (line: string) => line.trim().startsWith('##')
const preview = (lines: string[] | undefined, n: number) => (lines ?? []).filter((l) => !isHeading(l) && l.trim()).slice(0, n)

// — Agenda event —
export function buildEvent(e: EventRow, ctx: DetailCtx): DetailModel {
  const { t, lang, members } = ctx
  const day = localDayStart(new Date(e.start_at * 1000))
  return {
    kind: 'event',
    title: e.title,
    icon: CATS.event.icon,
    accent: colorOf(members, e.member_id) ?? CATS.event.color,
    when: e.all_day ? t.board.allDay : `${formatDay(e.start_at, lang)} · ${formatTime(e.start_at, lang)}`,
    who: whoOf(members, e.member_id),
    actions: [{ key: 'day', label: t.detail.openDay, icon: 'calendar-blank-bold', href: `/kitchen/day/${day}` }],
  }
}

// — A recurring chore / a one-off to-do (both ride the ChoreInstance shape) —
export function buildChore(
  c: ChoreInstance,
  ctx: DetailCtx,
  opts?: { onDone?: () => void; upcoming?: boolean; todo?: boolean },
): DetailModel {
  const { t, lang, members } = ctx
  const team = (c.team ?? []).map((id) => nameOf(members, id)).filter((n): n is string => !!n)
  const blocks: DetailBlock[] = team.length > 1 ? [{ kind: 'chips', label: t.detail.team, chips: team }] : []
  const actions = opts?.onDone
    ? [{ key: 'done', label: t.detail.markDone, icon: 'check-bold' as IconName, primary: true, run: opts.onDone }]
    : []
  return {
    kind: opts?.todo ? 'todo' : 'chore',
    title: c.title,
    icon: opts?.todo ? 'check-bold' : CATS.chore.icon,
    accent: c.color ?? CATS.chore.color,
    when: opts?.upcoming ? formatDay(c.at, lang) : undefined,
    who: whoOf(members, c.who_id, t.detail.turn),
    blocks,
    actions,
  }
}

// — An undated leftover to finish ("Restants à finir") —
export function buildLeftover(l: { id: string; title: string }, ctx: DetailCtx, opts?: { onDone?: () => void }): DetailModel {
  const { t } = ctx
  return {
    kind: 'leftover',
    title: l.title,
    icon: 'arrow-counter-clockwise-bold',
    accent: CATS.meal.color,
    whoLabel: t.kitchen.leftoversTag,
    actions: opts?.onDone
      ? [{ key: 'eaten', label: t.detail.markEaten, icon: 'check-bold', primary: true, run: opts.onDone }]
      : [],
  }
}

// The fields a meal can carry across the board (DayMealRow) and the kitchen
// (MealRow) — the builder reads whatever's present.
interface MealLike {
  id: string
  title: string
  slot?: string
  cook_member_id?: string | null
  recipe_id?: string | null
  is_leftover?: number
}

// — A planned meal. `recipe` (when the caller has it) lights up the photo, the
// hearts and "Ouvrir la recette"; `color` is the slot colour (useMealPrefs);
// `daySec` enables "Voir la journée" (the day planner). —
export function buildMeal(
  m: MealLike,
  ctx: DetailCtx,
  opts?: { recipe?: Recipe | null; color?: string; slotLabel?: string; daySec?: number },
): DetailModel {
  const { t, members } = ctx
  const slot = m.slot
  const icon: IconName = slot && isMealSlot(slot) ? SLOT_ICON_NAME[slot] : CATS.meal.icon
  const blocks: DetailBlock[] = m.is_leftover ? [{ kind: 'text', text: t.kitchen.leftoversTag }] : []
  const actions: DetailModel['actions'] = []
  if (m.recipe_id)
    actions.push({ key: 'recipe', label: t.detail.openRecipe, icon: 'book-open-bold', primary: true, href: `/kitchen/recipe/${m.recipe_id}` })
  if (opts?.daySec) actions.push({ key: 'day', label: t.detail.openDay, icon: 'calendar-blank-bold', href: `/kitchen/day/${opts.daySec}` })
  return {
    kind: 'meal',
    title: m.title,
    icon,
    photo: opts?.recipe ? recipeImg(opts.recipe.image) : null,
    accent: opts?.color ?? CATS.meal.color,
    whoLabel: opts?.slotLabel,
    who: whoOf(members, m.cook_member_id ?? null, t.detail.cook),
    loveRecipeId: m.recipe_id ?? undefined,
    blocks,
    actions,
  }
}

// — A recipe from the book —
export function buildRecipe(r: Recipe, ctx: DetailCtx): DetailModel {
  const { t } = ctx
  const total = recipeTotalMin(r)
  const blocks: DetailBlock[] = []
  if (r.tags?.length) blocks.push({ kind: 'chips', chips: r.tags })
  const ing = preview(r.ingredients, 6)
  if (ing.length) blocks.push({ kind: 'list', label: t.detail.ingredients, items: ing })
  return {
    kind: 'recipe',
    title: r.title,
    icon: 'book-open-bold',
    accent: CATS.meal.color,
    photo: recipeImg(r.image),
    whoLabel: total ? `${total} min` : undefined,
    loveRecipeId: r.id,
    blocks,
    actions: [
      { key: 'open', label: t.detail.openRecipe, icon: 'book-open-bold', primary: true, href: `/kitchen/recipe/${r.id}` },
      { key: 'cook', label: t.kitchen.cook, icon: 'cooking-pot-bold', href: `/kitchen/recipe/${r.id}/cook` },
    ],
  }
}

// A routine as the /routines + ＋ picker carry it (id, name, child, colour, cards).
interface RoutineLike {
  id: string
  name: string
  memberName?: string | null
  color?: string | null
  avatarPhoto?: string | null
  cards?: Array<{ label?: string }> | unknown[]
}

// — A kid routine —
export function buildRoutine(r: RoutineLike, ctx: DetailCtx): DetailModel {
  const { t } = ctx
  const labels = (r.cards ?? [])
    .map((c) => (c && typeof c === 'object' && 'label' in c ? (c as { label?: string }).label : undefined))
    .filter((l): l is string => !!l)
  return {
    kind: 'routine',
    title: r.name,
    icon: CATS.routine.icon,
    accent: r.color ?? CATS.routine.color,
    who: r.memberName
      ? { name: r.memberName, colour: r.color ?? null, avatarKind: r.avatarPhoto ? 'photo' : null, avatarRef: r.avatarPhoto ?? null }
      : null,
    blocks: labels.length ? [{ kind: 'list', label: t.detail.steps, items: labels }] : [],
    actions: [{ key: 'open', label: t.detail.openRoutine, icon: 'caret-right-bold', primary: true, href: `/routine/${r.id}` }],
  }
}
