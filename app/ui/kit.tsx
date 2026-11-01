// Shared building blocks. Colours come from the tokens in app/globals.css.

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'danger-soft' | 'dark'
type Size = 'sm' | 'md' | 'lg'

const variants: Record<Variant, string> = {
  primary: 'bg-brand text-on-brand hover:bg-brand-strong',
  secondary: 'bg-surface-2 text-ink hover:bg-line',
  ghost: 'text-ink-2 hover:text-ink hover:bg-surface-2',
  danger: 'bg-danger text-white hover:brightness-110',
  'danger-soft': 'bg-danger-soft text-danger hover:brightness-95',
  dark: 'bg-ink text-canvas hover:opacity-90',
}

const sizes: Record<Size, string> = {
  sm: 'h-9 px-3.5 text-sm rounded-full gap-1.5',
  md: 'h-12 px-4 text-base rounded-lg gap-2',
  lg: 'h-14 px-5 text-lg rounded-lg gap-2',
}

export function buttonClass({
  variant = 'primary',
  size = 'md',
  block = false,
  className = '',
}: { variant?: Variant; size?: Size; block?: boolean; className?: string } = {}) {
  return [
    'inline-flex items-center justify-center font-medium select-none whitespace-nowrap',
    'transition-[background-color,opacity,transform,filter] active:scale-[0.98]',
    'disabled:opacity-45 disabled:pointer-events-none',
    variants[variant],
    sizes[size],
    block ? 'w-full' : '',
    className,
  ].join(' ')
}

export function Spinner({ className = 'size-4' }: { className?: string }) {
  return (
    <span
      role="status"
      aria-label="Loading"
      className={`inline-block rounded-full border-2 border-current border-r-transparent animate-spin opacity-70 ${className}`}
    />
  )
}

export function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-surface rounded-xl border border-line ${className}`}>{children}</div>
  )
}

type Tone = 'brand' | 'success' | 'neutral' | 'danger' | 'info'
const tones: Record<Tone, string> = {
  brand: 'bg-brand-soft text-brand-ink',
  success: 'bg-success-soft text-success',
  neutral: 'bg-surface-2 text-ink-2',
  danger: 'bg-danger-soft text-danger',
  info: 'bg-info-soft text-info',
}

export function Badge({ tone = 'neutral', dot = false, children }: { tone?: Tone; dot?: boolean; children: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1.5 h-6 px-2 rounded-md text-xs font-medium ${tones[tone]}`}>
      {dot && <span className="size-1.5 rounded-full bg-current" />}
      {children}
    </span>
  )
}

// Mark: a black tile with a stylised "S" route (two stops joined)
export function Logo({ size = 'md' }: { size?: 'md' | 'lg' }) {
  const tile = size === 'lg' ? 'size-14 rounded-xl' : 'size-8 rounded-lg'
  const svg = size === 'lg' ? 'size-8' : 'size-[18px]'
  return (
    <span className={`${tile} bg-brand text-on-brand inline-flex items-center justify-center`}>
      <svg viewBox="0 0 24 24" className={svg} fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" aria-hidden="true">
        <path d="M17 6.5H9.5a3 3 0 0 0 0 6h5a3 3 0 0 1 0 6H7" />
        <circle cx="18.5" cy="6.5" r="1.6" fill="currentColor" stroke="none" />
        <circle cx="5.5" cy="18.5" r="1.6" fill="currentColor" stroke="none" />
      </svg>
    </span>
  )
}

// From → To with a connecting line, the way ride apps show a route
export function RouteLine({
  from,
  to,
  fromIcon,
  compact = false,
}: {
  from: string
  to: string
  fromIcon?: React.ReactNode
  compact?: boolean
}) {
  const text = compact ? 'text-sm' : 'text-[15px]'
  return (
    <div className="grid grid-cols-[16px_1fr] gap-x-3 min-w-0">
      <div className="flex flex-col items-center pt-[7px]">
        <span className="size-2 rounded-full bg-ink shrink-0" />
        <span className="w-0.5 flex-1 my-1 bg-ink" />
        <span className="size-2 bg-ink shrink-0 mb-[7px]" />
      </div>
      <div className="min-w-0 space-y-2.5">
        <div className="min-w-0">
          <div className="text-[11px] font-medium uppercase tracking-wider text-ink-3 flex items-center gap-1">
            From {fromIcon}
          </div>
          <div className={`${text} text-ink-2 truncate`}>{from}</div>
        </div>
        <div className="min-w-0">
          <div className="text-[11px] font-medium uppercase tracking-wider text-ink-3">To</div>
          <div className={`${text} font-semibold text-ink truncate`}>{to}</div>
        </div>
      </div>
    </div>
  )
}

export function SectionTitle({ children, aside }: { children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between mb-2">
      <h2 className="text-xl font-bold tracking-tight text-ink">{children}</h2>
      {aside}
    </div>
  )
}
