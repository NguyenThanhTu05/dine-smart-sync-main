const OFFSET = 7 * 60 * 60 * 1000
export function vietnamDayKey(at: Date = new Date()): string {
  return new Date(at.getTime() + OFFSET).toISOString().slice(0, 10)
}
export function vietnamDayRange(at: Date = new Date()) {
  const start = new Date(`${vietnamDayKey(at)}T00:00:00+07:00`)
  return { start: start.toISOString(), end: new Date(start.getTime() + 86400000).toISOString() }
}
// UI anchors represent calendar dates chosen by the user, rather than instants.
export function vietnamPeriodRange(anchor: Date, mode: 'day'|'week'|'month'|'year') {
  const start = new Date(Date.UTC(anchor.getFullYear(), anchor.getMonth(), anchor.getDate()))
  if (mode === 'week') start.setUTCDate(start.getUTCDate() - (start.getUTCDay() + 6) % 7)
  if (mode === 'month') start.setUTCDate(1)
  if (mode === 'year') { start.setUTCMonth(0, 1) }
  const end = new Date(start)
  if (mode === 'year') end.setUTCFullYear(end.getUTCFullYear()+1)
  else if (mode === 'month') end.setUTCMonth(end.getUTCMonth()+1)
  else end.setUTCDate(end.getUTCDate()+(mode === 'week' ? 7 : 1))
  return { start: new Date(start.getTime()-OFFSET).toISOString(), end: new Date(end.getTime()-OFFSET).toISOString() }
}
export function vietnamParts(at: string) {
  const date = new Date(new Date(at).getTime()+OFFSET)
  return { hour: date.getUTCHours(), day: date.getUTCDay(), date: date.getUTCDate(), month: date.getUTCMonth() }
}
