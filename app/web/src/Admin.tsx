import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './lib/supabase'

// Smoke-test counts proving the owner JWT passes RLS on owner-only tables.
// Replaced by the real triage screens in steps 5-6.
type Counts = { lists: number; rows: number; pending: number }

export function Admin({ session }: { session: Session }) {
  const [counts, setCounts] = useState<Counts | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    async function load() {
      const [lists, rows, pending] = await Promise.all([
        supabase.from('lists').select('*', { count: 'exact', head: true }),
        supabase.from('import_rows').select('*', { count: 'exact', head: true }),
        supabase
          .from('import_rows')
          .select('*', { count: 'exact', head: true })
          .eq('triage_status', 'pending'),
      ])
      const failed = [lists, rows, pending].find((r) => r.error)
      if (failed?.error) {
        setError(failed.error.message)
        return
      }
      setCounts({ lists: lists.count ?? 0, rows: rows.count ?? 0, pending: pending.count ?? 0 })
    }
    load()
  }, [])

  return (
    <main className="shell">
      <header className="topbar">
        <h1>NYC Food — Admin</h1>
        <div>
          <span className="who">{session.user.email}</span>
          <button onClick={() => supabase.auth.signOut()}>Sign out</button>
        </div>
      </header>

      {error && <p className="error">Query failed: {error}</p>}
      {!error && !counts && <p>Loading…</p>}
      {counts && (
        <section className="cards">
          <div className="card">
            <div className="num">{counts.lists}</div>
            <div className="label">lists</div>
          </div>
          <div className="card">
            <div className="num">{counts.rows}</div>
            <div className="label">staged rows</div>
          </div>
          <div className="card">
            <div className="num">{counts.pending}</div>
            <div className="label">pending triage</div>
          </div>
        </section>
      )}

      <p className="hint">Triage screens land next (steps 5–6).</p>
    </main>
  )
}
