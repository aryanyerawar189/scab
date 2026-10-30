'use client'

import { WAIT_OPTIONS } from '@/utils/trips'

export const inputClass =
  'w-full px-4 py-3 bg-zinc-50 dark:bg-zinc-800/80 border border-zinc-300 dark:border-zinc-700 rounded-2xl text-zinc-900 dark:text-zinc-100 text-sm placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-amber-500 transition-all font-medium'

export function FieldLabel({ children, htmlFor }: { children: React.ReactNode; htmlFor?: string }) {
  return (
    <label htmlFor={htmlFor} className="block text-sm font-semibold text-zinc-800 dark:text-zinc-200 mb-1.5">
      {children}
    </label>
  )
}

const optionClass = (selected: boolean) =>
  `py-3 px-2 rounded-2xl border text-sm transition-all text-center ${
    selected
      ? 'border-amber-500 bg-amber-50/70 dark:bg-amber-950/30 text-amber-950 dark:text-amber-200 font-bold shadow-sm'
      : 'border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-800/40 text-zinc-700 dark:text-zinc-300 font-medium hover:bg-zinc-100 dark:hover:bg-zinc-800'
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
    <label className="flex items-center justify-between gap-4 p-3.5 rounded-2xl bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700 cursor-pointer">
      <div>
        <div className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">{label}</div>
        {hint && <div className="text-xs text-zinc-500 dark:text-zinc-400">{hint}</div>}
      </div>
      <input
        type="checkbox"
        role="switch"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="sr-only peer"
      />
      <span className="relative shrink-0 w-11 h-6 rounded-full bg-zinc-300 dark:bg-zinc-600 peer-checked:bg-amber-500 transition-colors after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:w-5 after:h-5 after:rounded-full after:bg-white after:shadow after:transition-transform peer-checked:after:translate-x-5 peer-focus-visible:ring-2 peer-focus-visible:ring-amber-500" />
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
    <button
      type="submit"
      disabled={busy || disabled}
      className="w-full bg-amber-400 hover:bg-amber-500 text-zinc-950 font-bold py-4 px-4 rounded-2xl transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
    >
      {busy ? (
        <>
          <span className="w-4 h-4 border-2 border-zinc-700/30 border-t-zinc-950 rounded-full animate-spin" />
          <span>{busyText}</span>
        </>
      ) : (
        children
      )}
    </button>
  )
}

export function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-white dark:bg-zinc-900 rounded-3xl p-5 border border-zinc-200/80 dark:border-zinc-800 shadow-sm space-y-5">
      {children}
    </div>
  )
}
