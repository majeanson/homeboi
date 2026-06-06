import { useNavigate } from 'react-router-dom'
import { TopBar } from '../components/TopBar'
import { useT } from '../i18n'
import { useSurface, type Surface } from '../lib/surface'
import { Icon, type IconName } from '../components/Icon'

// First-run role choice: is this a wall display or a personal phone? It's the one
// fork the rest of the flow hangs off — a wall display pairs (device token, no
// per-boot login) and boots into the kiosk dashboard; a personal device signs in
// and lands on the mobile glance. The choice persists (src/lib/surface), so a
// returning device never sees this again — the `/` smart entry routes it straight
// to its home. Two honest cards, no default highlight: a deliberate pick.
const CHOICES: { surface: Surface; to: string; key: 'kiosk' | 'mobile'; icon: IconName; color: string }[] = [
  { surface: 'kiosk', to: '/pair', key: 'kiosk', icon: 'sun-bold', color: '#D9842A' },
  { surface: 'mobile', to: '/login', key: 'mobile', icon: 'smiley-bold', color: '#5891AC' },
]

export function Setup() {
  const t = useT()
  const nav = useNavigate()
  const { setSurface } = useSurface()

  function choose(surface: Surface, to: string) {
    setSurface(surface)
    nav(to)
  }

  return (
    <div className="page">
      <TopBar />
      <main className="narrow setup">
        <h1>{t.setup.title}</h1>
        <p className="lead">{t.setup.lead}</p>
        <div className="setup__choices">
          {CHOICES.map((c) => (
            <button key={c.surface} type="button" className="setup__choice surface" onClick={() => choose(c.surface, c.to)}>
              <span className="setup__choice-icon" style={{ background: c.color + '22' }}>
                <Icon name={c.icon} size={30} color={c.color} />
              </span>
              <span className="setup__choice-title">{t.setup[c.key].title}</span>
              <span className="setup__choice-body">{t.setup[c.key].body}</span>
            </button>
          ))}
        </div>
      </main>
    </div>
  )
}
