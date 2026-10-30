


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE EXTENSION IF NOT EXISTS "pg_cron" WITH SCHEMA "pg_catalog";






COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "postgis" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE OR REPLACE FUNCTION "public"."cancel_match"("p_match_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare v_status text;
begin
  select status into v_status from public.matches where id = p_match_id for update;
  if not public.is_match_member(p_match_id) then raise exception 'Not your match.'; end if;
  if v_status not in ('proposed', 'confirmed', 'booked') then
    raise exception 'This match can no longer be cancelled.';
  end if;
  perform public.end_match(p_match_id, 'cancelled', (select auth.uid()));
end; $$;


ALTER FUNCTION "public"."cancel_match"("p_match_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."check_in"("p_trip_id" "uuid") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare t public.trips;
begin
  t := public.my_active_trip(p_trip_id);
  update public.trips set checked_in_at = coalesce(checked_in_at, now()) where id = t.id;
  perform public.recheck_trip(t.id);
  return (select status from public.trips where id = t.id);
end; $$;


ALTER FUNCTION "public"."check_in"("p_trip_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_match"("p_trip_a" "uuid", "p_trip_b" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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
  if (a.women_only or b.women_only) and exists (
       select 1 from public.profiles where id in (a.user_id, b.user_id)
       and coalesce(gender, '') <> 'female') then
    raise exception 'Women-only trip can only be matched with a female account.';
  end if;

  select * into e from public.pair_estimate(a, b);

  insert into public.matches (meeting_point, estimated_fare, saving_percent, extra_minutes,
                              booker_id, accept_deadline)
  values (case when a.terminal = 'T2' then s.meeting_point_t2 else s.meeting_point_t1 end,
          e.shared_fare, e.saving_percent, e.extra_minutes,
          case when a.distance_km >= b.distance_km then a.user_id else b.user_id end,
          least(now() + make_interval(mins => s.accept_minutes), a.ready_until, b.ready_until))
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


ALTER FUNCTION "public"."create_match"("p_trip_a" "uuid", "p_trip_b" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."end_match"("p_match_id" "uuid", "p_reason" "text", "p_by" "uuid" DEFAULT NULL::"uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_prev text;
  r      record;
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

  -- Everyone else: back to looking (or expired if their window is over)
  update public.trips
  set status = case when ready_until > now() then 'open' else 'expired' end
  where status = 'matched'
    and id in (select trip_id from public.match_members where match_id = p_match_id);

  for r in select t.id from public.trips t
           join public.match_members mm on mm.trip_id = t.id
           where mm.match_id = p_match_id and t.status = 'open'
           order by t.ready_from loop
    perform public.try_match(r.id);
  end loop;
end; $$;


ALTER FUNCTION "public"."end_match"("p_match_id" "uuid", "p_reason" "text", "p_by" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."extend_wait"("p_trip_id" "uuid", "p_extra_minutes" integer) RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare t public.trips;
begin
  t := public.my_active_trip(p_trip_id);
  if p_extra_minutes is null or p_extra_minutes < 1 or p_extra_minutes > 30 then
    raise exception 'You can add 1 to 30 minutes at a time.';
  end if;
  if t.wait_minutes + p_extra_minutes > 60 then
    raise exception 'You can wait at most 60 minutes in total.';
  end if;
  update public.trips set wait_minutes = wait_minutes + p_extra_minutes where id = t.id;
  perform public.recheck_trip(t.id);
  return (select status from public.trips where id = t.id);
end; $$;


ALTER FUNCTION "public"."extend_wait"("p_trip_id" "uuid", "p_extra_minutes" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."find_another_rider"("p_match_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare v_status text;
begin
  select status into v_status from public.matches where id = p_match_id for update;
  if not public.is_match_member(p_match_id) then raise exception 'Not your match.'; end if;
  if v_status not in ('proposed', 'confirmed') then
    raise exception 'The cab is already booked. Use Cancel instead.';
  end if;
  perform public.end_match(p_match_id, 'declined', (select auth.uid()));
end; $$;


ALTER FUNCTION "public"."find_another_rider"("p_match_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  insert into public.profiles (id, full_name, avatar_url)
  values (new.id, new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'avatar_url')
  on conflict (id) do nothing;
  insert into public.profile_private (id) values (new.id) on conflict (id) do nothing;
  return new;
end; $$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_confirmed_corider"("p_user_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select exists (select 1 from public.match_members mine
                 join public.match_members theirs on theirs.match_id = mine.match_id
                 join public.matches m on m.id = mine.match_id
                 where mine.user_id = (select auth.uid()) and theirs.user_id = p_user_id
                   and m.status in ('confirmed', 'booked', 'completed'));
$$;


ALTER FUNCTION "public"."is_confirmed_corider"("p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_match_member"("p_match_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select exists (select 1 from public.match_members
                 where match_id = p_match_id and user_id = (select auth.uid()));
$$;


ALTER FUNCTION "public"."is_match_member"("p_match_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_trip_in_my_match"("p_trip_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select exists (select 1 from public.match_members mine
                 join public.match_members theirs on theirs.match_id = mine.match_id
                 join public.matches m on m.id = mine.match_id
                 where mine.user_id = (select auth.uid()) and theirs.trip_id = p_trip_id
                   and m.status <> 'cancelled');
$$;


ALTER FUNCTION "public"."is_trip_in_my_match"("p_trip_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."lock_gender"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
begin
  if old.gender is not null and new.gender is distinct from old.gender then
    raise exception 'Gender cannot be changed once set.';
  end if;
  return new;
end; $$;


ALTER FUNCTION "public"."lock_gender"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."mark_booked"("p_match_id" "uuid", "p_fare" numeric) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  if p_fare is null or p_fare <= 0 then raise exception 'Enter the fare shown in Uber.'; end if;
  update public.matches
  set status = 'booked', booked_at = now(), fare = p_fare, fare_status = 'pending',
      swap_requested_by = null
  where id = p_match_id and booker_id = (select auth.uid())
    and status = 'confirmed' and booked_at is null;
  if not found then
    raise exception 'Only the assigned booker can mark this cab as booked, and only once.';
  end if;
  perform public.recalculate_shares(p_match_id);
end; $$;


ALTER FUNCTION "public"."mark_booked"("p_match_id" "uuid", "p_fare" numeric) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."mark_landed"("p_trip_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  update public.trips set stage = 'landed'
  where id = p_trip_id and user_id = (select auth.uid())
    and stage = 'scheduled' and status in ('open', 'matched');
end; $$;


ALTER FUNCTION "public"."mark_landed"("p_trip_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."mark_paid"("p_match_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  update public.match_members mm
  set paid_at = now(), payment_disputed = false
  from public.matches m
  where mm.match_id = p_match_id and mm.user_id = (select auth.uid())
    and m.id = mm.match_id and m.status = 'booked' and m.fare_status = 'confirmed'
    and m.booker_id <> (select auth.uid());
  if not found then raise exception 'Payment can be marked only by the co-rider, after the fare is confirmed.'; end if;

  -- Everyone except the booker has paid → trip complete
  if not exists (select 1 from public.match_members mm join public.matches m on m.id = mm.match_id
                 where mm.match_id = p_match_id and mm.user_id <> m.booker_id and mm.paid_at is null) then
    update public.matches set status = 'completed' where id = p_match_id;
    update public.trips set status = 'completed'
      where id in (select trip_id from public.match_members where match_id = p_match_id);
  end if;
end; $$;


ALTER FUNCTION "public"."mark_paid"("p_match_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."match_new_trip"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  perform public.try_match(new.id);
  return null;
end; $$;


ALTER FUNCTION "public"."match_new_trip"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."trips" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "pickup_label" "text" DEFAULT 'Kempegowda International Airport'::"text" NOT NULL,
    "pickup_location" "extensions"."geography"(Point,4326) DEFAULT "extensions"."st_geogfromtext"('SRID=4326;POINT(77.7068 13.1989)'::"text") NOT NULL,
    "drop_label" "text" NOT NULL,
    "drop_location" "extensions"."geography"(Point,4326) NOT NULL,
    "distance_km" numeric(6,2),
    "women_only" boolean DEFAULT false NOT NULL,
    "status" "text" DEFAULT 'open'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "mode" "text" DEFAULT 'scheduled'::"text" NOT NULL,
    "terminal" "text" DEFAULT 'T1'::"text" NOT NULL,
    "drop_lat" double precision,
    "drop_lng" double precision,
    "landing_at" timestamp with time zone,
    "checked_bags" boolean DEFAULT false NOT NULL,
    "is_international" boolean DEFAULT false NOT NULL,
    "wait_minutes" integer DEFAULT 20 NOT NULL,
    "auto_accept" boolean,
    "ready_from" timestamp with time zone,
    "ready_until" timestamp with time zone,
    "stage" "text" DEFAULT 'scheduled'::"text" NOT NULL,
    "checked_in_at" timestamp with time zone,
    CONSTRAINT "trips_mode_check" CHECK (("mode" = ANY (ARRAY['live'::"text", 'scheduled'::"text"]))),
    CONSTRAINT "trips_stage_check" CHECK (("stage" = ANY (ARRAY['scheduled'::"text", 'landed'::"text", 'out'::"text"]))),
    CONSTRAINT "trips_status_check" CHECK (("status" = ANY (ARRAY['open'::"text", 'matched'::"text", 'completed'::"text", 'cancelled'::"text", 'expired'::"text"]))),
    CONSTRAINT "trips_terminal_check" CHECK (("terminal" = ANY (ARRAY['T1'::"text", 'T2'::"text"]))),
    CONSTRAINT "trips_wait_minutes_check" CHECK ((("wait_minutes" >= 5) AND ("wait_minutes" <= 60)))
);


ALTER TABLE "public"."trips" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."my_active_trip"("p_trip_id" "uuid") RETURNS "public"."trips"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare t public.trips;
begin
  select * into t from public.trips where id = p_trip_id and user_id = (select auth.uid()) for update;
  if t.id is null then raise exception 'Trip not found.'; end if;
  if t.status not in ('open', 'matched') then raise exception 'This trip is not active any more.'; end if;
  return t;
end; $$;


ALTER FUNCTION "public"."my_active_trip"("p_trip_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."near_miss"("p_trip_id" "uuid") RETURNS TABLE("extra_wait_minutes" integer, "other_ready_at" timestamp with time zone, "drop_gap_km" numeric, "my_estimated_share" numeric, "my_solo_estimate" numeric, "saving_percent" numeric)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  s  public.matching_settings;
  me public.trips;
begin
  select * into s from public.matching_settings where id = 1;
  select * into me from public.trips
  where id = p_trip_id and user_id = (select auth.uid()) and status = 'open' and ready_until > now();
  if me.id is null then return; end if;

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
      and c.terminal = me.terminal
      and c.ready_until > now()
      and c.ready_from >= me.ready_from
      and c.ready_from + make_interval(mins => s.min_overlap_minutes) > me.ready_until
      and e.saving_percent >= s.min_saving_percent
      and e.min_saving >= s.min_saving_rupees
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


ALTER FUNCTION "public"."near_miss"("p_trip_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pair_blocked"("p_user_1" "uuid", "p_user_2" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select exists (select 1 from public.matches m
                 join public.match_members a on a.match_id = m.id and a.user_id = p_user_1
                 join public.match_members b on b.match_id = m.id and b.user_id = p_user_2
                 where m.status = 'cancelled' and m.cancel_reason in ('declined', 'cancelled', 'timeout'));
$$;


ALTER FUNCTION "public"."pair_blocked"("p_user_1" "uuid", "p_user_2" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pair_estimate"("p_a" "public"."trips", "p_b" "public"."trips") RETURNS TABLE("solo_a" numeric, "solo_b" numeric, "shared_fare" numeric, "saving_percent" numeric, "min_saving" numeric, "extra_minutes" numeric)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  with s as (
    select fare_base, fare_per_km, road_factor, city_speed_kmph, stop_minutes
    from public.matching_settings where id = 1
  ),
  g as (   -- straight-line km
    select (extensions.st_distance(p_a.pickup_location, p_a.drop_location) / 1000)::numeric as sa,
           (extensions.st_distance(p_b.pickup_location, p_b.drop_location) / 1000)::numeric as sb,
           (extensions.st_distance(p_a.drop_location,   p_b.drop_location)   / 1000)::numeric as sab
  ),
  r as (   -- road km
    select s.*,
           coalesce(p_a.distance_km, g.sa * s.road_factor) as ra,
           coalesce(p_b.distance_km, g.sb * s.road_factor) as rb,
           -- detour = (airport→nearer drop) + (nearer drop→farther drop) − (airport→farther drop)
           greatest(0, least(g.sa, g.sb) + g.sab - greatest(g.sa, g.sb)) * s.road_factor as detour_km
    from s, g
  ),
  f as (
    select r.*,
           r.fare_base + r.fare_per_km * r.ra as fa,
           r.fare_base + r.fare_per_km * r.rb as fb,
           r.fare_base + r.fare_per_km * (greatest(r.ra, r.rb) + r.detour_km) as fs
    from r
  )
  select round(fa), round(fb), round(fs),
         round(100 * (1 - fs / (fa + fb)), 1),
         round(least(fa, fb) * (1 - fs / (fa + fb))),
         round(detour_km / city_speed_kmph * 60 + stop_minutes, 1)
  from f;
$$;


ALTER FUNCTION "public"."pair_estimate"("p_a" "public"."trips", "p_b" "public"."trips") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."prepare_trip"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  s          public.matching_settings;
  v_straight numeric;
  v_exit     int;
begin
  select * into s from public.matching_settings where id = 1;

  -- Pickup is always the airport (MVP)
  new.pickup_label    := 'Kempegowda International Airport';
  new.pickup_location := extensions.st_geogfromtext('SRID=4326;POINT(77.7068 13.1989)');

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
      new.checked_in_at := now();          -- live = already out
      new.landing_at    := null;
    else
      new.checked_in_at := null;
      if new.landing_at is null then
        raise exception 'Please enter your landing time.';
      end if;
      if new.landing_at > now() + interval '30 days' then
        raise exception 'You can schedule up to 30 days ahead.';
      end if;
    end if;
    new.auto_accept := coalesce(new.auto_accept, new.mode = 'live');
  end if;

  -- Ready window: when you're out → until your wait runs out
  if new.checked_in_at is not null then
    new.stage      := 'out';
    new.ready_from := new.checked_in_at;
  else
    v_exit := case when new.checked_bags then s.exit_minutes_checked else s.exit_minutes_cabin end
            + case when new.is_international then s.exit_minutes_international_extra else 0 end;
    new.ready_from := new.landing_at + make_interval(mins => v_exit);
  end if;
  new.ready_until := new.ready_from + make_interval(mins => new.wait_minutes);

  if tg_op = 'INSERT' then
    if new.ready_until <= now() then
      raise exception 'That time has already passed. If you are at the airport now, use "I''m at the airport now".';
    end if;
    if exists (select 1 from public.trips t
               where t.user_id = new.user_id and t.status in ('open', 'matched')
                 and t.ready_from < new.ready_until and new.ready_from < t.ready_until) then
      raise exception 'You already have a trip around this time.';
    end if;
  end if;

  return new;
end; $$;


ALTER FUNCTION "public"."prepare_trip"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."recalculate_shares"("p_match_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_fare   numeric;
  v_booker uuid;
  v_total  numeric;
begin
  select fare, booker_id into v_fare, v_booker from public.matches where id = p_match_id;
  select sum(coalesce(mm.solo_estimate, t.distance_km)) into v_total
  from public.match_members mm join public.trips t on t.id = mm.trip_id
  where mm.match_id = p_match_id;

  update public.match_members mm
  set share_amount = round(v_fare * coalesce(mm.solo_estimate, t.distance_km) / v_total, 2)
  from public.trips t
  where t.id = mm.trip_id and mm.match_id = p_match_id and mm.user_id <> v_booker;

  update public.match_members
  set share_amount = v_fare - coalesce((select sum(share_amount) from public.match_members
                                        where match_id = p_match_id and user_id <> v_booker), 0)
  where match_id = p_match_id and user_id = v_booker;
end; $$;


ALTER FUNCTION "public"."recalculate_shares"("p_match_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."recheck_trip"("p_trip_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  s     public.matching_settings;
  t     public.trips;
  o     public.trips;
  v_mid uuid;
begin
  select * into s from public.matching_settings where id = 1;
  select * into t from public.trips where id = p_trip_id;

  if t.status = 'open' then
    perform public.try_match(t.id);
  elsif t.status = 'matched' then
    -- Only a PROPOSED match ends automatically; a confirmed one is left to the riders
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


ALTER FUNCTION "public"."recheck_trip"("p_trip_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."report_delay"("p_trip_id" "uuid", "p_new_landing_at" timestamp with time zone) RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare t public.trips;
begin
  t := public.my_active_trip(p_trip_id);
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


ALTER FUNCTION "public"."report_delay"("p_trip_id" "uuid", "p_new_landing_at" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."report_not_received"("p_match_id" "uuid", "p_rider_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  if not exists (select 1 from public.matches where id = p_match_id and booker_id = (select auth.uid())
                 and status in ('booked', 'completed')) then
    raise exception 'Only the booker can report a missing payment.';
  end if;
  update public.match_members set paid_at = null, payment_disputed = true
    where match_id = p_match_id and user_id = p_rider_id;
  update public.matches set status = 'booked' where id = p_match_id;
  update public.trips set status = 'matched'
    where id in (select trip_id from public.match_members where match_id = p_match_id);
end; $$;


ALTER FUNCTION "public"."report_not_received"("p_match_id" "uuid", "p_rider_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."request_booker_swap"("p_match_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  update public.matches set swap_requested_by = (select auth.uid())
  where id = p_match_id and status = 'confirmed' and booked_at is null
    and booker_id <> (select auth.uid()) and public.is_match_member(p_match_id);
  if not found then raise exception 'Swap not possible (already booked, or you are already the booker).'; end if;
end; $$;


ALTER FUNCTION "public"."request_booker_swap"("p_match_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."respond_booker_swap"("p_match_id" "uuid", "p_allow" boolean) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  update public.matches
  set booker_id = case when p_allow then swap_requested_by else booker_id end,
      swap_requested_by = null
  where id = p_match_id and status = 'confirmed' and booked_at is null
    and booker_id = (select auth.uid()) and swap_requested_by is not null;
  if not found then raise exception 'No swap request to answer.'; end if;
end; $$;


ALTER FUNCTION "public"."respond_booker_swap"("p_match_id" "uuid", "p_allow" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."respond_to_fare"("p_match_id" "uuid", "p_ok" boolean) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  update public.matches
  set fare_status = case when p_ok then 'confirmed' else 'disputed' end
  where id = p_match_id and status = 'booked' and fare_status = 'pending'
    and booker_id <> (select auth.uid()) and public.is_match_member(p_match_id);
  if not found then raise exception 'Nothing to confirm (only the co-rider confirms the fare).'; end if;
end; $$;


ALTER FUNCTION "public"."respond_to_fare"("p_match_id" "uuid", "p_ok" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."respond_to_match"("p_match_id" "uuid", "p_accept" boolean) RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare v_match public.matches;
begin
  select * into v_match from public.matches where id = p_match_id for update;
  if not public.is_match_member(p_match_id) then raise exception 'Not your match.'; end if;
  if v_match.status <> 'proposed' then raise exception 'This match is no longer waiting for a reply.'; end if;

  if now() > v_match.accept_deadline then
    perform public.end_match(p_match_id, 'timeout', null);
    return 'expired';
  end if;

  if not p_accept then
    update public.match_members set accepted = false
    where match_id = p_match_id and user_id = (select auth.uid());
    perform public.end_match(p_match_id, 'declined', (select auth.uid()));
    return 'declined';
  end if;

  update public.match_members set accepted = true
  where match_id = p_match_id and user_id = (select auth.uid());
  if not exists (select 1 from public.match_members
                 where match_id = p_match_id and accepted is distinct from true) then
    update public.matches set status = 'confirmed' where id = p_match_id;
    return 'confirmed';
  end if;
  return 'waiting_for_other_rider';
end; $$;


ALTER FUNCTION "public"."respond_to_match"("p_match_id" "uuid", "p_accept" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rider_stats"("p_user_id" "uuid") RETURNS TABLE("thumbs_up" integer, "total_ratings" integer, "late_cancellations" integer)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select
    (select count(*)::int from public.ratings where ratee_id = p_user_id and thumbs_up),
    (select count(*)::int from public.ratings where ratee_id = p_user_id),
    (select count(*)::int from public.matches where cancelled_by = p_user_id and cancelled_after_booking);
$$;


ALTER FUNCTION "public"."rider_stats"("p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."scab_housekeeping"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare r record;
begin
  -- a) Proposed matches nobody fully accepted in time
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

  -- c) Open trips whose window has ended → expired (app shows "Book solo")
  update public.trips set status = 'expired' where status = 'open' and ready_until <= now();

  -- d) Retry matching for everyone still looking
  for r in select id from public.trips where status = 'open' order by ready_from loop
    perform public.try_match(r.id);
  end loop;
end; $$;


ALTER FUNCTION "public"."scab_housekeeping"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."try_match"("p_trip_id" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  s      public.matching_settings;
  me     public.trips;
  v_best uuid;
begin
  select * into s from public.matching_settings where id = 1;
  select * into me from public.trips where id = p_trip_id and status = 'open' and ready_until > now();
  if me.id is null then return null; end if;

  select c.id into v_best
  from public.trips c
  join public.profiles pc on pc.id = c.user_id
  join public.profiles pm on pm.id = me.user_id
  cross join lateral public.pair_estimate(me, c) e
  where c.status = 'open'
    and c.id <> me.id
    and c.user_id <> me.user_id
    and c.ready_until > now()
    and c.terminal = me.terminal                                                    -- rule 1
    and least(c.ready_until, me.ready_until) - greatest(c.ready_from, me.ready_from)
        >= make_interval(mins => s.min_overlap_minutes)                             -- rule 2
    and e.saving_percent >= s.min_saving_percent                                    -- rule 3
    and e.min_saving >= s.min_saving_rupees                                         -- rule 3
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


ALTER FUNCTION "public"."try_match"("p_trip_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_fare"("p_match_id" "uuid", "p_fare" numeric, "p_receipt_url" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  if p_fare is null or p_fare <= 0 then raise exception 'Invalid fare.'; end if;
  update public.matches
  set fare = p_fare, fare_status = 'pending', receipt_url = coalesce(p_receipt_url, receipt_url)
  where id = p_match_id and booker_id = (select auth.uid()) and status = 'booked';
  if not found then raise exception 'Only the booker can change the fare of a booked cab.'; end if;
  update public.match_members set paid_at = null where match_id = p_match_id;
  perform public.recalculate_shares(p_match_id);
end; $$;


ALTER FUNCTION "public"."update_fare"("p_match_id" "uuid", "p_fare" numeric, "p_receipt_url" "text") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."match_members" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "match_id" "uuid" NOT NULL,
    "trip_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "accepted" boolean,
    "share_amount" numeric(10,2),
    "paid_at" timestamp with time zone,
    "payment_disputed" boolean DEFAULT false NOT NULL,
    "solo_estimate" numeric(10,2),
    "estimated_share" numeric(10,2)
);


ALTER TABLE "public"."match_members" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."matches" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "status" "text" DEFAULT 'proposed'::"text" NOT NULL,
    "accept_deadline" timestamp with time zone DEFAULT ("now"() + '02:00:00'::interval) NOT NULL,
    "meeting_point" "text",
    "estimated_fare" numeric(10,2),
    "booker_id" "uuid",
    "swap_requested_by" "uuid",
    "booked_at" timestamp with time zone,
    "fare" numeric(10,2),
    "fare_status" "text",
    "receipt_url" "text",
    "cancelled_by" "uuid",
    "cancelled_after_booking" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "saving_percent" numeric(5,1),
    "extra_minutes" numeric(5,1),
    "cancel_reason" "text",
    CONSTRAINT "matches_cancel_reason_check" CHECK (("cancel_reason" = ANY (ARRAY['declined'::"text", 'timeout'::"text", 'cancelled'::"text", 'window_changed'::"text", 'expired'::"text"]))),
    CONSTRAINT "matches_fare_status_check" CHECK (("fare_status" = ANY (ARRAY['pending'::"text", 'confirmed'::"text", 'disputed'::"text"]))),
    CONSTRAINT "matches_status_check" CHECK (("status" = ANY (ARRAY['proposed'::"text", 'confirmed'::"text", 'booked'::"text", 'completed'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."matches" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."matching_settings" (
    "id" integer DEFAULT 1 NOT NULL,
    "min_overlap_minutes" integer DEFAULT 5 NOT NULL,
    "max_extra_minutes" integer DEFAULT 15 NOT NULL,
    "min_saving_percent" integer DEFAULT 30 NOT NULL,
    "min_saving_rupees" integer DEFAULT 200 NOT NULL,
    "fare_base" numeric DEFAULT 150 NOT NULL,
    "fare_per_km" numeric DEFAULT 24 NOT NULL,
    "road_factor" numeric DEFAULT 1.3 NOT NULL,
    "city_speed_kmph" numeric DEFAULT 20 NOT NULL,
    "stop_minutes" numeric DEFAULT 3 NOT NULL,
    "exit_minutes_cabin" integer DEFAULT 15 NOT NULL,
    "exit_minutes_checked" integer DEFAULT 35 NOT NULL,
    "exit_minutes_international_extra" integer DEFAULT 30 NOT NULL,
    "accept_minutes" integer DEFAULT 120 NOT NULL,
    "near_miss_max_minutes" integer DEFAULT 20 NOT NULL,
    "meeting_point_t1" "text" DEFAULT 'Terminal 1 Arrivals – app cab pickup area'::"text" NOT NULL,
    "meeting_point_t2" "text" DEFAULT 'Terminal 2 Arrivals – app cab pickup area'::"text" NOT NULL,
    CONSTRAINT "matching_settings_id_check" CHECK (("id" = 1))
);


ALTER TABLE "public"."matching_settings" OWNER TO "postgres";


COMMENT ON COLUMN "public"."matching_settings"."min_overlap_minutes" IS 'Ready windows must overlap by at least this many minutes';



COMMENT ON COLUMN "public"."matching_settings"."max_extra_minutes" IS 'Max extra minutes the farther rider loses to the stop';



COMMENT ON COLUMN "public"."matching_settings"."min_saving_percent" IS 'Each rider must save at least this % vs riding alone';



COMMENT ON COLUMN "public"."matching_settings"."min_saving_rupees" IS 'Each rider must save at least this many ₹';



COMMENT ON COLUMN "public"."matching_settings"."road_factor" IS 'Road km ≈ straight-line km × this';



COMMENT ON COLUMN "public"."matching_settings"."accept_minutes" IS 'Time to accept a proposed match (capped by the ready window)';



COMMENT ON COLUMN "public"."matching_settings"."near_miss_max_minutes" IS 'Offer "wait X more minutes" only up to this many minutes';



CREATE TABLE IF NOT EXISTS "public"."messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "match_id" "uuid" NOT NULL,
    "sender_id" "uuid" NOT NULL,
    "body" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "messages_body_check" CHECK ((("length"("body") >= 1) AND ("length"("body") <= 1000)))
);


ALTER TABLE "public"."messages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profile_private" (
    "id" "uuid" NOT NULL,
    "phone" "text",
    "upi_id" "text"
);


ALTER TABLE "public"."profile_private" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "full_name" "text",
    "avatar_url" "text",
    "gender" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "profiles_gender_check" CHECK (("gender" = ANY (ARRAY['female'::"text", 'male'::"text", 'other'::"text"])))
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ratings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "match_id" "uuid" NOT NULL,
    "rater_id" "uuid" NOT NULL,
    "ratee_id" "uuid" NOT NULL,
    "thumbs_up" boolean NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "ratings_check" CHECK (("rater_id" <> "ratee_id"))
);


ALTER TABLE "public"."ratings" OWNER TO "postgres";


ALTER TABLE ONLY "public"."match_members"
    ADD CONSTRAINT "match_members_match_id_trip_id_key" UNIQUE ("match_id", "trip_id");



ALTER TABLE ONLY "public"."match_members"
    ADD CONSTRAINT "match_members_match_id_user_id_key" UNIQUE ("match_id", "user_id");



ALTER TABLE ONLY "public"."match_members"
    ADD CONSTRAINT "match_members_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."matches"
    ADD CONSTRAINT "matches_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."matching_settings"
    ADD CONSTRAINT "matching_settings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profile_private"
    ADD CONSTRAINT "profile_private_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ratings"
    ADD CONSTRAINT "ratings_match_id_rater_id_ratee_id_key" UNIQUE ("match_id", "rater_id", "ratee_id");



ALTER TABLE ONLY "public"."ratings"
    ADD CONSTRAINT "ratings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."trips"
    ADD CONSTRAINT "trips_pkey" PRIMARY KEY ("id");



CREATE INDEX "match_members_trip_idx" ON "public"."match_members" USING "btree" ("trip_id");



CREATE INDEX "match_members_user_idx" ON "public"."match_members" USING "btree" ("user_id");



CREATE INDEX "messages_match_idx" ON "public"."messages" USING "btree" ("match_id", "created_at");



CREATE INDEX "trips_drop_idx" ON "public"."trips" USING "gist" ("drop_location");



CREATE INDEX "trips_pickup_idx" ON "public"."trips" USING "gist" ("pickup_location");



CREATE INDEX "trips_user_idx" ON "public"."trips" USING "btree" ("user_id", "status");



CREATE INDEX "trips_window_idx" ON "public"."trips" USING "btree" ("status", "terminal", "ready_from", "ready_until");



CREATE OR REPLACE TRIGGER "profiles_lock_gender" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."lock_gender"();



CREATE OR REPLACE TRIGGER "trips_match_on_insert" AFTER INSERT ON "public"."trips" FOR EACH ROW EXECUTE FUNCTION "public"."match_new_trip"();



CREATE OR REPLACE TRIGGER "trips_prepare" BEFORE INSERT OR UPDATE ON "public"."trips" FOR EACH ROW EXECUTE FUNCTION "public"."prepare_trip"();



ALTER TABLE ONLY "public"."match_members"
    ADD CONSTRAINT "match_members_match_id_fkey" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."match_members"
    ADD CONSTRAINT "match_members_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."match_members"
    ADD CONSTRAINT "match_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."matches"
    ADD CONSTRAINT "matches_booker_id_fkey" FOREIGN KEY ("booker_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."matches"
    ADD CONSTRAINT "matches_cancelled_by_fkey" FOREIGN KEY ("cancelled_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."matches"
    ADD CONSTRAINT "matches_swap_requested_by_fkey" FOREIGN KEY ("swap_requested_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_match_id_fkey" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profile_private"
    ADD CONSTRAINT "profile_private_id_fkey" FOREIGN KEY ("id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ratings"
    ADD CONSTRAINT "ratings_match_id_fkey" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ratings"
    ADD CONSTRAINT "ratings_ratee_id_fkey" FOREIGN KEY ("ratee_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ratings"
    ADD CONSTRAINT "ratings_rater_id_fkey" FOREIGN KEY ("rater_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."trips"
    ADD CONSTRAINT "trips_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE "public"."match_members" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."matches" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "matches: members read" ON "public"."matches" FOR SELECT TO "authenticated" USING ("public"."is_match_member"("id"));



ALTER TABLE "public"."matching_settings" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "members: members read" ON "public"."match_members" FOR SELECT TO "authenticated" USING ("public"."is_match_member"("match_id"));



ALTER TABLE "public"."messages" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "messages: members read" ON "public"."messages" FOR SELECT TO "authenticated" USING ("public"."is_match_member"("match_id"));



CREATE POLICY "messages: send in confirmed match" ON "public"."messages" FOR INSERT TO "authenticated" WITH CHECK ((("sender_id" = ( SELECT "auth"."uid"() AS "uid")) AND "public"."is_match_member"("match_id") AND (EXISTS ( SELECT 1
   FROM "public"."matches" "m"
  WHERE (("m"."id" = "messages"."match_id") AND ("m"."status" = ANY (ARRAY['confirmed'::"text", 'booked'::"text", 'completed'::"text"])))))));



CREATE POLICY "private: read own or co-rider" ON "public"."profile_private" FOR SELECT TO "authenticated" USING ((("id" = ( SELECT "auth"."uid"() AS "uid")) OR "public"."is_confirmed_corider"("id")));



CREATE POLICY "private: update own" ON "public"."profile_private" FOR UPDATE TO "authenticated" USING (("id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("id" = ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."profile_private" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "profiles: read" ON "public"."profiles" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "profiles: update own" ON "public"."profiles" FOR UPDATE TO "authenticated" USING (("id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("id" = ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."ratings" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "ratings: rate co-rider" ON "public"."ratings" FOR INSERT TO "authenticated" WITH CHECK ((("rater_id" = ( SELECT "auth"."uid"() AS "uid")) AND "public"."is_match_member"("match_id") AND (EXISTS ( SELECT 1
   FROM "public"."match_members" "mm"
  WHERE (("mm"."match_id" = "ratings"."match_id") AND ("mm"."user_id" = "ratings"."ratee_id"))))));



CREATE POLICY "ratings: read own" ON "public"."ratings" FOR SELECT TO "authenticated" USING ((("rater_id" = ( SELECT "auth"."uid"() AS "uid")) OR ("ratee_id" = ( SELECT "auth"."uid"() AS "uid"))));



ALTER TABLE "public"."trips" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "trips: cancel own open trip" ON "public"."trips" FOR UPDATE TO "authenticated" USING ((("user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("status" = 'open'::"text"))) WITH CHECK ((("user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("status" = 'cancelled'::"text")));



CREATE POLICY "trips: create own" ON "public"."trips" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "trips: read own or co-rider" ON "public"."trips" FOR SELECT TO "authenticated" USING ((("user_id" = ( SELECT "auth"."uid"() AS "uid")) OR "public"."is_trip_in_my_match"("id")));





ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";






ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."match_members";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."matches";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."messages";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."trips";









GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";




































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































REVOKE ALL ON FUNCTION "public"."cancel_match"("p_match_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."cancel_match"("p_match_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."cancel_match"("p_match_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."check_in"("p_trip_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."check_in"("p_trip_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_in"("p_trip_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_match"("p_trip_a" "uuid", "p_trip_b" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_match"("p_trip_a" "uuid", "p_trip_b" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."end_match"("p_match_id" "uuid", "p_reason" "text", "p_by" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."end_match"("p_match_id" "uuid", "p_reason" "text", "p_by" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."extend_wait"("p_trip_id" "uuid", "p_extra_minutes" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."extend_wait"("p_trip_id" "uuid", "p_extra_minutes" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."extend_wait"("p_trip_id" "uuid", "p_extra_minutes" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."find_another_rider"("p_match_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."find_another_rider"("p_match_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."find_another_rider"("p_match_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."handle_new_user"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."is_confirmed_corider"("p_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_confirmed_corider"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_confirmed_corider"("p_user_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."is_match_member"("p_match_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_match_member"("p_match_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_match_member"("p_match_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."is_trip_in_my_match"("p_trip_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_trip_in_my_match"("p_trip_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_trip_in_my_match"("p_trip_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."lock_gender"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."lock_gender"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."mark_booked"("p_match_id" "uuid", "p_fare" numeric) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."mark_booked"("p_match_id" "uuid", "p_fare" numeric) TO "authenticated";
GRANT ALL ON FUNCTION "public"."mark_booked"("p_match_id" "uuid", "p_fare" numeric) TO "service_role";



REVOKE ALL ON FUNCTION "public"."mark_landed"("p_trip_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."mark_landed"("p_trip_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."mark_landed"("p_trip_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."mark_paid"("p_match_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."mark_paid"("p_match_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."mark_paid"("p_match_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."match_new_trip"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."match_new_trip"() TO "service_role";



GRANT ALL ON TABLE "public"."trips" TO "anon";
GRANT ALL ON TABLE "public"."trips" TO "authenticated";
GRANT ALL ON TABLE "public"."trips" TO "service_role";



REVOKE ALL ON FUNCTION "public"."my_active_trip"("p_trip_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."my_active_trip"("p_trip_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."near_miss"("p_trip_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."near_miss"("p_trip_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."near_miss"("p_trip_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."pair_blocked"("p_user_1" "uuid", "p_user_2" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."pair_blocked"("p_user_1" "uuid", "p_user_2" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."pair_estimate"("p_a" "public"."trips", "p_b" "public"."trips") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."pair_estimate"("p_a" "public"."trips", "p_b" "public"."trips") TO "service_role";



REVOKE ALL ON FUNCTION "public"."prepare_trip"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."prepare_trip"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."recalculate_shares"("p_match_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."recalculate_shares"("p_match_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."recheck_trip"("p_trip_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."recheck_trip"("p_trip_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."report_delay"("p_trip_id" "uuid", "p_new_landing_at" timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."report_delay"("p_trip_id" "uuid", "p_new_landing_at" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."report_delay"("p_trip_id" "uuid", "p_new_landing_at" timestamp with time zone) TO "service_role";



REVOKE ALL ON FUNCTION "public"."report_not_received"("p_match_id" "uuid", "p_rider_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."report_not_received"("p_match_id" "uuid", "p_rider_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."report_not_received"("p_match_id" "uuid", "p_rider_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."request_booker_swap"("p_match_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."request_booker_swap"("p_match_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."request_booker_swap"("p_match_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."respond_booker_swap"("p_match_id" "uuid", "p_allow" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."respond_booker_swap"("p_match_id" "uuid", "p_allow" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."respond_booker_swap"("p_match_id" "uuid", "p_allow" boolean) TO "service_role";



REVOKE ALL ON FUNCTION "public"."respond_to_fare"("p_match_id" "uuid", "p_ok" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."respond_to_fare"("p_match_id" "uuid", "p_ok" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."respond_to_fare"("p_match_id" "uuid", "p_ok" boolean) TO "service_role";



REVOKE ALL ON FUNCTION "public"."respond_to_match"("p_match_id" "uuid", "p_accept" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."respond_to_match"("p_match_id" "uuid", "p_accept" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."respond_to_match"("p_match_id" "uuid", "p_accept" boolean) TO "service_role";



REVOKE ALL ON FUNCTION "public"."rider_stats"("p_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."rider_stats"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."rider_stats"("p_user_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."scab_housekeeping"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."scab_housekeeping"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."try_match"("p_trip_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."try_match"("p_trip_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."update_fare"("p_match_id" "uuid", "p_fare" numeric, "p_receipt_url" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."update_fare"("p_match_id" "uuid", "p_fare" numeric, "p_receipt_url" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_fare"("p_match_id" "uuid", "p_fare" numeric, "p_receipt_url" "text") TO "service_role";























































































GRANT ALL ON TABLE "public"."match_members" TO "anon";
GRANT ALL ON TABLE "public"."match_members" TO "authenticated";
GRANT ALL ON TABLE "public"."match_members" TO "service_role";



GRANT ALL ON TABLE "public"."matches" TO "anon";
GRANT ALL ON TABLE "public"."matches" TO "authenticated";
GRANT ALL ON TABLE "public"."matches" TO "service_role";



GRANT ALL ON TABLE "public"."matching_settings" TO "anon";
GRANT ALL ON TABLE "public"."matching_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."matching_settings" TO "service_role";



GRANT ALL ON TABLE "public"."messages" TO "anon";
GRANT ALL ON TABLE "public"."messages" TO "authenticated";
GRANT ALL ON TABLE "public"."messages" TO "service_role";



GRANT ALL ON TABLE "public"."profile_private" TO "anon";
GRANT ALL ON TABLE "public"."profile_private" TO "authenticated";
GRANT ALL ON TABLE "public"."profile_private" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."ratings" TO "anon";
GRANT ALL ON TABLE "public"."ratings" TO "authenticated";
GRANT ALL ON TABLE "public"."ratings" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";
































-- auth schema is excluded from pg_dump; trigger added manually
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- pg_dump --schema-only omits data and the cron schema; both added manually
-- from supabase/scab_schema.sql so a fresh database matches production.
insert into public.matching_settings (id) values (1) on conflict (id) do nothing;

select cron.unschedule('scab-housekeeping')
  where exists (select 1 from cron.job where jobname = 'scab-housekeeping');
select cron.schedule('scab-housekeeping', '* * * * *', 'select public.scab_housekeeping()');
