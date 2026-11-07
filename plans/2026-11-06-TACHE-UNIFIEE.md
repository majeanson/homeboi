# Babillard: one task concept (draft for the owner's review)

**Status:** plan only, nothing built. Decisions below are the owner's (2026-11-06).

## The idea

A task is one thing with four independent answers. Every existing flavour becomes a combination, not a type.

| Axis | Values | Today it lives in |
| --- | --- | --- |
| **Sur quoi ?** | nothing · a carnet (house, car, appliance, room, any « thing ») · a person · a pet · a project · a trip | only `home_projects.carnet_id` |
| **Quand ?** | someday · a day · recurring, on a fixed grid or from the last time | `recur_json` on two tables, `todos.day` on the third |
| **Qui ?** | anyone · one person · a rotation | `rotation_json`, `todos.member_id` |
| **Allure** | icon and colour, inherited from the subject, overridable | `colour` on two tables, nothing on `todos`, no icon column anywhere |

Examples: gouttières (the house, every autumn) · sortir le bac (rotation, weekly, evening before) · a long-term todo (nothing, someday) · vaccin du chien (the pet, yearly).

## Owner decisions

- Phased, and each phase is a place we can stop.
- « À faire » and « À compléter » merge into one board section. This reverses the June choice.
- Fun v1 is subject identity AND full customization. Any real-world subject must fit.
- Out of scope: La liste, routines, habits. Departure checklists stay as they are, and may become task templates later.
- Unified and standardized throughout: one word, one scheduler, one subject link, one look, one row, one form, each held by a guard.

## What the code already gives us

- `carnets.kind` already has `'thing'`, and carnets nest. A garden, a chalet or a pool is a `thing` carnet today, so no new subject type is needed. It needs a friendlier door, not a schema.
- `home_projects` already has title, notes, colour, date, recurrence, recur_from, snooze, carnet link and budget. It is the closest row to the final shape.
- `_lib/upkeep.ts` is already the one scheduler for `home_projects`, but chores still expand recurrence by hand in `board.ts` and `month.ts`. That split is the first thing to fix.
- `EmojiPicker` and `ColorPicker` exist. `pictoFor` already maps words to emoji. `SEASON_SEEDS` holds 10 rituals.

## Phases

### Phase 1: one word, one scheduler (no visible change)

- Pick the noun in `glossary.ts`. **« Tâche » is listed today as a losing rival of « Corvée »**, so this is a deliberate glossary change, FR and EN, with the ratchet moved in the same commit.
- Chores go through `_lib/upkeep.ts`, generalized, for due, overdue and next occurrence. Rotation stays its own question. `month.ts` and `board.ts` stop calling `expandRange` for tasks.
- Guard: `task-scheduler-rule`, no recurrence expansion for tasks outside the scheduler.

### Phase 2: « Sur quoi ? » and one board section

- Migration: a soft subject ref, `subject_kind` + `subject_id`, nullable, no FK, on `tasks`, `todos` and `home_projects`. `carnet_id` stays and maps to `subject_kind = 'carnet'`, because migrations are never retro-churned.
- One resolver, `subjectOf()`, answers name, link, icon and colour for any kind.
- A read-side `TaskItem` shape over the three tables, built in `functions/_lib`, consumed by the board, month, year and search.
- The merged board card: one `Act` row, one section, filtered by subject or person. Old cards retire through the `boardCards` migration so saved layouts survive.
- Each subject's page gets its tasks section, one component reused by carnet, person and pet.
- **Stop point:** the concept exists for users even if the tables never merge.

### Phase 3: look and customization

- Migration: nullable `icon` and `colour` overrides on the task rows. `todos` gains both; the two others gain `icon`. Subjects gain an `icon` where they have none (carnets default by kind today).
- One `LookPicker`, built from `EmojiPicker` + `ColorPicker`, shared by the task form and every subject form. Register in DevKit and COMPONENTS.md.
- Inheritance: task override, then subject, then a default. Typing suggests an icon through `pictoFor`.
- Adding stays one field. Everything else is optional and one tap away.
- A friendlier « une chose à moi » door to create a `thing` carnet, with its own name and look.
- Starter packs from `SEASON_SEEDS`, grouped by subject: tap « La maison à l'automne », add several.
- Guard: no task or subject form hand-rolls a colour or icon control.
- **Stop point:** the fun is shipped.

### Phase 4: one form, then decide on the tables

- One task form replaces `ChoreForm`, `HomeProjectForm` and the todo composer. Fields appear by axis, never by type.
- Capture: the AI intents and `recurParse` create one kind of thing.
- **Owner gate:** only then decide whether `tasks` and `todos` physically merge into `home_projects`. Phases 1 to 3 do not depend on it.
- If they merge, old endpoints stay as aliases, because a queued offline write or an old tab can still call them.

## Every phase must keep

- Calm tenets: no streaks, points, counts or ranks. A subject page shows history, never a score.
- `useWrite`, `useDeferredRemoval`, the tmp-id heal on `todos`, offline replay, realtime keys, undo tiers.
- A new table or column joins the demo sweep inventory and the sample-data flags.
- Toddler lens, simple lens, kiosk, phone, desktop, FR and EN.
- PARITY Part 5 and 6, an ACTIONS.md door review, DISCOVERY.md. The guide stays at 32 cards: merge, don't add.
- Every guard planted red. CI E2E read after each push.

## Risks

- **Done means three things today.** A todo marks in place and is cleared later, a chore rotates, an upkeep stamps `last_done_at`. The `TaskItem` must carry one meaning per case, not pretend they match. This is the hardest design question and it belongs to Phase 2.
- **Departure instances live in `todos`.** The merged section must keep filtering them out (`splitTodos`, `source_template_id`).
- **Rotation in a phone-sized row.** The merged row must show whose turn it is without new furniture (see the compact rows rule).
- **Board poll cost.** The board is the free-tier lever. Subject resolving must not add a query to the poll.

## Open questions for the owner

1. The word. « Tâche » reads naturally, but it reverses the glossary. Alternatives welcome.
2. May a task have several subjects, or exactly one? One keeps everything simpler, and is my recommendation.
3. Do people and pets show their tasks on their own page only, or also tint the board row?
