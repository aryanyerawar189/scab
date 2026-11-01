-- =====================================================================
-- Delete a trip (rider-facing): removes it from the rider's list.
--
-- • It's a soft delete (trips.hidden_at). A hard delete would cascade to
--   match_members and wipe the history that rule 6 ("never re-pair two
--   people whose match was declined / cancelled / timed out") and the
--   co-rider's own match view rely on.
-- • Open trips are cancelled at the same time, so matching stops.
-- • Matched trips can't be deleted: the rider has a co-rider waiting on them
--   and must cancel the match first.
-- =====================================================================

alter table public.trips add column if not exists hidden_at timestamptz;
comment on column public.trips.hidden_at is 'Set when the rider deletes the trip; hidden from their list, kept for matching history';

create or replace function public.delete_trip(p_trip_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  t public.trips;
begin
  select * into t from public.trips
  where id = p_trip_id and user_id = (select auth.uid())
  for update;

  if t.id is null then
    raise exception 'We couldn''t find this trip.';
  end if;

  if t.status = 'matched' then
    raise exception 'You have a co-rider on this trip. Cancel the match before deleting it.';
  end if;

  update public.trips
  set hidden_at = coalesce(hidden_at, now()),
      status    = case when status = 'open' then 'cancelled' else status end
  where id = t.id;
end; $$;

revoke execute on function public.delete_trip(uuid) from public, anon, authenticated;
grant execute on function public.delete_trip(uuid) to authenticated;
