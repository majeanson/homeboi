// The shared shape of a DERIVED occurrence — a calendar/agenda signal computed from
// stored data (a person's birthday, a work block's recurrence, a thing's lifecycle
// horizon) and NEVER materialized as a row. Birthdays, « L'auto » work windows, and
// the carnet « long jeu » nudge are the three today; each is produced by its own pure
// function (`birthdayOccurrences`, `workOccurrencesInRange`, `carnetLifeSoon`) and
// extends this base so every derived signal carries the same two universal fields:
//
//   id   a STABLE, collision-proof identity whose PREFIX names its source —
//        `birthday:<personKey>:<year>`, `work:<blockId>:<dayStart>`,
//        `carnet-life:<carnetId>`. The prefix is the discriminator (route a mixed
//        list with `id.split(':')[0]`), so there is no separate `kind`/`source`
//        field — a deliberate choice, because carnet occurrences already use `kind`
//        for the thing's TYPE (home/auto/appliance) and a second `kind` would collide.
//   at   the occurrence's primary instant (unix seconds): local midnight for an
//        all-day signal (birthday, replacement horizon), the wall-clock start for a
//        windowed one (a work block — which adds its own `endAt`).
//
// Each occurrence keeps its own typed extras (a birthday's `age`/`giftIdeas`, a work
// window's `endAt`/`holdsCar`/`colour`, a carnet's `monthsLeft`/`kind`) — the base is
// intentionally minimal, naming only what's truly common so a consumer can sort,
// key, and dedup any derived signal uniformly.
export interface DerivedOccurrence {
  id: string
  at: number
}
