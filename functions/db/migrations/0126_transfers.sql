-- « Les virements » — what each person actually sends to a shared account, and the
-- standing agreement it pays into.
--
-- The household problem this replaces: a hand-written note (« Virements ») holding a
-- mortgage payment, each person's share, and a running mental arithmetic redone every
-- two weeks before each transfer. The note drifted (it carried its own correction line:
-- « c'est pas 72 paiements de 300 mais 64 en 31 mois ») because the numbers were TYPED.
-- Here they are DERIVED: a plan states the agreement once, a transfer records what was
-- sent, and everything else is computed at read time.
--
-- CALM (NFR-CALM-1). These rows are RECEIPTS, never a score:
--   * no balance / running-total / owed column anywhere — a « reste à rattraper » is
--     derived from the recorded rows and shown folded, read-only, on ONE surface;
--   * nothing is ranked, compared or counted between people;
--   * no reminder or notification rides on a due date (the calendar shows it, the
--     « À régler » heads-up mentions it, and that is the whole of the nudging).
--
-- PRIVACY. Amounts are materially more sensitive than calendar data — the same call
-- already made for care_log invoice totals, which are kept out of a public showcase
-- link (functions/_lib/guestScope.ts). Both tables here join that deny list, and the
-- demo sandbox deliberately seeds NO money rows.

-- The standing agreement: « l'hypothèque, 812,82 $ aux deux semaines, ma part 556,41 $ ».
-- One row per recurring thing the household splits. Editing a plan never rewrites
-- history: a recorded transfer keeps the amounts it was sent with.
CREATE TABLE transfer_plans (
  id            TEXT PRIMARY KEY,
  -- soft ref (no FK), like household_preferences / a_regler_snoozes: a household is
  -- deleted by id as one explicit statement, never by cascade.
  household_id  TEXT NOT NULL,
  title         TEXT NOT NULL,                     -- « Hypothèque », « Loyer », « Garderie »
  -- The full payment, in cents. Informational: it is what the JOINT account owes the
  -- bank, not what any one person sends. NULL when the household only tracks shares.
  amount_cents  INTEGER,
  -- The schedule, as the SHARED recurrence shape every other dated thing here uses
  -- (_lib/recur `Recur` JSON: {freq:'weekly',interval:2} is « aux deux semaines »).
  -- Reused rather than re-invented so occurrences expand through the one DST-correct
  -- expander (expandRange), exactly like events / habits / home_projects. NULL = a
  -- named split with no schedule of its own.
  recur_json    TEXT,
  -- Local-midnight unix seconds of ONE known due date: the recurrence anchor.
  anchor_at     INTEGER NOT NULL,
  -- Who sends what, per occurrence: { "<member_id>": <cents> }. A JSON map rather than
  -- a junction table because it is read and written whole with the plan and carries no
  -- role, timestamp or history of its own (schema convention DB-5). Keys are SOFT
  -- member refs: a departed member's key simply stops resolving to a face.
  shares_json   TEXT NOT NULL DEFAULT '{}',
  -- Optional catch-up agreement, or '{}' when the split is plain:
  --   { behindMemberId, gapCents, asOf, termEnd }  (asOf / termEnd = local-day secs)
  -- « One of us paid more up front; the other sends extra each time until the term
  -- ends. » Stored as the AGREEMENT only — how much is caught up so far is derived
  -- from recorded transfers, never written back here.
  catchup_json  TEXT NOT NULL DEFAULT '{}',
  colour        TEXT,                              -- one spelling, per the schema conventions
  position      INTEGER NOT NULL DEFAULT 0,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER,
  deleted_at    INTEGER
);
CREATE INDEX transfer_plans_household_idx ON transfer_plans(household_id, deleted_at, position);

-- One row per transfer actually sent. Soft-deleted (like family_notes): this is the
-- household's own record of money that moved, so a mistaken tap must be recoverable.
CREATE TABLE transfers (
  id            TEXT PRIMARY KEY,
  household_id  TEXT NOT NULL,                     -- soft ref (no FK), as above
  -- The SENDER — both subject and author of the row (DB-5 pattern 1: an existing
  -- member is the one who did it). Soft ref, nulled on member delete so the record
  -- survives the person leaving. NULL reads as « Maisonnée » / unattributed.
  member_id     TEXT,
  sent_at       INTEGER NOT NULL,                  -- local-midnight unix secs of the day it was sent
  -- What the transfer was made of, as a JSON array — the breakdown that used to live in
  -- the memo and nowhere else:
  --   { "kind": "plan",  "planId": "…", "dueAt": <day secs>, "amountCents": n }
  --   { "kind": "topup",                                      "amountCents": n }
  --   { "kind": "other", "label": "…",                        "amountCents": n }
  -- A 'plan' line is the claim « this payment covers that due date », which is what
  -- makes the catch-up math and the « déjà envoyé » marks derivable. The transfer's
  -- total is the sum of its lines and is deliberately NOT stored.
  lines_json    TEXT NOT NULL DEFAULT '[]',
  memo          TEXT NOT NULL DEFAULT '',          -- the bank message as actually sent (accent-folded)
  -- The bank's own confirmation number, pasted back in afterwards. This is the whole
  -- point of the feature: the same event then exists in two places that agree, so the
  -- household record can be checked against a statement years later.
  reference     TEXT,
  note          TEXT,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER,
  deleted_at    INTEGER
);
CREATE INDEX transfers_household_idx ON transfers(household_id, deleted_at, sent_at);
