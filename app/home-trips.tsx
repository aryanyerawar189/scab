'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/utils/supabase/client'
import { TRIP_COLUMNS, type Trip, isActive, isAirport, isAroundNow, sortTrips } from '@/utils/trips'
import TripCard from './trip-card'
import { Icon } from './ui/icons'
import { SectionTitle } from './ui/kit'

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
      .is('hidden_at', null)
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

  const upcoming = trips.filter(isActive)
  const past = trips.filter((t) => !isActive(t))
  const removeTrip = (id: string) => setTrips((all) => all.filter((t) => t.id !== id))

  const card = (trip: Trip) => (
    <TripCard
      key={trip.id}
      trip={trip}
      now={now}
      highlighted={trip.id === highlightId}
      onChanged={refetch}
      onDeleted={() => removeTrip(trip.id)}
    />
  )

  return (
    <div className="space-y-8">
      {currentTrip && (
        <button
          onClick={goToCurrentTrip}
          className="w-full flex items-center gap-4 p-4 rounded-xl bg-ink text-canvas text-left active:opacity-90"
        >
          <span className="flex-1 min-w-0">
            <span className="block font-bold">Your scheduled ride is on</span>
            <span className="block text-sm opacity-70 mt-0.5">
              Tap &ldquo;{isAirport(currentTrip) ? 'I’m out' : 'I’m ready'}&rdquo; when you are
            </span>
          </span>
          <Icon.ArrowRight className="size-5" />
        </button>
      )}

      {/* "Where to?" */}
      <Link
        href="/trips/live"
        className="flex items-center gap-3 h-14 pl-5 pr-2 rounded-full bg-surface-2 hover:bg-line transition-colors"
      >
        <Icon.Search className="size-5" />
        <span className="flex-1 text-lg font-semibold">Where to?</span>
        <span className="h-10 px-3.5 rounded-full bg-surface flex items-center gap-1.5 text-sm font-medium">
          <Icon.Clock className="size-4" /> Now
        </span>
      </Link>

      {/* Shortcuts */}
      <section>
        <SectionTitle>Suggestions</SectionTitle>
        <div className="grid grid-cols-2 gap-3">
          <Shortcut href="/trips/live" icon={<Icon.Zap className="size-7" />} label="Leave now" />
          <Shortcut href="/trips/new" icon={<Icon.Calendar className="size-7" />} label="Schedule" />
        </div>
      </section>

      {trips.length === 0 ? (
        <HowItWorks />
      ) : (
        <>
          {upcoming.length > 0 && (
            <section>
              <SectionTitle>Upcoming</SectionTitle>
              <ul className="divide-y divide-line">{upcoming.map(card)}</ul>
            </section>
          )}
          {past.length > 0 && (
            <section>
              <SectionTitle>Past</SectionTitle>
              <ul className="divide-y divide-line">{past.map(card)}</ul>
            </section>
          )}
        </>
      )}
    </div>
  )
}

function Shortcut({ href, icon, label }: { href: string; icon: React.ReactNode; label: string }) {
  return (
    <Link
      href={href}
      className="h-24 rounded-xl bg-surface-2 hover:bg-line transition-colors flex flex-col items-center justify-center gap-2"
    >
      {icon}
      <span className="text-sm font-medium">{label}</span>
    </Link>
  )
}

// Empty state: explain the product in three steps instead of a bare "no trips"
function HowItWorks() {
  const steps = [
    { icon: <Icon.MapPin className="size-5" />, title: 'Post your ride', body: 'Airport terminal or any address, now or later.' },
    { icon: <Icon.Users className="size-5" />, title: 'Get a co-rider', body: 'Someone leaving with you, heading your way.' },
    { icon: <Icon.Rupee className="size-5" />, title: 'Split the fare', body: 'One cab, each pays about half. Settle on UPI.' },
  ]
  return (
    <section>
      <SectionTitle>How SCab works</SectionTitle>
      <div>
        <ol className="space-y-5 pt-2">
          {steps.map((s, i) => (
            <li key={s.title} className="flex gap-4">
              <span className="relative size-12 rounded-full bg-surface-2 text-ink flex items-center justify-center">
                {s.icon}
                <span className="absolute -top-1.5 -right-1.5 size-[18px] rounded-full bg-ink text-canvas text-[10px] font-bold flex items-center justify-center">
                  {i + 1}
                </span>
              </span>
              <div>
                <p className="font-medium">{s.title}</p>
                <p className="text-sm text-ink-2">{s.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}
