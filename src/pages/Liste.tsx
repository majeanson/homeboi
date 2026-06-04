import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { BigTiles, type Tile } from '../components/BigTiles'
import { useT } from '../i18n'
import { useAudience } from '../lib/audience'
import { api, ApiError } from '../lib/api'

// The shared list (groceries + anything), two lenses on the same data:
//   - parent: the compact check-off list.
//   - toddler: big tiles; tapping checks the item off AND reads it aloud, so a
//     pre-reader can help clear the list — the same write a parent makes.
// Reads the list out of the one-shot /board payload to avoid a second endpoint.
interface ListRow {
  id: string
  text: string
  source: string
}

export function Liste() {
  const t = useT()
  const { audience } = useAudience()
  const [list, setList] = useState<ListRow[] | null>(null)
  const [unauth, setUnauth] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await api<{ list: ListRow[] }>('board')
      setList(res.list)
      setUnauth(false)
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) setUnauth(true)
      else setList([])
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function check(item: ListRow) {
    // Optimistic: drop it immediately, then persist (same as the board does).
    setList((l) => (l ? l.filter((i) => i.id !== item.id) : l))
    await api('list', { method: 'PATCH', body: { id: item.id, checked: true } }).catch(() => load())
  }

  if (unauth) {
    return (
      <main className="narrow">
        <Link to="/pair" className="btn btn--primary">
          {t.home.ctaPair}
        </Link>
      </main>
    )
  }
  if (!list) return <p className="loading mono">{t.common.loading}</p>

  if (audience === 'toddler') {
    const tiles: Tile[] = list.map((i) => ({
      key: i.id,
      icon: '🛒',
      label: i.text,
      narration: i.text,
      onTap: () => check(i),
    }))
    return (
      <main className="kid__main">
        <BigTiles tiles={tiles} empty={t.board.listEmpty} />
      </main>
    )
  }

  return (
    <main className="narrow">
      <h1>{t.nav.list}</h1>
      {list.length === 0 ? (
        <p className="board__empty mono">{t.board.listEmpty}</p>
      ) : (
        <ul className="board__list">
          {list.map((item) => (
            <li key={item.id}>
              <button type="button" className="board__list-item" onClick={() => check(item)}>
                <span className="board__check" aria-hidden="true">
                  ☐
                </span>
                <span>{item.text}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
