import { useState } from 'react'
import type { FormEvent } from 'react'
import { supabase, OWNER_EMAIL } from './lib/supabase'

// On iPhone the magic link opens in whatever app handles the tap and the
// session lands there, not here — typing the 6-digit code from the same email
// always signs in the current tab. Both paths work.
function CodeEntry({ email }: { email: string }) {
  const [code, setCode] = useState('')
  const [state, setState] = useState<'idle' | 'checking' | 'error'>('idle')
  const [error, setError] = useState('')

  async function verify(e: FormEvent) {
    e.preventDefault()
    setState('checking')
    const { error } = await supabase.auth.verifyOtp({
      email,
      token: code.trim(),
      type: 'email',
    })
    if (error) {
      setError(error.message)
      setState('error')
    }
    // on success the auth listener in App.tsx takes over
  }

  return (
    <div>
      <p>
        Email sent to {email}. Open the link in this browser — or type the 6-digit code from
        the email:
      </p>
      <form onSubmit={verify} className="code-form">
        <input
          inputMode="numeric"
          autoComplete="one-time-code"
          placeholder="123456"
          value={code}
          onChange={(e) => setCode(e.target.value)}
        />
        <button type="submit" disabled={state === 'checking' || code.trim().length < 6}>
          {state === 'checking' ? 'Checking…' : 'Sign in'}
        </button>
      </form>
      {state === 'error' && <p className="error">{error}</p>}
    </div>
  )
}

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
        <CodeEntry email={email} />
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
