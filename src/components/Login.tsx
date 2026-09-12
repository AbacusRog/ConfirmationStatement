import { useState } from 'react'
import { supabase } from '../supabaseClient'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setError(error.message)
    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-paper flex items-center justify-center px-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded-lg border border-line bg-white p-8"
      >
        <h1 className="font-serif text-xl text-ink mb-1">Confirmation Statement Mailer</h1>
        <p className="text-sm text-slate-650 mb-6">Sign in to continue.</p>

        <label className="block text-xs font-medium text-slate-650 mb-1">Email</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoFocus
          className="w-full rounded-md border border-line px-3 py-2 text-sm mb-3 outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-colors"
        />

        <label className="block text-xs font-medium text-slate-650 mb-1">Password</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-md border border-line px-3 py-2 text-sm mb-4 outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-colors"
        />

        {error && <p className="text-xs text-warn mb-3">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-md bg-accent px-4 py-2.5 text-sm font-medium text-white hover:bg-accent-dark disabled:opacity-40 transition-colors"
        >
          {loading ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  )
}
