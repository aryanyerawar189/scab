import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { connection } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import LoginForm from './login-form'

export const instant = false

export default async function LoginPage() {
  // Per-request page (auth checks read the clock), never prerendered
  await connection()
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('gender')
      .eq('id', user.id)
      .single()

    if (!profile?.gender) {
      redirect('/onboarding')
    }
    redirect('/')
  }

  return (
    <Suspense fallback={
      <main className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex flex-col justify-center items-center px-4">
        <div className="w-10 h-10 border-2 border-zinc-300 border-t-amber-500 rounded-full animate-spin" />
      </main>
    }>
      <LoginForm />
    </Suspense>
  )
}
