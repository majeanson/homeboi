import { Link } from 'react-router-dom'
import { useT } from '../../i18n'
import { useOperatorT } from '../../i18n.operator'
import { type HelpMode } from '../../lib/helpMode'
import { InlineIcon } from '../Icon'
import { OperatorSection } from './OperatorSection'
import { SampleDataControls } from './sampleData'

// Réglages ▸ Système ▸ « Avancé » (review #18, 2026-11-17): the tools for whoever builds
// or debugs the app, gathered off the pages a parent opens. Two of its cards had no card
// of their own before: the component kit was a « (dev) » link at the foot of « Affichage »,
// and the sample-data switch sat on Découvrir next to « Déconnexion ».

/** The live component catalogue (/dev/kit), one link. */
export function DevKitSection({ help }: { help?: HelpMode }) {
  const o18n = useOperatorT()
  return (
    <OperatorSection title={o18n.devKitTitle} help={help} helpKey="devKit">
      <p className="operator__hint mono">
        <Link to="/dev/kit" className="devkit__link">
          <InlineIcon name="gear-six-bold" size={14} /> {o18n.devKitLink}
        </Link>
      </p>
    </OperatorSection>
  )
}

/** Load, reset or clear the demo family (only `is_sample` rows, never the household's own). */
export function SampleDataSection({ help }: { help?: HelpMode }) {
  const t = useT()
  return (
    <OperatorSection title={t.sample.manageTitle} help={help} helpKey="sample">
      <SampleDataControls />
    </OperatorSection>
  )
}
