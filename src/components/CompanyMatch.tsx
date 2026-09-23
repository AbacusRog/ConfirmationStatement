import { useEffect, useState } from 'react'

type ChResult = {
  company_number: string
  title: string
  company_status: string
  date_of_creation: string | null
  address_snippet: string | null
}

export default function CompanyMatch({
  initialQuery,
  onSelect,
  onSelectFull,
  onCancel,
}: {
  initialQuery: string
  onSelect: (companyNumber: string) => void
  onSelectFull?: (companyNumber: string, title: string) => void
  onCancel: () => void
}) {
  const [query, setQuery] = useState(initialQuery)
  const [results, setResults] = useState<ChResult[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [searched, setSearched] = useState(false)

  async function runSearch() {
    if (query.trim().length < 2) return
    setLoading(true)
    setError('')
    setSearched(true)
    try {
      const res = await fetch(`/api/ch-search?q=${encodeURIComponent(query.trim())}`)
      if (!res.ok) throw new Error(await res.text())
      const data = await res.json()
      setResults(data.items || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed')
      setResults([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    runSearch()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4">
      <div className="w-full max-w-lg rounded-lg bg-white p-6 shadow-xl max-h-[85vh] flex flex-col">
        <h2 className="font-serif text-lg text-ink mb-3">Find on Companies House</h2>

        <div className="flex gap-2 mb-3">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && runSearch()}
            autoFocus
            className="flex-1 rounded-md border border-line px-3 py-2 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-colors"
          />
          <button
            onClick={runSearch}
            className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-dark transition-colors"
          >
            Search
          </button>
        </div>

        <div className="flex-1 overflow-y-auto -mx-6 px-6">
          {loading && <div className="text-sm text-slate-650 py-3">Searching…</div>}
          {!loading && error && <div className="text-sm text-warn py-3">{error}</div>}
          {!loading && !error && searched && results.length === 0 && (
            <div className="text-sm text-slate-650 py-3">
              No matches. Try a shorter or different spelling of the company name.
            </div>
          )}
          {!loading &&
            results.map((r) => (
              <button
                key={r.company_number}
                onClick={() =>
                  onSelectFull ? onSelectFull(r.company_number, r.title) : onSelect(r.company_number)
                }
                className="w-full text-left px-3 py-2.5 rounded-md hover:bg-accent-light transition-colors border-b border-line last:border-0"
              >
                <div className="text-[15px] text-ink">{r.title}</div>
                <div className="text-xs text-slate-650 mt-0.5">
                  No. {r.company_number} · {r.company_status}
                  {r.address_snippet ? ` · ${r.address_snippet}` : ''}
                </div>
              </button>
            ))}
        </div>

        <div className="mt-4 flex justify-end">
          <button
            onClick={onCancel}
            className="rounded-md px-4 py-2 text-sm font-medium text-slate-650 hover:bg-paper transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
