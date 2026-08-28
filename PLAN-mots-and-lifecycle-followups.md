# Plan — follow-ups to « Laisse un mot » + the board lifecycle

> Companion features spun off the two most-recent feature lines: the **mots**
> answering machine (`05a0c4c` compose, `b843800` schedule + reply) and the
> **unified board lifecycle** (`db6dbed` `lib/itemLife`). This document is the
> backlog for what we chose **not** to build in the first pass — each entry is
> written to be picked up cold by a future session.
>
> **Shipped in the first pass (for context, not in this backlog):**
> A1 sender outbox (« Ce que j'ai laissé »), A2 cancel/reschedule a scheduled mot,
> A3 schedule presets (`ScheduleFields` + `presetWhen`), A4 « Me le rappeler »
> self-mot, B1 fold past board items (« Déjà passé aujourd'hui »), D1 scheduled
> time in the outbox line.
>
> **Non-negotiables for every item below.** Read `CLAUDE.md` → _Build by reuse_
> first. The calm-tenet test (`functions/db/migrations/calm-tenets.test.ts`) is
> law: no `streak`/`points`/`badge`/`push_subscription` table, no inventory
> `quantity`/`stock_count`, no unread **counts**. Schema follows the naming rules
> (`colour`, `position`, `media_kind`+`media_key`, soft refs commented). New
> `/api/*` = handler under `functions/api/` + `authed()` + a `TABLE` row in
> `worker/routes.ts` + `keysForPath` mapping. New shared component → `/dev/kit` +
> `COMPONENTS.md`; new user-facing behaviour → the in-app Guide (`lib/guideContent.ts`).

---

## Priority read

| ID | Feature | Effort | Value | Migration? |
| -- | ------- | ------ | ----- | ---------- |
| A5 | ✅ **DONE 2026-08-27** — Voice-mot transcription preview | M | High (glance + a11y) | 0123 |
| A6 | Mot → transformer (route to capture) | M | High (LAC-spirit) | no |
| A7 | Reply mini-thread in the peek | S | Medium | no |
| A8 | Occasion mots (surface on a birthday) | S | Medium | no |
| B2 | "En cours" in-progress state | S | Medium (softens the flip) | no |
| B3 | Unify the "maintenant" marker into the today list | S | Medium (consistency) | no |
| B4 | Dusk → "Demain commence" preview | M | Medium | no |
| B5 | Page-turn transition at midnight | S | Low (polish) | no |
| C1 | « Souvenirs » keepsake shelf | M–L | High (gives `saved_at` a home) | maybe |
| C2 | "Pour toi" face digest | S–M | High (personal glance) | no |
| C3 | Bonne-nuit / quiet-hours board | M | Medium | no (pref) |
| D2 | Author-coloured face-dot | S | Low (see caveat) | no |

Recommended next slice: **A5 + A6** (they make the inbox smart), then **C2**
(the personal glance that ties mots + board + routines together).

---

## A5 — Voice-mot transcription preview

**What.** A voice mot's row/peek title is currently the generic « Mémo vocal ».
Run the clip through Workers AI (Whisper / `@cf/openai/whisper`) once, at leave
time, and store the transcript so the fridge reads at a glance and a screen
reader can announce it.

**Why it pairs.** The media-kind work (#38 audio) shipped without any text
surface for audio. The inbox is meant to be glanceable; « Mémo vocal · Papa »
tells you nothing.

**Data model.** Add `transcript TEXT` (nullable, no default text needed) to
`mots` (next migration number — check `functions/db/migrations/`, currently the
mots tables are 0094/0095). Nullable = "not transcribed / AI unset". Do **not**
add a language column — reuse the household locale, or detect from Whisper.

**Reuse.**
- AI degradation pattern (`functions/_lib/env.ts`): `AI` unset → skip, title
  stays « Mémo vocal ». This is the expected local path, not a bug.
- Transcribe in the POST handler after the blob is written, guarded by
  `ctx.env.AI`, best-effort (`waitUntil`, swallow errors like the realtime
  broadcast). Or a tiny follow-up endpoint the composer calls after upload.
- `labelOf()` in `MotsCard.tsx` and `buildMot` title fall back chain: first text
  line → **transcript** → media label → `untitled`.

**Calm guardrails.** Transcript is a convenience label, never "required
reading" (NFR-KID-2) — the audio remains the source. No confidence score shown.

**Risks.** Whisper on a long clip is slow; cap clip length (already bounded by
the recorder) and run off the response path. See
`[[babillard-workers-ai-gotchas]]` — the 70B extractor returns pre-parsed;
Whisper returns `{ text }`.

---

## A6 — Mot → transformer (route a mot into the capture spine)

**What.** A peek action **« Transformer »** on a text mot that routes its text
through the existing capture classifier: "achète du lait" → list item, "dentiste
mardi 15h" → event, "penser au cadeau" → todo. The mot is kept or cleared after.

**Why it pairs.** The answering machine collects intentions; today they die as
text. This closes the loop mots→structured, which is the whole LAC thesis. It
also makes « Me le rappeler » (A4) far more useful: a self-mot becomes a real
task in one tap.

**Reuse.**
- The **capture spine** / `AddSheet` AI router already classifies free text into
  event/task/list-item/pantry-low/meal/note. Extract or call its classify path
  with the mot's `text`; land the result via the same write it already uses.
- `buildMot` opts → add `onTransform?`, render a `sparkle-bold` action.
- `useWrite()` for the resulting create; then either keep the mot or
  `removal.remove()` it.

**Calm guardrails.** Never auto-transform — always an explicit tap, and show the
routed target before committing (mirror the capture confirm). AI unset → hide
the action (manual type-picker fallback, as capture already does).

**Effort.** M — mostly wiring to the existing classifier; the risk is coupling,
so factor a small `classifyText(text)` helper both AddSheet and this call.

---

## A7 — Reply mini-thread in the peek

**What.** Today `buildMot` quotes **one** parent (`parentQuote`). Walk the
`reply_to` chain so a short maman→enfant→maman exchange reads as a 2–3 line
thread in the peek (collapsed, capped — not a chat app).

**Why it pairs.** `reply_to` (migration 0095) is a self-ref chain but only one
hop is ever shown; a two-hop reply loses context.

**Reuse.**
- `MotsCard.quoteOf` already resolves a parent by id from the live list — extend
  to walk up N hops (cap at ~3) and pass an array of quotes.
- Render as stacked `hand: true` text blocks in `buildMot` (the existing
  quote-block style).

**Calm guardrails.** Cap depth; never render as an infinite scroll. No "N
replies" counter.

**Effort.** S. Pure `lib/mots` helper `threadOf(mots, id, maxHops)` + a tests
addition; no schema, no server change.

---

## A8 — Occasion mots (schedule onto a birthday)

**What.** In the composer's « Plus tard », a fourth preset **« Sa fête »** when
the recipient has a known birthday: sets `surface_at` to the next occurrence of
that birthday (e.g. 08:00 that morning).

**Why it pairs.** Schedule (`surface_at`) + the cercle birthday engine already
exist; this is a one-tap join. "Leave Léa a note for her birthday."

**Reuse.**
- Birthdays are **derived** (no event rows) in `functions/_lib/birthdays` and
  the cercle member's birth date. Compute the next-occurrence unix second
  client-side in `presetWhen`-adjacent code, from the picked recipient's bday.
- Only show the preset when `recipient` is a member with a birthday set.

**Calm guardrails.** Still no push — it surfaces on the board that morning like
any scheduled mot. One preset, not a recurring-reminder engine.

**Effort.** S. Frontend-only; the recipient's birth date already rides
`/api/members` or `/api/cercle`.

---

## B2 — "En cours" in-progress state

**What.** A timed board item is currently binary: full-strength → line-crossed.
Add a gentle **"en cours"** accent while an event spans _now_ (`start_at <= now
< until`), before it crosses out.

**Why it pairs.** The unified lifecycle (`isPastSec`) introduced a hard flip at
`start_at`… actually at the anchor; an event with a duration reads as "past" the
moment it starts unless it carries `until`. The Fil already knows `until`
(`dayRibbon.ts` uses `item.until ?? item.start_at`). Bring that nuance to the
list-style renders.

**Reuse.**
- `lib/itemLife.ts` — add `isNowSec(startSec, untilSec, nowMs)` beside
  `isPastSec` (pure, unit-tested next to the existing cases).
- `Act` — a soft `now`/`inProgress` accent already exists (`bento--now` via the
  `now` prop on `Section`; `act--mine` shows accents are cheap). Add an
  `act--live` modifier or reuse the `now` accent per-row.

**Calm guardrails.** An accent, never a blinking/pulsing element at rest; no
"time remaining" countdown (that's operate-y, not glance).

**Effort.** S. Needs `until` on the event row (events may already carry it; if
not, this is deferred until events have durations).

---

## B3 — Unify the "maintenant" marker into the today list

**What.** The Fil has a « maintenant » divider between past and future rows
(`Fil.tsx` `nowIndex`); the plain **Aujourd'hui** list does not. Add the same
subtle now-line between the live items and the folded « Déjà passé » group so
both surfaces read identically.

**Why it pairs.** B1 just introduced the past-fold in the today list; a now-line
above it completes the "past below, next above" reading and matches the Fil.

**Reuse.**
- The Fil's now-marker markup/CSS (`Fil.tsx` + its CSS) — lift the divider into
  a tiny shared element or reuse the class.
- The B1 partition (`liveMeals`/`liveEvents` vs `pastEls`) already computes the
  split point; drop the marker between them.

**Calm guardrails.** One quiet line, not a banner.

**Effort.** S.

---

## B4 — Dusk → "Demain commence" preview

**What.** As evening items pass and the daypart drifts to dusk/night, the Fil
(or the today card) quietly previews tomorrow's first 1–2 anchors (school bus,
early rendez-vous) so the board turns the page _with_ the evening instead of
emptying out.

**Why it pairs.** The lifecycle rolls today off at local midnight; the hours
before midnight currently just thin out. Day-part theming (`lib/daypartDrift`)
already drives dusk/night — hang the preview off the same signal.

**Reuse.**
- The `tomorrow` grid card already fetches tomorrow; the board buckets
  today/tomorrow server-side. Surface the first tomorrow anchors when
  `daypart === 'dusk' | 'night'` and today's timed items are all past.
- `momentFocus` (`lib/momentFocus`) is the existing "what to emphasise now"
  hook — extend it to emit an `evening→tomorrow` hint.

**Calm guardrails.** Preview 1–2 items max, clearly labelled « Demain commence »
/ "Tomorrow starts"; never the full tomorrow list (that's the tomorrow card's
job).

**Effort.** M.

---

## B5 — Page-turn transition at midnight

**What.** The roll-off at local midnight is a silent `invalidateQueries(BOARD_KEY)`
(`Board.tsx` `dayRef` effect). Add a one-frame cross-fade so the reset reads as
intentional.

**Why it pairs.** Makes the lifecycle's most invisible moment legible on an
always-on wall tablet.

**Reuse.**
- See `[[babillard-view-transitions]]`: a hub cross-fade was tried + reverted
  (chrome blink), and RR `viewTransition` is a no-op under `BrowserRouter` →
  fire `startViewTransition` + `flushSync` manually. Reuse that hard-won pattern;
  scope it to the board re-bucket only.

**Calm guardrails.** Sub-second, once per day; must not fight the daypart drift.

**Effort.** S, but validate on-device (the reverted attempt is a warning).

---

## C1 — « Souvenirs » keepsake shelf

**What.** Saved mots (`saved_at`), kept drawings (the DrawPad gallery), and
photos are keepsakes scattered across the app. Collect them into one calm family
shelf. Grow the existing `MomentPeek` band rather than a new page.

**Why it pairs.** The « Garder » stamp shipped with mots but a kept mot has no
long-term home — it just floats to the top of « Déjà vus » forever.

**Reuse.**
- `MomentPeek` (band card `moments`) + `useEntityDetail` peek adapters
  (`buildMot`, drawing/photo adapters) already exist — a souvenirs view is a
  filtered union over `saved_at`-set mots + gallery drawings + starred photos.
- `[[babillard-entity-detail-peek]]` for the tap-to-open.

**Data model.** Possibly a `saved_at` (or a `kept` boolean) on drawings/photos
for parity, if not present — check first; mots already have `saved_at`.

**Calm guardrails.** A shelf you _visit_, not a feed; no "X memories" count, no
"on this day" nagging. Read-only glance + open.

**Effort.** M–L (depends on whether drawings/photos already have a "kept" flag).

---

## C2 — "Pour toi" face digest

**What.** When a face is picked, one calm line that stitches mots + board +
routines: _« Léa — 1 mot t'attend · souper 17 h · routine dodo »_. A personal
glance, not a dashboard.

**Why it pairs.** The face lens (`useProfile`) + `useFaceHasWaiting` + the
board's now/next + routines-by-time-of-day all exist independently; nothing
composes them into "what's mine right now".

**Reuse.**
- `useMots` / `waitingMots(mots, profileId)` for the mot part (presence, e.g.
  « un mot t'attend », **never a number** — reuse the boolean).
- `nextUpToday` (Board) for the next timed thing.
- The routine-by-daypart pick already used by `AmbientScreen` — extract it.
- Render as a HubHead subline or a slim band above the grid, face-tinted.

**Calm guardrails.** One line, presence-based; « un mot t'attend » not « 3 mots ».
Absent/empty when nothing is pending. This is the calm inverse of a notification
center.

**Effort.** S–M.

---

## C3 — Bonne-nuit / quiet-hours board

**What.** Distinct from the screensaver: at the Night daypart, optionally
collapse the board to "tomorrow's first thing + bonne nuit", fully dimmed —
a deliberate wind-down surface, still interactive (unlike the screensaver).

**Why it pairs.** Ties `daypartDrift` (night) to the lifecycle's end-of-day. The
screensaver (`AmbientScreen`) is _at rest_; this is _the board itself_ at night.

**Reuse.**
- `lib/ambient` already owns idle behaviours + Réglages ▸ Affichage ▸ Mode veille
  toggles; add a `quietHours` opt-in beside `screensaver`/`returnHome`.
- Day-part is `data-daypart` on the shell (`lib/timeofday`).
- B4's "tomorrow starts" preview is the natural content.

**Calm guardrails.** Opt-in, never overrides manual Night, tap anywhere returns
to the full board. No alarm, no "go to bed" nag.

**Effort.** M. It's a preference + a night-render branch of the board.

---

## D2 — Author-coloured face-dot (deferred, with caveat)

**What.** The per-face `face-dot` (waiting-mot presence) is a **boolean** dot.
The idea: tint it with the latest sender's `colour` so you sense _who_ left
something without a count.

**Why deferred.** The dot is deliberately boolean — the code comment in
`MemberSwitcher.tsx` and `lib/mots.waitingRecipientIds` reads _"boolean presence
only, never a count (NFR-CALM)"_. Colouring by author:
1. spreads a `dotColour` prop across three shared consumers (`FaceSwitcher`
   via `MemberSwitcher`, `ProfilePicker`, and the mobile face row);
2. a recipient often has waiting mots from **multiple** senders — "latest
   author's colour" is a lossy, slightly arbitrary signal;
3. it shifts the dot from _pure presence_ toward _encoding who_, which is a
   philosophy call, not a mechanical polish.

**If we do it.** Add `waitingRecipientColours(mots, members): Map<recipientId,
colour>` to `lib/mots`; add an optional `dotColour?: string` to the face shape
(additive, default keeps today's dot); set it as a CSS custom property on
`.face-dot`. Low code risk, but get Marc's yes on the principle first.

---

## Cross-cutting notes for whoever picks this up

- **The scheduled-mot primitive is the calm reminder engine.** A6 (transform) +
  A4 (self-mot, shipped) + C2 (digest) together turn « Laisse un mot » into the
  household's anti-notification to-do surface. Bias toward composing these three
  before inventing anything new in that space.
- **The lifecycle items (B2–B5)** are all small and share one seam: `lib/itemLife`
  + the day-part drift. If several are wanted, do them in one pass so the clock
  logic stays in one place.
- **Where new endpoints are needed** (A5 transcript write, if not folded into
  POST): handler + `authed()` + `routes.ts` `TABLE` + `keysForPath`. Don't
  hand-roll the guard.
