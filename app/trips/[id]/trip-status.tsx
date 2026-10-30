'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/utils/supabase/client'
import { friendlyError } from '@/utils/friendly-error'
import { dayPhrase, formatRupees, formatTime } from '@/utils/format'
import { TRIP_COLUMNS, type Trip, uberSoloLink } from '@/utils/trips'
import { useToast } from '@/app/toast'
import NearMissOffer from '../near-miss-offer'

type MyMatch = {
  match_id: string
  accepted: boolean | null
  estimated_share: number | null
  matches: {
    status: 'proposed' | 'confirmed' | 'booked' | 'completed' | 'cancelled'
    meeting_point: string | null
    saving_percent: number | null
    accept_deadline: string
    walker_id: string | null // the rider who walks to the meeting point (address pickups)
    walk_m: number | null
  }
}

const primaryButton =
  'block w-full text-center bg-amber-400 hover:bg-amber-500 text-zinc-950 font-bold py-4 px-4 rounded-2xl transition-all shadow-sm disabled:opacity-50'
const secondaryButton =
  'block w-full text-center bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800 font-semibold py-3.5 px-4 rounded-2xl transition-all disabled:opacity-50'

// "12:05"
function countdown(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

// One trip, live: searching (with countdown) → co-rider found, or → no co-rider.
// Updates via Realtime on the trip and its match, plus a catch-up on tab focus.
export default function TripStatus({ initialTrip, userId }: { initialTrip: Trip; userId: string }) {
  const toast = useToast()
  const [supabase] = useState(() => createClient())
  const [trip, setTrip] = useState(initialTrip)
  const [match, setMatch] = useState<MyMatch | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const [busy, setBusy] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    const { data } = await supabase.from('trips').select(TRIP_COLUMNS).eq('id', initialTrip.id).single()
    if (!data) return
    const fresh = data as Trip
    setTrip(fresh)

    if (fresh.status === 'matched' || fresh.status === 'completed') {
      const { data: m } = await supabase
        .from('match_members')
        .select('match_id, accepted, estimated_share, matches!inner(status, meeting_point, saving_percent, accept_deadline, walker_id, walk_m)')
        .eq('trip_id', fresh.id)
        .neq('matches.status', 'cancelled')
        .maybeSingle()
      setMatch((m as MyMatch | null) ?? null)
    } else {
      setMatch(null)
    }
  }, [supabase, initialTrip.id])

  // Countdown tick
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])

  // Live updates for this trip and its match (accept / confirm), plus catch-up when the tab returns
  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null
    let stopped = false

    supabase.realtime.setAuth().then(() => {
      if (stopped) return
      refetch() // also loads the match on first show
      channel = supabase
        .channel(`trip-${initialTrip.id}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'trips', filter: `id=eq.${initialTrip.id}` }, () =>
          refetch()
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'match_members', filter: `trip_id=eq.${initialTrip.id}` },
          () => refetch()
        )
        .subscribe()
    })

    const onVisible = () => {
      if (document.visibilityState === 'visible') refetch()
    }
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      stopped = true
      document.removeEventListener('visibilitychange', onVisible)
      if (channel) supabase.removeChannel(channel)
    }
  }, [supabase, initialTrip.id, refetch])

  // The match row itself (proposed → confirmed) isn't on the trip: watch it once we know it
  const matchId = match?.match_id
  useEffect(() => {
    if (!matchId) return
    const channel = supabase
      .channel(`match-${matchId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'matches', filter: `id=eq.${matchId}` }, () =>
        refetch()
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [supabase, matchId, refetch])

  const cancelSearch = async () => {
    const { data, error } = await supabase
      .from('trips')
      .update({ status: 'cancelled' })
      .eq('id', trip.id)
      .eq('status', 'open')
      .select('id')
    if (error) {
      toast(friendlyError(error, "We couldn't stop the search. Please try again."))
      return false
    }
    if (!data?.length) {
      toast('A co-rider was just found!', 'success')
      refetch()
      return false
    }
    return true
  }

  const cancel = async () => {
    if (!window.confirm('Stop looking for a co-rider?')) return
    setBusy('cancel')
    if (await cancelSearch()) {
      toast('Search cancelled', 'success')
      refetch()
    }
    setBusy(null)
  }

  // Booking solo while still searching: stop the search first so we never match a rider who has left
  const bookSoloNow = async () => {
    if (!window.confirm('Stop looking and book a cab on your own?')) return
    setBusy('solo')
    if (await cancelSearch()) {
      window.location.href = uberSoloLink(trip)
      return
    }
    setBusy(null)
  }

  const respond = async (accept: boolean) => {
    if (!match) return
    setBusy(accept ? 'accept' : 'decline')
    const { error } = await supabase.rpc('respond_to_match', { p_match_id: match.match_id, p_accept: accept })
    setBusy(null)
    if (error) return toast(friendlyError(error))
    if (!accept) toast("Okay, we'll keep looking.", 'success')
    refetch()
  }

  const readyFrom = Date.parse(trip.ready_from)
  const readyUntil = Date.parse(trip.ready_until)

  // ---------- Looking ----------
  // (1 min of slack: a live trip starts "now" by the server's clock, which may be ahead of the phone's)
  if (trip.status === 'open' && now < readyFrom - 60_000) {
    return (
      <Screen icon="🗓" title="Ride scheduled">
        <p>
          We&apos;ll look for co-riders leaving <strong>{trip.pickup_label}</strong> between{' '}
          <strong>{formatTime(trip.ready_from)}</strong> and <strong>{formatTime(trip.ready_until)}</strong>
          {dayPhrase(trip.ready_from)}.
        </p>
        <Route trip={trip} />
        <div className="space-y-2.5 pt-2">
          <Link href="/" className={primaryButton}>
            Back to my trips
          </Link>
          <button onClick={cancel} disabled={busy !== null} className={secondaryButton}>
            {busy === 'cancel' ? 'Cancelling...' : 'Cancel ride'}
          </button>
        </div>
      </Screen>
    )
  }

  if (trip.status === 'open') {
    const total = Math.max(1, readyUntil - readyFrom)
    const left = Math.max(0, readyUntil - now)
    return (
      <div className="space-y-5">
        <div className="bg-white dark:bg-zinc-900 rounded-3xl p-6 border border-zinc-200/80 dark:border-zinc-800 shadow-sm text-center">
          <div className="relative w-28 h-28 mx-auto mb-6 flex items-center justify-center">
            <span className="absolute inset-0 rounded-full bg-amber-400/30 animate-ping" />
            <span className="absolute inset-3 rounded-full bg-amber-400/40 animate-ping [animation-delay:500ms]" />
            <span className="relative w-16 h-16 rounded-full bg-amber-400 flex items-center justify-center text-3xl shadow">
              🚕
            </span>
          </div>
          <h2 className="text-lg font-bold">Looking for a co-rider…</h2>
          <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-1">
            Someone leaving with you, heading your way.
          </p>

          <div className="mt-5">
            <div className="h-1.5 rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden">
              <div
                className="h-full bg-amber-400 transition-[width] duration-1000 ease-linear"
                style={{ width: `${(left / total) * 100}%` }}
              />
            </div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-2">
              Searching until {formatTime(trip.ready_until)} ·{' '}
              <span className="font-semibold text-zinc-800 dark:text-zinc-200 tabular-nums">{countdown(left)}</span> left
            </p>
          </div>

          <Route trip={trip} />
        </div>

        <NearMissOffer trip={trip} onAccepted={refetch} />

        <div className="space-y-2.5">
          <button onClick={bookSoloNow} disabled={busy !== null} className={secondaryButton}>
            {busy === 'solo' ? 'Opening Uber...' : 'Book solo on Uber instead'}
          </button>
          <button
            onClick={cancel}
            disabled={busy !== null}
            className="block w-full text-center text-sm font-semibold text-zinc-500 hover:text-red-600 dark:hover:text-red-400 py-2"
          >
            {busy === 'cancel' ? 'Cancelling...' : 'Cancel search'}
          </button>
        </div>
      </div>
    )
  }

  // ---------- Matched ----------
  if (trip.status === 'matched') {
    if (!match) {
      return <Screen icon="🎉" title="Co-rider found">Loading details…</Screen>
    }

    const m = match.matches
    const deal = (
      <>
        {match.estimated_share != null && m.saving_percent != null && (
          <p>
            You pay about <strong>{formatRupees(match.estimated_share)}</strong> · you both save{' '}
            <strong>{Math.round(m.saving_percent)}%</strong>
          </p>
        )}
        {m.meeting_point && (
          <p>
            {m.walker_id === userId
              ? <>Walk <strong>{m.walk_m} m</strong> to meet at </>
              : m.walker_id
                ? <>Your co-rider walks to you. Meet at </>
                : <>Meet at </>}
            <strong>{m.meeting_point}</strong>
          </p>
        )}
      </>
    )

    if (m.status === 'proposed' && match.accepted == null) {
      return (
        <Screen icon="🎉" title="We found a co-rider!">
          {deal}
          <p className="text-xs">
            Reply within {countdown(Date.parse(m.accept_deadline) - now)} or the match lapses.
          </p>
          <Route trip={trip} />
          <div className="grid grid-cols-2 gap-2.5 pt-2">
            <button onClick={() => respond(false)} disabled={busy !== null} className={secondaryButton}>
              {busy === 'decline' ? '...' : 'Decline'}
            </button>
            <button onClick={() => respond(true)} disabled={busy !== null} className={primaryButton}>
              {busy === 'accept' ? '...' : 'Accept'}
            </button>
          </div>
        </Screen>
      )
    }

    if (m.status === 'proposed') {
      return (
        <Screen icon="⏳" title="Waiting for your co-rider to accept…">
          {deal}
          <p className="text-xs">They have until {formatTime(m.accept_deadline)} to reply.</p>
          <Route trip={trip} />
        </Screen>
      )
    }

    return (
      <Screen icon="✅" title="Co-rider found">
        {deal}
        <Route trip={trip} />
        <p className="text-xs pt-1">Chat and booking with your co-rider are coming soon.</p>
      </Screen>
    )
  }

  // ---------- Finished ----------
  if (trip.status === 'expired') {
    return (
      <Screen icon="🙁" title="No co-rider this time">
        <p>Sorry, nobody was heading your way in time.</p>
        <Route trip={trip} />
        <div className="space-y-2.5 pt-2">
          <a href={uberSoloLink(trip)} target="_blank" rel="noopener noreferrer" className={primaryButton}>
            Book solo on Uber
          </a>
          <Link href="/" className={secondaryButton}>
            Back to my trips
          </Link>
        </div>
      </Screen>
    )
  }

  return (
    <Screen icon={trip.status === 'completed' ? '🏁' : '✖️'} title={trip.status === 'completed' ? 'Trip completed' : 'Trip cancelled'}>
      <Route trip={trip} />
      <Link href="/" className={`${primaryButton} mt-2`}>
        Back to my trips
      </Link>
    </Screen>
  )
}

function Screen({ icon, title, children }: { icon: string; title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white dark:bg-zinc-900 rounded-3xl p-6 border border-zinc-200/80 dark:border-zinc-800 shadow-sm text-center">
      <div className="w-14 h-14 mx-auto rounded-2xl bg-amber-50 dark:bg-amber-950/40 flex items-center justify-center text-2xl mb-4">
        {icon}
      </div>
      <h2 className="text-lg font-bold mb-2">{title}</h2>
      <div className="text-sm text-zinc-600 dark:text-zinc-400 space-y-2">{children}</div>
    </div>
  )
}

function Route({ trip }: { trip: Trip }) {
  return (
    <div className="mt-4 text-left rounded-2xl bg-zinc-50 dark:bg-zinc-800/60 p-3.5 text-xs space-y-1.5">
      <div className="truncate">
        <span className="text-zinc-400">From</span>{' '}
        <span className="font-medium text-zinc-800 dark:text-zinc-200">{trip.pickup_label}</span>
      </div>
      <div className="truncate">
        <span className="text-zinc-400">To</span>{' '}
        <span className="font-medium text-zinc-800 dark:text-zinc-200">{trip.drop_label}</span>
      </div>
    </div>
  )
}
