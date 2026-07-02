-- Extend the sample/demo data (onboarding) to the deeper sections so a fresh
-- household's demo feels alive everywhere a curious user explores — Le cercle
-- (extended relatives + a family tree), a pet, the vet, a home carnet with its
-- upkeep, recipe hearts, a « mot » waiting on a face, and a trip. Same `is_sample`
-- tag as migration 0096, so « Vider les exemples » still removes ONLY the demo.
-- Forward-only; default 0 so every existing (and hand-added) row reads as real.
-- Ordinary boolean flag — the calm-tenet test is untouched.
ALTER TABLE contacts       ADD COLUMN is_sample INTEGER NOT NULL DEFAULT 0;
ALTER TABLE contact_links  ADD COLUMN is_sample INTEGER NOT NULL DEFAULT 0;
ALTER TABLE pets           ADD COLUMN is_sample INTEGER NOT NULL DEFAULT 0;
ALTER TABLE businesses     ADD COLUMN is_sample INTEGER NOT NULL DEFAULT 0;
ALTER TABLE carnets        ADD COLUMN is_sample INTEGER NOT NULL DEFAULT 0;
ALTER TABLE care_log       ADD COLUMN is_sample INTEGER NOT NULL DEFAULT 0;
ALTER TABLE home_projects  ADD COLUMN is_sample INTEGER NOT NULL DEFAULT 0;
ALTER TABLE recipe_loves   ADD COLUMN is_sample INTEGER NOT NULL DEFAULT 0;
ALTER TABLE mots           ADD COLUMN is_sample INTEGER NOT NULL DEFAULT 0;
ALTER TABLE trips          ADD COLUMN is_sample INTEGER NOT NULL DEFAULT 0;
