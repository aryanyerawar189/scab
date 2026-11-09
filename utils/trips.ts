export type Trip = {
  id: string
  mode: 'live' | 'scheduled'
  terminal_id: string | null // null = address pickup
  terminal: string | null // terminal code: 'T1', 'T2', … or 'MAIN'; null for address pickups
  pickup_label: string // e.g. 'Kempegowda International Airport Bengaluru, Terminal 1' or 'Forum Mall, Koramangala'
  drop_label: string
  drop_lat: number | null
  drop_lng: number | null
  landing_at: string | null // scheduled airport pickups
  depart_at: string | null // scheduled address pickups ("Leave at")
  wait_minutes: number
  ready_from: string
  ready_until: string
  stage: 'scheduled' | 'landed' | 'out'
  checked_in_at: string | null
  women_only: boolean
  status: 'open' | 'matched' | 'completed' | 'cancelled' | 'expired'
}

export const TRIP_COLUMNS =
  'id, mode, terminal_id, terminal, pickup_label, drop_label, drop_lat, drop_lng, landing_at, depart_at, wait_minutes, ready_from, ready_until, stage, checked_in_at, women_only, status'

export const WAIT_OPTIONS = [10, 15, 20, 30] as const

// Address pickups: how far the rider will walk to meet a co-rider (metres)
export const WALK_OPTIONS = [0, 250, 500, 1000, 2000] as const
export const DEFAULT_WALK_M = 500

// "No", "250 m", "1 km"
export const formatWalk = (m: number) => (m === 0 ? 'No' : m >= 1000 ? `${m / 1000} km` : `${m} m`)

export const isActive = (t: Trip) => t.status === 'open' || t.status === 'matched'

export const isAirport = (t: Trip) => t.terminal_id != null

// When a scheduled trip starts: landing (airport) or leaving (address)
export const scheduledStart = (t: Trip) => t.landing_at ?? t.depart_at

// A scheduled trip that's "on" right now: from an hour before landing / leaving
// until the wait runs out. "I'm leaving now" sends the rider to this trip.
export function isAroundNow(t: Trip, now: number) {
  const start = scheduledStart(t)
  if (t.mode !== 'scheduled' || !isActive(t) || !start) return false
  return now >= Date.parse(start) - 60 * 60 * 1000 && now <= Date.parse(t.ready_until)
}

// Active trips first (soonest first), then past trips (latest first)
export function sortTrips(trips: Trip[]) {
  return [...trips].sort((a, b) => {
    if (isActive(a) !== isActive(b)) return isActive(a) ? -1 : 1
    const diff = Date.parse(a.ready_from) - Date.parse(b.ready_from)
    return isActive(a) ? diff : -diff
  })
}

// Uber universal deep link: pickup = rider's current location, drop pre-filled.
// Each location is a URL-encoded JSON object; the nickname goes in addressLine1.
// https://developer.uber.com/docs/riders/ride-requests/tutorials/deep-links/introduction
export function uberSoloLink(t: Trip) {
  const [nickname, ...rest] = t.drop_label.split(', ')
  const drop = {
    ...(t.drop_lat != null && t.drop_lng != null ? { latitude: t.drop_lat, longitude: t.drop_lng } : {}),
    addressLine1: nickname,
    addressLine2: rest.join(', '),
  }
  const params = new URLSearchParams({ pickup: 'my_location', 'drop[0]': JSON.stringify(drop) })
  return `https://m.uber.com/looking?${params}`
}
