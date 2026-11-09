'use client'

import { useEffect, useRef, useState } from 'react'
import { FieldLabel, inputClass } from './form-controls'
import { Icon } from '../ui/icons'
import { Spinner } from '../ui/kit'

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
        <Icon.Search className="size-[18px] absolute left-4 top-1/2 -translate-y-1/2 text-ink-3 pointer-events-none" />
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
          className={`${inputClass} pl-11 pr-11`}
        />
        {(searching || loadingPlace) && (
          <span className="absolute right-4 top-1/2 -translate-y-1/2 text-ink-3 flex">
            <Spinner />
          </span>
        )}
        {value && !loadingPlace && (
          <button
            type="button"
            onClick={clear}
            aria-label={`Clear ${label.toLowerCase()}`}
            className="absolute right-2 top-1/2 -translate-y-1/2 size-8 rounded-full flex items-center justify-center text-ink-3 hover:text-ink hover:bg-surface-2"
          >
            <Icon.X className="size-4" />
          </button>
        )}
      </div>

      {suggestions.length > 0 && (
        <ul className="absolute z-30 left-0 right-0 mt-2 p-1.5 bg-surface border border-line rounded-lg shadow-pop max-h-80 overflow-y-auto animate-fade-in">
          {suggestions.map((s) => (
            <li key={s.placeId}>
              <button
                type="button"
                onClick={() => pickSuggestion(s)}
                className="w-full flex items-center gap-3 text-left px-2.5 py-2.5 rounded-xl hover:bg-surface-2"
              >
                <span className="size-9 rounded-full bg-surface-2 text-ink-2 flex items-center justify-center">
                  <Icon.MapPin className="size-4" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-ink truncate">{s.mainText}</span>
                  {s.secondaryText && <span className="block text-xs text-ink-3 truncate">{s.secondaryText}</span>}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {searchError && !searching && <p className="text-[13px] font-medium text-danger mt-2">{searchError}</p>}
    </div>
  )
}
