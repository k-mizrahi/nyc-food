import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './lib/supabase'
import { fetchAll } from './lib/data'
import type { ImportRow, List, Place, PlaceTag, Tag } from './lib/types'
import { ListsScreen } from './ListsScreen'
import { ReviewScreen } from './ReviewScreen'
import { PlacesScreen } from './PlacesScreen'
import { QuickAddScreen } from './QuickAddScreen'

type Tab = 'overview' | 'add' | 'lists' | 'review' | 'places'

export function Admin({ session }: { session: Session }) {
  const [tab, setTab] = useState<Tab>('overview')
  const [rows, setRows] = useState<ImportRow[] | null>(null)
  const [lists, setLists] = useState<List[]>([])
  const [places, setPlaces] = useState<Place[]>([])
  const [tags, setTags] = useState<Tag[]>([])
  const [placeTags, setPlaceTags] = useState<PlaceTag[]>([])
  const [error, setError] = useState('')

  useEffect(() => {
    fetchAll()
      .then((data) => {
        setRows(data.rows)
        setLists(data.lists)
        setPlaces(data.places)
        setTags(data.tags)
        setPlaceTags(data.placeTags)
      })
      .catch((e: Error) => setError(e.message))
  }, [])

  function removePlace(id: string) {
    setPlaces((prev) => prev.filter((p) => p.id !== id))
    setPlaceTags((prev) => prev.filter((pt) => pt.place_id !== id))
  }

  function setPlaceTagIds(placeId: string, tagIds: number[], mode: 'union' | 'replace') {
    setPlaceTags((prev) => {
      const others = prev.filter((pt) => pt.place_id !== placeId)
      const existing = prev.filter((pt) => pt.place_id === placeId).map((pt) => pt.tag_id)
      const ids = mode === 'union' ? [...new Set([...existing, ...tagIds])] : tagIds
      return [...others, ...ids.map((tag_id) => ({ place_id: placeId, tag_id }))]
    })
  }

  function addTag(tag: Tag) {
    setTags((prev) => (prev.some((t) => t.id === tag.id) ? prev : [...prev, tag]))
  }

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
        {(['overview', 'add', 'lists', 'review', 'places'] as Tab[]).map((t) => (
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

      {rows && tab === 'add' && (
        <QuickAddScreen
          places={places}
          rows={rows}
          tags={tags}
          onPlaceAdded={(p) =>
            setPlaces((prev) => (prev.some((x) => x.id === p.id) ? prev : [...prev, p]))
          }
          onTagCreated={addTag}
          onPlaceTagsSet={setPlaceTagIds}
          onError={setError}
        />
      )}

      {rows && tab === 'places' && (
        <PlacesScreen
          places={places}
          rows={rows}
          tags={tags}
          placeTags={placeTags}
          onPlaceUpdated={(p) => setPlaces((prev) => prev.map((x) => (x.id === p.id ? p : x)))}
          onPlaceRemoved={removePlace}
          onRowsUpdated={applyRowUpdates}
          onTagCreated={addTag}
          onPlaceTagsSet={setPlaceTagIds}
          onError={setError}
        />
      )}

      {rows && tab === 'review' && (
        <ReviewScreen
          lists={lists}
          rows={rows}
          places={places}
          tags={tags}
          onRowsUpdated={applyRowUpdates}
          onPlaceAdded={(p) =>
            setPlaces((prev) =>
              prev.some((x) => x.id === p.id) ? prev.map((x) => (x.id === p.id ? p : x)) : [...prev, p],
            )
          }
          onPlaceRemoved={removePlace}
          onTagCreated={addTag}
          onPlaceTagsSet={setPlaceTagIds}
          onError={setError}
        />
      )}
    </main>
  )
}
