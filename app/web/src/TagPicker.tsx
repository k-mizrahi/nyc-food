import { useState } from 'react'
import type { KeyboardEvent } from 'react'
import type { Tag } from './lib/types'

interface Props {
  allTags: Tag[]
  selectedIds: number[]
  onChange: (ids: number[]) => void
  onCreate: (label: string) => Promise<Tag>
  idPrefix: string
}

// Starter labels shown as one-tap buttons until a real tag with that name
// exists; clicking one creates the tag. After that they're ordinary tags.
const SUGGESTED = ['bar', 'sit-down restaurant', 'take-out']

// Multi-select labels: chips for selected, one-tap buttons for every other
// existing tag, plus a text input for brand-new labels (created on the fly).
export function TagPicker({ allTags, selectedIds, onChange, onCreate, idPrefix }: Props) {
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)

  const selected = selectedIds
    .map((id) => allTags.find((t) => t.id === id))
    .filter((t): t is Tag => !!t)
  const available = allTags.filter((t) => !selectedIds.includes(t.id))
  const suggested = SUGGESTED.filter(
    (s) => !allTags.some((t) => t.label_en.toLowerCase() === s.toLowerCase()),
  )

  async function add(label: string) {
    const trimmed = label.trim()
    if (!trimmed || busy) return
    const existing = allTags.find((t) => t.label_en.toLowerCase() === trimmed.toLowerCase())
    if (existing) {
      if (!selectedIds.includes(existing.id)) onChange([...selectedIds, existing.id])
      setInput('')
      return
    }
    setBusy(true)
    try {
      const tag = await onCreate(trimmed)
      if (!selectedIds.includes(tag.id)) onChange([...selectedIds, tag.id])
      setInput('')
    } finally {
      setBusy(false)
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault()
      add(input)
    }
  }

  return (
    <div className="tag-picker">
      <div className="tag-chips">
        {selected.map((t) => (
          <span key={t.id} className="tag-chip">
            {t.label_en}
            <button
              type="button"
              aria-label={`remove ${t.label_en}`}
              onClick={() => onChange(selectedIds.filter((id) => id !== t.id))}
            >
              ×
            </button>
          </span>
        ))}
      </div>
      {(available.length > 0 || suggested.length > 0) && (
        <div className="tag-options">
          {available.map((t) => (
            <button
              key={t.id}
              type="button"
              className="tag-option"
              disabled={busy}
              onClick={() => onChange([...selectedIds, t.id])}
            >
              {t.label_en}
            </button>
          ))}
          {suggested.map((s) => (
            <button
              key={s}
              type="button"
              className="tag-option"
              disabled={busy}
              onClick={() => add(s)}
            >
              + {s}
            </button>
          ))}
        </div>
      )}
      <div className="tag-input-row">
        <input
          list={`${idPrefix}-tag-options`}
          placeholder="new label…"
          value={input}
          disabled={busy}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
        />
        <datalist id={`${idPrefix}-tag-options`}>
          {available.map((t) => (
            <option key={t.id} value={t.label_en} />
          ))}
        </datalist>
        <button type="button" disabled={busy || !input.trim()} onClick={() => add(input)}>
          Add
        </button>
      </div>
    </div>
  )
}
