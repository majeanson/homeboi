import { describe, it, expect } from 'vitest'
import { toFace, facesFromMembers, facesFromCercleMembers } from './faces'

// The seam these adapters exist to make explicit (REVIEW-PASS « dir »): three member
// shapes feed ONE face control, and the mapping used to be hand-written at nine call
// sites — character-identical apart from which naming convention it read. Nothing was
// broken, but a field rename on either side would have compiled fine and silently
// blanked the faces on every surface using the OTHER shape.
//
// So the cases below are mostly about the two conventions producing the SAME face
// from the same person, which is the property no call site could state on its own.

const RAW = { id: 'm1', display_name: 'Léa', colour: '#88a36f', avatar_kind: 'photo', avatar_ref: 'av_lea.png' }
const CERCLE = { id: 'm1', displayName: 'Léa', colour: '#88a36f', avatarKind: 'photo', avatarRef: 'av_lea.png' }

describe('member → face', () => {
  it('the snake_case and camelCase shapes yield the same face', () => {
    expect(facesFromMembers([RAW])).toEqual(facesFromCercleMembers([CERCLE]))
  })

  it('resolves a photo avatar to its image URL', () => {
    expect(toFace(RAW).photoUrl).toBe('/api/img/av_lea.png')
  })

  it('a NON-photo avatar_kind yields no photo, even with a ref present', () => {
    // The kind test is load-bearing: a member can carry an avatar_ref for a
    // non-photo kind, and rendering that as an <img> is a broken tile, not a face.
    expect(toFace({ ...RAW, avatar_kind: 'initial' }).photoUrl).toBeNull()
    expect(facesFromCercleMembers([{ ...CERCLE, avatarKind: 'emoji' }])[0].photoUrl).toBeNull()
  })

  it('a member with no avatar at all falls back to the coloured initial', () => {
    const face = toFace({ id: 'm2', display_name: 'Bo', colour: '#c2563a' })
    expect(face.photoUrl).toBeNull()
    expect(face.colour).toBe('#c2563a')
  })

  it('a missing colour is null, never undefined — the disc needs a definite fallback', () => {
    expect(toFace({ id: 'm3', display_name: 'Cy' }).colour).toBeNull()
    expect(facesFromCercleMembers([{ id: 'm3', displayName: 'Cy' }])[0].colour).toBeNull()
  })

  it('maps a whole roster in order', () => {
    const faces = facesFromMembers([RAW, { id: 'm2', display_name: 'Bo', colour: null }])
    expect(faces.map((f) => f.name)).toEqual(['Léa', 'Bo'])
  })
})
