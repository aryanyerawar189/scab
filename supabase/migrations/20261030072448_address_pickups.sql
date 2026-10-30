-- =====================================================================
-- Address pickups: any address → any address, not only from airports.
--
-- • A trip either has a terminal_id (airport pickup, as before) or its own
--   pickup point (address pickup). The region comes from the terminal's
--   airport, or from regions.area for an address.
-- • Scheduled address trips use depart_at ("Leave at") instead of landing_at.
-- • Address trips match when both have no terminal, are in the same region,
--   and their pickups are within matching_settings.max_pickup_walk_m.
--   The cab picks up once: at the pickup of whoever posted first. The other
--   rider walks there, and that walk counts towards their extra minutes.
-- • Removes the fallback that mapped terminal 'T1'/'T2' to BLR (the app now
--   sends terminal_id).
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. Columns and settings
-- ---------------------------------------------------------------------
alter table public.matching_settings
  add column if not exists max_pickup_walk_m int     not null default 2000,
  add column if not exists walk_speed_kmph   numeric not null default 4.5;

comment on column public.matching_settings.max_pickup_walk_m is
  'Address pickups: max distance between two riders'' pickups (the later poster walks it)';
comment on column public.matching_settings.walk_speed_kmph is
  'Walking speed, to turn the walk to the meeting point into minutes';

alter table public.trips add column depart_at timestamptz;   -- scheduled address trips: "Leave at"
comment on column public.trips.depart_at is 'Scheduled address pickups: when the rider leaves (airport trips use landing_at)';

-- Address trips have no terminal and supply their own pickup label
alter table public.trips alter column terminal drop not null;
alter table public.trips alter column pickup_label drop default;

alter table public.matches
  add column walker_id uuid references public.profiles (id),   -- null when nobody walks (airport, same spot)
  add column walk_m    int;


-- ---------------------------------------------------------------------
-- 2. Trip preparation
-- ---------------------------------------------------------------------
create or replace function public.prepare_trip()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  s          public.matching_settings;
  v_terminal public.terminals;
  v_airport  public.airports;
  v_straight numeric;
  v_exit     int;
  v_start    timestamptz;
begin
  select * into s from public.matching_settings where id = 1;

  if new.terminal_id is not null then
    -- Airport pickup: everything comes from the terminal
    select * into v_terminal from public.terminals where id = new.terminal_id;
    select * into v_airport  from public.airports  where id = v_terminal.airport_id;
    if tg_op = 'INSERT' and (not v_terminal.active or not v_airport.active
        or not exists (select 1 from public.regions where id = v_airport.region_id and active)) then
      raise exception 'SCab isn''t available at this airport yet.';
    end if;
    new.region_id       := v_airport.region_id;
    new.terminal        := v_terminal.code;
    new.pickup_label    := v_airport.name || case when v_terminal.code = 'MAIN' then '' else ', ' || v_terminal.name end;
    new.pickup_location := v_terminal.location;
    new.depart_at       := null;
  else
    -- Address pickup: the rider's own point
    if new.pickup_location is null or coalesce(trim(new.pickup_label), '') = '' then
      raise exception 'Please pick your pickup from the suggestions.';
    end if;
    new.terminal         := null;
    new.landing_at       := null;
    new.checked_bags     := false;
    new.is_international := false;
    if tg_op = 'INSERT' then
      select r.id into new.region_id from public.regions r
      where r.active and extensions.st_covers(r.area, new.pickup_location)
      limit 1;
      if new.region_id is null then
        raise exception 'SCab isn''t available here yet.';
      end if;
    end if;
  end if;

  -- Drop coordinates (for Uber deep links / "Add stop")
  new.drop_lat := extensions.st_y(new.drop_location::extensions.geometry);
  new.drop_lng := extensions.st_x(new.drop_location::extensions.geometry);

  -- Keep the app's road distance only if believable; otherwise estimate it
  v_straight := (extensions.st_distance(new.pickup_location, new.drop_location) / 1000)::numeric;
  if new.distance_km is null or new.distance_km < v_straight or new.distance_km > v_straight * 2 then
    new.distance_km := round(v_straight * s.road_factor, 2);
  end if;

  -- Women-only trips: female accounts only
  if new.women_only and coalesce((select gender from public.profiles where id = new.user_id), '') <> 'female' then
    raise exception 'Only female accounts can create women-only trips.';
  end if;

  if tg_op = 'INSERT' then
    new.status := 'open';
    new.stage  := 'scheduled';
    if new.mode = 'live' then
      new.checked_in_at := now();          -- live = ready now
      new.landing_at    := null;
      new.depart_at     := null;
    else
      new.checked_in_at := null;
      v_start := case when new.terminal_id is not null then new.landing_at else new.depart_at end;
      if v_start is null then
        raise exception '%', case when new.terminal_id is not null
                                  then 'Please enter your landing time.' else 'Please enter when you are leaving.' end;
      end if;
      if v_start > now() + interval '30 days' then
        raise exception 'You can schedule up to 30 days ahead.';
      end if;
    end if;
    new.auto_accept := coalesce(new.auto_accept, new.mode = 'live');
  end if;

  -- Ready window: from when you're ready → until your wait runs out
  if new.checked_in_at is not null then
    new.stage      := 'out';
    new.ready_from := new.checked_in_at;
  elsif new.terminal_id is not null then
    v_exit := case when new.checked_bags then s.exit_minutes_checked else s.exit_minutes_cabin end
            + case when new.is_international then s.exit_minutes_international_extra else 0 end;
    new.ready_from := new.landing_at + make_interval(mins => v_exit);
  else
    new.ready_from := new.depart_at;
  end if;
  new.ready_until := new.ready_from + make_interval(mins => new.wait_minutes);

  if tg_op = 'INSERT' then
    if new.ready_until <= now() then
      raise exception 'That time has already passed. If you are leaving now, use "I''m leaving now".';
    end if;
    if exists (select 1 from public.trips t
               where t.user_id = new.user_id and t.status in ('open', 'matched')
                 and t.ready_from < new.ready_until and new.ready_from < t.ready_until) then
      raise exception 'You already have a trip around this time.';
    end if;
  end if;

  return new;
end; $$;


-- ---------------------------------------------------------------------
-- 3. Estimates with a walk to the meeting point
-- ---------------------------------------------------------------------
-- Return type changes, so drop and recreate (it is called only from other functions)
drop function public.pair_estimate(public.trips, public.trips);

-- Money and time estimates for a possible pair (SCAB_SPEC.md §4.3).
-- Meeting point = pickup of whoever posted first; the other rider walks there.
-- Airport pairs share a terminal, so nobody walks and this matches the old estimate.
-- extra_minutes = the larger of the two riders' extra time (walk and/or detour).
create function public.pair_estimate(p_a public.trips, p_b public.trips)
returns table (solo_a numeric, solo_b numeric, shared_fare numeric,
               saving_percent numeric, min_saving numeric, extra_minutes numeric,
               walker_trip_id uuid, walk_m numeric)
language sql stable security definer set search_path = '' as $$
  with s as (
    select r.fare_base, r.fare_per_km, ms.road_factor, ms.city_speed_kmph, ms.stop_minutes, ms.walk_speed_kmph
    from public.matching_settings ms
    join public.regions r on r.id = p_a.region_id
    where ms.id = 1
  ),
  w as (
    select case when a_first then p_a.pickup_location else p_b.pickup_location end as meet,
           case when a_first then p_b.id else p_a.id end                           as walker,
           extensions.st_distance(p_a.pickup_location, p_b.pickup_location)::numeric as walk_m
    from (select (p_a.created_at, p_a.id) <= (p_b.created_at, p_b.id) as a_first) o
  ),
  g as (   -- straight-line km
    select w.*,
           (extensions.st_distance(p_a.pickup_location, p_a.drop_location) / 1000)::numeric as sa,  -- solo
           (extensions.st_distance(p_b.pickup_location, p_b.drop_location) / 1000)::numeric as sb,
           (extensions.st_distance(w.meet, p_a.drop_location) / 1000)::numeric             as ma,  -- shared, from meeting point
           (extensions.st_distance(w.meet, p_b.drop_location) / 1000)::numeric             as mb,
           (extensions.st_distance(p_a.drop_location, p_b.drop_location) / 1000)::numeric  as sab
    from w
  ),
  r as (   -- road km
    select s.*, g.*,
           coalesce(p_a.distance_km, g.sa * s.road_factor) as ra,
           coalesce(p_b.distance_km, g.sb * s.road_factor) as rb,
           -- from the meeting point: the walker's own road distance no longer applies
           case when g.walk_m >= 50 and g.walker = p_a.id then g.ma * s.road_factor
                else coalesce(p_a.distance_km, g.sa * s.road_factor) end as rma,
           case when g.walk_m >= 50 and g.walker = p_b.id then g.mb * s.road_factor
                else coalesce(p_b.distance_km, g.sb * s.road_factor) end as rmb,
           -- detour = (meet→nearer drop) + (nearer drop→farther drop) − (meet→farther drop)
           greatest(0, least(g.ma, g.mb) + g.sab - greatest(g.ma, g.mb)) * s.road_factor as detour_km
    from s, g
  ),
  f as (
    select r.*,
           r.fare_base + r.fare_per_km * r.ra as fa,
           r.fare_base + r.fare_per_km * r.rb as fb,
           r.fare_base + r.fare_per_km * (greatest(r.rma, r.rmb) + r.detour_km) as fs,
           r.detour_km / r.city_speed_kmph * 60 + r.stop_minutes as detour_min,
           case when r.walk_m >= 50 then r.walk_m / 1000 / r.walk_speed_kmph * 60 else 0 end as walk_min
    from r
  )
  select round(fa), round(fb), round(fs),
         round(100 * (1 - fs / (fa + fb)), 1),
         round(least(fa, fb) * (1 - fs / (fa + fb))),
         round(greatest(
           case when ma >= mb then detour_min else 0 end + case when walker = p_a.id then walk_min else 0 end,
           case when mb >  ma then detour_min else 0 end + case when walker = p_b.id then walk_min else 0 end
         ), 1),
         case when walk_m >= 50 then walker end,
         case when walk_m >= 50 then round(walk_m) else 0 end
  from f;
$$;

revoke execute on function public.pair_estimate(public.trips, public.trips) from public, anon, authenticated;


-- ---------------------------------------------------------------------
-- 4. Matching: "same pickup" = same terminal, or address pickups close together
-- ---------------------------------------------------------------------

-- Can these two trips share a pickup?
create or replace function public.pickups_compatible(p_a public.trips, p_b public.trips)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_a.region_id = p_b.region_id
     and case
           when p_a.terminal_id is not null or p_b.terminal_id is not null
             then p_a.terminal_id is not distinct from p_b.terminal_id
           else extensions.st_dwithin(p_a.pickup_location, p_b.pickup_location,
                                      (select max_pickup_walk_m from public.matching_settings where id = 1))
         end;
$$;

revoke execute on function public.pickups_compatible(public.trips, public.trips) from public, anon, authenticated;

-- Create a match between two open trips (the rider going farther books)
create or replace function public.create_match(p_trip_a uuid, p_trip_b uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  s       public.matching_settings;
  a       public.trips;
  b       public.trips;
  e       record;
  v_match uuid;
begin
  select * into s from public.matching_settings where id = 1;
  select * into a from public.trips where id = p_trip_a and status = 'open' for update;
  select * into b from public.trips where id = p_trip_b and status = 'open' for update;
  if a.id is null or b.id is null then raise exception 'Both trips must be open.'; end if;
  if a.user_id = b.user_id then raise exception 'Cannot match a rider with themselves.'; end if;
  if not public.pickups_compatible(a, b) then raise exception 'Trips must share a pickup.'; end if;
  if (a.women_only or b.women_only) and exists (
       select 1 from public.profiles where id in (a.user_id, b.user_id)
       and coalesce(gender, '') <> 'female') then
    raise exception 'Women-only trip can only be matched with a female account.';
  end if;

  select * into e from public.pair_estimate(a, b);

  insert into public.matches (meeting_point, currency, estimated_fare, saving_percent, extra_minutes,
                              booker_id, accept_deadline, walker_id, walk_m)
  values (case when a.terminal_id is not null
               then (select meeting_point from public.terminals where id = a.terminal_id)
               -- address: the pickup of whoever doesn't walk
               else case when e.walker_trip_id = a.id then b.pickup_label else a.pickup_label end end,
          (select currency from public.regions where id = a.region_id),
          e.shared_fare, e.saving_percent, e.extra_minutes,
          case when a.distance_km >= b.distance_km then a.user_id else b.user_id end,
          least(now() + make_interval(mins => s.accept_minutes), a.ready_until, b.ready_until),
          case e.walker_trip_id when a.id then a.user_id when b.id then b.user_id end,
          e.walk_m)
  returning id into v_match;

  insert into public.match_members (match_id, trip_id, user_id, accepted, solo_estimate, estimated_share)
  values (v_match, a.id, a.user_id, case when a.auto_accept then true end, e.solo_a,
          round(e.shared_fare * e.solo_a / (e.solo_a + e.solo_b))),
         (v_match, b.id, b.user_id, case when b.auto_accept then true end, e.solo_b,
          round(e.shared_fare * e.solo_b / (e.solo_a + e.solo_b)));

  update public.trips set status = 'matched' where id in (a.id, b.id);

  -- Both auto-accept → confirmed straight away
  if coalesce(a.auto_accept, false) and coalesce(b.auto_accept, false) then
    update public.matches set status = 'confirmed' where id = v_match;
  end if;

  return v_match;
end; $$;

-- Find the best co-rider for one open trip (rules: SCAB_SPEC.md §4.1–4.2)
create or replace function public.try_match(p_trip_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  s        public.matching_settings;
  v_region public.regions;
  me       public.trips;
  v_best   uuid;
begin
  select * into s from public.matching_settings where id = 1;
  select * into me from public.trips where id = p_trip_id and status = 'open' and ready_until > now();
  if me.id is null then return null; end if;
  select * into v_region from public.regions where id = me.region_id;

  select c.id into v_best
  from public.trips c
  join public.profiles pc on pc.id = c.user_id
  join public.profiles pm on pm.id = me.user_id
  cross join lateral public.pair_estimate(me, c) e
  where c.status = 'open'
    and c.id <> me.id
    and c.user_id <> me.user_id
    and c.ready_until > now()
    and public.pickups_compatible(me, c)                                            -- rule 1
    and least(c.ready_until, me.ready_until) - greatest(c.ready_from, me.ready_from)
        >= make_interval(mins => s.min_overlap_minutes)                             -- rule 2
    and e.saving_percent >= s.min_saving_percent                                    -- rule 3
    and e.min_saving >= v_region.min_saving_amount                                  -- rule 3
    and e.extra_minutes <= s.max_extra_minutes                                      -- rule 4
    and (not (c.women_only or me.women_only)
         or (coalesce(pc.gender, '') = 'female' and coalesce(pm.gender, '') = 'female'))  -- rule 5
    and not public.pair_blocked(me.user_id, c.user_id)                              -- rule 6
  order by e.extra_minutes,
           least(c.ready_until, me.ready_until) - greatest(c.ready_from, me.ready_from) desc
  limit 1
  for update of c skip locked;

  if v_best is null then return null; end if;
  return public.create_match(me.id, v_best);
exception when others then
  -- e.g. the other trip was matched a split-second earlier: skip quietly
  raise warning 'try_match(%) skipped: %', p_trip_id, sqlerrm;
  return null;
end; $$;

-- Near-miss offer: someone compatible will be ready shortly after my wait ends.
-- Returns at most one row; shows no name or address of the other rider.
create or replace function public.near_miss(p_trip_id uuid)
returns table (extra_wait_minutes int, other_ready_at timestamptz, drop_gap_km numeric,
               my_estimated_share numeric, my_solo_estimate numeric, saving_percent numeric)
language plpgsql stable security definer set search_path = '' as $$
declare
  s        public.matching_settings;
  v_region public.regions;
  me       public.trips;
begin
  select * into s from public.matching_settings where id = 1;
  select * into me from public.trips
  where id = p_trip_id and user_id = (select auth.uid()) and status = 'open' and ready_until > now();
  if me.id is null then return; end if;
  select * into v_region from public.regions where id = me.region_id;

  return query
  select x.needed, x.c_ready_from, x.gap_km, x.share, x.solo, x.pct
  from (
    select ceil(extract(epoch from (c.ready_from + make_interval(mins => s.min_overlap_minutes)
                                    - me.ready_until)) / 60)::int                      as needed,
           c.ready_from                                                                as c_ready_from,
           round((extensions.st_distance(me.drop_location, c.drop_location) / 1000)::numeric, 1) as gap_km,
           round(e.shared_fare * e.solo_a / (e.solo_a + e.solo_b))                     as share,
           e.solo_a                                                                    as solo,
           e.saving_percent                                                            as pct,
           e.extra_minutes                                                             as extra
    from public.trips c
    join public.profiles pc on pc.id = c.user_id
    join public.profiles pm on pm.id = me.user_id
    cross join lateral public.pair_estimate(me, c) e
    where c.status = 'open'
      and c.user_id <> me.user_id
      and public.pickups_compatible(me, c)
      and c.ready_until > now()
      and c.ready_from >= me.ready_from
      and c.ready_from + make_interval(mins => s.min_overlap_minutes) > me.ready_until
      and e.saving_percent >= s.min_saving_percent
      and e.min_saving >= v_region.min_saving_amount
      and e.extra_minutes <= s.max_extra_minutes
      and (not (c.women_only or me.women_only)
           or (coalesce(pc.gender, '') = 'female' and coalesce(pm.gender, '') = 'female'))
      and not public.pair_blocked(me.user_id, c.user_id)
  ) x
  where x.needed between 1 and s.near_miss_max_minutes
    and me.wait_minutes + x.needed <= 60
  order by x.needed, x.extra
  limit 1;
end; $$;


-- ---------------------------------------------------------------------
-- 5. "Flight delayed?" only makes sense for airport pickups
-- ---------------------------------------------------------------------
create or replace function public.report_delay(p_trip_id uuid, p_new_landing_at timestamptz)
returns text language plpgsql security definer set search_path = '' as $$
declare t public.trips;
begin
  t := public.my_active_trip(p_trip_id);
  if t.terminal_id is null then
    raise exception 'Flight delays apply only to airport pickups.';
  end if;
  if p_new_landing_at is null or p_new_landing_at > now() + interval '1 day' then
    raise exception 'Please enter a valid landing time.';
  end if;
  if t.mode <> 'scheduled' or t.checked_in_at is not null
     or exists (select 1 from public.match_members mm join public.matches m on m.id = mm.match_id
                where mm.trip_id = t.id and m.status = 'booked') then
    raise exception 'You can change the landing time only before you are out of the airport.';
  end if;
  update public.trips set landing_at = p_new_landing_at where id = t.id;
  perform public.recheck_trip(t.id);
  return (select status from public.trips where id = t.id);
end; $$;
