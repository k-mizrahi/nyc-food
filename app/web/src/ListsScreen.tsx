import { useState } from 'react'
import { dropRows, restoreRows, setDefaultAction } from './lib/data'
import type { DefaultAction, ImportRow, List } from './lib/types'

interface Props {
  lists: List[]
  rows: ImportRow[]
  onRowsUpdated: (updated: ImportRow[]) => void
  onListUpdated: (list: List) => void
  onError: (message: string) => void
}

export function ListsScreen({ lists, rows, onRowsUpdated, onListUpdated, onError }: Props) {
  const [busy, setBusy] = useState<number | null>(null)

  const byFile = new Map<string, ImportRow[]>()
  for (const r of rows) {
    const arr = byFile.get(r.source_file)
    if (arr) arr.push(r)
    else byFile.set(r.source_file, [r])
  }

  async function changeAction(list: List, action: DefaultAction) {
    try {
      await setDefaultAction(list.id, action)
      onListUpdated({ ...list, default_action: action })
    } catch (e) {
      onError((e as Error).message)
    }
  }

  async function bulk(list: List, mode: 'drop' | 'restore') {
    const listRows = byFile.get(list.source_file) ?? []
    const targets =
      mode === 'drop'
        ? listRows.filter((r) => r.triage_status === 'pending')
        : listRows.filter((r) => r.triage_status === 'dropped' && r.place_id === null)
    if (targets.length === 0) return
    const verb = mode === 'drop' ? 'Drop' : 'Restore'
    if (!window.confirm(`${verb} ${targets.length} rows in “${list.name}”?`)) return
    setBusy(list.id)
    try {
      const fn = mode === 'drop' ? dropRows : restoreRows
      onRowsUpdated(await fn(targets.map((r) => r.id)))
    } catch (e) {
      onError((e as Error).message)
    } finally {
      setBusy(null)
    }
  }

  return (
    <table className="lists-table">
      <thead>
        <tr>
          <th>List</th>
          <th>Pending</th>
          <th>Kept</th>
          <th>Dropped</th>
          <th>Default</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        {lists.map((list) => {
          const listRows = byFile.get(list.source_file) ?? []
          const pending = listRows.filter((r) => r.triage_status === 'pending').length
          const kept = listRows.filter((r) => r.triage_status === 'kept').length
          const dropped = listRows.filter((r) => r.triage_status === 'dropped').length
          return (
            <tr key={list.id}>
              <td>
                <div className="list-name">{list.name}</div>
                {list.description && <div className="list-desc">{list.description}</div>}
              </td>
              <td className="num-cell">{pending}</td>
              <td className="num-cell">{kept}</td>
              <td className="num-cell">{dropped}</td>
              <td>
                <select
                  value={list.default_action}
                  onChange={(e) => changeAction(list, e.target.value as DefaultAction)}
                >
                  <option value="review">review</option>
                  <option value="keep">keep</option>
                  <option value="drop">drop</option>
                </select>
              </td>
              <td className="actions-cell">
                <button
                  disabled={busy === list.id || pending === 0}
                  onClick={() => bulk(list, 'drop')}
                >
                  Drop pending
                </button>
                <button
                  disabled={busy === list.id || dropped === 0}
                  onClick={() => bulk(list, 'restore')}
                >
                  Restore dropped
                </button>
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
