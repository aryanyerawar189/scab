'use client'

import dynamic from 'next/dynamic'
import type { Trip } from '@/utils/trips'

// Rendered in the browser only: buttons and times depend on the rider's clock and timezone
const HomeTrips = dynamic(() => import('./home-trips'), {
  ssr: false,
  loading: () => (
    <div className="space-y-3" aria-busy="true">
      <div className="h-14 rounded-full bg-surface-2 animate-pulse" />
      <div className="grid grid-cols-2 gap-3 pt-14">
        <div className="h-24 rounded-xl bg-surface-2 animate-pulse" />
        <div className="h-24 rounded-xl bg-surface-2 animate-pulse" />
      </div>
    </div>
  ),
})

export default function HomeTripsLoader(props: { userId: string; initialTrips: Trip[] }) {
  return <HomeTrips {...props} />
}
