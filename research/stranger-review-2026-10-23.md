# babillard.marcportal.com — stranger review (2026-10-23)

Visited cold: landing page, « Essayer pour vrai » (a 24-hour trial household, no sign-up), the
board, La cuisine, one recipe. Phone (375 px) and desktop.

## First impression

The landing page is the best of the five sites: a clear headline (« Toute la maisonnée, d'un
coup d'œil »), a concrete claim (« Un enfant de trois ans peut faire sa routine tout seul »),
a strong « Notre promesse » block, and a no-sign-up trial. The trial itself is rich and
believable. The gap is between « d'un coup d'œil » and what the board actually shows.

## Friction, most important first

1. **« Essayer pour vrai » reads like the opposite of a demo.** Next to « Créer ma maisonnée »
   it sounds like *the real thing*. « Essayer sans compte » or « Voir une maisonnée d'essai »
   says what happens. Three equal-weight buttons also dilute the choice; make « Créer » primary,
   the trial secondary, and « J'ai déjà un compte » a text link.
2. **The board is not « d'un coup d'œil » on a phone.** The trial board is a very long scroll:
   mots, ce soir, à régler, l'auto, aujourd'hui, déjeuner, avant de partir, routines, habitudes,
   défi du jour, le point du jour, demain, décompte, à finir, à faire, à compléter, à venir,
   notes, prochain voyage… Show a curated 4–5 widget phone board in the trial, with « tout
   voir » for the rest.
3. **Help stacks up.** On La cuisine the trial welcome card, the section help card (« La
   cuisine … Faire le tour ») and the « ? » all compete. One help surface at a time; when the
   welcome checklist sent you here, skip the section card.
4. **Checklist step doesn't land on its target.** « Ouvre une recette, pars le mode cuisson »
   goes to `/kitchen` on the Repas tab; the stranger then has to guess that a meal name opens
   its recipe. Deep-link to a recipe (or pulse the first meal).
5. **Demo chores are lopsided:** « À faire » has five chores for Maman, one for Papa, two for
   Léa. A stranger *will* notice and it undercuts the calm, fair tone. Spread them.
6. **Small data inconsistencies in the demo:** the spaghetti recipe says « Cuisson 30 min »
   but the steps say « laisser mijoter 20 min »; « Idées de repas : Pas encore d'idées » on an
   otherwise pre-filled trial looks empty — seed two ideas.
7. **The checklist items use a typewriter/mono face** while the rest of the app is sans; on
   desktop it reads like a fallback font. Intentional or not, it looks unfinished.
8. **The demo wifi note shows a password** (`pommeverte2024`) — fine as fake data, but it
   models storing secrets on a wall tablet visible to guests. Maybe show a « masqué » toggle in
   the demo instead.
9. **Page `<title>` is just « Babillard»** everywhere (landing, board, kitchen). Add the section
   (« La cuisine · Babillard ») and a tagline on the landing for tabs/bookmarks/search.

## Deeper pass: a kid routine (Maison → Noah · Dodo → Faire)

1. **The big button restarts the routine right after « C'est fini ! Bravo. »** The end screen
   puts « Recommencer » exactly where « Suivant » / « J'ai fini ! » was. A three-year-old who
   taps the big round button one extra time — the very user the landing page promises — skips
   the celebration and lands back on « Le bain ». Seen live: five taps went through the whole
   routine and back to step 1. Move « Recommencer » away from the main button (small, top
   corner), or make the end screen ignore taps for a couple of seconds.
2. **Stale screen-reader text after « Recommencer »**: the screen shows « Le bain » (step 1)
   while the live region still says « Une histoire, étape 3 de 3 · on est ici ».
3. **First button is a ▷ « play » triangle**, then it becomes a green → arrow. For a parent
   watching, ▷ reads as « play audio » (there's also a speaker button at the top). Use the same
   → from step 1, or a « C'est parti » label for the adult.
4. **« Fais une routine d'enfant, étape par étape » lands on Maison**, not on a routine (same
   deep-link gap as the recipe task) — and Maison opens with yet another help card (« Maison ·
   Cinq sous-onglets · Faire le tour »).
5. **The Maison sub-tabs overflow** on a phone: « Routines · Famille · Social · Comme… » — the
   fifth (« Carnets ») is off-screen with no fade or arrow.

6. **The trial board makes ~170 requests on load** (warm cache, 1.6 MB decoded, desktop) —
   far more than any of the other four sites (20–45). Fine on Wi-Fi, but a wall tablet on a
   weak connection pays it on every reload; worth a look at what the board fetches per widget.

Good: the kid run screen is excellent — one huge picture, the word, the three steps as a strip
with « on est ici », read-aloud, nothing else on screen; « Recommencer » on completion exists
(just placed too close); routines are ordered by what comes next (Soir before Matin at noon).

## Ideas

- **A wall-tablet preview mode on the landing** (landscape frame, clock/photos screensaver) —
  « pensée pour la tablette » is the differentiator and the phone screenshot doesn't sell it.
- **« Ce que fait Babillard en 30 secondes »**: a short looping capture of dictating « dentiste
  pour Léa mardi 15h » and watching it land on the right day.
- **A kid-view button in the trial** reachable from the welcome card (the « 3-year-old does it
  alone » claim is the hook; let the stranger tap through a routine as the kid).
- **Show the 24-hour countdown** somewhere in the trial (« ta maisonnée d'essai s'efface dans
  23 h ») so « Garder ma maisonnée » has a reason now.

## Worked well

- Instant trial with real-feeling Québec data (pâté chinois, Lac Memphrémagog, Halloween
  countdown).
- Recipe view is excellent: portion stepper, metric with spoon equivalents, ingredients tied
  to steps, « Cuisiner » / « Planifier » at thumb height.
- Calm visual design, light theme, bottom nav with clear labels; no horizontal overflow.
