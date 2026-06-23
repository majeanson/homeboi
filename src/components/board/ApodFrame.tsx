import { useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { useApodEnabled } from '../../lib/apod'
import { useAudience } from '../../lib/audience'
import { useSpeak } from '../../lib/speak'
import { useT } from '../../i18n'
import { ZoomableImg } from '../ZoomableImg'
import { Icon } from '../Icon'

// The board's calm daily-wonder band. One image + caption that the household can
// shuffle between free sources — Bing's photo of the day (curated landscapes),
// Wikipedia's Picture of the Day, NASA's APOD (space), EPIC (Earth today), and the
// Mars rover — for a little daily wonder on the wall.
export type WonderSource = 'bing' | 'wiki' | 'apod' | 'epic' | 'mars'
// The sources the shuffle button rotates through. All are safe to request: the
// /api/wonder endpoint falls back to a reliable source and returns whatever IS
// available, so asking for a down feed (NASA's APOD often 503s, Mars is often dead)
// still yields a working picture — labelled by the source that answered.
const SOURCES: WonderSource[] = ['bing', 'wiki', 'apod', 'epic', 'mars']

export interface Wonder {
  source: WonderSource
  title: string
  explanation: string
  // The language the text is actually in — so it's READ ALOUD with a matching voice
  // (APOD is always English; an English blurb in a French voice is gibberish).
  lang: 'fr' | 'en'
  imgUrl: string
  copyright?: string
}

const SIX_HOURS = 6 * 60 * 60 * 1000

// The presentational band: the image + a localized kicker per source, the title, an
// optional clamped blurb that expands, a 🔊 hear button (reads in the text's own
// language), an optional credit, and a small corner shuffle button (the family-photo
// frame's "Une autre photo" idiom) to jump to another source. Pure (takes its data +
// onShuffle as props) so it renders in /dev/kit with a sample.
//
// Audience-aware: a pre-reader gets a single big tap-to-hear tile; a capable reader
// gets the full band. The shuffle button sits OUTSIDE the toddler tile button (a
// button can't nest inside another button) yet over the image, so both lenses work.
export function WonderBand({ wonder, onShuffle }: { wonder: Wonder; onShuffle?: () => void }) {
  const t = useT()
  const speak = useSpeak()
  const { audience } = useAudience()
  const [expanded, setExpanded] = useState(false)
  const kicker = t.board.wonderKicker[wonder.source]
  // Some sources (wiki) carry no separate blurb — the caption IS the title — so we
  // hide the paragraph + "read more" rather than repeat the title underneath it.
  const blurb = wonder.explanation.trim()
  const say = blurb ? `${wonder.title}. ${blurb}` : wonder.title

  const shuffleBtn = onShuffle && (
    <button
      type="button"
      className="photo-frame__shuffle"
      onClick={onShuffle}
      aria-label={t.board.shuffleWonder}
      title={t.board.shuffleWonder}
    >
      <Icon name="repeat-bold" size={18} />
    </button>
  )

  if (audience === 'toddler') {
    return (
      <div className="photo-frame apod apod--kid-wrap">
        <button
          type="button"
          className="apod--kid"
          onClick={() => speak(say, wonder.lang)}
          aria-label={`${kicker}: ${wonder.title}`}
        >
          <img src={wonder.imgUrl} alt={wonder.title} className="apod__img" />
          <span className="apod__cap apod__cap--kid">
            <span className="apod__kicker mono">{kicker}</span>
            <span className="apod__name">{wonder.title}</span>
          </span>
        </button>
        {shuffleBtn}
      </div>
    )
  }

  return (
    <div className="photo-frame apod">
      <ZoomableImg src={wonder.imgUrl} alt={wonder.title} className="apod__img" />
      {shuffleBtn}
      <div className="apod__cap">
        <span className="apod__kicker mono">{kicker}</span>
        <div className="apod__head">
          <h3 className="apod__name">{wonder.title}</h3>
        </div>
        {blurb && (
          <>
            <p className={`apod__text${expanded ? ' is-open' : ''}`}>{blurb}</p>
            <button type="button" className="apod__more mono" onClick={() => setExpanded((v) => !v)}>
              {expanded ? t.board.apodReadLess : t.board.apodReadMore}
            </button>
          </>
        )}
        {wonder.copyright && <p className="apod__credit mono">© {wonder.copyright}</p>}
      </div>
    </div>
  )
}

// The board's calm "Photo du jour" daily-wonder band — one image + caption that the
// household can shuffle between sources, for a little daily wonder on the wall.
//
// NOT a live-polled query — it's an external once-a-day feed (like the weather chip),
// so it refetches lazily every 6 h. Each source is cached under its own key; on
// shuffle the query swaps key, and we KEEP THE LAST GOOD PICTURE on screen while the
// next source loads (a new key has no data yet — without this the band would blink
// out on every shuffle). Silent no-op only until the FIRST picture arrives, or when
// the device opted out (NFR-DEGRADE).
// The fetch + shuffle behaviour, as a hook so it can drive BOTH the standalone band
// (WonderFrame, toddler board) AND the board's weather card backdrop (Board.tsx) off
// the same once-a-day, last-frame-kept logic. `wonder` is null until the first
// picture arrives or when the device opted out.
export function useWonder(): { wonder: Wonder | null; shuffle: () => void } {
  const enabled = useApodEnabled()
  const [source, setSource] = useState<WonderSource>('bing')
  const { data } = useQuery({
    queryKey: ['wonder', source],
    queryFn: () => api<{ wonder: Wonder | null }>(`wonder?source=${source}`),
    enabled,
    staleTime: SIX_HOURS,
    refetchInterval: SIX_HOURS,
    retry: false,
  })

  // Remember the last picture that loaded, so switching source (a fresh, empty query
  // key) shows the previous frame instead of vanishing until the new one arrives.
  const lastGood = useRef<Wonder | null>(null)
  if (data?.wonder) lastGood.current = data.wonder
  const wonder = enabled ? (data?.wonder ?? lastGood.current) : null

  // Jump to a random source OTHER than the one showing (mirrors PhotoFrame's shuffle).
  const shuffle = () => {
    const others = SOURCES.filter((s) => s !== source)
    setSource(others[Math.floor(Math.random() * others.length)])
  }

  return { wonder, shuffle }
}

export function WonderFrame() {
  const { wonder, shuffle } = useWonder()
  if (!wonder) return null
  return <WonderBand wonder={wonder} onShuffle={shuffle} />
}
