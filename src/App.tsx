import { useState } from 'react'
import ClientSearch from './components/ClientSearch'
import EmailPreview from './components/EmailPreview'
import { Client } from './supabaseClient'

export default function App() {
  const [selected, setSelected] = useState<Client | null>(null)
  const [key, setKey] = useState(0) // forces a fresh search after sending

  return (
    <div className="min-h-screen bg-paper">
      <header className="border-b border-line bg-white">
        <div className="max-w-2xl mx-auto px-6 py-5">
          <h1 className="font-serif text-2xl text-ink">Confirmation Statement Mailer</h1>
          <p className="text-sm text-slate-650 mt-1">
            Find the client, check the details, send the reminder.
          </p>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-6 py-8">
        <ClientSearch
          key={key}
          onSelect={(c) => setSelected(c)}
        />

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
      </main>
    </div>
  )
}
