'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import PlaceSearch, { type Place } from './place-search'
import { Segmented } from './form-controls'

type AirportTerminal = {
  airport_id: string
  iata: string
  airport_name: string
  terminal_id: string
  terminal_code: string
  terminal_name: string
}

// terminalId null = address pickup
export type Pickup = { place: Place; terminalId: string | null }

type Detection =
  | { state: 'idle' }
  | { state: 'checking' }
  | { state: 'airport'; terminals: AirportTerminal[] }
  | { state: 'address' }
  | { state: 'error' }

// "From" box: any address. If it's at a known airport with several terminals, the rider
// always picks the terminal (we never guess: a wrong one puts co-riders in different buildings).
// An airport we don't know yet is treated as a normal address.
// Emits a pickup only once it's usable (address, or airport + terminal).
export default function PickupField({ onChange }: { onChange: (pickup: Pickup | null) => void }) {
  const [supabase] = useState(() => createClient())
  const [place, setPlace] = useState<Place | null>(null)
  const [detection, setDetection] = useState<Detection>({ state: 'idle' })
  const [terminalId, setTerminalId] = useState<string | null>(null)

  useEffect(() => {
    if (!place) return
    let stale = false

    supabase.rpc('airport_at', { p_lat: place.lat, p_lng: place.lng }).then(({ data, error }) => {
      if (stale) return
      if (error) {
        setDetection({ state: 'error' })
        return
      }
      const terminals = (data ?? []) as AirportTerminal[]
      if (terminals.length > 0) {
        setDetection({ state: 'airport', terminals })
        setTerminalId(terminals.length === 1 ? terminals[0].terminal_id : null)
      } else {
        setDetection({ state: 'address' })
      }
    })

    return () => {
      stale = true
    }
  }, [supabase, place])

  useEffect(() => {
    if (place && detection.state === 'address') onChange({ place, terminalId: null })
    else if (place && detection.state === 'airport' && terminalId) onChange({ place, terminalId })
    else onChange(null)
  }, [place, detection, terminalId, onChange])

  const pickPlace = (p: Place | null) => {
    setPlace(p)
    setTerminalId(null)
    setDetection(p ? { state: 'checking' } : { state: 'idle' })
  }

  const airport = detection.state === 'airport' ? detection.terminals : null

  return (
    <div className="space-y-3">
      <PlaceSearch
        id="pickup"
        label="From"
        placeholder="Search a place or airport, e.g. BLR airport"
        value={place}
        onChange={pickPlace}
      />

      {detection.state === 'checking' && (
        <p className="text-xs text-zinc-500 dark:text-zinc-400 -mt-1.5">Checking pickup…</p>
      )}
      {detection.state === 'error' && (
        <p className="text-xs text-red-600 dark:text-red-400 -mt-1.5">
          We couldn&apos;t check this pickup. Please pick it again.
        </p>
      )}
      {detection.state === 'address' && (
        <p className="text-xs text-emerald-700 dark:text-emerald-400 -mt-1.5">📍 Pickup set</p>
      )}

      {airport && airport.length === 1 && (
        <p className="text-xs text-emerald-700 dark:text-emerald-400 -mt-1.5">
          ✈️ {airport[0].airport_name} ({airport[0].iata})
        </p>
      )}
      {airport && airport.length > 1 && (
        <Segmented
          label={`Which terminal? · ${airport[0].iata}`}
          value={terminalId}
          onChange={setTerminalId}
          options={airport.map((t) => ({ value: t.terminal_id, label: `✈️ ${t.terminal_name}` }))}
        />
      )}
    </div>
  )
}
