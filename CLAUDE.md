@AGENTS.md

# SCab

SCab matches two people leaving the same pickup at the same time and heading the same way, so they share one cab and each pay about half. Airports are the main use case (any Indian airport, per terminal); any address works too. Cabs are booked outside SCab (Uber deep link); riders settle up via UPI.

Scope: India only for now (Ola Maps covers only India), but the schema is built for more countries: `regions` own currency, timezone and fares.

**Product rules live in `docs/SCAB_SPEC.md`** (pickups, ready window, matching rules, fare split, booker rules, statuses, tunable settings). Read the relevant section before changing behaviour. This file covers how the code works.

Core principle from the spec: SCab must never make a trip worse than booking alone.

## Stack

- **Next.js 16.4** (App Router, Turbopack, `cacheComponents: true`) + **React 19.3**. This is newer than most training data, so check `node_modules/next/dist/docs/` before using an API you're unsure of (see `AGENTS.md`).
- **Supabase**: Postgres 17 + PostGIS, Auth (Google only), Realtime, Cron. Accessed with `@supabase/ssr`.
- **Tailwind CSS v4** (via `@tailwindcss/turbopack`; no `tailwind.config`).
- **Ola Maps** for place search and road distance (server-side only).
- TypeScript strict, path alias `@/*` → repo root. No test suite yet.

## Commands

```bash
npm run dev        # dev server on :3000
npm run build
npm run lint
npx tsc --noEmit   # type-check
npm run db:types   # regenerate types/database.types.ts from the live DB
```

## Where the logic lives

**Most business logic is in Postgres, not TypeScript.** Matching, ready windows, fare estimates, match state transitions, booker lock, fare split and expiry are all PL/pgSQL functions and triggers. The Next.js app is a thin UI that inserts trips and calls RPCs.

| Concern | Where |
|---|---|
| Pickup (terminal → its location; address → own point), region, ready window, distance sanity check, overlap/30-day checks | `prepare_trip()` trigger (BEFORE INSERT/UPDATE on `trips`) |
| Matching on new trip | `match_new_trip()` trigger → `try_match()` → `create_match()` |
| "Same pickup" (rule 1): same terminal, or address pickups ≤ `max_pickup_walk_m` apart | `pickups_compatible()` |
| Pair scoring (fares, saving %, extra minutes incl. walking, who walks) | `pair_estimate()` (spec §6.3) |
| Ending matches, re-matching | `end_match()`, `recheck_trip()` |
| Every-minute timeouts, expiry, retry matching | `scab_housekeeping()` via `pg_cron` job `scab-housekeeping` |
| Tunable numbers | single-row table `matching_settings` (id = 1); fares, currency and minimum saving per region in `regions` (spec §9) |
| Airports and terminals | tables `airports` (116 Indian airports), `terminals` (meeting point per terminal; single-terminal airports have code `MAIN`). `airport_at(lat, lng)` returns the airport + terminals at a point |
| Rider actions | RPCs: `airport_at`, `check_in`, `mark_landed`, `report_delay`, `extend_wait`, `near_miss`, `respond_to_match`, `find_another_rider`, `cancel_match`, `request_booker_swap`, `respond_booker_swap`, `mark_booked`, `update_fare`, `respond_to_fare`, `mark_paid`, `report_not_received`, `rider_stats` |

The full schema is in `supabase/migrations/`: the baseline (a `pg_dump` of the original schema) plus one file per change. The later migrations have explanatory comments; the baseline has none.

## App structure

```
proxy.ts                      Next 16 "proxy" (formerly middleware): refreshes the Supabase session
utils/supabase/{server,client,middleware}.ts   Supabase clients (typed with Database)
utils/trips.ts                Trip type, TRIP_COLUMNS, WAIT_OPTIONS, Uber deep link
utils/format.ts               date/time/₹ formatting (browser-local timezone)
utils/friendly-error.ts       Supabase error → rider-facing message
utils/ola-maps.ts             Ola Maps calls (server-only; key never reaches the browser)
app/page.tsx                  Home: auth + onboarding gate, loads trips
app/home-trips.tsx            Big buttons + "My trips", live via Realtime (client-only)
app/trip-card.tsx             One trip on the home list: status, near-miss offer, I'm out / I'm ready / Landed / Delayed / Cancel / Book solo
app/trips/actions.ts          Server actions: createLiveTrip (returns trip id), createScheduledTrip
app/trips/live/, app/trips/new/   "I'm leaving now" and "Schedule a ride" forms (airport: landing time, bags; address: "Leave at")
app/trips/[id]/               One trip, live: searching screen with countdown → match found / accept-decline → no co-rider
app/trips/pickup-field.tsx    "From": address search → airport_at() → airport (terminal: rider always picks; auto only if one) or address
app/trips/place-search.tsx    Address autocomplete (pickup and drop) → /api/places/*
app/trips/near-miss-offer.tsx "Wait X more min?" offer (used by trip card and searching screen)
app/trips/form-controls.tsx   Shared form UI (Segmented, WaitChips, Toggle, …)
app/api/places/{autocomplete,details}/route.ts   Auth-gated proxies to Ola Maps
app/login/, app/auth/callback/   Google OAuth via Supabase
app/onboarding/               Collect gender (locked once set) + phone
app/toast.tsx                 useToast() provider
types/database.types.ts       GENERATED by `npm run db:types`, never edit by hand
```

### Built vs not built

- **Built (UI):** Google login, onboarding, home with live trip list, create live/scheduled trips from any Indian airport (terminal) or any address, searching screen with countdown, accept/decline a proposed match, basic "co-rider found" view (meeting point, who walks, share, saving), I'm out / I'm ready, Landed, Flight delayed, near-miss "Wait" offer, cancel an open trip, "Book solo on Uber".
- **Backend only, no UI yet:** chat (`messages`), booker swap, mark booked, fare confirm/dispute, payment, rating, find another rider, cancel a matched trip, rider stats.
- **Not built at all:** saved places, PWA setup, receipt upload (column `matches.receipt_url` exists), logging unknown airports, maps provider outside India.

## Conventions

### Pages
Every authenticated page follows the same pattern (see `app/trips/live/page.tsx`):
```ts
export const instant = false        // allowed to block on the server (reads session); Next 16 cacheComponents
export default async function Page() {
  await connection()                // per-request, never prerendered
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  // profile.gender missing → redirect('/onboarding')
}
```
Anything that depends on the current time or the rider's timezone (default times, "Landed" buttons, formatted times) renders **client-only** via `next/dynamic` with `ssr: false` (see `home-trips-loader.tsx`, `trip-form-loader.tsx`). `utils/format.ts` must only run in the browser.

### Writing data
- **Insert trips** through server actions in `app/trips/actions.ts` (they validate, compute road distance via Ola Maps, then insert). The DB fills `ready_from/ready_until`, `stage`, `status`, `pickup_*`, `drop_lat/lng`.
- **Everything else goes through RPCs** (`supabase.rpc('check_in', …)`). RLS deliberately allows only one direct update: an owner changing their own trip from `open` → `cancelled`. Matches and members have no direct write policies.
- Locations are PostGIS `geography(Point, 4326)`, sent as EWKT **longitude first**: `SRID=4326;POINT(lng lat)`.

### Errors
DB functions `raise exception` with plain-English, rider-facing messages (e.g. `'You already have a trip around this time.'`). These arrive as code `P0001`, and `friendlyError()` shows them as-is. When adding a function, write its exception messages for riders. Surface errors with `useToast()`.

### UI and copy
- Mobile-first, content in `max-w-md`. Palette: zinc neutrals + amber-400/500 primary, emerald for success. Every colour has a `dark:` variant (dark mode follows the OS).
- Copy is short, friendly, plain English ("Looking for a co-rider…", "No co-rider this time"). Rupees via `formatRupees` (`en-IN`). Times like "8:15 PM".
- Code style: single quotes, no semicolons, 2-space indent, small client components with `'use client'`.

### Types
- After any schema change, run `npm run db:types` and commit the result.
- `utils/trips.ts` has a **hand-written** `Trip` type and `TRIP_COLUMNS` string. Update them too if you change `trips` columns the UI reads.

## Database changes (migrations)

The Supabase CLI is installed as a dev dependency (always use `npx supabase`), logged in, and linked to project `ulmfpwmbkoajlrjffpqv` (region ap-southeast-1). **There is only one Supabase database: production.** There is no Docker, so there is no local Supabase stack, and `db pull`, `db dump`, `db diff` and `db reset` don't work. `migration list`, `migration new` and `db push` do.

**Test locally first** with `supabase/local-test/run.sh [checks.sql …]`: it starts a throwaway Postgres 18 + PostGIS (Homebrew) on 127.0.0.1:54329, applies every migration in order with Supabase stand-ins (`stubs.sql`: roles, `auth.users`/`auth.uid()`, cron, realtime publication), then runs your check files. Act as a rider with `set role authenticated; set request.jwt.claim.sub = '<uuid>';`. Stop with `run.sh stop`.

Workflow:
1. `npx supabase migration new <snake_case_name>` creates `supabase/migrations/<timestamp>_<name>.sql`.
2. Write the SQL and test it with `supabase/local-test/run.sh` (existing data moves over, new behaviour, error messages, permissions).
3. Show it to the user and get approval before pushing, because it runs straight against production.
4. `npx supabase db push --dry-run`, then `npx supabase db push`.
5. `npm run db:types`; update `utils/trips.ts` if needed. `npx tsc --noEmit` and `npm run build`.
6. Commit the migration and the types together.

Rules:
- **Never edit a migration that has been pushed.** Write a new one. `20261029000000_baseline.sql` is the dump of the DB as it was before migrations started; it is recorded as already applied and must never run against production. Before the first push in a session, check `npx supabase migration list --linked` shows it under both Local and Remote.
- **No schema changes in the Supabase dashboard.** They won't be in git, and the repo drifts from the DB.
- Write re-runnable SQL where possible (`if not exists`, `create or replace`, `drop … if exists`).
- **Function permissions:** Supabase's default privileges grant EXECUTE on every new `public` function to `anon` and `authenticated`. In every migration that creates a function, explicitly `revoke execute … from public, anon, authenticated` and then `grant execute … to authenticated` only for functions the app calls via RPC. Internal helpers (like `try_match`, `end_match`, `create_match`) must stay ungranted.
- `security definer` functions use `set search_path = ''`, so fully qualify everything: `public.trips`, `extensions.st_distance(...)`. PostGIS lives in the `extensions` schema.
- RPCs that act for a rider must check ownership with `(select auth.uid())` (see `my_active_trip()`, `is_match_member()`).
- New tables need RLS enabled plus policies. If the UI needs live updates, add the table to the `supabase_realtime` publication. Currently published: `trips`, `matches`, `match_members`, `messages`.
- New tunable numbers go in `matching_settings` as columns with defaults, not as constants in code.

## Debugging notes

- `try_match()` catches **all** exceptions and only emits `raise warning` (so a race doesn't fail the trip insert). If matching "silently doesn't happen", check Postgres logs for `try_match(...) skipped:` before assuming no pair qualified.
- Matching also retries every minute from cron. Something can match up to ~1 minute after the triggering change.
- `prepare_trip()` runs on **every** trips update and recomputes the ready window. Updating `landing_at`, `wait_minutes` or `checked_in_at` moves the window automatically.
- Road distance from the app is kept only if it's between 1× and 2× the straight-line distance; otherwise the DB estimates it (`road_factor` × straight line).
- Two address trips that "should" match often don't because of rule 3 or 4, not rule 1: the walk counts towards `max_extra_minutes` (2 km ≈ 27 min > 15), and `regions.min_saving_amount` (₹200) blocks short city trips. Check with `select * from public.pair_estimate(a, b)` on the two trip rows.
- Address trips get their region from `regions.area` (a rough polygon); a pickup outside every active region fails with "SCab isn't available here yet."
- Airport pickups ignore the rider's picked coordinates: `prepare_trip()` uses the terminal's location and builds `pickup_label` from the airport and terminal names.
- The home list refreshes on Realtime changes to the rider's own `trips` rows and on tab focus (phones pause background tabs).

## Environment

`.env.local` (gitignored):
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` or `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (either works)
- `OLA_MAPS_API_KEY`: server-only. Never prefix it with `NEXT_PUBLIC_` or import `utils/ola-maps.ts` from client code.

Google OAuth redirects to `/auth/callback`. The allowed redirect URLs are configured in the Supabase dashboard (Auth → URL Configuration), not in `supabase/config.toml`, which only affects a local stack.
