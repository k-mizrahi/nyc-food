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

// Multi-select labels: chips + a text input suggesting existing tags.
// Typing a label that doesn't exist yet creates the tag on the fly.
export function TagPicker({ allTags, selectedIds, onChange, onCreate, idPrefix }: Props) {
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)

  const selected = selectedIds
    .map((id) => allTags.find((t) => t.id === id))
    .filter((t): t is Tag => !!t)
  const available = allTags.filter((t) => !selectedIds.includes(t.id))

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
      <div className="tag-input-row">
        <input
          list={`${idPrefix}-tag-options`}
          placeholder="add label…"
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
