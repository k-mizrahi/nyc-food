import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase, OWNER_EMAIL } from './lib/supabase'
import { Login } from './Login'
import { Admin } from './Admin'

export function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setReady(true)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  if (!ready) return null

  if (!session) return <Login />

  // Cosmetic gate only — RLS is the real boundary. A non-owner session
  // would just see empty tables, but say it plainly instead.
  if (session.user.email !== OWNER_EMAIL) {
    return (
      <main className="shell">
        <p>
          Signed in as {session.user.email}, which is not the owner account.{' '}
          <button onClick={() => supabase.auth.signOut()}>Sign out</button>
        </p>
      </main>
    )
  }

  return <Admin session={session} />
}
