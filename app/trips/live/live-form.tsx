'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useToast } from '@/app/toast'
import { createLiveTrip } from '../actions'
import PlaceSearch, { type Place } from '../place-search'
import PickupField, { type Pickup } from '../pickup-field'
import { Card, SubmitButton, Toggle, WaitChips } from '../form-controls'

const DEFAULT_WAIT = 15

export default function LiveForm({ showWomenOnly }: { showWomenOnly: boolean }) {
  const router = useRouter()
  const toast = useToast()
  const [pickup, setPickup] = useState<Pickup | null>(null)
  const [drop, setDrop] = useState<Place | null>(null)
  const [waitMinutes, setWaitMinutes] = useState(DEFAULT_WAIT)
  const [editingWait, setEditingWait] = useState(false)
  const [womenOnly, setWomenOnly] = useState(false)
  const [submitting, startSubmit] = useTransition()

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!pickup) return toast('Please pick your pickup from the suggestions.')
    if (!drop) return toast('Please pick where you are going from the suggestions.')

    startSubmit(async () => {
      const result = await createLiveTrip({
        terminalId: pickup.terminalId,
        pickupLabel: pickup.place.label,
        pickupLat: pickup.place.lat,
        pickupLng: pickup.place.lng,
        pickupPlaceId: pickup.place.placeId,
        dropLabel: drop.label,
        dropLat: drop.lat,
        dropLng: drop.lng,
        dropPlaceId: drop.placeId,
        waitMinutes,
        womenOnly: showWomenOnly && womenOnly,
      })
      if (!result.ok) return toast(result.error)
      router.push(`/trips/${result.tripId}`)
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <Card>
        <PickupField onChange={setPickup} />
        <PlaceSearch
          id="drop"
          label="To"
          placeholder="Search an area, e.g. Koramangala"
          near={pickup?.place}
          value={drop}
          onChange={setDrop}
        />

        {editingWait ? (
          <WaitChips value={waitMinutes} onChange={setWaitMinutes} />
        ) : (
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            ⏱ We&apos;ll look for up to <strong className="text-zinc-900 dark:text-zinc-100">{waitMinutes} min</strong>
            {' · '}
            <button
              type="button"
              onClick={() => setEditingWait(true)}
              className="font-semibold text-amber-700 dark:text-amber-400 underline underline-offset-2"
            >
              change
            </button>
          </p>
        )}

        {showWomenOnly && (
          <Toggle label="Women only" hint="Only match me with women" checked={womenOnly} onChange={setWomenOnly} />
        )}
      </Card>

      <SubmitButton busy={submitting} disabled={!pickup || !drop} busyText="Posting your trip...">
        Find co-rider
      </SubmitButton>
    </form>
  )
}
