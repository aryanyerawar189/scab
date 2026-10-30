'use client'

import dynamic from 'next/dynamic'
import type { Trip } from '@/utils/trips'

// Rendered in the browser only: the countdown and times depend on the rider's clock and timezone
const TripStatus = dynamic(() => import('./trip-status'), {
  ssr: false,
  loading: () => (
    <div className="flex justify-center py-16">
      <div className="w-8 h-8 border-2 border-zinc-300 border-t-amber-500 rounded-full animate-spin" />
    </div>
  ),
})

export default function TripStatusLoader(props: { initialTrip: Trip; userId: string }) {
  return <TripStatus {...props} />
}
