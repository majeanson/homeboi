import { useState, type CSSProperties } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Navigate, useParams, useNavigate } from 'react-router-dom'
import { useT, useLang } from '../i18n'
import { api } from '../lib/api'
import { live } from '../lib/query'
import { isGuest } from '../lib/device'
import { useSceneClose, useEscapeKey } from '../lib/sceneNav'
import { useWrite } from '../lib/write'
import { useConfirm } from '../lib/confirm'
import { useDeferredRemoval } from '../lib/useDeferredRemoval'
import { CARNETS_KEY, CARE_LOG_KEY, HOME_PROJECTS_KEY, HOME_PINS_KEY, BOARD_KEY } from '../lib/queryKeys'
import { formatDay } from '../lib/format'
import { formatMoney } from '../lib/money'
import { imgUrl } from '../lib/image'
import { faint } from '../lib/colors'
import { useCarnets, useCareLog, useHomePins, carnetEmoji, replacementDate, warrantyExpiries, PIN_EMOJI, type CareLog, type HomePin } from '../lib/carnets'
import type { HomeProject } from '../components/operator/types'
import { SceneHead } from '../components/SceneHead'
import { Loading } from '../components/Fallback'
import { SubTabs } from '../components/SubTabs'
import { Modal } from '../components/Modal'
import { EmptyState } from '../components/EmptyState'
import { Icon, InlineIcon } from '../components/Icon'
import { RowActions } from '../components/RowActions'
import { CarnetForm } from '../components/cercle/CarnetForm'
import { CarnetDocs } from '../components/cercle/CarnetDocs'
import { CareLogForm } from '../components/cercle/CareLogForm'
import { HomePinForm } from '../components/cercle/HomePinForm'
import { HomeProjectForm } from '../components/forms/HomeProjectForm'

type Seg = 'surveiller' | 'carnet'

// /cercle/carnet/:id — one carnet's full scene. A 2-segment toggle (« À surveiller »
// = what's due + the long jeu; « Le carnet » = the information: identité, ses choses,
// historique, entretien). The hero adapts by kind. Read-only for a guest.
export function CercleCarnetPage() {
  const t = useT()
  const { lang } = useLang()
  const { id } = useParams()
  const nav = useNavigate()
  const close = useSceneClose('/cercle?section=carnets')
  useEscapeKey(close)
  const write = useWrite()
  const confirm = useConfirm()
  const ro = isGuest()
  const c = t.carnets

  const { data } = useCarnets()
  const { data: logData } = useCareLog(id)
  const { data: pinData } = useHomePins(id)
  const { data: hpData } = useQuery({ queryKey: HOME_PROJECTS_KEY, queryFn: () => api<{ projects: HomeProject[] }>('home-projects'), ...live })

  const [seg, setSeg] = useState<Seg | null>(null)
  const [editing, setEditing] = useState(false)
  const [addingChild, setAddingChild] = useState(false)
  const [addingLog, setAddingLog] = useState(false)
  const [editLog, setEditLog] = useState<CareLog | null>(null)
  const [addingCare, setAddingCare] = useState(false)
  const [addingPin, setAddingPin] = useState(false)
  const [editPin, setEditPin] = useState<HomePin | null>(null)
  const logRemoval = useDeferredRemoval([...CARE_LOG_KEY, id])
  const pinRemoval = useDeferredRemoval([...HOME_PINS_KEY, id])

  if (!data) return <Loading />
  const carnet = id ? data.carnets.find((x) => x.id === id) ?? null : null
  if (id && !carnet) return <Navigate to="/cercle?section=carnets" replace />
  if (!carnet) return <Navigate to="/cercle?section=carnets" replace />

  // Ancestor chain (root → this carnet) so a child thing shows where it lives —
  // 🏠 Maison › 🔥 Chauffe-eau — with each ancestor tappable to climb back up.
  const byId = new Map(data.carnets.map((x) => [x.id, x]))
  const crumbs: typeof data.carnets = []
  for (let cur = carnet as (typeof carnet) | undefined; cur; cur = cur.parentId ? byId.get(cur.parentId) : undefined) {
    crumbs.unshift(cur)
    if (crumbs.length > 8) break // guard a malformed cycle
  }

  const children = data.carnets.filter((x) => x.parentId === carnet.id)
  const childIds = new Set(children.map((x) => x.id))
  const soon = (data.soon ?? []).filter((s) => s.carnetId === carnet.id || childIds.has(s.carnetId))
  const entries = logData?.entries ?? []
  const shownEntries = logRemoval.visible(entries)
  const entretien = (hpData?.projects ?? []).filter((p) => p.carnet_id === carnet.id)
  // Warranties ending soon — DERIVED from facts.warrantyUntil (this carnet + its
  // things), a calm heads-up to use/extend before it lapses. No rows. See warrantyExpiries.
  const warranties = warrantyExpiries([carnet, ...children], Math.floor(Date.now() / 1000))
  const shownPins = pinRemoval.visible(pinData?.pins ?? [])
  // « Le long jeu » horizon — the carnet + its children's lifecycles on one timeline,
  // sorted by projected replacement year (the house's "slow life"). Shown only when a
  // child carries a lifecycle (a leaf thing's own life already reads in Identité).
  const lifeThings = [carnet, ...children]
    .filter((x) => x.installedAt && x.lifespanMonths)
    .map((x) => ({ id: x.id, name: x.name, emoji: carnetEmoji(x), year: replacementDate(x.installedAt as number, x.lifespanMonths as number).getFullYear() }))
    .sort((a, b) => a.year - b.year)
  const showHorizon = children.some((x) => x.installedAt && x.lifespanMonths)
  const thisYear = new Date().getFullYear()

  // Intelligent default: open « À surveiller » when the long-jeu has something near,
  // else « Le carnet ». Based ONLY on `soon` (which arrives WITH the carnet) — not the
  // separate home-projects query — so the visible tab can't flip out from under the
  // user when that resolves a beat later.
  const active: Seg = seg ?? (soon.length > 0 ? 'surveiller' : 'carnet')

  const photo = carnet.mediaKey ? imgUrl(carnet.mediaKey) : null
  const lifeDate = carnet.installedAt && carnet.lifespanMonths ? replacementDate(carnet.installedAt, carnet.lifespanMonths) : null
  const warrantyUntil = carnet.facts?.warrantyUntil as number | undefined
  const model = carnet.facts?.model as string | undefined

  function removeLog(e: CareLog) {
    logRemoval.remove([e.id], c.logDeleted, () =>
      write('care-log', { method: 'DELETE', body: { id: e.id }, affectedKeys: [CARE_LOG_KEY, CARNETS_KEY] }),
    )
  }

  function removePin(p: HomePin) {
    pinRemoval.remove([p.id], c.pinDeleted, () =>
      write('home-pins', { method: 'DELETE', body: { id: p.id }, affectedKeys: [HOME_PINS_KEY] }),
    )
  }

  async function removeCarnet() {
    if (!(await confirm({ message: c.deleteConfirm(carnet!.name), confirmLabel: c.delete }))) return
    await write('carnets', { method: 'DELETE', body: { id: carnet!.id }, affectedKeys: [CARNETS_KEY, BOARD_KEY] })
    nav('/cercle?section=carnets')
  }

  return (
    <div className="scene carnet-scene" aria-label={carnet.name}>
      <SceneHead title={carnet.name} icon="book-open-bold" card="cercle" onClose={close} />
      <div className="scene__body">
        {/* Breadcrumb — only when this carnet sits inside another (a thing in a house).
            Emoji + name per level; ancestors tap to climb up, the last is the page. */}
        {crumbs.length > 1 && (
          <nav className="carnet-crumbs mono" aria-label={c.breadcrumb}>
            {crumbs.map((x, i) => {
              const last = i === crumbs.length - 1
              return (
                <span key={x.id} className="carnet-crumbs__seg">
                  {i > 0 && <span className="carnet-crumbs__sep" aria-hidden="true">›</span>}
                  {last ? (
                    <span className="carnet-crumbs__here" aria-current="page">
                      <span aria-hidden="true">{carnetEmoji(x)}</span> {x.name}
                    </span>
                  ) : (
                    <button type="button" className="carnet-crumbs__link" onClick={() => nav(`/cercle/carnet/${x.id}`)}>
                      <span aria-hidden="true">{carnetEmoji(x)}</span> {x.name}
                    </button>
                  )}
                </span>
              )
            })}
          </nav>
        )}

        {/* Hero — the thing's face: photo or its emoji disc, name, kind. */}
        <div className="carnet-hero" style={{ ['--carnet-tint']: carnet.color } as CSSProperties}>
          <span className="carnet-hero__av" style={!photo ? { background: faint(carnet.color) } : undefined}>
            {photo ? <img src={photo} alt="" /> : <span className="carnet-hero__emoji">{carnetEmoji(carnet)}</span>}
          </span>
          <div className="carnet-hero__main">
            <h2>{carnet.name}</h2>
            <p className="mono">{c.kind[carnet.kind]}</p>
          </div>
        </div>

        <SubTabs<Seg>
          options={[
            { key: 'surveiller', label: c.segSurveiller, icon: 'warning-bold' },
            { key: 'carnet', label: c.segCarnet, icon: 'book-open-bold' },
          ]}
          value={active}
          onSelect={setSeg}
          ariaLabel={carnet.name}
        />

        {active === 'surveiller' ? (
          <>
            {soon.length === 0 && warranties.length === 0 && !entretien.some((p) => p.at != null) && shownEntries.length === 0 ? (
              <EmptyState>{c.allGood}</EmptyState>
            ) : (
              <>
                {warranties.length > 0 && (
                  <section className="carnet-block">
                    <div className="sec-label">
                      <span className="sec-label__ico" aria-hidden="true"><Icon name="check-square-bold" size={16} /></span>
                      <b>{c.warranties}</b>
                      <span className="ln" />
                    </div>
                    {warranties.map((w) => (
                      <div key={w.carnetId} className="cercle-row">
                        <span className="cercle-row__main">
                          <span className="cercle-row__name"><span aria-hidden="true">{w.emoji}</span> {w.name}</span>
                          <span className="cercle-row__sub mono">{c.warrantyEndsOn(formatDay(w.at, lang))}</span>
                        </span>
                      </div>
                    ))}
                  </section>
                )}
                {soon.length > 0 && (
                  <section className="carnet-block">
                    <div className="sec-label">
                      <span className="sec-label__ico" aria-hidden="true"><Icon name="hourglass-high-bold" size={16} /></span>
                      <b>{c.longJeu}</b>
                      <span className="ln" />
                    </div>
                    {soon.map((s) => (
                      <div key={s.carnetId} className="cercle-row carnet-soonrow">
                        <span className="cercle-row__main">
                          <span className="cercle-row__name">{s.name}</span>
                          <span className="cercle-row__sub mono">
                            {s.monthsLeft <= 0 ? c.overdue : c.replaceAround(new Date(s.at * 1000).getFullYear())}
                          </span>
                        </span>
                      </div>
                    ))}
                  </section>
                )}
                {entretien.filter((p) => p.at != null).length > 0 && (
                  <section className="carnet-block">
                    <div className="sec-label">
                      <span className="sec-label__ico" aria-hidden="true"><Icon name="repeat-bold" size={16} /></span>
                      <b>{c.entretien}</b>
                      <span className="ln" />
                    </div>
                    {entretien.filter((p) => p.at != null).map((p) => (
                      <div key={p.id} className="cercle-row">
                        <span className="cercle-row__main">
                          <span className="cercle-row__name">{p.title}</span>
                          {p.at != null && <span className="cercle-row__sub mono">{formatDay(p.at, lang)}</span>}
                        </span>
                      </div>
                    ))}
                  </section>
                )}
                {shownEntries.length > 0 && (
                  <section className="carnet-block">
                    <div className="sec-label">
                      <span className="sec-label__ico" aria-hidden="true"><Icon name="clock-bold" size={16} /></span>
                      <b>{c.recent}</b>
                      <span className="ln" />
                    </div>
                    {shownEntries.slice(0, 3).map((e) => (
                      <div key={e.id} className="cercle-row">
                        <span className="cercle-row__main">
                          <span className="cercle-row__name">{e.title}</span>
                          <span className="cercle-row__sub mono">{formatDay(e.at, lang)} · {c.logKinds[e.kind]}</span>
                        </span>
                      </div>
                    ))}
                  </section>
                )}
              </>
            )}
          </>
        ) : (
          <>
            {/* Identité */}
            <section className="carnet-block">
              <div className="sec-label">
                <span className="sec-label__ico" aria-hidden="true"><Icon name="book-open-bold" size={16} /></span>
                <b>{c.identity}</b>
                <span className="ln" />
                {!ro && <RowActions onEdit={() => setEditing(true)} onDelete={() => void removeCarnet()} />}
              </div>
              <dl className="carnet-facts mono">
                {carnet.installedAt && (<><dt>{c.installed}</dt><dd>{formatDay(carnet.installedAt, lang)}</dd></>)}
                {model && (<><dt>{c.model}</dt><dd>{model}</dd></>)}
                {warrantyUntil && (<><dt>{c.warranty}</dt><dd>{formatDay(warrantyUntil, lang)}</dd></>)}
                {lifeDate && (<><dt>{c.longJeu}</dt><dd>{c.replaceAround(lifeDate.getFullYear())}</dd></>)}
              </dl>
              {carnet.notes && <p className="carnet-notes">{carnet.notes}</p>}
              {carnet.kind === 'auto' && (
                <button type="button" className="btn btn--ghost" onClick={() => nav('/voiture')}>
                  <InlineIcon name="car-bold" size={16} /> {c.viewSchedule}
                </button>
              )}
            </section>

            {/* Ses choses (children + rooms) */}
            <section className="carnet-block">
              <div className="sec-label">
                <span className="sec-label__ico" aria-hidden="true"><Icon name="tag-bold" size={16} /></span>
                <b>{c.sesChoses}</b>
                <span className="ln" />
              </div>
              {children.length === 0 ? (
                <EmptyState>{c.noChoses}</EmptyState>
              ) : (
                <div className="carnet-choses">
                  {children.map((ch) => (
                    <button key={ch.id} type="button" className="carnet-chose" onClick={() => nav(`/cercle/carnet/${ch.id}`)}>
                      <span className="carnet-chose__emoji" style={{ background: faint(ch.color) }}>{carnetEmoji(ch)}</span>
                      <span className="carnet-chose__name">{ch.name}</span>
                    </button>
                  ))}
                </div>
              )}
              {!ro && (
                <button type="button" className="btn btn--ghost" onClick={() => setAddingChild(true)}>
                  <InlineIcon name="plus-bold" size={16} /> {c.addChild}
                </button>
              )}
            </section>

            {/* Le long jeu — the house's horizon: its things' lifecycles on one timeline. */}
            {showHorizon && lifeThings.length > 0 && (
              <section className="carnet-block">
                <div className="sec-label">
                  <span className="sec-label__ico" aria-hidden="true"><Icon name="hourglass-high-bold" size={16} /></span>
                  <b>{c.longJeu}</b>
                  <span className="ln" />
                </div>
                <ol className="carnet-horizon">
                  {lifeThings.map((x) => {
                    const out = x.year - thisYear
                    return (
                      <li key={x.id} className={'carnet-horizon__row' + (out <= 0 ? ' is-due' : '')}>
                        <span className="carnet-horizon__thing">
                          <span className="carnet-horizon__emoji" aria-hidden="true">{x.emoji}</span> {x.name}
                        </span>
                        <span className="carnet-horizon__when mono">
                          {out <= 0 ? c.overdue : `≈ ${x.year} · ${c.yearsOut(out)}`}
                        </span>
                      </li>
                    )
                  })}
                </ol>
              </section>
            )}

            {/* Historique (le carnet) */}
            <section className="carnet-block">
              <div className="sec-label">
                <span className="sec-label__ico" aria-hidden="true"><Icon name="receipt-bold" size={16} /></span>
                <b>{c.historique}</b>
                <span className="ln" />
              </div>
              {shownEntries.length === 0 ? (
                <EmptyState>{c.noHistory}</EmptyState>
              ) : (
                shownEntries.map((e) => (
                  <div key={e.id} className="cercle-row carnet-logrow">
                    <span className="cercle-row__main">
                      <span className="cercle-row__name">{e.title}</span>
                      <span className="cercle-row__sub mono">
                        {formatDay(e.at, lang)} · {c.logKinds[e.kind]}
                        {e.costCents != null ? ` · ${formatMoney(e.costCents, lang)}` : ''}
                      </span>
                      {e.note && <span className="carnet-logrow__note">{e.note}</span>}
                      <CarnetDocs keys={e.mediaKeys} />
                    </span>
                    {!ro && <RowActions onEdit={() => setEditLog(e)} onDelete={() => removeLog(e)} />}
                  </div>
                ))
              )}
              {!ro && (
                <button type="button" className="btn btn--ghost" onClick={() => setAddingLog(true)}>
                  <InlineIcon name="plus-bold" size={16} /> {c.addEntry}
                </button>
              )}
            </section>

            {/* Entretien (reuses the Projets & Entretien form, scoped to this carnet) */}
            <section className="carnet-block">
              <div className="sec-label">
                <span className="sec-label__ico" aria-hidden="true"><Icon name="repeat-bold" size={16} /></span>
                <b>{c.entretien}</b>
                <span className="ln" />
              </div>
              {entretien.length === 0 && !addingCare ? (
                <EmptyState>{c.noEntretien}</EmptyState>
              ) : (
                entretien.map((p) => (
                  <div key={p.id} className="cercle-row">
                    <span className="cercle-row__main">
                      <span className="cercle-row__name">{p.title}</span>
                      {p.at != null && <span className="cercle-row__sub mono">{formatDay(p.at, lang)}</span>}
                    </span>
                  </div>
                ))
              )}
              {!ro && (addingCare ? (
                <HomeProjectForm kind="upkeep" carnetId={carnet.id} onSaved={() => setAddingCare(false)} onCancel={() => setAddingCare(false)} />
              ) : (
                <button type="button" className="btn btn--ghost" onClick={() => setAddingCare(true)}>
                  <InlineIcon name="plus-bold" size={16} /> {c.addCare}
                </button>
              ))}
            </section>

            {/* En cas de pépin — the house map (home carnets only). */}
            {carnet.kind === 'home' && (
              <section className="carnet-block">
                <div className="sec-label">
                  <span className="sec-label__ico" aria-hidden="true"><Icon name="key-bold" size={16} /></span>
                  <b>{c.enCasDePepin}</b>
                  <span className="ln" />
                </div>
                {shownPins.length === 0 ? (
                  <EmptyState>{c.noPins}</EmptyState>
                ) : (
                  shownPins.map((p) => (
                    <div key={p.id} className="cercle-row carnet-pinrow">
                      <span className="cercle-row__main">
                        <span className="cercle-row__name">{PIN_EMOJI[p.kind]} {p.label}</span>
                        {p.detail && <span className="cercle-row__sub mono">{p.detail}</span>}
                        <CarnetDocs keys={p.mediaKey ? [p.mediaKey] : []} />
                      </span>
                      {!ro && <RowActions onEdit={() => setEditPin(p)} onDelete={() => removePin(p)} />}
                    </div>
                  ))
                )}
                {!ro && (
                  <button type="button" className="btn btn--ghost" onClick={() => setAddingPin(true)}>
                    <InlineIcon name="plus-bold" size={16} /> {c.addPin}
                  </button>
                )}
              </section>
            )}
          </>
        )}
      </div>

      {/* Edit identity */}
      <Modal open={editing} onClose={() => setEditing(false)} title={c.edit}>
        {editing && <CarnetForm value={carnet} onSaved={() => setEditing(false)} onCancel={() => setEditing(false)} />}
      </Modal>
      {/* Add a child thing / room */}
      <Modal open={addingChild} onClose={() => setAddingChild(false)} title={c.addChild}>
        <CarnetForm parentId={carnet.id} defaultKind={carnet.kind === 'home' ? 'appliance' : 'thing'} onSaved={() => setAddingChild(false)} onCancel={() => setAddingChild(false)} />
      </Modal>
      {/* Add / edit a history entry */}
      <Modal open={addingLog || !!editLog} onClose={() => { setAddingLog(false); setEditLog(null) }} title={editLog ? c.editEntry : c.addEntry}>
        {(addingLog || editLog) && (
          <CareLogForm carnetId={carnet.id} value={editLog} onSaved={() => { setAddingLog(false); setEditLog(null) }} onCancel={() => { setAddingLog(false); setEditLog(null) }} />
        )}
      </Modal>
      {/* Add / edit an « en cas de pépin » map pin */}
      <Modal open={addingPin || !!editPin} onClose={() => { setAddingPin(false); setEditPin(null) }} title={editPin ? c.editPin : c.addPin}>
        {(addingPin || editPin) && (
          <HomePinForm carnetId={carnet.id} value={editPin} onSaved={() => { setAddingPin(false); setEditPin(null) }} onCancel={() => { setAddingPin(false); setEditPin(null) }} />
        )}
      </Modal>
    </div>
  )
}
