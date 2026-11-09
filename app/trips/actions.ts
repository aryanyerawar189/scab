'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/utils/supabase/server'
import { roadDistanceKm } from '@/utils/ola-maps'
import { friendlyError } from '@/utils/friendly-error'
import { WAIT_OPTIONS, WALK_OPTIONS, type Trip } from '@/utils/trips'
import type { TablesInsert } from '@/types/database.types'

type BaseTripInput = {
  terminalId: string | null // null = address pickup
  pickupLabel: string
  pickupLat: number
  pickupLng: number
  pickupPlaceId: string
  dropLabel: string
  dropLat: number
  dropLng: number
  dropPlaceId: string
  waitMinutes: number
  maxWalkM: number // address pickups: how far they'll walk to meet (ignored for airports)
  womenOnly: boolean
}

export type ScheduledTripInput = BaseTripInput & {
  startAt: string // ISO timestamp: landing time (airport) or leaving time (address)
  checkedBags: boolean // airport only
  isInternational: boolean // airport only
}

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string }

type SavedTrip = Pick<Trip, 'id' | 'terminal' | 'pickup_label' | 'ready_from' | 'ready_until'>

// Drops further than this from the pickup are almost certainly a wrong pick
const MAX_TRIP_KM = 150

// PostGIS point as EWKT text — longitude first, then latitude
function toPoint(lat: number, lng: number) {
  return `SRID=4326;POINT(${lng} ${lat})`
}

// Straight-line km between two points
function straightKm(aLat: number, aLng: number, bLat: number, bLng: number) {
  const rad = (d: number) => (d * Math.PI) / 180
  const x = rad(bLng - aLng) * Math.cos(rad((aLat + bLat) / 2))
  const y = rad(bLat - aLat)
  return 6371 * Math.hypot(x, y)
}

function validateBase(input: BaseTripInput): string | null {
  if (!input.pickupLabel?.trim() || !Number.isFinite(input.pickupLat) || !Number.isFinite(input.pickupLng)) {
    return 'Please pick your pickup from the suggestions.'
  }
  if (!input.dropLabel?.trim() || !Number.isFinite(input.dropLat) || !Number.isFinite(input.dropLng)) {
    return 'Please pick where you are going from the suggestions.'
  }
  const km = straightKm(input.pickupLat, input.pickupLng, input.dropLat, input.dropLng)
  if (km < 1) return 'Your drop is too close to the pickup.'
  if (km > MAX_TRIP_KM) return `SCab covers drops up to ${MAX_TRIP_KM} km from the pickup.`
  if (!(WAIT_OPTIONS as readonly number[]).includes(input.waitMinutes)) return 'Please pick how long you can wait.'
  if (!input.terminalId && !(WALK_OPTIONS as readonly number[]).includes(input.maxWalkM)) {
    return 'Please pick how far you can walk.'
  }
  return null
}

// pickup_location, pickup_label and region_id are NOT NULL, so the generated insert type
// requires them, but the prepare_trip() trigger fills them (from the terminal, or the region
// from the pickup point). Address pickups do send their own pickup.
type TripInsert = Omit<TablesInsert<'trips'>, 'pickup_location' | 'pickup_label' | 'region_id'> &
  Partial<Pick<TablesInsert<'trips'>, 'pickup_location' | 'pickup_label'>>
const asTripInsert = (row: TripInsert) => row as TablesInsert<'trips'>

// Fields shared by live and scheduled trips. Region, ready window, stage and status are
// filled by the database; so is the pickup for airport trips.
async function baseRow(userId: string, input: BaseTripInput): Promise<TripInsert> {
  return {
    user_id: userId,
    ...(input.terminalId
      ? { terminal_id: input.terminalId }
      : { pickup_label: input.pickupLabel.trim(), pickup_location: toPoint(input.pickupLat, input.pickupLng) }),
    pickup_place_id: input.pickupPlaceId || null,
    drop_label: input.dropLabel.trim(),
    drop_location: toPoint(input.dropLat, input.dropLng),
    drop_place_id: input.dropPlaceId || null,
    // null lets the database estimate the road distance
    distance_km: await roadDistanceKm(
      { lat: input.pickupLat, lng: input.pickupLng },
      { lat: input.dropLat, lng: input.dropLng }
    ),
    wait_minutes: input.waitMinutes,
    max_walk_m: input.terminalId ? 0 : input.maxWalkM,
    women_only: Boolean(input.womenOnly),
  }
}

async function getUser() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return { supabase, user }
}

export type LiveTripInput = BaseTripInput

export async function createLiveTrip(input: LiveTripInput): Promise<Result<{ tripId: string }>> {
  const { supabase, user } = await getUser()
  if (!user) return { ok: false, error: 'Your session has expired. Please sign in again.' }

  const invalid = validateBase(input)
  if (invalid) return { ok: false, error: invalid }

  const { data, error } = await supabase
    .from('trips')
    .insert(asTripInsert({ ...(await baseRow(user.id, input)), mode: 'live' }))
    .select('id')
    .single()
  if (error || !data) {
    console.error('Create live trip failed:', error)
    return { ok: false, error: friendlyError(error, "We couldn't post your trip. Please try again.") }
  }

  revalidatePath('/')
  return { ok: true, tripId: data.id }
}

export async function createScheduledTrip(input: ScheduledTripInput): Promise<Result<{ trip: SavedTrip }>> {
  const { supabase, user } = await getUser()
  if (!user) return { ok: false, error: 'Your session has expired. Please sign in again.' }

  const invalid = validateBase(input)
  if (invalid) return { ok: false, error: invalid }

  const airport = Boolean(input.terminalId)
  const startAt = new Date(input.startAt)
  if (Number.isNaN(startAt.getTime())) {
    return { ok: false, error: airport ? 'Please pick your landing date and time.' : 'Please pick when you are leaving.' }
  }

  const { data, error } = await supabase
    .from('trips')
    .insert(asTripInsert({
      ...(await baseRow(user.id, input)),
      mode: 'scheduled',
      ...(airport
        ? {
            landing_at: startAt.toISOString(),
            checked_bags: Boolean(input.checkedBags),
            is_international: Boolean(input.isInternational),
          }
        : { depart_at: startAt.toISOString() }),
    }))
    .select('id, terminal, pickup_label, ready_from, ready_until')
    .single()

  if (error || !data) {
    console.error('Create scheduled trip failed:', error)
    return { ok: false, error: friendlyError(error, "We couldn't schedule your ride. Please try again.") }
  }

  revalidatePath('/')
  // The ready-window trigger fills ready_from / ready_until
  return { ok: true, trip: data as SavedTrip }
}
