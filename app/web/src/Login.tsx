import { useState } from 'react'
import type { FormEvent } from 'react'
import { supabase, OWNER_EMAIL } from './lib/supabase'

export function Login() {
  const [email, setEmail] = useState(OWNER_EMAIL)
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  const [error, setError] = useState('')

  async function sendLink(e: FormEvent) {
    e.preventDefault()
    setState('sending')
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin },
    })
    if (error) {
      setError(error.message)
      setState('error')
    } else {
      setState('sent')
    }
  }

  return (
    <main className="shell login">
      <h1>NYC Food — Admin</h1>
      {state === 'sent' ? (
        <p>Magic link sent to {email}. Check your inbox, open the link in this browser.</p>
      ) : (
        <form onSubmit={sendLink}>
          <label>
            Email
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
            />
          </label>
          <button type="submit" disabled={state === 'sending'}>
            {state === 'sending' ? 'Sending…' : 'Send magic link'}
          </button>
          {state === 'error' && <p className="error">{error}</p>}
        </form>
      )}
    </main>
  )
}
