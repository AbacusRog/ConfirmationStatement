import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase, Client } from '../supabaseClient'
import ClientSearch from './ClientSearch'
import { extractPdf } from '../lib/pack/pdfText'
import { loadPdfJs } from '../lib/pack/pdfjsBrowser'
import { parseStatutory, modelWords, compareWords, type Statutory } from '../lib/pack/statutory'
import { parseSa100, personName, type Sa100 } from '../lib/pack/sa100'
import { parseInvoice, parseLetter, type InvoiceInfo } from '../lib/pack/docs'
import { buildReview } from '../lib/pack/review'
import { buildChecks, defaultCtDue, totalPersonalDividends, type CtInfo } from '../lib/pack/checks'
import { toPence, gbp, longDate } from '../lib/pack/money'
import { AML_OPTIONS, buildPackEmail, defaultSubject, type AmlId } from '../lib/pack/email'
import { buildPaymentsPdf, paymentCards, paymentsFileName, paymentsTotal } from '../lib/pack/paymentsPdf'
import { buildAccountsPack } from '../lib/pack/accountsPdf'

type SlotKey = 'stat' | 'invoice' | 'letter'
interface Upload {
  name: string
  bytes: Uint8Array
}
interface SaEntry {
  id: string
  file: Upload
  sa: Sa100
}
interface Generated {
  accounts: Uint8Array
  payments: Uint8Array
  accountsName: string
  paymentsName: string
}

const SLOTS: { key: SlotKey; label: string; hint: string; needed: string }[] = [
  { key: 'stat', label: 'Statutory accounts', hint: 'e.g. Accounts 2026 Statutory.pdf', needed: 'Needed to build the pack' },
  { key: 'invoice', label: 'Invoice', hint: 'e.g. Invoice 4368.pdf', needed: 'Attached to the email' },
  { key: 'letter', label: 'Covering letter', hint: 'e.g. Accounts 2026 Letter.pdf', needed: 'Attached to the email; fills in the Corporation Tax details' },
]

const inputCls =
  'w-full rounded-md border border-line bg-white px-3 py-2 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-colors'
const labelCls = 'block text-xs font-medium text-slate-650 mb-1'
const card = 'rounded-md border border-line bg-white p-4'
const h2 = 'font-serif text-lg text-ink mb-3'

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
const newId = () => (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`)

function toBase64(bytes: Uint8Array): string {
  let s = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) s += String.fromCharCode(...bytes.subarray(i, i + chunk))
  return btoa(s)
}

const kb = (n: number) => (n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`)

function blobUrl(bytes: Uint8Array): string {
  return URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/pdf' }))
}

export default function AccountsPack() {
  const [client, setClient] = useState<Client | null>(null)
  const [email, setEmail] = useState('')
  const [forename, setForename] = useState('')
  const [surname, setSurname] = useState('')

  const [uploads, setUploads] = useState<Partial<Record<SlotKey, Upload>>>({})
  const [stat, setStat] = useState<Statutory | null>(null)
  const [saEntries, setSaEntries] = useState<SaEntry[]>([])
  const [invoice, setInvoice] = useState<InvoiceInfo | null>(null)
  const [slotError, setSlotError] = useState<Partial<Record<SlotKey, string>>>({})
  const [reading, setReading] = useState<SlotKey | null>(null)
  const [saError, setSaError] = useState('')
  const [readingSa, setReadingSa] = useState(false)

  const [ctAmount, setCtAmount] = useState('')
  const [ctRef, setCtRef] = useState('')
  const [ctDue, setCtDue] = useState('')
  const [ctFromLetter, setCtFromLetter] = useState(false)

  const [aml, setAml] = useState<AmlId[]>([])
  const [smartVault, setSmartVault] = useState(true)
  const [includeChecks, setIncludeChecks] = useState(true)
  const [subject, setSubject] = useState('')

  const [generated, setGenerated] = useState<Generated | null>(null)
  const [generating, setGenerating] = useState(false)
  const [genError, setGenError] = useState('')
  const [urls, setUrls] = useState<{ accounts: string; payments: string } | null>(null)

  const [confirming, setConfirming] = useState(false)
  const [sending, setSending] = useState(false)
  const [sendState, setSendState] = useState<'idle' | 'sent' | 'error'>('idle')
  const [sendError, setSendError] = useState('')
  const [dragging, setDragging] = useState<SlotKey | 'sa' | null>(null)
  const clientKey = useRef(0)

  // ---------- client ----------
  function pickClient(c: Client) {
    setClient(c)
    setEmail(c.email ?? '')
    setForename(c.forename ?? '')
    setSurname(c.surname ?? '')
    setSendState('idle')
    setConfirming(false)
  }

  // Fall back to the name on the first tax return when the client has no forename on file.
  useEffect(() => {
    const first = saEntries[0]?.sa.name
    if (!client || forename || !first) return
    const parts = first.replace(/^(mr|mrs|ms|miss|dr|mx)\.?\s+/i, '').split(/\s+/)
    if (parts[0]) setForename(parts[0])
    if (!surname && parts.length > 1) setSurname(parts.slice(1).join(' '))
  }, [client, saEntries]) // eslint-disable-line react-hooks/exhaustive-deps

  // ---------- reading uploads ----------
  async function handleFile(key: SlotKey, file: File | undefined) {
    if (!file) return
    setSlotError((e) => ({ ...e, [key]: '' }))
    if (!/\.pdf$/i.test(file.name) && file.type !== 'application/pdf') {
      setSlotError((e) => ({ ...e, [key]: 'Please choose a PDF file.' }))
      return
    }
    setReading(key)
    setGenerated(null)
    setConfirming(false)
    try {
      const bytes = new Uint8Array(await file.arrayBuffer())
      const pages = await extractPdf(await loadPdfJs(), bytes)
      if (!pages.length || pages.every((p) => !p.lines.length)) throw new Error('No text could be read from this PDF (is it a scan?).')
      if (key === 'stat') {
        const s = parseStatutory(pages)
        if (!s.companyName || !s.sections.length) throw new Error('This does not look like a set of statutory accounts.')
        setStat(s)
        setSubject(defaultSubject(s.companyName, s.periodEnd))
        setCtDue((d) => d || defaultCtDue(s.periodEnd) || '')
      } else if (key === 'invoice') {
        setInvoice(parseInvoice(pages))
      } else {
        const l = parseLetter(pages)
        if (l.ctAmount != null) setCtAmount((l.ctAmount / 100).toFixed(2))
        if (l.ctReference) setCtRef(l.ctReference)
        if (l.ctDueISO) setCtDue(l.ctDueISO)
        setCtFromLetter(l.ctAmount != null || !!l.ctReference)
      }
      setUploads((u) => ({ ...u, [key]: { name: file.name, bytes } }))
    } catch (e) {
      setSlotError((er) => ({ ...er, [key]: e instanceof Error ? e.message : 'Could not read this file.' }))
    } finally {
      setReading(null)
    }
  }

  function removeFile(key: SlotKey) {
    setUploads((u) => {
      const n = { ...u }
      delete n[key]
      return n
    })
    if (key === 'stat') setStat(null)
    if (key === 'invoice') setInvoice(null)
    if (key === 'letter') setCtFromLetter(false)
    setGenerated(null)
    setConfirming(false)
  }

  // ---------- tax returns (one or more) ----------
  async function handleSaFile(file: File | undefined) {
    if (!file) return
    setSaError('')
    if (!/\.pdf$/i.test(file.name) && file.type !== 'application/pdf') {
      setSaError('Please choose a PDF file.')
      return
    }
    setReadingSa(true)
    setGenerated(null)
    setConfirming(false)
    try {
      const bytes = new Uint8Array(await file.arrayBuffer())
      const pages = await extractPdf(await loadPdfJs(), bytes)
      if (!pages.length || pages.every((p) => !p.lines.length)) throw new Error('No text could be read from this PDF (is it a scan?).')
      const r = parseSa100(pages)
      if (!r.utr && !r.position && !r.sa302) throw new Error('This does not look like a Self Assessment return.')
      setSaEntries((prev) => [...prev, { id: newId(), file: { name: file.name, bytes }, sa: r }])
    } catch (e) {
      setSaError(e instanceof Error ? e.message : 'Could not read this file.')
    } finally {
      setReadingSa(false)
    }
  }

  function removeSa(id: string) {
    setSaEntries((prev) => prev.filter((e) => e.id !== id))
    setGenerated(null)
    setConfirming(false)
  }

  // ---------- derived data ----------
  const ct: CtInfo | null = useMemo(() => {
    const amount = toPence(ctAmount.replace(/[£,\s]/g, ''))
    if (amount == null || amount <= 0 || !ctDue) return null
    return { amount, reference: ctRef.trim(), dueISO: ctDue }
  }, [ctAmount, ctRef, ctDue])

  const saList = useMemo(() => saEntries.map((e) => e.sa), [saEntries])
  const checks = useMemo(() => (stat ? buildChecks(stat, saList, ct) : []), [stat, saList, ct])
  const completeness = useMemo(() => (stat ? compareWords(stat.sourceWords, modelWords(stat.sections)) : null), [stat])
  const cards = useMemo(() => paymentCards(saList, ct), [saList, ct])

  const accountsName = stat ? `Accounts ${(stat.periodEnd ?? '').slice(0, 4) || ''}.pdf`.replace('Accounts .pdf', 'Accounts.pdf') : 'Accounts.pdf'
  const paymentsName = stat ? paymentsFileName(stat, saList) : 'Tax_Payments.pdf'

  const attachments = useMemo(() => {
    const list: { name: string; description: string; bytes: Uint8Array | null }[] = []
    if (uploads.stat) list.push({ name: uploads.stat.name, description: 'Statutory Accounts', bytes: uploads.stat.bytes })
    if (generated) list.push({ name: generated.accountsName, description: 'Accounts', bytes: generated.accounts })
    if (uploads.letter) list.push({ name: uploads.letter.name, description: 'Covering Letter', bytes: uploads.letter.bytes })
    saEntries.forEach((entry) => {
      const who = personName(entry.sa)
      list.push({
        name: entry.file.name,
        description: saEntries.length > 1 ? `Personal Tax Return${who ? ` – ${who}` : ''}` : 'Personal Tax Return',
        bytes: entry.file.bytes,
      })
    })
    if (generated) list.push({ name: generated.paymentsName, description: 'Information Sheet', bytes: generated.payments })
    if (uploads.invoice) {
      const extra = invoice?.total != null ? ` – ${gbp(invoice.total)}${invoice.dueISO ? `, due ${longDate(invoice.dueISO)}` : ''}` : ''
      list.push({ name: uploads.invoice.name, description: `Invoice${extra}`, bytes: uploads.invoice.bytes })
    }
    return list
  }, [uploads, generated, invoice, saEntries])

  const siteUrl = (import.meta.env.VITE_SITE_URL as string | undefined) || window.location.origin
  const emailContent = useMemo(
    () =>
      buildPackEmail({
        forename,
        files: attachments.map((a) => ({ name: a.name, description: a.description })),
        payments: cards.map((c) => ({ title: c.label, amount: c.amount, dueText: c.dueText })),
        aml,
        smartVault,
        logoUrl: `${siteUrl.replace(/\/$/, '')}/logo-header.jpg`,
      }),
    [forename, attachments, cards, aml, smartVault, siteUrl],
  )

  // Object URLs for the generated PDFs (revoked when replaced).
  useEffect(() => {
    if (!generated) {
      setUrls(null)
      return
    }
    const u = { accounts: blobUrl(generated.accounts), payments: blobUrl(generated.payments) }
    setUrls(u)
    return () => {
      URL.revokeObjectURL(u.accounts)
      URL.revokeObjectURL(u.payments)
    }
  }, [generated])

  // Anything that changes the documents makes the generated copies stale.
  useEffect(() => {
    setGenerated(null)
    setConfirming(false)
  }, [ctAmount, ctRef, ctDue, includeChecks])

  // ---------- generate ----------
  async function generate() {
    if (!stat || saList.length === 0) return
    setGenerating(true)
    setGenError('')
    try {
      const review = buildReview(stat, { dividends: totalPersonalDividends(saList) ?? undefined })
      const accounts = await buildAccountsPack(stat, review)
      const payments = await buildPaymentsPdf({ stat, saList, ct, checks, includeChecks })
      setGenerated({ accounts, payments, accountsName, paymentsName })
    } catch (e) {
      setGenError(e instanceof Error ? e.message : 'Could not build the documents.')
    } finally {
      setGenerating(false)
    }
  }

  // ---------- send ----------
  const missingEmail = !email.trim()
  const missingLetter = !uploads.letter
  const missingInvoice = !uploads.invoice
  const nameMismatch = client && stat && norm(client.client_name) !== norm(stat.companyName)
  const canReview = !!generated && !missingEmail && !missingLetter && !missingInvoice && !!subject.trim()
  const totalBytes = attachments.reduce((a, f) => a + (f.bytes?.length ?? 0), 0)
  const tooBig = totalBytes > 26 * 1024 * 1024

  async function send() {
    if (!client || !generated || tooBig) return
    setSending(true)
    setSendError('')
    try {
      const updates: Record<string, string | null> = {}
      if (email.trim() !== (client.email ?? '')) updates.email = email.trim()
      if (forename.trim() !== (client.forename ?? '')) updates.forename = forename.trim() || null
      if (surname.trim() !== (client.surname ?? '')) updates.surname = surname.trim() || null
      if (Object.keys(updates).length) {
        const { error } = await supabase.from('cs_mailer_clients').update(updates).eq('id', client.id)
        if (error) throw error
      }
      const { data } = await supabase.auth.getSession()
      const token = data.session?.access_token
      if (!token) throw new Error('You are signed out. Sign in again.')

      const res = await fetch('/api/send-pack', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          to: email.trim(),
          subject: subject.trim(),
          html: emailContent.html,
          text: emailContent.text,
          attachments: attachments.map((a) => ({ filename: a.name, content: toBase64(a.bytes!) })),
        }),
      })
      if (!res.ok) {
        let msg = await res.text()
        try {
          msg = JSON.parse(msg).error ?? msg
        } catch {
          /* plain text */
        }
        throw new Error(msg)
      }
      setSendState('sent')
      setConfirming(false)
    } catch (e) {
      setSendState('error')
      setSendError(e instanceof Error ? e.message : (e as { message?: string })?.message ?? 'Sending failed.')
    } finally {
      setSending(false)
    }
  }

  function startAgain() {
    setClient(null)
    setUploads({})
    setStat(null)
    setSaEntries([])
    setSaError('')
    setInvoice(null)
    setSlotError({})
    setCtAmount('')
    setCtRef('')
    setCtDue('')
    setCtFromLetter(false)
    setAml([])
    setSmartVault(true)
    setIncludeChecks(true)
    setSubject('')
    setGenerated(null)
    setSendState('idle')
    setConfirming(false)
    setEmail('')
    setForename('')
    setSurname('')
    clientKey.current += 1
  }

  const toggleAml = (id: AmlId) => setAml((a) => (a.includes(id) ? a.filter((x) => x !== id) : [...a, id]))
  const attention = checks.filter((c) => c.tone === 'attention').length

  // ---------- render ----------
  return (
    <div className="space-y-6">
      {/* 1. Client */}
      <section className={card}>
        <h2 className={h2}>1. Client</h2>
        <ClientSearch key={clientKey.current} onSelect={pickClient} />
        {client && (
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Client email</label>
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@example.com"
                className={`${inputCls} ${missingEmail ? '!border-warn bg-warnbg' : ''}`}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className={labelCls}>Forename</label>
                <input value={forename} onChange={(e) => setForename(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Surname</label>
                <input value={surname} onChange={(e) => setSurname(e.target.value)} className={inputCls} />
              </div>
            </div>
            {missingEmail && (
              <p className="sm:col-span-2 text-xs text-warn">
                No email on file for this client. Type it here (it is saved to the client when you send), or use Edit in the search list above.
              </p>
            )}
          </div>
        )}
      </section>

      {/* 2. Documents */}
      <section className={card}>
        <h2 className={h2}>2. Your documents</h2>
        <p className="text-sm text-slate-650 mb-3">
          Drop in the PDFs from your practice software. They are attached exactly as they are; nothing in them is changed.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {SLOTS.map((s) => {
            const up = uploads[s.key]
            return (
              <div
                key={s.key}
                onDragOver={(e) => {
                  e.preventDefault()
                  setDragging(s.key)
                }}
                onDragLeave={() => setDragging(null)}
                onDrop={(e) => {
                  e.preventDefault()
                  setDragging(null)
                  handleFile(s.key, e.dataTransfer.files?.[0])
                }}
                className={`rounded-md border border-dashed p-3 transition-colors ${
                  dragging === s.key ? 'border-accent bg-accent-light' : up ? 'border-accent/40 bg-accent-light/40' : 'border-line'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-sm font-medium text-ink">{s.label}</div>
                    <div className="text-xs text-slate-650">{up ? up.name : s.hint}</div>
                  </div>
                  {up && (
                    <button onClick={() => removeFile(s.key)} className="text-xs text-slate-650 hover:text-warn" title="Remove">
                      Remove
                    </button>
                  )}
                </div>
                {!up && (
                  <label className="mt-2 inline-block cursor-pointer text-sm font-medium text-accent hover:text-accent-dark">
                    {reading === s.key ? 'Reading…' : 'Choose PDF, or drop it here'}
                    <input type="file" accept="application/pdf,.pdf" className="hidden" onChange={(e) => handleFile(s.key, e.target.files?.[0])} />
                  </label>
                )}
                <div className="text-[11px] text-slate-650 mt-1">{s.needed}</div>
                {slotError[s.key] && <div className="text-xs text-warn mt-1">{slotError[s.key]}</div>}
              </div>
            )
          })}
        </div>

        {/* Self Assessment return(s) — one or more */}
        <div
          onDragOver={(e) => {
            e.preventDefault()
            setDragging('sa')
          }}
          onDragLeave={() => setDragging(null)}
          onDrop={(e) => {
            e.preventDefault()
            setDragging(null)
            handleSaFile(e.dataTransfer.files?.[0])
          }}
          className={`mt-3 rounded-md border border-dashed p-3 transition-colors ${
            dragging === 'sa' ? 'border-accent bg-accent-light' : saEntries.length ? 'border-accent/40 bg-accent-light/40' : 'border-line'
          }`}
        >
          <div className="text-sm font-medium text-ink">Self Assessment return(s)</div>
          <div className="text-xs text-slate-650">Add one per person the pack should cover — for example both directors</div>
          {saEntries.length > 0 && (
            <div className="mt-2 space-y-1.5">
              {saEntries.map((entry) => (
                <div key={entry.id} className="flex items-center justify-between gap-2 rounded border border-line bg-white px-2.5 py-1.5">
                  <div className="text-sm text-ink truncate">
                    {entry.file.name}
                    <span className="text-xs text-slate-650 ml-2">
                      {entry.sa.name ?? 'name not found'}
                      {entry.sa.taxYear ? ` · ${entry.sa.taxYear}` : ''}
                    </span>
                  </div>
                  <button onClick={() => removeSa(entry.id)} className="text-xs text-slate-650 hover:text-warn shrink-0" title="Remove">
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}
          <label className="mt-2 inline-block cursor-pointer text-sm font-medium text-accent hover:text-accent-dark">
            {readingSa ? 'Reading…' : saEntries.length ? '+ Add another return' : 'Choose PDF, or drop it here'}
            <input type="file" accept="application/pdf,.pdf" className="hidden" onChange={(e) => handleSaFile(e.target.files?.[0])} />
          </label>
          <div className="text-[11px] text-slate-650 mt-1">Needed for the tax payments sheet</div>
          {saError && <div className="text-xs text-warn mt-1">{saError}</div>}
        </div>

        {stat && (
          <div className="mt-4 rounded-md bg-paper border border-line p-3 text-sm space-y-1">
            <div>
              <strong>{stat.companyName}</strong>
              {stat.companyNumber ? ` · ${stat.companyNumber}` : ''} · year ended {stat.periodLabel}
            </div>
            {saEntries.map((entry) => (
              <div key={entry.id} className="text-slate-650">
                Tax return: {entry.sa.name ?? 'name not found'}
                {entry.sa.taxYear ? ` · ${entry.sa.taxYear}` : ''}
                {entry.sa.utr ? ` · UTR ${entry.sa.utr}` : ''}
              </div>
            ))}
            {invoice?.number && (
              <div className="text-slate-650">
                Invoice {invoice.number}
                {invoice.total != null ? ` · ${gbp(invoice.total)}` : ''}
                {invoice.dueISO ? ` · due ${longDate(invoice.dueISO)}` : ''}
              </div>
            )}
            {completeness && (
              <div className={completeness.missing.length ? 'text-warn' : 'text-accent-dark'}>
                {completeness.missing.length
                  ? `Check the accounts copy: ${completeness.missing.length} word(s) from the statutory accounts may be missing (${completeness.missing.slice(0, 8).join(' ')}${completeness.missing.length > 8 ? ' …' : ''}).`
                  : `Every word of the statutory accounts (${stat.sourceWords.length}) is carried into the reader-friendly copy.`}
              </div>
            )}
            {stat.warnings.map((w, i) => (
              <div key={i} className="text-warn">
                {w}
              </div>
            ))}
            {saEntries.flatMap((entry) =>
              entry.sa.warnings.map((w, i) => (
                <div key={`${entry.id}-${i}`} className="text-warn">
                  {saEntries.length > 1 && entry.sa.name ? `${entry.sa.name}: ` : ''}
                  {w}
                </div>
              )),
            )}
            {nameMismatch && (
              <div className="text-warn">
                The accounts are for “{stat.companyName}” but the selected client is “{client!.client_name}”. Check you have the right client.
              </div>
            )}
          </div>
        )}
      </section>

      {/* 3. Corporation tax */}
      <section className={card}>
        <h2 className={h2}>3. Corporation Tax</h2>
        {ctFromLetter && <p className="text-xs text-accent-dark mb-2">Filled in from the covering letter. Check the figures before you continue.</p>}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className={labelCls}>Exact amount (£)</label>
            <input value={ctAmount} onChange={(e) => setCtAmount(e.target.value)} placeholder="3001.81" inputMode="decimal" className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Payment reference</label>
            <input value={ctRef} onChange={(e) => setCtRef(e.target.value)} placeholder="2436410081A00107A" className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Due date</label>
            <input type="date" value={ctDue} onChange={(e) => setCtDue(e.target.value)} className={inputCls} />
          </div>
        </div>
        <p className="text-xs text-slate-650 mt-2">
          The due date starts as 9 months and 1 day after the year end. Leave the amount blank if no Corporation Tax is payable and the sheet will show personal tax only.
        </p>
        {stat && ctAmount && !ct && <p className="text-xs text-warn mt-1">That amount or date is not valid yet.</p>}
        {ct && !ct.reference && <p className="text-xs text-warn mt-1">No payment reference entered. The sheet will say “Not supplied”.</p>}
      </section>

      {/* 4. Email extras */}
      <section className={card}>
        <h2 className={h2}>4. Email options</h2>
        <div className="mb-4">
          <div className="text-sm font-medium text-ink mb-1.5">Money laundering: documents needed from the client</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5">
            {AML_OPTIONS.map((o) => (
              <label key={o.id} className="flex items-center gap-2 text-sm text-ink">
                <input type="checkbox" checked={aml.includes(o.id)} onChange={() => toggleAml(o.id)} className="accent-[#2F5D6B]" />
                {o.label}
              </label>
            ))}
          </div>
          {!aml.length && <p className="text-xs text-slate-650 mt-1.5">Nothing ticked: the Money Laundering section is left out of the email.</p>}
        </div>
        <label className="flex items-start gap-2 text-sm text-ink mb-2">
          <input type="checkbox" checked={smartVault} onChange={(e) => setSmartVault(e.target.checked)} className="accent-[#2F5D6B] mt-0.5" />
          <span>Include the SmartVault message (on as standard)</span>
        </label>
        <label className="flex items-start gap-2 text-sm text-ink">
          <input type="checkbox" checked={includeChecks} onChange={(e) => setIncludeChecks(e.target.checked)} className="accent-[#2F5D6B] mt-0.5" />
          <span>
            Include the sense-check page in the Tax Payments sheet
            <span className="block text-xs text-slate-650">The client will be able to read it. Turn this off to send the payments and summaries only.</span>
          </span>
        </label>
      </section>

      {/* 5. Generate */}
      <section className={card}>
        <h2 className={h2}>5. Build the documents</h2>
        {stat && checks.length > 0 && (
          <details className="mb-3 rounded-md border border-line bg-paper p-3">
            <summary className="cursor-pointer text-sm font-medium text-ink">
              Sense-checks: {attention} to look at, {checks.length - attention} agree
            </summary>
            <ul className="mt-2 space-y-1.5">
              {checks.map((c, i) => (
                <li key={i} className="text-sm flex gap-2">
                  <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-sm ${c.tone === 'attention' ? 'bg-[#A61B1B]' : 'bg-accent'}`} />
                  <span className="text-ink">{c.text}</span>
                </li>
              ))}
            </ul>
          </details>
        )}
        {stat && cards.length > 0 && (
          <div className="text-sm text-ink mb-3">
            {cards.map((c, i) => (
              <div key={`${c.title}-${i}`} className="flex justify-between max-w-sm">
                <span>
                  {c.label} <span className="text-slate-650">· due {c.dueText}</span>
                </span>
                <strong>{gbp(c.amount)}</strong>
              </div>
            ))}
            <div className="flex justify-between max-w-sm border-t border-line mt-1 pt-1">
              <span>Total</span>
              <strong>{gbp(paymentsTotal(cards))}</strong>
            </div>
          </div>
        )}
        <button
          onClick={generate}
          disabled={!stat || saList.length === 0 || generating}
          className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-dark disabled:opacity-50 transition-colors"
        >
          {generating ? 'Building…' : generated ? 'Rebuild documents' : 'Build the two documents'}
        </button>
        {(!stat || saList.length === 0) && <span className="ml-3 text-xs text-slate-650">Add the statutory accounts and at least one tax return first.</span>}
        {genError && <p className="text-sm text-warn mt-2">{genError}</p>}
        {generated && urls && (
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[
              { name: generated.accountsName, url: urls.accounts, size: generated.accounts.length, note: 'Reader-friendly accounts with financial review' },
              { name: generated.paymentsName, url: urls.payments, size: generated.payments.length, note: 'Tax payments information sheet' },
            ].map((f) => (
              <div key={f.name} className="rounded-md border border-line p-3">
                <div className="text-sm font-medium text-ink break-all">{f.name}</div>
                <div className="text-xs text-slate-650">
                  {f.note} · {kb(f.size)}
                </div>
                <div className="mt-2 flex gap-4 text-sm font-medium">
                  <a href={f.url} target="_blank" rel="noreferrer" className="text-accent hover:text-accent-dark">
                    Open
                  </a>
                  <a href={f.url} download={f.name} className="text-accent hover:text-accent-dark">
                    Download
                  </a>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 6. Email */}
      {generated && (
        <section className={card}>
          <h2 className={h2}>6. Review and send</h2>
          <div className="mb-3">
            <label className={labelCls}>Subject</label>
            <input value={subject} onChange={(e) => setSubject(e.target.value)} className={inputCls} />
          </div>
          <div className="rounded-md border border-line overflow-hidden mb-3">
            <iframe title="Email preview" srcDoc={emailContent.html} sandbox="" className="w-full bg-white" style={{ height: 760 }} />
          </div>

          <div className="text-sm text-ink mb-3">
            <div className="font-medium mb-1">Attachments ({attachments.length})</div>
            <ul className="space-y-0.5">
              {attachments.map((a) => (
                <li key={a.name} className="flex justify-between gap-3 text-slate-650">
                  <span className="break-all">{a.name}</span>
                  <span className="shrink-0">{kb(a.bytes?.length ?? 0)}</span>
                </li>
              ))}
            </ul>
            <div className="text-xs text-slate-650 mt-1">Total {kb(totalBytes)}</div>
          </div>

          {missingLetter && <p className="text-xs text-warn mb-1">Add the covering letter in step 2 before sending. The email tells the client to read it.</p>}
          {missingInvoice && <p className="text-xs text-warn mb-1">Add the invoice in step 2 before sending.</p>}
          {missingEmail && <p className="text-xs text-warn mb-1">This client has no email address. Add one in step 1.</p>}
          {tooBig && <p className="text-xs text-warn mb-1">The attachments are over the 26 MB the email service can carry. Compress the larger PDFs and try again.</p>}

          {sendState === 'sent' ? (
            <div className="rounded-md bg-accent-light border border-accent/30 p-3 text-sm text-accent-dark flex items-center justify-between">
              <span>Sent to {email}. A copy has been BCC’d to you.</span>
              <button onClick={startAgain} className="font-medium underline">
                Start another
              </button>
            </div>
          ) : !confirming ? (
            <button
              onClick={() => setConfirming(true)}
              disabled={!canReview || tooBig}
              className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-dark disabled:opacity-50 transition-colors"
            >
              Review and send
            </button>
          ) : (
            <div className="rounded-md border border-warn/40 bg-warnbg p-3">
              <div className="text-sm text-ink mb-2">
                Send this to <strong>{email}</strong> with {attachments.length} PDFs attached? It cannot be recalled.
              </div>
              <div className="flex gap-3">
                <button
                  onClick={send}
                  disabled={sending}
                  className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-dark disabled:opacity-50 transition-colors"
                >
                  {sending ? 'Sending…' : 'Send now'}
                </button>
                <button onClick={() => setConfirming(false)} disabled={sending} className="text-sm font-medium text-slate-650 hover:text-ink">
                  Cancel
                </button>
              </div>
            </div>
          )}
          {sendState === 'error' && <p className="text-sm text-warn mt-2">Could not send: {sendError}</p>}
        </section>
      )}
    </div>
  )
}
