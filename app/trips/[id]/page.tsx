import { notFound, redirect } from 'next/navigation'
import { connection } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { TRIP_COLUMNS, type Trip } from '@/utils/trips'
import TripPageShell from '../trip-page-shell'
import TripStatusLoader from './trip-status-loader'

export const instant = false

export default async function TripPage({ params }: PageProps<'/trips/[id]'>) {
  // Per-request page (auth checks read the clock), never prerendered
  await connection()
  const { id } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound()

  const { data: trip } = await supabase
    .from('trips')
    .select(TRIP_COLUMNS)
    .eq('id', id)
    .eq('user_id', user.id)
    .maybeSingle()

  if (!trip) notFound()

  return (
    <TripPageShell title="Your ride">
      <TripStatusLoader initialTrip={trip as Trip} userId={user.id} />
    </TripPageShell>
  )
}
