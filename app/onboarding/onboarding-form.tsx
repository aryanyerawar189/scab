'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/utils/supabase/client'
import { inputClass } from '../trips/form-controls'
import { Icon } from '../ui/icons'
import { Spinner, buttonClass } from '../ui/kit'

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

  const genders: { value: GenderOption; label: string }[] = [
    { value: 'female', label: 'Female' },
    { value: 'male', label: 'Male' },
    { value: 'other', label: 'Other' },
  ]

  return (
    <main className="min-h-dvh flex flex-col max-w-md mx-auto w-full px-6 pt-[max(2.5rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      <div className="flex items-center gap-3">
        {user.avatarUrl ? (
          <img src={user.avatarUrl} alt="" referrerPolicy="no-referrer" className="size-12 rounded-full object-cover ring-1 ring-line" />
        ) : (
          <span className="size-12 rounded-full bg-surface-2 text-ink-2 font-semibold flex items-center justify-center text-lg">
            {firstName.charAt(0)}
          </span>
        )}
        <div className="min-w-0">
          <p className="text-sm text-ink-3">Signed in as</p>
          <p className="font-medium truncate">{user.email ?? user.name}</p>
        </div>
      </div>

      <h1 className="mt-8 text-[32px] leading-tight font-bold tracking-tight">Welcome, {firstName}</h1>
      <p className="mt-2 text-[15px] text-ink-2">Two quick things before your first ride.</p>

      <form onSubmit={handleSubmit} className="flex-1 flex flex-col mt-8">
        <div className="space-y-8 flex-1">
          <div>
            <label htmlFor="phone" className="block text-base font-medium text-ink mb-2">
              Phone number
            </label>
            <div className="relative flex items-center">
              <span className="absolute left-4 text-[15px] font-medium text-ink-3 flex items-center gap-2">
                +91 <span className="w-px h-5 bg-line-strong" />
              </span>
              <input
                id="phone"
                type="tel"
                inputMode="numeric"
                autoComplete="tel-national"
                pattern="[0-9]*"
                maxLength={10}
                placeholder="98765 43210"
                value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/[^0-9]/g, ''))}
                className={`${inputClass} pl-[4.25rem] tabular-nums tracking-wide`}
                required
              />
            </div>
            <p className="text-sm text-ink-2 mt-2 flex items-center gap-1.5">
              <Icon.Shield className="size-3.5" /> Shared only with your confirmed co-rider.
            </p>
          </div>

          <div role="radiogroup" aria-label="Gender">
            <span className="block text-base font-medium text-ink mb-2">Gender</span>
            <div className="grid grid-cols-3 gap-2">
              {genders.map((g) => (
                <button
                  key={g.value}
                  type="button"
                  role="radio"
                  aria-checked={gender === g.value}
                  onClick={() => setGender(g.value)}
                  className={`h-12 rounded-full text-base font-medium transition-colors ${
                    gender === g.value
                      ? 'bg-ink text-canvas'
                      : 'bg-surface-2 text-ink hover:bg-line'
                  }`}
                >
                  {g.label}
                </button>
              ))}
            </div>
            <p className="text-sm text-ink-2 mt-2 flex items-start gap-1.5">
              <Icon.Info className="size-3.5 mt-[3px]" />
              <span>Used for women-only rides. You can&apos;t change it later.</span>
            </p>
          </div>
        </div>

        {errorMessage && (
          <div role="alert" className="mt-6 p-3.5 rounded-lg bg-danger-soft text-danger text-sm font-medium flex items-center gap-2">
            <Icon.Alert className="size-4" />
            {errorMessage}
          </div>
        )}

        <button
          type="submit"
          disabled={submitting || !gender || phone.length < 10}
          className={buttonClass({ size: 'lg', block: true, className: 'mt-6' })}
        >
          {submitting ? (
            <>
              <Spinner />
              <span>Saving…</span>
            </>
          ) : (
            <>
              Continue <Icon.ArrowRight className="size-4" />
            </>
          )}
        </button>
      </form>
    </main>
  )
}
