import { useEffect, useMemo, useState } from 'react'
import { createTag, resolvePlace, syncPlaceTags, undoKeep, updatePlace } from './lib/data'
import type {
  ImportRow,
  KeepForm,
  Place,
  PlaceStatus,
  PlaceTag,
  Resolved,
  Tag,
} from './lib/types'
import { TagPicker } from './TagPicker'

interface Props {
  places: Place[]
  rows: ImportRow[]
  tags: Tag[]
  placeTags: PlaceTag[]
  onPlaceUpdated: (place: Place) => void
  onPlaceRemoved: (placeId: string) => void
  onRowsUpdated: (updated: ImportRow[]) => void
  onTagCreated: (tag: Tag) => void
  onPlaceTagsSet: (placeId: string, tagIds: number[], mode: 'union' | 'replace') => void
  onError: (message: string) => void
}

const BOROUGHS = ['Manhattan', 'Brooklyn', 'Queens', 'Bronx', 'Staten Island']

function formFromPlace(p: Place, tagIds: number[]): KeepForm {
  return {
    name: p.name,
    status: p.status,
    in_nyc: p.in_nyc,
    tagIds,
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
  tags,
  placeTags,
  onPlaceUpdated,
  onPlaceRemoved,
  onRowsUpdated,
  onTagCreated,
  onPlaceTagsSet,
  onError,
}: Props) {
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [form, setForm] = useState<KeepForm | null>(null)
  const [resolved, setResolved] = useState<Resolved | null>(null)
  const [noMatch, setNoMatch] = useState(false)
  const [resolving, setResolving] = useState(false)
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
  const recSources = useMemo(
    () => [...new Set(places.map((p) => p.rec_source).filter((s): s is string => !!s))].sort(),
    [places],
  )

  const selectedTagIds = useMemo(
    () => (selected ? placeTags.filter((pt) => pt.place_id === selected.id).map((pt) => pt.tag_id) : []),
    [placeTags, selected?.id], // eslint-disable-line react-hooks/exhaustive-deps
  )

  useEffect(() => {
    setForm(selected ? formFromPlace(selected, selectedTagIds) : null)
    setSavedFlash(false)
    setResolved(null)
    setNoMatch(false)
  }, [selected?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  async function doResolve() {
    if (!form || resolving) return
    setResolving(true)
    setNoMatch(false)
    try {
      const match = await resolvePlace(form.name)
      setResolved(match)
      setNoMatch(match === null)
      if (match) {
        setForm((f) =>
          f
            ? {
                ...f,
                borough: match.borough ?? f.borough,
                neighborhood: match.neighborhood ?? f.neighborhood,
              }
            : f,
        )
      }
    } catch (e) {
      onError((e as Error).message)
    } finally {
      setResolving(false)
    }
  }

  function setField<K extends keyof KeepForm>(key: K, value: KeepForm[K]) {
    setForm((f) => (f ? { ...f, [key]: value } : f))
    setSavedFlash(false)
  }

  async function save() {
    if (!selected || !form || busy) return
    setBusy(true)
    try {
      const updated = await updatePlace(selected.id, form, resolved)
      await syncPlaceTags(selected.id, form.tagIds, selectedTagIds)
      onPlaceUpdated(updated)
      onPlaceTagsSet(selected.id, form.tagIds, 'replace')
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
                <div className="form-grid-cell wide">
                  <div className="resolve-row">
                    <button type="button" disabled={resolving || busy} onClick={doResolve}>
                      {resolving ? 'Looking up…' : 'Auto-fill from Google'}
                    </button>
                    {resolved && (
                      <span className="resolve-result">
                        Google: <strong>{resolved.name}</strong>
                        {resolved.address && <> — {resolved.address}</>}
                      </span>
                    )}
                    {noMatch && <span className="resolve-result">No Google match found.</span>}
                    {!resolved && !noMatch && !resolving && selected.google_place_id && (
                      <span className="resolve-hint">already resolved: {selected.address}</span>
                    )}
                  </div>
                </div>
                <div className="form-grid-cell wide">
                  <span className="field-label">Labels (bar, restaurant, food cart…)</span>
                  <TagPicker
                    idPrefix="places"
                    allTags={tags}
                    selectedIds={form.tagIds}
                    onChange={(ids) => setField('tagIds', ids)}
                    onCreate={async (label) => {
                      const tag = await createTag(label)
                      onTagCreated(tag)
                      return tag
                    }}
                  />
                </div>
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
                    list="rec-source-options-places"
                    value={form.rec_source}
                    onChange={(e) => setField('rec_source', e.target.value)}
                  />
                  <datalist id="rec-source-options-places">
                    {recSources.map((s) => (
                      <option key={s} value={s} />
                    ))}
                  </datalist>
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
