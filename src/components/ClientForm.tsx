import { useState } from 'react'
import { supabase, Client } from '../supabaseClient'

export default function ClientForm({
  mode,
  initial,
  onSaved,
  onCancel,
  onArchived,
}: {
  mode: 'add' | 'edit'
  initial: Partial<Client>
  onSaved: (client: Client) => void
  onCancel: () => void
  onArchived?: (clientId: string) => void
}) {
  const [clientKind, setClientKind] = useState<'company' | 'individual'>(
    initial.client_kind ?? 'company'
  )
  const [clientCode, setClientCode] = useState(initial.client_code ?? '')
  const [clientName, setClientName] = useState(initial.client_name ?? '')
  const [email, setEmail] = useState(initial.email ?? '')
  const [forename, setForename] = useState(initial.forename ?? '')
  const [surname, setSurname] = useState(initial.surname ?? '')
  const [statementDate, setStatementDate] = useState(
    initial.confirmation_statement_date ?? ''
  )
  const [companyNumber, setCompanyNumber] = useState(initial.company_number ?? '')
  const [yearEndDate, setYearEndDate] = useState(initial.year_end_date ?? '')
  const [companyStatus, setCompanyStatus] = useState(initial.company_status ?? '')
  const [clientType, setClientType] = useState(initial.client_type ?? '')
  const [addr1, setAddr1] = useState(initial.addr1 ?? '')
  const [addr2, setAddr2] = useState(initial.addr2 ?? '')
  const [town, setTown] = useState(initial.town ?? '')
  const [county, setCounty] = useState(initial.county ?? '')
  const [postcode, setPostcode] = useState(initial.postcode ?? '')
  const [contactNumber, setContactNumber] = useState(initial.contact_number ?? '')
  const [saving, setSaving] = useState(false)
  const [archiving, setArchiving] = useState(false)
  const [error, setError] = useState('')

  const [checking, setChecking] = useState(false)
  const [checkError, setCheckError] = useState('')
  const [checkResult, setCheckResult] = useState<{
    companyName: string | null
    companyStatus: string | null
    confirmationStatementNextMadeUpTo: string | null
    nextYearEndDate: string | null
  } | null>(null)

  const canSave = clientName.trim().length > 0

  async function handleCheckCompaniesHouse() {
    if (!companyNumber.trim()) return
    setChecking(true)
    setCheckError('')
    setCheckResult(null)
    try {
      const res = await fetch('/api/ch-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyNumber: companyNumber.trim() }),
      })
      if (!res.ok) throw new Error(await res.text())
      const data = await res.json()
      setCheckResult({
        companyName: data.companyName || null,
        companyStatus: data.companyStatus || null,
        confirmationStatementNextMadeUpTo: data.confirmationStatementNextMadeUpTo || null,
        nextYearEndDate: data.nextYearEndDate || null,
      })
    } catch (err) {
      setCheckError(err instanceof Error ? err.message : 'Check failed')
    } finally {
      setChecking(false)
    }
  }

  function applyCheckResult() {
    if (!checkResult) return
    if (checkResult.confirmationStatementNextMadeUpTo) {
      setStatementDate(checkResult.confirmationStatementNextMadeUpTo)
    }
    if (checkResult.nextYearEndDate) {
      setYearEndDate(checkResult.nextYearEndDate)
    }
    if (checkResult.companyStatus) {
      setCompanyStatus(checkResult.companyStatus)
    }
    setCheckResult(null)
  }

  async function handleArchive() {
    if (mode !== 'edit' || !initial.id) return
    if (!confirm(`Archive ${initial.client_name}? You can restore it later from "Archived clients".`))
      return
    setArchiving(true)
    setError('')
    const { error: archiveError } = await supabase
      .from('cs_mailer_clients')
      .update({ archived: true, archived_at: new Date().toISOString(), archived_reason: 'manual' })
      .eq('id', initial.id)
    if (archiveError) {
      setError(archiveError.message)
      setArchiving(false)
    } else {
      onArchived?.(initial.id)
    }
  }

  async function handleSave() {
    if (!canSave) return
    setSaving(true)
    setError('')
    const record = {
      client_kind: clientKind,
      client_code: clientCode.trim() || null,
      client_name: clientName.trim(),
      email: email.trim() || null,
      forename: forename.trim() || null,
      surname: surname.trim() || null,
      confirmation_statement_date: clientKind === 'company' ? statementDate || null : null,
      company_number: clientKind === 'company' ? companyNumber.trim() || null : null,
      year_end_date: clientKind === 'company' ? yearEndDate || null : null,
      company_status: clientKind === 'company' ? companyStatus.trim() || null : null,
      client_type: clientType.trim() || null,
      addr1: addr1.trim() || null,
      addr2: addr2.trim() || null,
      town: town.trim() || null,
      county: county.trim() || null,
      postcode: postcode.trim() || null,
      contact_number: contactNumber.trim() || null,
    }
    try {
      if (mode === 'add') {
        const { data, error: insertError } = await supabase
          .from('cs_mailer_clients')
          .insert(record)
          .select()
          .single()
        if (insertError) throw insertError
        onSaved(data as Client)
      } else {
        const { data, error: updateError } = await supabase
          .from('cs_mailer_clients')
          .update(record)
          .eq('id', initial.id)
          .select()
          .single()
        if (updateError) throw updateError
        onSaved(data as Client)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4">
      <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl max-h-[90vh] overflow-y-auto">
        <h2 className="font-serif text-lg text-ink mb-4">
          {mode === 'add' ? 'Add a new client' : 'Edit client'}
        </h2>

        <div className="space-y-3">
          <div className="flex rounded-md border border-line bg-paper p-0.5 w-fit">
            {(['company', 'individual'] as const).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setClientKind(k)}
                className={`px-3 py-1.5 text-sm font-medium rounded-[5px] transition-colors ${
                  clientKind === k ? 'bg-accent text-white' : 'text-slate-650 hover:text-ink'
                }`}
              >
                {k === 'company' ? 'Company' : 'Individual'}
              </button>
            ))}
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-650 mb-1">
              {clientKind === 'company' ? 'Company name' : 'Full name'}
            </label>
            <input
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
              placeholder={clientKind === 'company' ? 'Company name' : 'Full name'}
              autoFocus
              className="w-full rounded-md border border-line px-3 py-2 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-colors"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-650 mb-1">
                Client code
              </label>
              <input
                value={clientCode}
                onChange={(e) => setClientCode(e.target.value)}
                placeholder="Optional"
                className="w-full rounded-md border border-line px-3 py-2 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-colors"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-650 mb-1">
                Email
              </label>
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@example.com"
                className="w-full rounded-md border border-line px-3 py-2 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-colors"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-650 mb-1">
                Forename
              </label>
              <input
                value={forename}
                onChange={(e) => setForename(e.target.value)}
                placeholder="Optional"
                className="w-full rounded-md border border-line px-3 py-2 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-colors"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-650 mb-1">
                Surname
              </label>
              <input
                value={surname}
                onChange={(e) => setSurname(e.target.value)}
                placeholder="Optional"
                className="w-full rounded-md border border-line px-3 py-2 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-colors"
              />
            </div>
          </div>

          {clientKind === 'company' && (
          <div>
            <label className="block text-xs font-medium text-slate-650 mb-1">
              Confirmation statement period ends
            </label>
            <input
              type="date"
              value={statementDate}
              onChange={(e) => setStatementDate(e.target.value)}
              className="rounded-md border border-line px-3 py-2 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-colors"
            />
          </div>
          )}

          <div className="border-t border-line pt-3">
            <div className="text-xs font-medium text-slate-650 uppercase tracking-wide mb-2">
              Postal address
            </div>
            <div className="grid grid-cols-2 gap-3 mb-2">
              <input
                value={clientType}
                onChange={(e) => setClientType(e.target.value)}
                placeholder={
                  clientKind === 'company' ? 'Client type, e.g. Limited Company' : 'e.g. Sole Trader'
                }
                className="rounded-md border border-line px-3 py-2 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-colors"
              />
              <input
                value={contactNumber}
                onChange={(e) => setContactNumber(e.target.value)}
                placeholder="Contact number"
                className="rounded-md border border-line px-3 py-2 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-colors"
              />
            </div>
            <input
              value={addr1}
              onChange={(e) => setAddr1(e.target.value)}
              placeholder="Address line 1"
              className="w-full mb-2 rounded-md border border-line px-3 py-2 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-colors"
            />
            <input
              value={addr2}
              onChange={(e) => setAddr2(e.target.value)}
              placeholder="Address line 2"
              className="w-full mb-2 rounded-md border border-line px-3 py-2 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-colors"
            />
            <div className="grid grid-cols-3 gap-2">
              <input
                value={town}
                onChange={(e) => setTown(e.target.value)}
                placeholder="Town"
                className="rounded-md border border-line px-3 py-2 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-colors"
              />
              <input
                value={county}
                onChange={(e) => setCounty(e.target.value)}
                placeholder="County"
                className="rounded-md border border-line px-3 py-2 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-colors"
              />
              <input
                value={postcode}
                onChange={(e) => setPostcode(e.target.value)}
                placeholder="Postcode"
                className="rounded-md border border-line px-3 py-2 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-colors"
              />
            </div>
            <p className="mt-1.5 text-xs text-slate-650">
              Used on the Documents tab for engagement letters and AML reviews.
            </p>
          </div>

          {clientKind === 'company' && (
          <div className="border-t border-line pt-3">
            <div className="text-xs font-medium text-slate-650 uppercase tracking-wide mb-2">
              Year End
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-650 mb-1">
                  Companies House number
                </label>
                <input
                  value={companyNumber}
                  onChange={(e) => setCompanyNumber(e.target.value.toUpperCase())}
                  placeholder="e.g. 16702802"
                  className="w-full rounded-md border border-line px-3 py-2 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-colors"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-650 mb-1">
                  Year end date
                </label>
                <input
                  type="date"
                  value={yearEndDate}
                  onChange={(e) => setYearEndDate(e.target.value)}
                  className="w-full rounded-md border border-line px-3 py-2 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-colors"
                />
              </div>
            </div>
            <div className="mt-2 flex items-center gap-3">
              <button
                onClick={handleCheckCompaniesHouse}
                disabled={!companyNumber.trim() || checking}
                className="text-xs font-medium text-accent hover:text-accent-dark disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {checking ? 'Checking…' : 'Check against Companies House'}
              </button>
              {companyStatus && (
                <span className="text-xs text-slate-650">Status on file: {companyStatus}</span>
              )}
            </div>
            {!companyNumber.trim() && (
              <p className="mt-1.5 text-xs text-slate-650">
                Add the company number here (or match it from the Year End tab)
                to enable syncing with Companies House.
              </p>
            )}

            {checkError && <p className="mt-2 text-xs text-warn">{checkError}</p>}

            {checkResult && (
              <div className="mt-2 rounded-md border border-accent/30 bg-accent-light p-3 text-xs">
                <div className="text-ink mb-2">
                  Companies House reports{' '}
                  <strong>{checkResult.companyName || clientName}</strong>
                  {checkResult.companyStatus ? <> ({checkResult.companyStatus})</> : null}:
                </div>
                <ul className="space-y-1 text-ink mb-2">
                  <li>
                    Confirmation statement period end:{' '}
                    <strong>{checkResult.confirmationStatementNextMadeUpTo || '—'}</strong>
                  </li>
                  <li>
                    Next year end: <strong>{checkResult.nextYearEndDate || '—'}</strong>
                  </li>
                </ul>
                {checkResult.companyStatus?.toLowerCase() === 'dissolved' && (
                  <p className="mb-2 text-warn">
                    This company shows as dissolved — save, then use "Archive client" below.
                  </p>
                )}
                <div className="flex items-center gap-3">
                  <button
                    onClick={applyCheckResult}
                    className="rounded-md bg-accent px-3 py-1 text-xs font-medium text-white hover:bg-accent-dark transition-colors"
                  >
                    Apply to this form
                  </button>
                  <button
                    onClick={() => setCheckResult(null)}
                    className="text-xs font-medium text-slate-650 hover:text-accent-dark transition-colors"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            )}
          </div>
          )}
        </div>

        {error && <p className="mt-3 text-xs text-warn">{error}</p>}

        <div className="mt-5 flex items-center justify-between gap-2">
          <div>
            {mode === 'edit' && (
              <button
                onClick={handleArchive}
                disabled={archiving}
                className="text-sm font-medium text-warn hover:underline disabled:opacity-40 transition-colors"
              >
                {archiving ? 'Archiving…' : 'Archive client'}
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onCancel}
              className="rounded-md px-4 py-2 text-sm font-medium text-slate-650 hover:bg-paper transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving || !canSave}
              className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-dark disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {saving ? 'Saving…' : mode === 'add' ? 'Add client' : 'Save changes'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
