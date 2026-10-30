'use client'

import dynamic from 'next/dynamic'

// Rendered in the browser only: the default departure time comes from the rider's clock
const TripForm = dynamic(() => import('./trip-form'), {
  ssr: false,
  loading: () => (
    <div className="flex justify-center py-16">
      <div className="w-8 h-8 border-2 border-zinc-300 border-t-amber-500 rounded-full animate-spin" />
    </div>
  ),
})

export default function TripFormLoader({ showWomenOnly }: { showWomenOnly: boolean }) {
  return <TripForm showWomenOnly={showWomenOnly} />
}
