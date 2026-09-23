import { useState } from 'react'
import { supabase, Client } from '../supabaseClient'
import CompanyMatch from './CompanyMatch'

// Lets you search Companies House by name and create a brand new client
// from the result, pre-filled with the company's name, number, and (once
// synced) its next year end date. Email, forename/surname and the
// confirmation statement date are left for you to add later — the
// confirmation statement date in particular usually only becomes known
// once Companies House actually emails you the reminder for that company.
export default function NewClientFromCH({
  onCreated,
  onCancel,
}: {
  onCreated: (client: Client) => void
  onCancel: () => void
}) {
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')

  async function handlePick(companyNumber: string, title: string) {
    setCreating(true)
    setError('')
    try {
      const { data, error: insertError } = await supabase
        .from('cs_mailer_clients')
        .insert({ client_name: title, company_number: companyNumber })
        .select()
        .single()
      if (insertError) throw insertError

      let client = data as Client

      // Best-effort: pull the next year end date and current status
      // straight away, so the new client shows up correctly in Year End
      // without an extra manual sync. If this fails, the client is still
      // created — just without those fields filled in yet.
      try {
        const res = await fetch('/api/ch-sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ companyNumber }),
        })
        if (res.ok) {
          const sync = await res.json()
          const { data: updated, error: updateError } = await supabase
            .from('cs_mailer_clients')
            .update({
              year_end_date: sync.nextYearEndDate || null,
              accounts_last_filed_ch: sync.lastAccountsFiledDate || null,
              company_status: sync.companyStatus || null,
              accounts_last_synced_at: new Date().toISOString(),
            })
            .eq('id', client.id)
            .select()
            .single()
          if (!updateError && updated) client = updated as Client
        }
      } catch {
        // sync failed — not fatal, the client record itself was created fine
      }

      onCreated(client)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create client')
      setCreating(false)
    }
  }

  if (creating) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4">
        <div className="w-full max-w-sm rounded-lg bg-white p-6 shadow-xl text-sm text-slate-650">
          {error ? (
            <>
              <p className="text-warn mb-3">{error}</p>
              <button
                onClick={onCancel}
                className="text-sm font-medium text-accent hover:text-accent-dark"
              >
                Close
              </button>
            </>
          ) : (
            'Creating client and checking Companies House…'
          )}
        </div>
      </div>
    )
  }

  return (
    <CompanyMatch initialQuery="" onCancel={onCancel} onSelect={() => {}} onSelectFull={handlePick} />
  )
}
