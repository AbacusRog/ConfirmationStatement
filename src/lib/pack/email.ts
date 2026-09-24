// Builds the client email for the Accounts Pack. It runs in the browser so the
// preview the user sees is exactly the HTML that is sent.

import { gbp, longDate, ordinal, type Pence } from './money'

export const AML_OPTIONS = [
  { id: 'passport', label: 'Passport', address: false },
  { id: 'licence', label: 'Driving Licence', address: false },
  { id: 'utility', label: 'Current Utility Bill or Mobile Phone Bill', address: true },
  { id: 'bank', label: 'Personal Bank Statement', address: true },
] as const
export type AmlId = (typeof AML_OPTIONS)[number]['id']

export interface EmailFile {
  name: string
  description: string
}

export interface EmailPayment {
  title: string // "Corporation Tax"
  amount: Pence
  dueText: string // "1 January 2027"
}

export interface PackEmailInput {
  forename: string
  files: EmailFile[]
  payments: EmailPayment[]
  aml: AmlId[]
  smartVault: boolean
  logoUrl: string
}

const C = {
  ink: '#1F2933',
  slate: '#5F6B7A',
  navy: '#193650',
  teal: '#2B7A78',
  tealLight: '#E8F1F0',
  paper: '#F4F6F8',
  line: '#D5DBE1',
  red: '#A61B1B',
  redLight: '#FBE9E9',
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const SERIF = "Georgia,'Times New Roman',serif"
const SANS = 'Arial,Helvetica,sans-serif'

/** "Child And Family Advisory Service Limited - Period Ended 31st March 2026" */
export function defaultSubject(companyName: string, periodEndISO: string | null): string {
  if (!periodEndISO) return companyName
  const [y, , d] = periodEndISO.split('-').map(Number)
  const month = longDate(periodEndISO).split(' ')[1]
  return `${companyName} - Period Ended ${ordinal(d)} ${month} ${y}`
}

export function amlSentence(aml: AmlId[]): { intro: string; items: { label: string; note: string }[] } | null {
  if (!aml.length) return null
  const chosen = AML_OPTIONS.filter((o) => aml.includes(o.id))
  return {
    intro: 'Can I please get clear copies of the following to keep my anti-money laundering records up to date:',
    items: chosen.map((o) => ({ label: o.label, note: o.address ? 'showing your home address' : '' })),
  }
}

export const SMARTVAULT_TEXT =
  'I have sent you a separate email invite to SmartVault. This is a secure document storage area where you can access all of your records. You can also upload any documents to me.'

const closing = 'If you have any queries, then please do not hesitate to contact me.'

export function buildPackEmail(inp: PackEmailInput): { html: string; text: string } {
  const aml = amlSentence(inp.aml)
  const hi = inp.forename.trim() ? `Hi ${inp.forename.trim()}` : 'Hello'

  // ---------- plain-text alternative ----------
  const t: string[] = [hi, '', 'Please find attached the following:-', '']
  inp.files.forEach((f) => t.push(`[${f.name}] – ${f.description}`))
  if (inp.payments.length) {
    t.push('', 'Payments due:')
    inp.payments.forEach((p) => t.push(`${p.title}: ${gbp(p.amount)} due ${p.dueText}`))
  }
  t.push('', 'Please read the covering letter, which explains what to do next.')
  if (aml) {
    t.push('', 'Money Laundering', aml.intro)
    aml.items.forEach((i) => t.push(`- ${i.label}${i.note ? ` (${i.note})` : ''}`))
  }
  if (inp.smartVault) t.push('', 'SmartVault', SMARTVAULT_TEXT)
  t.push('', closing, '', 'Best Regards', '', 'Roger', '', 'Abacus Consultancy', 'PO Box 3653', 'Wokingham', 'RG40 9NN')
  t.push('Tel: 0844 940 98 96 (Voicemail Only)', 'web: http://www.abacusconsultancy.co.uk')

  // ---------- HTML ----------
  const p = (inner: string, extra = '') =>
    `<p style="margin:0 0 16px 0;font-family:${SERIF};font-size:15px;line-height:1.65;color:${C.ink};${extra}">${inner}</p>`
  const h = (text: string) =>
    `<div style="font-family:${SANS};font-size:12px;font-weight:bold;letter-spacing:1px;text-transform:uppercase;color:${C.teal};margin:0 0 8px 0;">${esc(text)}</div>`

  const fileRows = inp.files
    .map(
      (f) => `
      <tr>
        <td width="44" style="padding:10px 0 10px 14px;border-top:1px solid ${C.line};vertical-align:middle;">
          <div style="width:30px;height:36px;background-color:${C.navy};border-radius:3px;text-align:center;font-family:${SANS};font-size:9px;font-weight:bold;line-height:36px;color:#FFFFFF;">PDF</div>
        </td>
        <td style="padding:10px 14px 10px 8px;border-top:1px solid ${C.line};vertical-align:middle;">
          <div style="font-family:${SANS};font-size:14px;font-weight:bold;color:${C.navy};">${esc(f.description)}</div>
          <div style="font-family:${SANS};font-size:12px;color:${C.slate};margin-top:2px;">${esc(f.name)}</div>
        </td>
      </tr>`,
    )
    .join('')

  const paymentsBox = inp.payments.length
    ? `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 22px 0;">
      <tr><td style="background-color:${C.redLight};border:1px solid #F0C4C4;border-radius:6px;padding:14px 18px;">
        <div style="font-family:${SANS};font-size:12px;font-weight:bold;letter-spacing:1px;text-transform:uppercase;color:${C.red};margin-bottom:8px;">Payments due</div>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          ${inp.payments
            .map(
              (x) => `<tr>
            <td style="padding:3px 0;font-family:${SANS};font-size:14px;color:${C.ink};">${esc(x.title)}<span style="color:${C.slate};font-size:12px;"> &middot; due ${esc(x.dueText)}</span></td>
            <td align="right" style="padding:3px 0;font-family:${SANS};font-size:15px;font-weight:bold;color:${C.red};">${gbp(x.amount)}</td>
          </tr>`,
            )
            .join('')}
        </table>
        <div style="font-family:${SANS};font-size:12px;color:${C.slate};margin-top:8px;">Full payment details and references are in the Information Sheet.</div>
      </td></tr>
    </table>`
    : ''

  const amlBlock = aml
    ? `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 22px 0;">
      <tr><td style="border-left:4px solid ${C.teal};background-color:${C.tealLight};padding:14px 18px;border-radius:0 6px 6px 0;">
        ${h('Money Laundering')}
        <div style="font-family:${SERIF};font-size:15px;line-height:1.6;color:${C.ink};margin-bottom:6px;">${esc(aml.intro)}</div>
        <ul style="margin:0;padding:0 0 0 20px;font-family:${SERIF};font-size:15px;line-height:1.7;color:${C.ink};">
          ${aml.items.map((i) => `<li>${esc(i.label)}${i.note ? ` <span style="color:${C.slate};">&ndash; ${esc(i.note)}</span>` : ''}</li>`).join('')}
        </ul>
      </td></tr>
    </table>`
    : ''

  const smartBlock = inp.smartVault
    ? `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 22px 0;">
      <tr><td style="border:1px solid ${C.line};border-radius:6px;padding:14px 18px;">
        ${h('SmartVault')}
        <div style="font-family:${SERIF};font-size:15px;line-height:1.6;color:${C.ink};">${esc(SMARTVAULT_TEXT)}</div>
      </td></tr>
    </table>`
    : ''

  const logo = inp.logoUrl
    ? `<img src="${esc(inp.logoUrl)}" width="220" alt="Abacus Consultancy" style="display:block;border:0;max-width:220px;height:auto;">`
    : `<div style="font-family:${SERIF};font-size:19px;color:${C.navy};">Abacus Consultancy</div>`

  const html = `<!doctype html>
<html>
  <body style="margin:0;padding:0;background-color:${C.paper};">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${C.paper};padding:28px 12px;">
      <tr><td align="center">
        <table role="presentation" width="620" cellpadding="0" cellspacing="0" style="max-width:620px;width:100%;background-color:#FFFFFF;border:1px solid ${C.line};border-radius:8px;overflow:hidden;">
          <tr><td style="background-color:${C.navy};height:6px;line-height:6px;font-size:0;">&nbsp;</td></tr>
          <tr><td style="padding:24px 32px 6px 32px;">${logo}</td></tr>
          <tr><td style="padding:14px 32px 30px 32px;">
            ${p(esc(hi), 'font-size:17px;margin-bottom:10px;')}
            ${p('Please find attached the following:-', 'margin-bottom:12px;')}
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px 0;border-bottom:1px solid ${C.line};">
              ${fileRows.replace(/^\s*<tr>/, '<tr>')}
            </table>
            ${paymentsBox}
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 22px 0;">
              <tr><td style="background-color:${C.navy};border-radius:6px;padding:14px 18px;font-family:${SERIF};font-size:15px;line-height:1.5;color:#FFFFFF;">
                <strong>Please read the covering letter,</strong> which explains what to do next.
              </td></tr>
            </table>
            ${amlBlock}
            ${smartBlock}
            ${p(esc(closing))}
            ${p('Best Regards', 'margin-bottom:4px;')}
            ${p('Roger', 'margin-bottom:0;')}
          </td></tr>
          <tr><td style="padding:18px 32px 24px 32px;border-top:1px solid ${C.line};background-color:#FBFCFD;">
            <div style="font-family:${SANS};font-size:12px;line-height:1.6;color:${C.slate};">
              <strong style="color:${C.navy};">Abacus Consultancy</strong><br>
              PO Box 3653, Wokingham, RG40 9NN<br>
              Tel: 0844 940 98 96 (Voicemail Only) &middot; Fax: 0844 940 98 90<br>
              <a href="http://www.abacusconsultancy.co.uk" style="color:${C.teal};">www.abacusconsultancy.co.uk</a>
            </div>
            <div style="font-family:${SANS};font-size:11px;line-height:1.5;color:#8792A0;margin-top:12px;">
              Abacus Consultancy Services Limited. Company Number: 09582349<br>
              Registered Office: Abacus Consultancy, PO Box 3653, Wokingham. RG40 9NN
            </div>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`

  return { html, text: t.join('\n') }
}
