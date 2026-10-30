'use client'

import { useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/utils/supabase/client'
import { friendlyError } from '@/utils/friendly-error'
import { formatDay, formatTime, formatWindow, toDateValue, toTimeValue } from '@/utils/format'
import { type Trip, isActive, isAirport, uberSoloLink } from '@/utils/trips'
import NearMissOffer from './trips/near-miss-offer'
import { useToast } from './toast'

const STATUS: Record<Trip['status'], { label: string; className: string }> = {
  open: { label: 'Looking for a co-rider…', className: 'bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300' },
  matched: { label: 'Co-rider found ✓', className: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300' },
  expired: { label: 'No co-rider this time', className: 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300' },
  cancelled: { label: 'Cancelled', className: 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400' },
  completed: { label: 'Completed', className: 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400' },
}

const smallButton =
  'text-xs font-semibold px-3 py-2 rounded-full transition-all disabled:opacity-50 disabled:cursor-not-allowed'
const greyButton = `${smallButton} text-zinc-700 dark:text-zinc-300 bg-zinc-100 hover:bg-zinc-200/80 dark:bg-zinc-800 dark:hover:bg-zinc-700/80`
const primaryButton = `${smallButton} bg-amber-400 hover:bg-amber-500 text-zinc-950`
const dateInput =
  'w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-800/80 border border-zinc-300 dark:border-zinc-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-500'

export default function TripCard({
  trip,
  now,
  highlighted,
  onChanged,
}: {
  trip: Trip
  now: number
  highlighted: boolean
  onChanged: () => void
}) {
  const toast = useToast()
  const [supabase] = useState(() => createClient())
  const [busy, setBusy] = useState<string | null>(null)
  const [delayOpen, setDelayOpen] = useState(false)
  const [delayDate, setDelayDate] = useState('')
  const [delayTime, setDelayTime] = useState('')

  // Run an action, show a toast, then refresh the list
  const run = async (key: string, action: () => PromiseLike<{ error: unknown }>, success?: string) => {
    setBusy(key)
    try {
      const { error } = await action()
      if (error) {
        toast(friendlyError(error))
        return false
      }
      if (success) toast(success, 'success')
      onChanged()
      return true
    } catch (err) {
      toast(friendlyError(err))
      return false
    } finally {
      setBusy(null)
    }
  }

  const cancel = async () => {
    if (!window.confirm('Cancel this trip?')) return
    setBusy('cancel')
    const { data, error } = await supabase
      .from('trips')
      .update({ status: 'cancelled' })
      .eq('id', trip.id)
      .eq('status', 'open')
      .select('id')
    setBusy(null)
    if (error) return toast(friendlyError(error, "We couldn't cancel this trip. Please try again."))
    if (!data?.length) return toast('This trip can no longer be cancelled.')
    toast('Trip cancelled', 'success')
    onChanged()
  }

  const openDelay = () => {
    const current = new Date(trip.landing_at ?? Date.now())
    setDelayDate(toDateValue(current))
    setDelayTime(toTimeValue(current))
    setDelayOpen(true)
  }

  const submitDelay = async (e: React.FormEvent) => {
    e.preventDefault()
    const newLanding = new Date(`${delayDate}T${delayTime}`)
    if (Number.isNaN(newLanding.getTime())) return toast('Please pick the new landing time.')
    const ok = await run(
      'delay',
      () => supabase.rpc('report_delay', { p_trip_id: trip.id, p_new_landing_at: newLanding.toISOString() }),
      'Landing time updated'
    )
    if (ok) setDelayOpen(false)
  }

  const status = STATUS[trip.status]
  const active = isActive(trip)
  const greyed = trip.status === 'cancelled' || trip.status === 'completed'
  const scheduled = trip.mode === 'scheduled'
  const airport = isAirport(trip)
  // "I'm out" (airport) from landing; "I'm ready" (address) from an hour before leaving
  const canCheckIn = airport
    ? scheduled && trip.landing_at != null && now >= Date.parse(trip.landing_at)
    : scheduled && trip.depart_at != null && now >= Date.parse(trip.depart_at) - 60 * 60 * 1000
  const hasLanded = airport && scheduled && trip.landing_at != null && now >= Date.parse(trip.landing_at)
  const isOut = trip.stage === 'out'

  return (
    <li
      id={`trip-${trip.id}`}
      className={`bg-white dark:bg-zinc-900 rounded-2xl p-4 border shadow-sm scroll-mt-24 transition-all ${
        highlighted ? 'border-amber-500 ring-2 ring-amber-400/60' : 'border-zinc-200/80 dark:border-zinc-800'
      } ${greyed ? 'opacity-55' : ''}`}
    >
      {/* Summary */}
      <div className="flex items-start justify-between gap-3">
        <Link href={`/trips/${trip.id}`} className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 truncate">→ {trip.drop_label}</div>
          <div className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5 truncate">From {trip.pickup_label}</div>
          <div className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
            {formatWindow(trip.ready_from, trip.ready_until)}
          </div>
          <div className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
            {scheduled && trip.landing_at
              ? `Lands ${formatDay(trip.landing_at)}, ${formatTime(trip.landing_at)}`
              : scheduled && trip.depart_at
                ? `Leaves ${formatDay(trip.depart_at)}, ${formatTime(trip.depart_at)}`
                : 'Leaving now'}
            {trip.women_only && ' · Women only'}
          </div>
        </Link>
        <span className="shrink-0 text-[10px] font-bold uppercase tracking-wide text-zinc-400">
          {scheduled ? 'Scheduled' : 'Live'}
        </span>
      </div>

      <span className={`inline-block mt-2.5 px-2.5 py-1 rounded-full text-[11px] font-semibold ${status.className}`}>
        {status.label}
      </span>

      {/* Scheduled: you're out / ready */}
      {scheduled && active && isOut && (
        <p className="mt-2 text-xs font-medium text-zinc-700 dark:text-zinc-300">
          🚶 You&apos;re {airport ? 'out' : 'ready'} · waiting until {formatTime(trip.ready_until)}
        </p>
      )}

      {/* Near-miss offer */}
      <div className="mt-3 empty:hidden">
        <NearMissOffer trip={trip} onAccepted={onChanged} />
      </div>

      {/* Delay form */}
      {delayOpen && (
        <form onSubmit={submitDelay} className="mt-3 p-3 rounded-xl bg-zinc-50 dark:bg-zinc-800/60 space-y-2">
          <p className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">New landing time</p>
          <div className="grid grid-cols-2 gap-2">
            <input
              type="date"
              aria-label="New landing date"
              value={delayDate}
              onChange={(e) => setDelayDate(e.target.value)}
              className={dateInput}
              required
            />
            <input
              type="time"
              aria-label="New landing time"
              value={delayTime}
              onChange={(e) => setDelayTime(e.target.value)}
              className={dateInput}
              required
            />
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={busy !== null} className={primaryButton}>
              {busy === 'delay' ? 'Saving...' : 'Save'}
            </button>
            <button type="button" onClick={() => setDelayOpen(false)} className={greyButton}>
              Close
            </button>
          </div>
        </form>
      )}

      {/* Actions */}
      <div className="mt-3 flex flex-wrap gap-2 empty:hidden">
        {scheduled && active && !isOut && canCheckIn && (
          <button
            onClick={() => run('out', () => supabase.rpc('check_in', { p_trip_id: trip.id }), airport ? "Got it — you're out!" : "Got it — you're ready!")}
            disabled={busy !== null}
            className={primaryButton}
          >
            {busy === 'out' ? 'Updating...' : airport ? "🚶 I'm out" : "🚶 I'm ready"}
          </button>
        )}
        {active && trip.stage === 'scheduled' && hasLanded && (
          <button
            onClick={() => run('landed', () => supabase.rpc('mark_landed', { p_trip_id: trip.id }), 'Marked as landed')}
            disabled={busy !== null}
            className={greyButton}
          >
            {busy === 'landed' ? 'Updating...' : '🛬 Landed'}
          </button>
        )}
        {airport && scheduled && active && !isOut && !delayOpen && (
          <button onClick={openDelay} disabled={busy !== null} className={greyButton}>
            ⏱ Flight delayed?
          </button>
        )}
        {trip.status === 'expired' && (
          <a href={uberSoloLink(trip)} target="_blank" rel="noopener noreferrer" className={primaryButton}>
            Book solo on Uber
          </a>
        )}
        {trip.status === 'open' && (
          <button
            onClick={cancel}
            disabled={busy !== null}
            className={`${greyButton} hover:text-red-600 dark:hover:text-red-400 ml-auto`}
          >
            {busy === 'cancel' ? 'Cancelling...' : 'Cancel'}
          </button>
        )}
      </div>
    </li>
  )
}
