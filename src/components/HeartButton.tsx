import { useQuery } from '@tanstack/react-query'
import { useT } from '../i18n'
import { api } from '../lib/api'
import { useProfile } from '../lib/profile'
import { useLoves } from '../lib/loves'
import { imgUrl } from '../lib/image'
import { Icon } from './Icon'

// The ❤ on a recipe (or a planned meal linked to one) — family "favorites" (#21).
// Shows WHICH faces loved it (small dots, never a count). The add/remove toggle
// only appears when a real face is picked: as "Maisonnée" there's no "you" to
// attribute, so hearts are shown read-only (Marc's rule). A loved-by-nobody recipe
// shows nothing in Maisonnée, and an empty outline heart when a face is active.
interface Member {
  id: string
  display_name: string
  avatar_kind: string
  avatar_ref: string
  colour: string
}

const TERRA = '#c2563a'

export function HeartButton({ recipeId }: { recipeId: string }) {
  const t = useT()
  const { memberId } = useProfile()
  const { loversOf, toggle } = useLoves()
  const { data } = useQuery({ queryKey: ['members'], queryFn: () => api<{ members: Member[] }>('members') })
  const members = data?.members ?? []

  const lovers = loversOf(recipeId)
  const loved = lovers.length > 0
  const mine = !!memberId && lovers.includes(memberId)
  const faces = lovers.map((id) => members.find((m) => m.id === id)).filter((m): m is Member => !!m)

  const dots = faces.length > 0 && (
    <span className="hearts__faces" aria-hidden="true">
      {faces.slice(0, 4).map((m) => {
        const photo = m.avatar_kind === 'photo' && m.avatar_ref ? imgUrl(m.avatar_ref) : null
        return (
          <span key={m.id} className="hearts__face" style={{ background: photo ? undefined : m.colour }}>
            {photo ? <img src={photo} alt="" /> : (m.display_name?.[0] ?? '?').toUpperCase()}
          </span>
        )
      })}
    </span>
  )

  // Maisonnée (no face): read-only — show the hearts but offer no toggle.
  if (!memberId) {
    if (!loved) return null
    return (
      <span className="hearts hearts--ro" aria-label={t.loves.lovedBy}>
        <Icon name="heart-fill" size={16} color={TERRA} />
        {dots}
      </span>
    )
  }

  return (
    <span className="hearts">
      <button
        type="button"
        className={'hearts__btn' + (mine ? ' is-mine' : '')}
        onClick={() => toggle(recipeId, mine)}
        aria-pressed={mine}
        aria-label={mine ? t.loves.unlove : t.loves.love}
        title={mine ? t.loves.unlove : t.loves.love}
      >
        <Icon name={loved ? 'heart-fill' : 'heart-bold'} size={18} color={loved ? TERRA : 'currentColor'} />
      </button>
      {dots}
    </span>
  )
}
