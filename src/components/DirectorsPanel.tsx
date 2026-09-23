import { useEffect, useState } from 'react'
import { supabase, Director } from '../supabaseClient'

function formatDate(dateStr: string | null) {
  if (!dateStr) return '—'
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

// Shows this company's directors (and other officers) as held in
// cs_mailer_directors, with a button to pull the current list from
// Companies House. Keyed on company_number rather than client_id, so this
// data is ready to be reused by any other app in the same Supabase
// project that knows the company number — the engagement letter tool
// included, once it's merged in here.
export default function DirectorsPanel({
  clientId,
  companyNumber,
}: {
  clientId: string
  companyNumber: string
}) {
  const [directors, setDirectors] = useState<Director[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [error, setError] = useState('')
  const [syncSummary, setSyncSummary] = useState('')

  async function load() {
    setLoading(true)
    setError('')
    const { data, error: loadError } = await supabase
      .from('cs_mailer_directors')
      .select('*')
      .eq('company_number', companyNumber)
      .order('full_name', { ascending: true })
    if (loadError) {
      setError(loadError.message)
    } else {
      setDirectors((data as Director[]) ?? [])
    }
    setLoading(false)
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyNumber])

  async function handleSync() {
    setSyncing(true)
    setError('')
    setSyncSummary('')
    try {
      const res = await fetch('/api/ch-officers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyNumber }),
      })
      if (!res.ok) throw new Error(await res.text())
      const data = await res.json()
      const items: {
        appointmentId: string | null
        fullName: string | null
        officerRole: string | null
        appointedOn: string | null
        resignedOn: string | null
        nationality: string | null
        occupation: string | null
        dateOfBirthMonth: number | null
        dateOfBirthYear: number | null
        address: string | null
      }[] = data.items || []

      let added = 0
      let updated = 0

      for (const item of items) {
        if (!item.fullName) continue
        const record = {
          company_number: companyNumber,
          client_id: clientId,
          ch_appointment_id: item.appointmentId,
          full_name: item.fullName,
          officer_role: item.officerRole,
          appointed_on: item.appointedOn,
          resigned_on: item.resignedOn,
          nationality: item.nationality,
          occupation: item.occupation,
          date_of_birth_month: item.dateOfBirthMonth,
          date_of_birth_year: item.dateOfBirthYear,
          address: item.address,
          last_synced_at: new Date().toISOString(),
        }

        // Match on the Companies House appointment id when we have one —
        // that's the reliable key. Falling back to matching on name is
        // only for the rare officer record with no appointment id, so a
        // re-sync doesn't just keep adding duplicates of them.
        const matchQuery = item.appointmentId
          ? supabase
              .from('cs_mailer_directors')
              .select('id')
              .eq('company_number', companyNumber)
              .eq('ch_appointment_id', item.appointmentId)
          : supabase
              .from('cs_mailer_directors')
              .select('id')
              .eq('company_number', companyNumber)
              .is('ch_appointment_id', null)
              .eq('full_name', item.fullName)

        const { data: existing } = await matchQuery.maybeSingle()

        if (existing) {
          await supabase.from('cs_mailer_directors').update(record).eq('id', existing.id)
          updated++
        } else {
          await supabase.from('cs_mailer_directors').insert(record)
          added++
        }
      }

      if (items.length === 0) {
        setSyncSummary('No officers on file at Companies House.')
      } else {
        const parts = []
        if (added) parts.push(`${added} added`)
        if (updated) parts.push(`${updated} updated`)
        setSyncSummary(parts.length ? parts.join(', ') : 'Already up to date.')
      }
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sync failed')
    } finally {
      setSyncing(false)
    }
  }

  const active = directors.filter((d) => !d.resigned_on)
  const resigned = directors.filter((d) => d.resigned_on)

  return (
    <div className="mt-3 rounded-md border border-line bg-paper p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs font-medium text-slate-650 uppercase tracking-wide">
          Directors
        </div>
        <button
          onClick={handleSync}
          disabled={syncing}
          className="text-xs font-medium text-accent hover:text-accent-dark disabled:opacity-40 transition-colors"
        >
          {syncing ? 'Syncing…' : 'Sync from Companies House'}
        </button>
      </div>

      {loading && <div className="text-xs text-slate-650">Loading…</div>}
      {error && <div className="text-xs text-warn">{error}</div>}
      {syncSummary && <div className="text-xs text-accent-dark mb-2">{syncSummary}</div>}

      {!loading && directors.length === 0 && !error && (
        <div className="text-xs text-slate-650">
          No directors on file yet — click Sync to pull them from Companies House.
        </div>
      )}

      {active.length > 0 && (
        <ul className="space-y-1.5 text-sm">
          {active.map((d) => (
            <li key={d.id} className="flex items-center justify-between gap-3">
              <span className="text-ink truncate">{d.full_name}</span>
              <span className="text-xs text-slate-650 shrink-0">
                {d.officer_role || 'officer'} · appointed {formatDate(d.appointed_on)}
              </span>
            </li>
          ))}
        </ul>
      )}

      {resigned.length > 0 && (
        <details className="mt-2">
          <summary className="text-xs text-slate-650 cursor-pointer select-none">
            {resigned.length} resigned {resigned.length === 1 ? 'officer' : 'officers'}
          </summary>
          <ul className="space-y-1.5 text-sm mt-2">
            {resigned.map((d) => (
              <li key={d.id} className="flex items-center justify-between gap-3 text-slate-650">
                <span className="truncate">{d.full_name}</span>
                <span className="text-xs shrink-0">resigned {formatDate(d.resigned_on)}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  )
}
