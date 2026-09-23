import { useEffect, useState } from 'react'
import { supabase, Client } from '../supabaseClient'
import CompanyMatch from './CompanyMatch'
import ArchivedClients from './ArchivedClients'
import DirectorsPanel from './DirectorsPanel'

function formatDate(dateStr: string | null) {
  if (!dateStr) return '—'
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

function addYears(dateStr: string, years: number) {
  const d = new Date(dateStr + 'T00:00:00')
  d.setFullYear(d.getFullYear() + years)
  return d.toISOString().slice(0, 10)
}

// red = due within 1 month, amber = due within 2 months, green = beyond
// that, grey = no year end date on file at all — same convention as the
// company register and the confirmation statement mailer.
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

type SyncResult = {
  companyName: string | null
  companyStatus: string | null
  nextYearEndDate: string | null
  chAccountsNextDue: string | null
  lastAccountsFiledDate: string | null
  lastAccountsType: string | null
  confirmationStatementNextDue: string | null
  confirmationStatementNextMadeUpTo: string | null
  confirmationStatementLastMadeUpTo: string | null
}

export default function YearEndList() {
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [query, setQuery] = useState('')
  const [matchingClientId, setMatchingClientId] = useState<string | null>(null)
  const [syncingId, setSyncingId] = useState<string | null>(null)
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null)
  const [syncError, setSyncError] = useState('')
  const [editingYearEnd, setEditingYearEnd] = useState<string | null>(null)
  const [showArchived, setShowArchived] = useState(false)
  const [directorsOpenId, setDirectorsOpenId] = useState<string | null>(null)
  const [checkingAll, setCheckingAll] = useState(false)
  const [checkAllProgress, setCheckAllProgress] = useState<{ done: number; total: number } | null>(
    null
  )
  const [checkAllSummary, setCheckAllSummary] = useState<{
    archived: string[]
    flagged: { name: string; status: string }[]
    statementsUpdated: number
    accountsRolled: string[]
  } | null>(null)
  const [undoBanner, setUndoBanner] = useState<{
    clientId: string
    clientName: string
    previousYearEndDate: string | null
    previousLastFiled: string | null
    historyId: string
  } | null>(null)

  async function loadClients() {
    setLoading(true)
    setLoadError('')
    const { data, error } = await supabase
      .from('cs_mailer_clients')
      .select('*')
      .eq('archived', false)
      .eq('client_kind', 'company')
      .order('accounts_due_date', { ascending: true, nullsFirst: false })
      .order('client_name', { ascending: true })
    if (error) {
      setLoadError(error.message)
    } else {
      setClients((data as Client[]) ?? [])
    }
    setLoading(false)
  }

  useEffect(() => {
    loadClients()
  }, [])

  const filtered = query.trim()
    ? clients.filter((c) => c.client_name.toLowerCase().includes(query.trim().toLowerCase()))
    : clients

  async function saveField(id: string, updates: Partial<Client>) {
    const { data, error } = await supabase
      .from('cs_mailer_clients')
      .update(updates)
      .eq('id', id)
      .select()
      .single()
    if (!error && data) {
      setClients((prev) => prev.map((c) => (c.id === id ? (data as Client) : c)))
    }
    return error
  }

  async function handleSync(client: Client) {
    if (!client.company_number) return
    setSyncingId(client.id)
    setSyncError('')
    setSyncResult(null)
    try {
      const res = await fetch('/api/ch-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyNumber: client.company_number }),
      })
      if (!res.ok) throw new Error(await res.text())
      const data: SyncResult = await res.json()
      setSyncResult(data)
    } catch (err) {
      setSyncError(err instanceof Error ? err.message : 'Sync failed')
    }
  }

  async function applySync(client: Client, result: SyncResult) {
    await saveField(client.id, {
      year_end_date: result.nextYearEndDate || client.year_end_date,
      accounts_last_filed_ch: result.lastAccountsFiledDate || client.accounts_last_filed_ch,
      accounts_last_synced_at: new Date().toISOString(),
    })
    setSyncingId(null)
    setSyncResult(null)
  }

  async function handleLinkCompany(client: Client, companyNumber: string) {
    await saveField(client.id, { company_number: companyNumber })
    setMatchingClientId(null)
    // Immediately offer a sync review now that we have a number
    const updated = clients.find((c) => c.id === client.id)
    handleSync({ ...(updated || client), company_number: companyNumber })
  }

  async function handleMarkCompleted(client: Client) {
    if (!client.year_end_date) return
    const previousYearEnd = client.year_end_date
    const previousLastFiled = client.accounts_last_filed_ch
    const accountsDue = client.accounts_due_date

    const { data: historyRow, error: historyError } = await supabase
      .from('cs_mailer_year_end_history')
      .insert({
        client_id: client.id,
        year_end_date: previousYearEnd,
        accounts_due_date: accountsDue,
      })
      .select()
      .single()

    if (historyError) {
      setLoadError(historyError.message)
      return
    }

    const nextYearEnd = addYears(previousYearEnd, 1)
    await saveField(client.id, {
      year_end_date: nextYearEnd,
      accounts_last_filed_ch: previousYearEnd,
      year_end_completed_at: null,
    })

    setUndoBanner({
      clientId: client.id,
      clientName: client.client_name,
      previousYearEndDate: previousYearEnd,
      previousLastFiled: previousLastFiled,
      historyId: historyRow.id,
    })
  }

  // Loops every client with a company number through Companies House in
  // one pass and does three things at once:
  //  - auto-archives any company reported as exactly "dissolved" (the one
  //    status that unambiguously means there's nothing left to file for —
  //    anything else unusual like liquidation, administration or
  //    receivership is only flagged for you to look at, since those can
  //    still carry live filing obligations)
  //  - auto-updates the confirmation statement date from Companies
  //    House's own "next made up to" date, so a statement you've already
  //    filed (perhaps outside this app) stops showing as due
  //  - records the latest company status either way
  async function handleCheckAll() {
    setCheckingAll(true)
    setCheckAllSummary(null)
    const withNumbers = clients.filter((c) => c.company_number)
    setCheckAllProgress({ done: 0, total: withNumbers.length })
    const archivedNames: string[] = []
    const flagged: { name: string; status: string }[] = []
    const accountsRolled: string[] = []
    let statementsUpdated = 0

    for (const client of withNumbers) {
      try {
        const res = await fetch('/api/ch-sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ companyNumber: client.company_number }),
        })
        if (res.ok) {
          const data: SyncResult = await res.json()
          const status = (data.companyStatus || '').toLowerCase()

          if (status === 'dissolved') {
            await supabase
              .from('cs_mailer_clients')
              .update({
                archived: true,
                archived_at: new Date().toISOString(),
                archived_reason: 'dissolved',
                company_status: status,
                accounts_last_synced_at: new Date().toISOString(),
              })
              .eq('id', client.id)
            archivedNames.push(client.client_name)
          } else {
            const updates: Partial<Client> = {
              accounts_last_synced_at: new Date().toISOString(),
            }
            if (status) updates.company_status = status
            if (
              data.confirmationStatementNextMadeUpTo &&
              data.confirmationStatementNextMadeUpTo !== client.confirmation_statement_date
            ) {
              updates.confirmation_statement_date = data.confirmationStatementNextMadeUpTo
              statementsUpdated++
            }

            // Accounts filed for the current cycle: Companies House's last
            // filed date has caught up to (or passed) the year end we have
            // on file. Log it the same way "Mark completed" does, and roll
            // the year end forward automatically so it drops off as due.
            if (
              client.year_end_date &&
              data.lastAccountsFiledDate &&
              data.lastAccountsFiledDate >= client.year_end_date &&
              data.lastAccountsFiledDate !== client.accounts_last_filed_ch
            ) {
              await supabase.from('cs_mailer_year_end_history').insert({
                client_id: client.id,
                year_end_date: client.year_end_date,
                accounts_due_date: client.accounts_due_date,
              })
              updates.year_end_date =
                data.nextYearEndDate || addYears(client.year_end_date, 1)
              updates.accounts_last_filed_ch = data.lastAccountsFiledDate
              updates.year_end_completed_at = null
              accountsRolled.push(client.client_name)
            }

            await supabase.from('cs_mailer_clients').update(updates).eq('id', client.id)

            if (status && status !== 'active') {
              flagged.push({ name: client.client_name, status })
            }
          }
        }
      } catch {
        // one client's check failing shouldn't stop the rest of the sweep
      }
      setCheckAllProgress((prev) => (prev ? { ...prev, done: prev.done + 1 } : prev))
    }

    setCheckAllSummary({ archived: archivedNames, flagged, statementsUpdated, accountsRolled })
    setCheckingAll(false)
    setCheckAllProgress(null)
    loadClients()
  }

  async function handleUndo() {
    if (!undoBanner) return
    await saveField(undoBanner.clientId, {
      year_end_date: undoBanner.previousYearEndDate,
      accounts_last_filed_ch: undoBanner.previousLastFiled,
    })
    await supabase.from('cs_mailer_year_end_history').delete().eq('id', undoBanner.historyId)
    setUndoBanner(null)
  }

  return (
    <div>
      {undoBanner && (
        <div className="mb-4 flex items-center justify-between rounded-md border border-accent/30 bg-accent-light px-4 py-2.5">
          <span className="text-sm text-accent-dark">
            Marked <strong>{undoBanner.clientName}</strong>'s year end as complete, and rolled it
            forward to next year.
          </span>
          <button
            onClick={handleUndo}
            className="text-sm font-medium text-accent-dark hover:underline"
          >
            Undo
          </button>
        </div>
      )}

      {checkAllSummary && (
        <div className="mb-4 rounded-md border border-accent/30 bg-accent-light px-4 py-3 text-sm">
          <div className="flex items-start justify-between gap-3">
            <div className="text-accent-dark space-y-1">
              {checkAllSummary.archived.length === 0 &&
                checkAllSummary.flagged.length === 0 &&
                checkAllSummary.statementsUpdated === 0 &&
                checkAllSummary.accountsRolled.length === 0 && (
                  <div>No changes — everything checked is up to date.</div>
                )}
              {checkAllSummary.statementsUpdated > 0 && (
                <div>
                  Updated the confirmation statement date for{' '}
                  <strong>{checkAllSummary.statementsUpdated}</strong>{' '}
                  {checkAllSummary.statementsUpdated === 1 ? 'client' : 'clients'} from Companies
                  House.
                </div>
              )}
              {checkAllSummary.accountsRolled.length > 0 && (
                <div>
                  Accounts already filed — rolled to next year:{' '}
                  <strong>{checkAllSummary.accountsRolled.join(', ')}</strong>
                </div>
              )}
              {checkAllSummary.archived.length > 0 && (
                <div>
                  Archived as dissolved: <strong>{checkAllSummary.archived.join(', ')}</strong>
                </div>
              )}
              {checkAllSummary.flagged.length > 0 && (
                <div>
                  Worth a look (not auto-archived):{' '}
                  <strong>
                    {checkAllSummary.flagged.map((f) => `${f.name} (${f.status})`).join(', ')}
                  </strong>
                </div>
              )}
            </div>
            <button
              onClick={() => setCheckAllSummary(null)}
              className="shrink-0 text-xs font-medium text-accent-dark hover:underline"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      <div className="flex items-center gap-3 mb-4">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter by company name…"
          className="flex-1 rounded-md border border-line bg-white px-3.5 py-2.5 text-[15px] outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-colors"
        />
        <button
          onClick={handleCheckAll}
          disabled={checkingAll}
          className="shrink-0 text-sm font-medium text-accent hover:text-accent-dark disabled:opacity-40 transition-colors"
        >
          {checkingAll
            ? checkAllProgress
              ? `Checking… (${checkAllProgress.done}/${checkAllProgress.total})`
              : 'Checking…'
            : 'Check all against Companies House'}
        </button>
        <button
          onClick={() => setShowArchived(true)}
          className="shrink-0 text-sm font-medium text-slate-650 hover:text-accent-dark transition-colors"
        >
          Archived clients
        </button>
      </div>

      {loading && <div className="text-sm text-slate-650">Loading clients…</div>}
      {loadError && <div className="text-sm text-warn mb-3">Couldn't load clients: {loadError}</div>}

      {!loading && (
        <div className="space-y-2">
          {filtered.length === 0 && (
            <div className="text-sm text-slate-650 py-6 text-center">No clients match.</div>
          )}
          {filtered.map((client) => {
            const u = urgency(client.accounts_due_date)
            const isSyncingThis = syncingId === client.id

            return (
              <div key={client.id} className="rounded-md border border-line bg-white p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0">
                    <span
                      className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${dotColor[u]}`}
                      title={
                        u === 'grey'
                          ? 'No year end date on file'
                          : u === 'red'
                          ? 'Due within a month'
                          : u === 'amber'
                          ? 'Due within two months'
                          : 'Not due soon'
                      }
                    />
                    <div className="min-w-0">
                      <div className="font-serif text-base text-ink truncate">
                        {client.client_name}
                      </div>
                      <div className="text-xs text-slate-650 mt-0.5">
                        {client.company_number ? (
                          <>No. {client.company_number}</>
                        ) : (
                          <button
                            onClick={() => setMatchingClientId(client.id)}
                            className="text-accent hover:text-accent-dark font-medium"
                          >
                            Not linked — find on Companies House
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {client.company_number && (
                      <button
                        onClick={() => handleSync(client)}
                        disabled={isSyncingThis}
                        className="text-xs font-medium text-accent hover:text-accent-dark disabled:opacity-40 transition-colors"
                      >
                        Sync
                      </button>
                    )}
                    <button
                      onClick={() => setMatchingClientId(client.id)}
                      className="text-xs font-medium text-slate-650 hover:text-accent-dark transition-colors"
                    >
                      {client.company_number ? 'Re-link' : 'Link'}
                    </button>
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-3 gap-3 text-sm">
                  <div>
                    <div className="text-xs text-slate-650 mb-1">Year end</div>
                    {editingYearEnd === client.id ? (
                      <input
                        type="date"
                        autoFocus
                        defaultValue={client.year_end_date ?? ''}
                        onBlur={async (e) => {
                          await saveField(client.id, { year_end_date: e.target.value || null })
                          setEditingYearEnd(null)
                        }}
                        className="rounded-md border border-line px-2 py-1 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent"
                      />
                    ) : (
                      <button
                        onClick={() => setEditingYearEnd(client.id)}
                        className="text-ink hover:text-accent-dark transition-colors"
                      >
                        {formatDate(client.year_end_date)}
                      </button>
                    )}
                  </div>
                  <div>
                    <div className="text-xs text-slate-650 mb-1">Accounts due</div>
                    <div className="text-ink">{formatDate(client.accounts_due_date)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-650 mb-1">CH last filed</div>
                    <div className="text-ink">{formatDate(client.accounts_last_filed_ch)}</div>
                  </div>
                </div>

                {isSyncingThis && (
                  <div className="mt-3 rounded-md border border-accent/30 bg-accent-light p-3">
                    {!syncResult && !syncError && (
                      <div className="text-sm text-slate-650">Checking Companies House…</div>
                    )}
                    {syncError && (
                      <div className="text-sm text-warn">
                        {syncError}
                        <button
                          onClick={() => setSyncingId(null)}
                          className="ml-3 text-xs font-medium text-accent-dark hover:underline"
                        >
                          Dismiss
                        </button>
                      </div>
                    )}
                    {syncResult && (
                      <div className="text-sm">
                        <div className="text-ink mb-2">
                          Companies House reports{' '}
                          <strong>{syncResult.companyName || client.client_name}</strong> (
                          {syncResult.companyStatus}):
                        </div>
                        <ul className="space-y-1 text-ink mb-3">
                          <li>
                            Next year end:{' '}
                            <strong>{formatDate(syncResult.nextYearEndDate)}</strong>
                            {client.year_end_date &&
                              syncResult.nextYearEndDate &&
                              client.year_end_date !== syncResult.nextYearEndDate && (
                                <span className="text-warn">
                                  {' '}
                                  (you have {formatDate(client.year_end_date)})
                                </span>
                              )}
                          </li>
                          <li>
                            CH's own accounts due date:{' '}
                            <strong>{formatDate(syncResult.chAccountsNextDue)}</strong>
                            {client.accounts_due_date &&
                              syncResult.chAccountsNextDue &&
                              client.accounts_due_date !== syncResult.chAccountsNextDue && (
                                <span className="text-warn">
                                  {' '}
                                  (differs from our 9-months calculation of{' '}
                                  {formatDate(client.accounts_due_date)} — this can happen for
                                  first-year accounts)
                                </span>
                              )}
                          </li>
                          <li>
                            Last accounts filed:{' '}
                            <strong>{formatDate(syncResult.lastAccountsFiledDate)}</strong>
                          </li>
                        </ul>
                        <div className="flex items-center gap-3">
                          <button
                            onClick={() => applySync(client, syncResult)}
                            className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-dark transition-colors"
                          >
                            Apply to this client
                          </button>
                          <button
                            onClick={() => {
                              setSyncingId(null)
                              setSyncResult(null)
                            }}
                            className="text-xs font-medium text-slate-650 hover:text-accent-dark transition-colors"
                          >
                            Dismiss
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                <div className="mt-3 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="text-xs text-slate-650">
                      {client.accounts_last_synced_at
                        ? `Last synced ${new Date(client.accounts_last_synced_at).toLocaleDateString('en-GB')}`
                        : 'Never synced'}
                    </div>
                    {client.company_number && (
                      <button
                        onClick={() =>
                          setDirectorsOpenId(directorsOpenId === client.id ? null : client.id)
                        }
                        className="text-xs font-medium text-slate-650 hover:text-accent-dark transition-colors"
                      >
                        {directorsOpenId === client.id ? 'Hide directors' : 'Directors'}
                      </button>
                    )}
                  </div>
                  <button
                    onClick={() => handleMarkCompleted(client)}
                    disabled={!client.year_end_date}
                    className="text-xs font-medium text-accent hover:text-accent-dark disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  >
                    Mark completed → roll to next year
                  </button>
                </div>

                {directorsOpenId === client.id && client.company_number && (
                  <DirectorsPanel clientId={client.id} companyNumber={client.company_number} />
                )}
              </div>
            )
          })}
        </div>
      )}

      {matchingClientId && (
        <CompanyMatch
          initialQuery={clients.find((c) => c.id === matchingClientId)?.client_name ?? ''}
          onCancel={() => setMatchingClientId(null)}
          onSelect={(companyNumber) => {
            const client = clients.find((c) => c.id === matchingClientId)
            if (client) handleLinkCompany(client, companyNumber)
          }}
        />
      )}

      {showArchived && <ArchivedClients onClose={() => setShowArchived(false)} />}
    </div>
  )
}
