import { redirect } from 'next/navigation'
import { connection } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import OnboardingForm from './onboarding-form'

export const instant = false

export default async function OnboardingPage() {
  // Per-request page (auth checks read the clock), never prerendered
  await connection()
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // Check if gender is already set
  const { data: profile } = await supabase
    .from('profiles')
    .select('gender, full_name, avatar_url')
    .eq('id', user.id)
    .single()

  if (profile?.gender) {
    redirect('/')
  }

  return (
    <OnboardingForm
      user={{
        id: user.id,
        email: user.email,
        name: profile?.full_name ?? user.user_metadata?.full_name ?? user.user_metadata?.name,
        avatarUrl: profile?.avatar_url ?? user.user_metadata?.avatar_url ?? user.user_metadata?.picture,
      }}
    />
  )
}
