import { useT } from '../../i18n'
import { OperatorSection } from './OperatorSection'
import { InlineIcon } from '../Icon'
import { isGuest, isPaired } from '../../lib/device'
import { useOnline } from '../../lib/online'

// « Emporter mes données » (bmad/08 E-35) — one button, one JSON: everything the
// household holds (+ an R2 media manifest), served by GET /api/takeout with a
// content-disposition so the browser saves it as a file. A Loi 25 gesture, a
// trust signal, and the household's own backup story (a nightly R2 copy also
// runs server-side — E-36). Operator-only: the endpoint 403s a kiosk/guest
// credential, so the section hides on those (a paired kiosk has no operator
// cookie; a guest is read-only).
export function TakeoutSection() {
  const t = useT()
  const online = useOnline()
  if (isGuest() || isPaired()) return null
  return (
    <OperatorSection title={t.operator.takeoutTitle}>
      <p className="operator__hint mono">{t.operator.takeoutHint}</p>
      {/* A plain link: GET rides the operator session cookie, and the endpoint's
          content-disposition makes it a straight download. Online-only (there is
          no offline dump to give). */}
      {online ? (
        <a className="btn" href="/api/takeout" download>
          <InlineIcon name="download-simple-bold" /> {t.operator.takeoutBtn}
        </a>
      ) : (
        <p className="operator__hint mono">{t.offline.unavailable}</p>
      )}
    </OperatorSection>
  )
}
