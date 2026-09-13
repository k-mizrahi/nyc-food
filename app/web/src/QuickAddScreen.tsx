import { useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { createTag, quickAddPlace, resolvePlace } from './lib/data'
import type { ImportRow, KeepForm, Place, PlaceStatus, Resolved, Tag } from './lib/types'
import { TagPicker } from './TagPicker'

interface Props {
  places: Place[]
  rows: ImportRow[]
  tags: Tag[]
  onPlaceAdded: (place: Place) => void
  onTagCreated: (tag: Tag) => void
  onPlaceTagsSet: (placeId: string, tagIds: number[], mode: 'union' | 'replace') => void
  onError: (message: string) => void
}

const BOROUGHS = ['Manhattan', 'Brooklyn', 'Queens', 'Bronx', 'Staten Island']

function emptyForm(): KeepForm {
  return {
    name: '',
    status: 'want_to_try',
    in_nyc: true,
    tagIds: [],
    cuisine: '',
    borough: '',
    neighborhood: '',
    rec_source: '',
    note_en: '',
    note_he: '',
  }
}

export function QuickAddScreen({
  places,
  rows,
  tags,
  onPlaceAdded,
  onTagCreated,
  onPlaceTagsSet,
  onError,
}: Props) {
  const [input, setInput] = useState('')
  const [resolved, setResolved] = useState<Resolved | null>(null)
  const [form, setForm] = useState<KeepForm | null>(null)
  const [resolving, setResolving] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState<Place | null>(null)
  const [notice, setNotice] = useState('')

  const cuisines = useMemo(
    () => [...new Set(places.map((p) => p.cuisine).filter((c): c is string => !!c))].sort(),
    [places],
  )
  const recSources = useMemo(
    () => [...new Set(places.map((p) => p.rec_source).filter((s): s is string => !!s))].sort(),
    [places],
  )

  async function doResolve(e: FormEvent) {
    e.preventDefault()
    const trimmed = input.trim()
    if (!trimmed || resolving) return
    setResolving(true)
    setNotice('')
    setSaved(null)
    setResolved(null)
    setForm(null)
    try {
      const isUrl = /^https?:\/\//i.test(trimmed) || trimmed.includes('maps.app.goo.gl')
      const match = await resolvePlace(isUrl ? { url: trimmed } : { query: trimmed })
      if (!match) {
        setNotice('No Google match found. Try the place name as text.')
        return
      }

      // Dedup against what already exists before offering the form
      if (match.cid) {
        const existingPlace = places.find((p) => p.cid === match.cid)
        if (existingPlace) {
          setNotice(`Already in the catalog: ${existingPlace.name}. Edit it in the Places tab.`)
          return
        }
        const pendingRow = rows.find((r) => r.cid === match.cid && r.triage_status === 'pending')
        if (pendingRow) {
          setNotice(
            `Already waiting in the review queue (from “${pendingRow.source_file}”). Keep it there.`,
          )
          return
        }
      }
      const byGoogleId = places.find((p) => p.google_place_id === match.google_place_id)
      if (byGoogleId) {
        setNotice(`Already in the catalog: ${byGoogleId.name}. Edit it in the Places tab.`)
        return
      }

      setResolved(match)
      setForm({
        ...emptyForm(),
        name: match.name ?? '',
        borough: match.borough ?? '',
        neighborhood: match.neighborhood ?? '',
      })
    } catch (err) {
      onError((err as Error).message)
    } finally {
      setResolving(false)
    }
  }

  async function save(e: FormEvent) {
    e.preventDefault()
    if (!form || saving) return
    setSaving(true)
    try {
      const place = await quickAddPlace(form, resolved, resolved?.cid ?? null)
      onPlaceAdded(place)
      onPlaceTagsSet(place.id, form.tagIds, 'replace')
      setSaved(place)
      setForm(null)
      setResolved(null)
      setInput('')
    } catch (err) {
      onError((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  function setField<K extends keyof KeepForm>(key: K, value: KeepForm[K]) {
    setForm((f) => (f ? { ...f, [key]: value } : f))
  }

  return (
    <div className="quick-add">
      <form onSubmit={doResolve} className="quick-add-input">
        <input
          type="text"
          placeholder="Paste a Google Maps link — or type a place name"
          value={input}
          onChange={(e) => setInput(e.target.value)}
        />
        <button type="submit" disabled={resolving || !input.trim()}>
          {resolving ? 'Looking up…' : 'Look up'}
        </button>
      </form>

      {notice && <p className="notice">{notice}</p>}
      {saved && (
        <p className="notice">
          Added <strong>{saved.name}</strong> to the catalog. Paste the next one.
        </p>
      )}

      {form && resolved && (
        <form onSubmit={save} className="detail">
          <div className="detail-meta">
            <div>
              Google: <strong>{resolved.name}</strong>
              {resolved.address && <> — {resolved.address}</>}
            </div>
            {resolved.expanded_url && (
              <a href={resolved.expanded_url} target="_blank" rel="noreferrer">
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
              <span className="field-label">Labels (bar, restaurant, food cart…)</span>
              <TagPicker
                idPrefix="quickadd"
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
                list="quickadd-cuisines"
                value={form.cuisine}
                onChange={(e) => setField('cuisine', e.target.value)}
              />
              <datalist id="quickadd-cuisines">
                {cuisines.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </label>
            <label>
              Borough
              <input
                list="quickadd-boroughs"
                value={form.borough}
                onChange={(e) => setField('borough', e.target.value)}
              />
              <datalist id="quickadd-boroughs">
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
                list="quickadd-recsources"
                value={form.rec_source}
                onChange={(e) => setField('rec_source', e.target.value)}
              />
              <datalist id="quickadd-recsources">
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
            <button className="primary" type="submit" disabled={saving}>
              {saving ? 'Saving…' : 'Add to catalog'}
            </button>
          </div>
        </form>
      )}
    </div>
  )
}
