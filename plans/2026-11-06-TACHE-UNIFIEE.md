# Babillard: one task concept (draft for the owner's review)

**Status:** plan only, nothing built. Decisions below are the owner's (2026-11-06).

## The idea

**At its core, a task is a title and a checkbox: the most basic todo app.** Everything else is an optional layer on that same thing, up to the gouttières that recur every autumn and rotate between people. There are no types. Add a layer and the task gains a behaviour, remove it and the task loses it, with no conversion and no second kind of row.

A task is one thing with five independent answers. Only the title is required. Every existing flavour becomes a combination, not a type.

| Axis | Values | Today it lives in |
| --- | --- | --- |
| **Sur quoi ?** | nothing · a carnet (house, car, appliance, room, any « thing ») · a person · a pet · a project · a trip | only `home_projects.carnet_id` |
| **Quand ?** | someday · a day · recurring, on a fixed grid or from the last time | `recur_json` on two tables, `todos.day` on the third |
| **Qui ?** | anyone · one person · a rotation | `rotation_json`, `todos.member_id` |
| **Effort** | optional: five dots, one is simple, five is high effort | nowhere yet |
| **Allure** | icon and colour, inherited from the subject, overridable | `colour` on two tables, nothing on `todos`, no icon column anywhere |

Examples: gouttières (the house, every autumn) · sortir le bac (rotation, weekly, evening before) · a long-term todo (nothing, someday) · vaccin du chien (the pet, yearly).

## Owner decisions

- Phased, and each phase is a place we can stop.
- « À faire » and « À compléter » merge into one board section. This reverses the June choice.
- Fun v1 is subject identity AND full customization. Any real-world subject must fit.
- The word is **« Tâche »** (EN « Task »), replacing « Corvée » as the general word.
- A task has exactly one subject, or none. « Qui ? » stays a separate axis.
- On a board row, the subject's icon leads and the title tint says who, as the compact rows rule already does.
- A checked one-off stays ticked until the day ends, then clears by itself. « Effacer les cochées » can clear it sooner. Recurring tasks move to their next date.
- Tasks get a fifth board view, **« Tâches »**, beside bento, semaine, mois and année (`BoardView` in `lib/boardview.ts`). It is their one home, and Réglages goes back to settings only.
- That view has several ways to look at the same tasks: by horizon, by subject, by person. The bento board stays a glance of what is due.
- Rotation is a per-task checkbox, offered on any recurring task, not a chore-only type.
- **« Trouver quoi faire »**: a way to find a task by effort and by horizon, for « I have ten minutes » or « what should we plan this year? ».
- Out of scope: La liste, routines, habits. Departure checklists stay as they are, and may become task templates later.
- Unified and standardized throughout: one word, one scheduler, one subject link, one look, one row, one form, each held by a guard.

## What the code already gives us

- `carnets.kind` already has `'thing'`, and carnets nest. A garden, a chalet or a pool is a `thing` carnet today, so no new subject type is needed. It needs a friendlier door, not a schema.
- `home_projects` already has title, notes, colour, date, recurrence, recur_from, snooze, carnet link and budget. It is the closest row to the final shape.
- `_lib/upkeep.ts` is already the one scheduler for `home_projects`, but chores still expand recurrence by hand in `board.ts` and `month.ts`. That split is the first thing to fix.
- `EmojiPicker` and `ColorPicker` exist. `pictoFor` already maps words to emoji. `SEASON_SEEDS` holds 10 rituals.

## Phases

### Phase 1: one scheduler (no visible change)

- Done 2026-11-06: chores go through `_lib/upkeep.ts` via `choreSchedule`. Rotation stays its own question.
- Guard: `taskSchedule-rule`, only the scheduler resolves a chore's anchor.

### Phase 2: « Sur quoi ? » and one board section

- Migration: a soft subject ref, `subject_kind` + `subject_id`, nullable, no FK, on `tasks`, `todos` and `home_projects`. `carnet_id` stays and maps to `subject_kind = 'carnet'`, because migrations are never retro-churned.
- One resolver, `subjectOf()`, answers name, link, icon and colour for any kind.
- A read-side `TaskItem` shape over the three tables, built in `functions/_lib`, consumed by the board, month, year and search.
- The word lands here, not earlier. `glossary.ts`: « Tâche » wins and « Corvée » steps down, with the ratchet flipped and about 57 lines of copy across 30 files, FR and EN, in the commit that merges the views. Earlier it would have sat beside « Entretien », « Projet » and « À compléter », which are still separate. The Réglages pill « Tâches de la maison » is the one collision to resolve.
- The merged board card: one `Act` row, one section, filtered by subject or person. Old cards retire through the `boardCards` migration so saved layouts survive.
- Each subject's page gets its tasks section, one component reused by carnet, person and pet.
- **Stop point:** the concept exists for users even if the tables never merge.

The « Tâches » board view ships in this phase, with its horizon, subject and person lenses, in the URL like every other view. Its body is lazy, like `WeekView`, so the eager chunk does not grow.

### Phase 3: look and customization

- Migration: nullable `icon` and `colour` overrides on the task rows. `todos` gains both; the two others gain `icon`. Subjects gain an `icon` where they have none (carnets default by kind today).
- One `LookPicker`, built from `EmojiPicker` + `ColorPicker`, shared by the task form and every subject form. Register in DevKit and COMPONENTS.md.
- Inheritance: task override, then subject, then a default. Typing suggests an icon through `pictoFor`.
- Adding stays one field. Everything else is optional and one tap away.
- A friendlier « une chose à moi » door to create a `thing` carnet, with its own name and look.
- Starter packs from `SEASON_SEEDS`, grouped by subject: tap « La maison à l'automne », add several.
- Guard: no task or subject form hand-rolls a colour or icon control.
- **Stop point:** the fun is shipped.

### Phase 3b: « Trouver quoi faire »

- Migration: nullable `effort` integer, 1 to 5, on the task rows. Never minutes, and it rates a task, never a person.
- One `EffortDots` control: five dots, tap to set, tap the same dot to clear. It builds on `Segmented` (`role=radiogroup`), so it keeps a label for screen readers and a keyboard path. Register in DevKit and COMPONENTS.md. The read-only row shows the same dots, small.
- Optional in the form, behind a tap, so adding a task stays one field.
- A finder inside the « Tâches » view: pick how much you have with the same five dots (showing that effort and below), then a horizon (cette semaine · ce mois-ci · un jour), and the list narrows. No total, no « 12 restantes ».
- A task with no effort still appears, under every effort, so skipping the field never hides it.
- Later, optional: « Surprends-moi » offers one task. The AI could guess effort at capture, confirmed by the user.
- **Stop point.**

### Phase 4: one form, then decide on the tables

- One task form replaces `ChoreForm`, `HomeProjectForm` and the todo composer. It opens as one title field, and each layer (when, who, subject, effort, look) is one tap away. Fields appear by axis, never by type.
- Guard: only `title` is required on the write path, and no form branches on a task type.
- Capture: the AI intents and `recurParse` create one kind of thing.
- **Owner gate:** only then decide whether `tasks` and `todos` physically merge into `home_projects`. Phases 1 to 3 do not depend on it, but « no types » is only fully true once they do, so that is the recommended end state.
- If they merge, old endpoints stay as aliases, because a queued offline write or an old tab can still call them.

## Every phase must keep

- Calm tenets: no streaks, points, counts or ranks. A subject page shows history, never a score.
- `useWrite`, `useDeferredRemoval`, the tmp-id heal on `todos`, offline replay, realtime keys, undo tiers.
- A new table or column joins the demo sweep inventory and the sample-data flags.
- Toddler lens, simple lens, kiosk, phone, desktop, FR and EN.
- PARITY Part 5 and 6, an ACTIONS.md door review, DISCOVERY.md. The guide stays at 32 cards: merge, don't add.
- Every guard planted red. CI E2E read after each push.

## Risks

- **Done means three things today.** A todo marks in place, a chore rotates, an upkeep stamps `last_done_at`. Settled for the user: a one-off stays ticked for the day, a recurring task moves on. The end-of-day clear must be derived on read, with no cron and no row rewrite, which matches the house rule in `_lib/recur.ts`. An offline tick replayed after midnight keeps its real day.
- **Departure instances live in `todos`.** The merged section must keep filtering them out (`splitTodos`, `source_template_id`).
- **Rotation in a phone-sized row.** The merged row must show whose turn it is without new furniture (see the compact rows rule).
- **Board poll cost.** The board is the free-tier lever. Subject resolving must not add a query to the poll.
