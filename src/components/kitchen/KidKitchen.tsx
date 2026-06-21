import { useMemo, useState } from 'react'
import { useLang, useT } from '../../i18n'
import { formatWeekday } from '../../lib/format'
import { pictoFor } from '../../lib/picto'
import { type Recipe, recipeImg } from '../../lib/recipes'
import { isGuest } from '../../lib/device'
import { BigTiles, Sayable, type Tile } from '../BigTiles'
import { InlineIcon } from '../Icon'
import { buildCollections } from './CollectionPicker'
import { KidCollections } from './KidCollections'
import { ToddlerCookBook } from './ToddlerCookBook'
import { type MealRow, type WeekDay } from './types'

// Toddler lens on the kitchen: just "what's for supper" this week, big and
// read-aloud, plus the picture-first meal picker. Each supper draws its own food
// picture (pictoFor) so a pre-reader sees pizza/soup/chicken — not seven
// identical plates. A child's pick is a SUGGESTION (onSuggest) — it only fills
// an empty day; planned days grey out and stay read-only.
export function KidKitchen({
  week,
  recipes,
  recipeFor,
  onSuggest,
  onStartRecipe,
}: {
  week: WeekDay[]
  recipes: Recipe[]
  recipeFor: (meal: MealRow) => Recipe | undefined
  onSuggest: (date: number, recipe: Recipe) => void
  onStartRecipe: (recipe: Recipe) => void
}) {
  const t = useT()
  const { lang } = useLang()
  // Read-only guest (toddler lens handed to a sitter): the picture-pick "suggest a
  // meal onto a day" flow commits a write, so hide it. The planned-supper tiles stay
  // — tapping one only reads it aloud / opens Cook mode (a read).
  const ro = isGuest()
  // The recipe a child has tapped and is now choosing a day for (null = still
  // browsing the recipe shelf).
  const [kidRecipe, setKidRecipe] = useState<Recipe | null>(null)
  // #11 toddler collections: false = the normal supper view (this week + the flat
  // recipe shelf), true = the hear-first collections flow (KidCollections). A door
  // INTO the same pick-a-recipe-onto-a-day act, surfaced as one extra big tile so
  // the existing abilities (hear the week, pick any recipe) are never displaced.
  const [browsing, setBrowsing] = useState(false)
  // The on-screen toddler cookbook (a swipeable picture book of the recipes,
  // read aloud) — a door tile opens it; it takes over the kid surface like collections.
  const [bookOpen, setBookOpen] = useState(false)

  // Collections exist when at least one tag groups one or more recipes — only then
  // is the "Les collections" door worth showing (NFR-CALM: no empty affordances).
  const hasCollections = useMemo(() => buildCollections(recipes).length > 0, [recipes])

  // The toddler lens is just "this week": the next 7 days, one of each weekday.
  // (The parent grid runs a longer 10-day countdown, but two "Mardi" tiles would
  // confuse a pre-reader picking a day by sight — and read-aloud — so the kid
  // view stays a single, unambiguous week.)
  const days7 = week.slice(0, 7)

  // A planned supper that maps to a saved recipe is tappable: hear "Jeudi :
  // Spaghetti" first, then a second tap STARTS the recipe (Cook mode — big
  // read-aloud steps). Planned meals with no matching recipe stay read-aloud only.
  const planned: Tile[] = days7
    .filter((d) => d.meal)
    .map((d) => {
      const recipe = recipeFor(d.meal!)
      return {
        key: String(d.date),
        icon: pictoFor(d.meal!.title, '🍽'),
        label: d.meal!.title,
        sub: formatWeekday(d.date, lang),
        narration: `${formatWeekday(d.date, lang)}: ${d.meal!.title}`,
        confirmHint: recipe ? t.kid.tapToCook : undefined,
        onTap: recipe ? () => onStartRecipe(recipe) : undefined,
      }
    })
  // The picker: tap a recipe to hear it (BigTiles speaks on tap) and choose it,
  // then tap a day to wish it for that day. A child's pick is an IDEA, not a plan —
  // it drops into the parent's "Idées de repas" pool as "<recipe> (Mardi)" rather
  // than scheduling the real supper (see kidSuggest). The day tile's narration
  // ("Lundi: Pizza") doubles as the spoken confirmation. Real photo when the recipe
  // has one, the food picto as fallback (NFR-KID-2: pick by sight, never reading).
  // The flat recipe shelf, with the "Les collections" door as its FIRST tile when
  // collections exist — a calm one-tap (hear "Les collections", tap again to open)
  // that leads into the by-collection browse, leaving every recipe still reachable
  // straight from this shelf below it.
  const recipeShelf: Tile[] = recipes.map((r) => ({
    key: r.id,
    image: recipeImg(r.image),
    icon: pictoFor(r.title, '🍽'),
    label: r.title,
    lang: r.lang ?? undefined, // read an English recipe's name in English (#TTS)
    onTap: () => setKidRecipe(r),
  }))
  // The recipe shelf, led by a "Mon livre" door (the picture cookbook) and, when
  // there are tags, the "Les collections" door — both calm hear-then-open tiles.
  const bookDoor: Tile = {
    key: '__book__',
    icon: '📖',
    label: t.kid.book,
    onTap: () => setBookOpen(true),
    confirmHint: t.recipes.collectionTapToOpen,
  }
  const collectionsDoor: Tile = {
    key: '__collections__',
    icon: '📚',
    label: t.kid.collections,
    onTap: () => setBrowsing(true),
    confirmHint: t.recipes.collectionTapToOpen,
  }
  const recipeTiles: Tile[] = [bookDoor, ...(hasCollections ? [collectionsDoor] : []), ...recipeShelf]
  const dayTiles: Tile[] = kidRecipe
    ? days7.map(({ date, meal }) => ({
        key: String(date),
        icon: meal ? pictoFor(meal.title, '🍽') : '📅',
        label: formatWeekday(date, lang),
        sub: meal?.title,
        // A planned day is "taken" — greyed and read-only (tapping just reads the
        // meal that's already there). Only empty days accept the suggestion.
        done: !!meal,
        narration: meal
          ? `${formatWeekday(date, lang)}: ${meal.title}`
          : `${formatWeekday(date, lang)}: ${kidRecipe.title}`,
        onTap: meal
          ? undefined
          : () => {
              setKidRecipe(null)
              onSuggest(date, kidRecipe)
            },
      }))
    : []

  // The picture cookbook takes over the whole kid surface — a calm, one-page-at-a-
  // time read; cooking a page hands off to the toddler cook stepper (onStartRecipe).
  if (bookOpen) {
    return (
      <main className="kid__main kid__main--feed">
        <ToddlerCookBook recipes={recipes} onCook={onStartRecipe} onBack={() => setBookOpen(false)} />
      </main>
    )
  }

  // The collections door takes over the whole kid surface while open — a focused,
  // one-thing-at-a-time stage for a pre-reader (the supper week is one ← tap away).
  if (browsing) {
    return (
      <main className="kid__main kid__main--feed">
        <KidCollections recipes={recipes} week={week} onSuggest={onSuggest} onBack={() => setBrowsing(false)} />
      </main>
    )
  }

  return (
    <main className={`kid__main${recipes.length > 0 ? ' kid__main--feed' : ''}`}>
      <div className="kid-head">
        <span className="kid-head__emoji" aria-hidden="true">🍲</span>
        <Sayable className="kid-head__title" text={t.kid.supper} />
      </div>
      <BigTiles tiles={planned} empty={t.board.nothingTonight} />

      {!ro && recipes.length > 0 &&
        (kidRecipe ? (
          <section className="kid-pick">
            <div className="kid-head">
              <span className="kid-head__emoji" aria-hidden="true">
                {pictoFor(kidRecipe.title, '🍽')}
              </span>
              <Sayable className="kid-head__title" text={t.kid.whichDay} />
            </div>
            <BigTiles tiles={dayTiles} />
            <button type="button" className="kid-pick__back mono" onClick={() => setKidRecipe(null)}>
              <InlineIcon name="arrow-left-bold" /> {t.kid.back}
            </button>
          </section>
        ) : (
          <section className="kid-pick">
            <div className="kid-head">
              <span className="kid-head__emoji" aria-hidden="true">📖</span>
              <Sayable className="kid-head__title" text={t.kid.pickMeal} />
            </div>
            <BigTiles tiles={recipeTiles} />
          </section>
        ))}
    </main>
  )
}
