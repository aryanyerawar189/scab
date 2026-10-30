'use client'

import { useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import { useSearchParams } from 'next/navigation'

export default function LoginForm() {
  const [loading, setLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const searchParams = useSearchParams()
  const authError = searchParams.get('error')

  const handleGoogleLogin = async () => {
    try {
      setLoading(true)
      setErrorMessage(null)
      const supabase = createClient()
      const origin = window.location.origin

      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${origin}/auth/callback`,
        },
      })

      if (error) {
        setErrorMessage(error.message)
        setLoading(false)
      }
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'An unexpected error occurred')
      setLoading(false)
    }
  }

  return (
    <main className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex flex-col justify-center items-center px-4 py-8">
      <div className="w-full max-w-sm bg-white dark:bg-zinc-900 rounded-3xl p-8 shadow-sm border border-zinc-200/80 dark:border-zinc-800 flex flex-col items-center text-center">
        {/* SCab Brand Icon */}
        <div className="w-16 h-16 rounded-2xl bg-amber-400 text-zinc-950 flex items-center justify-center font-black text-2xl mb-6 shadow-sm">
          🚕
        </div>

        {/* Brand Name & Tagline */}
        <h1 className="text-3xl font-extrabold tracking-tight text-zinc-900 dark:text-zinc-50 mb-2">
          SCab
        </h1>
        <p className="text-base text-zinc-600 dark:text-zinc-400 font-medium mb-6">
          Share a cab, split the fare
        </p>

        {/* Where it works */}
        <div className="w-full bg-zinc-100 dark:bg-zinc-800/60 rounded-xl px-3 py-2 text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-8 flex items-center justify-center gap-1.5">
          <span>✈️ Airports</span>
          <span>·</span>
          <span>📍 Anywhere in India</span>
        </div>

        {/* Error Feedback if any */}
        {(authError || errorMessage) && (
          <div className="w-full mb-6 p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 text-red-700 dark:text-red-300 text-xs">
            {errorMessage || 'Authentication failed. Please try again.'}
          </div>
        )}

        {/* Google Sign-in Button */}
        <button
          onClick={handleGoogleLogin}
          disabled={loading}
          className="w-full flex items-center justify-center gap-3 bg-white hover:bg-zinc-50 active:bg-zinc-100 text-zinc-800 font-medium py-3.5 px-4 rounded-2xl border border-zinc-300 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:hover:bg-zinc-750 transition-all shadow-sm disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {loading ? (
            <div className="flex items-center gap-2">
              <span className="w-4 h-4 border-2 border-zinc-400 border-t-zinc-800 dark:border-zinc-600 dark:border-t-zinc-200 rounded-full animate-spin" />
              <span>Connecting to Google...</span>
            </div>
          ) : (
            <>
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                />
              </svg>
              <span>Continue with Google</span>
            </>
          )}
        </button>

        <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-6 leading-relaxed">
          Matches co-riders leaving from the same place, heading the same way.
        </p>
      </div>
    </main>
  )
}
