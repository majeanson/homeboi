// WIRE TYPES — the shape a GET handler answers with, named ONCE so the e2e fixture in
// e2e/mocks.ts is typed against it and `tsc -b` (which covers e2e/) fails the day the
// two drift apart.
//
// Why this file exists (2026-11-05, wave 0.4 of plans/2026-11-05-SOLIDIFY.md): the
// `health` fixture carried four keys — {ai, aiAvailable, rateLimit, alerts} — while the
// handler had grown to fifteen. Nothing noticed, because `ROUTES` is a
// `Record<string, unknown>` and an unknown GET answers `{}` 200. The effect in every
// browser test: `photos`, `realtime` and `cloudOcr` were always falsy, so the R2 and
// realtime rows of the health card showed « off » and no spec could ever exercise a
// photo door. A fixture that lies about the wire is worse than none: it passes.
//
// Pure types, no imports, so e2e/ (compiled with DOM + node, not workers-types) can
// import it. One interface per handler, added as each fixture is typed; the handler
// answers through `okWire('route', body)`, so a key added on one side is a compile error on
// the other.

export interface HealthWire {
  ok: boolean
  app: string
  /** Workers AI is bound AND the household has not switched it off. */
  ai: boolean
  /** Workers AI is bound at all (the operator's « IA » toggle only matters when true). */
  aiAvailable: boolean
  /** MISTRAL_API_KEY is set — the cloud OCR reader for recipe photos. */
  cloudOcr: boolean
  /** BROWSER is bound — the headless browser for recipe URL import. */
  browserRun: boolean
  /** Signup needs an invite code. */
  invite: boolean
  /** SESSION_SECRET is set and ≥ 32 chars (validated at use, never weakened). */
  sessionSecret: boolean
  /** R2 (PHOTOS) is bound — photo / voice-clip / drawing features show. */
  photos: boolean
  /** RESEND_API_KEY + MAIL_FROM are set — password reset and the nightly alert can send. */
  mail: boolean
  rateLimit: boolean
  /** ALERT_EMAIL is set — the nightly cron can reach a human. */
  alerts: boolean
  /** DEPLOY_NOTIFY_SECRET is set — CI can close the « Regle-remarque » loop. */
  deployHook: boolean
  /** The RealtimeHub Durable Object is bound — /api/live upgrades; else clients poll. */
  realtime: boolean
  /** CONTACT_EMAIL, the Law 25 contact door, or null. */
  contact: string | null
}

// ── The other 43 fixtures (2026-11-06, wave 6.2) ──────────────────────────────────────
//
// How these were written, because it decides how far to trust them: every route that
// answers without the internet was CALLED, on a real D1 through the real Worker
// (`household()` seeded, the d1 harness), and each key below is what came back. The six
// a sample cannot reach (weather, wonder, deals, flyers, flyer, recipe-original) were
// read from the handler. A key seen only as null, or a list seen only empty, got its
// type from the column or the handler.
//
// What holds them: tsc, on both sides. The fixture through `ROUTES: Partial<Wire>` in
// e2e/mocks.ts, the handler through `okWire('route', body)` (_lib/json.ts), which refuses a
// missing key and, at any depth, a key this file does not know. Binding the 64 handlers
// (2026-11-06) corrected this file against each handler's real type: the method above had
// missed every key its sample left out, and a second face behind a query parameter
// (`ghost?view=manage`, `share?s=`, `shared-trip?id=`). Those faces are unions now.
// `unknown` is left only where the value really is free-form JSON (a share's payload, a
// recipe pill, a pet's weights, a contact's custom fields), and it ends the check there.
// src/lib/mocksContract.test.ts counts the routes still unbound.

/** A member row as /api/members and /api/board serve it: snake_case, the raw table. */
export interface MemberRow {
  id: string
  display_name: string
  avatar_kind: string
  avatar_ref: string | null
  colour: string
  is_child: number
}
export interface MemberFull extends MemberRow {
  sort_order: number
  email: string | null
  phone: string | null
  birthday: string | null
  notes: string | null
  gender: string | null
  companion: string | null
}

export interface AuthMeWire {
  signedIn: boolean
  email?: string
  /** Null when the operator row has no household (a join that came back empty). */
  household?: { id: string; name: string; tier: string } | null
  /** Which household FACE this account is (migration 0130), or null. */
  memberId?: string | null
  /** False only when mail is on and this address has not confirmed. */
  verified?: boolean
}

export interface BoardEvent {
  id: string
  title: string
  start_at: number
  all_day: number
  end_at: number | null
  car_id: string | null
  member_id: string | null
  passengers: string | null
  contact_id: string | null
  contact_name: string | null
  contact_address: string | null
  business_id: string | null
  business_name: string | null
  business_colour: string | null
  business_address: string | null
  bring_template_id: string | null
  notes: string | null
  soon: boolean
  /** Derived birthday rows only: they carry these and none of the columns above but `soon`. */
  birthday?: boolean
  age?: number | null
  gift_ideas?: string | null
}
/** `today`, `tomorrow` and `upcoming` mix event rows with derived birthdays, which have no event columns. */
export type BoardUpcoming = Pick<BoardEvent, 'id' | 'title' | 'start_at' | 'all_day' | 'member_id' | 'soon'> & Partial<BoardEvent>

export interface BoardMealBrief {
  id: string
  title: string
  cook_member_id: string | null
  is_leftover: number
  recipe_id: string | null
}
export interface BoardMeal extends BoardMealBrief {
  slot: string
  position: number
}
export interface BoardListItem {
  id: string
  text: string
  source: string
  added_by: string | null
  deal_json: string | null
  search_terms: string | null
  checked_at: number | null
  non_urgent: number | null
}
export interface BoardNote {
  id: string
  text: string
  member_id: string | null
  created_at: number
  media_kind: string | null
  media_key: string | null
  scene_key: string | null
  author_label: string | null
  for_member_id: string | null
  opened_at: number | null
  saved_at: number | null
  transcript: string | null
}
export interface BoardWork {
  id: string
  label: string | null
  at: number
  endAt: number
  member_id: string
  color: string | null
  holds_car: number
}
export interface BoardDayNote {
  id: string
  text: string
  member_id: string | null
}
// A task, read side (_lib/taskItem.ts). `done` has one meaning per case: 'ticked' is a one-off
// checked today and not yet cleared; everything else, including a recurring task checked this
// morning, reads 'open' with `doneAt` saying when it last was.
export interface TaskItem {
  key: string
  /** A task, or a home row (a project or an entretien: `kind`), 0153. Never what it used to be. */
  source: 'task' | 'home'
  id: string
  title: string
  /** The raw stored colour; the client resolves the look (lookOf). */
  color: string | null
  /** The raw stored icon (0148): an emoji, or null = « comme le sujet ». */
  icon: string | null
  /** Five dots (0149): 1 = tout simple, 5 = gros effort. Null = not said. */
  effort: number | null
  subject: { kind: 'carnet' | 'person' | 'pet' | 'project' | 'trip'; id: string } | null
  kind: 'plan' | 'upkeep' | null
  recurring: boolean
  recurJson: string | null
  /** The next date it is due, as a local midnight. Null = un jour. */
  day: number | null
  dueToday: boolean
  overdueSince: number | null
  snoozedUntil: number | null
  soon: boolean
  done: 'open' | 'ticked'
  doneAt: number | null
  who_id: string | null
  team: string[]
  /** « Annoncer la veille »: the board names it the evening before its day. */
  announceEvening: boolean
  /** Due, owed or ticked today: what the bento board shows. */
  onBoard: boolean
}
/** One occurrence of a task on a calendar day (_lib/taskViews `cellsOf`). */
export interface TaskCellWire {
  id: string
  taskId: string
  source: TaskItem['source']
  title: string
  color: string | null
  icon: string | null
  kind: 'plan' | 'upkeep' | null
  who_id: string | null
  day: number
  /** A one-off that was ticked: it keeps its cell, struck. */
  done: boolean
  recurring: boolean
  /** Inside its calm « Bientôt » lead window right now. */
  soon: boolean
}
export interface BoardWire {
  syncedAt: number
  scope: string
  members: MemberRow[]
  today: BoardUpcoming[]
  work: BoardWork[]
  tomorrow: BoardUpcoming[]
  upcoming: BoardUpcoming[]
  tonight: BoardMealBrief | null
  tonightMeals: BoardMeal[]
  tomorrowMeal: BoardMealBrief | null
  todayMeals: BoardMeal[]
  heroSlot: string
  dayNote: BoardDayNote | null
  tomorrowMeals: BoardMeal[]
  tomorrowNote: BoardDayNote | null
  list: BoardListItem[]
  /** Every task due, owed or ticked today (the « Tâches » card). */
  tasks: TaskItem[]
  /** Every open task whose next date falls in the six days after today (« À venir »). */
  tasksAhead: TaskItem[]
  notes: BoardNote[]
  leftovers: { id: string; title: string; recipe_id: string | null; source_meal_id: string | null }[]
}

export interface WeatherWire {
  weather: { tempC: number; bucket: string; isDay: boolean } | null
  tomorrow: { bucket: string; highC: number; lowC: number } | null
  hours: { hour: number; tempC: number; bucket: string }[] | null
}

export interface WonderWire {
  wonder: { source: string; title: string; explanation: string; lang: string; imgUrl: string; copyright?: string } | null
}

export interface PhotosWire {
  photos: { id: string; key: string; saved_at: number | null }[]
}

export interface MealRow {
  id: string
  date: number
  slot: string
  title: string
  cook_member_id: string | null
  suggested_by: string | null
  recipe_id: string | null
  position: number
  is_leftover: number
}
export interface MealsWire {
  days: MealRow[]
  weekStart: number
  windowDays: number
  recent: MealRow[]
}

/** Two faces of one route: the paged past, and `?summary=1`'s dish list. */
export type MealHistoryWire =
  | { days: MealRow[]; nextBefore: number | null }
  | { dishes: { title: string; recipe_id: string | null; last_at: number }[] }

export interface MealIdeasWire {
  ideas: { id: string; title: string; recipe_id: string | null; suggested_by: string | null; date: number | null; created_at: number }[]
}

export interface PantryWire {
  low: { id: string; item: string; marked_at: number }[]
}
export interface UseSoonWire {
  soon: { id: string; item: string; marked_at: number }[]
}
export interface DayNotesWire {
  notes: { id: string; date: number; text: string; member_id: string | null; updated_at: number }[]
}
export interface AiErrorsWire {
  errors: { id: string; feature: string; message: string; created_at: number }[]
}

export interface RemarkEventRow {
  id: string
  remark_id: string
  kind: string
  text: string | null
  sha: string | null
  media_kind: string | null
  media_key: string | null
  scene_key: string | null
  author_member_id: string | null
  created_at: number
}
export interface RemarksWire {
  remarks: {
    id: string
    kind: string
    title: string
    body: string
    help_key: string | null
    seen_path: string | null
    seen_build: string | null
    context_json: string
    status: string
    reported_by: string | null
    created_at: number
    updated_at: number
    events: RemarkEventRow[]
  }[]
}

export interface TripsWire {
  trips: {
    id: string
    title: string
    destination: string | null
    start_at: number | null
    end_at: number | null
    members: string[]
    media_kind: string | null
    media_key: string | null
    colour: string | null
    notes: string | null
    position: number
    created_at: number
    updated_at: number | null
  }[]
}

export interface CarnetsWire {
  carnets: {
    id: string
    parentId: string | null
    kind: string
    name: string
    mediaKey: string | null
    color: string | null
    facts: Record<string, unknown> | null
    installedAt: number | null
    lifespanMonths: number | null
    linkId: string | null
    notes: string | null
    sort: number
  }[]
  soon: { id: string; carnetId: string; name: string; kind: string; color: string | null; at: number; monthsLeft: number }[]
}

export interface RecipeWireRow {
  id: string
  title: string
  ingredients: string[]
  steps: string[]
  servings: number | null
  servingsUnit: string | null
  prepMin: number | null
  cookMin: number | null
  totalMin: number | null
  notes: string | null
  source: string | null
  image: string | null
  tags: string[]
  stepImages: string[]
  lang: string | null
  updatedAt: number
}
export interface RecipesWire {
  recipes: RecipeWireRow[]
}

export interface RecipeOriginalWire {
  original: {
    title: string | null
    ingredients: string[]
    steps: string[]
    servings?: number | null
    source?: string | null
    importedAt?: number | null
    sourceImage?: string | null
    sourceImages?: string[] | null
  } | null
}

export interface RecipeTagsWire {
  presets: string[]
  used: { tag: string; count: number }[]
  colors: Record<string, string>
  pills: Record<string, unknown>[]
  tagSlots: Record<string, string[]>
}

export interface RoutineCard {
  icon: string
  label: string
  narration?: string
  seconds?: number
  tip?: string
  clipKey?: string
  photoKey?: string
}
export interface RoutinesWire {
  routines: {
    id: string
    memberId: string | null
    memberName: string | null
    color: string | null
    avatarPhoto: string | null
    name: string
    timeOfDay: string | null
    companion: string | null
    cards: RoutineCard[]
    cardsNarration: (string | null)[]
    cardsPhoto: (string | null)[]
    doneIdx: number[]
    timers: Record<number, { endsAt: number } | { left: number }>
  }[]
  date: number
}

export interface HabitRow {
  id: string
  member_id: string | null
  title: string
  icon: string
  colour: string | null
  kind: string
  target: number | null
  unit: string
  cadence: string
  /** The raw rule JSON: the form re-hydrates it with recurOf(). */
  recur: string | null
  week_times: number | null
  day_times: number | null
  every_hours: number | null
  window_start: number | null
  window_end: number | null
  reminders: number[]
  position: number
  archived: boolean
  due_days: number[]
}
export interface HabitsWire {
  habits: HabitRow[]
  days: { habit_id: string; day: number; value: number; slips: number; member_id: string | null; note: string | null }[]
  marks: { habit_id: string; day: number; member_id: string | null }[]
  today: number
}

export interface MonthWire {
  events: {
    id: string
    title: string
    at: number
    all_day: number
    member_id: string | null
    end_at?: number | null
    car_id?: string | null
    passengers?: string | null
    contact_id?: string | null
    contact_name?: string | null
    contact_address?: string | null
    business_id?: string | null
    business_name?: string | null
    business_colour?: string | null
    business_address?: string | null
    bring_template_id?: string | null
    notes?: string | null
    day: number
    birthday?: boolean
    age?: number | null
    end?: number
    work?: boolean
    color?: string | null
    holds_car?: number
  }[]
  meals: { id: string; slot: string; title: string; cook_member_id: string | null; day: number; is_leftover?: number }[]
  /** Every dated task, every occurrence in the window. */
  tasks: TaskCellWire[]
  dayNotes: { id: string; text: string; member_id: string | null; day: number }[]
  /** The open departure checklist instances (not tasks). */
  todos: { id: string; title: string; member_id: string | null; day: number; section: string | null }[]
  trips: { id: string; title: string; colour: string; start_at: number; end_at: number; shared?: true }[]
  tripPlans: {
    id: string
    trip_id: string
    category: string
    label: string | null
    text: string
    media_kind: string | null
    colour: string
    day: number
    shared?: true
  }[]
  habits: {
    id: string
    habit_id: string
    title: string
    icon: string
    colour: string | null
    kind: string
    member_id: string | null
    day: number
    done: boolean
  }[]
  /** Absent on the bad-window early return, so a reader has to guard it (dayLines.ts does). */
  transfers?: { id: string; planId: string; title: string; colour: string | null; day: number }[]
}

export interface YearWire {
  birthdays: { id: string; name: string; day: number; age: number | null; memberId: string | null }[]
  events: { id: string; title: string; day: number }[]
  tasks: { id: string; kind: 'plan' | 'upkeep' | null; title: string; color: string | null; day: number; done: boolean }[]
  life: { carnetId: string; name: string; color: string | null; day: number }[]
  trips: { id: string; title: string; colour: string | null; start_at: number; end_at: number; shared?: true }[]
}

export interface MembersWire {
  members: MemberFull[]
}

export interface PairDevicesWire {
  devices: { id: string; label: string | null; kind: string; created_at: number; last_seen_at: number | null; revoked_at: number | null }[]
}

export interface ChoresWire {
  chores: {
    id: string
    title: string
    rotation_json: string
    current_idx: number
    last_done_at: number | null
    last_done_by: string | null
    color: string | null
    recur_json: string | null
    recur_start: number | null
    lead_seconds: number | null
    announce_evening: number | null
    subject_kind: string | null
    subject_id: string | null
    icon: string | null
    effort: number | null
  }[]
}

export interface EventsWire {
  events: {
    id: string
    title: string
    start_at: number
    all_day: number
    end_at: number | null
    member_id: string | null
    contact_id: string | null
    business_id: string | null
    recur_json: string | null
    lead_seconds: number | null
    car_id: string | null
    passengers: string | null
    bring_template_id: string | null
    notes: string | null
    contact_name: string | null
    business_name: string | null
    business_colour: string | null
  }[]
}

export interface TakeoutBackupsWire {
  backups: { date: string; bytes: number }[]
}

interface WireCar {
  id: string
  name: string
  color?: string
}
export interface HouseholdWire {
  name: string
  tz: string
  postal: string | null
  flippLang: string | null
  includedStores: string[]
  cashierExcludedStores: string[]
  mealColors: Record<string, string>
  mealHidden: string[]
  mealOrder: string[]
  mealHero: string
  mealHours: Record<string, number>
  mealWindowDays: number
  measureColors: Record<string, string>
  reserveLocations: { id: string; name: string; color?: string }[] | null
  cars: WireCar[] | null
  aisleOrder: string[] | null
  aisleOverrides: Record<string, string>
  aiEnabled: boolean
  schoolYear: { firstDay: number; lastDay: number; breaks: { from: number; to: number; label?: string }[] } | null
  wifiSsid: string | null
  wifiPassword: string | null
  houseRules: string | null
  binDay: string | null
}

export interface CerclePet {
  id: string
  name: string
  species: string | null
  breed: string | null
  photoKey: string | null
  colour: string | null
  icon: string | null
  birthday: string | null
  microchip: string | null
  feeding: string | null
  sitterNotes: string | null
  vetBusinessId: string | null
  weights: unknown[]
  notes: string | null
}
export interface CercleContact {
  id: string
  firstName: string
  lastName: string | null
  nickname: string | null
  photoKey: string | null
  birthday: string | null
  email: string | null
  phone: string | null
  address: Record<string, string> | null
  notes: string | null
  tags: string[]
  memberId: string | null
  customFields: unknown[]
  gender: string | null
  giftIdeas: string | null
}
export interface CercleWire {
  members: {
    id: string
    displayName: string
    avatarKind: string
    avatarRef: string | null
    colour: string
    isChild: boolean
    email: string | null
    phone: string | null
    birthday: string | null
    notes: string | null
    gender: string | null
  }[]
  contacts: CercleContact[]
  links: {
    id: string
    personAId: string
    personAKind: string
    personBId: string
    personBKind: string
    type: string
    reverseType: string
    label: string | null
    notes: string | null
  }[]
  groups: { id: string; name: string; kind: string; colour: string | null; memberKeys: { personId: string; personKind: string }[] }[]
  pets: CerclePet[]
}

export interface BusinessesWire {
  businesses: {
    id: string
    name: string
    category: string | null
    phone: string | null
    email: string | null
    address: string | null
    website: string | null
    notes: string | null
    photoKey: string | null
    colour: string | null
    servicedCarnets: { id: string; name: string; kind: string }[]
  }[]
}

export interface DealRow {
  id: number | null
  flyerId: number | null
  name: string
  price: number | null
  wasPrice: number | null
  unitPrice: number | null
  unitLabel: string | null
  unitKind: string | null
  unitApprox: boolean
  merchant: string
  logo: string | null
  premium: boolean
  image: string | null
  cutout: string | null
  validFrom: string | null
  validTo: string | null
  merchantId: number | null
  box: { left: number; right: number; top: number; bottom: number } | null
}
export interface DealsWire {
  query: string
  postal: string
  count: number
  deals: DealRow[]
}

export interface FlyersWire {
  postal: string
  count: number
  flyers: { flyerId: number; merchant: string; logo: string | null; premium: boolean; validFrom: string | null; validTo: string | null; included?: boolean }[]
}

interface FlyerBox {
  left: number
  top: number
  right: number
  bottom: number
}
export interface FlyerWire {
  flyerId: number
  postal: string
  validFrom: string | null
  validTo: string | null
  pages: (FlyerBox & { id: number | null; page: number })[]
  items: (FlyerBox & {
    id: number | null
    name: string
    price: number | null
    unitPrice: number | null
    unitLabel: string | null
    unitKind: string | null
    validFrom: string | null
    validTo: string | null
    image: string | null
  })[]
}

/** Two faces: the ranked list, and `?view=manage`'s settings table. */
export type GhostWire =
  | {
      ghosts: { key: string; label: string; status: string; cadenceDays: number; lastAt: number | null; count: number }[]
      staples: { key: string; label: string }[]
    }
  | {
      items: {
        key: string
        label: string
        cadenceDays: number | null
        source: string
        muted: boolean
        standing: boolean
        count: number
        lastAt: number | null
      }[]
      candidates: { key: string; label: string; count: number; cadenceDays: number }[]
    }

export interface FamilyNotesWire {
  notes: {
    id: string
    member_id: string | null
    author_member_id: string | null
    title: string | null
    text: string
    media_kind: string | null
    media_key: string | null
    scene_key: string | null
    position: number
    created_at: number
    updated_at: number | null
  }[]
  more: boolean
}

export interface TransfersWire {
  today: number
  more: boolean
  plans: {
    id: string
    title: string
    amountCents: number | null
    recur: { freq: string; interval?: number; weekdays?: number[] } | null
    anchorAt: number
    shares: Record<string, number>
    catchup: { behindMemberId: string; gapCents: number; asOf: number; termEnd: number } | null
    colour: string | null
    position: number
    note: string | null
    due: number[]
    projection: {
      behindMemberId: string
      aheadMemberId: string
      gapCents: number
      asOf: number
      termEnd: number
      extraPerPayment: number
      paymentsSoFar: number
      caughtUpCents: number
      remainingCents: number
      paymentsLeft: number
      projectedRemainingCents: number
    } | null
  }[]
  transfers: {
    id: string
    memberId: string | null
    sentAt: number
    lines: ({ kind: 'plan'; planId: string; dueAt: number; amountCents: number } | { kind: 'topup'; amountCents: number } | { kind: 'other'; label: string; amountCents: number })[]
    totalCents: number
    memo: string | null
    reference: string | null
    note: string | null
  }[]
}

export interface RecapWire {
  recap: string | null
}

export interface AReglerWire {
  signals: { kind: string; key: string; label: string; sub?: string | undefined; at?: number; href: string }[]
}

export interface CarSpan {
  start: number
  end: number
  label?: string | undefined
  holderId?: string | null
}
export interface CarWire {
  cars: WireCar[]
  primaryCarId: string
  hasSchedule: boolean
  now: number
  today: number
  status: { free: boolean; until?: number | undefined; span?: CarSpan; committed?: boolean }
  membersOut: string[]
  days: {
    day: number
    spans: CarSpan[]
    carSpans: CarSpan[]
    rides: {
      id: string
      title: string
      at: number
      allDay: number
      carId: string | null
      passengers: string[]
      memberId: string | null
      contactId: string | null
      contactName: string | null
      businessId: string | null
      businessName: string | null
      conflict: boolean
    }[]
    override: {
      carId: string
      day: number
      free: boolean
      holderId?: string | null
      startMin?: number | null
      endMin?: number | null
      label?: string | null
    } | null
  }[]
}

export interface TodosWire {
  todos: {
    id: string
    title: string
    day: number | null
    member_id: string | null
    done_at: number | null
    position: number
    section: string | null
    source_template_id: string | null
    created_at: number
    subject_kind: string | null
    subject_id: string | null
    icon: string | null
    color: string | null
    effort: number | null
  }[]
}

export interface TasksWire {
  tasks: TaskItem[]
  subjects: {
    carnets: { id: string; name: string; kind: string; color: string | null; facts: { emoji: string } | null }[]
    contacts: { id: string; name: string; colour: string | null; member_id: string | null }[]
    pets: { id: string; name: string; colour: string | null; icon: string | null }[]
    projects: { id: string; title: string; color: string | null; icon: string | null }[]
    trips: { id: string; title: string; colour: string | null }[]
  }
  /** Only with `?subject=`: what was done, when and by whom. Never a total. */
  history: { key: string; title: string; at: number; who_id: string | null }[]
}

export interface TodoTemplatesWire {
  templates: {
    id: string
    title: string
    position: number
    items: ({ kind: string; label: string } | { kind: string; refId: string })[]
  }[]
}

export interface DrawingsWire {
  drawings: { id: string; member_id: string | null; media_key: string; scene_key: string | null; created_at: number; saved_at: number | null }[]
  more: boolean
}

export interface TodayChangesWire {
  entries: {
    id: string
    kind: string
    at: number
    text: string
    memberId: string | null
    name: string | null
    avatarKind: string | null
    avatarRef: string | null
    colour: string | null
    authorLabel: string | null
  }[]
}

// ── The twenty read by a page and answered `{}` until 2026-11-06 ─────────────────────
// Found by the recorder behind e2e/unknown-gets.json on the whole suite. Most of their
// fixtures are the empty calm default; the row types come from the handlers.

export interface CareLogWire {
  entries: {
    id: string
    carnetId: string
    at: number
    kind: string
    title: string
    note: string | null
    costCents: number | null
    businessId: string | null
    mediaKeys: string[]
  }[]
}
export interface ChoresLedgerWire {
  since: number
  ledger: {
    date: number
    choreId: string
    choreTitle: string
    choreColor: string | null
    helpers: { memberId: string | null; name: string | null; role: string; avatarKind: string | null; avatarRef: string | null; colour: string | null }[]
  }[]
}
export interface GuestLinksWire {
  links: {
    id: string
    kind: string
    target_key: string | null
    standing: number
    label: string | null
    created_at: number
    expires_at: number
  }[]
}
export interface GuestWhoamiWire {
  scope: string
  kind: string | null
}
export interface HomePinsWire {
  pins: { id: string; carnetId: string; kind: string; label: string; detail: string | null; mediaKey: string | null; sort: number }[]
}
export interface HomeProjectsWire {
  projects: {
    id: string
    kind: string
    title: string
    notes: string | null
    budget_cents: number | null
    color: string | null
    at: number | null
    recur_json: string | null
    recur_from: string | null
    lead_seconds: number | null
    last_done_at: number | null
    snoozed_until: number | null
    carnet_id: string | null
    subject_kind: string | null
    subject_id: string | null
    rotation_json: string
    current_idx: number
    last_done_by: string | null
    icon: string | null
    effort: number | null
    nextAt: number | null
    dueToday: boolean
    overdueSince: number | null
    snoozedUntil: number | null
  }[]
}
interface IntakePerson {
  firstName: string
  lastName: string
  nickname: string
  birthday: string | null
  gender: 'm' | 'f' | null
  email: string
  phone: string
  address: { street?: string; city?: string; state?: string; postalCode?: string; country?: string } | null
  notes: string
  photoKey: string | null
}
export interface IntakeWire {
  submissions: {
    id: string
    targetKey: string | null
    createdAt: number
    self: IntakePerson
    household: IntakePerson[]
    links: { aIndex: number; bIndex: number; type: string }[]
    pets: { name: string; species: string; photoKey: string | null; ownerIndex: number }[]
  }[]
}
export interface MealLeftoversWire {
  leftovers: { id: string; title: string; recipe_id: string | null; source_meal_id: string | null; created_at: number }[]
}
export interface NotesWire {
  notes: (BoardNote & { surface_at: number | null; updated_at: number | null; dismissed_at: number | null })[]
  more: boolean
}
export interface OperatorInviteWire {
  operators: { email: string; createdAt: number; isSelf: boolean }[]
}
export interface PostboxWire {
  messages: {
    id: string
    senderName: string
    text: string
    mediaKind: string | null
    mediaKey: string | null
    sceneKey: string | null
    createdAt: number
  }[]
}
export interface RecipeLovesWire {
  loves: { recipe_id: string; member_id: string }[]
}
export interface ReserveWire {
  reserve: { id: string; item: string; location_id: string | null; marked_at: number }[]
}
export interface ScheduleWire {
  blocks: {
    id: string
    memberId: string
    label: string | null
    startMin: number
    endMin: number
    weekdays: number[]
    holdsCar: boolean
    color: string | null
    weekInterval: number
    anchorDay: number | null
  }[]
}
export interface SeedWire {
  /** How many sample rows are still in the household: > 0 shows the examples banner. */
  count: number
}
/** Two faces: the ledger, and `?s=<id>`'s one share (`payload` is free-form, per kind). */
export type ShareWire =
  | { shares: { id: string; kind: string; label: string; createdAt: number; expiresAt: number | null }[] }
  | { kind: string; label: string; payload: unknown; sourceName: string | null }
interface SharedTrip {
  id: string
  owner_household_id: string
  title: string
  destination: string | null
  start_at: number | null
  end_at: number | null
  media_kind: string | null
  media_key: string | null
  colour: string
  notes: string | null
  invite_nonce: string
  position: number
  created_at: number
  updated_at: number | null
  members: { household_id: string; label: string; colour: string; role: string }[]
  myRole: string
}
/** Two faces: the list, and `?id=<id>`'s one trip. */
export type SharedTripWire = { trips: SharedTrip[] } | { trip: SharedTrip; myHouseholdId: string }
interface WeekFace {
  memberId: string | null
  name: string | null
  avatarKind: string | null
  avatarRef: string | null
  colour: string | null
}
export interface ThisWeekWire {
  today: number
  weekStart: number
  weekEnd: number
  ahead: {
    meals: { date: number; slot: string; title: string }[]
    events: { title: string; at: number; allDay: number; who: string | null }[]
    birthdays: { name: string; at: number; age: number | null }[]
    work: { at: number; label: string | null; who: string | null; face: WeekFace }[]
    projects: { title: string; at: number; color: string | null }[]
  }
  behind: {
    chores: { date: number; choreTitle: string; choreColor: string | null; helpers: WeekFace[] }[]
    routines: { name: string; who: string | null; face: WeekFace }[]
    projects: { title: string; color: string | null }[]
  }
}
export interface TripNotesWire {
  notes: {
    id: string
    trip_id: string
    category: string
    label: string | null
    text: string
    media_kind: string | null
    media_key: string | null
    scene_key: string | null
    member_id: string | null
    date: number | null
    position: number
    created_at: number
    updated_at: number | null
  }[]
}
export interface TripPackingWire {
  items: { id: string; trip_id: string; member_id: string | null; text: string; packed_at: number | null; position: number; created_at: number }[]
}

// THE MAP e2e/mocks.ts is typed against: route path → what its GET answers.
export type Wire = {
  'auth/me': AuthMeWire
  'a-regler': AReglerWire
  'ai-errors': AiErrorsWire
  board: BoardWire
  businesses: BusinessesWire
  car: CarWire
  carnets: CarnetsWire
  cercle: CercleWire
  chores: ChoresWire
  'day-notes': DayNotesWire
  deals: DealsWire
  drawings: DrawingsWire
  events: EventsWire
  'family-notes': FamilyNotesWire
  flyer: FlyerWire
  flyers: FlyersWire
  ghost: GhostWire
  habits: HabitsWire
  health: HealthWire
  household: HouseholdWire
  meals: MealsWire
  'meal-history': MealHistoryWire
  'meal-ideas': MealIdeasWire
  members: MembersWire
  month: MonthWire
  'pair/devices': PairDevicesWire
  pantry: PantryWire
  photos: PhotosWire
  recap: RecapWire
  'recipe-original': RecipeOriginalWire
  'recipe-tags': RecipeTagsWire
  recipes: RecipesWire
  remarks: RemarksWire
  routines: RoutinesWire
  'takeout/backups': TakeoutBackupsWire
  'today-changes': TodayChangesWire
  todos: TodosWire
  'todo-templates': TodoTemplatesWire
  transfers: TransfersWire
  trips: TripsWire
  'use-soon': UseSoonWire
  weather: WeatherWire
  wonder: WonderWire
  year: YearWire
  'care-log': CareLogWire
  'chores-ledger': ChoresLedgerWire
  'guest-links': GuestLinksWire
  'guest/whoami': GuestWhoamiWire
  'home-pins': HomePinsWire
  'home-projects': HomeProjectsWire
  tasks: TasksWire
  intake: IntakeWire
  'meal-leftovers': MealLeftoversWire
  notes: NotesWire
  'operator-invite': OperatorInviteWire
  postbox: PostboxWire
  'recipe-loves': RecipeLovesWire
  reserve: ReserveWire
  schedule: ScheduleWire
  seed: SeedWire
  share: ShareWire
  'shared-trip': SharedTripWire
  'this-week': ThisWeekWire
  'trip-notes': TripNotesWire
  'trip-packing': TripPackingWire
}
