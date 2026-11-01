import { redirect } from 'next/navigation'
import { connection } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { TRIP_COLUMNS, type Trip } from '@/utils/trips'
import SignOutButton from './sign-out-button'
import HomeTripsLoader from './home-trips-loader'

export const instant = false

export default async function HomePage() {
  // Per-request page (auth checks read the clock), never prerendered
  await connection()
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // Fetch user profile
  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, avatar_url, gender')
    .eq('id', user.id)
    .single()

  // Redirect to onboarding if gender is not set
  if (!profile?.gender) {
    redirect('/onboarding')
  }

  const { data: trips } = await supabase
    .from('trips')
    .select(TRIP_COLUMNS)
    .eq('user_id', user.id)
    .is('hidden_at', null)
    .order('ready_from', { ascending: false })
    .limit(30)

  const rawName = profile?.full_name ?? user.user_metadata?.full_name ?? user.user_metadata?.name ?? 'Rider'
  const firstName = rawName.trim().split(' ')[0]
  const avatarUrl = profile?.avatar_url ?? user.user_metadata?.avatar_url ?? user.user_metadata?.picture

  return (
    <div className="min-h-dvh flex flex-col">
      <header className="sticky top-0 z-20 bg-canvas pt-[env(safe-area-inset-top)]">
        <div className="max-w-md mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="font-bold text-2xl tracking-tight">SCab</span>
          </div>
          <div className="flex items-center gap-1">
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt=""
                referrerPolicy="no-referrer"
                className="size-8 rounded-full object-cover ring-1 ring-line"
              />
            ) : (
              <span className="size-8 rounded-full bg-surface-2 text-ink-2 font-semibold flex items-center justify-center text-xs">
                {firstName.charAt(0)}
              </span>
            )}
            <SignOutButton />
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-md mx-auto w-full px-4 pt-2 pb-[max(2.5rem,env(safe-area-inset-bottom))]">
        <h1 className="mb-5 text-[28px] leading-tight font-bold tracking-tight">Hi, {firstName}</h1>
        <HomeTripsLoader userId={user.id} initialTrips={(trips ?? []) as Trip[]} />
      </main>
    </div>
  )
}
