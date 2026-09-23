import { useEffect, useRef, useState } from 'react'
import { supabase, Client, Director } from '../supabaseClient'
import ClientForm from './ClientForm'
import {
  addressForClient,
  addressForDirector,
  clientToRecipient,
  directorToRecipient,
  generateAll,
  type DocRecipient,
} from '../lib/docGen'

function CompanyPicker({
  onPick,
  onAddNew,
}: {
  onPick: (c: Client) => void
  onAddNew: () => void
}) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Client[]>([])
  const [open, setOpen] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([])
      return
    }
    const timeout = setTimeout(async () => {
      const { data } = await supabase
        .from('cs_mailer_clients')
        .select('*')
        .eq('client_kind', 'company')
        .eq('archived', false)
        .ilike('client_name', `%${query.trim()}%`)
        .order('client_name')
        .limit(20)
      setResults((data as Client[]) ?? [])
    }, 250)
    return () => clearTimeout(timeout)
  }, [query])

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <div ref={boxRef} className="relative w-full">
      <div className="flex gap-2 mb-1">
        <input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          placeholder="Search for the company…"
          className="flex-1 rounded-md border border-line bg-white px-3 py-2 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-colors"
        />
        <button
          onClick={onAddNew}
          className="shrink-0 text-sm font-medium text-accent hover:text-accent-dark transition-colors"
        >
          + New client
        </button>
      </div>
      {open && results.length > 0 && (
        <div className="absolute z-10 mt-1 w-full max-h-72 overflow-auto rounded-md border border-line bg-white shadow-lg">
          {results.map((c) => (
            <button
              key={c.id}
              onClick={() => {
                onPick(c)
                setQuery('')
                setOpen(false)
              }}
              className="block w-full text-left px-3.5 py-2.5 border-b border-line last:border-0 hover:bg-accent-light transition-colors"
            >
              <div className="text-[15px] text-ink">{c.client_name}</div>
              <div className="text-xs text-slate-650 mt-0.5">
                {c.company_number ? `No. ${c.company_number}` : 'No company number on file'}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function IndividualPicker({ onPick }: { onPick: (c: Client) => void }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Client[]>([])
  const [open, setOpen] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([])
      return
    }
    const timeout = setTimeout(async () => {
      const { data } = await supabase
        .from('cs_mailer_clients')
        .select('*')
        .eq('client_kind', 'individual')
        .eq('archived', false)
        .ilike('client_name', `%${query.trim()}%`)
        .order('client_name')
        .limit(20)
      setResults((data as Client[]) ?? [])
    }, 250)
    return () => clearTimeout(timeout)
  }, [query])

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <div ref={boxRef} className="relative w-full">
      <input
        value={query}
        onChange={(e) => {
          setQuery(e.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        placeholder="Search an individual client to add…"
        className="w-full rounded-md border border-line bg-white px-3 py-2 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-colors"
      />
      {open && results.length > 0 && (
        <div className="absolute z-10 mt-1 w-full max-h-72 overflow-auto rounded-md border border-line bg-white shadow-lg">
          {results.map((c) => (
            <button
              key={c.id}
              onClick={() => {
                onPick(c)
                setQuery('')
                setOpen(false)
              }}
              className="block w-full text-left px-3.5 py-2.5 border-b border-line last:border-0 hover:bg-accent-light transition-colors"
            >
              <div className="text-[15px] text-ink">{c.client_name}</div>
              <div className="text-xs text-slate-650 mt-0.5">{addressForClient(c) || 'No address on file'}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default function DocumentsList() {
  const [company, setCompany] = useState<Client | null>(null)
  const [directors, setDirectors] = useState<Director[]>([])
  const [directorsLoading, setDirectorsLoading] = useState(false)
  const [directorsSyncing, setDirectorsSyncing] = useState(false)
  const [checkedDirectorIds, setCheckedDirectorIds] = useState<Set<string>>(new Set())
  const [editingAddressId, setEditingAddressId] = useState<string | null>(null)
  const [individuals, setIndividuals] = useState<Client[]>([])
  const [addingClient, setAddingClient] = useState<{ initial: Partial<Client> } | null>(null)

  const [wantLetter, setWantLetter] = useState(true)
  const [wantAml, setWantAml] = useState(true)
  const [reviewerName, setReviewerName] = useState('Roger Biddlecombe')
  const [busy, setBusy] = useState(false)
  const [log, setLog] = useState<{ msg: string; err?: boolean }[]>([])

  async function loadDirectors(companyNumber: string) {
    setDirectorsLoading(true)
    const { data } = await supabase
      .from('cs_mailer_directors')
      .select('*')
      .eq('company_number', companyNumber)
      .is('resigned_on', null)
      .order('full_name')
    const list = (data as Director[]) ?? []
    setDirectors(list)
    setCheckedDirectorIds(new Set(list.map((d) => d.id))) // default: everyone active is included
    setDirectorsLoading(false)
  }

  function handlePickCompany(c: Client) {
    setCompany(c)
    setDirectors([])
    setCheckedDirectorIds(new Set())
    if (c.company_number) loadDirectors(c.company_number)
  }

  async function handleSyncDirectors() {
    if (!company?.company_number) return
    setDirectorsSyncing(true)
    try {
      const res = await fetch('/api/ch-officers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyNumber: company.company_number }),
      })
      if (res.ok) {
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

        for (const item of items) {
          if (!item.fullName) continue
          const record = {
            company_number: company.company_number,
            client_id: company.id,
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
          const matchQuery = item.appointmentId
            ? supabase
                .from('cs_mailer_directors')
                .select('id')
                .eq('company_number', company.company_number)
                .eq('ch_appointment_id', item.appointmentId)
            : supabase
                .from('cs_mailer_directors')
                .select('id')
                .eq('company_number', company.company_number)
                .is('ch_appointment_id', null)
                .eq('full_name', item.fullName)
          const { data: existing } = await matchQuery.maybeSingle()
          if (existing) {
            await supabase.from('cs_mailer_directors').update(record).eq('id', existing.id)
          } else {
            await supabase.from('cs_mailer_directors').insert(record)
          }
        }
      }
      await loadDirectors(company.company_number)
    } finally {
      setDirectorsSyncing(false)
    }
  }

  function toggleDirector(id: string) {
    setCheckedDirectorIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function saveDirectorAddress(id: string, letterAddress: string) {
    const { error } = await supabase
      .from('cs_mailer_directors')
      .update({ letter_address: letterAddress.trim() || null })
      .eq('id', id)
    if (!error) {
      setDirectors((prev) =>
        prev.map((d) => (d.id === id ? { ...d, letter_address: letterAddress.trim() || null } : d))
      )
    }
    setEditingAddressId(null)
  }

  function removeIndividual(id: string) {
    setIndividuals((prev) => prev.filter((i) => i.id !== id))
  }

  const checkedDirectors = directors.filter((d) => checkedDirectorIds.has(d.id))
  const hasSelection = !!company || checkedDirectors.length > 0 || individuals.length > 0
  const disabled = busy || !hasSelection || (!wantLetter && !wantAml)

  async function handleGenerate() {
    setBusy(true)
    setLog([])
    const recipients: DocRecipient[] = []
    if (company) recipients.push(clientToRecipient(company, 'company'))
    checkedDirectors.forEach((d) => recipients.push(directorToRecipient(d)))
    individuals.forEach((c) => recipients.push(clientToRecipient(c, 'person')))

    await generateAll({
      recipients,
      wantLetter,
      wantAml,
      reviewerName: reviewerName.trim(),
      onProgress: (msg, err) => setLog((l) => [{ msg, err }, ...l]),
    })
    setBusy(false)
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_0.9fr] gap-6 items-start">
      <div className="space-y-5">
        <div className="rounded-md border border-line bg-white p-5">
          <h3 className="font-serif text-lg text-ink mb-1">Company</h3>
          <p className="text-xs text-slate-650 mb-3">
            Pick the company these documents are for — its directors (synced from Companies
            House) are added automatically. Leave this blank to generate for individuals only.
          </p>
          <CompanyPicker
            onPick={handlePickCompany}
            onAddNew={() => setAddingClient({ initial: { client_kind: 'company' } })}
          />

          {company && (
            <div className="mt-4 rounded-md border border-line bg-paper p-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-[15px] text-ink">{company.client_name}</div>
                  <div className="text-xs text-slate-650 mt-0.5">
                    {addressForClient(company) || 'No address on file — edit the client to add one'}
                  </div>
                </div>
                <button
                  onClick={() => {
                    setCompany(null)
                    setDirectors([])
                    setCheckedDirectorIds(new Set())
                  }}
                  className="text-xs font-medium text-warn hover:underline"
                >
                  Remove
                </button>
              </div>

              {company.company_number && (
                <div className="mt-3 border-t border-line pt-3">
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-xs font-medium text-slate-650 uppercase tracking-wide">
                      Directors
                    </div>
                    <button
                      onClick={handleSyncDirectors}
                      disabled={directorsSyncing}
                      className="text-xs font-medium text-accent hover:text-accent-dark disabled:opacity-40 transition-colors"
                    >
                      {directorsSyncing ? 'Syncing…' : 'Sync from Companies House'}
                    </button>
                  </div>

                  {directorsLoading && <div className="text-xs text-slate-650">Loading…</div>}
                  {!directorsLoading && directors.length === 0 && (
                    <div className="text-xs text-slate-650">
                      No directors on file yet — click Sync to pull them from Companies House.
                    </div>
                  )}
                  <ul className="space-y-2">
                    {directors.map((d) => (
                      <li key={d.id} className="text-sm">
                        <div className="flex items-center justify-between gap-3">
                          <label className="flex items-center gap-2 min-w-0 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={checkedDirectorIds.has(d.id)}
                              onChange={() => toggleDirector(d.id)}
                            />
                            <span className="text-ink truncate">{d.full_name}</span>
                          </label>
                          <button
                            onClick={() => setEditingAddressId(editingAddressId === d.id ? null : d.id)}
                            className="shrink-0 text-xs font-medium text-slate-650 hover:text-accent-dark transition-colors"
                          >
                            {editingAddressId === d.id ? 'Cancel' : 'Edit address'}
                          </button>
                        </div>
                        {editingAddressId !== d.id && (
                          <div className="ml-6 text-xs text-slate-650">
                            {addressForDirector(d) || 'No address on file'}
                          </div>
                        )}
                        {editingAddressId === d.id && (
                          <AddressEditor
                            initial={addressForDirector(d)}
                            onSave={(val) => saveDirectorAddress(d.id, val)}
                          />
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="rounded-md border border-line bg-white p-5">
          <h3 className="font-serif text-lg text-ink mb-1">Individuals</h3>
          <p className="text-xs text-slate-650 mb-3">
            Add any other individual clients who need a letter — a standalone personal-tax
            client, or someone who isn't a Companies House officer.
          </p>
          <div className="flex gap-2 mb-3">
            <div className="flex-1">
              <IndividualPicker
                onPick={(c) => {
                  setIndividuals((prev) => (prev.some((i) => i.id === c.id) ? prev : [...prev, c]))
                }}
              />
            </div>
            <button
              onClick={() => setAddingClient({ initial: { client_kind: 'individual' } })}
              className="shrink-0 text-sm font-medium text-accent hover:text-accent-dark transition-colors"
            >
              + New client
            </button>
          </div>
          {individuals.length > 0 && (
            <ul className="space-y-1.5">
              {individuals.map((c) => (
                <li
                  key={c.id}
                  className="flex items-center justify-between gap-3 rounded-md border border-line bg-paper px-3 py-2 text-sm"
                >
                  <span className="text-ink truncate">{c.client_name}</span>
                  <button
                    onClick={() => removeIndividual(c.id)}
                    className="shrink-0 text-xs font-medium text-warn hover:underline"
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="space-y-5">
        <div className="rounded-md border border-line bg-white p-5">
          <h3 className="font-serif text-lg text-ink mb-3">Selected</h3>
          {!hasSelection && <p className="text-sm text-slate-650">Nothing selected yet.</p>}
          <ul className="space-y-1.5 text-sm">
            {company && (
              <li className="flex items-center justify-between">
                <span className="text-ink truncate">{company.client_name}</span>
                <span className="text-xs text-accent uppercase tracking-wide shrink-0">Company</span>
              </li>
            )}
            {checkedDirectors.map((d) => (
              <li key={d.id} className="flex items-center justify-between">
                <span className="text-ink truncate">{d.full_name}</span>
                <span className="text-xs text-slate-650 uppercase tracking-wide shrink-0">Director</span>
              </li>
            ))}
            {individuals.map((c) => (
              <li key={c.id} className="flex items-center justify-between">
                <span className="text-ink truncate">{c.client_name}</span>
                <span className="text-xs text-slate-650 uppercase tracking-wide shrink-0">Individual</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-md border border-line bg-white p-5">
          <h3 className="font-serif text-lg text-ink mb-3">Documents</h3>
          <div className="mb-4 space-y-2">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={wantLetter} onChange={(e) => setWantLetter(e.target.checked)} />
              Engagement letter (PDF)
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={wantAml} onChange={(e) => setWantAml(e.target.checked)} />
              AML periodic review (PDF) — company only
            </label>
          </div>

          <label className="block text-xs text-slate-650 mb-1">Reviewer name (AML form)</label>
          <input
            type="text"
            value={reviewerName}
            onChange={(e) => setReviewerName(e.target.value)}
            className="w-full mb-4 rounded-md border border-line px-3 py-2 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-colors"
          />

          <button
            onClick={handleGenerate}
            disabled={disabled}
            className="w-full rounded-md bg-accent py-3 text-sm font-semibold text-white hover:bg-accent-dark disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {busy ? 'Generating…' : 'Generate & download'}
          </button>

          {log.length > 0 && (
            <div className="mt-3 text-xs text-slate-650 max-h-40 overflow-y-auto">
              {log.map((l, i) => (
                <div
                  key={i}
                  className={`py-1 border-b border-line last:border-0 ${l.err ? 'text-warn' : ''}`}
                >
                  {l.msg}
                </div>
              ))}
            </div>
          )}

          <p className="text-xs text-slate-650 mt-4 leading-relaxed">
            Letters carry today's date and download as PDF for everyone selected. The AML review
            is generated for the company only, and defaults every Yes/No/N-A row to{' '}
            <strong>Yes</strong>, overall risk to <strong>Low</strong>, and the decision to{' '}
            <strong>Continue without additional conditions</strong> — open the downloaded PDF to
            adjust any of that before sending.
          </p>
        </div>
      </div>

      {addingClient && (
        <ClientForm
          mode="add"
          initial={addingClient.initial}
          onCancel={() => setAddingClient(null)}
          onSaved={(saved) => {
            setAddingClient(null)
            if (saved.client_kind === 'company') handlePickCompany(saved)
            else setIndividuals((prev) => [...prev, saved])
          }}
        />
      )}
    </div>
  )
}

function AddressEditor({ initial, onSave }: { initial: string; onSave: (value: string) => void }) {
  const [value, setValue] = useState(initial)
  return (
    <div className="ml-6 mt-1 flex items-center gap-2">
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Address to print on the letter"
        className="flex-1 rounded-md border border-line px-2 py-1 text-xs outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-colors"
        autoFocus
      />
      <button
        onClick={() => onSave(value)}
        className="text-xs font-medium text-accent hover:text-accent-dark transition-colors"
      >
        Save
      </button>
    </div>
  )
}
