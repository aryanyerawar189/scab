// Date/time helpers. They use the runtime's local timezone, so call them in
// the browser (client-only components) to show the rider's local time.

const pad = (n: number) => String(n).padStart(2, '0')

export const toDateValue = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
export const toTimeValue = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`

// The next :00 or :30 after now
export function nextHalfHour() {
  const d = new Date()
  d.setSeconds(0, 0)
  d.setMinutes(d.getMinutes() < 30 ? 30 : 60)
  return d
}

// "8:15 PM"
export function formatTime(iso: string) {
  return new Date(iso)
    .toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true })
    .toUpperCase()
}

function dayOffset(iso: string) {
  const d = new Date(iso)
  const today = new Date()
  const a = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())
  const b = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())
  return Math.round((a - b) / 86400000)
}

// "Today" / "Tomorrow" / "Sat, 18 Oct"
export function formatDay(iso: string) {
  const offset = dayOffset(iso)
  if (offset === 0) return 'Today'
  if (offset === 1) return 'Tomorrow'
  return new Date(iso).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })
}

// " today" / " tomorrow" / " on Sat, 18 Oct" — to end a sentence
export function dayPhrase(iso: string) {
  const offset = dayOffset(iso)
  if (offset === 0) return ' today'
  if (offset === 1) return ' tomorrow'
  return ` on ${formatDay(iso)}`
}

// "Today, 8:15 – 8:35 PM"
export function formatWindow(fromIso: string, untilIso: string) {
  const sameDay = dayOffset(fromIso) === dayOffset(untilIso)
  const until = sameDay ? formatTime(untilIso) : `${formatDay(untilIso)}, ${formatTime(untilIso)}`
  return `${formatDay(fromIso)}, ${formatTime(fromIso)} – ${until}`
}

export const formatRupees = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`
