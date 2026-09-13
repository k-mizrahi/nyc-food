import { useEffect, useMemo, useState } from 'react'
import { undoKeep, updatePlace } from './lib/data'
import type { ImportRow, KeepForm, Place, PlaceStatus } from './lib/types'

interface Props {
  places: Place[]
  rows: ImportRow[]
  onPlaceUpdated: (place: Place) => void
  onPlaceRemoved: (placeId: string) => void
  onRowsUpdated: (updated: ImportRow[]) => void
  onError: (message: string) => void
}

const BOROUGHS = ['Manhattan', 'Brooklyn', 'Queens', 'Bronx', 'Staten Island']

function formFromPlace(p: Place): KeepForm {
  return {
    name: p.name,
    status: p.status,
    in_nyc: p.in_nyc,
    cuisine: p.cuisine ?? '',
    borough: p.borough ?? '',
    neighborhood: p.neighborhood ?? '',
    rec_source: p.rec_source ?? '',
    note_en: p.note_en ?? '',
    note_he: p.note_he ?? '',
  }
}

export function PlacesScreen({
  places,
  rows,
  onPlaceUpdated,
  onPlaceRemoved,
  onRowsUpdated,
  onError,
}: Props) {
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [form, setForm] = useState<KeepForm | null>(null)
  const [busy, setBusy] = useState(false)
  const [savedFlash, setSavedFlash] = useState(false)

  const sorted = useMemo(() => [...places].sort((a, b) => a.name.localeCompare(b.name)), [places])
  const shown = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return sorted
    return sorted.filter((p) =>
      [p.name, p.cuisine, p.borough, p.neighborhood, p.rec_source]
        .some((v) => v?.toLowerCase().includes(q)),
    )
  }, [sorted, search])

  const selected = shown.find((p) => p.id === selectedId) ?? null
  const cuisines = useMemo(
    () => [...new Set(places.map((p) => p.cuisine).filter((c): c is string => !!c))].sort(),
    [places],
  )

  useEffect(() => {
    setForm(selected ? formFromPlace(selected) : null)
    setSavedFlash(false)
  }, [selected?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  function setField<K extends keyof KeepForm>(key: K, value: KeepForm[K]) {
    setForm((f) => (f ? { ...f, [key]: value } : f))
    setSavedFlash(false)
  }

  async function save() {
    if (!selected || !form || busy) return
    setBusy(true)
    try {
      onPlaceUpdated(await updatePlace(selected.id, form))
      setSavedFlash(true)
    } catch (e) {
      onError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function sendBackToQueue() {
    if (!selected || busy) return
    const placeRows = rows.filter((r) => r.place_id === selected.id)
    if (placeRows.length === 0) {
      onError(`no import rows point at '${selected.name}' — cannot un-keep`)
      return
    }
    if (!window.confirm(`Delete “${selected.name}” and send its ${placeRows.length} row(s) back to the review queue?`)) {
      return
    }
    setBusy(true)
    try {
      onRowsUpdated(await undoKeep(selected.id, placeRows.map((r) => r.id)))
      onPlaceRemoved(selected.id)
      setSelectedId(null)
    } catch (e) {
      onError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="review">
      <div className="review-toolbar">
        <input
          type="search"
          placeholder={`Search ${places.length} places…`}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {places.length === 0 ? (
        <p>No kept places yet — they show up here as you triage.</p>
      ) : (
        <div className="review-columns">
          <ul className="queue">
            {shown.map((p) => (
              <li
                key={p.id}
                className={selected?.id === p.id ? 'selected' : ''}
                onClick={() => setSelectedId(p.id)}
              >
                <span className="q-title">{p.name}</span>
                {!p.in_nyc && <span className="q-flag">not NYC</span>}
                <span className="q-lists">
                  {[p.status.replace('_', ' '), p.cuisine, p.borough].filter(Boolean).join(' · ')}
                </span>
              </li>
            ))}
          </ul>

          {selected && form && (
            <div className="detail">
              <h2>{selected.name}</h2>
              <div className="detail-meta">
                {selected.gmaps_url && (
                  <a href={selected.gmaps_url} target="_blank" rel="noreferrer">
                    Open in Google Maps ↗
                  </a>
                )}
              </div>

              <div className="form-grid">
                <label>
                  Name
                  <input value={form.name} onChange={(e) => setField('name', e.target.value)} />
                </label>
                <label>
                  Status
                  <select
                    value={form.status}
                    onChange={(e) => setField('status', e.target.value as PlaceStatus)}
                  >
                    <option value="want_to_try">want to try</option>
                    <option value="recommended">recommended</option>
                    <option value="closed">closed</option>
                    <option value="demoted">demoted</option>
                  </select>
                </label>
                <label className="check-label">
                  <span>
                    <input
                      type="checkbox"
                      checked={form.in_nyc}
                      onChange={(e) => setField('in_nyc', e.target.checked)}
                    />{' '}
                    In NYC (uncheck to keep for future cities)
                  </span>
                </label>
                <label>
                  Cuisine
                  <input
                    list="cuisine-options-places"
                    value={form.cuisine}
                    onChange={(e) => setField('cuisine', e.target.value)}
                  />
                  <datalist id="cuisine-options-places">
                    {cuisines.map((c) => (
                      <option key={c} value={c} />
                    ))}
                  </datalist>
                </label>
                <label>
                  Borough
                  <input
                    list="borough-options-places"
                    value={form.borough}
                    onChange={(e) => setField('borough', e.target.value)}
                  />
                  <datalist id="borough-options-places">
                    {BOROUGHS.map((b) => (
                      <option key={b} value={b} />
                    ))}
                  </datalist>
                </label>
                <label>
                  Neighborhood
                  <input
                    value={form.neighborhood}
                    onChange={(e) => setField('neighborhood', e.target.value)}
                  />
                </label>
                <label>
                  Rec. source
                  <input
                    value={form.rec_source}
                    onChange={(e) => setField('rec_source', e.target.value)}
                  />
                </label>
                <label className="wide">
                  Note (EN)
                  <textarea
                    rows={2}
                    value={form.note_en}
                    onChange={(e) => setField('note_en', e.target.value)}
                  />
                </label>
                <label className="wide" dir="rtl">
                  הערה (עברית)
                  <textarea
                    rows={2}
                    dir="rtl"
                    value={form.note_he}
                    onChange={(e) => setField('note_he', e.target.value)}
                  />
                </label>
              </div>

              <div className="detail-actions">
                <button className="primary" disabled={busy} onClick={save}>
                  Save changes
                </button>
                <button disabled={busy} onClick={sendBackToQueue}>
                  Send back to queue
                </button>
                {savedFlash && <span className="saved-flash">Saved.</span>}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
