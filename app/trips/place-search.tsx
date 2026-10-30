'use client'

import { useEffect, useRef, useState } from 'react'
import { FieldLabel, inputClass } from './form-controls'

type Suggestion = {
  placeId: string
  mainText: string
  secondaryText: string
  description: string
}

export type Place = {
  label: string
  lat: number
  lng: number
  placeId: string
  types: string[] // from the maps provider, e.g. ['airport']
}

// Address box ("From" / "To"): autocomplete via our Ola Maps API routes (the key stays on the server)
export default function PlaceSearch({
  id,
  label,
  placeholder,
  near,
  value,
  onChange,
}: {
  id: string
  label: string
  placeholder: string
  near?: { lat: number; lng: number } // bias results towards this point
  value: Place | null
  onChange: (place: Place | null) => void
}) {
  const [query, setQuery] = useState(value?.label ?? '')
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [searching, setSearching] = useState(false)
  const [loadingPlace, setLoadingPlace] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const searchAbort = useRef<AbortController | null>(null)
  // Text we filled in from a picked suggestion — don't search for it again
  const pickedText = useRef<string | null>(null)

  // Debounced search while typing
  useEffect(() => {
    const q = query.trim()
    if (value || q.length < 2 || query === pickedText.current) return

    const timer = setTimeout(async () => {
      searchAbort.current?.abort()
      const controller = new AbortController()
      searchAbort.current = controller
      try {
        const params = new URLSearchParams({ q })
        if (near) {
          params.set('lat', String(near.lat))
          params.set('lng', String(near.lng))
        }
        const res = await fetch(`/api/places/autocomplete?${params}`, { signal: controller.signal })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error)
        setSuggestions(data.suggestions)
        setSearchError(data.suggestions.length ? null : 'No places found. Try a different name.')
      } catch (err) {
        if (controller.signal.aborted) return
        setSuggestions([])
        setSearchError(err instanceof Error && err.message ? err.message : "Couldn't search right now.")
      } finally {
        if (!controller.signal.aborted) setSearching(false)
      }
    }, 300)

    return () => clearTimeout(timer)
  }, [query, value, near])

  const pickSuggestion = async (s: Suggestion) => {
    setLoadingPlace(true)
    setSearchError(null)
    setSuggestions([])
    pickedText.current = s.description
    setQuery(s.description)
    try {
      const res = await fetch(`/api/places/details?place_id=${encodeURIComponent(s.placeId)}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      onChange({ label: s.description, lat: data.lat, lng: data.lng, placeId: s.placeId, types: data.types ?? [] })
    } catch (err) {
      onChange(null)
      setSearchError(err instanceof Error && err.message ? err.message : "Couldn't load that place.")
    } finally {
      setLoadingPlace(false)
    }
  }

  const clear = () => {
    onChange(null)
    setQuery('')
    setSuggestions([])
    setSearchError(null)
  }

  return (
    <div className="relative">
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <div className="relative">
        <input
          id={id}
          type="text"
          autoComplete="off"
          placeholder={placeholder}
          value={query}
          onChange={(e) => {
            const text = e.target.value
            const searchable = text.trim().length >= 2
            pickedText.current = null
            setQuery(text)
            onChange(null)
            setSearching(searchable)
            if (!searchable) {
              setSuggestions([])
              setSearchError(null)
            }
          }}
          className={`${inputClass} pr-10`}
        />
        {(searching || loadingPlace) && (
          <span className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 border-2 border-zinc-300 border-t-amber-500 rounded-full animate-spin" />
        )}
        {value && !loadingPlace && (
          <button
            type="button"
            onClick={clear}
            aria-label={`Clear ${label.toLowerCase()}`}
            className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full text-zinc-500 hover:bg-zinc-200 dark:hover:bg-zinc-700"
          >
            ✕
          </button>
        )}
      </div>

      {suggestions.length > 0 && (
        <ul className="absolute z-20 left-0 right-0 mt-1.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-2xl shadow-lg overflow-hidden max-h-72 overflow-y-auto">
          {suggestions.map((s) => (
            <li key={s.placeId}>
              <button
                type="button"
                onClick={() => pickSuggestion(s)}
                className="w-full text-left px-4 py-3 hover:bg-zinc-50 dark:hover:bg-zinc-800 border-b last:border-b-0 border-zinc-100 dark:border-zinc-800"
              >
                <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 truncate">{s.mainText}</div>
                {s.secondaryText && (
                  <div className="text-xs text-zinc-500 dark:text-zinc-400 truncate">{s.secondaryText}</div>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}

      {searchError && !searching && <p className="text-xs text-red-600 dark:text-red-400 mt-1.5">{searchError}</p>}
    </div>
  )
}
