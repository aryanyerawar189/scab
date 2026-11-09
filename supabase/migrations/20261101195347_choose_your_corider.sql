-- =====================================================================
-- Choose your co-rider (SCAB_SPEC.md §6, v5)
--
-- Matching is no longer automatic. A rider posts a ride, then sees every
-- compatible rider who has also posted ("options"), best saving first.
-- They send ONE request at a time; the other rider accepts or declines.
-- Accepting creates a confirmed match straight away. No auto-accept.
--
-- Hard rules (all about time and effort, no rupee minimum any more):
--   1. Same terminal, or address pickups within walking distance. Each rider
--      says how far they'll walk (trips.max_walk_m); the later poster walks if
--      they can, otherwise the earlier one.
--   2. Ready windows overlap by >= min_overlap_minutes.
--   3. Detour <= max_detour_km, measured in ROAD km. The road km between the
--      two drops comes from Ola Maps via the app server (sanity-checked
--      against the straight line); otherwise it's estimated.
--   4. Saving > 0 (never worse than riding alone) and >= min_saving_percent.
--   5. Women-only respected.  6. Never re-pair after a decline.
-- Riders see only a percentage ("You may save up to 47%"), never rupees.
--
-- Removed: try_match(), the on-insert matching trigger and the every-minute
-- retry. Kept but unused: trips.auto_accept, regions.min_saving_amount.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. Columns and settings
-- ---------------------------------------------------------------------
alter table public.trips
  add column if not exists max_walk_m int not null default 0
  constraint trips_max_walk_m_check check (max_walk_m between 0 and 5000);
comment on column public.trips.max_walk_m is
  'Address pickups: how far this rider will walk to meet a co-rider (metres). Capped by matching_settings.max_pickup_walk_m';

alter table public.matching_settings
  add column if not exists max_detour_km             numeric not null default 5,
  add column if not exists request_minutes_live      int     not null default 5,
  add column if not exists request_minutes_scheduled int     not null default 360;
comment on column public.matching_settings.max_detour_km is
  'Hard limit: extra road km the cab drives to drop the second rider';
comment on column public.matching_settings.request_minutes_live is
  'How long a request waits for a reply when either ride is live';
comment on column public.matching_settings.request_minutes_scheduled is
  'How long a request waits for a reply between two scheduled rides';
comment on column public.matching_settings.max_pickup_walk_m is
  'Upper limit for trips.max_walk_m (the rider picks their own walking distance)';
comment on column public.matching_settings.min_saving_percent is
  'Saving must also be > 0; riders see the % and decide, so this is 0 by default';
comment on column public.regions.min_saving_amount is 'Unused since v5 (riders choose; no rupee minimum)';
comment on column public.trips.auto_accept is 'Unused since v5 (every match is a request the other rider accepts)';

update public.matching_settings set min_saving_percent = 0 where id = 1;


-- ---------------------------------------------------------------------
-- 2. Server secret: lets the app server (not browsers) read drop points so it
--    can ask Ola Maps for the road km between two riders' drops.
--    Only the SHA-256 of SCAB_SERVER_SECRET is stored.
-- ---------------------------------------------------------------------
create table if not exists public.server_secrets (
  name   text primary key,
  sha256 bytea not null
);
alter table public.server_secrets enable row level security;   -- no policies: nobody reads it directly
revoke all on table public.server_secrets from anon, authenticated;

insert into public.server_secrets (name, sha256)
values ('app_server', decode('46eba4444515f1eb487c4ee39ecb56c4122f652bfc1b3340a82aae45b36b774b', 'hex'))
on conflict (name) do update set sha256 = excluded.sha256;


-- ---------------------------------------------------------------------
-- 3. Requests
-- ---------------------------------------------------------------------
create table if not exists public.match_requests (
  id             uuid primary key default gen_random_uuid(),
  from_trip_id   uuid not null references public.trips (id) on delete cascade,
  to_trip_id     uuid not null references public.trips (id) on delete cascade,
  from_user_id   uuid not null references public.profiles (id) on delete cascade,
  to_user_id     uuid not null references public.profiles (id) on delete cascade,
  status         text not null default 'pending'
                 check (status in ('pending', 'accepted', 'declined', 'withdrawn', 'expired', 'closed')),
  drop_gap_km    numeric,          -- road km between the two drops (Ola Maps), if the app had it
  saving_percent numeric,          -- what the sender saw, shown to the receiver
  detour_km      numeric,
  created_at     timestamptz not null default now(),
  expires_at     timestamptz not null,
  responded_at   timestamptz,
  check (from_trip_id <> to_trip_id)
);
comment on table public.match_requests is
  'Rider A asks rider B to share. closed = no longer possible (a trip matched, ended or stopped fitting)';

-- One request waiting at a time per ride, and never two for the same pair
create unique index if not exists match_requests_one_pending_out
  on public.match_requests (from_trip_id) where status = 'pending';
create unique index if not exists match_requests_one_pending_pair
  on public.match_requests (from_trip_id, to_trip_id) where status = 'pending';
create index if not exists match_requests_to_trip on public.match_requests (to_trip_id) where status = 'pending';
create index if not exists match_requests_to_user on public.match_requests (to_user_id);
create index if not exists match_requests_from_user on public.match_requests (from_user_id);

alter table public.match_requests enable row level security;
drop policy if exists "requests: read own" on public.match_requests;
create policy "requests: read own" on public.match_requests for select to authenticated
  using (from_user_id = (select auth.uid()) or to_user_id = (select auth.uid()));
-- No write policies: requests change only through the RPCs below
grant select on table public.match_requests to authenticated;

do $$ begin
  alter publication supabase_realtime add table public.match_requests;
exception when duplicate_object then null;
end $$;


-- ---------------------------------------------------------------------
-- 4. Turn off automatic matching
-- ---------------------------------------------------------------------
drop trigger if exists trips_match_on_insert on public.trips;
drop function if exists public.match_new_trip();
drop function if exists public.try_match(uuid);
drop function if exists public.near_miss(uuid);
drop function if exists public.create_match(uuid, uuid);
drop function if exists public.pair_estimate(public.trips, public.trips);


-- ---------------------------------------------------------------------
-- 5. Rules
-- ---------------------------------------------------------------------

-- Rule 1. Address pickups: within the walking distance of whichever rider walks.
create or replace function public.pickups_compatible(p_a public.trips, p_b public.trips)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_a.region_id = p_b.region_id
     and case
           when p_a.terminal_id is not null or p_b.terminal_id is not null
             then p_a.terminal_id is not distinct from p_b.terminal_id
           else extensions.st_distance(p_a.pickup_location, p_b.pickup_location)
                <= greatest(50, least((select max_pickup_walk_m from public.matching_settings where id = 1),
                                      greatest(p_a.max_walk_m, p_b.max_walk_m)))
         end;
$$;

-- Estimates for a possible pair. All distances in road km:
--   each rider's own trip: Ola Maps (trips.distance_km) or straight line × road_factor
--   drop → drop: p_drop_gap_km from Ola Maps if believable, else straight line × road_factor
-- Meeting point = the non-walker's pickup. Walker = later poster if their max_walk_m
-- covers the gap, else the earlier poster. Nobody walks under 50 m.
-- detour_km = (meet → nearer drop) + (nearer → farther drop) − (meet → farther drop)
create function public.pair_estimate(p_a public.trips, p_b public.trips, p_drop_gap_km numeric default null)
returns table (solo_a numeric, solo_b numeric, shared_fare numeric, saving_percent numeric,
               detour_km numeric, extra_minutes numeric, walker_trip_id uuid, walk_m numeric,
               drop_gap_km numeric)
language sql stable security definer set search_path = '' as $$
  with s as (
    select r.fare_base, r.fare_per_km, ms.road_factor, ms.city_speed_kmph, ms.stop_minutes
    from public.matching_settings ms
    join public.regions r on r.id = p_a.region_id
    where ms.id = 1
  ),
  o as (
    select extensions.st_distance(p_a.pickup_location, p_b.pickup_location)::numeric as d,
           (p_a.created_at, p_a.id) <= (p_b.created_at, p_b.id)                     as a_first
  ),
  w as (
    select o.d,
           case when o.d < 50 then null::uuid
                when (case when o.a_first then p_b.max_walk_m else p_a.max_walk_m end) >= o.d
                  then case when o.a_first then p_b.id else p_a.id end
                else case when o.a_first then p_a.id else p_b.id end
           end as walker
    from o
  ),
  m as (
    select w.*, case when w.walker = p_a.id then p_b.pickup_location else p_a.pickup_location end as meet
    from w
  ),
  g as (   -- straight-line km
    select m.*,
           (extensions.st_distance(p_a.pickup_location, p_a.drop_location) / 1000)::numeric as sa,
           (extensions.st_distance(p_b.pickup_location, p_b.drop_location) / 1000)::numeric as sb,
           (extensions.st_distance(m.meet, p_a.drop_location) / 1000)::numeric             as ma,
           (extensions.st_distance(m.meet, p_b.drop_location) / 1000)::numeric             as mb,
           (extensions.st_distance(p_a.drop_location, p_b.drop_location) / 1000)::numeric  as sab
    from m
  ),
  r as (   -- road km
    select s.*, g.*,
           coalesce(p_a.distance_km, g.sa * s.road_factor) as ra,
           coalesce(p_b.distance_km, g.sb * s.road_factor) as rb,
           case when g.walker = p_a.id then g.ma * s.road_factor
                else coalesce(p_a.distance_km, g.sa * s.road_factor) end as rma,
           case when g.walker = p_b.id then g.mb * s.road_factor
                else coalesce(p_b.distance_km, g.sb * s.road_factor) end as rmb,
           case when p_drop_gap_km is not null
                 and p_drop_gap_km >= g.sab * 0.95
                 and p_drop_gap_km <= greatest(g.sab * 2, g.sab + 1)
                then p_drop_gap_km
                else g.sab * s.road_factor end as gap
    from s, g
  ),
  d as (
    select r.*, greatest(0, least(r.rma, r.rmb) + r.gap - greatest(r.rma, r.rmb)) as detour
    from r
  ),
  f as (
    select d.*,
           d.fare_base + d.fare_per_km * d.ra                                    as fa,
           d.fare_base + d.fare_per_km * d.rb                                    as fb,
           d.fare_base + d.fare_per_km * (greatest(d.rma, d.rmb) + d.detour)     as fs
    from d
  )
  select round(fa), round(fb), round(fs),
         round(100 * (1 - fs / (fa + fb)), 1),
         round(detour, 1),
         round(detour / city_speed_kmph * 60 + stop_minutes, 1),
         walker,
         case when walker is not null then round(d) else 0 end,
         round(gap, 1)
  from f;
$$;

-- Rule 6: declined requests block the pair too (as do declined/cancelled/timed-out matches)
create or replace function public.pair_blocked(p_user_1 uuid, p_user_2 uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.matches m
                 join public.match_members a on a.match_id = m.id and a.user_id = p_user_1
                 join public.match_members b on b.match_id = m.id and b.user_id = p_user_2
                 where m.status = 'cancelled' and m.cancel_reason in ('declined', 'cancelled', 'timeout'))
      or exists (select 1 from public.match_requests r
                 where r.status = 'declined'
                   and ((r.from_user_id = p_user_1 and r.to_user_id = p_user_2)
                     or (r.from_user_id = p_user_2 and r.to_user_id = p_user_1)));
$$;

-- Every rider who fits p_me, in one place (options, requests, accepting, near-miss).
-- p_gaps: {"<trip id>": road km between the drops}. p_detour_slack > 1 loosens the
-- detour limit for a first pass before the app fetches exact road km.
-- p_near_miss: riders ready shortly AFTER p_me's window instead of overlapping it.
create function public.match_candidates(p_me public.trips, p_gaps jsonb default null,
                                        p_detour_slack numeric default 1, p_near_miss boolean default false)
returns table (trip_id uuid, ready_from timestamptz, ready_until timestamptz, saving_percent numeric,
               detour_km numeric, walker_trip_id uuid, walk_m numeric, drop_gap_km numeric,
               needed_wait int)
language sql stable security definer set search_path = '' as $$
  select c.id, c.ready_from, c.ready_until, e.saving_percent, e.detour_km, e.walker_trip_id, e.walk_m,
         e.drop_gap_km,
         ceil(extract(epoch from (c.ready_from + make_interval(mins => s.min_overlap_minutes)
                                  - p_me.ready_until)) / 60)::int
  from public.trips c
  join public.profiles pc on pc.id = c.user_id
  join public.profiles pm on pm.id = p_me.user_id
  join public.matching_settings s on s.id = 1
  cross join lateral public.pair_estimate(p_me, c, (p_gaps ->> c.id::text)::numeric) e
  where c.status = 'open'
    and c.id <> p_me.id
    and c.user_id <> p_me.user_id
    and c.ready_until > now()
    and public.pickups_compatible(p_me, c)                                              -- 1
    and case when p_near_miss
             then c.ready_from >= p_me.ready_from
                  and c.ready_from + make_interval(mins => s.min_overlap_minutes) > p_me.ready_until
             else least(c.ready_until, p_me.ready_until) - greatest(c.ready_from, p_me.ready_from)
                  >= make_interval(mins => s.min_overlap_minutes)                       -- 2
        end
    and e.detour_km <= s.max_detour_km * p_detour_slack                                 -- 3
    and e.saving_percent > 0 and e.saving_percent >= s.min_saving_percent               -- 4
    and (not (c.women_only or p_me.women_only)
         or (coalesce(pc.gender, '') = 'female' and coalesce(pm.gender, '') = 'female')) -- 5
    and not public.pair_blocked(p_me.user_id, c.user_id);                               -- 6
$$;


-- ---------------------------------------------------------------------
-- 6. Matches are created confirmed (both riders agreed)
-- ---------------------------------------------------------------------
create function public.create_match(p_trip_a uuid, p_trip_b uuid, p_drop_gap_km numeric default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  a       public.trips;
  b       public.trips;
  e       record;
  v_match uuid;
begin
  select * into a from public.trips where id = p_trip_a and status = 'open' for update;
  select * into b from public.trips where id = p_trip_b and status = 'open' for update;
  if a.id is null or b.id is null then raise exception 'This rider is no longer available.'; end if;
  if a.user_id = b.user_id then raise exception 'You can''t share a ride with yourself.'; end if;

  select * into e from public.pair_estimate(a, b, p_drop_gap_km);

  insert into public.matches (status, meeting_point, currency, estimated_fare, saving_percent, extra_minutes,
                              booker_id, accept_deadline, walker_id, walk_m)
  values ('confirmed',
          case when a.terminal_id is not null
               then (select meeting_point from public.terminals where id = a.terminal_id)
               else case when e.walker_trip_id = a.id then b.pickup_label else a.pickup_label end end,
          (select currency from public.regions where id = a.region_id),
          e.shared_fare, e.saving_percent, e.extra_minutes,
          -- the rider going farther books
          case when e.solo_a >= e.solo_b then a.user_id else b.user_id end,
          now(),
          case e.walker_trip_id when a.id then a.user_id when b.id then b.user_id end,
          e.walk_m)
  returning id into v_match;

  insert into public.match_members (match_id, trip_id, user_id, accepted, solo_estimate, estimated_share)
  values (v_match, a.id, a.user_id, true, e.solo_a, round(e.shared_fare * e.solo_a / (e.solo_a + e.solo_b))),
         (v_match, b.id, b.user_id, true, e.solo_b, round(e.shared_fare * e.solo_b / (e.solo_a + e.solo_b)));

  update public.trips set status = 'matched' where id in (a.id, b.id);
  return v_match;
end; $$;

-- A ride that stops looking closes every request still waiting on it
create or replace function public.close_requests_for_trip()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.match_requests
  set status = 'closed', responded_at = now()
  where status = 'pending' and (from_trip_id = new.id or to_trip_id = new.id);
  return null;
end; $$;

drop trigger if exists trips_close_requests on public.trips;
create trigger trips_close_requests
  after update of status on public.trips
  for each row when (old.status = 'open' and new.status <> 'open')
  execute function public.close_requests_for_trip();


-- ---------------------------------------------------------------------
-- 7. Rider RPCs
-- ---------------------------------------------------------------------

-- Options for my open ride, best saving first. Requests sent or received are flagged.
-- p_prefilter: a looser first pass (the app then fetches exact road km and calls again).
create function public.match_options(p_trip_id uuid, p_gaps jsonb default null, p_prefilter boolean default false)
returns table (trip_id uuid, ready_from timestamptz, saving_percent numeric, detour_km numeric,
               walk_m numeric, i_walk boolean, drop_gap_km numeric,
               sent_request_id uuid, sent_expires_at timestamptz,
               received_request_id uuid, received_expires_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
declare me public.trips;
begin
  select * into me from public.trips
  where id = p_trip_id and user_id = (select auth.uid()) and status = 'open' and ready_until > now();
  if me.id is null then return; end if;

  return query
  select c.trip_id, c.ready_from, c.saving_percent, c.detour_km, c.walk_m,
         coalesce(c.walker_trip_id = me.id, false), c.drop_gap_km,
         sr.id, sr.expires_at, rr.id, rr.expires_at
  from public.match_candidates(me, p_gaps, case when p_prefilter then 2 else 1 end) c
  left join public.match_requests sr
         on sr.from_trip_id = me.id and sr.to_trip_id = c.trip_id and sr.status = 'pending'
  left join public.match_requests rr
         on rr.from_trip_id = c.trip_id and rr.to_trip_id = me.id and rr.status = 'pending'
  order by (rr.id is not null) desc, c.saving_percent desc, c.detour_km
  limit case when p_prefilter then 25 else 10 end;
end; $$;

-- Drop points of my ride and of riders who fit it. App server only (secret-gated),
-- so it can ask Ola Maps for the road km between drops. Browsers never see these.
create function public.pair_drop_points(p_secret text, p_trip_id uuid, p_other_trip_ids uuid[])
returns table (trip_id uuid, lat double precision, lng double precision)
language plpgsql stable security definer set search_path = '' as $$
declare me public.trips;
begin
  if p_secret is null or not exists (
       select 1 from public.server_secrets
       where name = 'app_server' and sha256 = pg_catalog.sha256(convert_to(p_secret, 'UTF8'))) then
    raise exception 'Not allowed.';
  end if;
  select * into me from public.trips
  where id = p_trip_id and user_id = (select auth.uid()) and status = 'open';
  if me.id is null then return; end if;

  return query
  select t.id,
         extensions.st_y(t.drop_location::extensions.geometry),
         extensions.st_x(t.drop_location::extensions.geometry)
  from public.trips t
  where t.id = me.id
     or (t.id = any (p_other_trip_ids)
         and t.id in (select c.trip_id from public.match_candidates(me, null, 2) c));
end; $$;

-- Accept a request (internal): re-check the pair, then create the confirmed match
create function public.accept_request(p_request_id uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare
  r public.match_requests;
  f public.trips;
  t public.trips;
begin
  select * into r from public.match_requests where id = p_request_id and status = 'pending' for update;
  if r.id is null then return 'unavailable'; end if;

  select * into f from public.trips where id = r.from_trip_id for update;
  select * into t from public.trips where id = r.to_trip_id for update;
  if f.status <> 'open' or t.status <> 'open'
     or not exists (select 1 from public.match_candidates(t, jsonb_build_object(f.id::text, r.drop_gap_km)) c
                    where c.trip_id = f.id) then
    update public.match_requests set status = 'closed', responded_at = now() where id = r.id;
    return 'unavailable';
  end if;

  update public.match_requests set status = 'accepted', responded_at = now() where id = r.id;
  perform public.create_match(t.id, f.id, r.drop_gap_km);   -- closes every other pending request on both rides
  return 'matched';
end; $$;

-- Ask a rider to share. If they already asked me, it's a match straight away.
create function public.request_match(p_trip_id uuid, p_other_trip_id uuid, p_drop_gap_km numeric default null)
returns text language plpgsql security definer set search_path = '' as $$
declare
  s     public.matching_settings;
  me    public.trips;
  o     public.trips;
  c     record;
  v_rid uuid;
begin
  select * into s from public.matching_settings where id = 1;
  me := public.my_active_trip(p_trip_id);
  if me.status <> 'open' or me.ready_until <= now() then
    raise exception 'This ride is no longer looking for a co-rider.';
  end if;

  select * into o from public.trips where id = p_other_trip_id for update;
  if o.id is null or o.status <> 'open' or o.ready_until <= now() then
    raise exception 'This rider is no longer available.';
  end if;

  -- They asked me first → accept theirs
  select id into v_rid from public.match_requests
  where from_trip_id = o.id and to_trip_id = me.id and status = 'pending' and expires_at > now();
  if v_rid is not null then
    return public.accept_request(v_rid);
  end if;

  if exists (select 1 from public.match_requests where from_trip_id = me.id and status = 'pending') then
    raise exception 'You already have a request waiting. Withdraw it to ask someone else.';
  end if;

  select * into c from public.match_candidates(me, jsonb_build_object(o.id::text, p_drop_gap_km)) x
  where x.trip_id = o.id;
  if not found then raise exception 'This rider no longer fits your trip.'; end if;

  insert into public.match_requests (from_trip_id, to_trip_id, from_user_id, to_user_id,
                                     drop_gap_km, saving_percent, detour_km, expires_at)
  values (me.id, o.id, me.user_id, o.user_id, c.drop_gap_km, c.saving_percent, c.detour_km,
          least(now() + make_interval(mins => case when me.mode = 'live' or o.mode = 'live'
                                                   then s.request_minutes_live
                                                   else s.request_minutes_scheduled end),
                me.ready_until, o.ready_until));
  return 'sent';
end; $$;

create function public.respond_to_request(p_request_id uuid, p_accept boolean)
returns text language plpgsql security definer set search_path = '' as $$
declare r public.match_requests;
begin
  select * into r from public.match_requests
  where id = p_request_id and to_user_id = (select auth.uid()) for update;
  if r.id is null then raise exception 'We couldn''t find this request.'; end if;
  if r.status <> 'pending' then raise exception 'This request is no longer waiting for a reply.'; end if;

  if r.expires_at <= now() then
    update public.match_requests set status = 'expired', responded_at = now() where id = r.id;
    return 'expired';
  end if;

  if not p_accept then
    update public.match_requests set status = 'declined', responded_at = now() where id = r.id;
    return 'declined';
  end if;

  return public.accept_request(r.id);
end; $$;

create function public.withdraw_request(p_request_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.match_requests set status = 'withdrawn', responded_at = now()
  where id = p_request_id and from_user_id = (select auth.uid()) and status = 'pending';
  if not found then raise exception 'This request is no longer waiting for a reply.'; end if;
end; $$;

-- "A rider going 2 km from your drop will be out at 8:47 PM. Wait 12 more min?"
create function public.near_miss(p_trip_id uuid)
returns table (extra_wait_minutes int, other_ready_at timestamptz, drop_gap_km numeric, saving_percent numeric)
language plpgsql stable security definer set search_path = '' as $$
declare
  s  public.matching_settings;
  me public.trips;
begin
  select * into s from public.matching_settings where id = 1;
  select * into me from public.trips
  where id = p_trip_id and user_id = (select auth.uid()) and status = 'open' and ready_until > now();
  if me.id is null then return; end if;

  return query
  select c.needed_wait, c.ready_from, c.drop_gap_km, c.saving_percent
  from public.match_candidates(me, null, 1, true) c
  where c.needed_wait between 1 and s.near_miss_max_minutes
    and me.wait_minutes + c.needed_wait <= 60
  order by c.saving_percent desc, c.needed_wait
  limit 1;
end; $$;


-- ---------------------------------------------------------------------
-- 8. Housekeeping without automatic matching
-- ---------------------------------------------------------------------

-- A ride's window changed: drop requests that no longer fit (either direction)
create or replace function public.recheck_trip(p_trip_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  s     public.matching_settings;
  t     public.trips;
  o     public.trips;
  q     record;
  v_mid uuid;
begin
  select * into s from public.matching_settings where id = 1;
  select * into t from public.trips where id = p_trip_id;

  if t.status = 'open' then
    for q in select r.* from public.match_requests r
             where r.status = 'pending' and (r.from_trip_id = t.id or r.to_trip_id = t.id) loop
      select * into o from public.trips where id = q.to_trip_id;
      if not exists (select 1 from public.trips f
                     cross join lateral public.match_candidates(f, jsonb_build_object(o.id::text, q.drop_gap_km)) c
                     where f.id = q.from_trip_id and c.trip_id = o.id) then
        update public.match_requests set status = 'closed', responded_at = now() where id = q.id;
      end if;
    end loop;
  elsif t.status = 'matched' then
    -- Older proposed matches (before v5) still end if the windows stop overlapping
    select m.id into v_mid from public.matches m
    join public.match_members mm on mm.match_id = m.id
    where mm.trip_id = t.id and m.status = 'proposed';
    if v_mid is not null then
      select o2.* into o from public.trips o2
      join public.match_members mm on mm.trip_id = o2.id
      where mm.match_id = v_mid and o2.id <> t.id;
      if least(t.ready_until, o.ready_until) - greatest(t.ready_from, o.ready_from)
         < make_interval(mins => s.min_overlap_minutes) then
        perform public.end_match(v_mid, 'window_changed', null);
      end if;
    end if;
  end if;
end; $$;

-- Same as before, minus the automatic re-matching at the end
create or replace function public.end_match(p_match_id uuid, p_reason text, p_by uuid default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v_prev text;
begin
  select status into v_prev from public.matches where id = p_match_id for update;
  if v_prev is null or v_prev in ('cancelled', 'completed') then return; end if;

  update public.matches
  set status = 'cancelled', cancel_reason = p_reason, cancelled_by = p_by,
      cancelled_after_booking = (v_prev = 'booked'), swap_requested_by = null
  where id = p_match_id;

  -- The person who cancelled: their trip ends
  if p_reason = 'cancelled' and p_by is not null then
    update public.trips set status = 'cancelled'
    where status = 'matched'
      and id in (select trip_id from public.match_members where match_id = p_match_id and user_id = p_by);
  end if;

  -- Everyone else: back to looking (they'll see options again), or expired if their window is over
  update public.trips
  set status = case when ready_until > now() then 'open' else 'expired' end
  where status = 'matched'
    and id in (select trip_id from public.match_members where match_id = p_match_id);
end; $$;

create or replace function public.scab_housekeeping()
returns void language plpgsql security definer set search_path = '' as $$
declare r record;
begin
  -- a) Older proposed matches nobody fully accepted in time
  for r in select id from public.matches where status = 'proposed' and accept_deadline < now() loop
    perform public.end_match(r.id, 'timeout', null);
  end loop;

  -- b) Confirmed but never booked, 3 hours after both windows ended
  for r in select m.id from public.matches m
           where m.status = 'confirmed'
             and not exists (select 1 from public.match_members mm join public.trips t on t.id = mm.trip_id
                             where mm.match_id = m.id and t.ready_until > now() - interval '3 hours') loop
    perform public.end_match(r.id, 'expired', null);
  end loop;

  -- c) Open rides whose window has ended → expired (closes their requests too)
  update public.trips set status = 'expired' where status = 'open' and ready_until <= now();

  -- d) Requests nobody answered in time
  update public.match_requests set status = 'expired', responded_at = now()
  where status = 'pending' and expires_at <= now();
end; $$;


-- ---------------------------------------------------------------------
-- 9. Permissions
-- ---------------------------------------------------------------------
revoke execute on function public.pickups_compatible(public.trips, public.trips) from public, anon, authenticated;
revoke execute on function public.pair_estimate(public.trips, public.trips, numeric) from public, anon, authenticated;
revoke execute on function public.pair_blocked(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.match_candidates(public.trips, jsonb, numeric, boolean) from public, anon, authenticated;
revoke execute on function public.create_match(uuid, uuid, numeric) from public, anon, authenticated;
revoke execute on function public.close_requests_for_trip() from public, anon, authenticated;
revoke execute on function public.accept_request(uuid) from public, anon, authenticated;
revoke execute on function public.recheck_trip(uuid) from public, anon, authenticated;
revoke execute on function public.end_match(uuid, text, uuid) from public, anon, authenticated;
revoke execute on function public.scab_housekeeping() from public, anon, authenticated;

revoke execute on function public.match_options(uuid, jsonb, boolean) from public, anon, authenticated;
revoke execute on function public.pair_drop_points(text, uuid, uuid[]) from public, anon, authenticated;
revoke execute on function public.request_match(uuid, uuid, numeric) from public, anon, authenticated;
revoke execute on function public.respond_to_request(uuid, boolean) from public, anon, authenticated;
revoke execute on function public.withdraw_request(uuid) from public, anon, authenticated;
revoke execute on function public.near_miss(uuid) from public, anon, authenticated;

grant execute on function public.match_options(uuid, jsonb, boolean) to authenticated;
grant execute on function public.pair_drop_points(text, uuid, uuid[]) to authenticated;
grant execute on function public.request_match(uuid, uuid, numeric) to authenticated;
grant execute on function public.respond_to_request(uuid, boolean) to authenticated;
grant execute on function public.withdraw_request(uuid) to authenticated;
grant execute on function public.near_miss(uuid) to authenticated;
