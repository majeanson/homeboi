import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useT } from '../../i18n'
import { type HelpMode } from '../../lib/helpMode'
import { OperatorSection } from './OperatorSection'
import { IntakeReview } from './IntakeReview'
import { api } from '../../lib/api'
import { isGuest, type GuestKind } from '../../lib/device'
import { CERCLE_KEY } from '../../lib/queryKeys'
import {
  unifyCircle,
  type Contact,
  type ContactLink,
  type ContactGroupRaw,
  type Member,
  type Person,
} from '../../lib/cercle'
import { encodeIntakeScope, type IntakeScope } from '../../lib/intake'
import { InlineIcon } from '../Icon'
import { StatusMessage } from '../StatusMessage'
import { QrCode } from '../QrCode'
import { Chip } from '../Chip'
import { SubTabs } from '../SubTabs'
import { castSenderPossible, castToSalon } from '../../lib/cast'
import { EntityCombobox, type ComboOption } from '../EntityCombobox'

// Typed read-only share links. The operator picks a KIND (what the link can see)
// and a duration, and gets a time-boxed token (?guest=<token>). The link lands on
// the right surface per kind — main.tsx stashes the token and strips it from the
// URL. The token is stateless: it just stops working at its TTL, no revoke-before
// (keep durations short) — see functions/_lib/auth.ts GuestKind + guest/start.ts.
//
//   showcase → the full read-only hub (a "Démo" link of your real data)
//   sitter   → /handoff, the babysitter card (today + routines + à-savoir + wifi)
//   welcome  → /welcome, the visitor card (wifi + bin day + house rules)
//   family   → /family, the grandparents' window (kids' dates + birthdays + photos)
//   intake   → /intake, the family-info FORM a relative fills + sends back (the one
//              writable kind; the submission is quarantined for the operator to merge)
type KindLabelKey = 'kindShowcase' | 'kindSitter' | 'kindWelcome' | 'kindFamily' | 'kindIntake'
type KindHintKey = 'kindShowcaseHint' | 'kindSitterHint' | 'kindWelcomeHint' | 'kindFamilyHint' | 'kindIntakeHint'
const KINDS: { kind: GuestKind; path: string; labelKey: KindLabelKey; hintKey: KindHintKey }[] = [
  { kind: 'showcase', path: '/board', labelKey: 'kindShowcase', hintKey: 'kindShowcaseHint' },
  { kind: 'sitter', path: '/handoff', labelKey: 'kindSitter', hintKey: 'kindSitterHint' },
  { kind: 'welcome', path: '/welcome', labelKey: 'kindWelcome', hintKey: 'kindWelcomeHint' },
  { kind: 'family', path: '/family', labelKey: 'kindFamily', hintKey: 'kindFamilyHint' },
  { kind: 'intake', path: '/intake', labelKey: 'kindIntake', hintKey: 'kindIntakeHint' },
]

// Per-kind duration menu (mirrors the server clamp in _lib/shareModes). showcase can
// run up to a week (a Démo link to paste somewhere); the curated kinds stay short.
type TtlKey = 'ttl30m' | 'ttl1h' | 'ttl4h' | 'ttl12h' | 'ttl24h' | 'ttl2d' | 'ttl7d'
const H = 3600
const TTL_BY_KIND: Record<GuestKind, { seconds: number; key: TtlKey }[]> = {
  showcase: [
    { seconds: H, key: 'ttl1h' },
    { seconds: 4 * H, key: 'ttl4h' },
    { seconds: 24 * H, key: 'ttl24h' },
    { seconds: 48 * H, key: 'ttl2d' },
    { seconds: 7 * 24 * H, key: 'ttl7d' },
  ],
  sitter: [
    { seconds: 1800, key: 'ttl30m' },
    { seconds: 4 * H, key: 'ttl4h' },
    { seconds: 12 * H, key: 'ttl12h' },
    { seconds: 24 * H, key: 'ttl24h' },
  ],
  welcome: [
    { seconds: H, key: 'ttl1h' },
    { seconds: 4 * H, key: 'ttl4h' },
    { seconds: 12 * H, key: 'ttl12h' },
    { seconds: 24 * H, key: 'ttl24h' },
  ],
  family: [
    { seconds: 24 * H, key: 'ttl24h' },
    { seconds: 48 * H, key: 'ttl2d' },
    { seconds: 7 * 24 * H, key: 'ttl7d' },
  ],
  // A relative needs a few days to get to the form — same window as the family one.
  intake: [
    { seconds: 24 * H, key: 'ttl24h' },
    { seconds: 48 * H, key: 'ttl2d' },
    { seconds: 7 * 24 * H, key: 'ttl7d' },
  ],
}
const DEFAULT_TTL: Record<GuestKind, number> = {
  showcase: 24 * H,
  sitter: 12 * H,
  welcome: 4 * H,
  family: 7 * 24 * H,
  intake: 7 * 24 * H,
}

export function GuestSection({ help }: { help?: HelpMode }) {
  const t = useT()
  const navigate = useNavigate()
  // Issuing a share link is operator-only — a read-only guest can't mint more, so
  // the whole section is hidden for them.
  const ro = isGuest()
  // The two ways to share, as sub-tabs ("one job at a time"): a link for someone's
  // PHONE (the typed read-only kinds), or a face cast to the living-room TV.
  const [subTab, setSubTab] = useState<'phone' | 'salon'>('phone')
  const [kind, setKind] = useState<GuestKind>('showcase')
  const [ttl, setTtl] = useState(DEFAULT_TTL.showcase)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [link, setLink] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  // For an 'intake' link: the person it's pre-addressed to (null = an open link
  // anyone can fill). Bound into the signed token by the server.
  const [targetKey, setTargetKey] = useState<string | null>(null)
  const [targetText, setTargetText] = useState('')
  // For an 'intake' link: which optional sections the form asks for (name is always
  // required). All on by default — the operator unchecks what they don't want.
  const [scope, setScope] = useState<IntakeScope>({
    bday: true,
    contact: true,
    addr: true,
    household: true,
    pets: true,
    photo: true,
  })

  // People to choose a per-person intake link's recipient from — loaded only when
  // the intake kind is picked. unifyCircle gives one node per person (member +
  // hard-linked contact merged), and its .key is exactly the token's targetKey.
  const { data: cercleData } = useQuery({
    queryKey: CERCLE_KEY,
    queryFn: () =>
      api<{ contacts: Contact[]; members: Member[]; links: ContactLink[]; groups?: ContactGroupRaw[] }>('cercle'),
    enabled: kind === 'intake',
  })
  const people = useMemo<Person[]>(
    () =>
      cercleData
        ? unifyCircle(cercleData.contacts, cercleData.members, cercleData.links, cercleData.groups ?? []).people
        : [],
    [cercleData],
  )

  function chooseKind(k: GuestKind) {
    setKind(k)
    setTtl(DEFAULT_TTL[k]) // reset the duration to the kind's sensible default
    setLink(null) // a link minted for the old kind no longer matches the picker
    setTargetKey(null) // the recipient picker only applies to intake
    setTargetText('')
  }

  async function generate() {
    if (busy) return
    setBusy(true)
    setErr(null)
    setCopied(false)
    try {
      const res = await api<{ guestToken: string }>('guest/start', {
        method: 'POST',
        body: {
          ttlSeconds: ttl,
          kind,
          ...(kind === 'intake'
            ? { ...(targetKey ? { targetKey } : {}), fields: encodeIntakeScope(scope) }
            : {}),
        },
      })
      const path = KINDS.find((k) => k.kind === kind)?.path ?? '/board'
      setLink(`${window.location.origin}${path}?guest=${encodeURIComponent(res.guestToken)}`)
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function copy() {
    if (!link) return
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
    } catch {
      /* clipboard blocked — the link is shown for manual copy */
    }
  }

  async function share() {
    if (!link || !navigator.share) return
    try {
      await navigator.share({ title: t.guest.title, url: link })
    } catch {
      /* user dismissed the share sheet — nothing to do */
    }
  }

  if (ro) return null

  const ttlOptions = TTL_BY_KIND[kind]

  return (
    <>
      <SubTabs
        options={[
          { key: 'phone', label: t.guest.onPhone },
          { key: 'salon', label: t.guest.toTv },
        ]}
        value={subTab}
        onSelect={setSubTab}
        ariaLabel={t.guest.title}
      />

      {subTab === 'salon' && <CastTvSection help={help} />}

      {subTab === 'phone' && (
        <>
      <OperatorSection title={t.guest.title} help={help} helpKey="guest">
        <label className="operator__seg">
          <span className="operator__seg-label mono">{t.guest.kindLabel}</span>
          <select className="input" value={kind} onChange={(e) => chooseKind(e.target.value as GuestKind)} disabled={busy}>
            {KINDS.map((k) => (
              <option key={k.kind} value={k.kind}>
                {t.guest[k.labelKey]}
              </option>
            ))}
          </select>
        </label>
        <p className="operator__hint mono">{t.guest[KINDS.find((k) => k.kind === kind)!.hintKey]}</p>

        {/* Per-person intake: pick WHO the form is for, or leave blank for an open
            "add yourself" link the whole family can use. */}
        {kind === 'intake' && (
          <div className="operator__seg">
            <span className="operator__seg-label mono">{t.guest.intakeForLabel}</span>
            <EntityCombobox<Person>
              value={targetText}
              onChange={(v) => {
                setTargetText(v)
                if (!v.trim()) setTargetKey(null)
                setLink(null)
              }}
              options={people.map((p): ComboOption<Person> => ({ id: p.key, label: p.name, data: p, icon: 'user-bold' }))}
              onPick={(opt) => {
                setTargetKey(opt.id)
                setTargetText(opt.label)
                setLink(null)
              }}
              placeholder={t.guest.intakeOpenPlaceholder}
              submitIcon={null}
              typeaheadOnly
            />
            <p className="operator__hint mono">
              {targetKey ? t.guest.intakeForPerson(targetText) : t.guest.intakeOpenHint}
            </p>
          </div>
        )}

        {/* Which optional sections the form asks for. Name is always required; the
            operator unchecks anything they'd rather not request. */}
        {kind === 'intake' && (
          <div className="operator__seg">
            <span className="operator__seg-label mono">{t.guest.intakeAsk}</span>
            <div className="cf__gender-chips">
              <Chip selected={scope.bday} onClick={() => setScope((s) => ({ ...s, bday: !s.bday }))}>
                {t.guest.intakeFieldBday}
              </Chip>
              <Chip selected={scope.contact} onClick={() => setScope((s) => ({ ...s, contact: !s.contact }))}>
                {t.guest.intakeFieldContact}
              </Chip>
              <Chip selected={scope.addr} onClick={() => setScope((s) => ({ ...s, addr: !s.addr }))}>
                {t.guest.intakeFieldAddr}
              </Chip>
              <Chip selected={scope.household} onClick={() => setScope((s) => ({ ...s, household: !s.household }))}>
                {t.guest.intakeFieldHousehold}
              </Chip>
              <Chip selected={scope.pets} onClick={() => setScope((s) => ({ ...s, pets: !s.pets }))}>
                {t.guest.intakeFieldPets}
              </Chip>
              <Chip selected={scope.photo} onClick={() => setScope((s) => ({ ...s, photo: !s.photo }))}>
                {t.guest.intakeFieldPhoto}
              </Chip>
            </div>
          </div>
        )}

        <label className="operator__seg">
          <span className="operator__seg-label mono">{t.guest.ttlLabel}</span>
          <select className="input" value={ttl} onChange={(e) => setTtl(Number(e.target.value))} disabled={busy}>
            {ttlOptions.map((o) => (
              <option key={o.seconds} value={o.seconds}>
                {t.guest[o.key]}
              </option>
            ))}
          </select>
        </label>

        <div className="operator__inline-form">
          <button type="button" className="btn btn--primary" onClick={generate} disabled={busy}>
            <InlineIcon name="key-bold" /> {busy ? t.guest.generating : t.guest.generate}
          </button>
          {/* Aperçu: see exactly what this kind shows before sharing. Curated kinds
              open their scene with ?preview=<kind> (the server returns the curated
              payload for an operator); showcase IS the real hub, so open /board. */}
          <button
            type="button"
            className="btn"
            onClick={() => {
              const k = KINDS.find((x) => x.kind === kind)!
              navigate(kind === 'showcase' ? '/board' : `${k.path}?preview=${kind}`)
            }}
            disabled={busy}
          >
            <InlineIcon name="magnifying-glass-bold" /> {t.shareMode.preview}
          </button>
        </div>

        {err && <StatusMessage tone="error">{err}</StatusMessage>}

        {link && (
          <div className="operator__guest-link">
            <p className="operator__hint mono">{t.guest.linkReady}</p>
            <input className="input mono" readOnly value={link} onFocus={(e) => e.target.select()} aria-label={t.guest.title} />
            <div className="operator__inline-form">
              <button type="button" className="btn" onClick={copy}>
                <InlineIcon name="link-bold" /> {copied ? t.guest.copied : t.guest.copy}
              </button>
              {typeof navigator !== 'undefined' && 'share' in navigator && (
                <button type="button" className="btn" onClick={share}>
                  <InlineIcon name="arrow-right-bold" /> {t.guest.share}
                </button>
              )}
            </div>
            {/* A QR by the door (#35): scan the link off the wall tablet, or print
                it to tape on the fridge. White tile so it scans on any theme. */}
            <QrCode value={link} />
          </div>
        )}
      </OperatorSection>

      {/* Family-info forms relatives sent back (the 'intake' kind). Hidden until one
          arrives, so it never adds noise. */}
      <IntakeReview help={help} />

      <ShareInfoEditor help={help} />
        </>
      )}
    </>
  )
}

// The few free-text facts a "Babysitter" / "Welcome" link surfaces (migration 0072):
// wifi, house rules, bin day. Stored on the household; read by /api/guest/window.
interface ShareFields {
  wifiSsid: string
  wifiPassword: string
  houseRules: string
  binDay: string
}
const EMPTY: ShareFields = { wifiSsid: '', wifiPassword: '', houseRules: '', binDay: '' }

function ShareInfoEditor({ help }: { help?: HelpMode }) {
  const t = useT()
  const [fields, setFields] = useState<ShareFields>(EMPTY)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    let alive = true
    api<Partial<Record<keyof ShareFields, string | null>>>('household')
      .then((h) => {
        if (!alive) return
        setFields({
          wifiSsid: h.wifiSsid ?? '',
          wifiPassword: h.wifiPassword ?? '',
          houseRules: h.houseRules ?? '',
          binDay: h.binDay ?? '',
        })
      })
      .catch(() => {
        /* offline — leave blank; saving still works once back online */
      })
    return () => {
      alive = false
    }
  }, [])

  const set = (k: keyof ShareFields) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFields((f) => ({ ...f, [k]: e.target.value }))
    setSaved(false)
  }

  async function save() {
    if (saving) return
    setSaving(true)
    try {
      await api('household', { method: 'PATCH', body: fields })
      setSaved(true)
    } catch {
      /* surfaced nowhere fancy — the operator can retry */
    } finally {
      setSaving(false)
    }
  }

  return (
    <OperatorSection title={t.shareMode.editorTitle} help={help} helpKey="guest">
      <p className="operator__hint mono">{t.shareMode.editorHint}</p>
      <label className="operator__seg">
        <span className="operator__seg-label mono">{t.shareMode.wifiNetwork}</span>
        <input className="input" value={fields.wifiSsid} onChange={set('wifiSsid')} autoComplete="off" />
      </label>
      <label className="operator__seg">
        <span className="operator__seg-label mono">{t.shareMode.wifiPassword}</span>
        <input className="input mono" value={fields.wifiPassword} onChange={set('wifiPassword')} autoComplete="off" />
      </label>
      <label className="operator__seg">
        <span className="operator__seg-label mono">{t.shareMode.binDay}</span>
        <input className="input" value={fields.binDay} onChange={set('binDay')} autoComplete="off" />
      </label>
      <label className="operator__seg">
        <span className="operator__seg-label mono">{t.shareMode.houseRules}</span>
        <textarea className="input" value={fields.houseRules} onChange={set('houseRules')} rows={3} />
      </label>
      <button type="button" className="btn" onClick={save} disabled={saving}>
        <InlineIcon name="check-bold" /> {saved ? t.shareMode.saved : t.shareMode.save}
      </button>
    </OperatorSection>
  )
}

// « Diffuser au salon » — set up a permanent read-only TV face for the living room.
// Three scenes share one flow (pick the face, mint a read-only token, then either
// cast from Chrome — the bonus one-tap, only on a Chromium device — or, the path that
// works for EVERYONE since iOS can't START a cast, open the link/QR once in any TV
// browser so it holds the screen as a permanent second display):
//   board   → the full board                       (showcase token, /cast)
//   ambient → the screensaver: clock + photo frame (showcase token, /cast?scene=ambient)
//   welcome → the visitor window: wifi + consignes (welcome token,  /welcome)
// It reuses the showcase kind for board/ambient on purpose: the full board reads
// board+meals+recipes+household on mount, so a narrower scope would 403 its own deps.
type CastScene = 'board' | 'ambient' | 'welcome'
const CAST_SCENES: Record<CastScene, { kind: GuestKind; link: (origin: string, token: string) => string }> = {
  board: { kind: 'showcase', link: (o, tk) => `${o}/cast?guest=${encodeURIComponent(tk)}` },
  ambient: { kind: 'showcase', link: (o, tk) => `${o}/cast?scene=ambient&guest=${encodeURIComponent(tk)}` },
  welcome: { kind: 'welcome', link: (o, tk) => `${o}/welcome?guest=${encodeURIComponent(tk)}` },
}

function CastTvSection({ help }: { help?: HelpMode }) {
  const t = useT()
  // Minting a link is operator-only — a read-only guest can't hand out access.
  const ro = isGuest()
  const [scene, setScene] = useState<CastScene>('board')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  // The raw token (the sender needs it) — the shareable link is derived from it.
  const [token, setToken] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [casting, setCasting] = useState(false)
  // Show the one-tap cast button only where the Web Sender can actually run (Chrome
  // desktop/Android, with an App ID configured) — never on iOS.
  const canCast = castSenderPossible()
  if (ro) return null
  const cfg = CAST_SCENES[scene]
  const link = token ? cfg.link(window.location.origin, token) : null

  // Mint a fresh read-only TV token (the scene's kind, 7-day clamp) and remember it.
  async function mint(): Promise<string> {
    const res = await api<{ guestToken: string }>('guest/start', {
      method: 'POST',
      body: { kind: cfg.kind, ttlSeconds: 7 * 24 * 3600 },
    })
    setToken(res.guestToken)
    return res.guestToken
  }

  function chooseScene(s: CastScene) {
    setScene(s)
    setToken(null) // a token minted for the old scene's link no longer matches it
    setCopied(false)
    setErr(null)
  }

  async function generate() {
    if (busy) return
    setBusy(true)
    setErr(null)
    setCopied(false)
    try {
      await mint()
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  // One-tap cast (Chrome only): ensure a token, then open the device picker + launch
  // the receiver, handing it the token + chosen scene. Any failure (cancelled picker,
  // non-Chrome) falls back to the link/QR below.
  async function castNow() {
    if (casting) return
    setCasting(true)
    setErr(null)
    try {
      const tok = token ?? (await mint())
      await castToSalon(tok, scene)
    } catch {
      setErr(t.operator.castFailed)
    } finally {
      setCasting(false)
    }
  }

  async function copy() {
    if (!link) return
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
    } catch {
      /* clipboard blocked — the link is shown for manual copy */
    }
  }

  return (
    <OperatorSection title={t.operator.castTitle} help={help} helpKey="guest">
      <p className="operator__hint mono">{t.operator.castIntro}</p>
      <label className="operator__seg">
        <span className="operator__seg-label mono">{t.operator.castSceneLabel}</span>
        <select className="input" value={scene} onChange={(e) => chooseScene(e.target.value as CastScene)} disabled={busy}>
          <option value="board">{t.operator.castSceneBoard}</option>
          <option value="ambient">{t.operator.castSceneAmbient}</option>
          <option value="welcome">{t.operator.castSceneWelcome}</option>
        </select>
      </label>
      <p className="operator__hint mono">{t.operator.castSceneHint[scene]}</p>
      <div className="operator__inline-form">
        {canCast && (
          <button type="button" className="btn btn--primary" onClick={castNow} disabled={casting}>
            <InlineIcon name="key-bold" /> {casting ? t.operator.castNowBusy : t.operator.castNow}
          </button>
        )}
        <button type="button" className={`btn${canCast ? '' : ' btn--primary'}`} onClick={generate} disabled={busy}>
          <InlineIcon name="link-bold" /> {busy ? t.guest.generating : t.operator.castGenerate}
        </button>
      </div>
      {canCast && <p className="operator__seg-hint mono">{t.operator.castNowHint}</p>}
      {err && <StatusMessage tone="error">{err}</StatusMessage>}
      {link && (
        <div className="operator__guest-link">
          <p className="operator__hint mono">{t.operator.castReady}</p>
          <input
            className="input mono"
            readOnly
            value={link}
            onFocus={(e) => e.target.select()}
            aria-label={t.operator.castTitle}
          />
          <div className="operator__inline-form">
            <button type="button" className="btn" onClick={copy}>
              <InlineIcon name="link-bold" /> {copied ? t.guest.copied : t.guest.copy}
            </button>
          </div>
          {/* Scan it off the wall tablet to open on the TV/computer, or copy the link. */}
          <QrCode value={link} />
          <ol className="operator__hint mono">
            <li>{t.operator.castStep1}</li>
            <li>{t.operator.castStep2}</li>
            <li>{t.operator.castStep3}</li>
          </ol>
          <p className="operator__seg-hint mono">{t.operator.castCaveat}</p>
        </div>
      )}
    </OperatorSection>
  )
}
