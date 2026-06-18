# 05 · Feature Ideas — 50 to skim

> A brainstorm to augment Babillard. Grounded in the current codebase (board,
> kitchen/recipes, list/deals, routines, chores, capture+AI, kiosk/mobile
> surfaces, parent/toddler audience, D1/R2/Workers AI, Cloudflare Worker).
> Skim, strike out, star. Nothing here is committed.
>
> Tags: **[S]** small / **[M]** medium / **[L]** large effort ·
> **⚠** tension with the Calm tenet (would need a gentle, opt-in treatment) ·
> **✦** out-of-the-box.

## A · The wall board & ambient kiosk

1. **Day-part ambient theming** [S] — the board's palette drifts dawn→day→dusk→night across the day (beyond the binary day/night theme), so the kiosk feels alive across the room. *(reuse: `lib/timeofday`, theme vars.)*
2. **"Now & Next" focus mode** [M] — when the kiosk is idle, it collapses to the single next thing in the next ~2h, departure-board style; tap to expand. *(reuse: board today data.)*
3. **Ambient screensaver** [S] — ✅ **BUILT**. After N idle minutes the kiosk fades to a big clock + date + the slow photo frame (+ optional next-up); tap to wake. Tunable in Réglages ▸ Affichage ▸ Mode veille (show clock/date/photos/next, delay) and bundled with the return-to-Maisonnée drift. *(`AmbientScreen`, `lib/ambient`, driven by `HubLayout`'s idle timer.)*
4. **Auto-rotating board carousel** [M] — kiosk gently cycles board → meals → routines on a timer (digital-signage glance). *(the "rotating glance" surface option.)*
5. **Per-person day "lanes"** [M] — a column per family member with their events + chores + routine, color-coded; shines on a wide wall. *(reuse: members colours.)*
6. **Weather-aware gentle prompts** [S] — "rain today — grab umbrellas"; "cold snap — coats." One calm line, never nagging. *(reuse: `lib/weather`.)*
7. **Daylight / sunset strip** [S] — a quiet seasonal bar showing daylight remaining; calming, orienting.

## B · Capture, voice & AI

8. **Multi-item conversational capture** [M] — "milk, eggs, and dentist Tuesday at 3" → AI splits into several routed items at once. *(extend the capture router.)*
9. **Hands-free wake-word on the kiosk** [L] ✦ — "Hey Babillard, add soccer Thursday" from across the kitchen. *(reuse: on-device voice; no cloud STT.)*
10. **Photo-to-events** [M] — snap a school newsletter / sports schedule → AI extracts dates into the calendar. *(reuse: the recipe-vision OCR pipeline.)*
11. **Gentle routing confirm** [S] — after a capture, a soft "I filed this under Events — move it?" chip; one tap re-routes.
12. **Natural-language queries** [M] ✦ — "what did I add yesterday?", "what's for supper Friday?" answered over your own data. *(reuse: AI + D1.)*
13. **PWA share-target capture** [M] — ✅ **BUILT** (text/URL **+ photo**). "Share → Babillard" from any app lands on `/share` (manifest `share_target`, POST/multipart). The service worker stashes the payload and 303s to a readable page (`SharePage`): shared text/url → the capture spine (AI routes it); a shared **photo** → an image fridge note (reuses `note-media`, shows on the board, clearable), with an optional caption. *(`SharePage` + the SW POST-`/share` interceptor in `vite.config.ts`.)*
14. **Drawn fridge note** [M] — ✅ **BUILT** (reframed: a drawn note, NOT OCR). Scribble/paint a little something for the household on a quick canvas (`DrawPad`, signature_pad) → saved as a PNG fridge note. *(in the ＋ Note rapide sheet; `MemoControls`.)*

## C · Kitchen, meals & recipes

15. **One-tap "shop this week"** [M] — diff the week's meal plan against the pantry and seed the grocery list in one tap. *(reuse: meals + pantry + list.)*
16. **"Use it up" mode** [M] — pantry items nearing their end suggest recipes that use them. *(extend cookability ranking.)*
17. **Meal history + "haven't had in a while"** [S] — suggest-meal weights toward neglected favorites; avoids the same five dinners.
18. **Calm meal-balance hints** [M] ⚠ — AI tags meals (veg/protein/quick) and shows a soft weekly balance — never calories, never shame.
19. **Recipe collections / cookbooks** [M] — group recipes (weeknight, holidays, kids-love) and browse by collection. *(reuse: recipe tags.)*
20. **Hands-free cook mode + multi-timers** [M] — "next step" / "set a 10-min timer" by voice while your hands are messy; several timers at once. *(extend `CookMode`.)*
21. **Family "favorites" hearts** [S] ⚠ — ✅ **BUILT**. Each member ❤ a recipe (and a planned meal carries its recipe's hearts); suggest-meal leans toward loved dishes. Shows WHICH faces loved it, never a count/rank; the toggle hides as Maisonnée. *(`recipe_loves`, `HeartButton`/`useLoves`.)*
22. **Seasonal / local produce hints** [S] — tie postal + month to "asparagus is in season" nudges in the kitchen. *(reuse: postal code.)*

## D · Shopping, list & deals

23. **Aisle-ordered list** [M] — sort the list by typical store aisle/category for a faster shop. *(reuse: item categories.)*
24. **Multi-store cheapest-split** [M] — when deals span stores, group the list by where each item is cheapest. *(reuse: deals + price-match.)*
25. **Calm grocery budget log** [M] ⚠ — optional rough spend total per month; a gentle number, no graphs-of-shame.
26. **Barcode scan to add/restock** [M] — scan a product to add to the list or mark pantry low. *(camera + lookup.)*
27. **Predictive ghost restock** [S] — the ghost-cadence engine proactively seeds "probably need soon," opt-in. *(reuse: ghost staples/cadence.)*
28. **Wallet / lock-screen pass** [M] ✦ — the active grocery list as an Apple/Google Wallet pass you glance at in line.
29. **Receipt scan → reconcile** [L] — snap the receipt to tick off bought items, refill the pantry, and learn real prices for better deals. *(reuse: vision OCR.)*

## E · Kids, routines & chores

30. **Parent-voice narration** [M] ✦ — routine cards read aloud in mom's/dad's own recorded voice. *(reuse: R2 for clips; toddler routines.)*
31. **Reading-ladder** [M] — as a kid grows, gradually fade text in alongside pictograms. *(reuse: `lib/picto`; grows with the child.)*
32. **Kid-arranged routines** [M] — let a child drag their own picture cards into order, with a parent approving.
33. **Bedtime / quiet-hours mode** [S] — after a set time the kiosk dims and shows only the bedtime routine.
34. **Chore fairness ledger** [S] — a calm "who did what this week" to settle "it's not my turn." *(reuse: chore rotation + helpers.)*
35. **Optional allowance tracker** [M] — older kids' chores roll up to an allowance/contribution tally.
36. **Reward-free celebration** [S] ⚠ — a purely expressive sticker book / gentle bloom when a routine finishes — deterministic, not a variable reward (honours NFR-CALM-2).

## F · Family connection & wellbeing

37. **Notes to the fridge** [S] — leave a written note for someone ("Bonne chance à ton examen!") that shows on the kiosk.
38. **Voice memos to the fridge** [M] ✦ — ✅ **BUILT** (general-audience). Record a quick audio memo → a fridge note with an R2 clip; tap ▶ on the board to play. *(in the ＋ Note rapide sheet; `MemoControls`, served via /api/img.)*
39. **Private daily mood check-in** [M] ⚠ — each member taps a calm emoji; a soft, private household snapshot.
40. **Gratitude / highlight of the day** [S] — one line per person, folded into the weekly recap. *(reuse: recap.)*
41. **"On this day" memories** [S] — surface "1 year ago today" from photos and past events in the frame. *(reuse: R2 + events history.)*
42. **Birthday & anniversary lead-up** [S] — a gentle count toward family dates, with attached gift-idea notes.

## G · Platform & sync

43. **Real-time sync (Durable Objects + WebSockets)** [L] — replace polling so a change on one phone lands on the kiosk instantly. *(Cloudflare DO.)*
44. **Two-way calendar sync** [L] — ICS export + Google Calendar import so events flow in from work/school calendars.
45. **Email-in household address** [M] ✦ — a Cloudflare Email Routing address; forward a school email or invite and it auto-creates events. *(skill: cloudflare-email-service.)*
46. **Installable offline-first PWA** [L] — works on the subway and syncs when back; the board in your pocket, properly. *(service worker + write queue.)*

## H · Accounts, privacy & growth

47. **Per-member profiles & sign-in** [L] — real attribution ("Camille added this"), personal mobile views, while the kiosk stays shared. *(evolves email-only auth.)*
48. **Guest / babysitter mode** [M] — a temporary, limited kiosk session (today's plan + emergency info, no settings/billing).
49. **One-click data export / takeout** [S] — download everything as JSON; a clean Loi 25 / privacy gesture. *(reuse: D1.)*
50. **Paid "Family+" tier** [L] — multi-home, more photo storage, priority AI, custom domain; built on the existing `households.tier`. *(monetization path.)*

---

### Quick-win shortlist (high value, low effort)
1, 3, 6, 11, 15, 17, 27, 33, 34, 37, 40, 41, 42, 49

### Boldest bets (most differentiating, bigger lift)
9, 10, 28, 29, 30, 43, 44, 45, 46
