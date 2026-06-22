// Per-kind builders: an entity (a board row, a kitchen meal, a recipe…) → a
// normalized DetailModel (lib/detail) the shared EntityDetailSheet can render.
// Pure functions — no hooks — so a caller that already holds the data (Board,
// Kitchen, RecipesTab) just calls the matching builder and hands the result to
// useEntityDetail().open(). Colours/icons reuse the one source (lib/cats), dates
// the shared formatters (lib/format), images imgUrl()/recipeImg().
import { CATS } from '../../lib/cats'
import { imgUrl } from '../../lib/image'
import { type Contact, type Person, type Pet, daysUntilBirthday, ageOnNextBirthday, formatBirthday, formatAddress, mapsUrl, fullName } from '../../lib/cercle'
import { type Business, BUSINESS_COLOUR } from '../../lib/businesses'
import { formatDay, formatDayMaybeYear, formatTime } from '../../lib/format'
import { localDayStart } from '../../lib/localDay'
import { recipeImg, recipeTotalMin, tagColor, type Recipe } from '../../lib/recipes'
import { SLOT_ICON_NAME, isMealSlot } from '../../lib/mealSlots'
import type { Lang } from '../../i18n'
import type { IconName } from '../Icon'
import { nameOf, colorOf, type Dict, type Member, type EventRow, type ChoreInstance } from '../board/types'
import type { DetailAction, DetailBlock, DetailModel, DetailWho } from '../../lib/detail'

// What every builder needs to resolve names/faces + locale + copy. `recipeFor`
// (optional) lets buildMeal light up a planned meal's recipe — photo + ingredient
// glance — without each callsite threading the recipe; pages set it from
// useRecipeForMeal(). Absent → a meal peek still works, just without the photo.
export interface DetailCtx {
  t: Dict
  lang: Lang
  members: Member[]
  recipeFor?: (m: { recipe_id?: string | null; title: string }) => Recipe | undefined
  // Per-tag household colours (migration 0037, keyed lowercase tag → "#rrggbb"),
  // from the RECIPE_TAGS_KEY query. Lets the recipe/meal peek tint its tag chips
  // the SAME colour the recipe book + RecipeSheet use. Absent → plain chips.
  tagColors?: Record<string, string>
}

// A recipe's tags → a chips block tinted with the household tag colours, matching
// RecipeSheet/RecipesTab. Kept in the recipe's stored order (the order the cook
// typed them) — same as RecipeSheet shows a single recipe's own tags.
function tagChips(tags: string[], ctx: DetailCtx): DetailBlock {
  return { kind: 'chips', chips: tags, tones: tags.map((tg) => tagColor(ctx.tagColors, tg)) }
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
  // A DERIVED birthday (not a stored event): a cake peek that routes to the person
  // in Le cercle rather than an event editor (it can't be edited here — the date
  // lives on the person). Age shown when known.
  if (e.birthday) {
    // #20: their gift ideas surface right here as the birthday nears — a quiet
    // reminder of what you'd thought of, exactly when it's useful.
    const gifts = e.gift_ideas?.trim()
    return {
      kind: 'contact',
      title: e.title,
      icon: CATS.birthday.icon,
      accent: colorOf(members, e.member_id) ?? CATS.birthday.color,
      when: `${formatDay(e.start_at, lang)} · ${t.board.birthday}`,
      whoLabel: e.age != null ? t.cercle.turnsN(e.age) : undefined,
      who: whoOf(members, e.member_id),
      blocks: gifts ? [{ kind: 'text', text: `🎁 ${t.cercle.giftIdeas} : ${gifts}` }] : undefined,
      actions: [{ key: 'cercle', label: t.nav.cercle, icon: 'users-three-bold', primary: true, href: '/cercle' }],
    }
  }
  // The "who" of a rendez-vous: a member face if assigned, else the linked « Le
  // cercle » person OR Business name (joined server-side as contact_name /
  // business_name) — so a vet/plumber/grand-maman appointment shows who it's with,
  // not just a member face. A non-member "who" has no avatar; show the name on the
  // accent disc.
  const whoName = e.business_name ?? e.contact_name ?? null
  // A business rendez-vous carries the business's own colour (joined server-side);
  // it tints both the accent and the non-member "who" disc.
  const bizColour = e.business_id ? e.business_colour ?? CATS.event.color : null
  const who: DetailWho | null =
    whoOf(members, e.member_id) ?? (whoName ? { name: whoName, colour: bizColour ?? CATS.event.color } : null)
  return {
    kind: 'event',
    title: e.title,
    icon: CATS.event.icon,
    accent: bizColour ?? colorOf(members, e.member_id) ?? CATS.event.color,
    when: e.all_day ? t.board.allDay : `${formatDay(e.start_at, lang)} · ${formatTime(e.start_at, lang)}`,
    who,
    actions: [{ key: 'day', label: t.detail.openDay, icon: 'calendar-blank-bold', href: `/kitchen/day/${day}` }],
  }
}

// — A « Le cercle » Business (vet, plumber, hospital…) — a standalone service card.
// NOT a person: no relationships/birthday/family. Just quick reach + notes + edit.
export function buildBusiness(
  b: Business,
  ctx: DetailCtx,
  opts?: { onEdit?: () => void; onDelete?: () => void },
): DetailModel {
  const { t } = ctx
  const bz = t.cercle.business
  const accent = b.colour ?? BUSINESS_COLOUR
  const mapsHref = b.address?.trim()
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(b.address.trim())}`
    : null

  const blocks: DetailBlock[] = []
  if (b.category?.trim()) blocks.push({ kind: 'chips', chips: [b.category.trim()] })
  if (b.notes?.trim()) blocks.push({ kind: 'text', text: b.notes.trim() })
  if (b.address?.trim()) blocks.push({ kind: 'text', text: b.address.trim() })
  if (b.website?.trim()) blocks.push({ kind: 'text', text: b.website.trim() })

  const actions: DetailAction[] = []
  if (b.phone) actions.push({ key: 'call', label: t.cercle.call, icon: 'phone-bold', run: () => { window.location.href = `tel:${b.phone}` } })
  if (b.email) actions.push({ key: 'mail', label: t.cercle.write, icon: 'envelope-bold', run: () => { window.location.href = `mailto:${b.email}` } })
  if (mapsHref) actions.push({ key: 'nav', label: t.cercle.navigate, icon: 'map-pin-bold', run: () => { window.open(mapsHref, '_blank', 'noopener') } })
  if (b.website?.trim()) {
    const url = /^https?:\/\//.test(b.website.trim()) ? b.website.trim() : `https://${b.website.trim()}`
    actions.push({ key: 'web', label: bz.website, icon: 'arrow-up-right-bold', run: () => { window.open(url, '_blank', 'noopener') } })
  }
  if (opts?.onDelete) actions.push({ key: 'delete', label: bz.delete, icon: 'trash-bold', run: opts.onDelete })
  if (opts?.onEdit) actions.push({ key: 'edit', label: bz.edit, icon: 'pencil-simple-bold', primary: true, run: opts.onEdit })

  return {
    kind: 'contact',
    title: b.name,
    icon: 'storefront-bold',
    accent,
    photo: b.photoKey ? imgUrl(b.photoKey) : null,
    blocks,
    actions,
  }
}

// — A « Le cercle » Pet (PersonKind 'pet') — an animal as a card, with its care
// fields (species/breed, birthday, microchip, feeding, sitter notes, latest weight,
// vet) + the same family group toggle + relations as a person. `vetName` is resolved
// by the caller (the vet is a Business). Edit reopens the PetForm.
export function buildPet(
  pet: Pet,
  ctx: DetailCtx,
  opts?: {
    relations?: string[]
    groupToggle?: GroupToggle
    vetName?: string | null
    onEdit?: () => void
    onDelete?: () => void
    buildFamilyHref?: string
    onConnect?: () => void
  },
): DetailModel {
  const { t, lang } = ctx
  const p = t.cercle.pet
  const accent = pet.colour ?? '#C7873F'
  const bday = formatBirthday(pet.birthday, lang)
  const days = daysUntilBirthday(pet.birthday)
  const when = bday ? [bday, days != null ? t.cercle.inDaysN(days) : null].filter(Boolean).join(' · ') : undefined

  const speciesChips = [pet.species?.trim(), pet.breed?.trim()].filter((s): s is string => !!s)
  const care: string[] = []
  if (pet.feeding?.trim()) care.push(`${p.feeding} : ${pet.feeding.trim()}`)
  if (pet.microchip?.trim()) care.push(`${p.microchip} : ${pet.microchip.trim()}`)
  if (opts?.vetName) care.push(`${p.vet} : ${opts.vetName}`)
  const lastWeight = pet.weights.length ? pet.weights[pet.weights.length - 1] : null
  if (lastWeight) care.push(`${p.weight} : ${lastWeight.kg} ${p.kg} (${lastWeight.date})`)

  const blocks: DetailBlock[] = []
  if (speciesChips.length) blocks.push({ kind: 'chips', chips: speciesChips })
  if (pet.notes?.trim()) blocks.push({ kind: 'text', text: pet.notes.trim() })
  if (pet.sitterNotes?.trim()) blocks.push({ kind: 'text', text: `${p.sitterNotes} : ${pet.sitterNotes.trim()}` })
  if (care.length) blocks.push({ kind: 'list', label: p.title, items: care })
  if (opts?.relations?.length) blocks.push({ kind: 'list', label: t.cercle.relationships, items: opts.relations })
  if (opts?.groupToggle?.options.length)
    blocks.push({ kind: 'togglechips', label: t.cercle.groups, options: opts.groupToggle.options, onToggle: opts.groupToggle.onToggle })

  const actions: DetailAction[] = []
  if (opts?.buildFamilyHref) actions.push({ key: 'family', label: t.cercle.familyFromPerson, icon: 'tree-bold', href: opts.buildFamilyHref })
  if (opts?.onConnect) actions.push({ key: 'connect', label: t.cercle.connectFromPerson, icon: 'users-three-bold', run: opts.onConnect })
  if (opts?.onDelete) actions.push({ key: 'delete', label: p.delete, icon: 'trash-bold', run: opts.onDelete })
  if (opts?.onEdit) actions.push({ key: 'edit', label: p.edit, icon: 'pencil-simple-bold', primary: true, run: opts.onEdit })

  return {
    kind: 'contact',
    title: pet.name,
    icon: 'smiley-bold',
    accent,
    photo: pet.photoKey ? imgUrl(pet.photoKey) : null,
    when,
    blocks,
    actions,
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
    when: opts?.upcoming ? formatDayMaybeYear(c.at, lang) : undefined,
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
  // Resolve the linked recipe: an explicit one wins, else the ctx resolver
  // (useRecipeForMeal) maps the meal → its saved recipe by link/title. With it the
  // peek shows the food's real photo + a quick-glance of the ingredients.
  const recipe = opts?.recipe ?? ctx.recipeFor?.(m) ?? null
  const recipeId = recipe?.id ?? m.recipe_id ?? null
  const blocks: DetailBlock[] = m.is_leftover ? [{ kind: 'text', text: t.kitchen.leftoversTag }] : []
  // Quick glance at what the meal IS (skip for a leftover — it has no recipe to
  // preview): its tags then the first few ingredients, mirroring the recipe peek.
  if (recipe && !m.is_leftover) {
    if (recipe.tags?.length) blocks.push(tagChips(recipe.tags, ctx))
    const ing = preview(recipe.ingredients, 6)
    if (ing.length) blocks.push({ kind: 'list', label: t.detail.ingredients, items: ing })
  }
  const total = recipe ? recipeTotalMin(recipe) : 0
  // Slot label + cook time read together as the sub-line ("Souper · 35 min").
  const sub = [opts?.slotLabel, total ? `${total} min` : null].filter(Boolean).join(' · ') || undefined
  const actions: DetailModel['actions'] = []
  if (recipeId)
    actions.push({ key: 'recipe', label: t.detail.openRecipe, icon: 'book-open-bold', primary: true, href: `/kitchen/recipe/${recipeId}` })
  // "Cuisiner" — jump straight into cook mode, but only when we have the resolved
  // recipe (a bare recipe_id without the loaded row can't be cooked from here).
  if (recipe)
    actions.push({ key: 'cook', label: t.kitchen.cook, icon: 'cooking-pot-bold', href: `/kitchen/recipe/${recipe.id}/cook` })
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
    photo: recipe ? recipeImg(recipe.image) : null,
    accent: opts?.color ?? CATS.meal.color,
    whoLabel: sub,
    who: whoOf(members, m.cook_member_id ?? null, t.detail.cook),
    loveRecipeId: recipeId ?? undefined,
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
// `onShop` adds "Ajouter à la liste" — opens the "which ingredients?" picker so you
// add just the ones you're missing (not the whole list). —
export function buildRecipe(r: Recipe, ctx: DetailCtx, opts?: { onShop?: () => void; onMakeRoutine?: () => void }): DetailModel {
  const { t } = ctx
  const total = recipeTotalMin(r)
  const blocks: DetailBlock[] = []
  if (r.tags?.length) blocks.push(tagChips(r.tags, ctx))
  const ing = preview(r.ingredients, 6)
  if (ing.length) blocks.push({ kind: 'list', label: t.detail.ingredients, items: ing })
  const actions: DetailAction[] = [
    { key: 'open', label: t.detail.openRecipe, icon: 'book-open-bold', primary: true, href: `/kitchen/recipe/${r.id}` },
    { key: 'cook', label: t.kitchen.cook, icon: 'cooking-pot-bold', href: `/kitchen/recipe/${r.id}/cook` },
  ]
  if (opts?.onShop)
    actions.push({ key: 'shop', label: t.detail.shopRecipe, icon: 'shopping-bag-bold', run: opts.onShop })
  // Parent-only: turn this recipe into a toddler picture routine (#19). The Kitchen
  // gates it on the parent audience, so it never appears in the toddler recipe book.
  if (opts?.onMakeRoutine)
    actions.push({ key: 'routine', label: t.detail.makeRoutine, icon: 'baby-bold', run: opts.onMakeRoutine })
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
// `groupToggle` (when provided) makes the named-group chips TAPPABLE — add/remove
// the person from any group inline, instead of the read-only `groups` chips.
export interface GroupToggle {
  options: { id: string; label: string; on: boolean }[]
  onToggle: (groupId: string, on: boolean) => void
}

export function buildContact(
  c: Contact,
  ctx: DetailCtx,
  opts?: { accent?: string; relations?: string[]; groups?: string[]; groupToggle?: GroupToggle; onEdit?: () => void; onExport?: () => void; onConnect?: () => void; buildFamilyHref?: string },
): DetailModel {
  const { t, lang } = ctx
  const accent = opts?.accent ?? '#2A8F85'
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
  if (opts?.groupToggle?.options.length)
    blocks.push({ kind: 'togglechips', label: t.cercle.groups, options: opts.groupToggle.options, onToggle: opts.groupToggle.onToggle })
  else if (opts?.groups?.length) blocks.push({ kind: 'chips', label: t.cercle.groups, chips: opts.groups })
  if (c.gender) blocks.push({ kind: 'chips', label: t.cercle.gender, chips: [t.cercle.genderWord[c.gender]] })
  if (c.tags.length) blocks.push({ kind: 'chips', chips: c.tags })

  const actions: DetailAction[] = []
  if (c.phone) actions.push({ key: 'call', label: t.cercle.call, icon: 'phone-bold', run: () => { window.location.href = `tel:${c.phone}` } })
  if (c.email) actions.push({ key: 'mail', label: t.cercle.write, icon: 'envelope-bold', run: () => { window.location.href = `mailto:${c.email}` } })
  // External Maps link — open in a new tab (the sheet feeds href to the SPA router,
  // which can't navigate an absolute URL, so route it through run/window.open).
  if (maps) actions.push({ key: 'nav', label: t.cercle.navigate, icon: 'map-pin-bold', run: () => { window.open(maps, '_blank', 'noopener') } })
  // "Bâtir sa famille" — open the family builder seeded with this person.
  if (opts?.buildFamilyHref) actions.push({ key: 'family', label: t.cercle.familyFromPerson, icon: 'tree-bold', href: opts.buildFamilyHref })
  // "Relier à quelqu'un" — open the connector with this person as side A.
  if (opts?.onConnect) actions.push({ key: 'connect', label: t.cercle.connectFromPerson, icon: 'users-three-bold', run: opts.onConnect })
  // "Exporter (vCard)" — download a .vcf to drop this person into any phone/Mac.
  if (opts?.onExport) actions.push({ key: 'export', label: t.cercle.exportVcard, icon: 'arrow-up-right-bold', run: opts.onExport })
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

// — A household MEMBER shown as a person in « Le cercle ». Lighter than a contact:
// the lean Maisonnée identity (their own face + the relationship lines). Member
// identity (name/face/colour) is edited in Réglages ▸ Membres; the exhaustive
// person info lives on a linked « Le cercle » contact — so the primary action
// "Fiche complète" (onDetail) finds-or-creates that contact sheet. —
export function buildMemberPerson(
  p: Person,
  ctx: DetailCtx,
  opts?: { relations?: string[]; groupToggle?: GroupToggle; onDetail?: () => void; onConnect?: () => void; buildFamilyHref?: string },
): DetailModel {
  const { t } = ctx
  const accent = p.colour ?? '#2A8F85'
  const blocks: DetailBlock[] = []
  if (opts?.relations?.length) blocks.push({ kind: 'list', label: t.cercle.relationships, items: opts.relations })
  if (opts?.groupToggle?.options.length)
    blocks.push({ kind: 'togglechips', label: t.cercle.groups, options: opts.groupToggle.options, onToggle: opts.groupToggle.onToggle })
  const actions: DetailAction[] = []
  if (opts?.onDetail)
    actions.push({ key: 'detail', label: t.cercle.detailPerson, icon: 'users-three-bold', primary: true, run: opts.onDetail })
  // "Bâtir sa famille" — open the family builder seeded with this member.
  if (opts?.buildFamilyHref) actions.push({ key: 'family', label: t.cercle.familyFromPerson, icon: 'tree-bold', href: opts.buildFamilyHref })
  // "Relier à quelqu'un" — open the connector with this member as side A.
  if (opts?.onConnect) actions.push({ key: 'connect', label: t.cercle.connectFromPerson, icon: 'users-three-bold', run: opts.onConnect })
  actions.push({ key: 'edit', label: t.cercle.editPerson, icon: 'pencil-simple-bold', href: '/settings?tab=household' })
  return {
    kind: 'contact',
    title: p.name,
    icon: 'users-three-bold',
    accent,
    photo: p.avatarKind === 'photo' && p.avatarRef ? imgUrl(p.avatarRef) : null,
    whoLabel: p.isChild ? t.audience.kid : undefined,
    blocks,
    actions,
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
    // "Faire la routine" (the run player, now available on every surface) is the
    // primary action when there are steps to run; editing drops to secondary. An
    // empty shell (no steps) shows only "Modifier" — nothing to run into.
    actions: items.length
      ? [
          { key: 'run', label: t.detail.runRoutine, icon: 'play-bold', primary: true, href: `/routine/${r.id}/run` },
          { key: 'open', label: t.detail.editRoutine, icon: 'pencil-simple-bold', href: `/routine/${r.id}` },
        ]
      : [{ key: 'open', label: t.detail.editRoutine, icon: 'pencil-simple-bold', primary: true, href: `/routine/${r.id}` }],
  }
}
