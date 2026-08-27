# Lean — how much of a screen is the thing you came for

> Companion to `COMPONENTS.md` (what to reuse) and `DISCOVERY.md` (how a feature
> explains itself). This one is about **how much chrome sits between opening a
> surface and seeing its content** — and how that stays fixed once fixed.

Babillard is a glance surface on a wall tablet and a phone in a pocket. Chrome
accumulates one reasonable decision at a time: a heading here, an explanation
there, an add box that "should be handy". Each is defensible alone; together they
push the actual content below the fold. In August 2026 a sweep of every surface
found the same nine patterns over and over — this file is that list, so the next
session applies it instead of rediscovering it.

## The method (this part matters most)

**Screenshot the first screen at 390px and look at it. Do not reason about it.**

Every genuine find in that sweep came from a screenshot; none came from reading
code. Code review finds *what a surface renders*; only a picture shows *how much of
the screen it spends before the point*. Take one before and one after — the
difference is the deliverable.

The automated version is the state matrix:

```bash
npm run e2e:matrix     # → e2e/screenshots/matrix/manifest.json + PNGs
```

Each row carries **`contentTopPx`** — the distance from the top of the surface's
scroller to its first content item — plus `aboveFoldChars`, `bleedPx` and the pass
flag. Read the manifest first, open only the PNGs whose numbers look wrong.

## The ratchet

Entries in `e2e/state-matrix.spec.ts` carry a `content` selector (what you came to
see) and, once baselined, a **`budgetPx`** ceiling for `contentTopPx`.

Every budget is **read off a real measurement**, never invented — the baseline plus
~10% for font and rounding drift. So:

- a surface can never grow its chrome back;
- a surface that legitimately leads with a hero just carries a bigger number;
- **the ratchet only ever moves down.** Tighten the budget in the same commit as
  the lean pass that earned it.

If a budget fails, the failure prints both numbers. Two honest responses: lean it
back down, or re-baseline **deliberately**, saying in the commit why the surface
now needs more room. Silently raising a budget is the one thing this file exists to
prevent.

**A budget may not be measured against an empty state — the spec enforces this.**
Every budgeted entry records whether its content selector landed on an empty state
(any class containing `empty`, walked up to the scroller) and **hard-fails** if it
did, naming the fix. It was written after the trap below cost a week of a
meaningless budget, and it immediately caught two more entries — `maison-business`
and `maison-carnets`, both budgeting « Aucun … pour l'instant ». Both sat at the
*same* 176px as their real rows, which is precisely why looking at the number could
never have found them.

**Check the fixture before you trust a number.** Several shared fixtures in
`e2e/mocks.ts` are deliberately EMPTY (the behavioural specs want them that way), so
an entry can end up budgeting its own empty state — the screen nobody uses. `/notes`
was ratcheted at 209px while showing « Aucune note pour l'instant »: the tab whose
entire brief was *maximum note per pixel* had its density measured on a page with
zero notes, and a low `aboveFoldChars` was the only tell. Entries pass `api:` (an
`overrides` map, merged over the defaults) to seed the content they exist to
measure. Seed the case that varies, too — the notes fixture carries two notes on one
day and one on another precisely so the row rendering must handle both.

**Read `aboveFoldChars`, not just the pixels.** It is the only column that catches a
screen showing nothing, and it sat unread in the manifest while `/notes` was
mismeasured. The teardown now hoists every screen under 200 chars into a
`review.lowContent` block (and prints it to the console, since a scheduled run's log
is all a human sees when nothing failed). It is a **flag, not a failure**: a toddler
lens and the deliberate first-run empties belong there. The question it asks is
"sparse by design, or sparse because the fixture is empty?" — answer it, don't
silence it.

**What pulls the ratchet.** The sweep is too slow to gate every push, so Actions ▸
**State matrix** runs it **weekly (Mondays 06:00 UTC)** as well as on demand. That
is a deliberate trade: chrome creeps back over weeks rather than inside one push,
and a week-late red build still names the commit that did it. A budget nothing ever
runs is a comment with a number in it.

**Windows and the Linux runner agree — checked, not assumed.** The worry was that
budgets baselined locally would be quietly loose or quietly red on CI, since font
metrics differ. The first full CI sweep (2026-08-26, 64 states, 44 budgeted) came
back with every entry at exactly its tolerance — the same numbers to the pixel.
That is not luck: `contentTopPx` is a sum of BOX heights (padding, margins, fixed
control heights), and only a value that wraps differently between platforms would
move it. So a local baseline is trustworthy — but confirm a new batch of budgets
with one CI sweep before relying on it, because the day that stops being true is a
day of red builds nobody can reproduce locally.

## Generous inside (the other ratchet)

Everything above measures a surface you are **scanning** — how much chrome you pass
before the content. It says nothing about a surface you deliberately **opened to do
one thing**: the ＋ sheet's composer, an expanded `SectionAdd` box, a scene form.
There the field *is* the content, and the failure runs the other way.

> **Lean outside, generous inside.** Chrome you scroll past has a ceiling that only
> moves down. A composer you asked for has a **floor** that only moves up.

It shipped, so it is not hypothetical. On a 390px phone the kitchen ＋ sheet's
« Restants » row spent ~178px on « ＋ À finir bientôt », left the box on its 10rem
basis, and the mic + caret ate ~90px of that — **~60px of typing width**, the
placeholder clipped to « Ajouter un ». Every LEAN number on that screen was green:
the sheet is not a browse surface, so nothing was measuring it.

The fix was one rule at the primitive, not one per surface: under 30rem of row a
labeled CTA drops **beneath** a full-width field (`.edit-field--cta`, pages/
fields.css). ~55 call sites inherited it. The two guards:

| | measures | direction |
| --- | --- | --- |
| `e2e/state-matrix.spec.ts` `budgetPx` | `contentTopPx` — chrome before content | ceiling, moves **down** |
| `e2e/composer-fit.spec.ts` `floor` | the field's usable typing width, per composer | floor, moves **up** |
| `src/styles/field-fit.test.ts` | the CSS invariants themselves (the row is the container; no host re-pins a fixed basis; `--gutter` owns every committed surface's side margin) | build gate |

The floor's companion assertion is the one that actually reads like the bug: the
field's own **placeholder, measured in the field's own font, must fit**. A number
can drift past a reviewer; « Ajouter un… » cannot.

Two things follow for any new composer:

- **A labeled submit is a commitment to a full line.** If a field doesn't want one,
  don't add one — La liste's add row and the lean Notes composer both dropped
  theirs (Enter is the whole interaction) and spend the entire width on text.
- **Count the 44px icons inside the box.** The clear ✕, the mic, the 📎, the
  combobox caret are each a full touch target and none may shrink. Three is
  affordable on a full line and nowhere else; under 22rem the decorative leading
  glyph gets out of the way first.

## The nine patterns

Each has a fix that already exists — reach for the primitive, don't invent one.

| # | Smell | Fix |
| --- | --- | --- |
| 1 | A heading the tab / scene header already says | Delete it. **Check it isn't also a help anchor** — `BusinessesTab`/`CarnetsTab` each registered the same help key the section pill already owned, so arming « ? » painted the bubble **twice**. |
| 2 | An always-open composer above the list | **`SectionAdd`** + `useSectionAdd()` (`components/SectionAdd.tsx`) — a ＋ in the section header that opens the field *focused* and folds it away on submit. |
| 3 | An always-open search field | **`SearchField`** `collapsible` (`components/SearchField.tsx`) — a loupe until asked for; never collapses while a query is live. |
| 4 | Rarely-touched form fields, all expanded | **`Disclosure`** (`components/Disclosure.tsx`). See the invariants below. |
| 5 | A housekeeping action camping above the content | Move it to the **foot** (« Compléter les familles », the board's edit hint). Found after you've read the thing, which is when the thought occurs. |
| 6 | The same words repeated on every row | Say it once. A per-row « → ajouter à la liste » wrapped over the item's own name at 390px; the check button's accessible name already carried it. Also a **repeating date**: notes arrive in bursts, so « mar. 14 nov. · » led every row and pushed each preview onto a second line — now printed once per run of a day, and again when the day changes (the only place it said anything). |
| 7 | A full-width primary CTA for a secondary action | Quiet chip, then icon. La liste's three shortcuts went bars → chips → glyphs. Keep the full name on `aria-label` + `title` — **nothing may end up unnamed**. |
| 8 | Prose that duplicates the empty state below it | Delete the prose. |
| 9 | A control stretched by its flex column | `align-self: flex-start`. This silently turned `btn--sm btn--ghost` into a full-width bar in **three** separate places — a flex column stretches its children by default. |

## Three invariants that keep it honest

1. **A fold never hides a filled field.** A `Disclosure` must `defaultOpen` when any
   of its fields already carries content — otherwise editing a contact silently
   buries their phone number, which is worse than the wall of empty boxes you
   started from. Reference implementation: `components/cercle/ContactFields.tsx`.
   Corollary: **a fold must have something to hold.** The intake form's per-person
   cards pass `showContact={false} showAddress={false}`, so a « Coordonnées » fold
   there would be a lying label — those two fields render inline instead.

2. **Never delete an explanation that carries meaning nothing else carries.** The
   « Idées » drawer's lead line stays: it came from a UX review because the drawer
   read as a settings list, and no other element on that screen says it. Leaning is
   removing *redundancy and furniture* — not removing understanding. When in doubt,
   check whether the empty state, the guide card, or a control's accessible name
   already says the same thing; if one does, the prose goes.

3. **Don't cargo-cult a fix.** `RecurPicker` stayed inline in `ChoreForm`,
   `HomeProjectForm` and `HabitForm` while being folded away in `EventForm` — there
   it is two rows of optional detail on a form about a single moment; in the others
   it costs one row and it *is* the subject (a chore's rotation, a habit's cadence
   ARE their recurrence). The same control can be furniture on one surface and the
   point on another.

## Where the fat was, so far

Swept and leaned in Aug 2026: Notes, Recettes, garde-manger, La liste, the four
heavy forms (person / event / recipe / pet), Réglages, the board, Maison ▸
Business + Carnets, Le mois, « Avant de partir », « L'auto ».

**« Planifier une journée » (2026-08-26)** — and the interesting part is *why* it had
never been swept: **it was not in the matrix at all.** The sweep only ever looked at
routes it had been told about, so the one screen where a whole day is composed
accumulated four hand-rolled `.sec-label` divs, two full-width « Ajouter un
rendez-vous / une corvée » bars under their lists, five dashed « ＋ Ajouter » slot
pills, an always-open todo composer, and a « Le fil du jour » heading over a
« Rendez-vous » heading for the same rows — none of it measured. The fix was mostly
**one anatomy applied five times**: `SecLabel` (glyph · title · rule · count) with a
`SectionAdd` ＋ in the header, rows, then the composer that ＋ opened. It now carries
`day-plan` + `day-plan-wall` budgets, so it cannot drift back.

The lesson generalizes: *check what the matrix does NOT list.* A budget guards a
surface; the absence of an entry guards nothing, and reads exactly like a pass.

**So the question was asked properly**, against `src/router.tsx`, and it turned up
**seventeen more** unmeasured scenes — every one a door somebody opens weekly: the
recipe you read, the book you pick it from, cook mode, the till, the flyer browser,
the list-row editor, « Mes habitudes », the routine builder and its player, « Notre
monde », a carnet, the drawings wall, the postbox, « Jouer », the project form and
**global search**. All seventeen are in the table now. What four of them cost:

| surface | before → after | what it was |
| --- | --- | --- |
| `/home-project/new` | **159 → 17px** | four wrapped rows of « Courants » preset chips ABOVE the name you came to type — while every sibling form scene leads with its name at ~17px. The chips FILL that field, so they belong under it. |
| `/search` | **246 → 151px** | « Demander à l'IA » camping over every result (a "not what I meant" thought comes *after* reading — LEAN #5) and a count line wearing the empty state's 1.4rem padding. One `Cluster justify="between"` row now. |
| `/kitchen/recipe/:id` | **243 → 209px** | two scaling controls stacked: a portions stepper AND ×½ ×1 ×2 ×3. When a recipe states its servings the stepper reaches every amount and says it in portions; the presets stay whole for recipes that state none (invariant 3). |
| `/cercle/carnet/:id` | 176px, four rows shorter | four full-width « ＋ Ajouter … » bars → the shared `SectionAdd` ＋ in each section header. The carnet now fits one screen. |
| `/voyage/:id` ▸ Itinéraire | **~1400px → one screen** | the worst instance of pattern #2 anywhere in the app, and it took a screenshot to see it: the day composer was **open under every single day** — field + a full-width « ＋ Ajouter » + « Ajouter un document », ~180px each. An 8-day trip opened as eight stacked empty add boxes with the itinerary hidden between them. One ＋ per day header now; one composer at a time. |

Four of those five were **the same shape as the day page**: a control taking a full
row of its own where a chip in the header, or a place further down, would do. That
shape now has one answer everywhere — `SecLabel`'s `action` slot holding a
`SectionAdd` ＋ — and the ONE remaining question worth asking of a new section is
"where does its composer live?" (answer: behind that ＋, opened focused).

The Voyage row is also the clearest proof of this file's opening claim. Nothing in
that code reads as fat: one composer per day is a perfectly reasonable line to write,
and each is a *primitive we already share*. It is only when you photograph five of
them stacked that the surface says what it is. **Screenshot it and look.**

And two verdicts that are NOT cuts, recorded so nobody re-opens them: `habitudes`
(288px) leads with the "who am I today" face row and « Le défi du jour » — a lens and
a thing you do, both content; `cashier` is left **unbudgeted** because its tiles are
vertically centred, so its `contentTopPx` measures how few deals the fixture stages,
not how much chrome the surface spends.

**The two lenses, now swept** (2026-08-26): the toddler lens and the 1280px wall
were standing requirements in `CLAUDE.md` with exactly one matrix entry each, both
on the board. Both now carry the five hub tabs with budgets.

And the result is worth recording, because it is the case this file warns about:
**the two biggest numbers in the table are not fat.** `board-kiosk` (334px) is read
from across a room, so its greeting is deliberately large type; `maison-toddler`
(216px) is a centred picture screen where the empty space IS the design for a
pre-reader. Both were budgeted so they cannot grow, and neither was cut. A high
`contentTopPx` asks a question; it does not answer one.

The toddler lens is otherwise the leanest surface in the app (board 0px, notes 16,
cuisine 32) — a useful reminder that the picture-first lens never accumulated the
headings and composers the parent lens did.
