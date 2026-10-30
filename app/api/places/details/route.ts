import { type NextRequest } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { placeDetails } from '@/utils/ola-maps'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return Response.json({ error: 'Please sign in again.' }, { status: 401 })
  }

  const placeId = request.nextUrl.searchParams.get('place_id')?.trim()
  if (!placeId) {
    return Response.json({ error: 'Missing place.' }, { status: 400 })
  }

  try {
    const details = await placeDetails(placeId)
    if (!details) {
      return Response.json(
        { error: "We couldn't find that place on the map. Try another one." },
        { status: 404 }
      )
    }
    return Response.json(details)
  } catch (err) {
    console.error('Place details failed:', err)
    return Response.json(
      { error: "We couldn't load that place right now. Please try again." },
      { status: 502 }
    )
  }
}
