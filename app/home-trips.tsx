'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/utils/supabase/client'
import { TRIP_COLUMNS, type Trip, isAirport, isAroundNow, sortTrips } from '@/utils/trips'
import TripCard from './trip-card'

const bigButton =
  'block w-full text-left px-5 py-5 rounded-3xl shadow-sm transition-all active:scale-[0.99]'

// Home body: the two big buttons + "My trips", kept live with Supabase Realtime.
// Client-only (see home-trips-loader) because it depends on the current time.
export default function HomeTrips({ userId, initialTrips }: { userId: string; initialTrips: Trip[] }) {
  const [supabase] = useState(() => createClient())
  const [trips, setTrips] = useState(() => sortTrips(initialTrips))
  const [now, setNow] = useState(() => Date.now())
  const [highlightId, setHighlightId] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    const { data, error } = await supabase
      .from('trips')
      .select(TRIP_COLUMNS)
      .eq('user_id', userId)
      .order('ready_from', { ascending: false })
      .limit(30)
    if (!error && data) setTrips(sortTrips(data as Trip[]))
  }, [supabase, userId])

  // Tick so time-based buttons ("Landed", "I'm out") appear on their own
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(timer)
  }, [])

  // Live updates: any change to my trips (matched, expired, …) → reload the list
  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null
    let stopped = false

    supabase.realtime.setAuth().then(() => {
      if (stopped) return
      channel = supabase
        .channel(`my-trips-${userId}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'trips', filter: `user_id=eq.${userId}` }, () =>
          refetch()
        )
        .subscribe()
    })

    // Phones pause background tabs: catch up when the rider comes back
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        setNow(Date.now())
        refetch()
      }
    }
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      stopped = true
      document.removeEventListener('visibilitychange', onVisible)
      if (channel) supabase.removeChannel(channel)
    }
  }, [supabase, userId, refetch])

  const currentTrip = trips.find((t) => isAroundNow(t, now))

  const goToCurrentTrip = () => {
    if (!currentTrip) return
    document.getElementById(`trip-${currentTrip.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    setHighlightId(currentTrip.id)
    setTimeout(() => setHighlightId(null), 2500)
  }

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        {currentTrip ? (
          <button onClick={goToCurrentTrip} className={`${bigButton} bg-amber-400 hover:bg-amber-500 text-zinc-950`}>
            <span className="block text-lg font-bold">🚶 I&apos;m leaving now</span>
            <span className="block text-xs font-medium text-zinc-800 mt-0.5">
              Go to your scheduled trip and tap &ldquo;{isAirport(currentTrip) ? 'I’m out' : 'I’m ready'}&rdquo;
            </span>
          </button>
        ) : (
          <Link href="/trips/live" className={`${bigButton} bg-amber-400 hover:bg-amber-500 text-zinc-950`}>
            <span className="block text-lg font-bold">🚶 I&apos;m leaving now</span>
            <span className="block text-xs font-medium text-zinc-800 mt-0.5">Find a co-rider leaving in the next few minutes</span>
          </Link>
        )}

        <Link
          href="/trips/new"
          className={`${bigButton} bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800/80`}
        >
          <span className="block text-lg font-bold text-zinc-900 dark:text-zinc-100">🗓 Schedule a ride</span>
          <span className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mt-0.5">
            Plan ahead, from a flight or anywhere, and we&apos;ll match you in advance
          </span>
        </Link>
      </div>

      <section>
        <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-100 mb-3">My trips</h2>
        {trips.length === 0 ? (
          <div className="bg-white dark:bg-zinc-900 rounded-3xl p-6 border border-dashed border-zinc-300 dark:border-zinc-700/80 text-center text-sm text-zinc-500 dark:text-zinc-400">
            No trips yet. Landing soon? Post one to find a co-rider!
          </div>
        ) : (
          <ul className="space-y-2.5">
            {trips.map((trip) => (
              <TripCard
                key={trip.id}
                trip={trip}
                now={now}
                highlighted={trip.id === highlightId}
                onChanged={refetch}
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
