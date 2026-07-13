// Per-kind builders: an entity (a board row, a kitchen meal, a recipe…) → a
// normalized DetailModel (lib/detail) the shared EntityDetailSheet can render.
// Pure functions — no hooks — so a caller that already holds the data (Board,
// Kitchen, RecipesTab) just calls the matching builder and hands the result to
// useEntityDetail().open(). Colours/icons reuse the one source (lib/cats), dates
// the shared formatters (lib/format), images imgUrl()/recipeImg().
import { CATS } from '../../lib/cats'
import { colourFor } from '../../lib/things'
import { imgUrl } from '../../lib/image'
import { type Contact, type Person, type Pet, daysUntilBirthday, ageOnNextBirthday, formatBirthday, formatAddress, mapsUrl, parseContactAddress, fullName } from '../../lib/cercle'
import { type Business, BUSINESS_COLOUR } from '../../lib/businesses'
import { KIND_EMOJI, type CarnetKind } from '../../lib/carnets'
import { formatDay, formatDayMaybeYear, formatDayTime, formatTime } from '../../lib/format'
import { localDayStart } from '../../lib/localDay'
import { type Recipe } from '../../lib/recipes'
import { type Mot } from '../../lib/mots'
import { type NextRdv } from '../../lib/nextRdv'
import { SLOT_ICON_NAME, isMealSlot } from '../../lib/mealSlots'
import type { Lang } from '../../i18n'
import type { IconName } from '../Icon'
import { nameOf, colorOf, type Dict, type Member, type EventRow, type ChoreInstance } from '../board/types'
import { eventMembers } from '../../lib/eventPeople'
import type { DetailAction, DetailBlock, DetailModel, DetailWho } from '../../lib/detail'

// What every builder needs to resolve names/faces + locale + copy. `recipeFor`
// (optional) resolves a planned meal → its saved recipe; pages set it from
// useRecipeForMeal(). It's what useOpenMeal consults to decide whether a tapped
// meal has a recipe VIEW to jump to, or only a peek to show.
export interface DetailCtx {
  t: Dict
  lang: Lang
  members: Member[]
  recipeFor?: (m: { recipe_id?: string | null; title: string }) => Recipe | undefined
}

// A face for the header, drawn by the shared <Avatar>. Null when no member.
function whoOf(members: Member[], id: string | null, role?: string): DetailWho | null {
  const m = members.find((x) => x.id === id)
  if (!m) return null
  return { role, name: m.display_name, colour: m.colour, avatarKind: m.avatar_kind ?? null, avatarRef: m.avatar_ref ?? null }
}

// — Agenda event —
export function buildEvent(
  e: EventRow,
  ctx: DetailCtx,
  opts?: { onShare?: () => void; onEdit?: () => void; onDelete?: () => void },
): DetailModel {
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
  // « Itinéraire » — when the « Avec » (business or contact) has an address, the
  // peek offers turn-by-turn directions in one tap: the business address is a plain
  // string, the contact one the ContactAddress JSON (both joined server-side, like
  // contact_name). Same DIRECTIONS deep-link mapsUrl builds for a contact card.
  const bizAddr = e.business_address?.trim()
  const mapsHref = bizAddr
    ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(bizAddr)}`
    : mapsUrl(parseContactAddress(e.contact_address))
  // « Qui » — the household people this concerns (passengers, or the legacy single
  // member_id). One face → the single `who` chip; several → a `whoStack` the sheet
  // draws as a face pile. The external « Avec » (business/contact) name stays the
  // fallback face when no member is set (a pure vet appointment).
  const people = eventMembers(e)
  const whoStack = people.map((id) => whoOf(members, id)).filter((w): w is DetailWho => !!w)
  const who: DetailWho | null =
    whoStack[0] ?? (whoName ? { name: whoName, colour: bizColour ?? CATS.event.color } : null)
  return {
    kind: 'event',
    title: e.title,
    icon: CATS.event.icon,
    // Spine = the business colour, else the first person's, else the event default.
    accent: bizColour ?? whoStack[0]?.colour ?? CATS.event.color,
    when: e.all_day ? t.board.allDay : `${formatDay(e.start_at, lang)} · ${formatTime(e.start_at, lang)}`,
    who,
    whoStack: whoStack.length > 1 ? whoStack : undefined,
    // Basic peek actions: see the day, Modify (the primary — opens the event form),
    // Share, Delete (danger). Modify/Delete/Share are opt-gated at the call site so a
    // guest/toddler peek stays read-only. Exactly one primary (edit when present).
    actions: [
      { key: 'day', label: t.detail.openDay, icon: 'calendar-blank-bold', href: `/kitchen/day/${day}` },
      // « Itinéraire » — turn-by-turn to the rendez-vous, one tap before the door.
      // Read-only navigation, so it stays for guests/kiosks (no opt gate needed).
      ...(mapsHref
        ? [{ key: 'nav', label: t.cercle.navigate, icon: 'map-pin-bold' as const, run: () => { window.open(mapsHref, '_blank', 'noopener') } }]
        : []),
      ...(opts?.onEdit
        ? [{ key: 'edit', label: t.common.edit, icon: 'pencil-simple-bold' as const, primary: true, run: opts.onEdit }]
        : []),
      // « Partager » — a public link with just the title + when + who-label (no member ids leak).
      ...(opts?.onShare ? [{ key: 'share', label: t.shareLink.action, icon: 'arrow-up-right-bold' as const, run: opts.onShare }] : []),
      ...(opts?.onDelete
        ? [{ key: 'delete', label: t.common.delete, icon: 'trash-bold' as const, tone: 'danger' as const, run: opts.onDelete }]
        : []),
    ],
  }
}

// « Prochain rendez-vous » glance → a labelled one-line list block. All-day events
// drop the time; a timed one shows « <date> · <heure> — <titre> ».
function rdvBlock(label: string, r: NextRdv, lang: Lang): DetailBlock {
  const when = r.allDay ? formatDayMaybeYear(r.at, lang) : `${formatDayMaybeYear(r.at, lang)} · ${formatTime(r.at, lang)}`
  return { kind: 'list', label, items: [`${when} — ${r.title}`] }
}

// — A « Le cercle » Business (vet, plumber, hospital…) — a standalone service card.
// NOT a person: no relationships/birthday/family. Just quick reach + notes + edit.
export function buildBusiness(
  b: Business,
  ctx: DetailCtx,
  opts?: { onEdit?: () => void; onDelete?: () => void; onSchedule?: () => void; nextRdv?: NextRdv | null },
): DetailModel {
  const { t, lang } = ctx
  const bz = t.cercle.business
  const accent = b.colour ?? BUSINESS_COLOUR
  const mapsHref = b.address?.trim()
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(b.address.trim())}`
    : null

  const blocks: DetailBlock[] = []
  // « Prochain rendez-vous » — a read-only glance up top when an upcoming event is
  // linked to this vendor (computed by the caller via lib/nextRdv).
  if (opts?.nextRdv) blocks.push(rdvBlock(t.cercle.nextRdv, opts.nextRdv, lang))
  if (b.category?.trim()) blocks.push({ kind: 'chips', chips: [b.category.trim()] })
  if (b.notes?.trim()) blocks.push({ kind: 'text', text: b.notes.trim() })
  if (b.address?.trim()) blocks.push({ kind: 'text', text: b.address.trim() })
  if (b.website?.trim()) blocks.push({ kind: 'text', text: b.website.trim() })
  // Backlink: the « carnets » this vendor has serviced (from care_log), each chip an
  // emoji + name. Read-only glance — tap-through stays on the carnet scene.
  if (b.servicedCarnets?.length)
    blocks.push({ kind: 'chips', label: bz.servicedCarnets, chips: b.servicedCarnets.map((cn) => `${KIND_EMOJI[cn.kind as CarnetKind] ?? '📦'} ${cn.name}`) })

  const actions: DetailAction[] = []
  if (b.phone) actions.push({ key: 'call', label: t.cercle.call, icon: 'phone-bold', run: () => { window.location.href = `tel:${b.phone}` } })
  if (b.email) actions.push({ key: 'mail', label: t.cercle.write, icon: 'envelope-bold', run: () => { window.location.href = `mailto:${b.email}` } })
  if (mapsHref) actions.push({ key: 'nav', label: t.cercle.navigate, icon: 'map-pin-bold', run: () => { window.open(mapsHref, '_blank', 'noopener') } })
  if (b.website?.trim()) {
    const url = /^https?:\/\//.test(b.website.trim()) ? b.website.trim() : `https://${b.website.trim()}`
    actions.push({ key: 'web', label: bz.website, icon: 'arrow-up-right-bold', run: () => { window.open(url, '_blank', 'noopener') } })
  }
  // « Planifier un rendez-vous » — a rendez-vous with this vendor (vet, plumber…),
  // opening the shared EventForm pre-seeded with this business as the "Avec".
  if (opts?.onSchedule) actions.push({ key: 'rdv', label: t.cercle.scheduleRdv, icon: 'calendar-blank-bold', run: opts.onSchedule })
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
    onSchedule?: () => void // a vet visit — the caller seeds the pet's vet Business
  },
): DetailModel {
  const { t, lang } = ctx
  const p = t.cercle.pet
  const accent = colourFor('pet', pet.colour)
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
  // « Rendez-vous chez le vétérinaire » — seeds the pet's vet Business into the event
  // form (only offered when the pet has a vet on file, so there IS a counterpart).
  if (opts?.onSchedule) actions.push({ key: 'rdv', label: p.vetRdv, icon: 'calendar-blank-bold', run: opts.onSchedule })
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

// — « Laisse un mot » — a member-to-member message: the sender's face, who it's for, and
// the body (a typed line, a played voice clip, or a tapped-to-zoom drawing/photo). Keep
// («  Garder ») + Supprimer are `run` actions the caller (MotsCard) owns — opening the peek
// is also where the recipient's opened_at gets stamped (at the call site, not here). —
export function buildMot(
  m: Mot,
  ctx: DetailCtx,
  opts?: {
    saved?: boolean
    parentQuote?: string | null
    onToggleSave?: () => void
    onDelete?: () => void
    onReply?: () => void
    // Sender-outbox extras: reschedule a « Plus tard » that hasn't landed, and show its
    // programmed time as the « when » line instead of the created date.
    onReschedule?: () => void
    whenOverride?: string
  },
): DetailModel {
  const { t, lang, members } = ctx
  const fn = t.mots
  const icon: IconName =
    m.media_kind === 'audio' ? 'microphone-bold' : m.media_kind === 'drawing' ? 'paint-brush-bold' : m.media_kind === 'image' ? 'image-square-bold' : 'envelope-bold'
  const firstLine = m.text.split('\n').find((l) => l.trim())?.trim()
  const mediaLabel = m.media_kind === 'audio' ? fn.memo : m.media_kind === 'drawing' ? fn.drawing : m.media_kind === 'image' ? fn.photo : ''
  const blocks: DetailBlock[] = []
  // A reply quotes the mot it answers, up top, so the thread reads in context.
  if (opts?.parentQuote?.trim()) blocks.push({ kind: 'text', text: `↩ ${opts.parentQuote.trim()}`, hand: true })
  if (m.text.trim()) blocks.push({ kind: 'text', text: m.text.trim() })
  if (m.media_key && (m.media_kind === 'drawing' || m.media_kind === 'image')) blocks.push({ kind: 'image', src: imgUrl(m.media_key) })
  if (m.media_key && m.media_kind === 'audio') blocks.push({ kind: 'audio', src: imgUrl(m.media_key) })

  const actions: DetailAction[] = []
  // Reply leads (the warm action); reschedule (sender only) then keep + delete follow.
  if (opts?.onReply) actions.push({ key: 'reply', label: fn.reply, icon: 'arrow-left-bold', primary: true, run: opts.onReply })
  if (opts?.onReschedule)
    actions.push({ key: 'reschedule', label: fn.reschedule, icon: 'clock-bold', run: opts.onReschedule })
  if (opts?.onToggleSave)
    actions.push({ key: 'keep', label: opts.saved ? fn.kept : fn.keep, icon: 'push-pin-bold', run: opts.onToggleSave })
  if (opts?.onDelete) actions.push({ key: 'delete', label: fn.delete, icon: 'trash-bold', tone: 'danger', run: opts.onDelete })

  return {
    kind: 'mot',
    title: firstLine || mediaLabel || fn.untitled,
    icon,
    accent: colorOf(members, m.author_member_id) ?? CATS.cercle.color,
    when: opts?.whenOverride ?? `${formatDayTime(m.created_at, lang)} · ${m.member_id === null ? fn.forMaisonnee : fn.forYou}`,
    who: whoOf(members, m.author_member_id, fn.from),
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
export interface MealLike {
  id: string
  title: string
  slot?: string
  cook_member_id?: string | null
  recipe_id?: string | null
  is_leftover?: number
}

export interface MealOpts {
  color?: string
  slotLabel?: string
  daySec?: number
  onLeftover?: () => void
  onRemove?: () => void
}

// — A planned meal that has NO recipe behind it (a typed "Spaghettis", a leftover).
// A meal that DOES resolve a recipe never reaches this builder: useOpenMeal sends the
// tap straight to /kitchen/recipe/:id, where the photo, the tags, the ingredients, the
// hearts and « Cuisiner » all already live. So this peek is what's left when there's
// nowhere to jump — the plan-editing actions on a bare title.
// `color` is the slot colour (useMealPrefs); `daySec` enables "Voir la journée" (the
// day planner); `onLeftover` adds "Créer des restants"; `onRemove` the danger
// "Retirer du plan". —
export function buildMeal(m: MealLike, ctx: DetailCtx, opts?: MealOpts): DetailModel {
  const { t, members } = ctx
  const slot = m.slot
  const icon: IconName = slot && isMealSlot(slot) ? SLOT_ICON_NAME[slot] : CATS.meal.icon
  const blocks: DetailBlock[] = m.is_leftover ? [{ kind: 'text', text: t.kitchen.leftoversTag }] : []
  const actions: DetailModel['actions'] = []
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
    accent: opts?.color ?? CATS.meal.color,
    whoLabel: opts?.slotLabel,
    who: whoOf(members, m.cook_member_id ?? null, t.detail.cook),
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

// NOTE — the "tap the thing, get the thing" rule. A peek that is really just a MENU
// of "go to page X" is an inter-tap, and we delete it rather than ship it:
//   · `buildRecipe` (the recipe-card browse peek) → tapping a recipe opens
//     /kitchen/recipe/:id, where Cuisiner / Ajouter à la liste / Partager live.
//   · `buildRoutine` (the routine-card peek) → tapping a routine card runs it
//     (/routine/:id/run); the card itself already carries one-tap ✎ and ▶, and
//     « Partager » moved onto the routine's own scene (/routine/:id).
//   · a recipe-linked MEAL → useOpenMeal navigates to the recipe view too.
//   · a HABIT (« Mes habitudes ») → the board `HabitudesCard` is ONE `<BoardCard
//     to="/board/habitudes">`; tapping it opens « Le point du jour » (HabitudesPage),
//     where check-in (HabitRow), history (HabitHistory) and edit already live. The
//     individual habit rows aren't independently tappable, so there's no per-habit peek
//     to build — a sheet would be a redundant menu in front of the page. (PARITY F6×D2 ➖.)
// What's left below are peeks that are CONTENT, not menus: an event, a chore, a mot
// (it plays the voice clip), a day, a contact — none of them has a page to jump to,
// so the sheet IS the destination.

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
  opts?: { accent?: string; relations?: string[]; groups?: string[]; groupToggle?: GroupToggle; onEdit?: () => void; onExport?: () => void; onConnect?: () => void; onSchedule?: () => void; nextRdv?: NextRdv | null; buildFamilyHref?: string },
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
  // « Prochain rendez-vous » — a read-only glance when an upcoming event is linked
  // to this person (computed by the caller via lib/nextRdv).
  if (opts?.nextRdv) blocks.push(rdvBlock(t.cercle.nextRdv, opts.nextRdv, lang))
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
  // « Planifier un rendez-vous » — a rendez-vous with this person, opening the
  // shared EventForm pre-seeded with them as the "Avec".
  if (opts?.onSchedule) actions.push({ key: 'rdv', label: t.cercle.scheduleRdv, icon: 'calendar-blank-bold', run: opts.onSchedule })
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
  opts?: { relations?: string[]; groupToggle?: GroupToggle; onDetail?: () => void; onConnect?: () => void; onSchedule?: () => void; buildFamilyHref?: string },
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
  // « Planifier un rendez-vous » — an appointment concerning this member, opening
  // the shared EventForm with them pre-selected.
  if (opts?.onSchedule) actions.push({ key: 'rdv', label: t.cercle.scheduleRdv, icon: 'calendar-blank-bold', run: opts.onSchedule })
  actions.push({ key: 'edit', label: t.cercle.editPerson, icon: 'pencil-simple-bold', href: '/settings?tab=cercle&sub=members' })
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

