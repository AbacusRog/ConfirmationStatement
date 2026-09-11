import { useEffect, useRef, useState } from 'react'
import { supabase, Client } from '../supabaseClient'

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
      <label className="block text-sm font-medium text-slate-650 mb-1.5">
        Find the client company
      </label>
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
            <div className="px-3.5 py-3 text-sm text-slate-650">
              No match for "{query}". Check the spelling, or add this client
              in Supabase if they're new.
            </div>
          )}
          {!loading &&
            results.map((c) => (
              <button
                key={c.id}
                onClick={() => {
                  onSelect(c)
                  setQuery(c.client_name)
                  setOpen(false)
                }}
                className="w-full text-left px-3.5 py-2.5 hover:bg-accent-light transition-colors border-b border-line last:border-0"
              >
                <div className="text-[15px] text-ink">{c.client_name}</div>
                <div className="text-xs text-slate-650 mt-0.5">
                  {c.email || 'No email on file'}
                  {c.client_code ? ` · ${c.client_code}` : ''}
                </div>
              </button>
            ))}
        </div>
      )}
    </div>
  )
}
