# Design note — Kid Mode as a layer + the Calm toggle

> Written after the functional prototype scaffold landed (board, kitchen, kid
> view, device pairing). Two product directives from Marc reshape how "kid view"
> and the anti-addiction tenets work. This note captures the decisions and the
> tradeoffs so the code can diverge from the original brief *on purpose*, not by
> drift. Supersedes PRD `### C` and touches brief tenet 1 + `NFR-CALM`.

---

## Where this came from

The first prototype shipped `/kid` as a **separate destination**: a routines
checklist that collapses to a calm "C'est fini ! Bravo." screen when every card
is done, with no way back (by design — brief tenet 1, PRD C4). In testing this
read as a dead-end: open kid view, see only the congratulations, nothing else.

Two directives followed:

1. **Kid Mode is a presentation layer, not a tab.** Every parent-facing tab
   (Board, Kitchen, …) should have two renderings of the *same data*: the normal
   detailed UI, and a kid rendering (big buttons, strong colour, tap-to-read-
   aloud). A parent previews each tab's kid view next to settings, to see and
   tune exactly what the child will see on the wall tablet.
2. **Add an "anti-addiction" toggle.** Make the calm behaviours a setting
   (default ON) instead of a hardcoded absolute, so a household can opt out of
   the "stop when done / no redo" friction.

---

## Decision 1 — Kid Mode becomes a cross-cutting presentation mode

`/kid` stops being a route that owns "the kid feature." Instead:

- A **global mode** (`kidMode: boolean`), same shape as the existing
  `LangContext` in `main.tsx`: React context + `localStorage['babillard-kidmode']`,
  plus a URL param (`/board?kid=1`) so a kiosk can boot locked into it.
- Each tab reads `useKidMode()` and renders normal **or** kid layout off the
  same data. Cheapest first cut: a `.page--kid` root class that scales type,
  enlarges hit targets (≥64px, `NFR-KID-1`), and boosts contrast; richer later:
  dedicated kid sub-components per section.
- **Tap-to-read-aloud**: promote the `speak()` SpeechSynthesis helper already in
  `KidView.tsx` to a shared `useSpeak()` hook; any element with a narration
  speaks on tap. Stays **zero-Neuron, on-device** — honours brief tenet 2 and
  architecture "Narration is NOT Workers AI".
- **Parent preview**: a per-tab "👁 Voir en mode enfant" control in the normal
  UI flips just that tab to kid rendering for tuning.
- The old routines screen folds in as **the Board's routine section in kid
  mode** — no longer a standalone page.

Net: mostly reorganising pieces that already exist (the speak helper, the lang-
context pattern, the routine cards), not new infrastructure.

---

## Decision 2 — The Calm toggle (formerly "anti-addiction")

Make the calm behaviour a per-household setting, **default ON**. When ON, the
product behaves as the brief describes. When OFF, the friction relaxes.

### What the toggle actually controls (scoped to what exists)

A toggle can only flip behaviour that is built and reversible. Be honest about
the boundary:

| Tenet / NFR | Toggleable? | Behaviour when Calm = OFF |
| --- | --- | --- |
| C4 "stop when done, no redo" | **Yes** | Kid cards stay visible after completion; re-tappable; no dead-end screen |
| NFR-CALM-2 deterministic feedback | **Yes (careful)** | Could allow a slightly richer completion cue — still no variable/escalating reward unless we decide to build one |
| NFR-CALM-1 no points/streaks in schema | **No (not built)** | Would require *building* a scoring system — a separate, much larger product decision, explicitly out of scope here |
| NFR-CALM-3 zero push | **No (not built)** | Would require push infra — out of scope |
| NFR-CALM-4 finite lists | **No (structural)** | Lists are finite by data shape; nothing to toggle |

So the toggle, as scoped now, is really a **"kid routine: stop when done vs.
keep showing"** switch, named "Calm Mode" / "Mode calme" for the parent. It does
**not** turn the app into a dopamine loop — that capability isn't in the schema,
and adding it is a deliberate future decision, not a side effect of this toggle.

### Default, storage, ownership

- **Default ON.** A fresh household gets the calm behaviour; opting out is a
  conscious parent action.
- **Storage — open (see below).** Per-device `localStorage` (matches `lang` /
  `kidMode`, zero migration, fast) vs per-household column in D1 (a real policy
  that follows the family across devices). Lean: localStorage for the prototype,
  promote to a `households.calm_mode` column when settings get persisted server-
  side.
- Set from **Operator → Settings** (a parent action), not reachable from the
  kiosk surfaces.

---

## Tenet reconciliation (the honest part)

Brief tenet 1 is filed under "**load-bearing, not preferences** … the lines
that, if crossed, make it a different and worse product," and `NFR-CALM-1..4`
are written as *enforced, tested* invariants. Decision 2 **softens that stance**
for one of them (C4): calm-when-done becomes a default, not an absolute.

This is an accepted, eyes-open change because:

- The **structural** guarantees still hold unconditionally — no points/streaks
  in the schema, zero push, finite lists. Those remain non-negotiable and stay
  tested. The toggle cannot reach them.
- Only the *interaction friction* (the no-redo dead-end) becomes optional.

**Edits implied** (do when building, not before):
- PRD `### C`: reframe from "a tab" to "a presentation mode"; rewrite C4 to "calm
  default, parent-overridable; structural anti-addiction NFRs unaffected."
- Brief tenet 1: add a one-line caveat that *interaction* friction is a default,
  while *structural* anti-addiction (no currency, no nags, finite) stays absolute.
- `NFR-CALM-1/3/4` keep their tests verbatim. `NFR-CALM-2`/C4 tests get reworded
  to assert the **default** behaviour, plus a test that the toggle exists and
  flips C4.

---

## Open decisions

- **OD-1 Calm storage** — localStorage (prototype, per-device) vs
  `households.calm_mode` (policy, per-family). Migration cost vs correctness.
- **OD-2 Toggle granularity** — one "Calm Mode" switch, or separate switches per
  behaviour later? Start with one.
- **OD-3 Kid-mode entry** — corner long-press (PRD C5) vs an explicit toggle vs
  the `?kid=1` kiosk lock. Possibly all three for different contexts.
- **OD-4 Per-tab vs global kid styling** — does kid mode restyle every tab
  uniformly via `.page--kid`, or does each tab get a bespoke kid layout? Start
  uniform, specialise where it pays.

---

## Decision 3 — Tabs are themes; each theme renders per audience; tasks are shared across roles

The hub's organising principle is **theme × audience**:

- **Themes = tabs**: `Aujourd'hui` (Board) · `Cuisine` · `Routines` · `Liste` ·
  `Réglages`. Clear separation of data, not one cluttered board.
- **Audience = a global Parent ⇄ Toddler switch** (its own context, same pattern
  as `LangContext`; `localStorage['babillard-audience']`; `?kid=1` kiosk lock).
  Every tab **except Réglages** has both a parent and a toddler rendering of the
  *same data*. Réglages is parent-only and gated.

### Shared tasks across roles ("different tenant")

A task/chore/action is **not owned by a single member**. A parent and a toddler
can both *help at the same task*, as different actors. The two audience views are
two lenses on one shared task where **each can act** — a toddler taps their part
in toddler view, a parent sees/confirms/acts in parent view. Attribution records
that **both contributed**, not just "last_done_by".

**Schema implication (the expensive-to-change part — get it open now):** do NOT
model a task as one owner + a rotation pointer only. Model **participation as a
relation** (e.g. `task_participants(task_id, member_id, role, contributed_at)`),
so multi-actor, multi-role help is representable. The current
`tasks.rotation_json` + `current_idx` + `last_done_by` stays for "whose turn",
but completion/help becomes append-only contributions. Routines likewise may gain
a helper beyond the single `member_id`. Build the relation when we first touch
tasks; until then, keep new code from assuming single-owner.

- **OD-5 Participation model** — exact shape of `task_participants`, and whether
  routines share it or keep their own per-card completion. Decide when tasks get
  touched; data is still disposable, so reshape freely.

## Status (implemented so far)

- ✅ `useAudience()` context + `?kid=1` + HubLayout tab bar (Decision 1 & 3 shell).
- ✅ `useSpeak()` extracted; `BigTiles` toddler primitive; each tab renders both
  audiences; Réglages parent-only.
- ✅ **Calm toggle** — `useCalm()` (localStorage `babillard-calm`, default ON),
  toggle in Réglages; KidView no longer dead-ends when OFF. OD-1 resolved as
  localStorage for now.
- ✅ **Shared-task model** — migration `0002_task_participants.sql`; chores PATCH
  records a contribution (role from audience; `complete:false` = help without
  finishing); `/board` returns today's `helpers` per chore; parent board shows
  "aidé par"; toddler Aujourd'hui has "I helped" chore tiles. OD-5 first cut.
- ⏳ Next: deepen **Aujourd'hui** (parent + toddler), then per-tab parent-preview
  control, then fold the routine builder out of Réglages.

The calm-tenets test now scans **all** migrations, so the structural guarantees
(no points/streaks/push) stay enforced as the schema grows.

## Build order (when greenlit)

1. `useKidMode()` context + `localStorage` + `?kid=1`, mirroring `LangContext`.
2. Extract `useSpeak()` from `KidView.tsx`.
3. `.page--kid` styling pass (sizes, contrast, targets) on Board first.
4. Calm toggle (start localStorage `babillard-calm`, default on) in Operator
   settings; KidView/Board routine section respects it (no dead-end when off).
5. Per-tab "voir en mode enfant" preview control.
6. Fold routines into Board-kid-mode; retire `/kid` as a standalone route (keep
   a redirect).
