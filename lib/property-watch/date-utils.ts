// PropRoster Milestone 11: Property Watch — date-only helpers.
//
// Every date this module touches (lease end_date, insurance expiration_date,
// mortgage maturity_date, ...) is a date-only Postgres `date` column, always
// anchored at T12:00:00 when parsed — the same convention already used
// throughout app/page.tsx (e.g. `new Date(`${item.service_date}T12:00:00`)`)
// to avoid a UTC/local-timezone off-by-one on the day itself.

export function parseDateOnly(iso: string): Date {
  return new Date(`${iso}T12:00:00`)
}

function toIsoDateOnly(d: Date): string {
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/** Whole days from `now` (its calendar date, time-of-day ignored) to `iso`. Negative when `iso` is in the past. */
export function diffDaysFromToday(iso: string, now: Date): number {
  const eventMidnight = parseDateOnly(iso).setHours(0, 0, 0, 0)
  const todayMidnight = new Date(now).setHours(0, 0, 0, 0)
  return Math.round((eventMidnight - todayMidnight) / 86400000)
}

/** `iso` minus `days`, as a new YYYY-MM-DD string. */
export function subtractDays(iso: string, days: number): string {
  const d = parseDateOnly(iso)
  d.setDate(d.getDate() - days)
  return toIsoDateOnly(d)
}

/** "November 30" style — used inside item descriptions. */
export function formatDateDisplay(iso: string): string {
  return parseDateOnly(iso).toLocaleDateString('en-US', { month: 'long', day: 'numeric' })
}
