# bmad/history — finished ledgers

Documents in this folder are **closed**. They hold verdicts, not work.

They were moved out of the repo root on 2026-08-28 because the root read as thirteen
live documents when three of them had nothing left to do — and a session that opens a
closed ledger looking for "what's next" wastes its first hour. `STATE.md` is the front
door; it points here.

**They are kept, not deleted, for one reason:** each records *why* something was
decided, including the alternatives that were rejected. That is what stops the same
question being re-litigated six weeks later, and it is only useful if it stays
greppable. Requirement tags (`bmad/12 #25`, `UNIFORMIZING.md Part I §5`) still resolve
by name — `grep -r "<tag>" bmad/` finds them here exactly as before.

| File | What it was | Closed |
| --- | --- | --- |
| `UNIFORMIZING.md` | The 2026-06 uniformization ledger — schema conventions, component convergence, class-name families. Its successor is `PARITY.md`. | Fully executed; zero open items |
| `AUJOURDHUI.md` | The board / « Aujourd'hui » backlog. | 2026-08-28, when the last box (`ARM_MS`, declined) was answered |
| `12-ui-polish-queue.md` | 12 Marc-approved contained UI wins. | 2026-08-27 — all twelve shipped |

**Do not mine these for work.** If something here looks open, it is a box that was
never ticked, not a task — check the code first (that mistake accounts for roughly a
third of everything picked up in the two sweeps that preceded this folder).
