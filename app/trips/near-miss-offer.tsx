'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import { friendlyError } from '@/utils/friendly-error'
import { formatTime } from '@/utils/format'
import type { Trip } from '@/utils/trips'
import { useToast } from '../toast'
import { Icon } from '../ui/icons'
import { buttonClass } from '../ui/kit'

type NearMiss = {
  extra_wait_minutes: number
  other_ready_at: string
  drop_gap_km: number
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
    <div className="p-4 rounded-lg bg-brand-soft border border-brand/40">
      <div className="flex gap-3">
        <span className="size-8 rounded-full bg-brand text-on-brand flex items-center justify-center">
          <Icon.Hourglass className="size-4" />
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-ink">
            Wait {offer.extra_wait_minutes} more min and you may save up to {Math.round(offer.saving_percent)}%
          </p>
          <p className="text-[13px] text-ink-2 mt-0.5 leading-snug">
            A rider going {offer.drop_gap_km} km from your drop will be ready at {formatTime(offer.other_ready_at)}.
          </p>
          <button onClick={accept} disabled={busy} className={buttonClass({ variant: 'dark', size: 'sm', className: 'mt-3' })}>
            {busy ? 'Updating…' : `Wait ${offer.extra_wait_minutes} min`}
          </button>
        </div>
      </div>
    </div>
  )
}
