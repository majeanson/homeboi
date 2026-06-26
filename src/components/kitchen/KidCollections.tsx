import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useLang, useT } from '../../i18n'
import { api } from '../../lib/api'
import { formatWeekday } from '../../lib/format'
import { pictoFor } from '../../lib/picto'
import { type Recipe, type RecipeTagsData, RECIPE_TAGS_KEY, recipeImg, tagOptions } from '../../lib/recipes'
import { BigTiles, Sayable, type Tile } from '../BigTiles'
import { InlineIcon } from '../Icon'
import { buildCollections } from './CollectionPicker'
import { type WeekDay } from './types'

// #11 toddler "collections" — the pre-reader's hear-first walk through the recipe
// book BY COLLECTION (the existing recipe tag system, reused as a browse layer; no
// migration, no endpoint). Three stages, every step picture-first + read-aloud +
// arm-then-commit (BigTiles): the kid HEARS what a tile is before a second tap acts.
//
//   1. Collections — one big tile per tag (cover = its first recipe's photo,
//      pictoFor fallback). Tap to hear "Soupes", tap again to open it.
//   2. Recipes — the recipes carrying that tag. Tap to hear the title, tap again
//      to choose → the day picker. A big, obvious ← back tile returns to stage 1.
//   3. Day — this week's seven days; an already-planned day is greyed/read-only,
//      an empty day accepts the pick. Committing calls `onSuggest` (the SAME
//      meal-plan plumbing KidKitchen uses — useMealPlanning.kidSuggest), so the
//      child's choice lands as a suggestion exactly like the all-recipes flow.
//
// Mirrors KidKitchen's grammar deliberately (BigTiles, Sayable headings, days7,
// the suggestion-not-decision day picker) — collections are just a different DOOR
// into the same pick-a-recipe-onto-a-day act, not a new interaction model.
export function KidCollections({
  recipes,
  week,
  onSuggest,
  onBack,
}: {
  recipes: Recipe[]
  week: WeekDay[]
  // Plan the chosen recipe onto a day — the shared kidSuggest write (fills an
  // empty day only, records "suggested by"). Identical to KidKitchen's onSuggest.
  onSuggest: (date: number, recipe: Recipe) => void
  // Leave the collections flow back to KidKitchen's main supper view. Optional —
  // when absent (e.g. collections-only surfacing) the back tile is hidden.
  onBack?: () => void
}) {
  const t = useT()
  const { lang } = useLang()
  // Stage cursor: which collection (tag) is open, then which recipe is chosen.
  // null/null = stage 1; tag set = stage 2; tag + recipe = stage 3 (day picker).
  const [openTag, setOpenTag] = useState<string | null>(null)
  const [kidRecipe, setKidRecipe] = useState<Recipe | null>(null)

  // Follow the household's curated tag order (same as the parent recipe book), so
  // the toddler's collection tiles match what the operator arranged in Réglages.
  const tagsData = useQuery({ queryKey: RECIPE_TAGS_KEY, queryFn: () => api<RecipeTagsData>('recipe-tags') }).data
  const tagOrder = useMemo(() => tagOptions(tagsData?.presets ?? [], [], t.recipes.tagPresets), [tagsData?.presets, t.recipes.tagPresets])
  const collections = useMemo(() => buildCollections(recipes, tagOrder), [recipes, tagOrder])

  // The same single, unambiguous week KidKitchen uses (two "Mardi" tiles would
  // confuse a pre-reader picking a day by sight + sound).
  const days7 = week.slice(0, 7)

  // The recipes carrying the open tag (lowercase match, the matching used
  // everywhere else for tags).
  const inTag = useMemo(() => {
    if (!openTag) return []
    const key = openTag.toLowerCase()
    return recipes.filter((r) => (r.tags ?? []).some((tg) => tg.toLowerCase() === key))
  }, [recipes, openTag])

  // Stage 1 — collection tiles. Cover photo when the lead recipe has one, the
  // tag's food picto as the fallback (NFR-KID-2: by sight, never by reading).
  const collectionTiles: Tile[] = collections.map((c) => ({
    key: c.tag,
    image: c.coverImage,
    icon: pictoFor(c.tag, '🍽'),
    label: c.tag,
    onTap: () => {
      setOpenTag(c.tag)
      setKidRecipe(null)
    },
    confirmHint: t.recipes.collectionTapToOpen,
  }))

  // Stage 2 — the recipes inside the open collection. Tap hears the title, tap
  // again chooses it → the day picker (stage 3).
  const recipeTiles: Tile[] = inTag.map((r) => ({
    key: r.id,
    image: recipeImg(r.image),
    icon: pictoFor(r.title, '🍽'),
    label: r.title,
    lang: r.lang ?? undefined, // read an English recipe's name in English (#TTS)
    onTap: () => setKidRecipe(r),
  }))

  // Stage 3 — this week's days. A planned day is "taken" (greyed, read-only —
  // tapping just reads what's already there); an empty day accepts the pick and
  // fires onSuggest, the same write KidKitchen uses.
  const dayTiles: Tile[] = kidRecipe
    ? days7.map(({ date, meal }) => ({
        key: String(date),
        icon: meal ? pictoFor(meal.title, '🍽') : '📅',
        label: formatWeekday(date, lang),
        sub: meal?.title,
        done: !!meal,
        narration: meal
          ? `${formatWeekday(date, lang)}: ${meal.title}`
          : `${formatWeekday(date, lang)}: ${kidRecipe.title}`,
        onTap: meal
          ? undefined
          : () => {
              const r = kidRecipe
              setKidRecipe(null)
              onSuggest(date, r)
            },
      }))
    : []

  // Stage 3: day picker.
  if (kidRecipe) {
    return (
      <section className="kid-pick">
        <div className="kid-head">
          <span className="kid-head__emoji" aria-hidden="true">
            {pictoFor(kidRecipe.title, '🍽')}
          </span>
          <Sayable className="kid-head__title" text={t.kid.whichDay} />
        </div>
        <BigTiles tiles={dayTiles} />
        <button type="button" className="kid-pick__back mono" onClick={() => setKidRecipe(null)}>
          <InlineIcon name="arrow-left-bold" /> {t.common.back}
        </button>
      </section>
    )
  }

  // Stage 2: recipes inside a collection.
  if (openTag) {
    return (
      <section className="kid-pick">
        <div className="kid-head">
          <span className="kid-head__emoji" aria-hidden="true">
            {pictoFor(openTag, '🍽')}
          </span>
          <Sayable className="kid-head__title" text={openTag} />
        </div>
        <BigTiles tiles={recipeTiles} empty={t.kid.collectionPick} />
        {/* Big, obvious back to the collections — a pre-reader needs an unmistakable
            way out, so it's a full-width text row like KidKitchen's back. */}
        <button type="button" className="kid-pick__back mono" onClick={() => setOpenTag(null)}>
          <InlineIcon name="arrow-left-bold" /> {t.kid.backCollections}
        </button>
      </section>
    )
  }

  // Stage 1: the collections.
  return (
    <section className="kid-pick">
      <div className="kid-head">
        <span className="kid-head__emoji" aria-hidden="true">📚</span>
        <Sayable className="kid-head__title" text={t.kid.whichCollection} />
      </div>
      <BigTiles tiles={collectionTiles} empty={t.recipes.collectionsEmpty} />
      {onBack && (
        <button type="button" className="kid-pick__back mono" onClick={onBack}>
          <InlineIcon name="arrow-left-bold" /> {t.common.back}
        </button>
      )}
    </section>
  )
}
