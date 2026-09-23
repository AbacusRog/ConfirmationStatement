import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase, Client } from './supabaseClient'
import Login from './components/Login'
import ClientSearch from './components/ClientSearch'
import EmailPreview from './components/EmailPreview'
import YearEndList from './components/YearEndList'
import TasksList from './components/TasksList'

export default function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  const [tab, setTab] = useState<'confirmation' | 'yearend' | 'tasks'>('confirmation')
  const [selected, setSelected] = useState<Client | null>(null)
  const [key, setKey] = useState(0) // forces a fresh search after sending

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession)
    })
    return () => listener.subscription.unsubscribe()
  }, [])

  // session === undefined means "still checking"; render nothing briefly
  // rather than flashing the login screen while that check is in flight.
  if (session === undefined) return null
  if (session === null) return <Login />

  return (
    <div className="min-h-screen bg-paper">
      <header className="border-b border-line bg-white">
        <div className="max-w-3xl mx-auto px-6 py-5 flex items-center justify-between">
          <div>
            <h1 className="font-serif text-2xl text-ink">Abacus Client Tasks</h1>
            <p className="text-sm text-slate-650 mt-1">
              {tab === 'confirmation'
                ? 'Find the client, check the details, send the reminder.'
                : tab === 'yearend'
                ? 'Track year end dates, sync with Companies House, and roll cycles forward.'
                : 'Every upcoming deadline, at a glance.'}
            </p>
          </div>
          <button
            onClick={() => supabase.auth.signOut()}
            className="text-sm font-medium text-slate-650 hover:text-accent-dark transition-colors"
          >
            Sign out
          </button>
        </div>
        <div className="max-w-3xl mx-auto px-6 flex gap-1">
          <button
            onClick={() => setTab('confirmation')}
            className={`px-3 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              tab === 'confirmation'
                ? 'border-accent text-accent-dark'
                : 'border-transparent text-slate-650 hover:text-ink'
            }`}
          >
            Confirmation Statements
          </button>
          <button
            onClick={() => setTab('yearend')}
            className={`px-3 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              tab === 'yearend'
                ? 'border-accent text-accent-dark'
                : 'border-transparent text-slate-650 hover:text-ink'
            }`}
          >
            Year End
          </button>
          <button
            onClick={() => setTab('tasks')}
            className={`px-3 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              tab === 'tasks'
                ? 'border-accent text-accent-dark'
                : 'border-transparent text-slate-650 hover:text-ink'
            }`}
          >
            Tasks
          </button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-8">
        {tab === 'confirmation' ? (
          <>
            <ClientSearch key={key} onSelect={(c) => setSelected(c)} />

            {selected && (
              <EmailPreview
                client={selected}
                onSent={() => {
                  setTimeout(() => {
                    setSelected(null)
                    setKey((k) => k + 1)
                  }, 1500)
                }}
              />
            )}
          </>
        ) : tab === 'yearend' ? (
          <YearEndList />
        ) : (
          <TasksList />
        )}
      </main>
    </div>
  )
}
