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
