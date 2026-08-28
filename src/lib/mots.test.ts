import { describe, it, expect } from 'vitest'
import { isSurfaced, isScheduled, visibleMots, waitingMots, savedMots, sweepableMots, sentMots, waitingRecipientIds, motLabel, type Mot } from './mots'

// A minimal Mot factory — only the fields the pure helpers read.
function mot(p: Partial<Mot>): Mot {
  return {
    id: p.id ?? 'm1',
    member_id: p.member_id ?? null,
    author_member_id: p.author_member_id ?? null,
    text: p.text ?? '',
    transcript: p.transcript ?? null,
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

  describe('isScheduled (sender outbox badge — inverse of surfaced)', () => {
    it('a future surface_at is scheduled; a past one or null is not', () => {
      expect(isScheduled(mot({ surface_at: 200 }), 100)).toBe(true)
      expect(isScheduled(mot({ surface_at: 200 }), 200)).toBe(false) // surfaced now, not scheduled
      expect(isScheduled(mot({ surface_at: 200 }), 300)).toBe(false)
      expect(isScheduled(mot({}), 100)).toBe(false) // unscheduled
    })
  })

  describe('sentMots (sender outbox)', () => {
    const all = [
      mot({ id: 'a', author_member_id: 'A', member_id: 'B', created_at: 1 }),
      mot({ id: 'b', author_member_id: 'A', member_id: null, created_at: 3, surface_at: 999 }), // scheduled, still included
      mot({ id: 'c', author_member_id: 'C', member_id: 'A', created_at: 2 }), // someone else's
      mot({ id: 'd', author_member_id: 'A', member_id: 'B', created_at: 2, opened_at: 5 }), // seen, still included
    ]
    it('returns mots I authored, newest first, incl. scheduled + seen', () => {
      expect(sentMots(all, 'A').map((m) => m.id)).toEqual(['b', 'd', 'a'])
    })
    it('a null author (Maisonnée at rest) has no outbox', () => {
      expect(sentMots(all, null)).toEqual([])
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
    // « Effacer les déjà vus » takes exactly this set. The kept mot's absence is
    // the load-bearing assertion: a « Gardé » badge is someone saying "I want
    // this", and deleting one otherwise asks a confirm — a broom that swept them
    // along with the rest would be the one way this feature destroys something
    // wanted. The unopened mot's absence matters too: it hasn't been read yet.
    it('sweepable = seen but NOT kept — a keepsake is never swept', () => {
      expect(sweepableMots(all, 'A').map((m) => m.id)).toEqual(['seen'])
    })
    it('sweepable respects the face: another member’s mots are not yours to clear', () => {
      const mixed = [...all, mot({ id: 'theirs', member_id: 'B', opened_at: 50 })]
      expect(sweepableMots(mixed, 'A').map((m) => m.id)).toEqual(['seen'])
    })
    it('a Maisonnée face sweeps only family-wide mots', () => {
      const mixed = [...all, mot({ id: 'house', member_id: null, opened_at: 50 })]
      expect(sweepableMots(mixed, null).map((m) => m.id)).toEqual(['house'])
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

// The label chain a row, a peek title and a quoted reply all share (A5).
describe('motLabel', () => {
  const L = { memo: 'Mémo vocal', drawing: 'Dessin', photo: 'Photo', untitled: 'Un mot' }
  it('a written line wins — the transcript never overrides what someone typed', () => {
    expect(motLabel(mot({ text: 'Bonne fête', transcript: 'bon effet' }), L)).toBe('Bonne fête')
  })
  it('a voice mot reads as its words instead of « Mémo vocal »', () => {
    expect(motLabel(mot({ text: '', media_kind: 'audio', transcript: 'Je rentre plus tard' }), L)).toBe(
      'Je rentre plus tard',
    )
  })
  it('falls back to the media label when AI is unset (transcript NULL) — the ordinary local path', () => {
    expect(motLabel(mot({ text: '', media_kind: 'audio', transcript: null }), L)).toBe('Mémo vocal')
  })
  it('a whitespace-only transcript is not a label', () => {
    expect(motLabel(mot({ text: '', media_kind: 'audio', transcript: '   \n  ' }), L)).toBe('Mémo vocal')
  })
  it('takes the FIRST line of a multi-line transcript, not the whole paragraph', () => {
    expect(motLabel(mot({ text: '', media_kind: 'audio', transcript: 'Salut\nça va ?' }), L)).toBe('Salut')
  })
  it('a mot with nothing at all still reads as something', () => {
    expect(motLabel(mot({ text: '' }), L)).toBe('Un mot')
  })
})
