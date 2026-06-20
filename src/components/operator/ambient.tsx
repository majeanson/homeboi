import { useT } from '../../i18n'
import { type HelpMode } from '../../lib/helpMode'
import { OperatorSection } from './OperatorSection'
import { Icon, type IconName } from '../Icon'
import { useAmbient, setAmbient, type AmbientSettings } from '../../lib/ambient'
import { forceIdle } from '../../lib/idleDebug'

// Réglages ▸ Affichage ▸ "Mode veille" — tune what the kiosk does when idle: the
// screensaver (clock / date / photos / next-up), how long before it appears, and
// whether the picked face drifts back to Maisonnée. Reads/writes lib/ambient; the
// change re-arms HubLayout's idle timers live. Calm: every behaviour is opt-out.
const IDLE_OPTS = [1, 2, 3, 5, 10, 15, 30]
const HOME_OPTS = [1, 2, 3, 5, 10]

// A calm on/off pill — highlighted (filled) when on, plain when off, with its own
// glyph + label. Used for the master toggles and each "show X" screensaver element.
function Toggle({ on, icon, label, onClick }: { on: boolean; icon: IconName; label: string; onClick: () => void }) {
  return (
    <button type="button" className={`btn${on ? ' btn--primary' : ''}`} aria-pressed={on} onClick={onClick}>
      <Icon name={icon} size={16} /> {label}
    </button>
  )
}

export function AmbientSettingsSection({ help }: { help?: HelpMode }) {
  const t = useT()
  const a = useAmbient()
  const set = (patch: Partial<AmbientSettings>) => setAmbient(patch)

  return (
    <OperatorSection title={t.operator.ambientTitle} help={help} helpKey="ambient">
      {/* — The screensaver — */}
      <div className="operator__seg">
        <span className="operator__seg-label mono">{t.operator.ambientScreensaver}</span>
        <Toggle
          on={a.screensaver}
          icon="image-square-bold"
          label={a.screensaver ? t.operator.ambientOnWord : t.operator.ambientOffWord}
          onClick={() => set({ screensaver: !a.screensaver })}
        />
      </div>

      {a.screensaver && (
        <>
          <div className="operator__seg">
            <span className="operator__seg-label mono">{t.operator.ambientIdleBefore}</span>
            <select
              className="input"
              value={a.idleMin}
              onChange={(e) => set({ idleMin: Number(e.target.value) })}
              aria-label={t.operator.ambientIdleBefore}
            >
              {IDLE_OPTS.map((m) => (
                <option key={m} value={m}>
                  {t.operator.ambientMinutes(m)}
                </option>
              ))}
            </select>
          </div>

          <p className="operator__seg-label mono">{t.operator.ambientShows}</p>
          <div className="ambient-set__shows">
            <Toggle on={a.showClock} icon="clock-bold" label={t.operator.ambientClock} onClick={() => set({ showClock: !a.showClock })} />
            <Toggle on={a.showDate} icon="calendar-blank-bold" label={t.operator.ambientDate} onClick={() => set({ showDate: !a.showDate })} />
            <Toggle on={a.showPhotos} icon="image-square-bold" label={t.operator.ambientPhotos} onClick={() => set({ showPhotos: !a.showPhotos })} />
            <Toggle on={a.showDrawings} icon="paint-brush-bold" label={t.operator.ambientDrawings} onClick={() => set({ showDrawings: !a.showDrawings })} />
            <Toggle on={a.showNext} icon="calendar-dots-bold" label={t.operator.ambientNext} onClick={() => set({ showNext: !a.showNext })} />
          </div>

          <button type="button" className="btn btn--ghost" onClick={() => forceIdle('screensaver')}>
            <Icon name="play-bold" size={16} /> {t.operator.ambientPreview}
          </button>
        </>
      )}

      {/* — Return to Maisonnée (the profile drift) — */}
      <div className="operator__seg">
        <span className="operator__seg-label mono">{t.operator.ambientReturnHome}</span>
        <Toggle
          on={a.returnHome}
          icon="users-three-bold"
          label={a.returnHome ? t.operator.ambientOnWord : t.operator.ambientOffWord}
          onClick={() => set({ returnHome: !a.returnHome })}
        />
      </div>
      {a.returnHome && (
        <div className="operator__seg">
          <span className="operator__seg-label mono">{t.operator.ambientReturnAfter}</span>
          <select
            className="input"
            value={a.returnHomeMin}
            onChange={(e) => set({ returnHomeMin: Number(e.target.value) })}
            aria-label={t.operator.ambientReturnAfter}
          >
            {HOME_OPTS.map((m) => (
              <option key={m} value={m}>
                {t.operator.ambientMinutes(m)}
              </option>
            ))}
          </select>
        </div>
      )}

    </OperatorSection>
  )
}
