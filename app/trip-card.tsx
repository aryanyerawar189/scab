'use client'

import { useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/utils/supabase/client'
import { friendlyError } from '@/utils/friendly-error'
import { formatDay, formatTime, toDateValue, toTimeValue } from '@/utils/format'
import { type Trip, isActive, isAirport, uberSoloLink } from '@/utils/trips'
import NearMissOffer from './trips/near-miss-offer'
import { useToast } from './toast'
import { useConfirm } from './ui/confirm'
import { Icon } from './ui/icons'
import { OverflowMenu, type MenuItem } from './ui/menu'
import { Badge, buttonClass } from './ui/kit'
import { inputClass } from './trips/form-controls'

const STATUS: Record<Trip['status'], { label: string; tone: 'info' | 'success' | 'neutral' }> = {
  open: { label: 'Looking for a co-rider', tone: 'info' },
  matched: { label: 'Co-rider found', tone: 'success' },
  expired: { label: 'No co-rider this time', tone: 'neutral' },
  cancelled: { label: 'Cancelled', tone: 'neutral' },
  completed: { label: 'Completed', tone: 'neutral' },
}

const primary = buttonClass({ variant: 'primary', size: 'sm' })
const secondary = buttonClass({ variant: 'secondary', size: 'sm' })

export default function TripCard({
  trip,
  now,
  highlighted,
  onChanged,
  onDeleted,
  incomingRequests,
}: {
  trip: Trip
  now: number
  highlighted: boolean
  onChanged: () => void
  onDeleted: () => void
  incomingRequests: number
}) {
  const toast = useToast()
  const confirm = useConfirm()
  const [supabase] = useState(() => createClient())
  const [busy, setBusy] = useState<string | null>(null)
  const [delayOpen, setDelayOpen] = useState(false)
  const [delayDate, setDelayDate] = useState('')
  const [delayTime, setDelayTime] = useState('')

  // Run an action, show a toast, then refresh the list
  const run = async (
    key: string,
    action: () => PromiseLike<{ error: unknown }>,
    success?: string,
    after: () => void = onChanged
  ) => {
    setBusy(key)
    try {
      const { error } = await action()
      if (error) {
        toast(friendlyError(error))
        return false
      }
      if (success) toast(success, 'success')
      after()
      return true
    } catch (err) {
      toast(friendlyError(err))
      return false
    } finally {
      setBusy(null)
    }
  }

  const cancel = async () => {
    const ok = await confirm({
      title: 'Cancel this ride?',
      body: "We'll stop looking for a co-rider.",
      confirmLabel: 'Cancel ride',
      destructive: true,
    })
    if (!ok) return
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
    toast('Ride cancelled', 'success')
    onChanged()
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
    await run('delete', () => supabase.rpc('delete_trip', { p_trip_id: trip.id }), 'Ride deleted', onDeleted)
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

  const menu: MenuItem[] = []
  if (trip.status === 'open') {
    menu.push({ label: 'Cancel ride', icon: <Icon.X className="size-4" />, onSelect: cancel })
  }
  // Matched rides have a co-rider waiting on them: no delete until the match is cancelled
  if (trip.status !== 'matched') {
    menu.push({ label: 'Delete ride', icon: <Icon.Trash className="size-4" />, onSelect: remove, destructive: true })
  }

  const start = scheduled ? (trip.landing_at ?? trip.depart_at) : null
  const when = start ? `${formatDay(start)}, ${formatTime(start)}` : `Live · ${formatDay(trip.ready_from)}, ${formatTime(trip.ready_from)}`

  return (
    <li
      id={`trip-${trip.id}`}
      className={`py-4 scroll-mt-24 transition-[background-color,opacity] ${
        highlighted ? 'bg-surface-2 -mx-4 px-4' : ''
      } ${busy === 'delete' ? 'opacity-50' : ''}`}
    >
      <div>
        <div className="flex items-start gap-3">
          <span className={`size-12 rounded-lg bg-surface-2 flex items-center justify-center ${greyed ? 'text-ink-3' : 'text-ink'}`}>
            {airport ? <Icon.Plane className="size-5" /> : <Icon.MapPin className="size-5" />}
          </span>
          <Link href={`/trips/${trip.id}`} className="flex-1 min-w-0">
            <div className={`font-medium truncate ${greyed ? 'text-ink-2' : 'text-ink'}`}>{trip.drop_label}</div>
            <div className="text-sm text-ink-2 tabular-nums">{airport && start ? `Lands ${when}` : when}</div>
            <div className="text-sm text-ink-3 truncate">From {trip.pickup_label}</div>
          </Link>
          <OverflowMenu label="Ride options" items={menu} />
        </div>

        <div className="mt-2.5 ml-15 flex flex-wrap items-center gap-2">
          <Badge tone={status.tone} dot={trip.status === 'open'}>
            {trip.status === 'matched' && <Icon.Check className="size-3.5" />}
            {status.label}
          </Badge>
          {trip.women_only && (
            <Badge tone="neutral">
              <Icon.Shield className="size-3" /> Women only
            </Badge>
          )}
          {active && <span className="text-xs text-ink-3 tabular-nums">until {formatTime(trip.ready_until)}</span>}
        </div>

        {/* Someone asked to share: the one thing on home that needs a reply */}
        {trip.status === 'open' && incomingRequests > 0 && (
          <Link
            href={`/trips/${trip.id}`}
            className="mt-3 ml-15 flex items-center gap-3 p-3 rounded-lg bg-ink text-canvas"
          >
            <Icon.Users className="size-5" />
            <span className="flex-1 text-sm font-semibold">
              {incomingRequests === 1 ? 'A rider wants to share' : `${incomingRequests} riders want to share`}
            </span>
            <span className="text-sm opacity-80">Reply</span>
            <Icon.ChevronRight className="size-4" />
          </Link>
        )}
        {trip.status === 'open' && incomingRequests === 0 && (
          <Link href={`/trips/${trip.id}`} className="mt-2 ml-15 inline-flex items-center gap-1 text-sm font-medium underline underline-offset-4">
            See co-riders <Icon.ChevronRight className="size-4" />
          </Link>
        )}

        {/* Scheduled: you're out / ready */}
        {scheduled && active && isOut && (
          <p className="mt-3 ml-15 text-sm text-ink-2 flex items-center gap-1.5">
            <Icon.Walk className="size-4" /> You&apos;re {airport ? 'out' : 'ready'} · waiting until{' '}
            {formatTime(trip.ready_until)}
          </p>
        )}

        {/* Near-miss offer */}
        <div className="mt-3 ml-15 empty:hidden">
          <NearMissOffer trip={trip} onAccepted={onChanged} />
        </div>

        {/* Delay form */}
        {delayOpen && (
          <form onSubmit={submitDelay} className="mt-3 ml-15 p-3.5 rounded-lg bg-surface-2 space-y-3">
            <p className="text-[13px] font-semibold">New landing time</p>
            <div className="grid grid-cols-2 gap-2">
              <input
                type="date"
                aria-label="New landing date"
                value={delayDate}
                onChange={(e) => setDelayDate(e.target.value)}
                className={`${inputClass} h-11 bg-surface`}
                required
              />
              <input
                type="time"
                aria-label="New landing time"
                value={delayTime}
                onChange={(e) => setDelayTime(e.target.value)}
                className={`${inputClass} h-11 bg-surface`}
                required
              />
            </div>
            <div className="flex gap-2">
              <button type="submit" disabled={busy !== null} className={primary}>
                {busy === 'delay' ? 'Saving…' : 'Save'}
              </button>
              <button type="button" onClick={() => setDelayOpen(false)} className={buttonClass({ variant: 'ghost', size: 'sm' })}>
                Close
              </button>
            </div>
          </form>
        )}
      </div>

      {/* Actions */}
      <div className="mt-3 ml-15 flex flex-wrap gap-2 empty:hidden">
        {scheduled && active && !isOut && canCheckIn && (
          <button
            onClick={() => run('out', () => supabase.rpc('check_in', { p_trip_id: trip.id }), airport ? "Got it, you're out!" : "Got it, you're ready!")}
            disabled={busy !== null}
            className={primary}
          >
            <Icon.Walk className="size-4" />
            {busy === 'out' ? 'Updating…' : airport ? "I'm out" : "I'm ready"}
          </button>
        )}
        {active && trip.stage === 'scheduled' && hasLanded && (
          <button
            onClick={() => run('landed', () => supabase.rpc('mark_landed', { p_trip_id: trip.id }), 'Marked as landed')}
            disabled={busy !== null}
            className={secondary}
          >
            <Icon.Plane className="size-3.5" />
            {busy === 'landed' ? 'Updating…' : 'Landed'}
          </button>
        )}
        {airport && scheduled && active && !isOut && !delayOpen && (
          <button onClick={openDelay} disabled={busy !== null} className={secondary}>
            <Icon.Clock className="size-3.5" /> Flight delayed?
          </button>
        )}
        {trip.status === 'expired' && (
          <a href={uberSoloLink(trip)} target="_blank" rel="noopener noreferrer" className={primary}>
            Book solo on Uber <Icon.External className="size-3.5" />
          </a>
        )}
      </div>
    </li>
  )
}
