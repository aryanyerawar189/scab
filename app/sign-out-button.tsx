'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/utils/supabase/client'
import { Icon } from './ui/icons'
import { Spinner } from './ui/kit'

export default function SignOutButton() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  const handleSignOut = async () => {
    try {
      setLoading(true)
      const supabase = createClient()
      await supabase.auth.signOut()
      router.push('/login')
      router.refresh()
    } catch {
      setLoading(false)
    }
  }

  return (
    <button
      onClick={handleSignOut}
      disabled={loading}
      aria-label="Sign out"
      title="Sign out"
      className="size-10 rounded-full flex items-center justify-center text-ink-3 hover:text-ink hover:bg-surface-2 transition-colors disabled:opacity-50"
    >
      {loading ? <Spinner /> : <Icon.LogOut className="size-[18px]" />}
    </button>
  )
}
