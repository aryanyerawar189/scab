-- Which airport is this point at? Used when a rider picks a pickup place.
-- Finds the nearest active terminal within 3 km and returns ALL terminals of
-- that airport (in display order), each with its distance from the point.
-- No rows = not at a known airport.
create or replace function public.airport_at(p_lat double precision, p_lng double precision)
returns table (airport_id uuid, iata text, airport_name text, city text,
               terminal_id uuid, terminal_code text, terminal_name text, distance_m int)
language sql stable set search_path = '' as $$
  with p as (
    select extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)::extensions.geography as g
  ),
  hit as (
    select t.airport_id
    from public.terminals t
    join public.airports ap on ap.id = t.airport_id and ap.active
    join public.regions r on r.id = ap.region_id and r.active
    cross join p
    where t.active and extensions.st_dwithin(t.location, p.g, 3000)
    order by extensions.st_distance(t.location, p.g)
    limit 1
  )
  select ap.id, ap.iata, ap.name, ap.city, t.id, t.code, t.name,
         round(extensions.st_distance(t.location, p.g))::int
  from hit
  join public.airports ap on ap.id = hit.airport_id
  join public.terminals t on t.airport_id = ap.id and t.active
  cross join p
  order by t.sort;
$$;

revoke execute on function public.airport_at(double precision, double precision) from public, anon, authenticated;
grant execute on function public.airport_at(double precision, double precision) to authenticated;
