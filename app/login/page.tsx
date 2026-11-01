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
      <main className="min-h-dvh flex flex-col justify-center items-center px-4">
        <div className="size-8 rounded-full border-2 border-line-strong border-t-ink animate-spin" />
      </main>
    }>
      <LoginForm />
    </Suspense>
  )
}
