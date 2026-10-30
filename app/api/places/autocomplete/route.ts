import { type NextRequest } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { autocomplete } from '@/utils/ola-maps'

export async function GET(request: NextRequest) {
  // Only signed-in users may use our Ola Maps quota
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return Response.json({ error: 'Please sign in again.' }, { status: 401 })
  }

  const params = request.nextUrl.searchParams
  const q = params.get('q')?.trim() ?? ''
  if (q.length < 2) {
    return Response.json({ suggestions: [] })
  }

  // Optional bias point, e.g. the pickup when searching for the drop
  const lat = Number(params.get('lat'))
  const lng = Number(params.get('lng'))
  const near = params.has('lat') && params.has('lng') && Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : undefined

  try {
    const suggestions = await autocomplete(q.slice(0, 100), near)
    return Response.json({ suggestions })
  } catch (err) {
    console.error('Autocomplete failed:', err)
    return Response.json(
      { error: "We couldn't search places right now. Please try again." },
      { status: 502 }
    )
  }
}
