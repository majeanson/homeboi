import { useT } from '../../i18n'
import { type HelpMode } from '../../lib/helpMode'
import { OperatorSection } from './OperatorSection'
import { Icon } from '../Icon'
import { Toggle } from '../Toggle'
import { useAmbient, setAmbient, type AmbientSettings } from '../../lib/ambient'
import { useHabitCheckin, setHabitCheckin, replayHabitCheckin } from '../../lib/habitCheckin'
import { forceIdle } from '../../lib/idleDebug'

// Réglages ▸ Affichage ▸ "Mode veille" — tune what the kiosk does when idle: the
// screensaver (clock / date / photos / next-up), how long before it appears, and
// whether the picked face drifts back to Maisonnée. Reads/writes lib/ambient; the
// change re-arms HubLayout's idle timers live. Calm: every behaviour is opt-out.
const IDLE_OPTS = [1, 2, 3, 5, 10, 15, 30]
const HOME_OPTS = [1, 2, 3, 5, 10]

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

          {/* F-47 (bmad/08): the hourly breath — at the top of the hour the idle
              clock breathes once (a slow 2 s scale). No sound, no badge — the
              house's heartbeat. Every surface; reduced-motion drops it. */}
          <div className="operator__seg">
            <span className="operator__seg-label mono">{t.operator.ambientBreath}</span>
            <Toggle
              on={a.hourlyBreath}
              icon="heart-bold"
              label={a.hourlyBreath ? t.operator.ambientOnWord : t.operator.ambientOffWord}
              onClick={() => set({ hourlyBreath: !a.hourlyBreath })}
            />
          </div>
          <p className="operator__hint mono">{t.operator.ambientBreathHint}</p>

          {/* Says WHERE it applies (this device, whatever its surface) and that
              waking it costs nothing. The copy existed but was never rendered,
              and claimed "kiosk only" — HubLayout arms the idle cycle on every
              surface, so a phone operator met a full-screen clock the settings
              swore couldn't happen. */}
          <p className="operator__hint mono">{t.operator.ambientNote}</p>

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

// « Mes habitudes » — when « Le point du jour » opens BY ITSELF. It lives in this
// sub (C-15: merge into the sub that already owns the concept) because that is
// exactly what « Mode veille » is about: what this always-on screen does on its
// own, unasked. Both behaviours are opt-out per device, like the screensaver.
//
// Neither is a notification: there is no push and no cron in this app. An open
// screen simply notices the moment has come — a phone in a pocket stays quiet.
export function HabitCheckinSection({ help }: { help?: HelpMode }) {
  const t = useT()
  const fn = t.operator
  const c = useHabitCheckin()

  return (
    <OperatorSection title={fn.habitCheckinTitle} help={help} helpKey="habits">
      <div className="operator__seg">
        <span className="operator__seg-label mono">{fn.habitCheckinMorning}</span>
        <Toggle
          on={c.autoOpen}
          icon="sun-horizon-bold"
          label={c.autoOpen ? fn.ambientOnWord : fn.ambientOffWord}
          onClick={() => setHabitCheckin({ autoOpen: !c.autoOpen })}
        />
      </div>
      <p className="operator__hint mono">{fn.habitCheckinMorningHint}</p>

      <div className="operator__seg">
        <span className="operator__seg-label mono">{fn.habitCheckinReminders}</span>
        <Toggle
          on={c.reminders}
          icon="clock-bold"
          label={c.reminders ? fn.ambientOnWord : fn.ambientOffWord}
          onClick={() => setHabitCheckin({ reminders: !c.reminders })}
        />
      </div>
      <p className="operator__hint mono">{fn.habitCheckinRemindersHint}</p>

      {/* Dev tooling (the idleDebug spirit): a morning open fires once per local
          day, so it's otherwise unobservable until tomorrow. */}
      <button type="button" className="btn btn--ghost" onClick={() => replayHabitCheckin()}>
        <Icon name="arrow-counter-clockwise-bold" size={16} /> {fn.habitCheckinReplay}
      </button>
    </OperatorSection>
  )
}
