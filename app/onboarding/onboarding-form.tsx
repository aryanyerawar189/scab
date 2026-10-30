'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/utils/supabase/client'
import Image from 'next/image'

interface OnboardingFormProps {
  user: {
    id: string
    email?: string
    name?: string
    avatarUrl?: string
  }
}

type GenderOption = 'female' | 'male' | 'other'

export default function OnboardingForm({ user }: OnboardingFormProps) {
  const router = useRouter()
  const [phone, setPhone] = useState('')
  const [gender, setGender] = useState<GenderOption | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMessage(null)

    // Validation
    const cleanPhone = phone.trim().replace(/\s+/g, '')
    if (!cleanPhone || cleanPhone.length < 10) {
      setErrorMessage('Please enter a valid 10-digit phone number.')
      return
    }

    if (!gender) {
      setErrorMessage('Please select your gender.')
      return
    }

    setSubmitting(true)
    const supabase = createClient()

    try {
      // 1. Update gender on public.profiles
      const { error: profileError } = await supabase
        .from('profiles')
        .update({ gender })
        .eq('id', user.id)

      if (profileError) {
        throw new Error(profileError.message)
      }

      // 2. Update phone on public.profile_private
      const formattedPhone = cleanPhone.startsWith('+') ? cleanPhone : `+91${cleanPhone.replace(/^0+/, '')}`
      const { error: privateError } = await supabase
        .from('profile_private')
        .update({ phone: formattedPhone })
        .eq('id', user.id)

      if (privateError) {
        throw new Error(privateError.message)
      }

      router.push('/')
      router.refresh()
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to save profile. Please try again.')
      setSubmitting(false)
    }
  }

  const firstName = user.name?.split(' ')[0] ?? 'there'

  return (
    <main className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex flex-col justify-center items-center px-4 py-8">
      <div className="w-full max-w-sm bg-white dark:bg-zinc-900 rounded-3xl p-6 sm:p-8 shadow-sm border border-zinc-200/80 dark:border-zinc-800">
        {/* Welcome Header */}
        <div className="flex items-center gap-3 mb-6">
          {user.avatarUrl ? (
            <img
              src={user.avatarUrl}
              alt={user.name || 'User avatar'}
              className="w-12 h-12 rounded-full object-cover border border-zinc-200 dark:border-zinc-700"
            />
          ) : (
            <div className="w-12 h-12 rounded-full bg-amber-400 text-zinc-950 font-bold flex items-center justify-center text-lg">
              {firstName.charAt(0)}
            </div>
          )}
          <div>
            <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-50">
              Welcome, {firstName}!
            </h1>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Complete setup to start sharing rides
            </p>
          </div>
        </div>

        {errorMessage && (
          <div className="mb-5 p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 text-red-700 dark:text-red-300 text-xs">
            {errorMessage}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Phone Number Input */}
          <div>
            <label htmlFor="phone" className="block text-sm font-semibold text-zinc-800 dark:text-zinc-200 mb-1.5">
              Phone number
            </label>
            <div className="relative flex items-center">
              <span className="absolute left-3.5 text-sm font-medium text-zinc-500 dark:text-zinc-400">
                +91
              </span>
              <input
                id="phone"
                type="tel"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={10}
                placeholder="9876543210"
                value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/[^0-9]/g, ''))}
                className="w-full pl-12 pr-4 py-3 bg-zinc-50 dark:bg-zinc-800/80 border border-zinc-300 dark:border-zinc-700 rounded-2xl text-zinc-900 dark:text-zinc-100 text-sm placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-amber-500 transition-all font-medium"
                required
              />
            </div>
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-1.5">
              Shared only with your confirmed co-rider at departure.
            </p>
          </div>

          {/* Gender Selector (One tap) */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
                Gender
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2.5">
              <button
                type="button"
                onClick={() => setGender('female')}
                className={`flex flex-col items-center justify-center py-3.5 px-2 rounded-2xl border transition-all text-center ${
                  gender === 'female'
                    ? 'border-amber-500 bg-amber-50/70 dark:bg-amber-950/30 text-amber-950 dark:text-amber-200 font-bold shadow-sm'
                    : 'border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-800/40 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                }`}
              >
                <span className="text-2xl mb-1">👩</span>
                <span className="text-xs font-medium">Female</span>
              </button>

              <button
                type="button"
                onClick={() => setGender('male')}
                className={`flex flex-col items-center justify-center py-3.5 px-2 rounded-2xl border transition-all text-center ${
                  gender === 'male'
                    ? 'border-amber-500 bg-amber-50/70 dark:bg-amber-950/30 text-amber-950 dark:text-amber-200 font-bold shadow-sm'
                    : 'border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-800/40 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                }`}
              >
                <span className="text-2xl mb-1">👨</span>
                <span className="text-xs font-medium">Male</span>
              </button>

              <button
                type="button"
                onClick={() => setGender('other')}
                className={`flex flex-col items-center justify-center py-3.5 px-2 rounded-2xl border transition-all text-center ${
                  gender === 'other'
                    ? 'border-amber-500 bg-amber-50/70 dark:bg-amber-950/30 text-amber-950 dark:text-amber-200 font-bold shadow-sm'
                    : 'border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-800/40 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                }`}
              >
                <span className="text-2xl mb-1">🧑</span>
                <span className="text-xs font-medium">Other</span>
              </button>
            </div>

            {/* Note: Gender can't be changed later */}
            <div className="mt-3 p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-800 dark:text-amber-300 text-xs flex items-start gap-2">
              <span className="text-sm leading-none mt-0.5">⚠️</span>
              <span className="leading-snug font-medium">
                Gender can&apos;t be changed later.
              </span>
            </div>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={submitting || !gender || phone.length < 10}
            className="w-full bg-zinc-900 hover:bg-zinc-800 text-white dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200 font-semibold py-3.5 px-4 rounded-2xl transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {submitting ? (
              <>
                <span className="w-4 h-4 border-2 border-zinc-400 border-t-white dark:border-t-zinc-900 rounded-full animate-spin" />
                <span>Saving profile...</span>
              </>
            ) : (
              <span>Continue to SCab</span>
            )}
          </button>
        </form>
      </div>
    </main>
  )
}
