// Turn a Supabase/network error into something we can show a rider.
// Our database functions raise plain-English messages (e.g. "You already have
// a trip around this time."), which arrive with code P0001 — show those as-is.
export function friendlyError(error: unknown, fallback = 'Something went wrong. Please try again.') {
  if (!error) return fallback
  const { code, message = '' } = error as { code?: string; message?: string }

  if (code === 'P0001' && message) return message
  if (code === '42501') return "Sorry, you can't make that change."
  if (/failed to fetch|networkerror|network request failed|load failed/i.test(message)) {
    return 'You seem to be offline. Check your connection and try again.'
  }
  return fallback
}
