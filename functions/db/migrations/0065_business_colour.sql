-- Give a « Le cercle » Business its own colour (like a member's), so a vet/plumber
-- card and every rendez-vous linked to it read with one consistent tint across the
-- app — the businesses row + detail peek, and the event on the board, the calendar
-- (Mois), the day page, the agenda and the departure list. Forward-only, nullable;
-- existing businesses keep NULL → the UI falls back to the teal default.
ALTER TABLE businesses ADD COLUMN colour TEXT;
