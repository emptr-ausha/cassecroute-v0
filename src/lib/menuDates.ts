// Use Paris calendar dates, then UTC arithmetic to avoid DST shifts.
export function nextWeekStart(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now)
  const part = (type: string) => Number(parts.find((value) => value.type === type)!.value)
  const date = new Date(Date.UTC(part('year'), part('month') - 1, part('day')))
  date.setUTCDate(date.getUTCDate() + ((8 - date.getUTCDay()) % 7 || 7))
  return date.toISOString().slice(0, 10)
}

export function previousWeekStart(now = new Date()): string {
  const date = new Date(`${nextWeekStart(now)}T12:00:00Z`)
  date.setUTCDate(date.getUTCDate() - 7)
  return date.toISOString().slice(0, 10)
}
