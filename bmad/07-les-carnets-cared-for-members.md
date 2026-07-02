# 07 · « Les carnets » — cared-for members (home + auto + …)

> **✅ SHIPPED** (migration 0082, « Les carnets »). This is the original design
> note; kept as the rationale record. Drafted 2026-06-25, **re-optimized** after
> Marc's feedback. Supersedes the earlier "L'échelle" framing. Grew out of idea-set A of
> `06-lifestyle-ideas.md`. Reuse-first: a generic, entity-scoped care spine built on the
> already-shipped `home_projects` (mig 0074) + L'auto `cars` (migs 0067–0070).

---

## The concept

Home and auto are **not two features — they're the same thing at two time-horizons.**
A house is cared-for over decades; a car over years. **Same carnet, same lifecycle logic;
the horizon dial just turns shorter for the car.** So the spine is designed
**entity-generic from day one**: build the home first, drop the car in with no refactor.

**A carnet is a NODE IN A TREE (Marc, 2026-06-25).** There can be **many** houses (chalet,
rental, a parent's place) and **many** cars — and **inside a house, the water heater / roof /
furnace is its OWN carnet**. Everything is the same shape and carnets nest:

```
Nos carnets
├── 🏠 Notre maison
│   ├── 🔥 Chauffe-eau   (installé 2026 · garantie 2032 · facture.pdf)
│   ├── 🏚️ Toiture       (refaite 2021 · ~25 ans)
│   └── ❄️ Fournaise      (filtre q3mois)
├── 🏡 Le chalet
└── 🚗 La Civic
    ├── 🛞 Pneus          (installés 2024 · ~6 ans)
    └── 🔋 Batterie
```

A "thing" is therefore a **full carnet of its own** — identity (model/serial/install/warranty),
historique (the saved invoice), long jeu (its lifespan) — not a lifecycle line-item. A house's
**« Le long jeu » is the horizon assembled from its CHILDREN's lifecycles** (roof + water heater
+ repaint on one timeline), pure-derived.

Each top-level carnet is a **first-class member of Le cercle** beside the people and pets.
"Tenir maison" / "entretenir l'auto" becomes **stewardship with a memory**, not chore-dread.

**Calm guardrail on the tree:** the schema nests infinitely but the **UX stays shallow** — a
house shows a short list of « ses choses » as simple cards; tap → that thing's little page. Two
levels is the everyday case. NO file-explorer / deep drilling (it would break the glance).

### Global name: « Les carnets »  — CONFIRMED (Marc, 2026-06-25)
Each member keeps a carnet — identity, upkeep schedule, service history with invoices/docs,
and its long jeu. Warm, analog, calm; a real cultural term (« carnet d'entretien »).
**« L'échelle » retires** — the ladder survives only as the optional *visual* for « le long jeu ».

### Cut per Marc's feedback
- ✂️ « La maison vous parle » (spoken narrator) — dropped.
- ✂️ Real-weather seasonal triggers — dropped; seasonal items are plain **dates** on the
  recurrence engine (how Entretien already works).

---

## The carnet scene = a 2-segment toggle (`SubTabs`)  — Marc's decision #5
Reuses the shared `SubTabs` family. Two segments:
- **« À surveiller »** — what's *due*: upcoming entretien + lifecycle "soon" + recent history. The actionable agenda.
- **« Le carnet »** — the *information*: identité, *ses choses* (children + rooms), the map (home), docs, full history — view/add/edit.

**Default segment = Intelligent** (06-25): opens on « À surveiller » when something's due/soon, else « Le carnet ».

**« Le carnet » leads ADAPTIVELY by kind** (06-25): home → photo + an « en cas de pépin » entry; auto → photo + identité; a single thing (water heater) → identité + garantie + facture. One scene, kind-aware hero.

## A carnet = five sections
Home shows all five; auto shows four (no map).

1. **Identité** — photo + key facts. Home: built year, since-year, address. Auto: make/model/year, plate, since-date.
2. **Entretien (cadence)** — recurring care (furnace/gutters · oil/tire-swap/registration). *Reuse: an `home_projects` (Entretien) row scoped to the carnet — see Reuse §.*
3. **Historique (le carnet)** — dated logged entries with notes + **attached docs** (invoice PDF, manual, photo). **Marc's example: "new water heater → install date + invoice + notes" = one `care_log` row.**
4. **Le long jeu** — lifecycle horizon: install date + expected lifespan → **derived** "commence à y penser" in the last ~window. Long for the roof, short for the tires — same code.
5. **En cas de pépin (the map)** — home only: where's the shutoff/breaker/spare key, how the thermostat/alarm work. Locations + how-tos, **never quantities**. Surfaces **read-only in guest/sitter mode** (reuse share-modes allowlist).

### Rooms — a complete (optional) feature  — Marc's decision #3
Rooms = `zone`-kind carnet children of a home: create/name/icon them, **assign things to a room**,
view a home's things **grouped by room**, and **pins attach to a room** (the shutoff lives in
« Sous-sol »). A flat home works without rooms, but rooms are fully built when used.

---

## Data model (one recursive tree)

The nesting collapses the per-thing tables into ONE recursive table:

- **`carnets`** (the tree) — `id`, `household`, `parent_id` (null = top-level house/car),
  `kind` (`home`|`auto`|`appliance`|`system`|`zone`), `name`, `media_key`, `color`/emoji,
  `facts_json` (kind-specific: built_year / make-model-year / serial / warranty_until),
  `installed_at` + `lifespan_months` (its OWN long jeu), `link_id` (an `auto` node → the existing
  **`cars`** row, so **L'auto stays untouched** and just gains a carnet), `sort`, `archived`.
- **`care_log`** (NEW — the heart) — keyed to ANY `carnet_id`: `at`, `kind`
  (`service`|`install`|`purchase`|`note`), `title`, `note`, `cost_cents?`, `business_id?`
  (installer, from cercle-businesses), `media_json` (R2: invoice/manual/photo). *The water-heater
  example = one `install` row on the Chauffe-eau carnet.*
- **Cadence = EXTEND `home_projects` (mig 0074) IN PLACE** with a nullable `carnet_id` — NOT a new
  table. An Entretien row with `carnet_id` set is the carnet's upkeep; existing Projets/Entretien
  rows keep it null. → rides the **exact same `expandRange`→`homeToday`/`homeUpcoming`→board/month/day
  pipeline** already built. Maximal uniformity with corvées/projets/entretien.
- **`home_pins`** — the « En cas de pépin » map: attached to a home carnet (or a `zone` child):
  `label`, location/how-to text, optional `media_key`, `kind` (`where`|`howto`|`doc`). No quantities.
- **Long jeu (aggregate)** — a house carnet's horizon = its descendants' `installed_at` +
  `lifespan_months`, derived like birthdays (`_lib/birthdays` pattern, no event rows, no doom countdown).
- **Multiplicity is free** — homes/cars are rows, not singletons; `cars` bridges in via `link_id`.

### Data home — DECIDED
`carnets` is its **own table** (NOT rows in the people table). Top-level carnets are listed in a new
**« Les carnets » SubTab in Le cercle** (see IA) — *not* interleaved into the people directory.

### Endpoints
`/api/carnets` (tree CRUD) · `/api/care-log` (CRUD + R2 media) · extend `/api/home-projects`
(carnet_id) · `/api/home-pins`. Each: `authed()` + a `TABLE` row in `worker/routes.ts` +
forward-only migration. Calm test: no quantity/score columns; `cost_cents` OK.

## Reuse & uniformity (Marc's standing directive) — THREE seams, all already wired
Carnets must plug into the views (Aujourd'hui, Mois, jour, Le cercle) through existing machinery,
never a parallel path:
1. **An Entretien/Projet row that can belong to a carnet** (`home_projects.carnet_id`) → already
   surfaced chore-shaped via `expandRange`/`homeToday`/`homeUpcoming`; checkable w/ deferred-undo.
2. **A generalized "derived-reminder" source** — fold `_lib/birthdays` + carnet-lifecycle (+ future
   doc-expiries) into ONE aggregator injected at the same board/month/day points (no event rows).
3. **A detail adapter** — `buildCarnet`/`buildCareItem` for `useEntityDetail()`, uniform with
   `buildEvent`/`buildChore`/`buildMeal`; tapping a carnet item anywhere opens the shared peek.
CRUD/UI reuse: `EditField`, `EntityCombobox` (installer business), `uploadMedia` (docs), `RowActions`,
`useWrite`, `useDeferredRemoval`, `SubTabs`, `Modal`, `OperatorSection`. **Only new table: `care_log`.**

---

## IA — « Les carnets » = a new SubTab in Le cercle (Marc's call; agreed)
- A new **« Les carnets » SubTab in Le cercle**, built like the **Business tab**: shared `SubTabs`
  shell, **in-tab add** (not the ＋ FAB), its own directory of top-level carnets (houses, cars).
  This is the *management/home* surface.
- **Generic `/carnet/:id`** scene (the 2-segment toggle) — adapts by kind (home adds the map;
  appliance shows warranty/serial; a child opens the same scene one level down). Friendly
  **`/maison`**/**`/voiture`** redirect to the primary home/car. **Extend the existing `/voiture`**
  carnet-side only (do NOT fork L'auto's availability/rides surface).
- **Board = its own « Les carnets » card** (decision #3) mirroring L'auto's `AutoCard`: reads the SAME
  generalized data (seam 1 carnet-Entretien rows + seam 2 lifecycle derived), is a **customizable card
  in the `useBoardCards` registry** like every other, and **dedups** — a carnet's due item shows in the
  Carnets card and is pulled OUT of the plain Entretien rows (the way `Fil` dedups Aujourd'hui), so
  nothing double-renders. Mois/jour still surface carnet items inline through the pipeline. SubTab tends, card glances.
- **L'auto split to watch:** scheduling/availability stays in **Réglages ▸ L'auto**; the car's
  *carnet* (maintenance/history/lifecycle) lives in the SubTab — same car, two facets, cross-linked.
- **Toddler** = a friendly "notre maison / notre auto" picture card; carnets are a parent concern.

---

## Phasing
1. **The carnet tree + home + its things** — `carnets` (tree) + `care_log` (invoice/install/notes
   + R2 docs) + generalize `home_projects`→`care_tasks`; seed a default home carnet; add child
   "things" (a water-heater carnet w/ install date + invoice — *Marc's example end-to-end*);
   `/carnet/:id` scene (identité · historique · long jeu · entretien); home as a cercle member;
   board "due soon." *Proves the recursive engine on the home + its sub-things.*
2. **Cars as carnets + multiplicity + the map** — bridge `cars`→carnet nodes via `link_id`, carnet
   on `/voiture`, support multiple homes/cars in the cercle list, « En cas de pépin » map (home_pins)
   surfaced read-only in guest mode.
3. **Polish** — the ladder drawing for « le long jeu » (aggregate horizon), "on this day" memory in
   the carnet, Guide + DevKit + COMPONENTS.

---

## Calm guardrails (must hold)
- No health-score / points / streaks. The long jeu is a horizon of **time**, not a score.
- No inventory/quantity. Filter *size* is a reference string, not a count.
- `cost_cents` (rough cost / invoice total) is allowed; a savings/progress-to-goal bar is NOT.
- Derived "due soon" only — no doom countdowns, no red backlog.

## Decisions locked (2026-06-25)
- **Name = « Les carnets ».** ✓
- **UI nests 2 levels** (top-level + « ses choses »); schema unbounded. ✓
- **Rooms = a complete optional feature** (`zone` carnet children; group things; pins attach). ✓
- **Pets stay where they are** for now (maybe surface vet visits as care_log later). ✓
- **Scene = `SubTabs` toggle** « À surveiller » / « Le carnet »; **default = Intelligent**
  (due → À surveiller, else Le carnet); **« Le carnet » leads adaptively by kind**. ✓
- **Lives as a new SubTab in Le cercle** (like Business), in-tab add. ✓
- **Board = its own « Les carnets » card** (mirrors `AutoCard`; `useBoardCards`-customizable; dedups vs Entretien). ✓
- **Labels = warm/imagé** (Le long jeu, En cas de pépin) **+ help-mode "?" hints + Guide how-tos** for each. ✓
- **Reuse three seams** (carnet-scoped Entretien row · derived-reminder source · detail adapter). ✓

## Still open
- Final FR-CA wording of the warm labels + the Guide how-to copy (write during build).
- Sibling unbuilt picks: « Les pots » (calm money) snaps onto the derived "due soon" layer;
  « Les passages » may share the carnet/biography.
