import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useLang, useT } from '../i18n'
import { useSpeak } from '../lib/speak'
import { api } from '../lib/api'
import { live } from '../lib/query'
import { imgUrl } from '../lib/image'
import { useSceneClose, useEscapeKey } from '../lib/sceneNav'
import { CERCLE_KEY } from '../lib/queryKeys'
import { SceneHead } from '../components/SceneHead'
import { SeekGame } from '../components/jouer/SeekGame'
import { DayTimeline } from '../components/jouer/DayTimeline'
import { BirthdayCountdown } from '../components/jouer/BirthdayCountdown'
import {
  type Contact,
  type Member,
  type ContactLink,
  type ContactGroupRaw,
  type Pet,
  unifyCircle,
} from '../lib/cercle'
import { buildSeekDecks, type SeekPerson } from '../lib/playContent'

// /jouer — « Jouer », the toddler play space (a full-screen scene, reached from a big
// door on the toddler board). A calm menu of cross-theme TOYS built from the real
// household: « Cherche et trouve » (find-it), « Notre journée » (the day timeline),
// « Les fêtes » (birthday countdown). All hear-first, big taps, and — by design — no
// score, no fail, nothing saved (NFR-CALM). The ✕ steps back to the menu, then out.
type Activity = 'menu' | 'seek' | 'day' | 'fete'

interface CercleData {
  contacts: Contact[]
  members: Member[]
  links: ContactLink[]
  groups: ContactGroupRaw[]
  pets: Pet[]
}

export function JouerPage() {
  const t = useT()
  const { lang } = useLang()
  const speak = useSpeak()
  const p = t.play
  const close = useSceneClose('/board')
  useEscapeKey(close)
  const [act, setAct] = useState<Activity>('menu')

  // Faces deck for « Cherche et trouve » comes from the unified cercle people; the
  // fixed decks (animals/colours/foods/weather) need no household data, so the game
  // works even before this loads.
  const { data } = useQuery({ queryKey: CERCLE_KEY, queryFn: () => api<CercleData>('cercle'), ...live })
  const decks = useMemo(() => {
    const people = data ? unifyCircle(data.contacts, data.members, data.links ?? [], [], data.pets).people : []
    const seekPeople: SeekPerson[] = people.map((pp) => ({
      key: pp.key,
      firstName: pp.firstName,
      photo: pp.avatarKind === 'photo' && pp.avatarRef ? imgUrl(pp.avatarRef) : null,
      color: pp.colour,
    }))
    return buildSeekDecks(seekPeople, lang, {
      faces: p.seek.deckFaces,
      animals: p.seek.deckAnimals,
      colors: p.seek.deckColors,
      foods: p.seek.deckFoods,
      weather: p.seek.deckWeather,
      mix: p.seek.deckMix,
    })
  }, [data, lang, p])

  const ACTS: { key: Activity; emoji: string; label: string; hint: string }[] = [
    { key: 'seek', emoji: '🔍', label: p.seek.title, hint: p.seek.menuHint },
    { key: 'day', emoji: '🕗', label: p.day.title, hint: p.day.menuHint },
    { key: 'fete', emoji: '🎂', label: p.fete.title, hint: p.fete.menuHint },
  ]
  const open = (a: Activity, label: string) => {
    speak(label)
    setAct(a)
  }
  const headTitle = act === 'menu' ? p.title : ACTS.find((a) => a.key === act)?.label ?? p.title

  return (
    <div className="scene scene--play" aria-label={p.title}>
      <SceneHead title={headTitle} icon="smiley-bold" card="board" onClose={act === 'menu' ? close : () => setAct('menu')} />
      <div className="scene__body scene__body--play">
        {act === 'menu' && (
          <div className="play-menu">
            <button type="button" className="sayable play-menu__title" onClick={() => speak(p.intro)}>
              {p.intro}
            </button>
            <div className="play-menu__doors">
              {ACTS.map((a) => (
                <button key={a.key} type="button" className="play-door" onClick={() => open(a.key, a.label)} aria-label={a.label}>
                  <span className="play-door__emoji" aria-hidden="true">{a.emoji}</span>
                  <span className="play-door__label">{a.label}</span>
                  <span className="play-door__hint mono">{a.hint}</span>
                </button>
              ))}
            </div>
          </div>
        )}
        {act === 'seek' && <SeekGame decks={decks} />}
        {act === 'day' && <DayTimeline />}
        {act === 'fete' && <BirthdayCountdown />}
      </div>
    </div>
  )
}
