# D1 migrations

Forward-only, additive, **filename-locked** — wrangler tracks applied state by
filename, so never rename a migration that has run. No rollback path: ship a
forward fix.

- `npm run db:migrate:local` for dev.
- `npm run db:migrate:prod` to push to the remote D1.

| File            | What it adds                                                                                                                                                                                                        |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `0001_init.sql` | Everything: households/domains/operators/members, device pairing (devices + pairing_codes), captures, events/tasks/list_items, meals/pantry_low, routines/routine_runs. Deliberately no streaks/points/push tables. |
| `0134_operator_session_version.sql` | `operators.session_version` — the counter the session cookie's `v` is checked against; bumped by a reset, a password change or « Se déconnecter partout ailleurs » (STATE.md §4-L L1). |
| `0144_meal_ideas_sample_flag.sql` | `meal_ideas.is_sample` — lets the demo sandbox seed two « Idées de repas » that the `SAMPLE_TABLES` sweep can clear (stranger review 2026-10-23). |
| `0147_task_layers.sql` | `cleared_at` on `tasks` + `home_projects` (« Effacer les cochées » before the day ends, the row stays as history) and `rotation_json` + `current_idx` + `last_done_by` on `home_projects` (rotation on any recurring task, the one path in `_lib/rotation.ts`). |
| `0146_task_subject.sql` | `subject_kind` + `subject_id` on `tasks`, `todos`, `home_projects` — « Sur quoi ? », the soft subject ref of a task. No FK on purpose; `home_projects.carnet_id` stays and reads as kind `carnet` (`_lib/subject.ts`). |
| `0145_usage_browser.sql` | `usage_daily.browser_renders` — the third daily-budget meter: Browser Run renders, the recipe import's headless-browser door (`_lib/renderPage`), 20/day per household, 5 for a sandbox. |
