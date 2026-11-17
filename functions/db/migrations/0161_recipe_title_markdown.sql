-- A recipe title imported with its Markdown heading mark (review 2026-11-17, #13).
--
-- « # Tarte au gruau » came out of a model's transcript and was saved as written: it
-- sorted FIRST in the A–Z book (the list is ORDER BY title) and was read aloud with its
-- hash. Imports and saves now drop the mark (functions/_lib/recipeText.ts
-- `cleanRecipeTitle`), and every read cleans it too; this rewrites the titles already
-- stored so the server's order is right as well.
--
-- Same rule as cleanRecipeTitle: only a run of '#' FOLLOWED BY A SPACE is a heading mark,
-- so « #1 des tartes » is left alone, and a title that would be empty is never written.
UPDATE recipes
SET title = TRIM(LTRIM(title, '#'))
WHERE title LIKE '#%'
  AND LTRIM(title, '#') LIKE ' %'
  AND TRIM(LTRIM(title, '#')) <> '';
