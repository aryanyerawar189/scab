'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useToast } from '@/app/toast'
import { dayPhrase, formatTime, nextHalfHour, toDateValue, toTimeValue } from '@/utils/format'
import { createScheduledTrip } from '../actions'
import PlaceSearch, { type Place } from '../place-search'
import PickupField, { type Pickup } from '../pickup-field'
import { Card, FieldLabel, Segmented, SubmitButton, Toggle, WaitChips, inputClass } from '../form-controls'
import { Icon } from '@/app/ui/icons'
import { buttonClass } from '@/app/ui/kit'

type Saved = { pickup_label: string; ready_from: string; ready_until: string }

export default function TripForm({ showWomenOnly }: { showWomenOnly: boolean }) {
  const toast = useToast()
  const [pickup, setPickup] = useState<Pickup | null>(null)
  // This form only renders in the browser (see trip-form-loader), so these
  // defaults use the rider's local clock
  const [date, setDate] = useState(() => toDateValue(nextHalfHour()))
  const [time, setTime] = useState(() => toTimeValue(nextHalfHour()))
  const [minDate] = useState(() => toDateValue(new Date()))
  const [maxDate] = useState(() => toDateValue(new Date(Date.now() + 30 * 86400000)))
  const [bags, setBags] = useState<'cabin' | 'checked'>('cabin')
  const [international, setInternational] = useState(false)
  const [drop, setDrop] = useState<Place | null>(null)
  const [waitMinutes, setWaitMinutes] = useState(20)
  const [womenOnly, setWomenOnly] = useState(false)
  const [askFirst, setAskFirst] = useState(true)
  const [submitting, startSubmit] = useTransition()
  const [saved, setSaved] = useState<Saved | null>(null)

  // Airport pickups ask for the landing time (+ bags, international); addresses for when you leave
  const airport = Boolean(pickup?.terminalId)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!pickup) return toast('Please pick your pickup from the suggestions.')
    const startAt = new Date(`${date}T${time}`)
    if (!date || !time || Number.isNaN(startAt.getTime())) {
      return toast(airport ? 'Please pick your landing date and time.' : 'Please pick when you are leaving.')
    }
    if (!drop) return toast('Please pick where you are going from the suggestions.')

    startSubmit(async () => {
      const result = await createScheduledTrip({
        terminalId: pickup.terminalId,
        pickupLabel: pickup.place.label,
        pickupLat: pickup.place.lat,
        pickupLng: pickup.place.lng,
        pickupPlaceId: pickup.place.placeId,
        startAt: startAt.toISOString(),
        checkedBags: bags === 'checked',
        isInternational: international,
        dropLabel: drop.label,
        dropLat: drop.lat,
        dropLng: drop.lng,
        dropPlaceId: drop.placeId,
        waitMinutes,
        womenOnly: showWomenOnly && womenOnly,
        askBeforeConfirming: askFirst,
      })
      if (!result.ok) return toast(result.error)
      setSaved(result.trip)
    })
  }

  if (saved) {
    return (
      <div className="pt-6 text-center">
        <div className="size-16 mx-auto rounded-full bg-success-soft text-success flex items-center justify-center mb-5">
          <Icon.Check className="size-8" />
        </div>
        <h2 className="text-2xl font-bold tracking-tight mb-2">Ride scheduled</h2>
        <p className="text-[15px] text-ink-2 mb-8 max-w-xs mx-auto leading-relaxed">
          We&apos;ll look for co-riders leaving {saved.pickup_label} between{' '}
          <strong className="text-ink">{formatTime(saved.ready_from)}</strong> and{' '}
          <strong className="text-ink">{formatTime(saved.ready_until)}</strong>
          {dayPhrase(saved.ready_from)}.
        </p>
        <Link href="/" className={buttonClass({ size: 'lg', block: true })}>
          Go to my trips
        </Link>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Card>
        <PickupField onChange={setPickup} />

        <div>
          <FieldLabel>{airport ? 'Landing date & time' : 'Leave at'}</FieldLabel>
          <div className="grid grid-cols-2 gap-2.5">
            <input
              type="date"
              aria-label={airport ? 'Landing date' : 'Leaving date'}
              value={date}
              min={minDate}
              max={maxDate}
              onChange={(e) => setDate(e.target.value)}
              className={inputClass}
              required
            />
            <input
              type="time"
              aria-label={airport ? 'Landing time' : 'Leaving time'}
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className={inputClass}
              required
            />
          </div>
        </div>

        {airport && (
          <>
            <Segmented
              label="Bags"
              value={bags}
              onChange={setBags}
              options={[
                { value: 'cabin', label: <><Icon.Briefcase className="size-4" /> Cabin only</> },
                { value: 'checked', label: <><Icon.Luggage className="size-4" /> Checked bags</> },
              ]}
            />

            <Toggle
              label="International flight"
              hint="Immigration adds about 30 min"
              checked={international}
              onChange={setInternational}
            />
          </>
        )}
      </Card>

      <Card>
        <PlaceSearch
          id="drop"
          label="To"
          placeholder="Search an area, e.g. Koramangala"
          near={pickup?.place}
          value={drop}
          onChange={setDrop}
        />
        <WaitChips value={waitMinutes} onChange={setWaitMinutes} />
        {showWomenOnly && (
          <Toggle label="Women only" hint="Only match me with women" checked={womenOnly} onChange={setWomenOnly} />
        )}
        <Toggle
          label="Ask me before confirming a co-rider"
          hint={askFirst ? "You'll get one tap to Accept" : 'Good matches are confirmed automatically'}
          checked={askFirst}
          onChange={setAskFirst}
        />
      </Card>

      <SubmitButton busy={submitting} disabled={!pickup || !drop} busyText="Scheduling...">
        Find co-rider
      </SubmitButton>
    </form>
  )
}
