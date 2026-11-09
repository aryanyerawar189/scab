'use client'

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import { friendlyError } from '@/utils/friendly-error'
import { formatTime } from '@/utils/format'
import type { Trip } from '@/utils/trips'
import { useToast } from '../toast'
import { useConfirm } from '../ui/confirm'
import { Icon } from '../ui/icons'
import { Spinner, buttonClass } from '../ui/kit'
import { loadMatchOptions, sendMatchRequest, type MatchOption } from './options-actions'

const REFRESH_MS = 20_000

// "4:12"
function countdown(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

// Every rider who fits my open ride, best saving first. One request out at a time;
// requests I receive sit at the top with Accept / Decline.
// Refreshes on request changes (Realtime), every 20 s (new riders posting), and on tab focus.
export default function MatchOptions({ trip, userId, onMatched }: { trip: Trip; userId: string; onMatched: () => void }) {
  const toast = useToast()
  const confirm = useConfirm()
  const [supabase] = useState(() => createClient())
  const [options, setOptions] = useState<MatchOption[] | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [now, setNow] = useState(() => Date.now())

  const load = useCallback(async () => {
    const result = await loadMatchOptions(trip.id)
    if (result.ok) setOptions(result.options)
  }, [trip.id])

  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null
    let stopped = false

    supabase.realtime.setAuth().then(() => {
      if (stopped) return
      load() // first load, then live updates
      channel = supabase
        .channel(`requests-${trip.id}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'match_requests', filter: `to_user_id=eq.${userId}` }, () => load())
        .on('postgres_changes', { event: '*', schema: 'public', table: 'match_requests', filter: `from_user_id=eq.${userId}` }, () => load())
        .subscribe()
    })

    const poll = setInterval(load, REFRESH_MS)
    const tick = setInterval(() => setNow(Date.now()), 1000)
    const onVisible = () => {
      if (document.visibilityState === 'visible') load()
    }
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      stopped = true
      clearInterval(poll)
      clearInterval(tick)
      document.removeEventListener('visibilitychange', onVisible)
      if (channel) supabase.removeChannel(channel)
    }
  }, [supabase, trip.id, userId, load])

  const sendRequest = async (o: MatchOption) => {
    setBusy(o.tripId)
    const result = await sendMatchRequest(trip.id, o.tripId)
    setBusy(null)
    if (!result.ok) {
      toast(result.error)
      return load()
    }
    if (result.status === 'matched') {
      toast("It's a match! You both wanted to share.", 'success')
      return onMatched()
    }
    toast('Request sent', 'success')
    load()
  }

  const respond = async (o: MatchOption, accept: boolean) => {
    if (!o.receivedRequestId) return
    if (!accept) {
      const ok = await confirm({
        title: 'Decline this rider?',
        body: "You won't be shown to each other again.",
        confirmLabel: 'Decline',
        destructive: true,
      })
      if (!ok) return
    }
    setBusy(o.tripId)
    const { data, error } = await supabase.rpc('respond_to_request', { p_request_id: o.receivedRequestId, p_accept: accept })
    setBusy(null)
    if (error) {
      toast(friendlyError(error))
      return load()
    }
    if (data === 'matched') {
      toast("You're riding together!", 'success')
      return onMatched()
    }
    if (data === 'unavailable') toast('This rider is no longer available.')
    else if (data === 'expired') toast('This request has expired.')
    load()
  }

  const withdraw = async (o: MatchOption) => {
    if (!o.sentRequestId) return
    setBusy(o.tripId)
    const { error } = await supabase.rpc('withdraw_request', { p_request_id: o.sentRequestId })
    setBusy(null)
    if (error) toast(friendlyError(error))
    load()
  }

  if (options === null) {
    return (
      <section aria-busy="true">
        <OptionsHeading count={null} />
        <div className="space-y-3">
          <div className="h-32 rounded-xl bg-surface-2 animate-pulse" />
          <div className="h-32 rounded-xl bg-surface-2 animate-pulse" />
        </div>
      </section>
    )
  }

  return (
    <OptionsList
      options={options}
      now={now}
      busy={busy}
      onSend={sendRequest}
      onRespond={respond}
      onWithdraw={withdraw}
    />
  )
}

// The list itself, without data loading
export function OptionsList({
  options,
  now,
  busy,
  onSend,
  onRespond,
  onWithdraw,
}: {
  options: MatchOption[]
  now: number
  busy: string | null
  onSend: (o: MatchOption) => void
  onRespond: (o: MatchOption, accept: boolean) => void
  onWithdraw: (o: MatchOption) => void
}) {
  const hasSent = options.some((o) => o.sentRequestId)

  return (
    <section>
      <OptionsHeading count={options.length} />
      {options.length === 0 ? (
        <div className="rounded-xl bg-surface-2 p-5 text-center">
          <Icon.Users className="size-6 mx-auto text-ink-2" />
          <p className="mt-2 font-medium">No riders yet</p>
          <p className="text-sm text-ink-2 mt-0.5">
            When someone heading your way posts a ride, they&apos;ll show up here. Keep this page open.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {options.map((o) => (
            <li
              key={o.tripId}
              className={`rounded-xl border p-4 ${o.receivedRequestId ? 'border-ink border-2' : 'border-line'}`}
            >
              {o.receivedRequestId && (
                <p className="text-sm font-semibold mb-2 flex items-center gap-1.5">
                  <Icon.Users className="size-4" /> Wants to share with you
                </p>
              )}
              <p className="text-xl font-bold tracking-tight">
                You may save up to {Math.round(o.savingPercent)}%
              </p>
              <ul className="mt-2 space-y-1 text-sm text-ink-2">
                <li className="flex items-center gap-2">
                  <Icon.MapPin className="size-4" /> Drops {o.dropGapKm} km from your drop · +{o.detourKm} km detour
                </li>
                <li className="flex items-center gap-2">
                  <Icon.Clock className="size-4" />
                  {Date.parse(o.readyFrom) <= now ? 'Ready now' : `Ready ${formatTime(o.readyFrom)}`}
                </li>
                {o.walkM > 0 && (
                  <li className="flex items-center gap-2">
                    <Icon.Walk className="size-4" />
                    {o.iWalk ? `You walk ${Math.round(o.walkM)} m to meet` : `They walk ${Math.round(o.walkM)} m to you`}
                  </li>
                )}
              </ul>

              <div className="mt-4">
                {o.receivedRequestId ? (
                  <div className="grid grid-cols-[1fr_2fr] gap-2">
                    <button onClick={() => onRespond(o, false)} disabled={busy !== null} className={buttonClass({ variant: 'secondary' })}>
                      Decline
                    </button>
                    <button onClick={() => onRespond(o, true)} disabled={busy !== null} className={buttonClass()}>
                      {busy === o.tripId ? <Spinner /> : 'Accept'}
                    </button>
                    {o.receivedExpiresAt && (
                      <p className="col-span-2 text-xs text-ink-3 text-center tabular-nums">
                        Reply within {countdown(Date.parse(o.receivedExpiresAt) - now)}
                      </p>
                    )}
                  </div>
                ) : o.sentRequestId ? (
                  <div className="flex items-center gap-3">
                    <p className="flex-1 text-sm text-ink-2 tabular-nums">
                      Request sent · waiting{' '}
                      {o.sentExpiresAt && countdown(Date.parse(o.sentExpiresAt) - now)}
                    </p>
                    <button onClick={() => onWithdraw(o)} disabled={busy !== null} className={buttonClass({ variant: 'secondary', size: 'sm' })}>
                      Withdraw
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => onSend(o)}
                    disabled={busy !== null || hasSent}
                    className={buttonClass({ block: true })}
                  >
                    {busy === o.tripId ? <Spinner /> : 'Send request'}
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      {hasSent && options.some((o) => !o.sentRequestId && !o.receivedRequestId) && (
        <p className="mt-3 text-xs text-ink-3 text-center">You can ask one rider at a time. Withdraw to ask someone else.</p>
      )}
    </section>
  )
}

function OptionsHeading({ count }: { count: number | null }) {
  return (
    <div className="flex items-baseline justify-between mb-3">
      <h2 className="text-xl font-bold tracking-tight">Riders heading your way</h2>
      {count != null && count > 0 && <span className="text-sm text-ink-2">{count}</span>}
    </div>
  )
}
