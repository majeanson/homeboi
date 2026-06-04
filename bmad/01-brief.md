# Project Brief — Babillard

> BMad artifact 1 of 3. Analyst altitude: the *why* and the *what*, not the
> *how*. The PRD ([`02-prd.md`](./02-prd.md)) turns this into requirements;
> the architecture doc ([`03-architecture.md`](./03-architecture.md)) turns
> those into a build.

---

## The problem

A household runs on a hundred small facts nobody wants to own: who has an
appointment, what's for supper, whose turn for dishes, that we're out of
coffee. Today these live in a partner's head, three group chats, a paper
list on the fridge, and a calendar nobody's child can read.

The tools that try to fix this fail in two predictable ways:

1. **They demand upkeep nobody sustains.** Pantry apps want a full
   inventory. Chore apps want a setup wizard. The maintenance tax kills them
   in a week.
2. **They farm attention.** Streaks, badges, points, push notifications, a
   feed. They're built to be opened often, not to get you out the door. That
   is the opposite of what a family glance-surface should do, and it's
   actively bad to put in front of a three-year-old.

## The vision

One calm board on a cheap wall tablet that the whole household reads at a
glance and a pre-reader can operate by themselves. You capture a fact once,
by typing or speaking in plain Québécois, and it lands in the right place on
its own. The day's work is finite: it empties and stays empty. The grocery
list fills itself from the meal plan. Nothing pings you. Nothing keeps score.

## Who it's for

- **The household operator** (Marc, and the paying customer): plans the
  week, owns the board, edits from a phone with a real login.
- **The other adults / older kids:** tick the shared list at the store,
  mark a chore done, all from the wall tablet with no login.
- **The three-year-old:** runs their own morning/bedtime routine from big
  picture cards, narrated aloud, no reading required. This is a real user,
  not a nice-to-have. If the design doesn't work for a pre-reader, it's
  wrong.

## Design tenets (load-bearing, not preferences)

These are the lines that, if crossed, make it a different and worse product.

### 1. Calm by design — fun without the dopamine loop

- **Finite, not infinite.** The day's list completes and stays empty. There
  is no feed, no infinite scroll, no "come back for more."
- **Fixed acknowledgment, never a variable reward.** Completing a card gives
  the *same* gentle confirmation every time. No surprise jackpots, no
  escalating animations, no slot-machine. Variable-ratio reward is the
  addiction primitive; we don't ship it.
- **No streaks, no points, no badges to hoard.** The reward is the
  real-world thing you just did, not an in-app currency.
- **The app never nags.** No push notifications pulling you back. It is a
  glance-surface you visit on purpose and leave in seconds.
- **Calm aesthetics.** No autoplay, no flashing, quiet motion, dims at
  night. A wall tablet should be furniture, not a TV.

### 2. A pre-reader is a first-class user

- Picture-first, voice-first. Big touch targets. No flow in the kid view
  requires reading.
- Narration is on-device (browser speech), so it costs nothing and no
  child's voice or schedule leaves the house.

### 3. No upkeep tax

- **Never ask for a full inventory.** The kitchen module tracks only "low /
  out" plus a meal plan, captured the moment you notice, never in a
  data-entry session. This single decision is what keeps it alive past
  week one.

### 4. Privacy is the default, not a setting

- AI runs in-network on Cloudflare Workers AI. A family's schedule and
  meals never reach a third-party model. This is both a Loi 25 posture and
  a genuine differentiator.

## Goals

- **Home:** Marc's household actually runs on it daily within a month of v1.
- **Showcase:** fills the gap in the portal palette — a *serious,
  data-driven, AI-touched SaaS*, sitting next to the two games and the audio
  tool.
- **SaaS:** a clean freemium line where the paid tier is exactly the depth
  (voice, meal-planning, multiple boards) without ever paywalling the calm.

## Non-goals (v1)

- Not a personal-assistant chatbot. The AI classifies and routes; it does
  not converse.
- Not a full calendar app. It shows *today* and the *week*, not a
  month-grid replacement for Google Calendar.
- Not a pantry inventory. See tenet 3.
- Not real-time-collaborative in the CRDT sense. Poll + ETag for v1.
- No native app. It's a web kiosk; "install" = add-to-homescreen / kiosk
  browser.

## Success signals

- A morning where the three-year-old finishes their routine on the board
  without an adult reading it to them.
- A week where the grocery list was never hand-built; it filled from the
  meal plan and voice captures.
- A month with zero notifications sent, and the household still uses it.
  (If we'd need notifications to drive retention, the product is wrong.)

## Risks / open questions

- **Toddler usability is unproven until tested on an actual toddler.** The
  fastest possible loop with the real three-year-old gates the kid view.
- **Shared-board write identity:** chore credit wants to know *who*, but
  family members shouldn't log in. Likely a "pick your face" profile, no
  password. Resolved in the PRD/architecture.
- **Kiosk auth** (capability URL vs device pairing) — deferred to the
  architecture doc by decision.
- **Whisper accuracy on Québécois French** with a noisy kitchen and a
  child's voice. Needs a real-device check before voice is promised in the
  paid tier.
