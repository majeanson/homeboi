import { DealsBrowser } from '../components/DealsBrowser'
import { useSceneClose } from '../lib/sceneNav'

// /liste/circulaires — the flyer/deals browser as a full-screen route (was a
// bottom sheet stacked over the list). DealsBrowser owns all its own state and
// queries; this wrapper only hands it a route-aware close.
export function CirculairesPage() {
  const close = useSceneClose('/liste')
  return <DealsBrowser onClose={close} />
}
