'use client'

import { WAIT_OPTIONS } from '@/utils/trips'
import { Spinner, buttonClass } from '../ui/kit'

export const inputClass =
  'w-full h-12 px-4 bg-surface-2 border-2 border-transparent rounded-lg text-ink text-base placeholder:text-ink-2 outline-none focus:border-ink focus-visible:outline-none transition-colors'

export function FieldLabel({ children, htmlFor }: { children: React.ReactNode; htmlFor?: string }) {
  return (
    <label htmlFor={htmlFor} className="block text-base font-medium text-ink mb-2">
      {children}
    </label>
  )
}

const optionClass = (selected: boolean) =>
  `min-h-11 py-2 px-3 rounded-full text-sm font-medium transition-colors text-center inline-flex items-center justify-center gap-1.5 ${
    selected
      ? 'bg-ink text-canvas'
      : 'bg-surface-2 text-ink hover:bg-line'
  }`

// A row of mutually exclusive buttons (terminal, bags, …)
export function Segmented<T extends string | number>({
  label,
  options,
  value,
  onChange,
}: {
  label: string
  options: { value: T; label: React.ReactNode }[]
  value: T | null
  onChange: (value: T) => void
}) {
  return (
    <div role="group" aria-label={label}>
      <FieldLabel>{label}</FieldLabel>
      <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
        {options.map((o) => (
          <button
            key={String(o.value)}
            type="button"
            aria-pressed={value === o.value}
            onClick={() => onChange(o.value)}
            className={optionClass(value === o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  )
}

export function WaitChips({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <Segmented
      label="How long can you wait?"
      value={value}
      onChange={onChange}
      options={WAIT_OPTIONS.map((m) => ({ value: m, label: `${m} min` }))}
    />
  )
}

export function Toggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string
  hint?: string
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <label className="flex items-center justify-between gap-4 py-1 cursor-pointer">
      <div>
        <div className="text-base font-medium text-ink">{label}</div>
        {hint && <div className="text-sm text-ink-2 mt-0.5">{hint}</div>}
      </div>
      <input
        type="checkbox"
        role="switch"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="sr-only peer"
      />
      <span className="relative shrink-0 w-12 h-7 rounded-full bg-line-strong peer-checked:bg-success transition-colors after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:size-6 after:rounded-full after:bg-white after:shadow-sm after:transition-transform peer-checked:after:translate-x-5 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-info" />
    </label>
  )
}

export function SubmitButton({ busy, disabled, busyText, children }: {
  busy: boolean
  disabled?: boolean
  busyText: string
  children: React.ReactNode
}) {
  return (
    <div className="sticky bottom-0 -mx-4 px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] bg-gradient-to-t from-canvas via-canvas to-canvas/0">
      <button type="submit" disabled={busy || disabled} className={buttonClass({ size: 'lg', block: true })}>
        {busy ? (
          <>
            <Spinner />
            <span>{busyText}</span>
          </>
        ) : (
          children
        )}
      </button>
    </div>
  )
}

export function Card({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <section className="-mx-4 px-4 pt-2 pb-7 border-b-8 border-surface-2 last-of-type:border-b-0 space-y-5">
      {title && <h2 className="text-xl font-bold tracking-tight -mb-1">{title}</h2>}
      {children}
    </section>
  )
}

// A short line under a field: neutral, success or error
export function FieldNote({ tone = 'neutral', icon, children }: {
  tone?: 'neutral' | 'success' | 'error'
  icon?: React.ReactNode
  children: React.ReactNode
}) {
  const color = tone === 'success' ? 'text-success' : tone === 'error' ? 'text-danger' : 'text-ink-3'
  return <p className={`-mt-1 text-[13px] font-medium flex items-center gap-1.5 ${color}`}>{icon}{children}</p>
}
