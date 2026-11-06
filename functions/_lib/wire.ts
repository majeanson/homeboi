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
// builds a `const wire: XWire = {…}` and returns `ok(wire)`, so a key added on one side
// is a compile error on the other.

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
// What holds them: the FIXTURE side is held by tsc (`ROUTES: Partial<Wire>` in
// e2e/mocks.ts). The HANDLER side is not yet. Only `health` builds `const wire: HealthWire`;
// the others still `ok({...})` an untyped object, because this pass did not touch
// production handlers. A handler that grows a key will not fail tsc until it adopts its
// interface the way health.ts did. `unknown[]` marks a list no fixture has a row for.

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
  household?: { id: string; name: string; tier: string }
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
  age?: number
  gift_ideas?: string | null
}
/** `upcoming` mixes event rows with derived birthdays, which have no event columns. */
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
export interface BoardChore {
  id: string
  title: string
  rotation_json: string
  current_idx: number
  last_done_at: number | null
  color: string | null
  recur_json: string | null
  recur_start: number | null
  lead_seconds: number | null
  announce_evening: number | null
  created_at: number
  helpers: { name: string; role: string }[]
}
export interface BoardChoreInstance {
  id: string
  title: string
  color: string | null
  at: number
  who: string | null
  who_id: string | null
}
export interface BoardHomeInstance extends BoardChoreInstance {
  soon: boolean
  team: string[]
  carnet_id: string | null
  recurring: boolean
}
export interface BoardTodo extends BoardChoreInstance {
  soon: boolean
  team: string[]
  announce_evening: boolean
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
  label: string
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
export interface BoardWire {
  syncedAt: number
  scope: string
  members: MemberRow[]
  today: BoardEvent[]
  work: BoardWork[]
  tomorrow: BoardEvent[]
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
  chores: BoardChore[]
  choresToday: BoardChoreInstance[]
  choresUpcoming: BoardChoreInstance[]
  homeToday: BoardHomeInstance[]
  homeUpcoming: BoardHomeInstance[]
  homeOverdue: BoardHomeInstance[]
  todos: BoardTodo[]
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
export interface MealHistoryWire {
  days?: MealRow[]
  nextBefore?: number | null
  dishes?: { title: string; recipe_id: string | null; last_at: number }[]
}

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
  notes: { id: string; date: number; text: string; member_id: string | null }[]
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
    start_at: number
    end_at: number
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
    facts: Record<string, string> | null
    installedAt: number | null
    lifespanMonths: number | null
    linkId: string | null
    notes: string | null
    sort: number
  }[]
  soon: unknown[]
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
    timers: Record<string, unknown>
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
  recur: Record<string, unknown> | null
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
  marks: { habit_id: string; day: number; member_id: string }[]
  today: number
}

export interface MonthWire {
  events: {
    id: string
    title: string
    at: number
    all_day: number
    member_id: string | null
    day: number
    birthday?: boolean
    age?: number
    end?: number
    work?: boolean
    color?: string | null
    holds_car?: number
  }[]
  meals: { id: string; slot: string; title: string; cook_member_id: string | null; day: number; is_leftover?: number }[]
  chores: { id: string; title: string; color: string | null; who: string | null; day: number }[]
  dayNotes: { id: string; text: string; member_id: string | null; day: number }[]
  todos: { id: string; title: string; member_id: string | null; day: number; section: string | null }[]
  homeProjects: unknown[]
  trips: unknown[]
  tripPlans: unknown[]
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
  transfers?: unknown[]
}

export interface YearWire {
  birthdays: { id: string; name: string; day: number; age: number; memberId?: string }[]
  events: { id: string; title: string; day: number }[]
  upkeep: { id: string; kind: string; title: string; color: string | null; day: number }[]
  life: { carnetId: string; name: string; color: string | null; day: number }[]
  trips: { id: string; title: string; colour: string | null; start_at: number; end_at: number }[]
}

export interface MembersWire {
  members: MemberFull[]
}

export interface PairDevicesWire {
  devices: { id: string; label: string | null; last_seen_at: number | null; created_at: number }[]
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
  reserveLocations: string[] | null
  cars: { id: string; name: string; color: string }[] | null
  aisleOrder: string[] | null
  aisleOverrides: Record<string, string>
  aiEnabled: boolean
  schoolYear: Record<string, unknown> | null
  wifiSsid: string | null
  wifiPassword: string | null
  houseRules: string | null
  binDay: number | string | null
}

export interface CerclePet {
  id: string
  name: string
  species: string | null
  breed: string | null
  photoKey: string | null
  colour: string | null
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
  address: string | null
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
    servicedCarnets: unknown[]
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

export interface GhostWire {
  ghosts: { key: string; label: string; status: string; cadenceDays: number | null; lastAt: number | null; count: number }[]
  staples: unknown[]
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
    amountCents: number
    recur: { freq: string; interval: number }
    anchorAt: number
    shares: Record<string, number>
    catchup: { behindMemberId: string; gapCents: number; asOf: number; termEnd: number } | null
    colour: string | null
    position: number
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
    memberId: string
    sentAt: number
    lines: { kind: string; planId?: string; dueAt?: number; amountCents: number }[]
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
  signals: { kind: string; key: string; label: string; sub?: string; at?: number; href: string }[]
}

export interface CarSpan {
  start: number
  end: number
  label: string
  holderId: string | null
}
export interface CarWire {
  cars: { id: string; name: string; color: string }[]
  primaryCarId: string
  hasSchedule: boolean
  now: number
  today: number
  status: { free: boolean; until?: number; span?: CarSpan; committed?: boolean }
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
      carId: string
      passengers: string[]
      memberId: string | null
      contactId: string | null
      contactName: string | null
      businessId: string | null
      businessName: string | null
      conflict: boolean
    }[]
    override: Record<string, unknown> | null
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
  }[]
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
  drawings: { id: string; member_id: string | null; media_key: string; scene_key: string | null; created_at: number }[]
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
// Found by the recorder behind e2e/unknown-gets.json on the whole suite. Same method as
// above. Most of their fixtures are the empty calm default, and where the sample was empty
// too the rows stay `unknown[]` until a fixture has one.

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
  ledger: unknown[]
}
export interface GuestLinksWire {
  links: unknown[]
}
export interface GuestWhoamiWire {
  scope: string
  kind: string | null
}
export interface HomePinsWire {
  pins: unknown[]
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
    nextAt: number | null
    dueToday: boolean
    overdueSince: number | null
    snoozedUntil: number | null
  }[]
}
export interface IntakeWire {
  submissions: unknown[]
}
export interface MealLeftoversWire {
  leftovers: { id: string; title: string; recipe_id: string | null; source_meal_id: string | null; created_at: number }[]
}
export interface NotesWire {
  notes: (BoardNote & { surface_at: number | null; updated_at: number | null; dismissed_at: number | null })[]
}
export interface OperatorInviteWire {
  operators: { email: string; createdAt: number; isSelf: boolean }[]
}
export interface PostboxWire {
  messages: unknown[]
}
export interface RecipeLovesWire {
  loves: { recipe_id: string; member_id: string }[]
}
export interface ReserveWire {
  reserve: unknown[]
}
export interface ScheduleWire {
  blocks: {
    id: string
    memberId: string
    label: string
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
export interface ShareWire {
  shares: unknown[]
}
export interface SharedTripWire {
  trips: unknown[]
}
export interface ThisWeekWire {
  today: number
  weekStart: number
  weekEnd: number
  ahead: { meals: unknown[]; events: unknown[]; birthdays: unknown[]; work: unknown[]; projects: unknown[] }
  behind: { chores: unknown[]; routines: unknown[]; projects: unknown[] }
}
export interface TripNotesWire {
  notes: unknown[]
}
export interface TripPackingWire {
  items: unknown[]
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
