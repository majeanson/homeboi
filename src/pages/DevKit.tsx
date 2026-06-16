import { useState } from 'react'
import { useLang, useT } from '../i18n'
import { useSurface, type Surface } from '../lib/surface'
import { useAudience, type Audience } from '../lib/audience'
import { getTheme, setTheme, type Theme } from '../lib/theme'
import { PALETTE } from '../lib/colors'
import { PIP_ICONS, type IconName } from '../lib/pipIcons'
import { Icon, InlineIcon } from '../components/Icon'
import { EditField } from '../components/EditField'
import { RowActions } from '../components/RowActions'
import { CheckRow } from '../components/CheckRow'
import { ColorPicker } from '../components/ColorPicker'
import { VoiceButton, VoiceStatus } from '../components/VoiceButton'
import { useVoiceInput } from '../lib/useVoiceInput'
import { Avatar } from '../components/Avatar'
import { Act, Section as BoardSection } from '../components/board/Act'
import { RecurPicker, type RecurValue } from '../components/RecurPicker'
import { BigTiles, Sayable } from '../components/BigTiles'

// ─────────────────────────────────────────────────────────────────────────────
// /dev/kit — the component gallery. A dev-only catalogue (unlinked route) that
// renders the SHARED primitives in isolation across the app's four presentation
// axes — theme (day/night), surface (kiosk/mobile), audience (parent/toddler),
// locale (FR/EN). It runs INSIDE the real app shell, so every primitive gets the
// actual providers (Query, i18n, surface/audience, confirm/toast) for free — no
// Storybook, no mocked context. Building+browsing this IS the uniformization
// audit: duplicate or near-duplicate widgets show up side by side.
//
// NOTE: the axis toolbar flips the REAL global contexts (they persist to
// localStorage), so toggling here changes the whole app — that's intentional;
// set it, look, set it back. See COMPONENTS.md for the inventory + backlog.
// ─────────────────────────────────────────────────────────────────────────────

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="surface devkit__section">
      <h2 className="devkit__h2">{title}</h2>
      {hint && <p className="lead devkit__hint">{hint}</p>}
      <div className="devkit__demos">{children}</div>
    </section>
  )
}

// One labelled specimen — a caption above a live instance, so the catalogue reads
// as "this name → this is what it looks like".
function Demo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="devkit__demo">
      <div className="devkit__demo-label mono">{label}</div>
      <div className="devkit__demo-body">{children}</div>
    </div>
  )
}

// A segmented toggle for the axis toolbar. Generic over the axis value.
function AxisToggle<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: T
  options: { v: T; label: string }[]
  onChange: (v: T) => void
}) {
  return (
    <div className="devkit__axis">
      <span className="devkit__axis-label mono">{label}</span>
      <div className="devkit__seg">
        {options.map((o) => (
          <button
            key={o.v}
            type="button"
            className={'devkit__seg-btn mono' + (value === o.v ? ' is-on' : '')}
            onClick={() => onChange(o.v)}
            aria-pressed={value === o.v}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  )
}

export function DevKit() {
  const t = useT()
  const { lang, setLang } = useLang()
  const { surface, setSurface } = useSurface()
  const { audience, setAudience, locked } = useAudience()
  const [theme, setThemeMirror] = useState<Theme>(() => getTheme())

  // Local state for the interactive specimens.
  const [text1, setText1] = useState('')
  const [text2, setText2] = useState('Macaroni chinois')
  const [text3, setText3] = useState('')
  const [color, setColor] = useState(PALETTE[0])
  const [cards, setCards] = useState(['toilette', 'rince', 'pyjama'])
  const [recur, setRecur] = useState<RecurValue | null>({ freq: 'weekly', interval: 1, weekdays: [3] })
  const voice = useVoiceInput(setText3, { continuous: true, split: true })

  const icons = Object.keys(PIP_ICONS) as IconName[]

  return (
    <div className="devkit">
      {/* ── Axis toolbar: flips the real global contexts so every specimen below
          re-renders in the chosen theme/surface/audience/locale. ── */}
      <header className="devkit__bar">
        <div className="devkit__bar-title">
          <Icon name="gear-six-bold" size={22} />
          <strong>Kit · composants</strong>
        </div>
        <div className="devkit__axes">
          <AxisToggle<Theme>
            label="Thème"
            value={theme}
            options={[
              { v: 'day', label: 'Jour' },
              { v: 'night', label: 'Nuit' },
            ]}
            onChange={(v) => {
              setTheme(v)
              setThemeMirror(v)
            }}
          />
          <AxisToggle<Surface>
            label="Surface"
            value={surface}
            options={[
              { v: 'kiosk', label: 'Kiosk' },
              { v: 'mobile', label: 'Mobile' },
            ]}
            onChange={setSurface}
          />
          <AxisToggle<Audience>
            label="Audience"
            value={audience}
            options={[
              { v: 'parent', label: 'Parent' },
              { v: 'toddler', label: 'Toddler' },
            ]}
            onChange={setAudience}
          />
          <AxisToggle<'fr' | 'en'>
            label="Langue"
            value={lang}
            options={[
              { v: 'fr', label: 'FR' },
              { v: 'en', label: 'EN' },
            ]}
            onChange={setLang}
          />
        </div>
        {locked && <p className="devkit__warn mono">Kiosk verrouillé (?kid=1) — l’audience est figée.</p>}
      </header>

      <main className="devkit__body">
        {/* ── Inputs ─────────────────────────────────────────────────────── */}
        <Section
          title="EditField — la boîte texte partagée"
          hint="Une seule boîte d’ajout/édition : clear ✕ + micro dans le champ, actions compactes, extensible (voix, ordre, suppression, actions secondaires)."
        >
          <Demo label="add (labeled submit)">
            <EditField
              value={text1}
              onChange={setText1}
              onSubmit={() => setText1('')}
              submitLabel={t.capture.add}
              submitLeadingIcon="plus-bold"
              submitVariant="primary"
              placeholder="Ajouter un article…"
            />
          </Demo>
          <Demo label="rename (icon submit + cancel, no clear)">
            <EditField
              value={text2}
              onChange={setText2}
              onSubmit={() => {}}
              onCancel={() => setText2('Macaroni chinois')}
              clearable={false}
              ariaLabel={t.common.edit}
            />
          </Demo>
          <Demo label="voice (continuous mic inside the box)">
            <EditField
              value={text3}
              onChange={setText3}
              onSubmit={() => setText3('')}
              submitLabel={t.capture.add}
              voice={voice}
              placeholder={voice.listening ? t.capture.listening : 'Parler ou écrire…'}
            />
          </Demo>
          <Demo label="row editor (leading + reorder + delete)">
            {cards.map((c, i) => (
              <EditField
                key={i}
                value={c}
                onChange={(v) => setCards((cs) => cs.map((x, idx) => (idx === i ? v : x)))}
                clearable={false}
                leading={<span className="dnd-grip mono" style={{ padding: '0 4px' }}>⠿</span>}
                reorder={{
                  onUp: () => setCards((cs) => swap(cs, i, i - 1)),
                  onDown: () => setCards((cs) => swap(cs, i, i + 1)),
                  upDisabled: i === 0,
                  downDisabled: i === cards.length - 1,
                }}
                onDelete={() => setCards((cs) => cs.filter((_, idx) => idx !== i))}
              />
            ))}
          </Demo>
        </Section>

        {/* ── Buttons ────────────────────────────────────────────────────── */}
        <Section title="Boutons (.btn)" hint="Une base, des variantes. min-height 44px partout (cible tactile).">
          <Demo label=".btn">
            <button className="btn">Défaut</button>
          </Demo>
          <Demo label=".btn--primary">
            <button className="btn btn--primary">
              <Icon name="plus-bold" size={18} /> Ajouter
            </button>
          </Demo>
          <Demo label=".btn--ghost">
            <button className="btn btn--ghost mono">Fantôme</button>
          </Demo>
          <Demo label=".btn--sm">
            <button className="btn btn--sm">Petit</button>
          </Demo>
          <Demo label=".btn--danger">
            <button className="btn btn--danger">
              <InlineIcon name="trash-bold" /> Supprimer
            </button>
          </Demo>
          <Demo label=":disabled">
            <button className="btn btn--primary" disabled>
              Inerte
            </button>
          </Demo>
        </Section>

        {/* ── Chips ──────────────────────────────────────────────────────── */}
        <Section title="Chips (.chip)" hint="Navigation et filtres dans la cuisine — tap pour basculer.">
          <Demo label=".chip">
            <button className="chip">Dessert</button>
          </Demo>
          <Demo label=".chip.is-on">
            <button className="chip is-on">
              <InlineIcon name="check-bold" /> Préféré
            </button>
          </Demo>
          <Demo label="chip · removable">
            <button className="chip is-on">
              rapide <InlineIcon name="x-bold" size={12} />
            </button>
          </Demo>
        </Section>

        {/* ── Rows / actions ─────────────────────────────────────────────── */}
        <Section title="Rangées & actions" hint="RowActions (✏️/🗑️) et CheckRow — une rangée de liste calme, le check est sa propre cible.">
          <Demo label="RowActions">
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <span>Yogourt grec</span>
              <RowActions onEdit={() => {}} onDelete={() => {}} />
            </div>
          </Demo>
          <Demo label="CheckRow (rename + delete)">
            <ul className="kitchen__pantry" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              <CheckRow
                item="Lait"
                note="bientôt fini"
                onCheck={() => {}}
                checkLabel="Cocher"
                onRename={() => {}}
                onDelete={() => {}}
              />
            </ul>
          </Demo>
        </Section>

        {/* ── Pickers ────────────────────────────────────────────────────── */}
        <Section title="Sélecteurs" hint="ColorPicker (pastilles) + RecurPicker (récurrence) — contrôlés par le parent.">
          <Demo label="ColorPicker">
            <ColorPicker value={color} onChange={setColor} label="Couleur" />
          </Demo>
          <Demo label="RecurPicker">
            <RecurPicker value={recur} onChange={setRecur} />
          </Demo>
        </Section>

        {/* ── Act: the one activity-row primitive ────────────────────────── */}
        <Section
          title="Act — la rangée d’activité"
          hint="Une anatomie (épine colorée + tuile + titre/sous-titre), trois formes : check, navigation, ou carte info. Base du babillard ET des sélecteurs cuisine."
        >
          <Demo label="check row (event)">
            <BoardSection label="Aujourd’hui" count={2}>
              <Act cat="event" title="Rendez-vous dentiste" when="14:00" who="Camille" onCheck={() => {}} />
              <Act cat="chore" title="Sortir les poubelles" who="Marc" done onCheck={() => {}} />
            </BoardSection>
          </Demo>
          <Demo label="nav row (meal, photo-less)">
            <Act cat="meal" title="Macaroni chinois" when="Souper" onActivate={() => {}} badge={<span className="chip">Restants</span>} />
          </Demo>
          <Demo label="info card (list)">
            <Act cat="list" title="Bananes" who="ajouté par Camille" />
          </Demo>
        </Section>

        {/* ── People ─────────────────────────────────────────────────────── */}
        <Section title="Avatar" hint="Une seule façon de dessiner une personne : photo si dispo, sinon disque coloré avec l’initiale.">
          <Demo label="disc (initial)">
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <Avatar name="Camille" colour={PALETTE[2]} />
              <Avatar name="Marc" colour={PALETTE[4]} />
              <Avatar name="Léo" colour={PALETTE[0]} size={56} />
            </div>
          </Demo>
        </Section>

        {/* ── Toddler primitives (flip the Audience axis to compare) ─────── */}
        <Section
          title="Toddler — BigTiles & Sayable"
          hint="Bascule l’axe « Audience » en haut pour voir le mode bambin. Tuiles image-d’abord, lecture à voix haute au toucher."
        >
          <Demo label="BigTiles">
            <BigTiles
              tiles={[
                { key: 'a', icon: '🛁', label: 'Le bain', sub: 'Soir', onTap: () => {} },
                { key: 'b', icon: '🦷', label: 'Brosser', sub: 'Matin', onTap: () => {} },
                { key: 'c', icon: '👕', label: 'S’habiller', done: true, onTap: () => {} },
              ]}
              empty="Rien pour l’instant."
            />
          </Demo>
          <Demo label="Sayable (tap to hear)">
            <Sayable text="Bonjour Camille" className="devkit__sayable" />
          </Demo>
        </Section>

        {/* ── Voice ──────────────────────────────────────────────────────── */}
        <Section title="Voix" hint="Le micro partagé : VoiceButton + VoiceStatus (rien si le navigateur n’a pas l’API).">
          <Demo label="VoiceButton + VoiceStatus">
            <div>
              <VoiceButton voice={voice} label={t.capture.voice} />
              <VoiceStatus voice={voice} />
            </div>
          </Demo>
        </Section>

        {/* ── Icons ──────────────────────────────────────────────────────── */}
        <Section title={`Icônes (${icons.length}) — Phosphor bold`} hint="Le jeu d’icônes partagé (src/lib/pipIcons). Survol = nom.">
          <div className="devkit__icons">
            {icons.map((name) => (
              <div key={name} className="devkit__icon" title={name}>
                <Icon name={name} size={24} />
                <span className="devkit__icon-name mono">{name}</span>
              </div>
            ))}
          </div>
        </Section>
      </main>
    </div>
  )
}

function swap<T>(arr: T[], a: number, b: number): T[] {
  if (b < 0 || b >= arr.length) return arr
  const next = [...arr]
  const [m] = next.splice(a, 1)
  next.splice(b, 0, m)
  return next
}
