import { useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
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
import { LeadPicker } from '../components/LeadPicker'
import { BigTiles, Sayable } from '../components/BigTiles'
import { EmptyState } from '../components/EmptyState'
import { StatusMessage } from '../components/StatusMessage'
import { Chip, ChipGroup } from '../components/Chip'
import { SectionHeader } from '../components/SectionHeader'
import { SectionAvatar } from '../components/SectionAvatar'
import { HubHead } from '../components/HubHead'
import { SceneHead } from '../components/SceneHead'
import { ListRow } from '../components/ListRow'
import { Modal } from '../components/Modal'
import { OperatorSection } from '../components/operator/OperatorSection'

// ─────────────────────────────────────────────────────────────────────────────
// /dev/kit — the component catalogue. A dev-only, unlinked page that renders the
// shared primitives live, INSIDE the real app shell, so each gets the actual
// providers (no Storybook, no mocked context). Built to keep open ALONGSIDE a
// chat: every entry is COLLAPSED by default (names + file paths visible at a
// glance), SEARCHABLE by name/path, and expands to a live specimen across the four
// presentation axes (theme/surface/audience/locale toolbar). See COMPONENTS.md.
//
// The axis toolbar flips the REAL global contexts (persisted) — set, look, reset.
// ─────────────────────────────────────────────────────────────────────────────

type Entry = {
  cat: string
  name: string
  file: string
  kw?: string // extra search keywords
  render: () => ReactNode
}

// One labelled specimen inside an entry.
function Demo({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="devkit__demo">
      <div className="devkit__demo-label mono">{label}</div>
      <div className="devkit__demo-body">{children}</div>
    </div>
  )
}

// A collapsed-by-default catalogue entry: name + file path always visible; the
// live specimen unfolds on click (or auto-opens while searching).
function EntryCard({ entry, open }: { entry: Entry; open: boolean }) {
  return (
    <details className="kit-entry" open={open}>
      <summary className="kit-entry__sum">
        <Icon name="caret-down-bold" size={14} />
        <span className="kit-entry__name">{entry.name}</span>
        <code className="kit-entry__file mono">{entry.file}</code>
      </summary>
      <div className="kit-entry__body devkit__demos">{entry.render()}</div>
    </details>
  )
}

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
  const [query, setQuery] = useState('')

  // Live state for the interactive specimens.
  const [text1, setText1] = useState('')
  const [text2, setText2] = useState('Macaroni chinois')
  const [text3, setText3] = useState('')
  const [color, setColor] = useState(PALETTE[0])
  const [cards, setCards] = useState(['toilette', 'rince', 'pyjama'])
  const [recur, setRecur] = useState<RecurValue | null>({ freq: 'weekly', interval: 1, weekdays: [3] })
  const [lead, setLead] = useState<number | null>(10800)
  const [chipOn, setChipOn] = useState<string[]>(['préféré'])
  const [tags, setTags] = useState(['rapide', 'végé'])
  const [modalOpen, setModalOpen] = useState(false)
  const voice = useVoiceInput(setText3, { continuous: true, split: true })
  const icons = Object.keys(PIP_ICONS) as IconName[]

  const toggleChip = (k: string) => setChipOn((s) => (s.includes(k) ? s.filter((x) => x !== k) : [...s, k]))

  // The catalogue. Order within a category is the reading order.
  const entries: Entry[] = [
    // ── Inputs ──────────────────────────────────────────────────────────
    {
      cat: 'Saisie',
      name: 'EditField',
      file: 'components/EditField.tsx',
      kw: 'input add edit voice mic champ ajouter',
      render: () => (
        <>
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
          <Demo label="rename (icon submit + cancel)">
            <EditField
              value={text2}
              onChange={setText2}
              onSubmit={() => {}}
              onCancel={() => setText2('Macaroni chinois')}
              clearable={false}
              ariaLabel={t.common.edit}
            />
          </Demo>
          <Demo label="voice (continuous mic in the box)">
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
        </>
      ),
    },
    {
      cat: 'Saisie',
      name: 'ColorPicker',
      file: 'components/ColorPicker.tsx',
      kw: 'couleur swatch pastille',
      render: () => (
        <Demo label="palette dots">
          <ColorPicker value={color} onChange={setColor} label="Couleur" />
        </Demo>
      ),
    },
    {
      cat: 'Saisie',
      name: 'RecurPicker',
      file: 'components/RecurPicker.tsx',
      kw: 'récurrence freq weekly recurrence',
      render: () => (
        <Demo label="recurrence rule">
          <RecurPicker value={recur} onChange={setRecur} />
        </Demo>
      ),
    },
    {
      cat: 'Saisie',
      name: 'LeadPicker',
      file: 'components/LeadPicker.tsx',
      kw: 'rappel bientôt reminder lead afficher dès soon',
      render: () => (
        <Demo label="reminder lead ('Bientôt')">
          <LeadPicker value={lead} onChange={setLead} />
        </Demo>
      ),
    },

    // ── Foundations ────────────────────────────────────────────────────
    {
      cat: 'Fondations',
      name: 'Boutons (.btn)',
      file: 'styles/core.css',
      kw: 'button primary ghost danger sm',
      render: () => (
        <>
          <Demo label=".btn / --primary / --ghost">
            <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
              <button className="btn">Défaut</button>
              <button className="btn btn--primary">
                <Icon name="plus-bold" size={18} /> Ajouter
              </button>
              <button className="btn btn--ghost mono">Fantôme</button>
            </div>
          </Demo>
          <Demo label="--sm / --danger / :disabled">
            <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
              <button className="btn btn--sm">Petit</button>
              <button className="btn btn--danger">
                <InlineIcon name="trash-bold" /> Supprimer
              </button>
              <button className="btn btn--primary" disabled>
                Inerte
              </button>
            </div>
          </Demo>
        </>
      ),
    },
    {
      cat: 'Fondations',
      name: 'Chip · ChipGroup',
      file: 'components/Chip.tsx',
      kw: 'chip tag pill pastille filtre toggle',
      render: () => (
        <>
          <Demo label="toggle chips">
            <ChipGroup label="Filtres">
              {['déjeuner', 'préféré', 'rapide'].map((k) => (
                <Chip key={k} selected={chipOn.includes(k)} onClick={() => toggleChip(k)}>
                  {k}
                </Chip>
              ))}
            </ChipGroup>
          </Demo>
          <Demo label="removable tag pills">
            <ChipGroup>
              {tags.map((tg) => (
                <Chip key={tg} selected onRemove={() => setTags((s) => s.filter((x) => x !== tg))} removeLabel={`retirer ${tg}`}>
                  {tg}
                </Chip>
              ))}
            </ChipGroup>
          </Demo>
          <Demo label="static label">
            <Chip icon="check-bold">terminé</Chip>
          </Demo>
        </>
      ),
    },
    {
      cat: 'Fondations',
      name: 'Icon · InlineIcon',
      file: 'components/Icon.tsx',
      kw: 'icône phosphor glyph svg',
      render: () => (
        <div className="devkit__icons" style={{ gridColumn: '1 / -1' }}>
          {icons.map((name) => (
            <div key={name} className="devkit__icon" title={name}>
              <Icon name={name} size={24} />
              <span className="devkit__icon-name mono">{name}</span>
            </div>
          ))}
        </div>
      ),
    },

    // ── Actions & rows ─────────────────────────────────────────────────
    {
      cat: 'Rangées & actions',
      name: 'RowActions',
      file: 'components/RowActions.tsx',
      kw: 'edit delete ✏️ 🗑️ modifier supprimer',
      render: () => (
        <Demo label="✏️ / 🗑️ pair">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <span>Yogourt grec</span>
            <RowActions onEdit={() => {}} onDelete={() => {}} />
          </div>
        </Demo>
      ),
    },
    {
      cat: 'Rangées & actions',
      name: 'CheckRow',
      file: 'components/CheckRow.tsx',
      kw: 'check liste cocher pantry réserve',
      render: () => (
        <Demo label="check · rename · delete">
          <ul className="kitchen__pantry" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            <CheckRow item="Lait" note="bientôt fini" onCheck={() => {}} checkLabel="Cocher" onRename={() => {}} onDelete={() => {}} />
          </ul>
        </Demo>
      ),
    },
    {
      cat: 'Rangées & actions',
      name: 'ListRow',
      file: 'components/ListRow.tsx',
      kw: 'row rangée liste générique',
      render: () => (
        <>
          <Demo label="static (leading + sub + actions)">
            <ListRow
              leading={<Avatar name="Camille" colour={PALETTE[2]} size={32} />}
              title="Camille"
              subtitle="parent · couleur sauge"
              actions={<RowActions onEdit={() => {}} onDelete={() => {}} />}
            />
          </Demo>
          <Demo label="nav row (whole row taps)">
            <ListRow leading={<Icon name="book-open-bold" size={20} />} title="Ouvrir la recette" subtitle="Macaroni chinois" onActivate={() => {}} />
          </Demo>
        </>
      ),
    },
    {
      cat: 'Rangées & actions',
      name: 'Act · Section',
      file: 'components/board/Act.tsx',
      kw: 'activity card babillard event chore meal row',
      render: () => (
        <>
          <Demo label="check rows in a Section">
            <BoardSection label="Aujourd’hui" count={2}>
              <Act cat="event" title="Rendez-vous dentiste" when="14:00" who="Camille" onCheck={() => {}} />
              <Act cat="chore" title="Sortir les poubelles" who="Marc" done onCheck={() => {}} />
            </BoardSection>
          </Demo>
          <Demo label="nav row + badge">
            <Act cat="meal" title="Macaroni chinois" when="Souper" onActivate={() => {}} badge={<Chip>Restants</Chip>} />
          </Demo>
          <Demo label="reminder window open ('Bientôt')">
            <Act cat="event" title="Rendez-vous dentiste" when="jeu. 14:00" who="Camille" soon />
          </Demo>
        </>
      ),
    },

    // ── Display ────────────────────────────────────────────────────────
    {
      cat: 'Affichage',
      name: 'SectionHeader',
      file: 'components/SectionHeader.tsx',
      kw: 'header titre entête section',
      render: () => (
        <>
          <Demo label="emoji + subtitle + action">
            <SectionHeader emoji="🍳" title="Déjeuner" subtitle="Matin" action={<button className="btn btn--sm">＋</button>} />
          </Demo>
          <Demo label="icon + title">
            <SectionHeader icon="carrot-bold" iconColor="var(--marigold-deep)" title="Garde-manger" />
          </Demo>
        </>
      ),
    },
    {
      cat: 'Affichage',
      name: 'SceneHead',
      file: 'components/SceneHead.tsx',
      kw: 'scene entête header titre title close fermer aide help plein écran',
      render: () => (
        <>
          <Demo label="title + subtitle + help ? + close (the ? shows for a parent in tutorial mode)">
            <SceneHead
              title="Preuve de prix"
              subtitle="beurre d'arachide Kraft 1 kg"
              card="cashier"
              onClose={() => {}}
            />
          </Demo>
          <Demo label="title + leading glyph, no help">
            <SceneHead title="Nouvel événement" icon="calendar-dots-bold" onClose={() => {}} />
          </Demo>
        </>
      ),
    },
    {
      cat: 'Affichage',
      name: 'HubHead',
      file: 'components/HubHead.tsx',
      kw: 'header entête hub onglet tab titre title section avatar',
      render: () => (
        <>
          <Demo label="title + subtitle + section disc (the four hub tabs share this)">
            <HubHead
              title="Bon matin, Marc"
              subtitle="mardi 17 juin"
              icon="sun-bold"
              iconColor="var(--marigold-deep)"
              background="var(--marigold-wash)"
              card="board"
            />
          </Demo>
          <Demo label="title only">
            <HubHead
              title="La cuisine"
              icon="carrot-bold"
              iconColor="var(--terracotta-deep)"
              background="var(--terracotta-wash)"
              card="kitchen"
            />
          </Demo>
        </>
      ),
    },
    {
      cat: 'Affichage',
      name: 'SectionAvatar',
      file: 'components/SectionAvatar.tsx',
      kw: 'avatar section entête header icône aide help disc pastille',
      render: () => (
        <>
          <Demo label="section disc — help link in tutorial mode (the corner ? shows only for a parent with tutorial on)">
            <SectionAvatar
              icon="carrot-bold"
              iconColor="var(--terracotta-deep)"
              background="var(--terracotta-wash)"
              card="kitchen"
            />
          </Demo>
          <Demo label="another section's tint">
            <SectionAvatar
              icon="sun-bold"
              iconColor="var(--marigold-deep)"
              background="var(--marigold-wash)"
              card="board"
            />
          </Demo>
        </>
      ),
    },
    {
      cat: 'Affichage',
      name: 'Avatar',
      file: 'components/Avatar.tsx',
      kw: 'avatar membre personne initiale photo',
      render: () => (
        <Demo label="coloured initial disc">
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <Avatar name="Camille" colour={PALETTE[2]} />
            <Avatar name="Marc" colour={PALETTE[4]} />
            <Avatar name="Léo" colour={PALETTE[0]} size={56} />
          </div>
        </Demo>
      ),
    },
    {
      cat: 'Affichage',
      name: 'BigTiles · Sayable',
      file: 'components/BigTiles.tsx',
      kw: 'toddler bambin tuile big tiles speak',
      render: () => (
        <>
          <Demo label="BigTiles (flip Audience axis)">
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
        </>
      ),
    },

    // ── Feedback ───────────────────────────────────────────────────────
    {
      cat: 'Feedback',
      name: 'EmptyState',
      file: 'components/EmptyState.tsx',
      kw: 'empty vide rien liste',
      render: () => (
        <>
          <Demo label="plain">
            <EmptyState>Liste vide. Rien à acheter.</EmptyState>
          </Demo>
          <Demo label="calm">
            <EmptyState tone="calm">Rien de prévu ce soir — et c’est correct.</EmptyState>
          </Demo>
        </>
      ),
    },
    {
      cat: 'Feedback',
      name: 'StatusMessage',
      file: 'components/StatusMessage.tsx',
      kw: 'status error success info erreur message',
      render: () => (
        <>
          <Demo label="error / success / info">
            <div>
              <StatusMessage tone="error">Pas enregistré — réessaie.</StatusMessage>
              <StatusMessage tone="success">Code postal enregistré.</StatusMessage>
              <StatusMessage tone="info">Ajouté à la liste.</StatusMessage>
            </div>
          </Demo>
        </>
      ),
    },
    {
      cat: 'Feedback',
      name: 'VoiceButton · VoiceStatus',
      file: 'components/VoiceButton.tsx',
      kw: 'voice mic micro parler speech',
      render: () => (
        <Demo label="mic + status line">
          <div>
            <VoiceButton voice={voice} label={t.capture.voice} />
            <VoiceStatus voice={voice} />
          </div>
        </Demo>
      ),
    },

    // ── Overlays / chrome ──────────────────────────────────────────────
    {
      cat: 'Overlays & chrome',
      name: 'Modal',
      file: 'components/Modal.tsx',
      kw: 'modal dialog overlay dialogue',
      render: () => (
        <Demo label="centred dialog (Esc / backdrop / ✕)">
          <div>
            <button className="btn" onClick={() => setModalOpen(true)}>
              Ouvrir le modal
            </button>
            <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Un dialogue partagé">
              <p>Esc, le fond, ou le ✕ ferment. Scroll-lock + focus-trap via useModal.</p>
              <button className="btn btn--primary" onClick={() => setModalOpen(false)}>
                Compris
              </button>
            </Modal>
          </div>
        </Demo>
      ),
    },
    {
      cat: 'Overlays & chrome',
      name: 'OperatorSection',
      file: 'components/operator/OperatorSection.tsx',
      kw: 'réglages section panneau surface operator',
      render: () => (
        <Demo label="Réglages panel shell">
          <OperatorSection title="Magasinage" hint="Le code postal, utilisé par les rabais." action={<button className="btn btn--sm">＋</button>}>
            <p className="mono" style={{ color: 'var(--ink-faint)' }}>…contenu du panneau…</p>
          </OperatorSection>
        </Demo>
      ),
    },
  ]

  const q = query.trim().toLowerCase()
  const shown = useMemo(
    () =>
      !q
        ? entries
        : entries.filter((e) => (e.name + ' ' + e.file + ' ' + e.cat + ' ' + (e.kw ?? '')).toLowerCase().includes(q)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [q, text1, text2, text3, color, cards, recur, chipOn, tags, modalOpen, lang, audience, surface, theme],
  )

  // Group the (filtered) entries by category, preserving first-seen order.
  const cats: string[] = []
  for (const e of shown) if (!cats.includes(e.cat)) cats.push(e.cat)

  return (
    <div className="devkit">
      <header className="devkit__bar">
        <div className="devkit__bar-title">
          <Link to="/settings" className="devkit__backbtn" aria-label={t.common.back} title={t.common.back}>
            <Icon name="arrow-left-bold" size={18} />
          </Link>
          <Icon name="gear-six-bold" size={22} />
          <strong>Kit · composants</strong>
          <span className="devkit__count mono">{shown.length}</span>
        </div>
        <input
          className="input devkit__search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Chercher un composant ou un fichier…"
          aria-label="Chercher un composant"
        />
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
        {shown.length === 0 ? (
          <EmptyState>Aucun composant pour « {query} ».</EmptyState>
        ) : (
          cats.map((cat) => (
            <section key={cat} className="devkit__cat">
              <h2 className="devkit__cat-title">{cat}</h2>
              {shown
                .filter((e) => e.cat === cat)
                .map((e) => (
                  <EntryCard key={e.name} entry={e} open={!!q} />
                ))}
            </section>
          ))
        )}
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
