import { useQuery } from '@tanstack/react-query'
import { useT, useLang } from '../../i18n'
import { api } from '../../lib/api'
import { useProfile } from '../../lib/profile'
import { useMots, savedMots, motLabel } from '../../lib/mots'
import { useGallery } from '../../lib/drawingGallery'
import { usePhotos } from '../../lib/photoGallery'
import { imgUrl } from '../../lib/image'
import { MEMBERS_KEY } from '../../lib/queryKeys'
import { type Member } from '../../lib/members'
import { CATS } from '../../lib/cats'
import { useReportEmpty } from '../../lib/useReportEmpty'
import { useEntityDetail } from '../detail/DetailProvider'
import { buildMot, type DetailCtx } from '../detail/adapters'
import { Section } from './Act'
import { Rail } from '../Layout'
import { ZoomableImg } from '../ZoomableImg'
import { useCardLens } from './CardLens'
import { CardMini } from './BoardCard'

// « Souvenirs » (PLAN-mots C1, accepted 2026-09-25 — « you can put the widget back »): the
// keepsake shelf, a band card beside « Mots ». What the household chose to KEEP, in one
// scrolling line: kept mots (saved_at, 0094), kept drawings and kept photos (saved_at,
// 0140). A shelf you VISIT — thumbnails and a hand-written line, tap to open — never a
// feed: no count, no « il y a un an ». Absent when nothing is kept (mode 'auto'), so it
// costs the board nothing until the first keepsake.
//
// Mots follow the face lens like the mots card (a kept mot is the recipient's); pictures
// are the household's. A read-only guest sees the pictures and not the mots — the same
// privacy line MotsCard draws (an operator can mint a showcase link to their own home).
//
// Reads: the mots cache the mots card already polls, the photo list the frame polls, and
// the gallery's own query — one request the board did not make before, on the first
// mount only (the gallery page shares the key).
export function SouvenirsCard({ readOnly = false }: { readOnly?: boolean }) {
  const t = useT()
  const { lang } = useLang()
  const { memberId: face } = useProfile()
  const lens = useCardLens()
  const detail = useEntityDetail()
  const mots = readOnly ? [] : savedMots(useMots({ live: false }), face)
  const drawings = (useGallery().data?.drawings ?? []).filter((d) => d.saved_at != null)
  const photos = (usePhotos().data?.photos ?? []).filter((p) => p.saved_at != null)
  const { data } = useQuery({ queryKey: MEMBERS_KEY, queryFn: () => api<{ members: Member[] }>('members') })
  const members = data?.members ?? []

  const empty = !mots.length && !drawings.length && !photos.length
  useReportEmpty(empty)
  if (empty) return null

  const fn = t.mots
  const ctx: DetailCtx = { t, lang, members }
  const label = (m: (typeof mots)[number]) => motLabel(m, fn)
  // Newest keepsake first, pictures and words together on one line.
  const pictures = [
    ...photos.map((p) => ({ id: `p-${p.id}`, at: p.saved_at ?? 0, src: imgUrl(p.key) })),
    ...drawings.map((d) => ({ id: `d-${d.id}`, at: d.saved_at ?? 0, src: imgUrl(d.media_key) })),
  ].sort((a, b) => b.at - a.at)

  if (lens && lens.compact && !lens.expanded) {
    return (
      <CardMini
        className={pictures.length ? 'cardmini--media' : undefined}
        label={t.boardCard.souvenirs}
        onExpand={lens.expand}
        body={
          pictures.length ? (
            <img key={pictures[0].id} className="cardmini__photo" src={pictures[0].src} alt="" loading="lazy" />
          ) : (
            <span className="souv__mot souv__mot--mini">{label(mots[0])}</span>
          )
        }
      />
    )
  }

  return (
    <Section label={t.boardCard.souvenirs} icon="hand-heart-bold" tint={CATS.cercle.color} compactItems={mots.map(label)}>
      <Rail className="souv">
        {pictures.map((p) => (
          <figure key={p.id} className="souv__tile">
            <ZoomableImg src={p.src} alt="" />
          </figure>
        ))}
        {mots.map((m) => (
          // The peek the mots card opens, read-only here: the keep / delete / reply
          // actions live on the mots card, where the mot belongs.
          <button key={m.id} type="button" className="souv__mot" onClick={() => detail.open(buildMot(m, ctx, { saved: true }))}>
            {label(m)}
          </button>
        ))}
      </Rail>
    </Section>
  )
}
