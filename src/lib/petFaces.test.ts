import { describe, it, expect } from 'vitest'
import { petFace } from './petFaces'

// Review #31: an animal is drawn with the face shape a member has, so a rendez-vous « pour
// Jules » shows Jules wherever faces are drawn.
describe('petFace', () => {
  it('a photo is a photo face; no photo is the amber initials tile', () => {
    expect(petFace({ id: 'p', name: 'Jules', colour: null, photoKey: null })).toEqual({
      id: 'p', display_name: 'Jules', is_child: 0, colour: '#C7873F', avatar_kind: 'initial', avatar_ref: '',
    })
    expect(petFace({ id: 'p', name: 'Jules', colour: '#123456', photoKey: 'k' })).toMatchObject({ colour: '#123456', avatar_kind: 'photo', avatar_ref: 'k' })
  })
})
