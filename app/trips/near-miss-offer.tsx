'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import { friendlyError } from '@/utils/friendly-error'
import { formatRupees, formatTime } from '@/utils/format'
import type { Trip } from '@/utils/trips'
import { useToast } from '../toast'

type NearMiss = {
  extra_wait_minutes: number
  other_ready_at: string
  drop_gap_km: number
  my_estimated_share: number
  my_solo_estimate: number
  saving_percent: number
}

// "A rider going 2 km from your drop will be out at 8:47 PM. Wait 12 more min?"
// Checks when shown, then every minute, while the trip is still looking.
export default function NearMissOffer({ trip, onAccepted }: { trip: Trip; onAccepted: () => void }) {
  const toast = useToast()
  const [supabase] = useState(() => createClient())
  const [offer, setOffer] = useState<NearMiss | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (trip.status !== 'open') return
    let stopped = false
    const check = async () => {
      const { data, error } = await supabase.rpc('near_miss', { p_trip_id: trip.id })
      if (stopped) return
      setOffer(error ? null : ((data as NearMiss[] | null)?.[0] ?? null))
    }
    check()
    const timer = setInterval(check, 60_000)
    return () => {
      stopped = true
      clearInterval(timer)
    }
  }, [supabase, trip.id, trip.status, trip.ready_until])

  if (trip.status !== 'open' || !offer) return null

  const accept = async () => {
    setBusy(true)
    const { error } = await supabase.rpc('extend_wait', { p_trip_id: trip.id, p_extra_minutes: offer.extra_wait_minutes })
    setBusy(false)
    if (error) return toast(friendlyError(error))
    toast(`Okay! You'll wait ${offer.extra_wait_minutes} more min.`, 'success')
    setOffer(null)
    onAccepted()
  }

  return (
    <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50">
      <p className="text-xs text-amber-900 dark:text-amber-200 leading-relaxed">
        A rider going {offer.drop_gap_km} km from your drop will be out at {formatTime(offer.other_ready_at)}.
        Wait {offer.extra_wait_minutes} more min and pay ~{formatRupees(offer.my_estimated_share)} instead of{' '}
        {formatRupees(offer.my_solo_estimate)}?
      </p>
      <button
        onClick={accept}
        disabled={busy}
        className="mt-2 text-xs font-semibold px-3 py-2 rounded-full transition-all disabled:opacity-50 bg-amber-400 hover:bg-amber-500 text-zinc-950"
      >
        {busy ? 'Updating...' : 'Wait'}
      </button>
    </div>
  )
}
