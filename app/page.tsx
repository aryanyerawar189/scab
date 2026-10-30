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
    .order('ready_from', { ascending: false })
    .limit(30)

  const rawName = profile?.full_name ?? user.user_metadata?.full_name ?? user.user_metadata?.name ?? 'Rider'
  const firstName = rawName.trim().split(' ')[0]
  const avatarUrl = profile?.avatar_url ?? user.user_metadata?.avatar_url ?? user.user_metadata?.picture

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 flex flex-col">
      {/* Top Navigation Bar */}
      <header className="sticky top-0 z-10 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-md border-b border-zinc-200/80 dark:border-zinc-800">
        <div className="max-w-md mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-amber-400 text-zinc-950 flex items-center justify-center font-black text-sm shadow-sm">
              🚕
            </div>
            <span className="font-extrabold text-lg tracking-tight">SCab</span>
          </div>

          {/* User Profile & Sign Out */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt={firstName}
                  className="w-8 h-8 rounded-full object-cover border border-zinc-200 dark:border-zinc-750"
                />
              ) : (
                <div className="w-8 h-8 rounded-full bg-amber-400 text-zinc-950 font-bold flex items-center justify-center text-xs">
                  {firstName.charAt(0)}
                </div>
              )}
              <span className="text-sm font-semibold hidden xs:inline-block">
                {firstName}
              </span>
            </div>
            <SignOutButton />
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-md mx-auto w-full px-4 py-6 flex flex-col justify-between">
        <div className="space-y-6">
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
            Hey, {firstName}! 👋
          </h1>
          <HomeTripsLoader userId={user.id} initialTrips={(trips ?? []) as Trip[]} />
        </div>

        {/* Footer tagline */}
        <footer className="pt-10 pb-24 text-center text-xs text-zinc-400 dark:text-zinc-600">
          SCab – Share a cab, split the fare
        </footer>
      </main>
    </div>
  )
}
