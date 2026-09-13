import { useEffect, useMemo, useRef, useState } from 'react'
import { createTag, dropRows, keepGroup, resolvePlace, undoKeep, restoreRows } from './lib/data'
import type {
  ImportRow,
  KeepForm,
  LastAction,
  List,
  Place,
  PlaceStatus,
  Resolved,
  Tag,
} from './lib/types'
import { TagPicker } from './TagPicker'

interface Props {
  lists: List[]
  rows: ImportRow[]
  places: Place[]
  tags: Tag[]
  onRowsUpdated: (updated: ImportRow[]) => void
  onPlaceAdded: (place: Place) => void
  onPlaceRemoved: (placeId: string) => void
  onTagCreated: (tag: Tag) => void
  onPlaceTagsSet: (placeId: string, tagIds: number[], mode: 'union' | 'replace') => void
  onError: (message: string) => void
}

interface Group {
  key: string
  rows: ImportRow[]
}

const BOROUGHS = ['Manhattan', 'Brooklyn', 'Queens', 'Bronx', 'Staten Island']
const HEBREW = /[֐-׿]/

// "המלצה של X" / "המלצת X" in a note → rec_source suggestion (suggestion only)
function suggestRecSource(notes: string[]): string {
  for (const note of notes) {
    const m = note.match(/המלצ(?:ה של|ת)\s+(.+?)(?:[.\n]|$)/)
    if (m) return m[1].trim()
  }
  return ''
}

function initialForm(group: Group): KeepForm {
  const rows = group.rows
  const name = rows.find((r) => r.title?.trim())?.title?.trim() ?? ''
  const notes = [...new Set(rows.map((r) => r.note?.trim()).filter((n): n is string => !!n))]
  return {
    name,
    status: 'want_to_try',
    in_nyc: true,
    tagIds: [],
    cuisine: '',
    borough: '',
    neighborhood: '',
    rec_source: suggestRecSource(notes),
    note_en: notes.filter((n) => !HEBREW.test(n)).join('\n'),
    note_he: notes.filter((n) => HEBREW.test(n)).join('\n'),
  }
}

export function ReviewScreen({
  lists,
  rows,
  places,
  tags,
  onRowsUpdated,
  onPlaceAdded,
  onPlaceRemoved,
  onTagCreated,
  onPlaceTagsSet,
  onError,
}: Props) {
  const [listFilter, setListFilter] = useState('')
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [form, setForm] = useState<KeepForm | null>(null)
  const [resolved, setResolved] = useState<Resolved | null>(null)
  const [noMatch, setNoMatch] = useState(false)
  const [resolving, setResolving] = useState(false)
  const [busy, setBusy] = useState(false)
  const [lastAction, setLastAction] = useState<LastAction | null>(null)
  const nameInputRef = useRef<HTMLInputElement>(null)
  // Synchronous re-entry guard: two rapid keypresses can both read stale
  // `busy` state before React re-renders; the ref flips immediately.
  const busyRef = useRef(false)

  const listNameByFile = useMemo(
    () => new Map(lists.map((l) => [l.source_file, l.name])),
    [lists],
  )
  const listIdByFile = useMemo(() => new Map(lists.map((l) => [l.source_file, l.id])), [lists])
  const cuisines = useMemo(
    () => [...new Set(places.map((p) => p.cuisine).filter((c): c is string => !!c))].sort(),
    [places],
  )
  const recSources = useMemo(
    () => [...new Set(places.map((p) => p.rec_source).filter((s): s is string => !!s))].sort(),
    [places],
  )

  const groups = useMemo(() => {
    const pending = rows.filter((r) => r.triage_status === 'pending')
    const byKey = new Map<string, ImportRow[]>()
    for (const r of pending) {
      const key = r.cid ?? `row-${r.id}`
      const arr = byKey.get(key)
      if (arr) arr.push(r)
      else byKey.set(key, [r])
    }
    let all: Group[] = [...byKey.entries()].map(([key, groupRows]) => ({ key, rows: groupRows }))
    if (listFilter) {
      all = all.filter((g) => g.rows.some((r) => r.source_file === listFilter))
    }
    all.sort((a, b) => Math.min(...a.rows.map((r) => r.id)) - Math.min(...b.rows.map((r) => r.id)))
    return all
  }, [rows, listFilter])

  const selectedIndex = groups.findIndex((g) => g.key === selectedKey)
  const selected = selectedIndex >= 0 ? groups[selectedIndex] : groups[0] ?? null

  // Re-init the form whenever the selected group changes
  useEffect(() => {
    setForm(selected ? initialForm(selected) : null)
    setResolved(null)
    setNoMatch(false)
  }, [selected?.key]) // eslint-disable-line react-hooks/exhaustive-deps

  async function doResolve() {
    if (!form || resolving) return
    setResolving(true)
    setNoMatch(false)
    try {
      const match = await resolvePlace({ query: form.name })
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

  function move(delta: number) {
    if (groups.length === 0) return
    const cur = selected ? groups.findIndex((g) => g.key === selected.key) : 0
    const next = Math.min(groups.length - 1, Math.max(0, cur + delta))
    setSelectedKey(groups[next].key)
    document.getElementById(`group-${groups[next].key}`)?.scrollIntoView({ block: 'nearest' })
  }

  function advanceAfterAction(actedKey: string) {
    const idx = groups.findIndex((g) => g.key === actedKey)
    const next = groups[idx + 1] ?? groups[idx - 1]
    setSelectedKey(next ? next.key : null)
  }

  async function doKeep() {
    if (!selected || !form || busyRef.current) return
    busyRef.current = true
    setBusy(true)
    try {
      const { place, updatedRows, merged } = await keepGroup(
        selected.rows,
        form,
        listIdByFile,
        resolved,
      )
      onPlaceAdded(place)
      onPlaceTagsSet(place.id, form.tagIds, merged ? 'union' : 'replace')
      onRowsUpdated(updatedRows)
      setLastAction({
        type: 'keep',
        rowIds: selected.rows.map((r) => r.id),
        placeId: place.id,
        label: merged ? `${place.name} (merged into existing)` : place.name,
      })
      advanceAfterAction(selected.key)
    } catch (e) {
      onError((e as Error).message)
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }

  async function doDrop() {
    if (!selected || busyRef.current) return
    busyRef.current = true
    setBusy(true)
    try {
      onRowsUpdated(await dropRows(selected.rows.map((r) => r.id)))
      setLastAction({
        type: 'drop',
        rowIds: selected.rows.map((r) => r.id),
        label: selected.rows[0].title ?? `group ${selected.key}`,
      })
      advanceAfterAction(selected.key)
    } catch (e) {
      onError((e as Error).message)
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }

  async function doUndo() {
    if (!lastAction || busyRef.current) return
    busyRef.current = true
    setBusy(true)
    try {
      if (lastAction.type === 'keep') {
        onRowsUpdated(await undoKeep(lastAction.placeId, lastAction.rowIds))
        onPlaceRemoved(lastAction.placeId)
      } else {
        onRowsUpdated(await restoreRows(lastAction.rowIds))
      }
      setLastAction(null)
    } catch (e) {
      onError((e as Error).message)
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement).tagName
      const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
      if (typing) {
        if (e.key === 'Escape') (e.target as HTMLElement).blur()
        return
      }
      if (e.key === 'ArrowDown' || e.key === 'j') {
        e.preventDefault()
        move(1)
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        move(-1)
      } else if (e.key === 'k') {
        e.preventDefault()
        doKeep()
      } else if (e.key === 'd') {
        e.preventDefault()
        doDrop()
      } else if (e.key === 'u') {
        e.preventDefault()
        doUndo()
      } else if (e.key === 'e') {
        e.preventDefault()
        nameInputRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  function setField<K extends keyof KeepForm>(key: K, value: KeepForm[K]) {
    setForm((f) => (f ? { ...f, [key]: value } : f))
  }

  return (
    <div className="review">
      <div className="review-toolbar">
        <select value={listFilter} onChange={(e) => setListFilter(e.target.value)}>
          <option value="">All lists ({groups.length} groups)</option>
          {lists.map((l) => (
            <option key={l.id} value={l.source_file}>
              {l.name}
            </option>
          ))}
        </select>
        {lastAction && (
          <button disabled={busy} onClick={doUndo}>
            Undo {lastAction.type}: {lastAction.label}
          </button>
        )}
        <span className="kbd-hints">
          ↑↓ move · <kbd>k</kbd> keep · <kbd>d</kbd> drop · <kbd>u</kbd> undo · <kbd>e</kbd> edit ·{' '}
          <kbd>esc</kbd> back
        </span>
      </div>

      {groups.length === 0 ? (
        <p>No pending rows{listFilter ? ' in this list' : ''}. Triage done here.</p>
      ) : (
        <div className="review-columns">
          <ul className="queue">
            {groups.map((g) => (
              <li
                key={g.key}
                id={`group-${g.key}`}
                className={selected?.key === g.key ? 'selected' : ''}
                onClick={() => setSelectedKey(g.key)}
              >
                <span className="q-title">{g.rows[0].title ?? '(untitled)'}</span>
                {g.rows.length > 1 && <span className="q-dupe">×{g.rows.length}</span>}
                <span className="q-lists">
                  {[...new Set(g.rows.map((r) => listNameByFile.get(r.source_file)))].join(', ')}
                </span>
              </li>
            ))}
          </ul>

          {selected && form && (
            <div className="detail">
              <h2>{selected.rows[0].title ?? '(untitled)'}</h2>
              <div className="detail-meta">
                {selected.rows.map((r) => (
                  <div key={r.id} className="src-row">
                    <strong>{listNameByFile.get(r.source_file)}</strong>
                    {r.note && <span> — {r.note}</span>}
                  </div>
                ))}
                {selected.rows[0].cid && (
                  <a
                    href={`https://maps.google.com/?cid=${selected.rows[0].cid}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open in Google Maps ↗
                  </a>
                )}
              </div>

              <div className="form-grid">
                <label>
                  Name
                  <input
                    ref={nameInputRef}
                    value={form.name}
                    onChange={(e) => setField('name', e.target.value)}
                  />
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
                    {!resolved && !noMatch && !resolving && (
                      <span className="resolve-hint">
                        fills borough + neighborhood, saves coordinates
                      </span>
                    )}
                  </div>
                </div>
                <div className="form-grid-cell wide">
                  <span className="field-label">Labels (bar, restaurant, food cart…)</span>
                  <TagPicker
                    idPrefix="review"
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
                    list="cuisine-options"
                    value={form.cuisine}
                    onChange={(e) => setField('cuisine', e.target.value)}
                  />
                  <datalist id="cuisine-options">
                    {cuisines.map((c) => (
                      <option key={c} value={c} />
                    ))}
                  </datalist>
                </label>
                <label>
                  Borough
                  <input
                    list="borough-options"
                    value={form.borough}
                    onChange={(e) => setField('borough', e.target.value)}
                  />
                  <datalist id="borough-options">
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
                    list="rec-source-options"
                    value={form.rec_source}
                    onChange={(e) => setField('rec_source', e.target.value)}
                  />
                  <datalist id="rec-source-options">
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
                <button className="primary" disabled={busy} onClick={doKeep}>
                  Keep (k)
                </button>
                <button disabled={busy} onClick={doDrop}>
                  Drop (d)
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
