import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'

interface LogRow {
  id: string
  client_name: string | null
  to_email: string
  subject: string
  kind: string
  sent_at: string
}

const card = 'rounded-md border border-line bg-white p-4'
const inputCls =
  'w-full rounded-md border border-line bg-white px-3 py-2 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-colors'

const KINDS = ['All', 'Confirmation Statement', 'Accounts Pack'] as const
type Kind = (typeof KINDS)[number]

function fmt(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const PAGE_SIZE = 50

export default function EmailLog() {
  const [query, setQuery] = useState('')
  const [kind, setKind] = useState<Kind>('All')
  const [rows, setRows] = useState<LogRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [hasMore, setHasMore] = useState(false)

  useEffect(() => {
    setLoading(true)
    setError('')
    const timeout = setTimeout(async () => {
      let q = supabase
        .from('cs_mailer_email_log')
        .select('id, client_name, to_email, subject, kind, sent_at')
        .order('sent_at', { ascending: false })
        .limit(PAGE_SIZE + 1)

      if (kind !== 'All') q = q.eq('kind', kind)

      const term = query.trim()
      if (term) {
        // Matches whichever of these the term shows up in — client name,
        // recipient address, or the subject line.
        const esc = term.replace(/[%,()]/g, '')
        q = q.or(`client_name.ilike.%${esc}%,to_email.ilike.%${esc}%,subject.ilike.%${esc}%`)
      }

      const { data, error } = await q
      if (error) {
        setError(error.message)
        setRows([])
      } else {
        const list = (data as LogRow[]) ?? []
        setHasMore(list.length > PAGE_SIZE)
        setRows(list.slice(0, PAGE_SIZE))
      }
      setLoading(false)
    }, 250)
    return () => clearTimeout(timeout)
  }, [query, kind])

  return (
    <div className="space-y-4">
      <section className={card}>
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[220px]">
            <label className="block text-xs font-medium text-slate-650 mb-1">Search</label>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Client name, email address, or subject…"
              className={inputCls}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-650 mb-1">Type</label>
            <select value={kind} onChange={(e) => setKind(e.target.value as Kind)} className={inputCls}>
              {KINDS.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      <section className={card}>
        {error && <p className="text-sm text-warn">Could not load the sent log: {error}</p>}

        {!error && !loading && rows.length === 0 && (
          <p className="text-sm text-slate-650">
            {query.trim() || kind !== 'All' ? 'No emails match that search.' : 'No emails sent yet.'}
          </p>
        )}

        {rows.length > 0 && (
          <>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs font-medium text-slate-650 border-b border-line">
                  <th className="pb-2 pr-3">Sent</th>
                  <th className="pb-2 pr-3">Client</th>
                  <th className="pb-2 pr-3">To</th>
                  <th className="pb-2 pr-3">Subject</th>
                  <th className="pb-2">Type</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="py-2 pr-3 whitespace-nowrap text-ink">{fmt(r.sent_at)}</td>
                    <td className="py-2 pr-3 text-ink">{r.client_name || '—'}</td>
                    <td className="py-2 pr-3 text-slate-650 break-all">{r.to_email}</td>
                    <td className="py-2 pr-3 text-slate-650">{r.subject}</td>
                    <td className="py-2 whitespace-nowrap">
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full ${
                          r.kind === 'Accounts Pack' ? 'bg-accent-light text-accent-dark' : 'bg-warnbg text-warn'
                        }`}
                      >
                        {r.kind}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {hasMore && (
              <p className="text-xs text-slate-650 mt-3">
                Showing the most recent {PAGE_SIZE}. Narrow your search to find an older one.
              </p>
            )}
          </>
        )}
      </section>
    </div>
  )
}
