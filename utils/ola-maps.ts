// Server-only helpers for Ola Maps. OLA_MAPS_API_KEY has no NEXT_PUBLIC_ prefix,
// so it is never bundled for the browser — only import this from routes/actions.

const OLA_BASE = 'https://api.olamaps.io'

export type LatLng = { lat: number; lng: number }

// Searches are biased towards this point (e.g. the pickup), within this radius
const BIAS_RADIUS_M = 50000

export type PlaceSuggestion = {
  placeId: string
  mainText: string
  secondaryText: string
  description: string
}

export type PlaceDetails = {
  label: string
  lat: number
  lng: number
  types: string[] // e.g. ['airport']
}

async function olaGet(path: string, params: Record<string, string>) {
  const apiKey = process.env.OLA_MAPS_API_KEY
  if (!apiKey) throw new Error('OLA_MAPS_API_KEY is not set')

  const url = new URL(path, OLA_BASE)
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value)
  url.searchParams.set('api_key', apiKey)

  const res = await fetch(url, {
    headers: { 'X-Request-Id': crypto.randomUUID() },
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`Ola Maps ${path} failed with ${res.status}`)
  return res.json()
}

export async function autocomplete(input: string, near?: LatLng): Promise<PlaceSuggestion[]> {
  const data = await olaGet('/places/v1/autocomplete', {
    input,
    ...(near ? { location: `${near.lat},${near.lng}`, radius: String(BIAS_RADIUS_M) } : {}),
  })

  type OlaPrediction = {
    place_id: string
    description: string
    structured_formatting?: { main_text?: string; secondary_text?: string }
  }

  return ((data.predictions ?? []) as OlaPrediction[]).map((p) => ({
    placeId: p.place_id,
    mainText: p.structured_formatting?.main_text ?? p.description,
    secondaryText: p.structured_formatting?.secondary_text ?? '',
    description: p.description,
  }))
}

export async function placeDetails(placeId: string): Promise<PlaceDetails | null> {
  const data = await olaGet('/places/v1/details', { place_id: placeId })
  const result = data.result
  const location = result?.geometry?.location
  if (typeof location?.lat !== 'number' || typeof location?.lng !== 'number') return null

  return {
    label: result.formatted_address || result.name || '',
    lat: location.lat,
    lng: location.lng,
    types: Array.isArray(result.types) ? result.types : [],
  }
}

// Road distance in km, or null if Ola Maps can't tell us
export async function roadDistanceKm(from: LatLng, to: LatLng): Promise<number | null> {
  try {
    const data = await olaGet('/routing/v1/distanceMatrix', {
      origins: `${from.lat},${from.lng}`,
      destinations: `${to.lat},${to.lng}`,
    })
    const meters = data.rows?.[0]?.elements?.[0]?.distance
    if (typeof meters !== 'number' || meters <= 0) return null
    return Math.round(meters / 10) / 100
  } catch {
    return null
  }
}
