import { useEffect, useRef, useState } from 'react'
import { supabase, Client } from '../supabaseClient'
import ClientForm from './ClientForm'
import NewClientFromCH from './NewClientFromCH'
import ArchivedClients from './ArchivedClients'

export default function ClientSearch({
  onSelect,
}: {
  onSelect: (client: Client) => void
}) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Client[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [searchError, setSearchError] = useState('')
  const [form, setForm] = useState<
    { mode: 'add'; initial: Partial<Client> } | { mode: 'edit'; initial: Client } | null
  >(null)
  const [addingFromCH, setAddingFromCH] = useState(false)
  const [showArchived, setShowArchived] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([])
      setSearchError('')
      return
    }
    setLoading(true)
    setSearchError('')
    const timeout = setTimeout(async () => {
      const { data, error } = await supabase
        .from('cs_mailer_clients')
        .select('*')
        .eq('archived', false)
        .ilike('client_name', `%${query.trim()}%`)
        .order('client_name')
        .limit(20)
      if (error) {
        setSearchError(error.message)
        setResults([])
      } else {
        setResults((data as Client[]) ?? [])
      }
      setLoading(false)
    }, 250)
    return () => clearTimeout(timeout)
  }, [query])

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <div ref={boxRef} className="relative w-full">
      <div className="flex items-end justify-between gap-3 mb-1.5">
        <label className="block text-sm font-medium text-slate-650">
          Find the client company
        </label>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowArchived(true)}
            className="text-sm font-medium text-slate-650 hover:text-accent-dark transition-colors"
          >
            Archived clients
          </button>
          <button
            onClick={() => setAddingFromCH(true)}
            className="text-sm font-medium text-accent hover:text-accent-dark transition-colors"
          >
            + From Companies House
          </button>
          <button
            onClick={() => setForm({ mode: 'add', initial: {} })}
            className="text-sm font-medium text-accent hover:text-accent-dark transition-colors"
          >
            + New client
          </button>
        </div>
      </div>
      <input
        type="text"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        placeholder="Start typing a company name…"
        className="w-full rounded-md border border-line bg-white px-3.5 py-2.5 text-[15px] outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-colors"
        autoComplete="off"
      />
      {open && query.trim().length >= 2 && (
        <div className="absolute z-10 mt-1 w-full max-h-80 overflow-auto rounded-md border border-line bg-white shadow-lg">
          {loading && (
            <div className="px-3.5 py-3 text-sm text-slate-650">Searching…</div>
          )}
          {!loading && searchError && (
            <div className="px-3.5 py-3 text-sm text-warn">
              Couldn't reach the client list: {searchError}
            </div>
          )}
          {!loading && !searchError && results.length === 0 && (
            <div className="px-3.5 py-3">
              <div className="text-sm text-slate-650 mb-2">
                No match for "{query}".
              </div>
              <button
                onClick={() => {
                  setForm({ mode: 'add', initial: { client_name: query } })
                  setOpen(false)
                }}
                className="text-sm font-medium text-accent hover:text-accent-dark transition-colors"
              >
                + Add "{query}" as a new client
              </button>
            </div>
          )}
          {!loading &&
            results.map((c) => (
              <div
                key={c.id}
                className="flex items-center justify-between border-b border-line last:border-0 hover:bg-accent-light transition-colors"
              >
                <button
                  onClick={() => {
                    onSelect(c)
                    setQuery(c.client_name)
                    setOpen(false)
                  }}
                  className="flex-1 text-left px-3.5 py-2.5"
                >
                  <div className="text-[15px] text-ink">{c.client_name}</div>
                  <div className="text-xs text-slate-650 mt-0.5">
                    {c.email || 'No email on file'}
                    {c.client_code ? ` · ${c.client_code}` : ''}
                  </div>
                </button>
                <button
                  onClick={() => {
                    setForm({ mode: 'edit', initial: c })
                    setOpen(false)
                  }}
                  className="px-3 text-xs font-medium text-slate-650 hover:text-accent-dark transition-colors"
                  title="Edit client details"
                >
                  Edit
                </button>
              </div>
            ))}
        </div>
      )}

      {form && (
        <ClientForm
          mode={form.mode}
          initial={form.initial}
          onCancel={() => setForm(null)}
          onSaved={(client) => {
            setForm(null)
            onSelect(client)
            setQuery(client.client_name)
          }}
          onArchived={() => {
            setForm(null)
            setResults((prev) => prev.filter((c) => c.id !== (form as { initial: Client }).initial.id))
            setQuery('')
          }}
        />
      )}

      {addingFromCH && (
        <NewClientFromCH
          onCancel={() => setAddingFromCH(false)}
          onCreated={(client) => {
            setAddingFromCH(false)
            setForm({ mode: 'edit', initial: client })
          }}
        />
      )}

      {showArchived && <ArchivedClients onClose={() => setShowArchived(false)} />}
    </div>
  )
}
