import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useLang, useT } from '../i18n'
import { useSurface, type Surface } from '../lib/surface'
import { useAudience, type Audience } from '../lib/audience'
import { getTheme, setTheme, type Theme } from '../lib/theme'
import { PALETTE } from '../lib/colors'
import { PIP_ICONS, type IconName } from '../lib/pipIcons'
import { Icon, InlineIcon } from '../components/Icon'
import { EditField } from '../components/EditField'
import { EntityCombobox, type ComboOption } from '../components/EntityCombobox'
import { AislePicker } from '../components/AislePicker'
import { ContactFields, EMPTY_CONTACT_CORE, type ContactCoreValue } from '../components/cercle/ContactFields'
import { RowActions } from '../components/RowActions'
import { DragPill } from '../components/DragPill'
import { usePointerDnd, DragGhost } from '../lib/dnd'
import { BoardLayoutSection } from '../components/operator/boardLayout'
import { CheckRow } from '../components/CheckRow'
import { ColorPicker } from '../components/ColorPicker'
import { MemberSwitcher } from '../components/MemberSwitcher'
import { MemberPicker } from '../components/MemberPicker'
import { FormFooter } from '../components/FormFooter'
import { EmojiPicker, EmojiField } from '../components/EmojiPicker'
import { FaceSelect } from '../components/FaceSelect'
import { GroupForm } from '../components/cercle/GroupForm'
import { FamilyShareModal } from '../components/cercle/FamilyShareModal'
import { ShareModal } from '../components/ShareModal'
import { BusinessForm } from '../components/cercle/BusinessForm'
import { PetForm } from '../components/cercle/PetForm'
import { ConnectPeople } from '../components/cercle/ConnectPeople'
import { CercleNotes } from '../components/cercle/CercleNotes'
import { NoteEditor } from '../components/cercle/NoteEditor'
import { MotComposer } from '../components/mots/MotComposer'
import { ScheduleFields, todayDateStr } from '../components/mots/ScheduleFields'
import { CompleteFamilies } from '../components/cercle/CompleteFamilies'
import { TripNoteCard } from '../components/voyage/TripNoteCard'
import { SharedPackingList } from '../components/voyage/SharedPackingList'
import { VoyageShareModal } from '../components/voyage/VoyageShareModal'
import type { SharedTrip, SharedPackingItem } from '../components/voyage/voyage'
import { CercleConstellation } from '../components/cercle/CercleConstellation'
import { personKey } from '../lib/cercle'
import { SeekGame } from '../components/jouer/SeekGame'
import { buildSeekDecks } from '../lib/playContent'
import { ReviewChecklist } from '../components/ReviewChecklist'
import type { ContactGroup, Member, Person, PersonKind, World } from '../lib/cercle'
import { VoiceButton, VoiceStatus } from '../components/VoiceButton'
import { useVoiceInput } from '../lib/useVoiceInput'
import { Avatar } from '../components/Avatar'
import { Act, Section as BoardSection } from '../components/board/Act'
import { BoardCard } from '../components/board/BoardCard'
import { MealPool } from '../components/kitchen/MealPool'
import { Fil } from '../components/board/Fil'
import { TodoSection } from '../components/todos/TodoSection'
import { RecurPicker, type RecurValue } from '../components/RecurPicker'
import { LeadPicker } from '../components/LeadPicker'
import { BigTiles, Sayable } from '../components/BigTiles'
import { KidCollections } from '../components/kitchen/KidCollections'
import { type WeekDay } from '../components/kitchen/types'
import { type Recipe } from '../lib/recipes'
import { todayLocalDay, addLocalDays } from '../lib/localDay'
import { EmptyState } from '../components/EmptyState'
import { GuestExpired } from '../components/GuestExpired'
import { StatusMessage } from '../components/StatusMessage'
import { Chip, ChipGroup } from '../components/Chip'
import { QrCode } from '../components/QrCode'
import { Disclosure } from '../components/Disclosure'
import { Toggle } from '../components/Toggle'
import { FeatureMap } from '../components/FeatureMap'
import { SubTabs } from '../components/SubTabs'
import { Cluster, Rail } from '../components/Layout'
import { SectionHeader } from '../components/SectionHeader'
import { RoutineRing } from '../components/RoutineRing'
import { Companion } from '../components/Companion'
import { COMPANIONS } from '../lib/companions'
import { SectionAvatar } from '../components/SectionAvatar'
import { HubHead } from '../components/HubHead'
import { SceneHead } from '../components/SceneHead'
import { ListRow } from '../components/ListRow'
import { Modal } from '../components/Modal'
import { DrawEditChoice, type DrawEditMode } from '../components/DrawEditChoice'
import { RecipeReadReview } from '../components/RecipeReadReview'
import { RecentsPanel } from '../components/RecentsPanel'
import { TimerRail } from '../components/cook/TimerRail'
import { Sheet } from '../components/Sheet'
import { RecipeListPicker } from '../components/RecipeListPicker'
import { EmptyFridgeSheet } from '../components/kitchen/EmptyFridgeSheet'
import { OperatorSection } from '../components/operator/OperatorSection'
import { HouseholdListSection } from '../components/operator/HouseholdListSection'
import { DealCard } from '../components/DealCard'
import { IngredientLine } from '../components/IngredientLine'
import { MeasureScoops } from '../components/MeasureScoops'
import { findMeasures } from '../lib/measure'
import { ZoomableImg } from '../components/ZoomableImg'
import { WonderBand } from '../components/board/ApodFrame'
import { PanZoom } from '../components/PanZoom'
import { EntityDetailSheet } from '../components/detail/EntityDetailSheet'
import { type DetailModel } from '../lib/detail'
import { PhotoMosaic } from '../components/PhotoMosaic'
import { SharePreviewBar } from '../components/SharePreviewBar'
import { CardDeckEditor } from '../components/CardDeckEditor'
import { type DeckCard } from '../lib/routineTemplates'
import { HelpBubble } from '../components/HelpBubble'
import { OfflineBanner } from '../components/OfflineBanner'
import { ErrorBoundary } from '../components/ErrorBoundary'
import { HeartButton } from '../components/HeartButton'

// A tiny inline placeholder image for the image-bearing specimens (DealCard,
// ZoomableImg) — no network asset needed in the gallery.
const sampleImg =
  'data:image/svg+xml,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="160" height="120"><rect width="160" height="120" fill="#e9ddc7"/><text x="80" y="66" font-family="sans-serif" font-size="15" text-anchor="middle" fill="#6b5b3e">exemple</text></svg>',
  )

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

// A stand-in "recipe card" photo for the RecipeReadReview specimen — an inline SVG
// data URL so the gallery needs no asset/network.
const SAMPLE_RECIPE_PHOTO =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="400"><rect width="320" height="400" fill="#f4ecdc"/><text x="24" y="56" font-family="Georgia" font-size="26" fill="#5b4a36">Biscuits à l'avoine</text><text x="24" y="110" font-family="Georgia" font-size="18" fill="#7a6a52">3/4 tasse de farine</text><text x="24" y="140" font-family="Georgia" font-size="18" fill="#7a6a52">1 c. à thé de cannelle</text><text x="24" y="170" font-family="Georgia" font-size="18" fill="#7a6a52">2 œufs</text><text x="24" y="230" font-family="Georgia" font-size="18" fill="#7a6a52">Cuire 12 minutes.</text></svg>`,
  )

// Two stand-in people for the ConnectPeople specimen.
const DEMO_PEOPLE: Person[] = [
  { kind: 'contact', id: 'a', key: 'contact:a', name: 'Aliss Descôteaux', firstName: 'Aliss', lastName: 'Descôteaux', avatarKind: null, avatarRef: null, colour: '#C45E86', birthday: null, isChild: false, email: null, phone: null, gender: 'f' },
  { kind: 'contact', id: 'b', key: 'contact:b', name: 'Félix Descôteaux', firstName: 'Félix', lastName: 'Descôteaux', avatarKind: null, avatarRef: null, colour: '#C45E86', birthday: null, isChild: false, email: null, phone: null, gender: 'm' },
]

// A family-kind group over the two demo people, for the CompleteFamilies specimen —
// with no links between them the engine proposes one generic « membre de la famille » tie.
const DEMO_FAMILY_GROUP: ContactGroup = {
  id: 'g-demo',
  name: 'Famille Descôteaux',
  kind: 'family',
  colour: null,
  memberKeys: new Set(['contact:a', 'contact:b']),
}

// Self-contained ReviewChecklist specimen: a button opens the approve-then-apply list.
function ReviewDemo() {
  const [open, setOpen] = useState(false)
  const items = ['Ajouter Aliss', 'Ajouter Félix', 'Préciser : Aliss · Sœur de Félix']
  return (
    <>
      <button type="button" className="btn btn--sm btn--ghost" onClick={() => setOpen(true)}>
        Ouvrir la liste de révision
      </button>
      <ReviewChecklist
        open={open}
        onClose={() => setOpen(false)}
        title="Réviser les changements"
        items={items}
        renderItem={(s) => <span className="review__name">{s}</span>}
        onApply={() => setOpen(false)}
        applyAllLabel={(n) => `Tout appliquer (${n})`}
        applySelectedLabel={(n) => `Appliquer (${n})`}
      />
    </>
  )
}

// A tiny stand-in "world" for the CercleConstellation specimen: a Maisonnée at the
// centre, an extended family and a friends group orbiting, bridged by the people who
// tie them together.
const dwPerson = (kind: PersonKind, id: string, name: string, colour: string): Person => ({
  kind, id, key: personKey(kind, id), name, firstName: name, lastName: '', avatarKind: null, avatarRef: null, colour, birthday: null, isChild: false, email: null, phone: null, gender: null,
})
const DEMO_WORLD_PEOPLE: Person[] = [
  dwPerson('member', 'm1', 'Maman', '#2A8F85'),
  dwPerson('member', 'm2', 'Léa', '#2A8F85'),
  dwPerson('contact', 'a', 'Mamie', '#C45E86'),
  dwPerson('contact', 'b', 'Papi', '#C45E86'),
  dwPerson('contact', 'f', 'Fred', '#6B8A52'),
  dwPerson('contact', 'n', 'Nora', '#6B8A52'),
]
const DEMO_WORLD_BYKEY = new Map(DEMO_WORLD_PEOPLE.map((p) => [p.key, p]))
const DEMO_WORLD: World = {
  islands: [
    { id: 'household', name: 'Maisonnée', kind: 'household', groupKind: null, colour: '#2A8F85', memberKeys: [personKey('member', 'm1'), personKey('member', 'm2')] },
    { id: 'auto:roy', name: 'Famille Roy', kind: 'family', groupKind: null, colour: null, memberKeys: [personKey('contact', 'a'), personKey('contact', 'b')] },
    { id: 'group:amis', name: 'Amis', kind: 'group', groupKind: 'friends', colour: null, memberKeys: [personKey('contact', 'f'), personKey('contact', 'n')] },
  ],
  bridges: [
    { aId: 'household', bId: 'auto:roy', viaKeys: [personKey('member', 'm1')] },
    { aId: 'household', bId: 'group:amis', viaKeys: [personKey('member', 'm2')] },
  ],
}

// Stand-in household members for the CercleNotes specimen (the face row).
const DEMO_MEMBERS: Member[] = [
  { id: 'm1', displayName: 'Camille', avatarKind: 'color', avatarRef: '#C45E86', colour: '#C45E86', isChild: false, email: null, phone: null, birthday: null, notes: null, gender: 'f' },
  { id: 'm2', displayName: 'Léa', avatarKind: 'color', avatarRef: '#6C8EBF', colour: '#6C8EBF', isChild: true, email: null, phone: null, birthday: null, notes: null, gender: 'f' },
]

// « Voyage partagé » stand-ins — one shared trip with two member households, and a
// packing list mixing this household's bags (editable) with another's (read-only).
const DEMO_MY_HOUSEHOLD = 'hh-me'
const DEMO_SHARED_TRIP: SharedTrip = {
  id: 'st-demo',
  owner_household_id: DEMO_MY_HOUSEHOLD,
  title: 'Chalet au lac',
  destination: 'Mont-Tremblant',
  start_at: null,
  end_at: null,
  media_kind: null,
  media_key: null,
  colour: '#88a36f',
  notes: null,
  invite_nonce: 'demo',
  position: 0,
  created_at: 0,
  updated_at: null,
  members: [
    { household_id: DEMO_MY_HOUSEHOLD, label: 'Chez nous', colour: '#88a36f', role: 'owner' },
    { household_id: 'hh-other', label: 'Chez Papi', colour: '#C45E86', role: 'member' },
  ],
  myRole: 'owner',
}
const DEMO_SHARED_PACKING: SharedPackingItem[] = [
  { id: 'p1', shared_trip_id: 'st-demo', household_id: DEMO_MY_HOUSEHOLD, bag_label: null, text: 'Crème solaire', packed_at: null, position: 0, created_at: 0 },
  { id: 'p2', shared_trip_id: 'st-demo', household_id: DEMO_MY_HOUSEHOLD, bag_label: 'Léa', text: 'Toutou', packed_at: null, position: 1, created_at: 0 },
  { id: 'p3', shared_trip_id: 'st-demo', household_id: 'hh-other', bag_label: null, text: 'Jeux de société', packed_at: null, position: 0, created_at: 0 },
]

// One labelled specimen inside an entry.
function Demo({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="devkit__demo">
      <div className="devkit__demo-label mono">{label}</div>
      <div className="devkit__demo-body">{children}</div>
    </div>
  )
}

// Self-contained Toggle specimen (the calm on/off pill needs its own on/off state).
function ToggleSpec() {
  const [on, setOn] = useState(true)
  return (
    <Toggle
      on={on}
      icon={on ? 'sun-horizon-bold' : 'sun-bold'}
      label={on ? 'Activé' : 'Désactivé'}
      onClick={() => setOn((v) => !v)}
    />
  )
}

// The entity-detail peek opens as a bottom sheet, so its specimen is a button
// that toggles it (a sample model — no hearts, so it needs no network).
function DetailSheetDemo() {
  const [open, setOpen] = useState(false)
  const model: DetailModel = {
    kind: 'event',
    title: 'Rendez-vous dentiste',
    icon: 'calendar-blank-bold',
    accent: '#7BB0C9',
    when: 'mar. 18 juin · 14 h 00',
    who: { role: 'Tour de', name: 'Camille', colour: '#88A36F' },
    blocks: [{ kind: 'chips', label: 'Équipe', chips: ['Camille', 'Marc'] }],
    actions: [{ key: 'day', label: 'Voir la journée', icon: 'calendar-blank-bold', primary: true, run: () => {} }],
  }
  return (
    <>
      <button type="button" className="btn btn--primary" onClick={() => setOpen(true)}>
        <Icon name="magnifying-glass-bold" size={18} /> Ouvrir le détail
      </button>
      <EntityDetailSheet model={open ? model : null} onClose={() => setOpen(false)} />
    </>
  )
}

// « Vide-frigo » (#5) opens a two-step sheet that talks to the AI, so its specimen is
// a button. With no live API here it lands on the calm error state — the chrome (idea
// chips, recipe cards, the back/keep/cook actions) is what the gallery shows.
function FridgeSheetDemo() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" className="btn btn--primary" onClick={() => setOpen(true)}>
        <Icon name="cooking-pot-bold" size={18} /> Ouvrir Vide-frigo
      </button>
      <EmptyFridgeSheet
        open={open}
        onClose={() => setOpen(false)}
        soonItems={['épinards', 'crème', 'champignons']}
        reserveItems={['pâte feuilletée']}
      />
    </>
  )
}

// The full-screen rich note editor (#richnotes), reused for new + modify. Opens over
// the page; auto-saves on close. Seeded here with a sample Markdown body so the toolbar
// and « Aperçu » preview are explorable.
// The « Plus tard » schedule picker (calm presets + native date/time), shared by the mot
// composer and the sender-outbox reschedule sheet. Controlled → a tiny state host here.
function ScheduleFieldsDemo() {
  const [date, setDate] = useState(todayDateStr)
  const [time, setTime] = useState('19:00')
  return <ScheduleFields date={date} time={time} onDate={setDate} onTime={setTime} />
}

function NoteEditorDemo() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" className="btn btn--primary" onClick={() => setOpen(true)}>
        <Icon name="file-text-bold" size={18} /> Ouvrir l’éditeur de note
      </button>
      <NoteEditor
        open={open}
        note={{
          id: 'demo',
          member_id: null,
          author_member_id: null,
          title: 'Liste de mémé',
          text: '**Gras**, *italique*, ~~barré~~\n\n## Épicerie\n- lait\n- [ ] œufs\n- [x] beurre\n\n> à rapporter demain',
          media_kind: null,
          media_key: null,
          scene_key: null,
          created_at: 0,
          updated_at: null,
        }}
        scope="family"
        memberId={null}
        members={[]}
        onClose={() => setOpen(false)}
      />
    </>
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

// HelpBubble owns no visibility — the consumer does — so the specimen tracks `open`
// and offers a button to bring it back after the ✕ (it has onClose but no internal
// show/hide). Shown with a `card` so the "→ Voir le guide" deep-link renders.
function HelpBubbleDemo() {
  const [open, setOpen] = useState(true)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', alignItems: 'flex-start' }}>
      {open ? (
        <HelpBubble
          title="Capture rapide"
          body="Tape ou dicte une note — l'IA la range au bon endroit."
          card="capture"
          onClose={() => setOpen(false)}
        />
      ) : (
        <button type="button" className="btn btn--sm btn--ghost" onClick={() => setOpen(true)}>
          Revoir la bulle
        </button>
      )}
    </div>
  )
}

// A component that throws on render, to show the ErrorBoundary fallback. Armed by a
// button so the throw is contained; « Réinitialiser » bumps a key to remount a clean
// boundary. (Don't click the fallback's own Recharger/Aller au babillard — those act
// on the whole gallery. In Vite dev the error overlay also pops; dismiss it, the
// boundary fallback is underneath.)
function Boom(): ReactNode {
  throw new Error('Démo : un composant a planté.')
}
function BoundaryDemo() {
  const [armed, setArmed] = useState(false)
  const [attempt, setAttempt] = useState(0)
  if (!armed) {
    return (
      <button type="button" className="btn btn--sm btn--danger" onClick={() => setArmed(true)}>
        Déclencher l'erreur
      </button>
    )
  }
  return (
    <div style={{ maxHeight: 360, overflow: 'auto' }}>
      <ErrorBoundary key={attempt}>
        <Boom />
      </ErrorBoundary>
      <button
        type="button"
        className="btn btn--sm btn--ghost"
        style={{ marginTop: '0.6rem' }}
        onClick={() => {
          setArmed(false)
          setAttempt((a) => a + 1)
        }}
      >
        Réinitialiser
      </button>
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
  const [comboVal, setComboVal] = useState('')
  const [cfDemo, setCfDemo] = useState<ContactCoreValue>(EMPTY_CONTACT_CORE)
  const [tagDemo, setTagDemo] = useState('')
  const [color, setColor] = useState(PALETTE[0])
  const [cards, setCards] = useState(['toilette', 'rince', 'pyjama'])
  const [recur, setRecur] = useState<RecurValue | null>({ freq: 'weekly', interval: 1, weekdays: [3] })
  const [lead, setLead] = useState<number | null>(10800)
  const [chipOn, setChipOn] = useState<string[]>(['préféré'])
  const [subtab, setSubtab] = useState<'meals' | 'pantry' | 'recipes'>('meals')
  const [miniTab, setMiniTab] = useState<'aa' | 'coll'>('aa')
  const [face, setFace] = useState<string | null>(null)
  const [picks, setPicks] = useState<string[]>([])
  const [emoji, setEmoji] = useState('⭐')
  const [tags, setTags] = useState(['rapide', 'végé'])
  const [modalOpen, setModalOpen] = useState(false)
  const [familyShareOpen, setFamilyShareOpen] = useState(false)
  const [voyageShareOpen, setVoyageShareOpen] = useState(false)
  const [shareModalOpen, setShareModalOpen] = useState(false)
  const [drawChoiceOpen, setDrawChoiceOpen] = useState(false)
  const [readReviewOpen, setReadReviewOpen] = useState(false)
  const [drawChoiceMode, setDrawChoiceMode] = useState<DrawEditMode | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [listPickOpen, setListPickOpen] = useState(false)
  const voice = useVoiceInput(setText3, { continuous: true, split: true })
  const [dragPills, setDragPills] = useState(['Rapide', 'Végé', 'Souper', 'Dessert'])
  // CardDeckEditor specimen: a 3-card deck + parallel clip/photo arrays (#17 A/C),
  // kept length-locked to the deck by the editor itself (alignSide).
  const [deck, setDeck] = useState<DeckCard[]>([
    { icon: '🪥', label: 'Brosser les dents', seconds: 120 },
    { icon: '👕', label: "S'habiller" },
    { icon: '🛏️', label: 'Au lit' },
  ])
  const [deckClips, setDeckClips] = useState<string[]>(['', '', ''])
  const [deckPhotos, setDeckPhotos] = useState<string[]>(['', '', ''])
  const dragPillDnd = usePointerDnd({
    onDrop: (from, to) =>
      setDragPills((ps) => {
        const next = [...ps]
        const [moved] = next.splice(Number(from), 1)
        next.splice(Number(to), 0, moved)
        return next
      }),
    canDrop: (from, to) => from !== to,
  })
  const icons = Object.keys(PIP_ICONS) as IconName[]

  const toggleChip = (k: string) => setChipOn((s) => (s.includes(k) ? s.filter((x) => x !== k) : [...s, k]))

  // The catalogue. Order within a category is the reading order.
  const entries: Entry[] = [
    {
      cat: 'Affichage',
      name: 'BoardLayoutSection',
      file: 'components/operator/boardLayout.tsx',
      kw: 'board cards show hide reorder disposition babillard layout per-device',
      render: () => <BoardLayoutSection />,
    },
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
              submitLabel={t.common.add}
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
              submitLabel={t.common.add}
              voice={voice}
              placeholder={voice.listening ? t.capture.listening : 'Parler ou écrire…'}
            />
          </Demo>
          <Demo label="trailing (a small action beside the submit — Liste's flyer magnifier)">
            <EditField
              value={text1}
              onChange={setText1}
              onSubmit={() => setText1('')}
              submitLabel={t.common.add}
              submitLeadingIcon="plus-bold"
              submitVariant="primary"
              placeholder="Ajouter un article…"
              trailing={
                <button type="button" className="edit-field__icon-btn" aria-label={t.shop.browse} title={t.shop.browse}>
                  <Icon name="magnifying-glass-bold" size={17} />
                </button>
              }
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
      name: 'AislePicker',
      file: 'components/AislePicker.tsx',
      kw: 'aisle allée grocery list sort override select épicerie magasin classer',
      render: () => (
        <>
          <Demo label="set a grocery item's store aisle (override, keyed by item name)">
            <AislePicker text="Lait 2%" />
          </Demo>
          <Demo label="compact (quick-add row)">
            <AislePicker text="Pain tranché" className="qa__aisle" />
          </Demo>
        </>
      ),
    },
    {
      cat: 'Saisie',
      name: 'EntityCombobox',
      file: 'components/EntityCombobox.tsx',
      kw: 'combobox select searchable pick free text recette reste choisir liste déroulante search',
      render: () => {
        // The unified "search + pick an existing thing + free-text" field. One box
        // filters a grouped dropdown (recipes / leftovers…); pick a row to link it,
        // or just type and submit. Replaces the old "type here OR toggle a list" split.
        const opts: ComboOption<string>[] = [
          {
            id: 'r1',
            label: 'Macaroni chinois',
            data: 'r1',
            group: 'Recettes',
            icon: 'book-open-bold',
            iconColor: 'var(--berry-deep)',
            keywords: ['pâtes', 'boeuf'],
            badge: <span className="combobox__badge is-ready mono">Prêt</span>,
          },
          {
            id: 'r2',
            label: 'Pâté chinois',
            data: 'r2',
            group: 'Recettes',
            icon: 'book-open-bold',
            iconColor: 'var(--berry-deep)',
            badge: <span className="combobox__badge mono">il manque 2</span>,
          },
          {
            id: 'l1',
            label: 'Reste de spaghetti',
            data: 'l1',
            group: 'Restants',
            icon: 'arrow-counter-clockwise-bold',
            iconColor: 'var(--terracotta-deep)',
          },
        ]
        // typeaheadOnly: suggestions appear ONLY while typing a match (no caret,
        // no open-on-focus) — for fields whose values already show elsewhere
        // (the recipe-tag chips), as a "did you mean this existing one?" guard.
        const tagOpts: ComboOption<string>[] = ['végé', 'rapide', 'réconfort', 'sans gluten'].map((tg) => ({
          id: tg,
          label: tg,
          data: tg,
        }))
        return (
          <>
            <Demo label="search + pick + free-text (grouped recipes / leftovers)">
              <EntityCombobox
                value={comboVal}
                onChange={setComboVal}
                options={opts}
                onPick={(o) => setComboVal(o.label)}
                onSubmit={() => setComboVal('')}
                submitLabel={t.kitchen.setMeal}
                placeholder={t.kitchen.plan}
                noMatchLabel={t.combo.noMatch}
              />
            </Demo>
            <Demo label="typeaheadOnly (tag entry — suggests only while typing, e.g. « vé »)">
              <EntityCombobox
                value={tagDemo}
                onChange={setTagDemo}
                options={tagOpts}
                onPick={(o) => setTagDemo(o.label)}
                onSubmit={() => setTagDemo('')}
                submitIcon="plus-bold"
                placeholder={t.recipes.tagAdd}
                ariaLabel={t.recipes.tagAdd}
                typeaheadOnly
              />
            </Demo>
          </>
        )
      },
    },
    {
      cat: 'Saisie',
      name: 'ContactFields',
      file: 'components/cercle/ContactFields.tsx',
      kw: 'cercle person contact form fields name birthday gender address intake fiche identité champs',
      render: () => (
        // The shared identity field cluster (name parts, birthday, gender, optional
        // phone/email/address). Used by the cercle ContactForm AND the relative-facing
        // intake form (/intake) so both show the exact same fields.
        <>
          <Demo label="full (self card — names, birthday, gender, contact, address)">
            <div className="cf">
              <ContactFields value={cfDemo} onChange={(p) => setCfDemo((c) => ({ ...c, ...p }))} />
            </div>
          </Demo>
          <Demo label="compact (a household member — names, birthday, gender only)">
            <div className="cf">
              <ContactFields
                value={cfDemo}
                onChange={(p) => setCfDemo((c) => ({ ...c, ...p }))}
                showContact={false}
                showAddress={false}
              />
            </div>
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
      name: 'MemberSwitcher',
      file: 'components/MemberSwitcher.tsx',
      kw: 'membre face visage maisonnée household pick profile switcher aujourd’hui board notes cercle',
      render: () => (
        // The shared "pick-a-face" row from the board's "Aujourd'hui" header, now
        // controlled + identity-agnostic — also the « Le cercle » Notes "whose notes"
        // picker. Map any member shape to {id,name,colour,photoUrl} at the call site.
        <Demo label="Maisonnée + member faces — re-tap the active face to clear">
          <MemberSwitcher
            faces={DEMO_MEMBERS.map((m) => ({ id: m.id, name: m.displayName, colour: m.colour }))}
            value={face}
            onChange={setFace}
            allLabel="Maisonnée"
            ariaLabel="Choisir une personne"
          />
        </Demo>
      ),
    },
    {
      cat: 'Saisie',
      name: 'MemberPicker',
      file: 'components/MemberPicker.tsx',
      kw: 'membre face multi rotation corvée passagers owners routine pick multiple ordinal turn order',
      render: () => (
        // The MULTI-select sibling of MemberSwitcher — tap several faces (chore rotation,
        // event passengers, a pet's owners). `ordinals` shows the 1-based turn order.
        <Demo label="Multi-pick faces — ordinals show the rotation turn order">
          <MemberPicker
            faces={DEMO_MEMBERS.map((m) => ({ id: m.id, name: m.displayName, colour: m.colour }))}
            values={picks}
            onToggle={(id) => setPicks((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]))}
            ariaLabel="Choisir des personnes"
            ordinals
          />
        </Demo>
      ),
    },
    {
      cat: 'Saisie',
      name: 'FormFooter',
      file: 'components/FormFooter.tsx',
      kw: 'form footer save cancel delete enregistrer annuler supprimer commit bar edit form',
      render: () => (
        // The shared commit bar for every edit form: Save (primary) + Cancel, with an
        // optional destructive Delete separated to the left. saveType='button' here (no <form>).
        <Demo label="Save + Cancel + a separated Delete">
          <FormFooter
            saveLabel="Enregistrer"
            saveType="button"
            onSave={() => {}}
            onCancel={() => {}}
            onDelete={() => {}}
            deleteLabel="Supprimer"
          />
        </Demo>
      ),
    },
    {
      cat: 'Saisie',
      name: 'EmojiPicker',
      file: 'components/EmojiPicker.tsx',
      kw: 'emoji picto glyph pick palette routine carnet card icon tap grid search recherche champ field',
      render: () => (
        // The shared tap-to-pick emoji control — a routine card, a carnet, anything.
        // Controlled: value highlighted, onPick returns the glyph. Search filters by
        // keyword (« eau », « outil »). EmojiField is the compact tap-to-open trigger.
        <>
          <Demo label="EmojiField — tap the glyph to open the searchable picker (big surface)">
            <EmojiField value={emoji} onPick={setEmoji} ariaLabel="Choisir un emoji" fallback="📦" />
          </Demo>
          <Demo label="EmojiPicker inline — search + broad shared set, scrollable">
            <EmojiPicker value={emoji} onPick={setEmoji} ariaLabel="Choisir un emoji" />
          </Demo>
        </>
      ),
    },
    {
      cat: 'Saisie',
      name: 'FaceSelect',
      file: 'components/FaceSelect.tsx',
      kw: 'membre face visage maisonnée household pick profile chip collapsed sheet tap aujourd’hui board cercle notes mobile',
      render: () => (
        // The COLLAPSED sibling of MemberSwitcher: a chip that opens a face-pick sheet
        // on tap — the board's "Aujourd'hui" mobile pattern, controlled. Use the row on
        // a kiosk, this chip on mobile (Le cercle does exactly that). Same value/onChange.
        <Demo label="Collapsed pick-a-face chip — tap to open the faces sheet">
          <FaceSelect
            faces={DEMO_MEMBERS.map((m) => ({ id: m.id, name: m.displayName, colour: m.colour }))}
            value={face}
            onChange={setFace}
            allLabel="Maisonnée"
            ariaLabel="Choisir une personne"
          />
        </Demo>
      ),
    },
    {
      cat: 'Saisie',
      name: 'GroupForm',
      file: 'components/cercle/GroupForm.tsx',
      kw: 'cercle groupe nom type couleur créer modifier group name kind colour',
      render: () => (
        // The name + kind + colour editor for a « Le cercle » named group — shared by
        // the create flow and the inline edit on a group header.
        <Demo label="name + kind + colour — create / edit a Cercle group">
          <GroupForm submitLabel={t.cercle.addGroup} onSubmit={() => {}} onCancel={() => {}} />
        </Demo>
      ),
    },
    {
      cat: 'Saisie',
      name: 'ShareModal',
      file: 'components/ShareModal.tsx',
      kw: 'partager share link lien qr copy revoke snapshot recipe recette generic sheet',
      render: () => (
        // The generic share sheet: Modal + copy-flip + « Partager via… » + QR. onCreate
        // mints the link (here a stub); the family/voyage/recipe sheets wrap it. Below
        // the link block, children hold a roster or a revoke ledger.
        <Demo label="generic share sheet — mint a link, copy, QR (onCreate is a stub here)">
          <button className="btn" onClick={() => setShareModalOpen(true)}>
            {t.shareLink.action}
          </button>
          <ShareModal
            open={shareModalOpen}
            onClose={() => setShareModalOpen(false)}
            title={`${t.shareLink.action} · Macaroni chinois`}
            intro={t.shareLink.recipeIntro}
            linkHint={t.shareLink.linkHint}
            onCreate={async () => ({ url: `${location.origin}/partage/DEMOshareId` })}
          />
        </Demo>
      ),
    },
    {
      cat: 'Saisie',
      name: 'FamilyShareModal',
      file: 'components/cercle/FamilyShareModal.tsx',
      kw: 'cercle famille partager lien qr share family link revoke import household',
      render: () => (
        // « Partager une famille » — mint a share link (+ QR) to hand a family to a
        // friend on their own account, and revoke active shares. The recipient merges
        // it via /cercle/import (FamilyImportPage). Reuses QrCode + Modal.
        <Demo label="share a family to another account — link + QR + revoke list">
          <button className="btn" onClick={() => setFamilyShareOpen(true)}>
            {t.familyShare.shareFamily}
          </button>
          <FamilyShareModal
            open={familyShareOpen}
            onClose={() => setFamilyShareOpen(false)}
            family={{
              label: 'Famille Tremblay',
              payload: {
                self: { firstName: 'Marc', lastName: 'Tremblay', nickname: '', birthday: null, gender: 'm', email: '', phone: '', address: null, notes: '', photoKey: null },
                household: [{ firstName: 'Léa', lastName: 'Tremblay', nickname: '', birthday: null, gender: 'f', email: '', phone: '', address: null, notes: '', photoKey: null }],
                links: [{ aIndex: 0, bIndex: 1, type: 'spouse' }],
                pets: [],
              },
            }}
          />
        </Demo>
      ),
    },
    {
      cat: 'Saisie',
      name: 'BusinessForm',
      file: 'components/cercle/BusinessForm.tsx',
      kw: 'cercle business commerce service vendeur vét plombier hôpital carte nom catégorie',
      render: () => (
        // « Le cercle » → Business: add / edit one service card (vet, plumber…) —
        // a simpler ContactForm (no relations/vCard/member link). Isolated from people.
        <Demo label="name + category + reach + notes + card photo — a Business card">
          <BusinessForm onSaved={() => {}} onCancel={() => {}} />
        </Demo>
      ),
    },
    {
      cat: 'Saisie',
      name: 'ConnectPeople',
      file: 'components/cercle/ConnectPeople.tsx',
      kw: 'cercle relier famille lien connect families junction relationship closure',
      render: () => (
        // Connect two people (hence two families) at ONE junction: "X est [lien] de Y".
        // The relationship closure (lib/cercle closedLinks) propagates the rest.
        <Demo label='"X est [lien] de Y" — one link connects two families'>
          <ConnectPeople people={DEMO_PEOPLE} />
        </Demo>
      ),
    },
    {
      cat: 'Saisie',
      name: 'PetForm',
      file: 'components/cercle/PetForm.tsx',
      kw: 'cercle animal pet chien chat vétérinaire micropuce gamelle poids gardienne species breed vet weight sitter',
      render: () => (
        // « Le cercle » → Pets: add / edit one animal (PersonKind 'pet') — name, species,
        // breed, birthday, microchip, feeding, sitter notes, a weight log + a VET picked
        // from the Businesses. Mirrors BusinessForm; writes /api/pets, refreshes the cercle.
        <Demo label="name + species + care fields + weight log + vet — a Pet card">
          <PetForm onSaved={() => {}} onCancel={() => {}} />
        </Demo>
      ),
    },
    {
      cat: 'Saisie',
      name: 'CompleteFamilies',
      file: 'components/cercle/CompleteFamilies.tsx',
      kw: 'cercle compléter familles famille groupe lien relative relier checklist approbation completion',
      render: () => (
        // « Le cercle » → Famille: one button that makes a famille-kind group 100%
        // related — precise rung from the link hierarchy where known, a generic kin tie
        // otherwise — behind the shared ReviewChecklist (same flow as the .vcf import).
        <Demo label="Smart-complete a family group, with review-then-apply">
          <CompleteFamilies people={DEMO_PEOPLE} storedLinks={[]} groups={[DEMO_FAMILY_GROUP]} />
        </Demo>
      ),
    },
    {
      cat: 'Voyage',
      name: 'TripNoteCard',
      file: 'components/voyage/TripNoteCard.tsx',
      kw: 'voyage trip note itinéraire info catégorie média carnet de voyage card',
      render: () => (
        // One « Voyage » info/itinerary entry — category glyph + label + text (+ media:
        // a voice memo plays inline, a drawing/photo zooms). Same render across Infos and
        // Itinéraire. `onSave` adds an inline ✏️ edit (PATCH text); `onDelete` a 🗑️.
        <Demo label="a trip note (category + label + text), member-scoped, edit + delete">
          <TripNoteCard
            note={{
              id: 'demo',
              trip_id: 'demo',
              category: 'hotel',
              label: 'Hôtel Le Bonne Entente',
              text: 'Réservation #4471 — arrivée après 15 h, stationnement inclus.',
              media_kind: null,
              media_key: null,
              scene_key: null,
              member_id: null,
              date: null,
              position: 0,
              created_at: 0,
              updated_at: null,
            }}
            who="Les enfants"
            onSave={() => {}}
            onDelete={() => {}}
          />
        </Demo>
      ),
    },
    {
      cat: 'Voyage',
      name: 'SharedPackingList',
      file: 'components/voyage/SharedPackingList.tsx',
      kw: 'voyage partagé shared trip packing bagages valise household maisonnée read-only bag',
      render: () => (
        // « Voyage partagé » → Bagages — per-HOUSEHOLD bags (not per member). This
        // household's section is editable (add / check / rename+move); other households
        // show read-only. Reuses CheckRow + EditField + Avatar + useDeferredRemoval.
        <Demo label="per-household bags — own editable, others read-only">
          <SharedPackingList trip={DEMO_SHARED_TRIP} items={DEMO_SHARED_PACKING} myHouseholdId={DEMO_MY_HOUSEHOLD} />
        </Demo>
      ),
    },
    {
      cat: 'Voyage',
      name: 'VoyageShareModal',
      file: 'components/voyage/VoyageShareModal.tsx',
      kw: 'voyage partagé shared trip invite link qr member household owner reset lien',
      render: () => (
        // « Voyage partagé » → the share sheet — mint an invite link (+ QR), list member
        // households + roles, owner « Réinitialiser le lien ». Leave/dissolve live in the
        // SharedVoyagePage foot, NOT here (the way out never hides behind « Inviter »).
        // Mirrors FamilyShareModal; reuses Modal + QrCode + Avatar + useConfirm.
        <Demo label="invite a household — link + QR + roster">
          <button className="btn" onClick={() => setVoyageShareOpen(true)}>
            {t.sharedVoyage.invite}
          </button>
          <VoyageShareModal
            open={voyageShareOpen}
            onClose={() => setVoyageShareOpen(false)}
            trip={DEMO_SHARED_TRIP}
            myHouseholdId={DEMO_MY_HOUSEHOLD}
          />
        </Demo>
      ),
    },
    {
      cat: 'Saisie',
      name: 'ReviewChecklist',
      file: 'components/ReviewChecklist.tsx',
      kw: 'review checklist approbation tick select all apply batch vcf import compléter familles modal',
      render: () => (
        // The shared "propose a batch of writes → tick which to keep → apply all or the
        // selection" Modal. Behind the .vcf contact import AND « Compléter les familles ».
        <Demo label="Approve-then-apply a batch of proposed changes">
          <ReviewDemo />
        </Demo>
      ),
    },
    {
      cat: 'Saisie',
      name: 'CercleNotes',
      file: 'components/cercle/CercleNotes.tsx',
      kw: 'cercle famille notes recommandations iOS quick note moi maisonnée self family scope media',
      render: () => (
        // « Le cercle » → Famille → "Notes & recommandations": iOS-Notes-style quick
        // notes scoped to a member ("Moi") or the whole Maisonnée, with audio/drawing/
        // photo. Reads the live family-notes query (empty here) + a face row to scope by.
        <Demo label="Quick notes scoped to Moi / Maisonnée, with media">
          <CercleNotes members={DEMO_MEMBERS} />
        </Demo>
      ),
    },
    {
      cat: 'Saisie',
      name: 'NoteEditor',
      file: 'components/cercle/NoteEditor.tsx',
      kw: 'note editor rich text markdown bold italic strike heading bullet numbered checklist quote title full screen cercle famille attachment',
      render: () => (
        // Full-screen iOS-Notes-style editor (#richnotes): optional title + Markdown body
        // (bold/italic/strike, headings, bullets/numbered/checklists, quote) + one photo/
        // drawing attachment. Reused for new + modify; auto-saves on close.
        <Demo label="Full-screen rich note editor (title + Markdown + attachment)">
          <NoteEditorDemo />
        </Demo>
      ),
    },
    {
      cat: 'Saisie',
      name: 'MotComposer',
      file: 'components/mots/MotComposer.tsx',
      kw: 'mot laisse un mot message answering machine fridge member to member recipient voice drawing photo text mots inbox board card face dot',
      render: () => (
        // « Laisse un mot » composer (board ＋ « Mot » panel): pick a recipient face (or the
        // whole Maisonnée), then type or record a voice/drawing/photo memo. The waiting mots
        // surface in the board's « Mots » band card (MotsCard) with a per-face presence dot.
        <Demo label="Leave-a-note composer (recipient + text/voice/draw/photo)">
          <MotComposer onDone={() => {}} />
        </Demo>
      ),
    },
    {
      cat: 'Saisie',
      name: 'ScheduleFields',
      file: 'components/mots/ScheduleFields.tsx',
      kw: 'mot plus tard later schedule surface_at date time preset ce soir demain matin week-end reschedule reminder me le rappeler',
      render: () => (
        // The « Plus tard » schedule picker: calm one-tap presets over the native date/time
        // inputs. Shared by MotComposer (« Plus tard ») + the outbox reschedule sheet.
        <Demo label="Schedule presets + date/time (« Plus tard »)">
          <ScheduleFieldsDemo />
        </Demo>
      ),
    },
    {
      cat: 'Cercle',
      name: 'CercleConstellation',
      file: 'components/cercle/CercleConstellation.tsx',
      kw: 'cercle monde world overview islands families groups bridges narrated raconte map constellation vue ensemble big picture toddler',
      render: () => (
        // « Notre monde » — the big-picture overview map: each cluster a coloured
        // island, faces inside, bridges between, all tappable + read aloud, with a
        // « Raconte-moi » guided tour. Rendered here at a fixed height.
        <Demo label="Overview map — islands, faces, bridges, narrated tour">
          <div style={{ height: '60vh' }}>
            <CercleConstellation world={DEMO_WORLD} byKey={DEMO_WORLD_BYKEY} />
          </div>
        </Demo>
      ),
    },
    {
      cat: 'Toddler',
      name: 'SeekGame',
      file: 'components/jouer/SeekGame.tsx',
      kw: 'jouer play cherche trouve find-it toddler hear-first game educational decks animals colours food weather faces calm',
      render: () => (
        // « Cherche et trouve » — the hear-first find-it toy (part of the « Jouer »
        // play space). Pick a deck, then "Trouve X !"; right tile → "Bravo !" + a new
        // prompt, anything else just reads its name. No score, no fail (NFR-CALM).
        <Demo label="Find-it toy — pick a deck, then « Trouve X ! »">
          <SeekGame
            decks={buildSeekDecks([], 'fr', { faces: 'Visages', animals: 'Animaux', colors: 'Couleurs', foods: 'Aliments', weather: 'Météo', mix: 'Mélange' })}
          />
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
      name: 'Cluster · Rail',
      file: 'components/Layout.tsx',
      kw: 'cluster rail row rangée flex wrap scroll overflow débordement boutons layout disposition',
      render: () => (
        <>
          <Demo label="Cluster — wrap-safe button row (drops to a second line, never off the right)">
            <Cluster>
              {['Défaut', 'Petit', 'Fantôme', 'Encore'].map((k) => (
                <button key={k} className="btn btn--sm">
                  {k}
                </button>
              ))}
            </Cluster>
          </Demo>
          <Demo label="Cluster fill — buttons grow to share the row, then WRAP (the todo scope row)">
            <Cluster fill>
              <button className="btn btn--sm btn--primary">En tout temps</button>
              <button className="btn btn--sm">Aujourd’hui</button>
              <button className="btn btn--sm">Une date</button>
            </Cluster>
          </Demo>
          <Demo label="Cluster between — pushed to the ends">
            <Cluster justify="between">
              <span className="mono">Titre</span>
              <button className="btn btn--sm">Action</button>
            </Cluster>
          </Demo>
          <Demo label="Rail — one line that SCROLLS sideways on overflow (never squishes)">
            <Rail>
              {['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'].map((k) => (
                <button key={k} className="btn btn--sm" style={{ whiteSpace: 'nowrap' }}>
                  {k}
                </button>
              ))}
            </Rail>
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
      name: 'Disclosure',
      file: 'components/Disclosure.tsx',
      kw: 'disclosure expand toggle collapse repli accordéon suggestions modèles caret',
      render: () => (
        <Demo label="collapsed-by-default — tucks a chip group away">
          <Disclosure label="Listes prêtes" count={3}>
            <ChipGroup>
              {['Avant de partir', 'Chez grand-papa', 'Sac de piscine'].map((k) => (
                <Chip key={k} icon="plus-bold">
                  {k}
                </Chip>
              ))}
            </ChipGroup>
          </Disclosure>
        </Demo>
      ),
    },
    {
      cat: 'Fondations',
      name: 'Toggle',
      file: 'components/Toggle.tsx',
      kw: 'toggle switch on off pill bouton bascule activé désactivé aria-pressed réglages affichage',
      render: () => (
        <Demo label="the calm on/off pill — filled when on, aria-pressed reflects state (ambient + display settings)">
          <ToggleSpec />
        </Demo>
      ),
    },
    {
      cat: 'Fondations',
      name: 'FeatureMap',
      file: 'components/FeatureMap.tsx',
      kw: 'feature map carte concepts thèmes guide découvrir overview tout ce que ça fait',
      render: () => (
        <Demo label="themed jump-grid — “everything the app does”, one shared taxonomy (Guide + Board + here)">
          <FeatureMap onSelect={(k) => alert(`theme: ${k}`)} label="Tout ce que Babillard fait" />
        </Demo>
      ),
    },
    {
      cat: 'Fondations',
      name: 'SubTabs',
      file: 'components/SubTabs.tsx',
      kw: 'subtabs sous-onglets segmented control onglets section switch repas garde-manger recettes liste liens arbre',
      render: () => (
        <>
          <Demo label="in-page section switch (La cuisine, Le cercle) — icon optional">
            <SubTabs
              options={[
                { key: 'meals', label: 'Repas', icon: 'fork-knife-bold' },
                { key: 'pantry', label: 'Garde-manger', icon: 'carrot-bold' },
                { key: 'recipes', label: 'Recettes', icon: 'book-open-bold' },
              ]}
              value={subtab}
              onSelect={setSubtab}
              ariaLabel="Démo sous-onglets"
            />
          </Demo>
          <Demo label="text-only">
            <SubTabs
              options={[
                { key: 'meals', label: 'Repas' },
                { key: 'pantry', label: 'Garde-manger' },
                { key: 'recipes', label: 'Recettes' },
              ]}
              value={subtab}
              onSelect={setSubtab}
              ariaLabel="Démo sous-onglets texte"
            />
          </Demo>
          <Demo label="mini variant (recipe book Aa · Collections)">
            <SubTabs
              size="mini"
              options={[
                { key: 'aa', label: 'Aa' },
                { key: 'coll', label: 'Collections' },
              ]}
              value={miniTab}
              onSelect={setMiniTab}
              ariaLabel="Démo sous-onglets mini"
            />
          </Demo>
          <Demo label="tint — active pill wears a section colour (themed Réglages tabs)">
            <SubTabs
              tint="var(--terracotta-deep)"
              options={[
                { key: 'meals', label: 'Repas', icon: 'fork-knife-bold' },
                { key: 'pantry', label: 'Garde-manger', icon: 'carrot-bold' },
                { key: 'recipes', label: 'Recettes', icon: 'book-open-bold' },
              ]}
              value={subtab}
              onSelect={setSubtab}
              ariaLabel="Démo sous-onglets teintés"
            />
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
      name: 'DragPill',
      file: 'components/DragPill.tsx',
      kw: 'drag reorder grip ⠿ glisser réordonner pill tag pointer dnd',
      render: () => (
        <Demo label="drag the ⠿ grip to reorder (span chips here; also renders as <li> rows via as='li')">
          <div className="tag-admin__pills">
            {dragPills.map((p, i) => (
              <DragPill
                key={p}
                as="span"
                dnd={dragPillDnd}
                index={i}
                label={p}
                className="chip tag-admin__pill"
                gripClassName="tag-admin__pill-grip"
              >
                <span className="tag-admin__pill-name">{p}</span>
              </DragPill>
            ))}
          </div>
          <DragGhost ghost={dragPillDnd.ghost} />
        </Demo>
      ),
    },
    {
      cat: 'Rangées & actions',
      name: 'CheckRow',
      file: 'components/CheckRow.tsx',
      kw: 'check liste cocher pantry réserve',
      render: () => (
        <Demo label="check · rename · delete · extra action (→ liste)">
          <ul className="kitchen__pantry" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            <CheckRow item="Lait" note="bientôt fini" onCheck={() => {}} checkLabel="Cocher" onRename={() => {}} onDelete={() => {}} />
            <CheckRow
              item="Sauce tomate (congélo)"
              onCheck={() => {}}
              checkLabel="Utilisé"
              onRename={() => {}}
              onExtra={() => {}}
              extraIcon="shopping-bag-bold"
              extraLabel="Ajouter à la liste"
            />
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
          <Demo label="tap-to-peek: whole row (onOpen) + split (onOpen + check)">
            <Act cat="event" title="Rendez-vous dentiste" when="14:00" who="Camille" onOpen={() => {}} />
            <Act cat="chore" title="Sortir les poubelles" who="Marc" onCheck={() => {}} onOpen={() => {}} />
          </Demo>
        </>
      ),
    },
    {
      cat: 'Rangées & actions',
      name: 'BoardCard · SecLabel',
      file: 'components/board/BoardCard.tsx',
      kw: 'board card sec-label header shell auto carnets season standalone band glance',
      // The shared standalone board-card shell (auto/carnets/season). Same `.sec-label`
      // header as Section, different wrapper (a navigating Link or a plain div). The
      // emoji disc shows the iconNode path (the « Cette saison » card uses it).
      render: () => (
        <>
          <Demo label="Phosphor icon + plain div shell">
            <BoardCard className="carnets-card" icon="book-open-bold" label="Les carnets">
              <ul className="carnets-card__list">
                <li className="carnets-card__row"><span className="carnets-card__name">Toiture</span><span className="carnets-card__when mono">2031</span></li>
              </ul>
            </BoardCard>
          </Demo>
          <Demo label="emoji disc (iconNode) + count">
            <BoardCard className="carnets-card" iconNode="🍂" label="Cet automne" count={2}>
              <ul className="carnets-card__list">
                <li className="carnets-card__row"><span className="carnets-card__name">Nettoyer les gouttières</span></li>
              </ul>
            </BoardCard>
          </Demo>
        </>
      ),
    },
    {
      cat: 'Rangées & actions',
      name: 'Fil (le fil du jour)',
      file: 'components/board/Fil.tsx',
      kw: 'fil jour timeline ribbon day shape maintenant now board babillard',
      // The day-ribbon: today's timed events as a shape (soft time axis + « maintenant »
      // marker), rows reuse `Act`. Pure layout in lib/dayRibbon. Sample times are anchored
      // around a fixed "now" so the marker lands mid-list.
      render: () => {
        const base = Math.floor(Date.UTC(2026, 5, 24, 0, 0, 0) / 1000)
        const at = (h: number) => base + h * 3600
        const row = (cat: 'event' | 'work' | 'chore', title: string, when: string) => (
          <Act cat={cat} title={title} when={when} onOpen={() => {}} />
        )
        return (
          <Demo label="day-ribbon: events + a work window on the axis, chores pooled">
            <BoardSection label="Le fil du jour" icon="clock-bold" tint="var(--sky)">
              <Fil
                timed={[
                  { id: '1', start_at: at(8), node: row('event', 'Garderie', '8:00') },
                  { id: 'w', start_at: at(9), until: at(17), node: row('work', 'Au travail', '9:00–17:00') },
                  { id: '2', start_at: at(14), node: row('event', 'Rendez-vous dentiste', '14:00') },
                  { id: '3', start_at: at(18), node: row('event', 'Soccer', '18:00') },
                ]}
                untimed={[
                  { id: 'c1', node: row('chore', 'Sortir les poubelles', '') },
                  { id: 'e4', node: row('event', 'Congé férié', 'Toute la journée') },
                ]}
                anytimeLabel="À tout moment"
                nowLabel="Maintenant"
                freeLabel="Libre"
                lang="fr"
              />
            </BoardSection>
          </Demo>
        )
      },
    },
    {
      cat: 'Rangées & actions',
      name: 'MealPool (idées / restants)',
      file: 'components/kitchen/MealPool.tsx',
      kw: 'meal pool ideas leftovers restants idées plan picker kitchen list pooled candidate',
      // The shared "pool of meal candidates you plan onto a day" — « Idées de repas »
      // and « Restants » are thin wrappers over it. Add via combobox, live-poll-safe
      // deferred delete + undo, inline rename, tap-to-reveal the plan picker. Stub data.
      render: () => (
        <Demo label="a pooled candidate list (shared by Idées + Restants)">
          <MealPool
            items={[{ id: 'i1', title: 'Tacos' }, { id: 'i2', title: 'Spaghetti' }]}
            queryKey={['devkit-pool']}
            collectionKey="items"
            endpoint="meal-ideas"
            options={[]}
            buildAddBody={(title) => ({ title })}
            onPlan={() => {}}
            renderLead={() => null}
            week={[{ date: 0, label: 'Lun' }, { date: 1, label: 'Mar' }]}
            helpKey="ideas"
            labels={{
              heading: 'Idées de repas',
              addAria: 'Ajouter une idée',
              addPlaceholder: 'Ajouter une idée',
              empty: 'Aucune idée',
              removeLabel: 'Retirer',
              removedUndo: (t) => `${t} retiré`,
            }}
          />
        </Demo>
      ),
    },
    {
      cat: 'Rangées & actions',
      name: 'EntityDetailSheet',
      file: 'components/detail/EntityDetailSheet.tsx',
      kw: 'detail peek info entity sheet aperçu détail picture date board recipe routine',
      // The generalized "tap an item → picture, date, relevant text + smart actions"
      // peek. Opened from any board/kitchen row via useEntityDetail (DetailProvider);
      // built per-kind by components/detail/adapters. See lib/detail.ts.
      render: () => (
        <Demo label="open the peek (sample event model)">
          <DetailSheetDemo />
        </Demo>
      ),
    },
    {
      cat: 'Rangées & actions',
      name: 'TodoSection',
      file: 'components/todos/TodoSection.tsx',
      kw: 'todo à compléter checklist check-off départ modèle template global journée',
      // Self-fetches the real ['todos'] cache (live inside the app shell), so this
      // specimen shows the actual global glance: check-in-place, add bar, template
      // chips, "Effacer cochées". The board uses bento; the day page passes false.
      render: () => (
        <Demo label="board glance (global + today)">
          <TodoSection title="À compléter" members={[{ id: 'm1', display_name: 'Camille', colour: PALETTE[2] }]} />
        </Demo>
      ),
    },
    {
      cat: 'Rangées & actions',
      name: 'DealCard',
      file: 'components/DealCard.tsx',
      kw: 'flyer deal circulaire rabais price card aubaine',
      render: () => {
        const deal = {
          id: 1,
          flyerId: 1,
          name: 'Fraises 1 lb',
          price: 2.99,
          wasPrice: 4.49,
          unitPrice: 2.99,
          unitLabel: '/ lb',
          unitKind: 'mass' as const,
          unitApprox: false,
          merchant: 'IGA',
          logo: null,
          premium: false,
          image: sampleImg,
          validFrom: null,
          validTo: null,
        }
        return (
          <Demo label="flyer deal — best price, add-to-list + view-flyer actions">
            <DealCard deal={deal} isBest onAddToList={() => {}} onViewFlyer={() => {}} />
          </Demo>
        )
      },
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
            <SectionHeader emoji="🍳" title="Déjeuner" subtitle="Matin" action={<button className="btn btn--sm" aria-label="Ajouter"><Icon name="plus-bold" size={16} /></button>} />
          </Demo>
          <Demo label="icon + title">
            <SectionHeader icon="carrot-bold" iconColor="var(--marigold-deep)" title="Garde-manger" />
          </Demo>
        </>
      ),
    },
    {
      cat: 'Affichage',
      name: 'RoutineRing',
      file: 'components/RoutineRing.tsx',
      kw: 'routine progress ring anneau progrès jour calm calme',
      render: () => (
        <>
          <Demo label="untouched · partway · done (today's steps — no number, no streak)">
            <div style={{ display: 'flex', gap: '1.25rem', alignItems: 'center' }}>
              <span style={{ '--tint': 'var(--berry-deep)' } as React.CSSProperties}>
                <RoutineRing done={0} total={5} tint="var(--berry-deep)" label="Où on est rendu" />
              </span>
              <span style={{ '--tint': 'var(--marigold-deep)' } as React.CSSProperties}>
                <RoutineRing done={2} total={5} tint="var(--marigold-deep)" label="Où on est rendu" />
              </span>
              <span style={{ '--tint': 'var(--sage)' } as React.CSSProperties}>
                <RoutineRing done={5} total={5} tint="var(--sage)" label="Terminé aujourd'hui" />
              </span>
            </div>
          </Demo>
        </>
      ),
    },
    {
      cat: 'Affichage',
      name: 'Companion',
      file: 'components/Companion.tsx',
      kw: 'compagnon mascotte routine créature animal calme companion mascot',
      render: () => (
        <>
          <Demo label="the calm creatures a member can pick (pose follows the daypart, never progress)">
            <div style={{ display: 'flex', gap: '0.9rem', alignItems: 'center', flexWrap: 'wrap' }}>
              {COMPANIONS.map((c) => (
                <Companion key={c} companion={c} size={40} />
              ))}
            </div>
          </Demo>
          <Demo label="awake (day) vs dozing (night) — forced by the `at` timestamp">
            <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center' }}>
              <Companion companion="fox" size={44} at={new Date('2024-01-01T10:00:00').getTime()} />
              <Companion companion="fox" size={44} at={new Date('2024-01-01T23:00:00').getTime()} />
            </div>
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
      kw: 'avatar membre personne initiale photo famille couleur groupe',
      render: () => (
        <>
          <Demo label="coloured initial disc">
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <Avatar name="Camille" colour={PALETTE[2]} />
              <Avatar name="Marc" colour={PALETTE[4]} />
              <Avatar name="Léo" colour={PALETTE[0]} size={56} />
            </div>
          </Demo>
          {/* Le cercle passes a family/group's colour as `colour` so photo-less
              members read as one block (the family colour tints their initials). */}
          <Demo label="family colour — photo-less members share the group's colour">
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <Avatar name="Aliss" colour="#2A8F85" />
              <Avatar name="Félix" colour="#2A8F85" />
              <Avatar name="Rose" colour="#2A8F85" />
            </div>
          </Demo>
        </>
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
    {
      cat: 'Affichage',
      name: 'KidCollections',
      file: 'components/kitchen/KidCollections.tsx',
      kw: 'toddler bambin collections étiquettes tags recettes hear-first cuisine #11',
      render: () => {
        // A tiny fixture: three tagged recipes + an empty week so the 3-stage
        // hear-first picker (collection → recipe → day) renders end to end.
        const mk = (id: string, title: string, tags: string[]): Recipe => ({
          id,
          title,
          ingredients: [],
          steps: [],
          servings: null,
          notes: null,
          source: null,
          image: null,
          tags,
          updatedAt: 0,
        })
        const recipes: Recipe[] = [
          mk('r1', 'Soupe poulet', ['Soupes']),
          mk('r2', 'Soupe tomate', ['Soupes']),
          mk('r3', 'Biscuits', ['Desserts']),
        ]
        const now = todayLocalDay()
        const week: WeekDay[] = Array.from({ length: 7 }, (_, i) => ({ date: addLocalDays(now, i), meal: undefined }))
        return (
          <Demo label="3-stage hear-first picker (flip Audience → Bambin; tap a tile twice to commit)">
            <KidCollections recipes={recipes} week={week} onSuggest={() => {}} onBack={() => {}} />
          </Demo>
        )
      },
    },
    {
      cat: 'Affichage',
      name: 'IngredientLine',
      file: 'components/IngredientLine.tsx',
      kw: 'recette ingrédient mesure pills cuillère tasse measure tap-to-hear scoops',
      render: () => (
        <>
          <Demo label="measure pills (sm — parent recipe sheet; tap a pill to hear it)">
            <IngredientLine line="2 cuillères à soupe de beurre fondu" />
          </Demo>
          <Demo label="lg + kid (Cook mode — bigger pills, no 🔊 glyph)">
            <IngredientLine line="3/4 tasse de farine" size="lg" kid />
          </Demo>
          <Demo label="scoops (Cook mode — fill circles after the pill: count = whole scoops)">
            <IngredientLine line="2 cuillères à soupe de beurre fondu" size="lg" kid scoops />
          </Demo>
          <Demo label="no measurement → plain text (additive, never a rewrite)">
            <IngredientLine line="une pincée de sel" />
          </Demo>
        </>
      ),
    },
    {
      cat: 'Affichage',
      name: 'MeasureScoops',
      file: 'components/MeasureScoops.tsx',
      kw: 'mesure scoop ronds cercles cuillère tasse spoon circles fill toddler couleurs measurePrefs',
      render: () => (
        <>
          <Demo label="whole scoops — one circle each, in the BASE tool's colour (« remplis cette cuillère N fois »)">
            <span style={{ fontSize: '1.3rem' }}>
              {findMeasures('2 c. à soupe').map((m, i) => (
                <MeasureScoops key={i} measure={m} size="lg" />
              ))}
              {findMeasures('2 c. à thé').map((m, i) => (
                <MeasureScoops key={`t${i}`} measure={m} size="lg" />
              ))}
            </span>
          </Demo>
          <Demo label="fraction — a part-filled circle (½ tsp, ¼ tsp)">
            <span style={{ fontSize: '1.3rem' }}>
              {findMeasures('1/2 c. à thé').map((m, i) => (
                <MeasureScoops key={i} measure={m} size="lg" />
              ))}
              {findMeasures('1/4 c. à thé').map((m, i) => (
                <MeasureScoops key={`b${i}`} measure={m} size="lg" />
              ))}
            </span>
          </Demo>
          <Demo label="mixed — whole circles + the fraction (1 ½ tasse) · colours from Réglages ▸ Affichage">
            <span style={{ fontSize: '1.3rem' }}>
              {findMeasures('1 1/2 tasse').map((m, i) => (
                <MeasureScoops key={i} measure={m} size="lg" />
              ))}
            </span>
          </Demo>
        </>
      ),
    },
    {
      cat: 'Affichage',
      name: 'ZoomableImg',
      file: 'components/ZoomableImg.tsx',
      kw: 'image photo zoom lightbox tap agrandir',
      render: () => (
        <Demo label="tap to lightbox (Esc / tap to close)">
          <ZoomableImg src={sampleImg} alt="exemple" className="recipe-thumb" />
        </Demo>
      ),
    },
    {
      cat: 'Affichage',
      name: 'WonderBand',
      file: 'components/board/ApodFrame.tsx',
      kw: 'apod epic mars wonder nasa photo du jour picture of the day band babillard image écouter lire shuffle terre robot',
      render: () => (
        <Demo label="« Photo du jour » — shuffles Wikipédia / APOD / EPIC / Mars; tap image to zoom, 🔊 to hear (in the text's language), ⟳ for another source">
          <WonderBand
            wonder={{
              source: 'wiki',
              title: 'Un groupe de gazelles dorcas au crépuscule, au Maroc.',
              explanation: '',
              lang: 'fr',
              imgUrl: sampleImg,
              copyright: 'Wikimedia Commons / exemple',
            }}
            onShuffle={() => {}}
          />
          <WonderBand
            wonder={{
              source: 'apod',
              title: 'The Lagoon Nebula',
              explanation:
                'A vast cloud of gas and dust some 5,000 light-years away where new stars are born. Its pink hues come from hydrogen lit by the young stars at its heart.',
              lang: 'en',
              imgUrl: sampleImg,
              copyright: 'NASA / example',
            }}
            onShuffle={() => {}}
          />
        </Demo>
      ),
    },
    {
      cat: 'Affichage',
      name: 'PanZoom',
      file: 'components/PanZoom.tsx',
      kw: 'pan zoom pinch drag graph svg arbre tree agrandir déplacer molette',
      render: () => (
        <Demo label="pinch / drag / wheel / +− to pan + zoom (fits at rest)">
          <PanZoom className="devkit-panzoom" ariaLabel="exemple">
            <svg viewBox="0 0 320 200" preserveAspectRatio="xMidYMid meet" style={{ display: 'block', width: '100%', height: '100%' }}>
              <rect x={1} y={1} width={318} height={198} fill="none" stroke="var(--line)" strokeWidth={2} rx={10} />
              <circle cx={160} cy={100} r={56} fill="var(--berry-wash)" stroke="var(--berry)" strokeWidth={3} />
              <text x={160} y={106} textAnchor="middle" fontSize={22} fill="var(--ink)">Zoom moi</text>
            </svg>
          </PanZoom>
        </Demo>
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
          <Demo label="guide">
            <EmptyState guide={{ card: 'routines' }}>Aucune routine pour l’instant.</EmptyState>
          </Demo>
        </>
      ),
    },
    {
      cat: 'Feedback',
      name: 'GuestExpired',
      file: 'components/GuestExpired.tsx',
      kw: 'guest expired revoked link share handoff welcome family expiré lien',
      render: () => (
        <Demo label="expired / revoked guest link">
          <GuestExpired />
        </Demo>
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
      name: 'QrCode',
      file: 'components/QrCode.tsx',
      kw: 'qr code scan link share guest partage lien porte door',
      render: () => (
        <Demo label="a scannable share link (white tile, scans on any theme)">
          <QrCode value="https://babillard.example/welcome?guest=demo-token" />
        </Demo>
      ),
    },
    {
      cat: 'Feedback',
      name: 'TimerRail',
      file: 'components/cook/TimerRail.tsx',
      kw: 'timer minuterie countdown cook rail clock cuisine',
      render: () => (
        <Demo label="cook timers — running · paused · done (tap a clock to pause/restart, ✕ to dismiss)">
          <TimerRail
            timers={[
              { id: 1, label: 'Pâtes · 10 min', total: 600, remaining: 372, running: true },
              { id: 2, label: 'Sauce · 5 min', total: 300, remaining: 145, running: false },
              { id: 3, label: 'Œufs · 8 min', total: 480, remaining: 0, running: false },
            ]}
            onToggle={() => {}}
            onRemove={() => {}}
          />
        </Demo>
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
      name: 'RecentsPanel',
      file: 'components/RecentsPanel.tsx',
      kw: 'récents undo historique session log annuler',
      render: () => (
        <Demo label="session log (#38) — what just happened, with a late undo">
          <RecentsPanel />
        </Demo>
      ),
    },
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
      name: 'EmptyFridgeSheet',
      file: 'components/kitchen/EmptyFridgeSheet.tsx',
      kw: 'vide-frigo empty fridge anti-gaspillage use up spoil recette idées ai pré-filtre pick souper restes use-soon réserve',
      render: () => (
        <Demo label="« Vide-frigo » (#5) — AI ideas from what's about to spoil → pick a few → full recipes (needs the live API)">
          <FridgeSheetDemo />
        </Demo>
      ),
    },
    {
      cat: 'Overlays & chrome',
      name: 'DrawEditChoice',
      file: 'components/DrawEditChoice.tsx',
      kw: 'drawing dessin calquer copie modifier choice filigrane',
      render: () => (
        <Demo label="how to continue a kept drawing (modify / copy / trace)">
          <div>
            <button className="btn" onClick={() => setDrawChoiceOpen(true)}>
              Ouvrir le choix
            </button>
            {drawChoiceMode && <span className="mono" style={{ marginLeft: '0.6rem' }}>→ {drawChoiceMode}</span>}
            <DrawEditChoice
              open={drawChoiceOpen}
              onCancel={() => setDrawChoiceOpen(false)}
              onPick={(m) => {
                setDrawChoiceMode(m)
                setDrawChoiceOpen(false)
              }}
            />
          </div>
        </Demo>
      ),
    },
    {
      cat: 'Overlays & chrome',
      name: 'RecipeReadReview',
      file: 'components/RecipeReadReview.tsx',
      kw: 'recipe photo ocr verify review confirm fraction measure source card lecture vérifier',
      render: () => (
        <Demo label="verify a photo-read recipe against the source card (flags measures + shaky words)">
          <div>
            <button className="btn" onClick={() => setReadReviewOpen(true)}>
              Ouvrir la vérification
            </button>
            {readReviewOpen && (
              <RecipeReadReview
                photoUrl={SAMPLE_RECIPE_PHOTO}
                draft={{
                  title: 'Biscuits à l’avoine',
                  ingredients: ['3/4 tasse de farine', '1 c. à thé de cannelle', '2 œufs'],
                  steps: ['Préchauffer le four à 180 °C.', 'Mélanger le tout et cuire 12 minutes.'],
                  servings: 24,
                  servingsUnit: 'biscuits',
                  times: { prep: 15, cook: 12, total: null },
                }}
                lowConfidenceWords={['cannelle']}
                onConfirm={() => setReadReviewOpen(false)}
                onCancel={() => setReadReviewOpen(false)}
              />
            )}
          </div>
        </Demo>
      ),
    },
    {
      cat: 'Overlays & chrome',
      name: 'Sheet',
      file: 'components/Sheet.tsx',
      kw: 'sheet bottom drawer swipe grab tiroir',
      render: () => (
        <Demo label="bottom sheet (scrim / swipe-down / ✕)">
          <div>
            <button className="btn" onClick={() => setSheetOpen(true)}>
              Ouvrir la feuille
            </button>
            <Sheet open={sheetOpen} onClose={() => setSheetOpen(false)} ariaLabel="Démo de feuille">
              <h3>Une feuille partagée</h3>
              <p>Glisse la poignée vers le bas, tape le fond, Esc ou le ✕ ferment. Scroll-lock + focus-trap + swipe via useModal/useSwipeToDismiss.</p>
              <button className="btn btn--primary" onClick={() => setSheetOpen(false)}>
                Compris
              </button>
            </Sheet>
          </div>
        </Demo>
      ),
    },
    {
      cat: 'Overlays & chrome',
      name: 'RecipeListPicker',
      file: 'components/RecipeListPicker.tsx',
      kw: 'recipe ingredients grocery list shop add modal liste ingrédients épicerie',
      render: () => {
        const recipe: Recipe = {
          id: 'demo',
          title: 'Spaghetti bolognaise',
          ingredients: ['500 g de bœuf haché', '1 oignon', '2 gousses d’ail', '800 ml de tomates', 'Spaghettis', 'Parmesan'],
          steps: [],
          servings: null,
          notes: null,
          source: null,
          image: null,
          tags: [],
          updatedAt: 0,
        }
        return (
          <Demo label="pick which ingredients to add to the list (not all)">
            <div>
              <button className="btn" onClick={() => setListPickOpen(true)}>
                Ajouter à la liste
              </button>
              {listPickOpen && <RecipeListPicker recipe={recipe} onClose={() => setListPickOpen(false)} />}
            </div>
          </Demo>
        )
      },
    },
    {
      cat: 'Overlays & chrome',
      name: 'OperatorSection',
      file: 'components/operator/OperatorSection.tsx',
      kw: 'réglages section panneau surface operator',
      render: () => (
        <Demo label="Réglages panel shell">
          <OperatorSection title="Magasinage" hint="Le code postal, utilisé par les rabais." action={<button className="btn btn--sm" aria-label="Ajouter"><Icon name="plus-bold" size={16} /></button>}>
            <p className="mono" style={{ color: 'var(--ink-faint)' }}>…contenu du panneau…</p>
          </OperatorSection>
        </Demo>
      ),
    },
    {
      cat: 'Overlays & chrome',
      name: 'HouseholdListSection',
      file: 'components/operator/HouseholdListSection.tsx',
      kw: 'household list setting cars reserve réglages colored items add rename recolor undo l auto réserve',
      // The shared Réglages section for a "household list setting" (a coloured list of
      // {id,name,colour} in one households.* JSON column). « L'auto » + « Réserve » are
      // thin wrappers over it. Stub `field` (won't match a real column → seed fallback).
      render: () => (
        <Demo label="a coloured household list setting (cars / reserve share this)">
          <HouseholdListSection
            field="devkitList"
            seed={() => [
              { id: 'a', name: 'Garde-manger', color: PALETTE[0] },
              { id: 'b', name: 'Congélateur', color: PALETTE[2] },
            ]}
            labels={{ title: 'Liste (démo)', name: 'Nom', add: 'Ajouter un emplacement…', empty: 'Vide' }}
          />
        </Demo>
      ),
    },
    {
      cat: 'Affichage',
      name: 'PhotoMosaic',
      file: 'components/PhotoMosaic.tsx',
      kw: 'screensaver mosaïque photos dessins veille ambient mur souvenirs',
      render: () => (
        <Demo label="Mosaïque de veille — photos de famille + dessins gardés, une tuile se fond ~toutes les 4,5 s. Vide si aucune photo/dessin (ou R2 off).">
          <div style={{ position: 'relative', height: '60vh' }}>
            <PhotoMosaic />
          </div>
        </Demo>
      ),
    },
    {
      cat: 'Affichage',
      name: 'HeartButton',
      file: 'components/HeartButton.tsx',
      kw: 'favoris coeur cœur aimer recette loves visages',
      render: () => (
        <Demo label="« Favoris » ❤ d'une recette (#21) — montre QUELS visages l'aiment (jamais un compte). Le bouton n'apparaît qu'avec un visage choisi ; en « Maisonnée » c'est en lecture seule. (Démo : id factice.)">
          <HeartButton recipeId="devkit-demo-recipe" />
        </Demo>
      ),
    },
    {
      cat: 'Saisie',
      name: 'CardDeckEditor',
      file: 'components/CardDeckEditor.tsx',
      kw: 'routine deck cartes images emoji minuterie voix photo glisser',
      render: () => (
        <Demo label="Éditeur du jeu de cartes-images d'une routine — emoji + mot par carte, glisser le grip ⠿ / ↑↓ pour réordonner, ⏱ minuterie, 🎙️ clip de voix (#17 A), 📷 photo (#17 C).">
          <CardDeckEditor
            cards={deck}
            onChange={setDeck}
            narration={deckClips}
            onNarrationChange={setDeckClips}
            photo={deckPhotos}
            onPhotoChange={setDeckPhotos}
          />
        </Demo>
      ),
    },
    {
      cat: 'Overlays & chrome',
      name: 'SharePreviewBar',
      file: 'components/SharePreviewBar.tsx',
      kw: 'partage aperçu preview bannière opérateur handoff',
      render: () => (
        <Demo label="Bannière d'aperçu d'une scène partagée (vue opérateur) — le seul retour vers Réglages (un vrai invité ne la voit pas). « Fermer l'aperçu » quitte la galerie.">
          <SharePreviewBar />
        </Demo>
      ),
    },
    {
      cat: 'Overlays & chrome',
      name: 'HelpBubble',
      file: 'components/HelpBubble.tsx',
      kw: 'aide bulle help mode guide contextuel',
      render: () => (
        <Demo label="Petite bulle d'aide en place — titre + une ligne calme + lien « Voir le guide » (le ✕ la ferme ; le bouton la ramène).">
          <HelpBubbleDemo />
        </Demo>
      ),
    },
    {
      cat: 'Overlays & chrome',
      name: 'OfflineBanner',
      file: 'components/OfflineBanner.tsx',
      kw: 'hors ligne offline réseau outbox cache',
      render: () => (
        <Demo label="Barre « Hors ligne » — visible UNIQUEMENT quand l'appareil est vraiment hors ligne (DevTools ▸ Network ▸ Offline). Porte l'estampille « Données du… » + le nombre d'écritures en attente.">
          <OfflineBanner />
        </Demo>
      ),
    },
    {
      cat: 'Overlays & chrome',
      name: 'ErrorBoundary',
      file: 'components/ErrorBoundary.tsx',
      kw: 'erreur boundary filet sécurité plantage fallback récupérable',
      render: () => (
        <Demo label="Filet de sécurité de l'app — un throw de rendu devient un écran calme et récupérable. Touche pour déclencher un throw contenu, puis « Réinitialiser » (pas les boutons du fallback, qui rechargent toute la galerie).">
          <BoundaryDemo />
        </Demo>
      ),
    },
  ]

  // Filter inline, NOT via useMemo. `entries` is rebuilt every render and each
  // entry's `render` closure captures the current interactive-specimen state
  // (readReviewOpen, sheetOpen, the detail-sheet open flag, …). Memoizing `shown`
  // on a hand-kept dep list silently froze those closures whenever the dep list
  // missed a flag — clicking "open" on such a specimen did nothing. Filtering ≤~60
  // entries by substring is microseconds, so just recompute every render and the
  // closures always reflect live state.
  const q = query.trim().toLowerCase()
  const shown = !q
    ? entries
    : entries.filter((e) => (e.name + ' ' + e.file + ' ' + e.cat + ' ' + (e.kw ?? '')).toLowerCase().includes(q))

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
