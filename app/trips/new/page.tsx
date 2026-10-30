import { redirect } from 'next/navigation'
import { connection } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import TripPageShell from '../trip-page-shell'
import TripFormLoader from './trip-form-loader'

export const instant = false

export default async function NewTripPage() {
  // Per-request page (auth checks read the clock), never prerendered
  await connection()
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: profile } = await supabase.from('profiles').select('gender').eq('id', user.id).single()

  if (!profile?.gender) {
    redirect('/onboarding')
  }

  return (
    <TripPageShell title="Schedule a ride">
      <TripFormLoader showWomenOnly={profile.gender === 'female'} />
    </TripPageShell>
  )
}
