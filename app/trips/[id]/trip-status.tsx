'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/utils/supabase/client'
import { friendlyError } from '@/utils/friendly-error'
import { dayPhrase, formatRupees, formatTime } from '@/utils/format'
import { TRIP_COLUMNS, type Trip, uberSoloLink } from '@/utils/trips'
import { useRouter } from 'next/navigation'
import { useToast } from '@/app/toast'
import { useConfirm } from '@/app/ui/confirm'
import { Icon } from '@/app/ui/icons'
import { Badge, Card, RouteLine, buttonClass } from '@/app/ui/kit'
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

const primaryButton = buttonClass({ size: 'lg', block: true })
const secondaryButton = buttonClass({ variant: 'secondary', size: 'lg', block: true })
const quietButton = buttonClass({ variant: 'ghost', size: 'md', block: true })

// "12:05"
function countdown(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

// One trip, live: searching (with countdown) → co-rider found, or → no co-rider.
// Updates via Realtime on the trip and its match, plus a catch-up on tab focus.
export default function TripStatus({ initialTrip, userId }: { initialTrip: Trip; userId: string }) {
  const toast = useToast()
  const confirm = useConfirm()
  const router = useRouter()
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
    const ok = await confirm({
      title: 'Stop looking for a co-rider?',
      body: 'Your ride will be cancelled.',
      confirmLabel: 'Stop looking',
      destructive: true,
    })
    if (!ok) return
    setBusy('cancel')
    if (await cancelSearch()) {
      toast('Search cancelled', 'success')
      refetch()
    }
    setBusy(null)
  }

  // Booking solo while still searching: stop the search first so we never match a rider who has left
  const bookSoloNow = async () => {
    const ok = await confirm({
      title: 'Book a cab on your own?',
      body: "We'll stop looking for a co-rider and open Uber.",
      confirmLabel: 'Open Uber',
    })
    if (!ok) return
    setBusy('solo')
    if (await cancelSearch()) {
      window.location.href = uberSoloLink(trip)
      return
    }
    setBusy(null)
  }

  const remove = async () => {
    const ok = await confirm({
      title: 'Delete this ride?',
      body:
        trip.status === 'open'
          ? "We'll stop looking for a co-rider and remove it from your trips."
          : "It'll be removed from your trips.",
      confirmLabel: 'Delete',
      destructive: true,
    })
    if (!ok) return
    setBusy('delete')
    const { error } = await supabase.rpc('delete_trip', { p_trip_id: trip.id })
    if (error) {
      setBusy(null)
      return toast(friendlyError(error))
    }
    toast('Ride deleted', 'success')
    router.push('/')
  }

  const deleteButton = (
    <button onClick={remove} disabled={busy !== null} className={`${quietButton} text-danger hover:text-danger`}>
      <Icon.Trash className="size-4" />
      {busy === 'delete' ? 'Deleting…' : 'Delete ride'}
    </button>
  )

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
      <div className="space-y-4">
        <Screen icon={<Icon.Calendar className="size-7" />} tone="brand" title="Ride scheduled">
          <p>
            We&apos;ll look for co-riders between <strong className="text-ink">{formatTime(trip.ready_from)}</strong> and{' '}
            <strong className="text-ink">{formatTime(trip.ready_until)}</strong>
            {dayPhrase(trip.ready_from)}.
          </p>
        </Screen>
        <RouteCard trip={trip} />
        <div className="space-y-2 pt-2">
          <Link href="/" className={primaryButton}>
            Back to my trips
          </Link>
          <button onClick={cancel} disabled={busy !== null} className={secondaryButton}>
            {busy === 'cancel' ? 'Cancelling…' : 'Cancel ride'}
          </button>
          {deleteButton}
        </div>
      </div>
    )
  }

  if (trip.status === 'open') {
    const total = Math.max(1, readyUntil - readyFrom)
    const left = Math.max(0, readyUntil - now)
    return (
      <div className="space-y-4">
        <Card className="p-6 text-center">
          {/* Pulse rings start at the car's size and grow to the box edge, so nothing clips */}
          <div className="relative size-36 mx-auto mb-4 flex items-center justify-center">
            <span className="absolute size-16 rounded-full bg-brand/20 animate-pulse-ring" />
            <span className="absolute size-16 rounded-full bg-brand/20 animate-pulse-ring [animation-delay:1s]" />
            <span className="relative size-16 rounded-full bg-brand text-on-brand flex items-center justify-center">
              <Icon.Car className="size-7" />
            </span>
          </div>
          <h2 className="text-xl font-bold tracking-tight">Looking for a co-rider…</h2>
          <p className="text-sm text-ink-2 mt-1">Someone leaving with you, heading your way.</p>

          <div className="mt-6">
            <div className="text-4xl font-bold tabular-nums tracking-tight">{countdown(left)}</div>
            <div className="mt-3 h-1.5 rounded-full bg-surface-2 overflow-hidden">
              <div
                className="h-full bg-ink transition-[width] duration-1000 ease-linear rounded-full"
                style={{ width: `${(left / total) * 100}%` }}
              />
            </div>
            <p className="text-[13px] text-ink-3 mt-2">Searching until {formatTime(trip.ready_until)}</p>
          </div>
        </Card>

        <NearMissOffer trip={trip} onAccepted={refetch} />
        <RouteCard trip={trip} />

        <div className="space-y-2 pt-2">
          <button onClick={bookSoloNow} disabled={busy !== null} className={secondaryButton}>
            {busy === 'solo' ? 'Opening Uber…' : 'Book solo on Uber instead'}
          </button>
          <button onClick={cancel} disabled={busy !== null} className={`${quietButton} hover:text-danger`}>
            {busy === 'cancel' ? 'Cancelling…' : 'Cancel search'}
          </button>
        </div>
      </div>
    )
  }

  // ---------- Matched ----------
  if (trip.status === 'matched') {
    if (!match) {
      return (
        <Screen icon={<Icon.Users className="size-7" />} tone="success" title="Co-rider found">
          Loading details…
        </Screen>
      )
    }

    const m = match.matches
    const deal = (
      <Card className="divide-y divide-line">
        {match.estimated_share != null && m.saving_percent != null && (
          <div className="p-4 flex items-center gap-3">
            <span className="size-10 rounded-xl bg-success-soft text-success flex items-center justify-center">
              <Icon.Rupee className="size-5" />
            </span>
            <div className="flex-1">
              <p className="text-[13px] text-ink-3">You pay about</p>
              <p className="text-xl font-bold tabular-nums tracking-tight">{formatRupees(match.estimated_share)}</p>
            </div>
            <Badge tone="success">Save {Math.round(m.saving_percent)}%</Badge>
          </div>
        )}
        {m.meeting_point && (
          <div className="p-4 flex items-center gap-3">
            <span className="size-10 rounded-xl bg-surface-2 text-ink-2 flex items-center justify-center">
              {m.walker_id === userId ? <Icon.Walk className="size-5" /> : <Icon.MapPin className="size-5" />}
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-[13px] text-ink-3">
                {m.walker_id === userId
                  ? `Walk ${m.walk_m} m to meet at`
                  : m.walker_id
                    ? 'Your co-rider walks to you. Meet at'
                    : 'Meet at'}
              </p>
              <p className="font-semibold">{m.meeting_point}</p>
            </div>
          </div>
        )}
        <div className="p-4">
          <RouteLine from={trip.pickup_label} to={trip.drop_label} compact />
        </div>
      </Card>
    )

    if (m.status === 'proposed' && match.accepted == null) {
      return (
        <div className="space-y-4">
          <Screen icon={<Icon.Users className="size-7" />} tone="success" title="We found a co-rider!">
            <p>
              Reply within{' '}
              <strong className="text-ink tabular-nums">{countdown(Date.parse(m.accept_deadline) - now)}</strong> or
              the match lapses.
            </p>
          </Screen>
          {deal}
          <div className="sticky bottom-0 -mx-4 px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] bg-gradient-to-t from-canvas via-canvas to-canvas/0 grid grid-cols-[1fr_2fr] gap-2.5">
            <button onClick={() => respond(false)} disabled={busy !== null} className={secondaryButton}>
              {busy === 'decline' ? '…' : 'Decline'}
            </button>
            <button onClick={() => respond(true)} disabled={busy !== null} className={primaryButton}>
              {busy === 'accept' ? '…' : 'Accept co-rider'}
            </button>
          </div>
        </div>
      )
    }

    if (m.status === 'proposed') {
      return (
        <div className="space-y-4">
          <Screen icon={<Icon.Hourglass className="size-7" />} tone="brand" title="Waiting for your co-rider…">
            <p>They have until {formatTime(m.accept_deadline)} to accept.</p>
          </Screen>
          {deal}
        </div>
      )
    }

    return (
      <div className="space-y-4">
        <Screen icon={<Icon.Check className="size-7" />} tone="success" title="You're riding together">
          <p>Chat and booking with your co-rider are coming soon.</p>
        </Screen>
        {deal}
      </div>
    )
  }

  // ---------- Finished ----------
  if (trip.status === 'expired') {
    return (
      <div className="space-y-4">
        <Screen icon={<Icon.Clock className="size-7" />} tone="neutral" title="No co-rider this time">
          <p>Sorry, nobody was heading your way in time.</p>
        </Screen>
        <RouteCard trip={trip} />
        <div className="space-y-2 pt-2">
          <a href={uberSoloLink(trip)} target="_blank" rel="noopener noreferrer" className={primaryButton}>
            Book solo on Uber <Icon.External className="size-4" />
          </a>
          <Link href="/" className={secondaryButton}>
            Back to my trips
          </Link>
          {deleteButton}
        </div>
      </div>
    )
  }

  const completed = trip.status === 'completed'
  return (
    <div className="space-y-4">
      <Screen
        icon={completed ? <Icon.Check className="size-7" /> : <Icon.X className="size-7" />}
        tone={completed ? 'success' : 'neutral'}
        title={completed ? 'Trip completed' : 'Ride cancelled'}
      />
      <RouteCard trip={trip} />
      <div className="space-y-2 pt-2">
        <Link href="/" className={primaryButton}>
          Back to my trips
        </Link>
        {deleteButton}
      </div>
    </div>
  )
}

const screenTones = {
  brand: 'bg-brand-soft text-brand-ink',
  success: 'bg-success-soft text-success',
  neutral: 'bg-surface-2 text-ink-2',
}

function Screen({
  icon,
  tone,
  title,
  children,
}: {
  icon: React.ReactNode
  tone: keyof typeof screenTones
  title: string
  children?: React.ReactNode
}) {
  return (
    <div className="text-center pt-4 pb-2">
      <div className={`size-16 mx-auto rounded-full flex items-center justify-center mb-4 ${screenTones[tone]}`}>{icon}</div>
      <h2 className="text-2xl font-bold tracking-tight">{title}</h2>
      {children && <div className="mt-2 text-[15px] text-ink-2 leading-relaxed max-w-xs mx-auto space-y-2">{children}</div>}
    </div>
  )
}

function RouteCard({ trip }: { trip: Trip }) {
  return (
    <Card className="p-4">
      <RouteLine from={trip.pickup_label} to={trip.drop_label} compact />
    </Card>
  )
}
