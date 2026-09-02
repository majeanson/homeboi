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
import { motLabel, type Mot } from '../../lib/mots'
import { type Habit, type HabitDay, habitStatusOn, habitReading, deriveProgress } from '../../lib/habits'
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
      actions: [{ key: 'cercle', label: t.nav.cercle, icon: 'users-three-bold', primary: true, href: '/maison?section=family' }],
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
    // A rendez-vous that says « Jusqu'à » shows a real range, not just a start —
    // the same window « L'auto » uses to answer whether the car is free.
    when: e.all_day
      ? t.board.allDay
      : `${formatDay(e.start_at, lang)} · ${formatTime(e.start_at, lang)}${
          e.end_at && e.end_at > e.start_at ? `–${formatTime(e.end_at, lang)}` : ''
        }`,
    who,
    whoStack: whoStack.length > 1 ? whoStack : undefined,
    // The rendez-vous' own note (migration 0121) — « apporter la carte d'assurance
    // maladie », « 3e étage, bureau 12 ». Handwritten look: it IS a note, and the peek
    // is where you read one before walking out the door.
    blocks: e.notes?.trim() ? [{ kind: 'text', text: e.notes.trim(), hand: true }] : undefined,
    // Basic peek actions: see the day, Modify (the primary — opens the event form),
    // Share, Delete (danger). Modify/Delete/Share are opt-gated at the call site so a
    // guest/toddler peek stays read-only. Exactly one primary (edit when present).
    // The long tail (`overflow`) rides the sheet's head ⋯ so the visible row stays
    // two buttons: the day door + Modifier.
    actions: [
      { key: 'day', label: t.detail.openDay, icon: 'calendar-blank-bold', href: `/kitchen/day/${day}` },
      // « L'auto » — only when this rendez-vous actually takes the car. It is the
      // one thing the agenda side could never say: the peek showed the outing with
      // no hint the vehicle was involved and no way through to the week that
      // resolves it. Read-only navigation, so it stays for guests/kiosks.
      ...(e.car_id
        ? [{ key: 'car', label: t.auto.title, icon: 'car-bold' as const, overflow: true, href: '/voiture' }]
        : []),
      // « Itinéraire » — turn-by-turn to the rendez-vous, one tap before the door.
      // Read-only navigation, so it stays for guests/kiosks (no opt gate needed).
      ...(mapsHref
        ? [{ key: 'nav', label: t.cercle.navigate, icon: 'map-pin-bold' as const, overflow: true, run: () => { window.open(mapsHref, '_blank', 'noopener') } }]
        : []),
      ...(opts?.onEdit
        ? [{ key: 'edit', label: t.common.edit, icon: 'pencil-simple-bold' as const, primary: true, run: opts.onEdit }]
        : []),
      // « Partager » — a public link with just the title + when + who-label (no member ids leak).
      ...(opts?.onShare ? [{ key: 'share', label: t.shareLink.action, icon: 'arrow-up-right-bold' as const, overflow: true, run: opts.onShare }] : []),
      ...(opts?.onDelete
        ? [{ key: 'delete', label: t.common.delete, icon: 'trash-bold' as const, tone: 'danger' as const, overflow: true, run: opts.onDelete }]
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
  // Reaching the vendor (call / write) stays a visible button; everything past that
  // — directions, website, booking, delete — folds into the sheet's head ⋯.
  if (mapsHref) actions.push({ key: 'nav', label: t.cercle.navigate, icon: 'map-pin-bold', overflow: true, run: () => { window.open(mapsHref, '_blank', 'noopener') } })
  if (b.website?.trim()) {
    const url = /^https?:\/\//.test(b.website.trim()) ? b.website.trim() : `https://${b.website.trim()}`
    actions.push({ key: 'web', label: bz.website, icon: 'arrow-up-right-bold', overflow: true, run: () => { window.open(url, '_blank', 'noopener') } })
  }
  // « Planifier un rendez-vous » — a rendez-vous with this vendor (vet, plumber…),
  // opening the shared EventForm pre-seeded with this business as the "Avec".
  if (opts?.onSchedule) actions.push({ key: 'rdv', label: t.cercle.scheduleRdv, icon: 'calendar-blank-bold', overflow: true, run: opts.onSchedule })
  if (opts?.onDelete) actions.push({ key: 'delete', label: bz.delete, icon: 'trash-bold', tone: 'danger', overflow: true, run: opts.onDelete })
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
  // The two family-graph doors + delete fold into the head ⋯; the vet rendez-vous
  // (the one thing an animal's card is usually opened FOR) and Modifier stay visible.
  if (opts?.buildFamilyHref) actions.push({ key: 'family', label: t.cercle.familyFromPerson, icon: 'tree-bold', overflow: true, href: opts.buildFamilyHref })
  if (opts?.onConnect) actions.push({ key: 'connect', label: t.cercle.connectFromPerson, icon: 'users-three-bold', overflow: true, run: opts.onConnect })
  // « Rendez-vous chez le vétérinaire » — seeds the pet's vet Business into the event
  // form (only offered when the pet has a vet on file, so there IS a counterpart).
  if (opts?.onSchedule) actions.push({ key: 'rdv', label: p.vetRdv, icon: 'calendar-blank-bold', run: opts.onSchedule })
  if (opts?.onDelete) actions.push({ key: 'delete', label: p.delete, icon: 'trash-bold', tone: 'danger', overflow: true, run: opts.onDelete })
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
  const blocks: DetailBlock[] = []
  // A reply quotes the mot it answers, up top, so the thread reads in context.
  if (opts?.parentQuote?.trim()) blocks.push({ kind: 'text', text: `↩ ${opts.parentQuote.trim()}`, hand: true })
  if (m.text.trim()) blocks.push({ kind: 'text', text: m.text.trim() })
  // The spoken words, when there are any and no written line already says them.
  // Labelled, so nobody mistakes the machine's guess for what was typed — and it
  // sits ABOVE the player, which stays the source of truth one tap away.
  if (!m.text.trim() && m.transcript?.trim())
    blocks.push({ kind: 'text', label: fn.transcript, text: m.transcript.trim() } as DetailBlock)
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
    title: motLabel(m, fn),
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
  opts?: {
    onDone?: () => void
    upcoming?: boolean
    todo?: boolean
    overdue?: boolean
    // « Reporter » (entretien): postpone without checking — quiet, then it returns.
    // Cycle only shows for a recurring row (c.recurring); week always pairs onDone.
    onPostponeWeek?: () => void
    onPostponeCycle?: () => void
  },
): DetailModel {
  const { t, lang, members } = ctx
  const team = (c.team ?? []).map((id) => nameOf(members, id)).filter((n): n is string => !!n)
  const blocks: DetailBlock[] = team.length > 1 ? [{ kind: 'chips', label: t.detail.team, chips: team }] : []
  const actions: DetailAction[] = opts?.onDone
    ? [{ key: 'done', label: t.detail.markDone, icon: 'check-bold' as IconName, primary: true, run: opts.onDone }]
    : []
  if (opts?.onPostponeWeek)
    actions.push({ key: 'postpone-week', label: t.detail.postponeWeek, icon: 'clock-bold', run: opts.onPostponeWeek })
  if (opts?.onPostponeCycle)
    actions.push({ key: 'postpone-cycle', label: t.detail.postponeCycle, icon: 'arrow-counter-clockwise-bold', run: opts.onPostponeCycle })
  return {
    kind: opts?.todo ? 'todo' : 'chore',
    title: c.title,
    icon: opts?.todo ? 'check-bold' : CATS.chore.icon,
    accent: c.color ?? CATS.chore.color,
    // Overdue entretien: the calm « owed since » line (c.at carries the missed date).
    when: opts?.overdue ? t.board.lateSince(formatDayMaybeYear(c.at, lang)) : opts?.upcoming ? formatDayMaybeYear(c.at, lang) : undefined,
    who: whoOf(members, c.who_id, t.detail.turn),
    blocks,
    actions,
  }
}

// — A habit (« Mes habitudes ») — the board card's per-habit peek. Content, not a
// menu: where today stands (the same quiet reading the check-in rows use), the
// rhythm's gentle week count, the owner face. « Modifier » is the reachable edit
// door the check-in scene buried two taps deep — and the ONLY door for a habit
// that isn't due today (no row on the scene = no pencil). « Le point du jour »
// stays the marking surface; the peek never grows its own write path (calm). —
export function buildHabit(
  h: Habit,
  ctx: DetailCtx,
  opts: { days: HabitDay[]; today: number; canEdit?: boolean },
): DetailModel {
  const { t, members } = ctx
  const fn = t.habits
  const status = habitStatusOn(h, opts.days, opts.today)
  const reading = habitReading(h, status, fn)
  const progress = deriveProgress(h, opts.days, opts.today)
  const blocks: DetailBlock[] = []
  if (reading) blocks.push({ kind: 'text', text: reading })
  if (progress.weekDone > 0) blocks.push({ kind: 'text', text: fn.weekDone(progress.weekDone) })
  if (h.archived) blocks.push({ kind: 'text', text: fn.paused })
  const actions: DetailAction[] = [
    ...(opts.canEdit
      ? [{ key: 'edit', label: t.common.edit, icon: 'pencil-simple-bold' as const, primary: true, href: `/habitude/${h.id}/edit` }]
      : []),
    { key: 'checkin', label: fn.checkin, icon: 'repeat-bold', href: '/board/habitudes' },
  ]
  return {
    kind: 'habit',
    title: h.title,
    emoji: h.icon || undefined,
    icon: 'repeat-bold',
    accent: h.colour ?? CATS.chore.color,
    who: whoOf(members, h.member_id),
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

// — One grocery line on « La liste » —
//
// The SIMPLE face's hold used to jump straight to the full-screen editor. That
// works, but it's the one surface where a peek earns its place twice over: in a
// shop you mostly want to LOOK (« est-ce encore l'aubaine ? », « quelle allée ? »,
// « c'est qui qui l'a mis ? ») and only sometimes to edit. So the hold shows the
// row's quiet facts, with « Modifier » one tap further into the same scene. The
// AVANCÉ face's ✏️ still goes there directly — it's the non-touch door, and
// putting a peek in front of it would add a step to the deliberate path.
//
// Nothing here is a new write: the check and the delete reuse the page's own
// handlers, undo tiers and all.
export function buildListItem(
  i: { id: string; text: string; checked?: boolean; noRush?: boolean; terms?: string[] },
  ctx: DetailCtx,
  opts: {
    adderId?: string | null
    picto?: string
    aisle?: string
    dealMerchant?: string | null
    dealPrice?: string | null
    /** The flyer product's own name ("Lait 2% 4L") — never on the row, so the peek
     *  is where it gets said. */
    dealName?: string | null
    /** Preformatted validity ("jusqu'au 5 sept.") — the caller has the lang. */
    dealUntil?: string | null
    /** The validTo day is fully past (lib/deals dealEnded) → the loud warning chip. */
    dealEnded?: boolean
    onToggle?: () => void
    onDelete?: () => void
  } = {},
): DetailModel {
  const { t } = ctx
  const blocks: DetailBlock[] = []
  // The staged deal first — in the aisle it's the whole reason you're looking.
  // Same facts as the cashier peek: name, store · price, validity — plus the
  // « Aubaine terminée » chip (warn-tinted) once the validTo day is past.
  const dealBits = [opts.dealMerchant?.trim() || null, opts.dealPrice || null].filter((x): x is string => !!x)
  const dealChips: string[] = []
  const dealTones: (string | undefined)[] = []
  if (opts.dealName?.trim()) {
    dealChips.push(opts.dealName.trim())
    dealTones.push(undefined)
  }
  if (dealBits.length) {
    dealChips.push(dealBits.join(' · '))
    dealTones.push(undefined)
  }
  if (opts.dealEnded) {
    dealChips.push(opts.dealUntil ? `${t.shop.dealEnded} — ${opts.dealUntil}` : t.shop.dealEnded)
    dealTones.push('#c2563a') // --terracotta-deep, the warn tone
  } else if (opts.dealUntil) {
    dealChips.push(opts.dealUntil)
    dealTones.push(undefined)
  }
  if (dealChips.length) blocks.push({ kind: 'chips', label: t.list.dealLabel, chips: dealChips, tones: dealTones })
  if (opts.aisle) blocks.push({ kind: 'chips', label: t.list.aisleLabel, chips: [opts.aisle] })
  // The flyer-search synonyms are invisible on the row but decide whether a deal
  // is ever FOUND for this line — worth seeing before wondering why there's none.
  if (i.terms?.length) blocks.push({ kind: 'chips', label: t.list.termsLabel, chips: i.terms })
  if (i.noRush) blocks.push({ kind: 'text', text: t.list.rushHint })

  const actions: DetailAction[] = []
  if (opts.onToggle)
    actions.push({
      key: 'check',
      label: i.checked ? t.list.uncheck : t.list.check,
      icon: 'check-bold',
      primary: true,
      run: opts.onToggle,
    })
  actions.push({ key: 'edit', label: t.list.editTitle, icon: 'pencil-simple-bold', href: `/liste/item/${i.id}` })
  if (opts.onDelete)
    actions.push({ key: 'delete', label: t.common.delete, icon: 'trash-bold', tone: 'danger', overflow: true, run: opts.onDelete })

  return {
    kind: 'list-item',
    title: i.text,
    emoji: opts.picto || undefined,
    icon: CATS.list.icon,
    accent: colorOf(ctx.members, opts.adderId ?? null) || CATS.list.color,
    who: whoOf(ctx.members, opts.adderId ?? null, t.list.addedBy),
    blocks,
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
  /** The recipe this meal resolves to (useOpenMeal resolves it) — adds the 📖 / 🍲 doors. */
  recipeId?: string | null
  onLeftover?: () => void
  onRemove?: () => void
}

// — A planned meal. EVERY tapped meal reaches this builder now (Marc, 2026-09-02):
// a recipe-linked one used to navigate straight to /kitchen/recipe/:id, which meant a
// planned meal had NO way back to the day it belongs to — the recipe view knows nothing
// about the plan. The peek is the one place that holds both halves, so it carries the
// day door AND the recipe doors rather than making you choose by guessing what a tap
// will do. Accepted cost, chosen deliberately: cooking tonight from the board is 2 taps
// instead of 1 (tap-budget.spec.ts re-pinned).
// `color` is the slot colour (useMealPrefs); `daySec` enables "Voir la journée";
// `recipeId` (resolved by useOpenMeal) adds « Ouvrir la recette » + the primary
// « Cuisiner »; `onLeftover` adds "Créer des restants"; `onRemove` the danger
// "Retirer du plan" — those last two fold into the ⋯ so the visible row stays the
// three doors you actually came for. —
export function buildMeal(m: MealLike, ctx: DetailCtx, opts?: MealOpts): DetailModel {
  const { t, members } = ctx
  const slot = m.slot
  const icon: IconName = slot && isMealSlot(slot) ? SLOT_ICON_NAME[slot] : CATS.meal.icon
  const blocks: DetailBlock[] = m.is_leftover ? [{ kind: 'text', text: t.kitchen.leftoversTag }] : []
  const actions: DetailModel['actions'] = []
  if (opts?.daySec) actions.push({ key: 'day', label: t.detail.openDay, icon: 'calendar-blank-bold', href: `/kitchen/day/${opts.daySec}` })
  // The recipe half — the same two doors a planner row wears, spelled out here since a
  // lone peek has room for labels where a dense row only had glyphs. « Cuisiner » is the
  // primary: it is what you opened a supper for.
  if (opts?.recipeId) {
    actions.push({ key: 'recipe', label: t.recipes.open, icon: 'book-open-bold', href: `/kitchen/recipe/${opts.recipeId}` })
    actions.push({ key: 'cook', label: t.recipes.cook, icon: 'cooking-pot-bold', primary: true, href: `/kitchen/recipe/${opts.recipeId}/cook` })
  }
  // The plan-editing tail folds into the ⋯ — with the recipe doors present, five visible
  // buttons would bury the three that matter. (Overflow is set explicitly per action, no
  // heuristics — see DetailAction.)
  const fold = !!opts?.recipeId
  if (opts?.onLeftover && !m.is_leftover)
    actions.push({ key: 'leftover', label: t.detail.makeLeftover, icon: 'arrow-counter-clockwise-bold', overflow: fold, run: opts.onLeftover })
  if (opts?.onRemove)
    actions.push({ key: 'remove', label: t.detail.removeFromPlan, tone: 'danger', overflow: fold, run: opts.onRemove })
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

// — A whole DAY (La cuisine week grid + Historique): the day's meals as a list of
// DOORS (each recipe-linked meal wears 📖 + 🍲 Cuisiner) +
// the day note, plus the two doors into the day scene's faces — « Planifier un
// repas » (primary, `?vue=repas`, the pencil's landing) and « Voir la journée »
// (the agenda face). It used to carry zero actions on purpose; Marc's 2026-09-02
// ask flipped that — a tapped day should offer what to DO with it, not just the
// meals as text. Both doors are plain navigations (the day scene gates its own
// writes), so they stay for a read-only guest. The cook name is resolved by the
// caller (which holds the members), so this stays member-free. —
export function buildDay(
  ctx: DetailCtx,
  opts: {
    label: string
    day?: number
    accent?: string
    // `recipeId` (when the caller resolved one, via useRecipeForMeal) turns that
    // meal line into a door pair; a free-text meal stays plain text.
    meals: { slot: string; title: string; cook?: string | null; recipeId?: string | null }[]
    note?: string | null
  },
): DetailModel {
  const { t } = ctx
  const blocks: DetailBlock[] = []
  if (opts.meals.length)
    blocks.push({
      kind: 'list',
      label: t.board.meals,
      // Each meal that resolves a recipe carries the two small doors the planner
      // rows already wear — 📖 the recipe view, 🍲 straight into cook mode. Per
      // MEAL, not per day: one full-width « Cuisiner » on a day holding N meals
      // could not say which one it meant (Marc, 2026-09-02). Both are plain
      // navigations (reads), so a read-only guest keeps them.
      items: opts.meals.map((m, i) => {
        const text = `${m.slot} · ${m.title}${m.cook ? ` (${m.cook})` : ''}`
        if (!m.recipeId) return text
        return {
          text,
          actions: [
            { key: `recipe-${i}`, label: t.recipes.title, icon: 'book-open-bold' as const, href: `/kitchen/recipe/${m.recipeId}` },
            { key: `cook-${i}`, label: t.recipes.cook, icon: 'cooking-pot-bold' as const, href: `/kitchen/recipe/${m.recipeId}/cook` },
          ],
        }
      }),
    })
  else blocks.push({ kind: 'text', text: t.detail.dayEmpty })
  if (opts.note) blocks.push({ kind: 'text', text: opts.note, hand: true })
  const actions: DetailModel['actions'] = opts.day
    ? [
        { key: 'day', label: t.detail.openDay, icon: 'calendar-blank-bold', href: `/kitchen/day/${opts.day}` },
        { key: 'meals', label: t.kitchen.planMeal, icon: CATS.meal.icon, primary: true, href: `/kitchen/day/${opts.day}?vue=repas` },
      ]
    : []
  return {
    kind: 'day',
    title: opts.label,
    icon: 'calendar-blank-bold',
    accent: opts.accent ?? CATS.meal.color,
    blocks,
    actions,
  }
}

// NOTE — the "tap the thing, get the thing" rule. A peek that is really just a MENU
// of "go to page X" is an inter-tap, and we delete it rather than ship it:
//   · `buildRecipe` (the recipe-card browse peek) → tapping a recipe opens
//     /kitchen/recipe/:id, where Cuisiner / Ajouter à la liste / Partager live.
//   · `buildRoutine` (the routine-card peek) → tapping a routine card runs it
//     (/routine/:id/run); the card itself already carries one-tap ✎ and ▶, and
//     « Partager » moved onto the routine's own scene (/routine/:id).
//   · a recipe-linked MEAL used to navigate to the recipe view too — REVERSED
//     2026-09-02 (Marc): that left a planned meal with no door back to its day, so
//     buildMeal now serves every meal and carries the day + recipe + Cuisiner doors.
//     It is not an inter-tap: the peek holds what NEITHER page has (the plan).
//   · a HABIT peek used to be rejected here on "the rows aren't tappable" grounds —
//     that changed (Marc, Aug 2026): the board card's rows now open `buildHabit`
//     (above), which passes the content bar (today's reading + week count + owner),
//     and whose « Modifier » is the ONE reachable edit door for a habit not due
//     today. « Le point du jour » remains the marking surface. (PARITY F6×D2 ✅.)
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
  opts?: { accent?: string; relations?: string[]; groups?: string[]; groupToggle?: GroupToggle; onEdit?: () => void; onDelete?: () => void; onExport?: () => void; onConnect?: () => void; onSchedule?: () => void; nextRdv?: NextRdv | null; buildFamilyHref?: string },
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
  // Everything past "reach this person" (call/write) folds into the sheet's head ⋯:
  // a contact card could otherwise stack EIGHT same-weight buttons under the notes.
  // External Maps link — open in a new tab (the sheet feeds href to the SPA router,
  // which can't navigate an absolute URL, so route it through run/window.open).
  if (maps) actions.push({ key: 'nav', label: t.cercle.navigate, icon: 'map-pin-bold', overflow: true, run: () => { window.open(maps, '_blank', 'noopener') } })
  // "Bâtir sa famille" — open the family builder seeded with this person.
  if (opts?.buildFamilyHref) actions.push({ key: 'family', label: t.cercle.familyFromPerson, icon: 'tree-bold', overflow: true, href: opts.buildFamilyHref })
  // "Relier à quelqu'un" — open the connector with this person as side A.
  if (opts?.onConnect) actions.push({ key: 'connect', label: t.cercle.connectFromPerson, icon: 'users-three-bold', overflow: true, run: opts.onConnect })
  // « Planifier un rendez-vous » — a rendez-vous with this person, opening the
  // shared EventForm pre-seeded with them as the "Avec".
  if (opts?.onSchedule) actions.push({ key: 'rdv', label: t.cercle.scheduleRdv, icon: 'calendar-blank-bold', overflow: true, run: opts.onSchedule })
  // "Exporter (vCard)" — download a .vcf to drop this person into any phone/Mac.
  if (opts?.onExport) actions.push({ key: 'export', label: t.cercle.exportVcard, icon: 'arrow-up-right-bold', overflow: true, run: opts.onExport })
  // « Supprimer » — the same confirm-then-DELETE the person form scene carries; a
  // pet's peek already had this door, a contact's didn't (ACTIONS.md Wave D).
  // Heavy tier (edges + memberships cascade), so the confirm lives in the caller.
  if (opts?.onDelete) actions.push({ key: 'delete', label: t.cercle.deletePerson, icon: 'trash-bold', tone: 'danger', overflow: true, run: opts.onDelete })
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
  // The family-graph doors + the Réglages edit link fold into the head ⋯; « Fiche
  // complète » (the primary) and the rendez-vous door stay visible.
  // "Bâtir sa famille" — open the family builder seeded with this member.
  if (opts?.buildFamilyHref) actions.push({ key: 'family', label: t.cercle.familyFromPerson, icon: 'tree-bold', overflow: true, href: opts.buildFamilyHref })
  // "Relier à quelqu'un" — open the connector with this member as side A.
  if (opts?.onConnect) actions.push({ key: 'connect', label: t.cercle.connectFromPerson, icon: 'users-three-bold', overflow: true, run: opts.onConnect })
  // « Planifier un rendez-vous » — an appointment concerning this member, opening
  // the shared EventForm with them pre-selected.
  if (opts?.onSchedule) actions.push({ key: 'rdv', label: t.cercle.scheduleRdv, icon: 'calendar-blank-bold', run: opts.onSchedule })
  actions.push({ key: 'edit', label: t.cercle.editPerson, icon: 'pencil-simple-bold', overflow: true, href: '/settings?tab=maison&sub=members' })
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

