'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useToast } from '@/app/toast'
import { createLiveTrip } from '../actions'
import PlaceSearch, { type Place } from '../place-search'
import PickupField, { type Pickup } from '../pickup-field'
import { Card, SubmitButton, Toggle, WaitChips } from '../form-controls'
import { Icon } from '@/app/ui/icons'
import { buttonClass } from '@/app/ui/kit'

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
    <form onSubmit={handleSubmit} className="space-y-4">
      <Card>
        <p className="text-sm text-ink-2">We&apos;ll match you with someone leaving the same spot, heading your way.</p>
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
          <div className="flex items-center gap-3 h-14 pl-4 pr-2 rounded-lg bg-surface-2">
            <Icon.Timer className="size-5 text-ink-2" />
            <p className="flex-1 text-sm text-ink-2">
              We&apos;ll look for up to <strong className="text-ink font-semibold">{waitMinutes} min</strong>
            </p>
            <button type="button" onClick={() => setEditingWait(true)} className={buttonClass({ variant: 'ghost', size: 'sm' })}>
              Change
            </button>
          </div>
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
