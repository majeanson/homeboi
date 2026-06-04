# PRD — Babillard

> BMad artifact 2 of 3. PM altitude: personas, requirements, scope, epics.
> Builds on [`01-brief.md`](./01-brief.md). The *how* lives in
> [`03-architecture.md`](./03-architecture.md).

---

## Personas

| Persona | Device | Auth | Does |
| --- | --- | --- | --- |
| **Operator** | phone / laptop | full login (HMAC cookie) | plans the week, owns the board, manages members + billing |
| **Adult / older kid** | wall tablet, own phone | none (board capability URL) | ticks list, marks chore, adds a capture |
| **Pre-reader (3 y/o)** | wall tablet | none, kid view | runs their picture routine, taps cards done |

## The spine: one capture, routed by intent

Everything funnels through a single **capture bar** (typed, or spoken via
Whisper). One small LLM call classifies the text and routes it. This is the
only place AI is essential; the rest of the app is plumbing around it.

```
input:  "souper spaghetti jeudi"   (text, lang, boardId)
classify (Workers AI, llama-3.1-8b, JSON-forced)
output: { type: "meal", payload: { slot: "supper", date: <thu>, title: "spaghetti" } }
route:  → meals table → board "ce soir" card → missing staples → grocery list
```

Intent types: `event | task | list-item | pantry-low | meal | note`.
On parse failure, fall back to `note` (never lose the capture) and surface
it for one-tap correction.

## Functional requirements, by surface

### A. The wall board (kiosk, glanceable)

- **A1** Show today's merged agenda (events across members).
- **A2** "Ce soir" row: tonight's meal + who cooks + whose turn for dishes.
- **A3** Shared list, tickable from any device on the board URL; updates
  propagate within one poll interval.
- **A4** Chore rotation with per-member credit; tap-to-complete rotates to
  the next person.
- **A5** Time + weather; **dim at night** via the day/night theme.
- **A6** "Last synced HH:MM" stamp so a stale board reads as stale, not
  broken (offline-tolerant).
- **A7** Capture bar always reachable: type or hold-to-talk.

### B. The kitchen module (Garde-manger)

- **B1** Weekly meal plan: 7 supper slots, fill by drag or by capture.
- **B2** "Low / out" list only — **no inventory count** (brief tenet 3).
  Mark low by voice at the fridge; it drops onto the grocery list.
- **B3** Meal plan → grocery list: planning a meal pushes its missing
  staples to the shared list automatically.
- **B4** One AI button: **"qu'est-ce qu'on mange?"** suggests a supper from
  what's planned-around and what's low. On-demand, one call, never on a loop.

### C. The kid view (pre-reader)

- **C1** A picture routine: ordered big cards (brosse les dents, habille-toi,
  déjeuner), each an icon/photo, no required text.
- **C2** Tap a card → it gets a **deterministic, identical** done-state every
  time (brief tenet 1). No variable reward, no score.
- **C3** On-device narration (browser SpeechSynthesis) reads each card aloud
  on tap/focus. Zero Neurons, nothing leaves the device.
- **C4** The routine **empties when finished** and shows a calm "done for
  now" state. No "do it again" hook.
- **C5** Switching into kid view is a deliberate adult action (a corner
  long-press), so a toddler can't wander into billing.

### D. Operator surfaces (phone/laptop, logged in)

- **D1** Manage members (name, avatar color/photo, is_child flag).
- **D2** Build/edit the week: events, chores + rotation rule, meal plan.
- **D3** Manage the board's kiosk access (see architecture: auth decision).
- **D4** Billing (Stripe), tier management.

## Non-functional requirements

### Anti-addiction (testable, enforced)

These are NFRs, not vibes. A test asserts each.

- **NFR-CALM-1** No streak counter, points balance, or badge exists in the
  schema or UI.
- **NFR-CALM-2** Completion feedback is deterministic: same animation/sound
  for the same action, no randomized or escalating reward.
- **NFR-CALM-3** The app sends **zero** push notifications. No service-worker
  `push` handler ships.
- **NFR-CALM-4** No infinite/auto-loading feed; every list is finite and
  empties.

### Toddler accessibility

- **NFR-KID-1** Kid-view touch targets ≥ 64×64 px.
- **NFR-KID-2** No kid-view action requires reading; icons + audio carry
  meaning.
- **NFR-KID-3** Contrast and motion meet WCAG; motion respects
  `prefers-reduced-motion`.

### The rest

- **NFR-PRIV-1** All AI runs on Workers AI in-network; no third-party
  processor for family data (Loi 25).
- **NFR-PERF-1** Board first paint usable on a low-end tablet; render loop
  does **zero** AI calls (paints cached D1 only).
- **NFR-COST-1** AI is user-triggered or weekly-scheduled only; stays inside
  the Workers AI free Neuron allocation under normal household use.
- **NFR-DEGRADE-1** With the `[ai]` binding unset, capture falls back to a
  manual type-picker and the rest of the app works (graceful-degrade, like
  the portal's optional bindings).
- **NFR-OFFLINE-1** Board tolerates wifi loss: cached render + stale stamp.

## Tiers

| | Gratuit | Maisonnée (paid) |
| --- | --- | --- |
| Boards | 1 | several |
| Capture | typed | typed **+ voice (Whisper)** |
| Kitchen | meal plan + manual list | **meal → auto grocery list**, "qu'est-ce qu'on mange" |
| Recap | — | weekly recap + next-week meal pre-fill |
| Kid view | yes | yes |

Note: **the calm is never paywalled.** No tier adds notifications, streaks,
or upsell pressure. Paid = depth, not dopamine.

## v1 cut line

Prove the spine before the depth. The intent-router exists from day one, so
later surfaces are additive, not a rebuild.

- **v1** — board shell (A1–A7), typed capture routing to
  `event/task/list/meal`, kid view (C1–C5), multi-tenant, freemium gate.
- **v1.1** — Whisper voice capture; weekly recap.
- **v1.2** — Garde-manger depth: meal → auto grocery list (B3),
  "qu'est-ce qu'on mange" (B4), per-member chore credit.

## Epics

1. **Tenancy + auth shell** — host-routed households, operator login, member
   model. (Ports portal patterns.)
2. **Capture spine** — capture bar UI, intent-router endpoint, routing to
   each table, note-fallback + correction.
3. **The board** — zones A1–A7, poll + ETag, offline stale stamp.
4. **Kid view** — picture routines, deterministic done-state, on-device
   narration, the calm NFR test suite.
5. **Garde-manger** — meal plan, low/out list, meal→list flow, the one AI
   suggestion button.
6. **SaaS** — Stripe billing, tier gates, board kiosk access.
7. **Showcase wiring** — seed it into the portal `/projects` gallery + a
   `*.feature.json`, like Dungeon Depths.
