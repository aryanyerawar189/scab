import Link from 'next/link'
import { Icon } from '../ui/icons'

export default function TripPageShell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="min-h-dvh flex flex-col">
      <header className="sticky top-0 z-20 bg-canvas pt-[env(safe-area-inset-top)]">
        <div className="max-w-md mx-auto px-4 h-16 flex items-center gap-2">
          <Link
            href="/"
            aria-label="Back to home"
            className="size-10 -ml-2 rounded-full flex items-center justify-center text-ink hover:bg-surface-2 transition-colors"
          >
            <Icon.ArrowLeft />
          </Link>
          <h1 className="font-bold text-xl tracking-tight">{title}</h1>
        </div>
      </header>

      <main className="flex-1 max-w-md mx-auto w-full px-4 pt-2 pb-[max(6rem,env(safe-area-inset-bottom))]">{children}</main>
    </div>
  )
}
