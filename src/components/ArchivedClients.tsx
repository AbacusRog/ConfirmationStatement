import { useEffect, useState } from 'react'
import { supabase, Client } from '../supabaseClient'

// Shows every archived client (hidden from the Confirmation Statements,
// Year End and Tasks views) so you can find one and bring it back if it
// was archived by mistake, or just confirm what's sitting in the archive.
export default function ArchivedClients({ onClose }: { onClose: () => void }) {
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [restoringId, setRestoringId] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    setError('')
    const { data, error: loadError } = await supabase
      .from('cs_mailer_clients')
      .select('*')
      .eq('archived', true)
      .order('archived_at', { ascending: false })
    if (loadError) {
      setError(loadError.message)
    } else {
      setClients((data as Client[]) ?? [])
    }
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  async function handleRestore(client: Client) {
    setRestoringId(client.id)
    const { error: updateError } = await supabase
      .from('cs_mailer_clients')
      .update({ archived: false, archived_at: null, archived_reason: null })
      .eq('id', client.id)
    if (!updateError) {
      setClients((prev) => prev.filter((c) => c.id !== client.id))
    }
    setRestoringId(null)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4">
      <div className="w-full max-w-lg rounded-lg bg-white p-6 shadow-xl max-h-[85vh] flex flex-col">
        <h2 className="font-serif text-lg text-ink mb-3">Archived clients</h2>

        <div className="flex-1 overflow-y-auto -mx-6 px-6">
          {loading && <div className="text-sm text-slate-650 py-3">Loading…</div>}
          {error && <div className="text-sm text-warn py-3">{error}</div>}
          {!loading && !error && clients.length === 0 && (
            <div className="text-sm text-slate-650 py-6 text-center">
              No archived clients — anything you archive will show up here.
            </div>
          )}
          {!loading &&
            clients.map((c) => (
              <div
                key={c.id}
                className="flex items-center justify-between border-b border-line last:border-0 py-2.5"
              >
                <div className="min-w-0">
                  <div className="text-[15px] text-ink truncate">{c.client_name}</div>
                  <div className="text-xs text-slate-650 mt-0.5">
                    {c.company_number ? `No. ${c.company_number} · ` : ''}
                    {c.archived_reason || 'Archived'}
                    {c.archived_at
                      ? ` on ${new Date(c.archived_at).toLocaleDateString('en-GB')}`
                      : ''}
                  </div>
                </div>
                <button
                  onClick={() => handleRestore(c)}
                  disabled={restoringId === c.id}
                  className="shrink-0 ml-3 text-xs font-medium text-accent hover:text-accent-dark disabled:opacity-40 transition-colors"
                >
                  Restore
                </button>
              </div>
            ))}
        </div>

        <div className="mt-4 flex justify-end">
          <button
            onClick={onClose}
            className="rounded-md px-4 py-2 text-sm font-medium text-slate-650 hover:bg-paper transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
