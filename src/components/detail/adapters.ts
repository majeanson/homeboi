// Per-kind builders: an entity (a board row, a kitchen meal, a recipe…) → a
// normalized DetailModel (lib/detail) the shared EntityDetailSheet can render.
// Pure functions — no hooks — so a caller that already holds the data (Board,
// Kitchen, RecipesTab) just calls the matching builder and hands the result to
// useEntityDetail().open(). Colours/icons reuse the one source (lib/cats), dates
// the shared formatters (lib/format), images imgUrl()/recipeImg().
import { CATS } from '../../lib/cats'
import { imgUrl } from '../../lib/image'
import { type Contact, type Person, daysUntilBirthday, ageOnNextBirthday, formatBirthday, formatAddress, mapsUrl, fullName } from '../../lib/cercle'
import { formatDay, formatTime } from '../../lib/format'
import { localDayStart } from '../../lib/localDay'
import { recipeImg, recipeTotalMin, type Recipe } from '../../lib/recipes'
import { SLOT_ICON_NAME, isMealSlot } from '../../lib/mealSlots'
import type { Lang } from '../../i18n'
import type { IconName } from '../Icon'
import { nameOf, colorOf, type Dict, type Member, type EventRow, type ChoreInstance } from '../board/types'
import type { DetailAction, DetailBlock, DetailModel, DetailWho } from '../../lib/detail'

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
export function buildLeftover(
  l: { id: string; title: string },
  ctx: DetailCtx,
  opts?: { onDone?: () => void; onPlanTonight?: () => void },
): DetailModel {
  const { t } = ctx
  const actions: DetailAction[] = []
  // "Planifier ce soir" as the primary CTA when available — more useful than
  // just dismissing it as eaten; eaten stays as a secondary.
  if (opts?.onPlanTonight)
    actions.push({ key: 'plantonight', label: t.detail.planTonight, icon: 'calendar-blank-bold', primary: true, run: opts.onPlanTonight })
  if (opts?.onDone)
    actions.push({ key: 'eaten', label: t.detail.markEaten, icon: 'check-bold', primary: !opts.onPlanTonight, run: opts.onDone })
  return {
    kind: 'leftover',
    title: l.title,
    icon: 'arrow-counter-clockwise-bold',
    accent: CATS.meal.color,
    whoLabel: t.kitchen.leftoversTag,
    actions,
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
// `daySec` enables "Voir la journée" (the day planner).
// `onLeftover` adds "Créer des restants" (save a leftover entry for this meal).
// `onRemove` adds a danger "Retirer du plan" (delete the meal from the plan). —
export function buildMeal(
  m: MealLike,
  ctx: DetailCtx,
  opts?: {
    recipe?: Recipe | null
    color?: string
    slotLabel?: string
    daySec?: number
    onLeftover?: () => void
    onRemove?: () => void
  },
): DetailModel {
  const { t, members } = ctx
  const slot = m.slot
  const icon: IconName = slot && isMealSlot(slot) ? SLOT_ICON_NAME[slot] : CATS.meal.icon
  const blocks: DetailBlock[] = m.is_leftover ? [{ kind: 'text', text: t.kitchen.leftoversTag }] : []
  const actions: DetailModel['actions'] = []
  if (m.recipe_id)
    actions.push({ key: 'recipe', label: t.detail.openRecipe, icon: 'book-open-bold', primary: true, href: `/kitchen/recipe/${m.recipe_id}` })
  if (opts?.daySec) actions.push({ key: 'day', label: t.detail.openDay, icon: 'calendar-blank-bold', href: `/kitchen/day/${opts.daySec}` })
  // "Créer des restants" — skip if the meal is already a replanned leftover
  if (opts?.onLeftover && !m.is_leftover)
    actions.push({ key: 'leftover', label: t.detail.makeLeftover, icon: 'arrow-counter-clockwise-bold', run: opts.onLeftover })
  if (opts?.onRemove)
    actions.push({ key: 'remove', label: t.detail.removeFromPlan, tone: 'danger', run: opts.onRemove })
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

// — A whole DAY, informative (La cuisine week grid): the day's meals as a list +
// the day note. No actions on purpose — the grid's pencil is the planner, so the
// tap-peek and the edit button stay clearly distinct (Marc's ask). The cook name
// is resolved by the caller (which holds the members), so this stays member-free. —
export function buildDay(
  ctx: DetailCtx,
  opts: { label: string; accent?: string; meals: { slot: string; title: string; cook?: string | null }[]; note?: string | null },
): DetailModel {
  const { t } = ctx
  const blocks: DetailBlock[] = []
  if (opts.meals.length)
    blocks.push({
      kind: 'list',
      label: t.board.meals,
      items: opts.meals.map((m) => `${m.slot} · ${m.title}${m.cook ? ` (${m.cook})` : ''}`),
    })
  else blocks.push({ kind: 'text', text: t.detail.dayEmpty })
  if (opts.note) blocks.push({ kind: 'text', text: opts.note, hand: true })
  return {
    kind: 'day',
    title: opts.label,
    icon: 'calendar-blank-bold',
    accent: opts.accent ?? CATS.meal.color,
    blocks,
  }
}

// — A recipe from the book.
// `onShop` adds "Ajouter à la liste" — pushes all ingredients to the grocery list. —
export function buildRecipe(r: Recipe, ctx: DetailCtx, opts?: { onShop?: () => void }): DetailModel {
  const { t } = ctx
  const total = recipeTotalMin(r)
  const blocks: DetailBlock[] = []
  if (r.tags?.length) blocks.push({ kind: 'chips', chips: r.tags })
  const ing = preview(r.ingredients, 6)
  if (ing.length) blocks.push({ kind: 'list', label: t.detail.ingredients, items: ing })
  const actions: DetailAction[] = [
    { key: 'open', label: t.detail.openRecipe, icon: 'book-open-bold', primary: true, href: `/kitchen/recipe/${r.id}` },
    { key: 'cook', label: t.kitchen.cook, icon: 'cooking-pot-bold', href: `/kitchen/recipe/${r.id}/cook` },
  ]
  if (opts?.onShop)
    actions.push({ key: 'shop', label: t.detail.shopRecipe, icon: 'shopping-bag-bold', run: opts.onShop })
  return {
    kind: 'recipe',
    title: r.title,
    icon: 'book-open-bold',
    accent: CATS.meal.color,
    photo: recipeImg(r.image),
    whoLabel: total ? `${total} min` : undefined,
    loveRecipeId: r.id,
    blocks,
    actions,
  }
}

// — A person in « Le cercle ». Informative peek: the face, the birthday (with a
// calm countdown), notes, tags, and the relationship lines the caller resolved
// ("Grand-maman de Léa"). Call / Write are `run` actions (tel:/mailto: can't ride
// the router href, which the sheet feeds to navigate()); "Modifier" opens the
// editor the caller owns. —
export function buildContact(
  c: Contact,
  ctx: DetailCtx,
  opts?: { accent?: string; relations?: string[]; groups?: string[]; onEdit?: () => void },
): DetailModel {
  const { t, lang } = ctx
  const accent = opts?.accent ?? '#C45E86'
  const days = daysUntilBirthday(c.birthday)
  const age = ageOnNextBirthday(c.birthday)
  const bday = formatBirthday(c.birthday, lang)
  // "12 mars · aujourd'hui · 5 ans" — only the parts we actually know.
  const when = bday
    ? [bday, days != null ? t.cercle.inDaysN(days) : null, age != null ? t.cercle.turnsN(age) : null]
        .filter(Boolean)
        .join(' · ')
    : undefined

  const addr = formatAddress(c.address)
  const maps = mapsUrl(c.address)

  const blocks: DetailBlock[] = []
  if (c.notes?.trim()) blocks.push({ kind: 'text', text: c.notes.trim() })
  if (addr) blocks.push({ kind: 'text', text: addr })
  if (opts?.relations?.length) blocks.push({ kind: 'list', label: t.cercle.relationships, items: opts.relations })
  if (opts?.groups?.length) blocks.push({ kind: 'chips', label: t.cercle.groups, chips: opts.groups })
  if (c.gender) blocks.push({ kind: 'chips', label: t.cercle.gender, chips: [t.cercle.genderWord[c.gender]] })
  if (c.tags.length) blocks.push({ kind: 'chips', chips: c.tags })

  const actions: DetailAction[] = []
  if (c.phone) actions.push({ key: 'call', label: t.cercle.call, icon: 'phone-bold', run: () => { window.location.href = `tel:${c.phone}` } })
  if (c.email) actions.push({ key: 'mail', label: t.cercle.write, icon: 'envelope-bold', run: () => { window.location.href = `mailto:${c.email}` } })
  // External Maps link — open in a new tab (the sheet feeds href to the SPA router,
  // which can't navigate an absolute URL, so route it through run/window.open).
  if (maps) actions.push({ key: 'nav', label: t.cercle.navigate, icon: 'map-pin-bold', run: () => { window.open(maps, '_blank', 'noopener') } })
  if (opts?.onEdit) actions.push({ key: 'edit', label: t.cercle.editPerson, icon: 'pencil-simple-bold', primary: true, run: opts.onEdit })

  return {
    kind: 'contact',
    title: fullName(c),
    icon: 'user-bold',
    accent,
    photo: c.photoKey ? imgUrl(c.photoKey) : null,
    when,
    whoLabel: c.nickname && c.nickname !== c.firstName ? c.nickname : undefined,
    blocks,
    actions,
  }
}

// — A household MEMBER shown as a person in « Le cercle ». Lighter than a contact
// (members carry no email/phone/birthday here); their own face + the relationship
// lines. Editing a member stays in Réglages ▸ Membres, so the action deep-links there. —
export function buildMemberPerson(p: Person, ctx: DetailCtx, opts?: { relations?: string[] }): DetailModel {
  const { t } = ctx
  const accent = p.colour ?? '#C45E86'
  const blocks: DetailBlock[] = []
  if (opts?.relations?.length) blocks.push({ kind: 'list', label: t.cercle.relationships, items: opts.relations })
  return {
    kind: 'contact',
    title: p.name,
    icon: 'users-three-bold',
    accent,
    photo: p.avatarKind === 'photo' && p.avatarRef ? imgUrl(p.avatarRef) : null,
    whoLabel: p.isChild ? t.audience.kid : undefined,
    blocks,
    actions: [{ key: 'edit', label: t.cercle.editPerson, icon: 'pencil-simple-bold', href: '/settings?tab=household' }],
  }
}

// A routine as the /routines list carries it (id, name, child, colour). The caller
// passes the resolved time-of-day label + each step's emoji AND its R2 photo key
// (feature #17 C) so the peek can show the real card pictures, not just the emojis.
interface RoutineLike {
  id: string
  name: string
  memberName?: string | null
  color?: string | null
  avatarPhoto?: string | null
}

// — A kid routine — informative: the child, the moment of day, the step count, and
// the step pictos themselves. A card with a parent-set PHOTO shows the photo (the
// same photo-wins rule the Routines grid + toddler run follow); otherwise its emoji.
// So the peek shows exactly what the routine IS. "Modifier la routine" opens the
// builder. —
export function buildRoutine(
  r: RoutineLike,
  ctx: DetailCtx,
  opts?: { todLabel?: string | null; steps?: { emoji?: string; photoKey?: string }[] },
): DetailModel {
  const { t } = ctx
  // Keep a step only when it has something to show (a photo or an emoji), then
  // resolve each photo key to a real src — empty keys ('') fall back to the emoji.
  const items = (opts?.steps ?? [])
    .map((s) => ({ emoji: s.emoji || undefined, photo: s.photoKey ? imgUrl(s.photoKey) : undefined }))
    .filter((s) => s.photo || s.emoji)
  const sub = [opts?.todLabel, items.length ? t.routines.stepsN(items.length) : null].filter(Boolean).join(' · ')
  return {
    kind: 'routine',
    title: r.name,
    icon: CATS.routine.icon,
    accent: r.color ?? CATS.routine.color,
    whoLabel: sub || undefined,
    who: r.memberName
      ? { name: r.memberName, colour: r.color ?? null, avatarKind: r.avatarPhoto ? 'photo' : null, avatarRef: r.avatarPhoto ?? null }
      : null,
    blocks: items.length ? [{ kind: 'pictos', label: t.detail.steps, items }] : [],
    actions: [{ key: 'open', label: t.detail.editRoutine, icon: 'pencil-simple-bold', primary: true, href: `/routine/${r.id}` }],
  }
}
