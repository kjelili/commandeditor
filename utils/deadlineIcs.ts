// ─── DEADLINE → ICS EXTRACTION ─────────────────────────────────────────────
// Contracts, court filings, grant calls and tender docs are full of dates
// that matter. This finds them, lets the user curate the list, and exports a
// standard .ics file that drops straight into Google/Apple/Outlook Calendar
// (with a 1-day-before reminder). Builds on extractTimeline's date patterns.

import { extractTimeline } from '@/utils/documentIntelligence'

export interface DeadlineEvent {
  id: string
  date: Date
  title: string        // editable; defaults to a trimmed context
  context: string
  page: number
  selected: boolean
}

const MONTHS: Record<string, number> = {
  january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
  july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
}

export function parseDateFlexible(s: string): Date | null {
  const t = s.trim()
  // ISO: 2026-08-17
  let m = t.match(/^(\d{4})[-\/](\d{2})[-\/](\d{2})$/)
  if (m) return new Date(+m[1], +m[2] - 1, +m[3], 9, 0)
  // Slash/dot numeric — treat as US MM/DD/YYYY (CommandEditor's largest market)
  m = t.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/)
  if (m) {
    let y = +m[3]; if (y < 100) y += 2000
    const mo = +m[1] - 1, d = +m[2]
    if (mo >= 0 && mo < 12 && d >= 1 && d <= 31) return new Date(y, mo, d, 9, 0)
    return null
  }
  // Month D, YYYY
  m = t.match(/^([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})$/)
  if (m && MONTHS[m[1].toLowerCase()] !== undefined)
    return new Date(+m[3], MONTHS[m[1].toLowerCase()], +m[2], 9, 0)
  // D Month YYYY
  m = t.match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/)
  if (m && MONTHS[m[2].toLowerCase()] !== undefined)
    return new Date(+m[3], MONTHS[m[2].toLowerCase()], +m[1], 9, 0)
  return null
}

// Guess a short title from the sentence around the date.
function titleFromContext(context: string, dateStr: string): string {
  const idx = context.toLowerCase().indexOf(dateStr.toLowerCase())
  const before = context.slice(0, idx).replace(/[.…]+$/, '')
  const tail = before.split(/[.;]/).pop()?.trim() || ''
  const title = (tail.length > 6 ? tail : context).replace(/\s+/g, ' ').slice(0, 70)
  return title.charAt(0).toUpperCase() + title.slice(1)
}

export async function extractDeadlines(file: File): Promise<DeadlineEvent[]> {
  const pdfjs = await import('pdfjs-dist')
  pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'
  const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise
  const textByPage: Array<{ page: number; text: string }> = []
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p)
    const tc = await page.getTextContent()
    textByPage.push({ page: p, text: tc.items.map((it: any) => it.str).join(' ') })
    page.cleanup()
  }
  await doc.destroy()

  const events = extractTimeline(textByPage)
  const out: DeadlineEvent[] = []
  const seen = new Set<string>()
  for (const e of events) {
    const date = parseDateFlexible(e.date)
    if (!date) continue
    const key = `${date.toDateString()}:${titleFromContext(e.context, e.date)}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push({
      id: `dl-${out.length}`,
      date,
      title: titleFromContext(e.context, e.date),
      context: e.context,
      page: e.page,
      selected: true,
    })
  }
  return out.sort((a, b) => a.date.getTime() - b.date.getTime())
}

function icsEscape(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n')
}

function icsDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}T${p(d.getHours())}${p(d.getMinutes())}00`
}

export function buildIcs(events: DeadlineEvent[], calendarName = 'CommandEditor Deadlines'): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//CommandEditor//Deadline Extractor//EN',
    `X-WR-CALNAME:${icsEscape(calendarName)}`,
  ]
  for (const e of events) {
    const uid = `${e.id}-${Date.now()}@commandeditor.com`
    lines.push(
      'BEGIN:VEVENT',
      `UID:${uid}`,
      `DTSTAMP:${icsDate(new Date())}`,
      `DTSTART:${icsDate(e.date)}`,
      `DTEND:${icsDate(new Date(e.date.getTime() + 30 * 60000))}`,
      `SUMMARY:${icsEscape(e.title)}`,
      `DESCRIPTION:${icsEscape(`Source: page ${e.page} — ${e.context}`)}`,
      'BEGIN:VALARM',
      'TRIGGER:-P1D',
      'ACTION:DISPLAY',
      `DESCRIPTION:${icsEscape(e.title)}`,
      'END:VALARM',
      'END:VEVENT',
    )
  }
  lines.push('END:VCALENDAR')
  return lines.join('\r\n')
}
