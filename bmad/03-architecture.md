# Architecture — Babillard

> BMad artifact 3 of 3. Architect altitude: stack, data, the AI contract,
> and the open decisions called out in the brief. Builds on
> [`01-brief.md`](./01-brief.md) and [`02-prd.md`](./02-prd.md).

---

## Stack

Deliberately the [marc-portal](../portal) stack, so every pattern Marc
already runs at 11pm carries over and the result drops into the portal
showcase with no new ops surface.

- **React 19 + Vite** SPA → **Cloudflare Pages**.
- **Pages Functions** back `/api/*`.
- **D1** (SQLite) for state; **R2** (optional) for member photos / routine
  card images.
- **Workers AI** (`[ai]`) for the capture intent-router and the weekly
  recap / meal suggestion. Nothing else.
- **Stripe** for billing; **Resend** for the few transactional emails
  (magic link, receipt).
- **Multi-tenant** at the host level via a `_middleware.ts` that resolves
  `Host` → household, same shape as the portal's `resolveTenant`.
- Boring tech: no state lib, no CSS framework, single design-token stylesheet.

## Why mirror the portal instead of starting clean

Two reasons. First, the portal's hard-won patterns (HMAC cookie + double-
submit CSRF, capability-token share URLs, graceful-degrade optional
bindings, forward-only D1 migrations, the prebuild static-JSON pipeline) are
exactly what this app needs, and re-deriving them is wasted nights. Second,
shipping on the same stack is what lets Babillard appear in the portal's
`/projects` gallery as a live, in-network, Loi-25-clean SaaS — the missing
palette piece.

## Data model (D1, sketch)

Forward-only numbered migrations, additive, like the portal.

- **households** — the tenant. `id`, `name`, `status`, `tier`,
  `stripe_customer_id`.
- **household_domains** — `host` → `household_id` (host routing).
- **members** — `id`, `household_id`, `display_name`, `avatar_kind`
  (color | photo), `avatar_ref`, `is_child` (bool).
- **captures** — raw append-only log: `id`, `household_id`, `raw_text`,
  `source` (text | voice), `resolved_type`, `created_at`. Audit + lets a
  misroute be re-classified without losing the original words.
- **events** — `id`, `household_id`, `member_id?`, `title`, `start_at`,
  `all_day`.
- **tasks** (chores) — `id`, `household_id`, `title`, `rotation_json`
  (ordered member ids), `current_idx`, `last_done_at`, `last_done_by`.
- **list_items** — shared list incl. groceries: `id`, `household_id`,
  `text`, `source` (capture | meal | pantry-low | manual), `checked_at?`.
- **meals** — `id`, `household_id`, `date`, `slot`, `title`, `cook_member_id?`.
- **pantry_low** — *only* low/out, never inventory: `id`, `household_id`,
  `item`, `marked_at`. A meal-plan or capture references staples; "low" ones
  flow into `list_items`.
- **routines** — kid visual schedule: `id`, `household_id`, `member_id`,
  `name`, `cards_json` (ordered `{icon|photo, label, narration}`).
- **routine_runs** — per-day completion: `id`, `routine_id`, `date`,
  `done_card_idx_json`. Resets daily (the day empties).
- **kiosk_tokens** — board access; shape depends on the auth decision below.

**Note what's absent:** no `streaks`, no `points`, no `badges`, no
`push_subscriptions` table. NFR-CALM-1 and NFR-CALM-3 are enforced by the
schema having nowhere to put them.

## The AI contract

### Intent-router (the one essential call)

- **Model:** `@cf/meta/llama-3.1-8b-instruct` (fast, cheap, JSON-capable).
- **Call:** few-shot system prompt in FR-CA + EN, force JSON output, validate
  against the intent union. One inference per capture.
- **Output:** `{ type, payload }` over the union
  `event | task | list-item | pantry-low | meal | note`.
- **Failure:** any parse/validation miss → `type: "note"`, store the raw
  text, surface a one-tap "what was this?" picker. We never drop a capture.
- **Voice:** `@cf/openai/whisper` transcribes, then the *same* router runs.
  Voice and text share one code path.

### Weekly recap + meal pre-fill

- llama-3.1-8b, **1×/week/board**, scheduled (Cron Trigger). Summarizes the
  week and proposes next week's supper slots for one-tap accept.

### Narration is NOT Workers AI

Kid-view read-aloud uses the **browser SpeechSynthesis API** — on-device,
zero Neurons, nothing leaves the tablet. This is both a cost and a privacy
win (NFR-PRIV-1, NFR-COST-1).

### Neuron budget

Every AI touch is user-triggered or weekly. The **render loop does zero
inference** (NFR-PERF-1). Under normal household use this sits well inside
the Workers AI free daily allocation. If it ever didn't, the cap is a
product signal (someone's hammering capture), not a silent overage.

### Graceful degrade

`[ai]` unset → capture bar shows a manual type-picker, voice button hides,
recap/suggestion endpoints return 503 with a clear message. The board,
lists, chores, meals, and kid view all keep working. Same pattern as the
portal's optional R2/AI/Stripe bindings (NFR-DEGRADE-1).

## Sync model: poll + ETag (not realtime)

v1 polls `/api/board/:id` on an interval with `If-None-Match`; 304s are
cheap and a stale paint plus the "last synced" stamp covers wifi blips
(NFR-OFFLINE-1). This matches the boring-tech mandate and the
`prefer-simple-standard` call. Durable-Object push is a documented **v2**
upgrade, opened only if cross-device lag is felt in practice.

## Open decisions (carried from the brief, by request)

### D-1 Kiosk auth — capability URL vs device pairing

The tablet must reach its board without a per-boot login.

| Option | How | Pro | Con |
| --- | --- | --- | --- |
| **A. Capability URL** | long-lived `/board/<token>`, reuse the portal's `/share/<id>` token pattern | almost free to build; battle-tested | token in URL/history; rotation = re-pair every device |
| **B. Device pairing** | tablet shows a 6-digit code, operator approves from phone → scoped device session | revocable per device; no secret in URL | new flow, new table, more to build |

**Recommendation:** ship **A** for v1 (fastest path, proven code), design
the `kiosk_tokens` table so **B** can be added without migration pain
(include a nullable `device_label` and `revoked_at` from the start). Marc
decides; this is the one auth call left open on purpose.

### D-2 Shared-board write identity

Chore credit needs *who* without a login. Plan: lightweight **"pick your
face"** member profiles (avatar color/photo, `is_child`), selected with one
tap before a write that needs attribution. No password. The board capability
grants write; the face just stamps it.

### D-3 Offline write reconciliation

v1: writes require connectivity (optimistic UI, queued retry on reconnect,
last-write-wins on the few conflictable fields). Full offline-first is out
of scope; the stale-read path (NFR-OFFLINE-1) covers the common case.

### D-4 Naming

Working name **Babillard** (Québécois for corkboard) for the board;
**Garde-manger** for the kitchen module. Umbrella vs surface-names is a
marketing call, not an architecture one.

## What ships first (maps to PRD v1)

Tenancy shell → capture spine (text) → board zones → kid view → freemium
gate. The intent-router is in from commit one; voice, recap, and the
meal→list depth bolt on after, because they all hang off the same capture
endpoint and the same tables.

## Showcase wiring

When v1 is live, seed it into the portal `/projects` gallery the way Dungeon
Depths was (a `shipped` session + a `showAsCurrentBuild` advancement
carrying the build URL), and co-locate a `*.feature.json` so `/meta` picks
it up. That closes the loop: the SaaS that fills the palette gap is itself
documented in the LAC system that the palette is built on.
