import { describe, it, expect } from 'vitest'
import { isSurfaced, visibleMots, waitingMots, savedMots, waitingRecipientIds, type Mot } from './mots'

// A minimal Mot factory — only the fields the pure helpers read.
function mot(p: Partial<Mot>): Mot {
  return {
    id: p.id ?? 'm1',
    member_id: p.member_id ?? null,
    author_member_id: p.author_member_id ?? null,
    text: p.text ?? '',
    media_kind: p.media_kind ?? null,
    media_key: p.media_key ?? null,
    scene_key: p.scene_key ?? null,
    created_at: p.created_at ?? 0,
    updated_at: p.updated_at ?? null,
    opened_at: p.opened_at ?? null,
    saved_at: p.saved_at ?? null,
    surface_at: p.surface_at ?? null,
    reply_to: p.reply_to ?? null,
  }
}

describe('mots helpers', () => {
  describe('isSurfaced (scheduled gate)', () => {
    it('an unscheduled mot (surface_at null) is always surfaced', () => {
      expect(isSurfaced(mot({}), 100)).toBe(true)
    })
    it('a scheduled mot is hidden until its time, then surfaces', () => {
      expect(isSurfaced(mot({ surface_at: 200 }), 100)).toBe(false)
      expect(isSurfaced(mot({ surface_at: 200 }), 200)).toBe(true)
      expect(isSurfaced(mot({ surface_at: 200 }), 300)).toBe(true)
    })
  })

  describe('visibleMots (recipient scope)', () => {
    const all = [
      mot({ id: 'mine', member_id: 'A', created_at: 2 }),
      mot({ id: 'house', member_id: null, created_at: 3 }),
      mot({ id: 'theirs', member_id: 'B', created_at: 1 }),
    ]
    it('a picked face sees their own + Maisonnée, newest first', () => {
      expect(visibleMots(all, 'A').map((m) => m.id)).toEqual(['house', 'mine'])
    })
    it('Maisonnée (null face) sees only family-wide mots', () => {
      expect(visibleMots(all, null).map((m) => m.id)).toEqual(['house'])
    })
  })

  describe('waiting / saved split', () => {
    const all = [
      mot({ id: 'wait', member_id: 'A', opened_at: null }),
      mot({ id: 'seen', member_id: 'A', opened_at: 50 }),
      mot({ id: 'kept', member_id: 'A', opened_at: 50, saved_at: 60 }),
    ]
    it('waiting = unopened', () => {
      expect(waitingMots(all, 'A').map((m) => m.id)).toEqual(['wait'])
    })
    it('saved = kept keepsakes', () => {
      expect(savedMots(all, 'A').map((m) => m.id)).toEqual(['kept'])
    })
  })

  describe('waitingRecipientIds (per-face dot)', () => {
    it('returns member ids with an unopened mot, excluding Maisonnée', () => {
      const ids = waitingRecipientIds([
        mot({ member_id: 'A', opened_at: null }),
        mot({ member_id: 'B', opened_at: 99 }), // opened → no dot
        mot({ member_id: null, opened_at: null }), // Maisonnée → excluded (card shows it)
      ])
      expect([...ids]).toEqual(['A'])
    })
  })
})
