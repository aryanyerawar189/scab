'use server'

import { createClient } from '@/utils/supabase/server'
import { roadDistancesKm } from '@/utils/ola-maps'
import { friendlyError } from '@/utils/friendly-error'

export type MatchOption = {
  tripId: string
  readyFrom: string
  savingPercent: number
  detourKm: number
  walkM: number
  iWalk: boolean
  dropGapKm: number
  sentRequestId: string | null
  sentExpiresAt: string | null
  receivedRequestId: string | null
  receivedExpiresAt: string | null
}

type Result<T> = ({ ok: true } & T) | { ok: false; error: string }

// Road km from my drop to each other rider's drop, via Ola Maps.
// Drop points come from pair_drop_points(), which needs SCAB_SERVER_SECRET, so only
// this server can read them; browsers never see another rider's drop.
async function dropGaps(
  supabase: Awaited<ReturnType<typeof createClient>>,
  tripId: string,
  otherIds: string[]
): Promise<Record<string, number>> {
  const secret = process.env.SCAB_SERVER_SECRET
  if (!secret || otherIds.length === 0) return {}

  const { data: points, error } = await supabase.rpc('pair_drop_points', {
    p_secret: secret,
    p_trip_id: tripId,
    p_other_trip_ids: otherIds,
  })
  if (error || !points) {
    console.error('pair_drop_points failed:', error)
    return {}
  }

  const mine = points.find((p) => p.trip_id === tripId)
  const others = points.filter((p) => p.trip_id !== tripId)
  if (!mine || others.length === 0) return {}

  const kms = await roadDistancesKm(mine, others)
  const gaps: Record<string, number> = {}
  others.forEach((p, i) => {
    const km = kms[i]
    if (km != null) gaps[p.trip_id] = km
  })
  return gaps
}

// Riders who fit my open ride, best saving first, with the detour measured in road km.
// Falls back to estimated distances if Ola Maps or the secret isn't available.
export async function loadMatchOptions(tripId: string): Promise<Result<{ options: MatchOption[] }>> {
  const supabase = await createClient()

  const { data: rough, error: roughError } = await supabase.rpc('match_options', {
    p_trip_id: tripId,
    p_prefilter: true,
  })
  if (roughError) return { ok: false, error: friendlyError(roughError) }
  if (!rough?.length) return { ok: true, options: [] }

  const gaps = await dropGaps(supabase, tripId, rough.map((o) => o.trip_id))

  const { data, error } = await supabase.rpc('match_options', { p_trip_id: tripId, p_gaps: gaps })
  if (error) return { ok: false, error: friendlyError(error) }

  return {
    ok: true,
    options: (data ?? []).map((o) => ({
      tripId: o.trip_id,
      readyFrom: o.ready_from,
      savingPercent: Number(o.saving_percent),
      detourKm: Number(o.detour_km),
      walkM: Number(o.walk_m),
      iWalk: o.i_walk,
      dropGapKm: Number(o.drop_gap_km),
      sentRequestId: o.sent_request_id,
      sentExpiresAt: o.sent_expires_at,
      receivedRequestId: o.received_request_id,
      receivedExpiresAt: o.received_expires_at,
    })),
  }
}

// Ask a rider to share. 'matched' if they had already asked me.
export async function sendMatchRequest(
  tripId: string,
  otherTripId: string
): Promise<Result<{ status: 'sent' | 'matched' | 'unavailable' }>> {
  const supabase = await createClient()
  const gaps = await dropGaps(supabase, tripId, [otherTripId])

  const { data, error } = await supabase.rpc('request_match', {
    p_trip_id: tripId,
    p_other_trip_id: otherTripId,
    p_drop_gap_km: gaps[otherTripId],
  })
  if (error) return { ok: false, error: friendlyError(error) }
  return { ok: true, status: data as 'sent' | 'matched' | 'unavailable' }
}
