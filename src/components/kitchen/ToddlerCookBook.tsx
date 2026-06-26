import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { useT } from '../../i18n'
import { useSpeak } from '../../lib/speak'
import { type Recipe, recipeImg } from '../../lib/recipes'
import { pictoFor } from '../../lib/picto'
import { Icon, InlineIcon } from '../Icon'

// #45 (reframed) — the toddler's ON-SCREEN cooking book, not the printable one. A
// calm, swipeable picture book the app builds from the household's recipes: a
// cover, then one big page per recipe — its photo (or food picto), its name read
// ALOUD on arrival (in the recipe's own language, #TTS), and one big "On cuisine !"
// that hands off to the existing toddler cook stepper (CookMode, big read-aloud
// steps). Turn pages with the big ◀ ▶ or a swipe; a dot row shows where you are.
// Picture-first + hear-first (NFR-KID-2): a pre-reader never has to read.
export function ToddlerCookBook({
  recipes,
  onCook,
  onBack,
}: {
  recipes: Recipe[]
  onCook: (recipe: Recipe) => void
  onBack: () => void
}) {
  const t = useT()
  const speak = useSpeak()
  // Page 0 is the cover; pages 1..N are the recipes.
  const [idx, setIdx] = useState(0)
  const total = recipes.length + 1
  const recipe = idx > 0 ? recipes[idx - 1] : null
  const last = idx >= total - 1

  // Read the page aloud on arrival — the cover's title, or the recipe's name in its
  // own language so an English recipe isn't said with a French mouth (#TTS).
  useEffect(() => {
    if (recipe) speak(recipe.title, recipe.lang ?? undefined)
    else speak(t.recipes.bookTitle)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx])

  const go = (d: number) => setIdx((i) => Math.max(0, Math.min(total - 1, i + d)))

  // A simple horizontal swipe to turn pages (a pre-reader flips a book by swiping).
  const startX = useRef<number | null>(null)
  const onDown = (e: ReactPointerEvent) => {
    startX.current = e.clientX
  }
  const onUp = (e: ReactPointerEvent) => {
    if (startX.current == null) return
    const dx = e.clientX - startX.current
    startX.current = null
    if (dx > 60) go(-1)
    else if (dx < -60) go(1)
  }

  const img = recipe ? recipeImg(recipe.image) : null

  return (
    <section className="tbook" onPointerDown={onDown} onPointerUp={onUp}>
      {/* Small, quiet exit back to the kitchen — the kid surface keeps one way out. */}
      <button type="button" className="tbook__close" onClick={onBack} aria-label={t.common.back}>
        <Icon name="x-bold" size={22} />
      </button>

      <div className="tbook__page" key={idx}>
        {recipe ? (
          <>
            <button
              type="button"
              className="tbook__art"
              onClick={() => speak(recipe.title, recipe.lang ?? undefined)}
              aria-label={recipe.title}
            >
              {img ? <img src={img} alt="" /> : <span className="tbook__picto">{pictoFor(recipe.title, '🍽')}</span>}
            </button>
            <h2 className="tbook__title">{recipe.title}</h2>
            <button type="button" className="tbook__cook" onClick={() => onCook(recipe)}>
              👩‍🍳 {t.recipes.bookCook}
            </button>
          </>
        ) : (
          <button type="button" className="tbook__cover" onClick={() => speak(t.recipes.bookTitle)} aria-label={t.recipes.bookTitle}>
            <span className="tbook__cover-art" aria-hidden="true">🍎 🥕 🧁</span>
            <span className="tbook__cover-title">{t.recipes.bookTitle}</span>
            <span className="tbook__cover-sub mono">{t.recipes.bookCount(recipes.length)}</span>
          </button>
        )}
      </div>

      <div className="tbook__nav">
        <button type="button" className="tbook__turn" onClick={() => go(-1)} disabled={idx === 0} aria-label={t.shop.prev}>
          <Icon name="arrow-left-bold" size={34} />
        </button>
        <div className="tbook__dots" aria-hidden="true">
          {Array.from({ length: total }, (_, i) => (
            <span key={i} className={'tbook__dot' + (i === idx ? ' is-on' : '')} />
          ))}
        </div>
        <button type="button" className="tbook__turn" onClick={() => go(1)} disabled={last} aria-label={t.shop.next}>
          <Icon name="arrow-right-bold" size={34} />
        </button>
      </div>

      <button type="button" className="kid-pick__back mono tbook__back" onClick={onBack}>
        <InlineIcon name="arrow-left-bold" /> {t.common.back}
      </button>
    </section>
  )
}
