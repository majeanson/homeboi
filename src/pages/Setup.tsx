import { useNavigate } from 'react-router-dom'
import { TopBar } from '../components/TopBar'
import { useT } from '../i18n'
import { useSurface, type Surface } from '../lib/surface'
import { Icon, type IconName } from '../components/Icon'

// First-run role choice: is this a wall display or a personal phone? It's the one
// fork the rest of the flow hangs off — a personal device signs in / creates the
// household; a wall display pairs (device token, no per-boot login) and boots into
// the kiosk dashboard. ORDER MATTERS: your own device comes FIRST (it creates the
// household and is what approves the tablet's pairing), so it's listed first and
// badged "step 1". The choice persists (src/lib/surface), so a returning device
// never sees this again — the `/` smart entry routes it straight to its home.
const CHOICES: { surface: Surface; to: string; key: 'mobile' | 'kiosk'; icon: IconName; color: string }[] = [
  { surface: 'mobile', to: '/login', key: 'mobile', icon: 'device-mobile-bold', color: '#5891AC' },
  { surface: 'kiosk', to: '/pair', key: 'kiosk', icon: 'device-tablet-bold', color: '#D9842A' },
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
              <span className="setup__choice-step mono" style={{ color: c.color }}>
                {t.setup[c.key].step}
              </span>
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
