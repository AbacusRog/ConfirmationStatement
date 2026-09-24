import { useEffect, useState } from 'react'
import { supabase, Client } from '../supabaseClient'

function formatDate(dateStr: string | null) {
  if (!dateStr) return '—'
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

function urgency(dueDateStr: string | null): 'red' | 'amber' | 'green' | 'grey' {
  if (!dueDateStr) return 'grey'
  const due = new Date(dueDateStr + 'T00:00:00')
  const now = new Date()
  const oneMonth = new Date(now)
  oneMonth.setMonth(oneMonth.getMonth() + 1)
  const twoMonths = new Date(now)
  twoMonths.setMonth(twoMonths.getMonth() + 2)
  if (due <= oneMonth) return 'red'
  if (due <= twoMonths) return 'amber'
  return 'green'
}

const dotColor: Record<string, string> = {
  red: 'bg-red-500',
  amber: 'bg-warn',
  green: 'bg-accent',
  grey: 'bg-line',
}

type Task = {
  clientId: string
  clientName: string
  companyNumber: string | null
  kind: 'Confirmation statement' | 'Accounts'
  dueDate: string
  directorNames: string[]
}

// A dense, at-a-glance list of every outstanding deadline across both
// confirmation statements and annual accounts — just the company, its
// number, and when it's due — for a quick scan of what's coming up
// without opening either of the fuller tabs. Archived clients never
// appear here, and a client with no date on file for either kind simply
// contributes no rows.
export default function TasksList() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [kindFilter, setKindFilter] = useState<'all' | 'Confirmation statement' | 'Accounts'>(
    'all'
  )

  useEffect(() => {
    async function load() {
      setLoading(true)
      setError('')
      const { data, error: loadError } = await supabase
        .from('cs_mailer_clients')
        .select('*')
        .eq('archived', false)
        .eq('client_kind', 'company')
      if (loadError) {
        setError(loadError.message)
        setLoading(false)
        return
      }

      // Pull in active directors so a search can match on director name too
      // ("who's on the board of X" in reverse — find every company a named
      // director sits on). Resigned directors are excluded, matching the
      // Documents tab's default director checklist.
      const { data: directorRows, error: directorError } = await supabase
        .from('cs_mailer_directors')
        .select('company_number, full_name')
        .is('resigned_on', null)
      if (directorError) {
        setError(directorError.message)
        setLoading(false)
        return
      }
      const directorsByCompany = new Map<string, string[]>()
      for (const d of directorRows ?? []) {
        const key = d.company_number
        if (!key) continue
        const list = directorsByCompany.get(key) ?? []
        list.push(d.full_name)
        directorsByCompany.set(key, list)
      }

      const clients = (data as Client[]) ?? []
      const rows: Task[] = []
      for (const c of clients) {
        const directorNames = c.company_number
          ? directorsByCompany.get(c.company_number) ?? []
          : []
        if (c.due_date) {
          rows.push({
            clientId: c.id,
            clientName: c.client_name,
            companyNumber: c.company_number,
            kind: 'Confirmation statement',
            dueDate: c.due_date,
            directorNames,
          })
        }
        if (c.accounts_due_date) {
          rows.push({
            clientId: c.id,
            clientName: c.client_name,
            companyNumber: c.company_number,
            kind: 'Accounts',
            dueDate: c.accounts_due_date,
            directorNames,
          })
        }
      }
      rows.sort((a, b) => a.dueDate.localeCompare(b.dueDate))
      setTasks(rows)
      setLoading(false)
    }
    load()
  }, [])

  const filtered = tasks
    .filter((t) => kindFilter === 'all' || t.kind === kindFilter)
    .filter((t) => {
      const q = query.trim().toLowerCase()
      if (!q) return true
      if (t.clientName.toLowerCase().includes(q)) return true
      return t.directorNames.some((name) => name.toLowerCase().includes(q))
    })

  const filterOptions: { value: 'all' | 'Confirmation statement' | 'Accounts'; label: string }[] = [
    { value: 'all', label: 'All' },
    { value: 'Confirmation statement', label: 'Confirmation statements' },
    { value: 'Accounts', label: 'Accounts' },
  ]

  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter by company name or director…"
          className="flex-1 rounded-md border border-line bg-white px-3.5 py-2.5 text-[15px] outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-colors"
        />
        <div className="flex shrink-0 rounded-md border border-line bg-white p-0.5">
          {filterOptions.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setKindFilter(opt.value)}
              className={`px-3 py-1.5 text-sm font-medium rounded-[5px] transition-colors ${
                kindFilter === opt.value
                  ? 'bg-accent text-white'
                  : 'text-slate-650 hover:text-ink'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {loading && <div className="text-sm text-slate-650">Loading tasks…</div>}
      {error && <div className="text-sm text-warn mb-3">Couldn't load tasks: {error}</div>}

      {!loading && !error && (
        <div className="rounded-md border border-line bg-white overflow-hidden">
          {filtered.length === 0 && (
            <div className="text-sm text-slate-650 py-6 text-center">
              No upcoming tasks on file.
            </div>
          )}
          {filtered.map((t, i) => {
            const u = urgency(t.dueDate)
            const q = query.trim().toLowerCase()
            const matchedByDirector =
              q &&
              !t.clientName.toLowerCase().includes(q) &&
              t.directorNames.some((name) => name.toLowerCase().includes(q))
            return (
              <div
                key={`${t.clientId}-${t.kind}`}
                className={`flex items-center gap-3 px-4 py-2.5 text-sm ${
                  i > 0 ? 'border-t border-line' : ''
                }`}
              >
                <span className={`h-2 w-2 shrink-0 rounded-full ${dotColor[u]}`} />
                <div className="flex-1 min-w-0 truncate">
                  <div className="truncate text-ink">{t.clientName}</div>
                  {matchedByDirector && (
                    <div className="truncate text-xs text-slate-650">
                      Director: {t.directorNames.join(', ')}
                    </div>
                  )}
                </div>
                <div className="w-28 shrink-0 text-slate-650 text-xs">
                  {t.companyNumber || '—'}
                </div>
                <div className="w-32 shrink-0 text-slate-650 text-xs">{t.kind}</div>
                <div className="w-28 shrink-0 text-right text-ink font-medium">
                  {formatDate(t.dueDate)}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
