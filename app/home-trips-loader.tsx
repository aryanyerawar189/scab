'use client'

import dynamic from 'next/dynamic'
import type { Trip } from '@/utils/trips'

// Rendered in the browser only: buttons and times depend on the rider's clock and timezone
const HomeTrips = dynamic(() => import('./home-trips'), {
  ssr: false,
  loading: () => (
    <div className="flex justify-center py-16">
      <div className="w-8 h-8 border-2 border-zinc-300 border-t-amber-500 rounded-full animate-spin" />
    </div>
  ),
})

export default function HomeTripsLoader(props: { userId: string; initialTrips: Trip[] }) {
  return <HomeTrips {...props} />
}
