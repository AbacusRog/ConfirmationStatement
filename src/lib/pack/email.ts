// Builds the client email for the Accounts Pack. It runs in the browser so the
// preview the user sees is exactly the HTML that is sent. The wording and
// layout follow Roger's own example email as closely as the dynamic parts
// (the file list, the AML line, the payments) allow.

import { ordinal, type Pence } from './money'

export const AML_OPTIONS = [
  { id: 'passport', label: 'Passport', phrase: 'an updated copy of your passport', address: false },
  { id: 'licence', label: 'Driving Licence', phrase: 'an updated copy of your driving licence', address: false },
  { id: 'utility', label: 'Current Utility Bill or Mobile Phone Bill', phrase: 'an updated utility bill or mobile phone bill', address: true },
  { id: 'bank', label: 'Personal Bank Statement', phrase: 'a personal bank statement', address: true },
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

const SERIF = "Georgia,'Times New Roman',serif"
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** "Child And Family Advisory Service Limited - Period Ended 31st March 2026" */
export function defaultSubject(companyName: string, periodEndISO: string | null): string {
  if (!periodEndISO) return companyName
  const [y, m, d] = periodEndISO.split('-').map(Number)
  const monthName = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][m - 1]
  return `${companyName} - Period Ended ${ordinal(d)} ${monthName} ${y}`
}

/** "Can I please get an updated utility bill or personal bank statement showing your home address on it." */
export function amlSentence(aml: AmlId[]): string | null {
  if (!aml.length) return null
  const chosen = AML_OPTIONS.filter((o) => aml.includes(o.id))
  const phrases = chosen.map((o) => o.phrase)
  const list = phrases.length === 1 ? phrases[0] : `${phrases.slice(0, -1).join(', ')} or ${phrases[phrases.length - 1]}`
  const hasAddress = chosen.some((o) => o.address)
  return `Can I please get ${list}${hasAddress ? ' showing your home address on it' : ''}.`
}

export const SMARTVAULT_TEXT =
  'I have sent you a separate email invite to SmartVault. This is a secure document storage area where you can access all of your records. You can also upload any documents to me.'

const closing = 'If you have any queries, then please do not hesitate to contact me.'

export function buildPackEmail(inp: PackEmailInput): { html: string; text: string } {
  const aml = amlSentence(inp.aml)
  const hi = inp.forename.trim() ? `Hi ${inp.forename.trim()}` : 'Hi'

  // ---------- plain-text alternative ----------
  const t: string[] = [hi, '', 'Please find attached the following:-', '']
  inp.files.forEach((f) => t.push(`[${f.name}] – ${f.description}`))
  t.push('', 'Please read the covering letter, which explains what to do next.')
  if (aml) t.push('', 'Money Laundering', aml)
  if (inp.smartVault) t.push('', 'SmartVault', SMARTVAULT_TEXT)
  t.push('', closing, '', 'Best Regards', '', 'Roger', '', 'Abacus Consultancy', 'PO Box 3653', 'Wokingham', 'RG40 9NN')
  t.push('Tel: 0844 940 98 96 (Voicemail Only)', 'Fax: 0844 940 98 90', '', 'web: http://www.abacusconsultancy.co.uk')
  t.push('', 'Abacus Consultancy Services Limited. Company Number: 09582349')
  t.push('Registered Office', 'Abacus Consultancy, PO Box 3653, Wokingham. RG40 9NN')

  // ---------- HTML (same wording and order, laid out for an email) ----------
  const p = (inner: string, extra = '') =>
    `<p style="margin:0 0 16px 0;font-family:${SERIF};font-size:15px;line-height:1.6;color:#1F2933;${extra}">${inner}</p>`

  const fileLines = inp.files.map((f) => `[${esc(f.name)}] &ndash; ${esc(f.description)}`).join('<br>')

  const amlHtml = aml
    ? `${p('<strong>Money Laundering</strong>', 'margin-bottom:4px;')}${p(esc(aml))}`
    : ''
  const smartHtml = inp.smartVault
    ? `${p('<strong>SmartVault</strong>', 'margin-bottom:4px;')}${p(esc(SMARTVAULT_TEXT))}`
    : ''

  const logo = inp.logoUrl
    ? `<img src="${esc(inp.logoUrl)}" width="200" alt="Abacus Consultancy" style="display:block;border:0;max-width:200px;height:auto;margin-bottom:18px;">`
    : ''

  const html = `<!doctype html>
<html>
  <body style="margin:0;padding:0;background-color:#FFFFFF;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr><td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
          <tr><td style="padding:28px 24px;">
            ${logo}
            ${p(esc(hi))}
            ${p('Please find attached the following:-')}
            ${p(fileLines)}
            ${p('Please read the covering letter, which explains what to do next.')}
            ${amlHtml}
            ${smartHtml}
            ${p(esc(closing))}
            ${p('Best Regards', 'margin-bottom:4px;')}
            ${p('Roger', 'margin-bottom:20px;')}
            <div style="font-family:${SERIF};font-size:13px;line-height:1.6;color:#1F2933;">
              Abacus Consultancy<br>
              PO Box 3653<br>
              Wokingham<br>
              RG40 9NN<br>
              Tel: 0844 940 98 96 (Voicemail Only)<br>
              Fax: 0844 940 98 90<br>
              <br>
              web: <a href="http://www.abacusconsultancy.co.uk" style="color:#1F2933;">http://www.abacusconsultancy.co.uk</a>
            </div>
            <div style="font-family:${SERIF};font-size:11px;line-height:1.6;color:#5F6B7A;margin-top:18px;">
              Abacus Consultancy Services Limited. Company Number: 09582349<br>
              Registered Office<br>
              Abacus Consultancy, PO Box 3653, Wokingham. RG40 9NN
            </div>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`

  return { html, text: t.join('\n') }
}
