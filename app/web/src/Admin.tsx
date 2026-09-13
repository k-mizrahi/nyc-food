import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './lib/supabase'
import { fetchAll } from './lib/data'
import type { ImportRow, List, PlaceLite } from './lib/types'
import { ListsScreen } from './ListsScreen'
import { ReviewScreen } from './ReviewScreen'

type Tab = 'overview' | 'lists' | 'review'

export function Admin({ session }: { session: Session }) {
  const [tab, setTab] = useState<Tab>('overview')
  const [rows, setRows] = useState<ImportRow[] | null>(null)
  const [lists, setLists] = useState<List[]>([])
  const [places, setPlaces] = useState<PlaceLite[]>([])
  const [error, setError] = useState('')

  useEffect(() => {
    fetchAll()
      .then((data) => {
        setRows(data.rows)
        setLists(data.lists)
        setPlaces(data.places)
      })
      .catch((e: Error) => setError(e.message))
  }, [])

  function applyRowUpdates(updated: ImportRow[]) {
    const byId = new Map(updated.map((r) => [r.id, r]))
    setRows((prev) => (prev ? prev.map((r) => byId.get(r.id) ?? r) : prev))
  }

  function applyListUpdate(list: List) {
    setLists((prev) => prev.map((l) => (l.id === list.id ? list : l)))
  }

  const pending = rows?.filter((r) => r.triage_status === 'pending').length ?? 0
  const kept = rows?.filter((r) => r.triage_status === 'kept').length ?? 0
  const dropped = rows?.filter((r) => r.triage_status === 'dropped').length ?? 0

  return (
    <main className="shell wide-shell">
      <header className="topbar">
        <h1>NYC Food — Admin</h1>
        <div>
          <span className="who">{session.user.email}</span>
          <button onClick={() => supabase.auth.signOut()}>Sign out</button>
        </div>
      </header>

      <nav className="tabs">
        {(['overview', 'lists', 'review'] as Tab[]).map((t) => (
          <button key={t} className={tab === t ? 'active' : ''} onClick={() => setTab(t)}>
            {t}
          </button>
        ))}
      </nav>

      {error && (
        <p className="error">
          {error} <button onClick={() => setError('')}>dismiss</button>
        </p>
      )}
      {!rows && !error && <p>Loading…</p>}

      {rows && tab === 'overview' && (
        <section className="cards">
          <div className="card">
            <div className="num">{lists.length}</div>
            <div className="label">lists</div>
          </div>
          <div className="card">
            <div className="num">{pending}</div>
            <div className="label">pending</div>
          </div>
          <div className="card">
            <div className="num">{kept}</div>
            <div className="label">kept</div>
          </div>
          <div className="card">
            <div className="num">{dropped}</div>
            <div className="label">dropped</div>
          </div>
          <div className="card">
            <div className="num">{places.length}</div>
            <div className="label">places created</div>
          </div>
        </section>
      )}

      {rows && tab === 'lists' && (
        <ListsScreen
          lists={lists}
          rows={rows}
          onRowsUpdated={applyRowUpdates}
          onListUpdated={applyListUpdate}
          onError={setError}
        />
      )}

      {rows && tab === 'review' && (
        <ReviewScreen
          lists={lists}
          rows={rows}
          places={places}
          onRowsUpdated={applyRowUpdates}
          onPlaceAdded={(p) => setPlaces((prev) => [...prev, p])}
          onPlaceRemoved={(id) => setPlaces((prev) => prev.filter((p) => p.id !== id))}
          onError={setError}
        />
      )}
    </main>
  )
}
