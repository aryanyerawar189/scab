import Link from 'next/link'

export default function TripPageShell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 flex flex-col">
      <header className="sticky top-0 z-10 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-md border-b border-zinc-200/80 dark:border-zinc-800">
        <div className="max-w-md mx-auto px-4 h-16 flex items-center gap-3">
          <Link
            href="/"
            aria-label="Back to home"
            className="w-9 h-9 -ml-1 rounded-full flex items-center justify-center text-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
          >
            ←
          </Link>
          <h1 className="font-extrabold text-lg tracking-tight">{title}</h1>
        </div>
      </header>

      <main className="flex-1 max-w-md mx-auto w-full px-4 py-6 pb-24">{children}</main>
    </div>
  )
}
