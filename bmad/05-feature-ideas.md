# 05 · Feature Ideas — 50 to skim

> A brainstorm to augment Babillard. Grounded in the current codebase (board,
> kitchen/recipes, list/deals, routines, chores, capture+AI, kiosk/mobile
> surfaces, parent/toddler audience, D1/R2/Workers AI, Cloudflare Worker).
> Skim, strike out, star. Nothing here is committed.
>
> Tags: **[S]** small / **[M]** medium / **[L]** large effort ·
> **⚠** tension with the Calm tenet (would need a gentle, opt-in treatment) ·
> **✦** out-of-the-box.
>
> **Re-audited against code 2026-07-13** (the June-07 audit had gone stale — five
> weeks of shipping closed most of its "partials" and half of its "never
> built"). Every ✅ **BUILT** below was verified against a live file, not memory.
> Tally now: **25 built · 1 superseded (#2) · 1 half-open (#20 voice) ·
> 2 deliberate-no (#47/#50) · 21 never built.** The cherry-pick pool is the 21:
> 4, 7, 8, 9, 10, 18, 22, 24, 25, 26, 28, 29, 31, 32, 33, 35, 39, 40, 41, 44, 45
> — plus #20's voice half.

> ⚪ **This is an idea pool, not a backlog.** Every entry below is uncommitted —
> inspiration for a *deliberate* decision, never a queue to work down. Roughly 21 of these were never built.
> It deliberately carries **no checkboxes**: a `- [ ]` in this repo means real open
> work, and these are not that. See `STATE.md` §4-F and its checkbox convention.


## A · The wall board & ambient kiosk

1. **Day-part ambient theming** [S] — ✅ **BUILT** (`lib/daypartDrift` + `data-daypart`, dawn→day→dusk→night, opt-out toggle, never overrides manual Night).
2. **"Now & Next" focus mode** [M] — ➖ **SUPERSEDED** (2026-07-13): the « Maintenant » view was retired; its glance moved into the today card's « Prochainement » headline, and the idle story is the ambient screensaver's optional next-up (#3). Not a gap.
3. **Ambient screensaver** [S] — ✅ **BUILT**. After N idle minutes the kiosk fades to a big clock + date + the slow photo frame (+ optional next-up); tap to wake. Tunable in Réglages ▸ Affichage ▸ Mode veille (show clock/date/photos/next, delay) and bundled with the return-to-Maisonnée drift. *(`AmbientScreen`, `lib/ambient`, driven by `HubLayout`'s idle timer.)*
4. **Auto-rotating board carousel** [M] — kiosk gently cycles board → meals → routines on a timer (digital-signage glance). *(the "rotating glance" surface option.)*
5. **Per-person day "lanes"** [M] — ✅ **BUILT** (June: per-person lanes board view; the widget-space refactor since made per-face filtering the member switcher's job).
6. **Weather-aware gentle prompts** [S] — ✅ **BUILT** (`weatherTip` in `lib/weather`, one calm line on the day/departure cards; hourly + tomorrow outlook shipped alongside).
7. **Daylight / sunset strip** [S] — a quiet seasonal bar showing daylight remaining; calming, orienting.

## B · Capture, voice & AI

8. **Multi-item conversational capture** [M] — "milk, eggs, and dentist Tuesday at 3" → AI splits into several routed items at once. *(extend the capture router.)*
9. **Hands-free wake-word on the kiosk** [L] ✦ — "Hey Babillard, add soccer Thursday" from across the kitchen. *(reuse: on-device voice; no cloud STT.)*
10. **Photo-to-events** [M] — snap a school newsletter / sports schedule → AI extracts dates into the calendar. *(reuse: the recipe-vision OCR pipeline.)*
11. **Gentle routing confirm** [S] — ✅ **BUILT** (CaptureForm: « Ajouté : X » confirmation + a quiet « Corriger » disclosure re-routes any successful capture; degraded-AI shows the type tiles directly).
12. **Natural-language queries** [M] ✦ — ✅ **BUILT** (`AskSheet` + `/api/ask` answer questions over the household's own data).
13. **PWA share-target capture** [M] — ✅ **BUILT** (text/URL **+ photo**). "Share → Babillard" from any app lands on `/share` (manifest `share_target`, POST/multipart). The service worker stashes the payload and 303s to a readable page (`SharePage`): shared text/url → the capture spine (AI routes it); a shared **photo** → an image fridge note (reuses `note-media`, shows on the board, clearable), with an optional caption. *(`SharePage` + the SW POST-`/share` interceptor in `vite.config.ts`.)*
14. **Drawn fridge note** [M] — ✅ **BUILT** (reframed: a drawn note, NOT OCR). Scribble/paint a little something for the household on a quick canvas (`DrawPad`, signature_pad) → saved as a PNG fridge note. *(in the ＋ Note rapide sheet; `MemoControls`.)*

## C · Kitchen, meals & recipes

15. **One-tap "shop this week"** [M] — ✅ **BUILT** (« Magasiner la semaine », in the kitchen ＋ actions).
16. **"Use it up" mode** [M] — ✅ **BUILT** (« À utiliser bientôt » / use-soon ranking + the Vide-frigo AI flow beside it).
17. **Meal history + "haven't had in a while"** [S] — ✅ **BUILT** (`/api/suggest-meal`: avoids the last 7 suppers, hearts lead, and a 14-day NEGLECT_CUTOFF resurfaces recipes not served in a while — most-neglected first).
18. **Calm meal-balance hints** [M] ⚠ — AI tags meals (veg/protein/quick) and shows a soft weekly balance — never calories, never shame.
19. **Recipe collections / cookbooks** [M] — ✅ **BUILT** (the Aa/Collections view toggle in the recipe book, grouped by tag, + the toddler `KidCollections` hear-first picker).
20. **Hands-free cook mode + multi-timers** [M] — 🔶 **HALF** (2026-07-13): multi-timers ✅ (`TimerRail`, per-step timer chips, timers survive dish-switching in `MultiCookPage`); the VOICE half ("next step" / "set a timer" by speech) is not built — the one genuinely-open partial from the June audit.
21. **Family "favorites" hearts** [S] ⚠ — ✅ **BUILT**. Each member ❤ a recipe (and a planned meal carries its recipe's hearts); suggest-meal leans toward loved dishes. Shows WHICH faces loved it, never a count/rank; the toggle hides as Maisonnée. *(`recipe_loves`, `HeartButton`/`useLoves`.)*
22. **Seasonal / local produce hints** [S] — tie postal + month to "asparagus is in season" nudges in the kitchen. *(reuse: postal code.)*

## D · Shopping, list & deals

23. **Aisle-ordered list** [M] — ✅ **BUILT** (La liste « Par allée » — `lib/aisle`, `aisleFor` reuses the pictoFor emoji→aisle mapping).
24. **Multi-store cheapest-split** [M] — when deals span stores, group the list by where each item is cheapest. *(reuse: deals + price-match.)*
25. **Calm grocery budget log** [M] ⚠ — optional rough spend total per month; a gentle number, no graphs-of-shame.
26. **Barcode scan to add/restock** [M] — scan a product to add to the list or mark pantry low. *(camera + lookup.)*
27. **Predictive ghost restock** [S] — ✅ **BUILT** (opt-in ghost cadence seeds the quick-add restock offer; buying never auto-enrolls).
28. **Wallet / lock-screen pass** [M] ✦ — the active grocery list as an Apple/Google Wallet pass you glance at in line.
29. **Receipt scan → reconcile** [L] — snap the receipt to tick off bought items, refill the pantry, and learn real prices for better deals. *(reuse: vision OCR.)*

## E · Kids, routines & chores

30. **Parent-voice narration** [M] ✦ — ✅ **BUILT** (per-card recorded clips in `CardDeckEditor`, R2-served, played via `playNarration` with TTS fallback; degrades to TTS when R2 unset).
31. **Reading-ladder** [M] — as a kid grows, gradually fade text in alongside pictograms. *(reuse: `lib/picto`; grows with the child.)*
32. **Kid-arranged routines** [M] — let a child drag their own picture cards into order, with a parent approving.
33. **Bedtime / quiet-hours mode** [S] — after a set time the kiosk dims and shows only the bedtime routine.
34. **Chore fairness ledger** [S] — ✅ **BUILT** (calm reframe: the chore ledger over `task_participants` + « Cette semaine » by FACE — names and faces, never counts/ranks, per the calm tenet).
35. **Optional allowance tracker** [M] — older kids' chores roll up to an allowance/contribution tally.
36. **Reward-free celebration** [S] ⚠ — ✅ **BUILT** (the deterministic routine bloom + the mur de collants — expressive, never a variable reward).

## F · Family connection & wellbeing

37. **Notes to the fridge** [S] — ✅ **BUILT** (the `notes` table + board torn-paper cards; grew audio/drawing/photo memos (#13/#14/#38) and the member-to-member « Laisse un mot » beside it).
38. **Voice memos to the fridge** [M] ✦ — ✅ **BUILT** (general-audience). Record a quick audio memo → a fridge note with an R2 clip; tap ▶ on the board to play. *(in the ＋ Note rapide sheet; `MemoControls`, served via /api/img.)*
39. **Private daily mood check-in** [M] ⚠ — each member taps a calm emoji; a soft, private household snapshot.
40. **Gratitude / highlight of the day** [S] — one line per person, folded into the weekly recap. *(reuse: recap.)*
41. **"On this day" memories** [S] — surface "1 year ago today" from photos and past events in the frame. *(reuse: R2 + events history.)*
42. **Birthday & anniversary lead-up** [S] — ✅ **BUILT** (derived birthdays via `_lib/birthdays` + the `CountdownCard`; « À régler » flags a birthday with no gift idea, and gift ideas live on the contact).

## G · Platform & sync

43. **Real-time sync (Durable Objects + WebSockets)** [L] — ✅ **BUILT** (the `RealtimeHub` DO nudges open boards via `/api/live` WS; polling stays the correctness fallback).
44. **Two-way calendar sync** [L] — ICS export + Google Calendar import so events flow in from work/school calendars.
45. **Email-in household address** [M] ✦ — a Cloudflare Email Routing address; forward a school email or invite and it auto-creates events. *(skill: cloudflare-email-service.)*
46. **Installable offline-first PWA** [L] — ✅ **BUILT** (build-time SW with the hashed shell baked in, persisted query cache, and the offline write outbox with idempotent replay — see OFFLINE.md).

## H · Accounts, privacy & growth

47. **Per-member profiles & sign-in** [L] — 🔶 **DELIBERATE-PARTIAL**: pick-a-face profiles + attribution shipped long ago; per-member passwords/sign-in remain a deliberate no (one household per operator email is a documented simplification). Revisit only if the product needs real per-person privacy.
48. **Guest / babysitter mode** [M] — ✅ **BUILT** (time-boxed read-only guest tokens + typed share modes; `GUEST_SUBS`-narrowed Réglages; also the postbox/intake writable-guest doors).
49. **One-click data export / takeout** [S] — ✅ **BUILT** (`/api/takeout` — the household as JSON).
50. **Paid "Family+" tier** [L] — 🔶 **DORMANT BY CHOICE**: `households.tier` + `stripe_customer_id` columns exist, no billing/enforcement. A business decision, not a UX gap (free-tier capacity notes cover ~15–30 households).

---

### Quick-win shortlist (high value, low effort)
1, 3, 6, 11, 15, 17, 27, 33, 34, 37, 40, 41, 42, 49

### Boldest bets (most differentiating, bigger lift)
9, 10, 28, 29, 30, 43, 44, 45, 46
