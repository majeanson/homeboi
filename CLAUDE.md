# CLAUDE.md

Guidance for Claude Code in **Babillard** (`PlannerOrSomething/`, its own git repo; the `CLAUDE.md`
one level up covers the wider LAC ecosystem). This file is the **law**: how to write code here.
**[`STATE.md`](./STATE.md) is what to write next**: health numbers, the ranked backlog, and which
root docs still hold work. Update it in the same commit as the work it describes. A ledger entry is
a verdict from a moment, so **grep the claim in code before building on it**. `- [ ]` means exactly
one thing repo-wide: open work (the convention lives in STATE.md §2).

## What this is

A calm household command center for a cheap always-on wall tablet: today's agenda, shared lists,
chore rotation, « ce soir » (supper), kid routines, a kitchen/recipe planner. **Useful at home first,
calm by design**: no streaks, no points, no push, finite lists that empty. One React SPA + one
Cloudflare Worker (static assets + `/api/*`) + D1 + Workers AI + R2. UI copy is **FR-CA (Québécois)
first**, EN second. The planning docs (`bmad/`) were deleted 2026-09-17. Code comments still cite
their tags (`NFR-*`, `PRD C5`, `OD-*`, `bmad/08 E-36`) as **labels**, with the rationale written
beside them. The originals: `git log --diff-filter=D -- bmad/`, then `git show <sha>^:bmad/<file>`.

## Build by reuse (START HERE)

This codebase is mature: almost nothing is greenfield. Before writing, **read how the section
already works** (hub tabs `src/pages/{Board,Kitchen,Liste,Notes,Maison,Operator}.tsx`, settings
bodies `src/components/operator/*`), **find the primitive** (`COMPONENTS.md`, live at `/dev/kit` =
`src/pages/DevKit.tsx`), and **extend it rather than fork a copy**. Reuse the CSS class families in
`styles/*.css` (`@import` order IS the cascade: append, never reorder). A new shared component goes
into DevKit + COMPONENTS.md (+ the Guide if user-facing); `devkitParity.test.ts` enforces that.

| Need | Use | Where |
| --- | --- | --- |
| Text entry · a labelled control · a time of day | **`EditField`** · **`Field`** · **`TimeField`** (24 h) | `components/` |
| Search + pick an existing thing + free text | **`EntityCombobox`** | `components/EntityCombobox.tsx` |
| A list row · checklist row · row edit/delete · one icon button | **`Act`**+`Section` · **`CheckRow`**/`ListRow` · **`RowActions`** · **`IconButton`** (`label` required) | `components/` |
| Tap an item → detail peek | **`useEntityDetail()`** | `components/detail/*`, `lib/detail.ts` |
| Empty / status / chip / section header | **`EmptyState`** / **`StatusMessage`** / **`Chip`**+`ChipGroup` / **`SectionHeader`** | `components/` |
| A surface still loading · a read that failed | **`loadStateOf(q)`** / `<LoadState>` (Skeleton when the shape is known, else Loading) · **`LoadError`** (« Réessayer ») | `components/Fallback.tsx`, `LoadError.tsx` |
| Collapse a secondary group · sub-tabs · a value picker | **`Disclosure`** · **`SubTabs`** · **`Segmented`** | `components/` |
| A row of buttons/chips | **`Cluster`** (wraps) / **`Rail`** (scrolls; wires `useHScroll`) | `components/Layout.tsx` |
| Dialog · bottom sheet | **`Modal`** · **`Sheet`** (both own the back button via `useModal({history:true})`) | `components/`, `lib/useModal.ts` |
| A Réglages section · one setting row | **`OperatorSection`** · **`SettingsRow`** | `components/operator/` |
| Hub/scene header · feature map | **`HubHead`** / **`SceneHead`** · **`FeatureMap`** (the ONE taxonomy, `lib/guideContent`) | `components/` |
| ANY picture, avatar, mic, icon | **`Img`** (retry + `data-loaded`), `Avatar`, `VoiceButton`, `Icon`, `ZoomableImg` | `components/` |
| ANY task, add or edit | **`TaskForm`**; `taskTarget` picks the table, `lib/taskSave` is the only code that knows an endpoint | `components/forms/`, `lib/` |
| A task/subject's look · effort | **`LookPicker`** (inheritance = `lookOf`) · **`EffortDots`** | `components/` |
| Who am I today | **`MemberSwitcher`** wired to `useProfile` | `components/MemberSwitcher.tsx` |
| Confirm a destructive delete · undo a light one | **`useConfirm`** (the message says WHAT IS LOST) · the undo toast | `lib/confirm.tsx`, `lib/toast.tsx` |
| Land on a row from a link · where a search hit goes | **`useItemPulse()`** + `data-item` · **`landingFor`** | `lib/` |
| Drag/reorder · press-and-hold · « activity, don't drift » | **`usePointerDnd`** (never HTML5 drag) · **`useLongPress`** · **`pokeIdle()`** | `lib/` |
| A board card's place · « nothing to show » | **`WidgetGrid`** + `CardSlot` (`lib/boardCards`) · **`useReportEmpty`** | `components/board/`, `lib/` |
| Upload a blob to R2 | **`uploadMedia()`** / `useMediaUpload()` | `lib/uploadMedia.ts` |

## Conventions a feature MUST respect

Most of these are enforced: a `src/lib/*-rule.test.ts` grep guard or an AST rule in
`scripts/lint-rules.mjs` (oxlint). An exemption is an ALLOWED entry or an inline
`oxlint-disable-next-line … -- <reason>`, and the reason is the point.

| Concern | Do | Don't |
| --- | --- | --- |
| Any `/api/*` write | **`useWrite()`** (`lib/write.ts`): offline outbox, idempotency key, optimistic change. Its rejection: `.catch(writeFailed)`, `wrote(p)` when a follow-up assumes it landed, `writeOrNull(p)` | a raw `api()` write (`write-rule`) or a bare `.catch(() => {})` (`babillard/no-anonymous-catch`) |
| Any `/api/*` read | **`api()`** (`lib/api.ts`: CSRF, device token, X-Lang, X-Profile); a blob read is `fetch(imgUrl(key))` | a bare `fetch` (`babillard/no-bare-fetch`) |
| Server state | **TanStack Query**; shared keys in `lib/queryKeys.ts`, a page-local key as a file `const X_KEY` | a parallel store, or a key literal at a call site (`querykey-rule`) |
| Device role · presentation lens | **`useSurface()`** / **`useLens()`** named flags (`toddler`, `simple`, `teaches`, `acts`…) | branching on width or on the audience string (`surface-rule`, `lens-rule`) |
| Calm | no streak/points/badge/push/inventory, ever (`calm-tenets.test.ts` scans every migration) | a count, rank or quantity column |
| Backend endpoint | a handler under `functions/api/` wrapped in **`authed()`** **+** a row in `worker/routes.ts` `TABLE` (file path is not routing) | a hand-rolled auth guard |
| Workers AI · R2 upload · Browser Run | **`runModel()`** · **`uploadR2Media()`** · **`renderPage()`**: each charges the household's daily budget (`_lib/usage.ts`) | a raw `env.AI.run(`/`.put(`/`quickAction(` (`babillard/metered-door`) |
| Remove a row from a live-polled list | **`useDeferredRemoval(key)`**: hide now, hold the write behind the undo toast, un-hide only after a fresh frame. The commit RETURNS the write and lets it reject (a 404 = already gone) | `setQueryData` then defer, or `.catch` inside the commit |
| An optimistic create (list, todos, tasks) | paint the row under **`newRowId()`** and send it; the endpoint keeps it (`rowIdFrom`). A delete that misses is a 404 (`deleteOwnRow`) | a stand-in id, or a vacuous « ok » |
| A screen where the user types | be a **`.scene`** (`FormScene`/`SceneHead`), or `.vv-fit` + `.vv-slack` (`core.css` « Keyboard fit ») | shrinking the shell under `.kb-open` (`keyboard-fit.test.ts`) |
| A field taking focus by itself | only when the tap that revealed it asked to type (a ＋, a ✏️, a rename dialog) | focusing because a screen/sheet OPENED (`jsx-a11y/no-autofocus`) |
| Overlays | a tier from the `--z-*` scale in `core.css` | a literal `z-index` ≥ 10 (`tokens.test.ts`, `layer-order.test.ts`) |
| A container holding buttons | a plain `<div onClick>` | `role="button"` around buttons (`nested-interactive.test.ts`) |
| Format a date/time/amount | the cached helpers (`lib/format.ts`, `lib/money.ts`; Worker `_lib/askContext.ts`) | `new Intl.*` inline (`babillard/no-intl-construction`; ~100 µs each) |
| Day arithmetic · which zone | **`addLocalDays`** (`lib/localDay.ts` / `_lib/ids.ts`, both wrapping `shared/localDay.ts`); `authed()` already put the household's zone in scope | `± 86400` (DST days are 23/25 h), or a hard-coded zone |
| Code both SPA and Worker need | ONE copy in **`shared/`** (both tsconfigs, vitest, knip, lint) | a « MIRRORED » twin kept in lockstep by a test |
| « Does this query hold data? » | `state.data !== undefined` | `status === 'success'` (a failed poll keeps the last frame) |
| A guest | `isGuest()` hides **writes** only | gating a device-local pref (theme, lens, layout) with it |

## Commands

```bash
npm run dev          # Vite on :5173, /api proxied to :8787   · npm run cf:dev = full stack (wrangler on :8787)
npm run build        # tsc -b then vite build → dist/          · npm run typecheck · npm run lint (oxlint) · npm run knip
npm test             # vitest (unit; one file: npx vitest run <path>, one test: -t "name")
npm run test:d1      # the Worker in workerd against a real D1 + R2 + DO; needs dist/
npm run e2e          # Playwright, every /api/* stubbed · npm run e2e:ci = CI's shape (workers 1, retries 0)
npm run db:migrate:local / db:migrate:prod · npm run deploy
```

On-demand harnesses (`e2e:sw`, `e2e:matrix`, `e2e:stranger`, `e2e:flipp`, `perf:door`) document
themselves in their spec headers. **CI** (`ci.yml`: typecheck → lint → test → build → d1 → bundle)
gates the migrate + deploy on `main`; **E2E** chains off it and never blocks a deploy. **Trust CI;
don't run the whole e2e suite locally.** A local run is weaker (4 workers, a retry): when it says
« failed », read WHICH test before calling it flaky, and run `e2e:ci` before pushing shared
machinery. **Push straight to `main`**: no PR branches; fix a red build forward. Concurrent sessions
share this tree: stage explicit paths and verify `HEAD` after committing. `DEPLOY.md` is the source
of truth for deployment. Node 26.

## Architecture

- **One Worker** (`worker/index.ts`): non-`/api/*` → `env.ASSETS` (the SPA, unknown paths →
  `index.html`); `/api/*` → `worker/routes.ts` → a handler in `functions/api/` (they are still
  Pages-Function shaped; the Worker adapts the context and runs the CSRF gate + error boundary).
  `GET /api/live` upgrades to the `RealtimeHub` Durable Object.
- **Auth**: `authed(handler, scope?)` (`_lib/route.ts`) resolves the **Actor**: an operator
  session cookie, a kiosk device token, or a read-only time-boxed **guest** token (any non-GET from
  a guest is a 403, centrally). `'operator'` scope rejects kiosks. `SESSION_SECRET` ≥ 32 chars.
- **Migrations** (`functions/db/migrations/NNNN_*.sql`) are forward-only and filename-locked. New
  tables: `created_at`/`updated_at`/`deleted_at`; `status` = workflow state, `status_code` = HTTP;
  `colour` (never `color`); `position` for order; media = `media_kind`+`media_key` (set together,
  the old blob freed on replace); a soft member ref is nullable with no FK and a comment naming it;
  `kind` for a sub-type; JSON columns `NOT NULL DEFAULT '[]'`/`'{}'`; a 5th+ household pref goes to
  `household_preferences`. A new table joins the demo sweep inventory (`demoHousehold.test.ts`).
- **Optional bindings** (`AI`, `PHOTOS`, `REALTIME_HUB`, mail, `INVITE_CODE`) degrade: AI unset →
  manual capture; R2 unset → media controls hide; DO unset → clients poll. Never assume one.
- **Frontend**: `lib/api.ts` is the only path to `/api`; TanStack Query owns server state (realtime
  only *nudges* invalidation; polling owns correctness); routing in `src/router.tsx` (six hub tabs
  in `HubLayout`; `/cercle/*` and `/routine/*` scene paths are frozen, shared links use them).
  **Surface** (`kiosk`/`mobile`) and **audience** (`parent`/`toddler`; `?kid=1` locks a kiosk) are
  presentation, never permissions. i18n: `typeof FR` is the parity contract; Réglages copy lives in
  `i18n.operator.ts`; `scripts/check-bundle.mjs` caps the eager FR chunk (it only comes down).
- **Demo**: `POST /api/demo` mints a per-visitor throwaway **sandbox** household (`households.is_sandbox`,
  TTL-swept; past the cap it falls back to a read-only showcase guest link). « Garder ma
  maisonnée » (`/api/demo/claim`, `/garder`) keeps it. Privacy hides (mots, pins, care log) stay
  hidden from every guest, because an operator can share a showcase link to their own household.
- **Offline**: the SW precaches the shell; the Query cache persists to IndexedDB; writes queue in
  the outbox and replay with their idempotency key. See [`OFFLINE.md`](./OFFLINE.md).

## Jargon

Words on screen are governed by `src/lib/glossary.ts` (both languages; `glossary.test.ts` ratchets
the losing spellings). Hub tabs in canonical order, each with one colour (`SECTION_TINT`):
**Board** `/board` (Le babillard: a widget space of cards in zones, hold a card to edit) ·
**Kitchen** `/kitchen` (La cuisine: the supper plan, recipes, « running low », flyers) · **Liste**
`/liste` (ONE active shared list; « Vider les cochés » logs the buys) · **Notes** `/notes` (family
notes, voice memos, drawings) · **Maison** `/maison` (routines + the cercle: people, pets, groups,
businesses, carnets) · **Réglages** `/settings` (Découvrir + six themed tabs, Comprendre/Régler;
the pill map is `SETTINGS_TREE` in `lib/settingsNav.ts`; link a section with `?focus=<key>`).

| Term | Means |
| --- | --- |
| Operator · kiosk · guest | the signed-in owner (full access) · a paired tablet (device token) · a read-only time-boxed link |
| Capture spine | type-or-speak → Workers AI routes it to event/task/list/pantry/meal/note (`AddSheet`, the ＋ FAB) |
| Garde-manger · running low | meal planning that fills the list; a low/out FLAG, never an inventory count |
| Ghost | opt-in purchase tracking: buying never auto-enrolls an item, and auto-learning stays closed |
| Deal ↔ item | a flyer deal rides a generic list line (`itemNameFromFlyer`); never rename it into a specific one |
| One task table | every task is a row of `tasks` (0150/0162); gestures in `_lib/taskGestures.ts` behind `/api/tasks`; `todos` holds departure checklists |
| Mots · fridge memos | board notes (`notes`), optionally with an audio/drawing/photo attachment |
| Cook mode · cashier mode | full-screen recipe (« Il en manque » flags pantry-low) · in-store list/price-match |
| Recipe sections | inline `## Title` lines inside the flat ingredient/step arrays; every iterator skips them |
| Discovery | guide cards (**32** guide cards today against a **~32 merge-first ceiling**), help hints, tours, `?card=&point=&focus=&plus=` links: read `DISCOVERY.md` first |
| Calm mode | softens kid-routine redo friction only; the structural calm guarantees are not toggleable |

Before adding an entity or action, walk **`PARITY.md`** (feature × cross-cutting dimension, Part 5
checklist, Part 6 gate) and **`ACTIONS.md`** (every action × entry point). A surface stays lean and a
composer stays generous: **`LEAN.md`**.

## Standing rules

- **Every UI change works on a phone, a tablet (toddler mode too) and a desktop.** A row of controls
  is a `Cluster`/`Rail`, never a hand-rolled flex row or a fixed `flex-basis` (`field-fit.test.ts`);
  never add `overflow-x:hidden` to mask a wide row (the e2e overflow specs check per-child bounds).
  A hidden-scrollbar row gets `useHScroll()`; a swipe or long-press gets a mouse/keyboard mirror.
- **A new Réglages setting stacks into an existing pill** (15 pills, `SETTINGS_TREE`), never a new one.
- **A new guard is run against the bug it was written for before it is trusted**: plant the
  violation, watch it fail, restore, and check that the plant actually landed. A green guard alone
  proves nothing (STATE.md §5 has the story).
- **Measure with `boxOf()` in e2e**, never `(await x.boundingBox())!`.
  **The sweep is done (2026-09-09): 0 bare call sites are left**; `docCounts.test.ts` keeps it so.
- `wrangler.toml`'s `database_id` is the original author's DB. Don't commit to the parent
  `FULL_LIFE_AS_CODE` folder (not a git repo).
