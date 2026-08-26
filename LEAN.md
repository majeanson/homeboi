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

## The nine patterns

Each has a fix that already exists — reach for the primitive, don't invent one.

| # | Smell | Fix |
| --- | --- | --- |
| 1 | A heading the tab / scene header already says | Delete it. **Check it isn't also a help anchor** — `BusinessesTab`/`CarnetsTab` each registered the same help key the section pill already owned, so arming « ? » painted the bubble **twice**. |
| 2 | An always-open composer above the list | **`SectionAdd`** + `useSectionAdd()` (`components/SectionAdd.tsx`) — a ＋ in the section header that opens the field *focused* and folds it away on submit. |
| 3 | An always-open search field | **`SearchField`** `collapsible` (`components/SearchField.tsx`) — a loupe until asked for; never collapses while a query is live. |
| 4 | Rarely-touched form fields, all expanded | **`Disclosure`** (`components/Disclosure.tsx`). See the invariants below. |
| 5 | A housekeeping action camping above the content | Move it to the **foot** (« Compléter les familles », the board's edit hint). Found after you've read the thing, which is when the thought occurs. |
| 6 | The same words repeated on every row | Say it once. A per-row « → ajouter à la liste » wrapped over the item's own name at 390px; the check button's accessible name already carried it. |
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

**Not yet swept:** the toddler lens and the 1280px wall — both standing
requirements in `CLAUDE.md`, neither ever measured. That is the obvious next
increment.
